/**
 * Format-preserving edits to the site's MDX.
 *
 * Same philosophy as toml-edit: a document is segmented into blocks that each
 * remember their own source, and serializing emits that source verbatim for
 * every block the editor did not touch. Only a changed block is re-rendered,
 * so blank-line rhythm, `{/* PLACEHOLDER *\/}` markers and trailing spaces
 * survive an edit elsewhere in the file.
 *
 * `remark-breaks` is on for the site, so a single newline is a visible line
 * break and lives inside a paragraph's inline content as "\n". Nothing here
 * may normalise it away.
 *
 * Markdown gives `*text*` and `_text_` the same emphasis node but the site
 * spends them differently (§4.3), so the marker is read back off the source
 * exactly as scripts/remark-underscore-italic.mjs does.
 */
import { fromMarkdown } from "mdast-util-from-markdown";
import { mdxFromMarkdown } from "mdast-util-mdx";
import { mdxjs } from "micromark-extension-mdxjs";

export type Inline =
  | { type: "text"; value: string }
  | { type: "emphasis"; marker: "*" | "_"; children: Inline[] }
  | { type: "strong"; children: Inline[] }
  | { type: "opaque"; source: string };

export type Block =
  | { kind: "paragraph"; source: string; inline: Inline[] }
  | { kind: "heading"; depth: number; source: string; inline: Inline[] }
  | { kind: "list"; ordered: boolean; source: string; items: Inline[][] }
  | { kind: "opaque"; source: string };

export type Segment =
  | { type: "gap"; text: string }
  | { type: "block"; block: Block };

export interface MdxDoc {
  /** Raw frontmatter including both `---` fences and the newline after. */
  frontmatter: string;
  segments: Segment[];
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const parseBody = (body: string) =>
  fromMarkdown(body, {
    extensions: [mdxjs()],
    mdastExtensions: [mdxFromMarkdown()],
  });

/**
 * `contentEnd` is where the parent's inline content stops - the end of a
 * paragraph, or the byte before a closing `*`. Whitespace the parser assigns
 * to no child lives between the last child and there, and the owner's copy is
 * full of it: CommonMark strips whitespace from the end of a line, and with
 * remark-breaks on, every line end is a rendered break.
 */
function inlineFrom(nodes: any[], body: string, contentEnd: number): Inline[] {
  const out: Inline[] = [];
  const text = (from: number, to: number): Inline => ({
    type: "text",
    value: unescapeInlineText(body.slice(from, to)),
  });

  let cursor = nodes.length ? nodes[0].position.start.offset : contentEnd;
  for (const n of nodes) {
    const start = n.position.start.offset;
    const end = n.position.end.offset;
    if (start > cursor) out.push(text(cursor, start));
    cursor = end;
    switch (n.type) {
      case "text":
        out.push(text(start, end));
        break;
      case "emphasis":
        out.push({
          type: "emphasis",
          marker: body[start] === "_" ? "_" : "*",
          children: inlineFrom(n.children, body, end - 1),
        });
        break;
      case "strong":
        out.push({
          type: "strong",
          children: inlineFrom(n.children, body, end - 2),
        });
        break;
      default:
        out.push({ type: "opaque", source: body.slice(start, end) });
    }
  }
  if (contentEnd > cursor) out.push(text(cursor, contentEnd));
  return out;
}

/**
 * The inverse of `escapeInlineText`, applied on the way in.
 *
 * Text nodes carry the source slice rather than what the parser read, so that
 * the trailing spaces CommonMark drops from a line end survive - but the slice
 * still holds the escapes. Without undoing them here, escaping on the way out
 * runs over its own output and every save adds another backslash: `\#` becomes
 * `\\#` becomes `\\\\#`, and the owner's text grows a visible backslash each
 * time she presses save.
 */
/** CommonMark's escapable set - every ASCII punctuation mark, `\` included. */
const ESCAPED = /\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g;

export const unescapeInlineText = (value: string): string =>
  value.replace(ESCAPED, "$1");

/**
 * Neutralise punctuation the markdown and MDX grammars would claim.
 *
 * What the editor refuses to *render* is not protection: the owner types into
 * a surface that shows `# כותרת` as ordinary words, and if it reaches the file
 * unescaped the site builds it as a second `<h1>`. Everything the grammar can
 * read has to be escaped on the way out, or the editor is lying about what it
 * will publish.
 *
 * `*`, `_` and `~` are the exception, escaped only where they touch a
 * non-space: only there can they open or close a mark, and this copy uses a
 * lone asterisk on its own line as a divider. Escaping every one would rewrite
 * body text the moment an unrelated word changed.
 *
 * The site's markdown is GFM, so the vocabulary is wider than CommonMark's:
 * `~~` strikes text through and `|` builds a table, and `.prose` styles
 * neither. A bare `https://…` is the one construct that cannot be escaped at
 * all - GFM resolves character escapes before it looks for addresses, so
 * `https:\/\/` still autolinks. `escaping.test.ts` records the attempt.
 */
export function escapeInlineText(value: string): string {
  return (
    value
      .replace(/\\/g, "\\\\")
      .replace(/([*_~])(?=\S)|(?<=\S)([*_~])/g, (m) => `\\${m}`)
      // Links, images, code spans, autolinks and HTML - and `{`, which MDX
      // reads as the start of an expression rather than as a character.
      .replace(/[[\]`<{]/g, (m) => `\\${m}`)
      // Any pipe can become a table cell, and a table is not something the
      // editor offers or the site styles.
      .replace(/\|/g, "\\|")
      // Only an `&` that completes an entity turns into another character.
      .replace(/&(?=[a-zA-Z#][a-zA-Z0-9]*;)/g, "\\&")
  );
}

/**
 * Line starts the block grammar would claim.
 *
 * `remark-breaks` is on, so a paragraph is several lines and the block parser
 * looks at every one of them. A `#` the owner typed as punctuation has to be
 * neutralised wherever it lands, not only in the first line.
 *
 * Only what can interrupt a paragraph belongs here. A lone `-` is a setext
 * underline and turns the line above it into a heading, which is why a single
 * one counts; a lone `*` is only an empty list item, which cannot interrupt,
 * so it is `escapeBlockHead`'s business and not every line's.
 */
const BLOCK_START =
  /^([ \t]*)(#{1,6}(?=[ \t]|$)|>|[-+*](?=[ \t])|(\d{1,9})([.)])(?=[ \t])|={1,}[ \t]*$|-{1,}[ \t]*$|~{3,})/;

/**
 * A thematic break: three or more of `-`, `_` or `*` alone on a line, spaces
 * allowed between them - so `--- -` is one, and a rule counting a run of
 * identical characters never sees it. One backslash disqualifies the line.
 */
const THEMATIC_BREAK = /^([ \t]*)([-_*])(?:[ \t]*\2){2,}[ \t]*$/;

const escapeLineStart = (line: string): string =>
  THEMATIC_BREAK.test(line)
    ? line.replace(
        THEMATIC_BREAK,
        (m: string, indent: string) => `${indent}\\${m.slice(indent.length)}`,
      )
    : line.replace(
        BLOCK_START,
        // Only ASCII punctuation is escapable, so an ordered list is broken at its
        // delimiter: `1\.` is text, while `\1.` would ship a stray backslash.
        (
          _m,
          indent: string,
          token: string,
          digits: string | undefined,
          delimiter: string,
        ) =>
          digits ? `${indent}${digits}\\${delimiter}` : `${indent}\\${token}`,
      );

/**
 * A marker alone on a line - an empty list item, and only where a block opens.
 *
 * It cannot interrupt a paragraph, so mid-paragraph it is punctuation. At the
 * head of a block it opens a list, and everything after it becomes a second
 * block - except in a paragraph of nothing else, which `STARS_ONLY` owns.
 */
const EMPTY_MARKER = /^([ \t]*)([-+*]|(\d{1,9})([.)]))[ \t]*$/;

const escapeBlockHead = (line: string): string =>
  escapeLineStart(line).replace(
    EMPTY_MARKER,
    (
      _m,
      indent: string,
      token: string,
      digits: string | undefined,
      delimiter: string,
    ) => (digits ? `${indent}${digits}\\${delimiter}` : `${indent}\\${token}`),
  );

/**
 * The closing `#` run of an ATX heading, which is punctuation and not content:
 * `## ##` is an *empty* heading, not one that says `##`.
 */
const escapeHeadingEnd = (text: string): string =>
  text.replace(
    /(^|[ \t])(#+)([ \t]*)$/,
    (_m, before: string, hashes: string, after: string) =>
      `${before}\\${hashes}${after}`,
  );

/** Every line, since every line of a paragraph is a line the parser reads. */
const escapeBlockStarts = (text: string): string =>
  text.split("\n").map(escapeLineStart).join("\n");

/**
 * Whitespace markdown cannot carry, removed once rather than every save.
 *
 * A block's first line loses its indent whichever way it is written: up to
 * three spaces are stripped by the parser and a fourth makes it a code block,
 * and the space after a list marker is the marker's own padding. Leaving it in
 * means the file changes again the next time it is saved, for an edit nobody
 * made - so it goes on the way out, where it happens once.
 */
const dropUncarryableIndent = (line: string): string =>
  line.replace(/^[ \t]+/, "");

/**
 * A paragraph of lone asterisks, one to a line - the owner's section divider.
 *
 * Markdown reads it as a list of empty items and the site draws a bullet at
 * the start of each line, which is the mark she wants. So it travels as the
 * characters she typed: read back as a paragraph, written back bare. Escaped,
 * it would reach the page as a literal asterisk.
 *
 * Only unindented lines count: an indented `*` under an empty item nests
 * inside it, and that no longer reads back as the same text.
 */
const STARS_ONLY = /^\*[ \t]*(?:\n(?:\*[ \t]*|[ \t]*))*$/;

const plainText = (nodes: Inline[]): string | null =>
  nodes.every((n) => n.type === "text")
    ? nodes.map((n) => (n as { value: string }).value).join("")
    : null;

/**
 * A mark's delimiters around its content, with the whitespace at either end
 * moved outside them.
 *
 * A delimiter touching whitespace opens or closes nothing, so `**פחות. **`
 * reaches the page as the asterisks themselves - and a double-click selects
 * the space after a word, so bolding one routinely ends in a space.
 */
const wrap = (marker: string, inner: string): string => {
  const [, lead, core, trail] = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return core ? `${lead}${marker}${core}${marker}${trail}` : inner;
};

export function inlineToMarkdown(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return escapeInlineText(n.value);
        case "emphasis":
          return wrap(n.marker, inlineToMarkdown(n.children));
        case "strong":
          return wrap("**", inlineToMarkdown(n.children));
        case "opaque":
          return n.source;
      }
    })
    .join("");
}

export function blockToMarkdown(block: Block): string {
  switch (block.kind) {
    case "paragraph": {
      const typed = plainText(block.inline);
      if (typed !== null && STARS_ONLY.test(dropUncarryableIndent(typed)))
        return dropUncarryableIndent(typed);
      const [head, ...rest] = escapeBlockStarts(
        inlineToMarkdown(block.inline),
      ).split("\n");
      return [escapeBlockHead(dropUncarryableIndent(head)), ...rest].join("\n");
    }
    case "heading":
      // The `##` is this function's own; what follows it is already inside a
      // block, so only the marks needed escaping - but an ATX heading is one
      // line, and a break the owner put inside one would end it and ship the
      // rest as a paragraph, so the break becomes the space it reads as.
      return `${"#".repeat(block.depth)} ${escapeHeadingEnd(
        dropUncarryableIndent(
          inlineToMarkdown(block.inline).replace(/\s*\n\s*/g, " "),
        ),
      )}`;
    case "list":
      return block.items
        .map((item, i) => {
          const marker = block.ordered ? `${i + 1}.` : "-";
          // What follows the marker is itself at the start of a block, so
          // `- 1. x` opens a list inside the item and `- # x` a heading. Every
          // line of an item needs escaping, its first included.
          const [head, ...rest] = inlineToMarkdown(item).split("\n");
          const first = escapeBlockHead(dropUncarryableIndent(head));
          return [`${marker} ${first}`, ...rest.map(escapeLineStart)].join(
            "\n",
          );
        })
        .join("\n");
    case "opaque":
      return block.source;
  }
}

function blockFrom(node: any, body: string): Block {
  const source = body.slice(
    node.position.start.offset,
    node.position.end.offset,
  );
  switch (node.type) {
    case "paragraph":
      return {
        kind: "paragraph",
        source,
        inline: inlineFrom(node.children, body, node.position.end.offset),
      };
    case "heading":
      return {
        kind: "heading",
        depth: node.depth,
        source,
        inline: inlineFrom(node.children, body, node.position.end.offset),
      };
    case "list": {
      if (
        !node.ordered &&
        STARS_ONLY.test(source) &&
        node.children.every((li: any) => li.children.length === 0)
      )
        return { kind: "paragraph", source, inline: [{ type: "text", value: source }] };
      // Only flat, single-paragraph items occur; anything else stays opaque so
      // it round-trips rather than being flattened.
      const simple = node.children.every(
        (li: any) =>
          li.children.length === 1 && li.children[0].type === "paragraph",
      );
      if (!simple) return { kind: "opaque", source };
      return {
        kind: "list",
        ordered: Boolean(node.ordered),
        source,
        items: node.children.map((li: any) =>
          inlineFrom(
            li.children[0].children,
            body,
            li.children[0].position.end.offset,
          ),
        ),
      };
    }
    default:
      return { kind: "opaque", source };
  }
}

export function parseMdx(raw: string): MdxDoc {
  const fm = raw.match(FRONTMATTER);
  const frontmatter = fm ? fm[0] : "";
  const body = raw.slice(frontmatter.length);
  const tree = parseBody(body);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const node of tree.children as any[]) {
    const start = node.position.start.offset;
    const end = node.position.end.offset;
    if (start > cursor)
      segments.push({ type: "gap", text: body.slice(cursor, start) });
    segments.push({ type: "block", block: blockFrom(node, body) });
    cursor = end;
  }
  if (cursor < body.length)
    segments.push({ type: "gap", text: body.slice(cursor) });

  return { frontmatter, segments };
}

/**
 * `changed` names the segment indices whose block was edited; every other block
 * emits its original bytes. Passing an empty set is the identity transform.
 */
export function serializeMdx(
  doc: MdxDoc,
  changed: ReadonlySet<number> = new Set(),
): string {
  const body = doc.segments
    .map((seg, i) => {
      if (seg.type === "gap") return seg.text;
      return changed.has(i) ? blockToMarkdown(seg.block) : seg.block.source;
    })
    .join("");
  return doc.frontmatter + body;
}

/** Every block index, for a full re-serialization. */
export const allBlocks = (doc: MdxDoc): Set<number> =>
  new Set(
    doc.segments
      .map((s, i) => (s.type === "block" ? i : -1))
      .filter((i) => i >= 0),
  );

/** Index of every segment holding an editable (non-opaque) block. */
export function editableBlocks(doc: MdxDoc): number[] {
  return doc.segments
    .map((seg, i) =>
      seg.type === "block" && seg.block.kind !== "opaque" ? i : -1,
    )
    .filter((i) => i >= 0);
}
