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
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdxjs } from 'micromark-extension-mdxjs';

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'emphasis'; marker: '*' | '_'; children: Inline[] }
  | { type: 'strong'; children: Inline[] }
  | { type: 'opaque'; source: string };

export type Block =
  | { kind: 'paragraph'; source: string; inline: Inline[] }
  | { kind: 'heading'; depth: number; source: string; inline: Inline[] }
  | { kind: 'list'; ordered: boolean; source: string; items: Inline[][] }
  | { kind: 'opaque'; source: string };

export type Segment = { type: 'gap'; text: string } | { type: 'block'; block: Block };

export interface MdxDoc {
  /** Raw frontmatter including both `---` fences and the newline after. */
  frontmatter: string;
  segments: Segment[];
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const parseBody = (body: string) =>
  fromMarkdown(body, { extensions: [mdxjs()], mdastExtensions: [mdxFromMarkdown()] });

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
    type: 'text',
    value: unescapeInlineText(body.slice(from, to)),
  });

  let cursor = nodes.length ? nodes[0].position.start.offset : contentEnd;
  for (const n of nodes) {
    const start = n.position.start.offset;
    const end = n.position.end.offset;
    if (start > cursor) out.push(text(cursor, start));
    cursor = end;
    switch (n.type) {
      case 'text':
        out.push(text(start, end));
        break;
      case 'emphasis':
        out.push({
          type: 'emphasis',
          marker: body[start] === '_' ? '_' : '*',
          children: inlineFrom(n.children, body, end - 1),
        });
        break;
      case 'strong':
        out.push({ type: 'strong', children: inlineFrom(n.children, body, end - 2) });
        break;
      default:
        out.push({ type: 'opaque', source: body.slice(start, end) });
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

export const unescapeInlineText = (value: string): string => value.replace(ESCAPED, '$1');

/**
 * Neutralise punctuation the markdown and MDX grammars would claim.
 *
 * What the editor refuses to *render* is not protection: the owner types into
 * a surface that shows `# כותרת` as ordinary words, and if it reaches the file
 * unescaped the site builds it as a second `<h1>`. Everything the grammar can
 * read has to be escaped on the way out, or the editor is lying about what it
 * will publish.
 *
 * `*` and `_` are the exception, escaped only where they touch a non-space:
 * only there can they open or close a mark, and this copy uses a lone asterisk
 * on its own line as a divider. Escaping every one would rewrite body text the
 * moment an unrelated word changed.
 */
export function escapeInlineText(value: string): string {
  return (
    value
      .replace(/\\/g, '\\\\')
      .replace(/([*_])(?=\S)|(?<=\S)([*_])/g, (m) => `\\${m}`)
      // Links, images, code spans, autolinks and HTML - and `{`, which MDX
      // reads as the start of an expression rather than as a character.
      .replace(/[[\]`<{]/g, (m) => `\\${m}`)
      // Only an `&` that completes an entity turns into another character.
      .replace(/&(?=[a-zA-Z#][a-zA-Z0-9]*;)/g, '\\&')
  );
}

/**
 * Line starts the block grammar would claim.
 *
 * `remark-breaks` is on, so a paragraph is several lines and the block parser
 * looks at every one of them. A `#` the owner typed as punctuation has to be
 * neutralised wherever it lands, not only in the first line.
 */
const BLOCK_START =
  /^([ \t]*)(#{1,6}(?=[ \t]|$)|>|[-+*](?=[ \t])|(\d{1,9})([.)])(?=[ \t])|={2,}[ \t]*$|-{2,}[ \t]*$|~{3,})/;

const escapeLineStart = (line: string): string =>
  line.replace(
    BLOCK_START,
    // Only ASCII punctuation is escapable, so an ordered list is broken at its
    // delimiter: `1\.` is text, while `\1.` would ship a stray backslash.
    (_m, indent: string, token: string, digits: string | undefined, delimiter: string) =>
      digits ? `${indent}${digits}\\${delimiter}` : `${indent}\\${token}`,
  );

/** Every line, since every line of a paragraph is a line the parser reads. */
const escapeBlockStarts = (text: string): string =>
  text.split('\n').map(escapeLineStart).join('\n');

export function inlineToMarkdown(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case 'text':
          return escapeInlineText(n.value);
        case 'emphasis':
          return `${n.marker}${inlineToMarkdown(n.children)}${n.marker}`;
        case 'strong':
          return `**${inlineToMarkdown(n.children)}**`;
        case 'opaque':
          return n.source;
      }
    })
    .join('');
}

export function blockToMarkdown(block: Block): string {
  switch (block.kind) {
    case 'paragraph':
      return escapeBlockStarts(inlineToMarkdown(block.inline));
    case 'heading':
      // The `##` is this function's own; what follows it is already inside a
      // block, so only the marks needed escaping.
      return `${'#'.repeat(block.depth)} ${inlineToMarkdown(block.inline)}`;
    case 'list':
      return block.items
        .map((item, i) => {
          const marker = block.ordered ? `${i + 1}.` : '-';
          // The item's own first line follows the marker; a second line is at
          // the start of one and could otherwise open a block of its own.
          const [head, ...rest] = inlineToMarkdown(item).split('\n');
          return [`${marker} ${head}`, ...rest.map(escapeLineStart)].join('\n');
        })
        .join('\n');
    case 'opaque':
      return block.source;
  }
}

function blockFrom(node: any, body: string): Block {
  const source = body.slice(node.position.start.offset, node.position.end.offset);
  switch (node.type) {
    case 'paragraph':
      return {
        kind: 'paragraph',
        source,
        inline: inlineFrom(node.children, body, node.position.end.offset),
      };
    case 'heading':
      return {
        kind: 'heading',
        depth: node.depth,
        source,
        inline: inlineFrom(node.children, body, node.position.end.offset),
      };
    case 'list': {
      // Only flat, single-paragraph items occur; anything else stays opaque so
      // it round-trips rather than being flattened.
      const simple = node.children.every(
        (li: any) => li.children.length === 1 && li.children[0].type === 'paragraph',
      );
      if (!simple) return { kind: 'opaque', source };
      return {
        kind: 'list',
        ordered: Boolean(node.ordered),
        source,
        items: node.children.map((li: any) =>
          inlineFrom(li.children[0].children, body, li.children[0].position.end.offset),
        ),
      };
    }
    default:
      return { kind: 'opaque', source };
  }
}

export function parseMdx(raw: string): MdxDoc {
  const fm = raw.match(FRONTMATTER);
  const frontmatter = fm ? fm[0] : '';
  const body = raw.slice(frontmatter.length);
  const tree = parseBody(body);

  const segments: Segment[] = [];
  let cursor = 0;
  for (const node of tree.children as any[]) {
    const start = node.position.start.offset;
    const end = node.position.end.offset;
    if (start > cursor) segments.push({ type: 'gap', text: body.slice(cursor, start) });
    segments.push({ type: 'block', block: blockFrom(node, body) });
    cursor = end;
  }
  if (cursor < body.length) segments.push({ type: 'gap', text: body.slice(cursor) });

  return { frontmatter, segments };
}

/**
 * `changed` names the segment indices whose block was edited; every other block
 * emits its original bytes. Passing an empty set is the identity transform.
 */
export function serializeMdx(doc: MdxDoc, changed: ReadonlySet<number> = new Set()): string {
  const body = doc.segments
    .map((seg, i) => {
      if (seg.type === 'gap') return seg.text;
      return changed.has(i) ? blockToMarkdown(seg.block) : seg.block.source;
    })
    .join('');
  return doc.frontmatter + body;
}

/** Every block index, for a full re-serialization. */
export const allBlocks = (doc: MdxDoc): Set<number> =>
  new Set(
    doc.segments.map((s, i) => (s.type === 'block' ? i : -1)).filter((i) => i >= 0),
  );

/** Index of every segment holding an editable (non-opaque) block. */
export function editableBlocks(doc: MdxDoc): number[] {
  return doc.segments
    .map((seg, i) => (seg.type === 'block' && seg.block.kind !== 'opaque' ? i : -1))
    .filter((i) => i >= 0);
}
