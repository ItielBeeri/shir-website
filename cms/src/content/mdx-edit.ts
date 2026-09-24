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
  | { type: "link"; href: string; title: string | null; children: Inline[] }
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
      case "link":
        out.push({
          type: "link",
          href: n.url,
          title: n.title ?? null,
          children: inlineFrom(n.children, body, labelEnd(n, body)),
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
 * The `]` that closes a link's text. MDX has no autolinks, so every link is
 * `[text](destination)`, and a `]` inside the text is either escaped or inside
 * a child - so the first one past the last child is the closer.
 */
function labelEnd(link: any, body: string): number {
  let at = link.children.length
    ? link.children[link.children.length - 1].position.end.offset
    : link.position.start.offset + 1;
  while (body[at] !== "]") at += 1;
  return at;
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
 * body text the moment an unrelated word changed. A mark's delimiter just
 * outside `value` is a non-space too, which is what `touching` says.
 *
 * The site's markdown is GFM, so the vocabulary is wider than CommonMark's:
 * `~~` strikes text through and `|` builds a table, and `.prose` styles
 * neither. A bare `https://…` is the one construct that cannot be escaped at
 * all - GFM resolves character escapes before it looks for addresses, so
 * `https:\/\/` still autolinks. `escaping.test.ts` records the attempt.
 */
export function escapeInlineText(
  value: string,
  touching: { before?: boolean; after?: boolean } = {},
): string {
  const markChar = new RegExp(
    `[*_~](?=\\S${touching.after ? "|$" : ""})|(?<=\\S${touching.before ? "|^" : ""})[*_~]`,
    "g",
  );
  return (
    value
      .replace(/\\/g, "\\\\")
      .replace(markChar, (m) => `\\${m}`)
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

/* ---------------------------------- marks ---------------------------------- */

const ITALIC = 1;
const EMPHASIS = 2;
const STRONG = 4;
const MARKS = [ITALIC, EMPHASIS, STRONG];
const DELIMITER: Record<number, string> = { [ITALIC]: "_", [EMPHASIS]: "*", [STRONG]: "**" };

/** One character of text, a whole opaque inline or a whole link, and the marks on it. */
interface Atom {
  source: string;
  opaque: boolean;
  marks: number;
  link?: Link;
}

/** A link's text, as atoms of its own: brackets bound every mark inside them. */
interface Link {
  href: string;
  title: string | null;
  inner: Atom[];
}

function atomsOf(nodes: Inline[], marks = 0, link?: Link): Atom[] {
  return nodes.flatMap((n): Atom[] => {
    switch (n.type) {
      case "text":
        return Array.from(n.value, (source) => ({ source, opaque: false, marks, link }));
      case "emphasis":
        return atomsOf(n.children, marks | (n.marker === "_" ? ITALIC : EMPHASIS), link);
      case "strong":
        return atomsOf(n.children, marks | STRONG, link);
      case "link":
        return atomsOf(n.children, marks, { href: n.href, title: n.title, inner: [] });
      case "opaque":
        return [{ source: n.source, opaque: true, marks, link }];
    }
  });
}

/**
 * Each link's characters, folded into one atom.
 *
 * Markdown pairs no delimiter across a bracket, so a mark cannot begin inside
 * a link and end outside it. A mark the link's neighbours share wraps the whole
 * link; one that stops at its edge goes inside the brackets, where a delimiter
 * always stands beside punctuation and so always counts: `[**א**](u)ב` is bold,
 * `**[א](u)**ב` is not.
 */
function foldLinks(atoms: Atom[]): Atom[] {
  const out: Atom[] = [];
  for (let start = 0; start < atoms.length; ) {
    const link = atoms[start].link;
    if (!link) {
      out.push(atoms[start]);
      start += 1;
      continue;
    }
    let end = start;
    while (end < atoms.length && atoms[end].link === link) end += 1;
    const run = atoms.slice(start, end);
    const shared = run.reduce((all, atom) => all & atom.marks, ITALIC | EMPHASIS | STRONG);
    const outside = shared & ((atoms[start - 1]?.marks ?? 0) | (atoms[end]?.marks ?? 0));
    link.inner = run.map((atom) => ({ ...atom, marks: atom.marks & ~outside, link: undefined }));
    out.push({ source: "", opaque: true, marks: outside, link });
    start = end;
  }
  return out;
}

/**
 * A link destination the parser reads back as `href`. The bare form takes
 * backslash escapes; one with a space, or an empty one, needs angle brackets.
 */
function destination(raw: string, title: string | null): string {
  // Neither form can hold a line break; a pasted `href` attribute can.
  const href = raw.replace(/[\x00-\x1f\x7f]/g, encodeURIComponent);
  const url = /[\s<>]/.test(href) || href === ""
    ? `<${href.replace(/[\\<>]/g, (m) => `\\${m}`)}>`
    : href.replace(/[\\()]/g, (m) => `\\${m}`);
  return title === null ? url : `${url} "${title.replace(/["\\]/g, (m) => `\\${m}`)}"`;
}

/** The delimiters between atom `i - 1` and atom `i`: closers innermost first, then openers. */
interface Edge {
  close: number[];
  open: number[];
}

/**
 * How the marks nest, decided afresh from what each character carries.
 *
 * Not the nesting of the tree handed in: the editor wraps run by run, and a
 * mark that runs on past another's edge then stacks four asterisks there,
 * which CommonMark pairs wrongly. Italic is outermost, closing and reopening
 * whatever it cuts through, because an underscore opens only beside whitespace
 * or punctuation and those asterisks are punctuation: `**א**_**ב**_**ג**`
 * holds italic inside a bold word, `**א_ב_ג**` does not. Of the other two the
 * longer goes outside, as a person would write it - emphasis on a tie - and
 * one crossing the other's edge closes there and opens again.
 */
function edgesOf(atoms: Atom[]): Edge[] {
  const edges = Array.from({ length: atoms.length + 1 }, (): Edge => ({ close: [], open: [] }));
  const runEnd = (from: number, to: number, has: (marks: number) => boolean): number => {
    let j = from;
    while (j < to && has(atoms[j].marks)) j += 1;
    return j;
  };
  const wrap = (mark: number, from: number, to: number, inside: () => void): void => {
    edges[from].open.push(mark);
    inside();
    edges[to].close.push(mark);
  };
  const nest = (from: number, to: number, outer: number): void => {
    let start = from;
    while (start < to) {
      const end = (mark: number): number => runEnd(start, to, (marks) => (marks & mark) !== 0);
      const here = [EMPHASIS, STRONG].filter((mark) => atoms[start].marks & ~outer & mark);
      if (!here.length) {
        start += 1;
        continue;
      }
      const mark = here.reduce((a, b) => (end(b) > end(a) ? b : a));
      const stop = end(mark);
      wrap(mark, start, stop, () => nest(start, stop, outer | mark));
      start = stop;
    }
  };
  let start = 0;
  while (start < atoms.length) {
    const italic = atoms[start].marks & ITALIC;
    const stop = runEnd(start, atoms.length, (marks) => (marks & ITALIC) === italic);
    if (italic) wrap(ITALIC, start, stop, () => nest(start, stop, ITALIC));
    else nest(start, stop, 0);
    start = stop;
  }
  return edges;
}

const WHITESPACE = 1;
const PUNCTUATION = 2;

/** micromark's classes; a block edge is whitespace, and a word character is 0. */
const classOf = (ch: string | undefined): number =>
  ch === undefined || /\s/u.test(ch) ? WHITESPACE : /[\p{P}\p{S}]/u.test(ch) ? PUNCTUATION : 0;

/**
 * Whether a run of delimiters can open and close, by micromark's own test
 * (micromark-core-commonmark, `attention`). A `*` or `_` just after the run
 * lets it open, and one just before lets it close; GFM adds `~` to those, but
 * the editor reads files without GFM, and the two parsers have to agree on
 * what she wrote.
 */
function flanking(marker: string, before?: string, after?: string): { open: boolean; close: boolean } {
  const b = classOf(before);
  const a = classOf(after);
  const open = a === 0 || (a === PUNCTUATION && b !== 0) || after === "*" || after === "_";
  const close = b === 0 || (b === PUNCTUATION && a !== 0) || before === "*" || before === "_";
  return marker === "*"
    ? { open, close }
    : { open: open && (b !== 0 || !close), close: close && (a !== 0 || !open) };
}

/** An atom's last character, which escaping never changes. */
const lastOf = (atom: Atom): string | undefined => (atom.link ? ")" : atom.source.at(-1));

/** An atom's first character as the parser meets it: a mark character beside a delimiter is always escaped. */
const firstOf = (atom: Atom): string | undefined =>
  atom.link ? "[" : !atom.opaque && /[*_~]/.test(atom.source) ? "\\" : atom.source[0];

/** Every delimiter the parser would not read as one, and the marks it stands for. */
function refused(atoms: Atom[]): Array<{ at: number; marks: number; closing: boolean }> {
  const edges = edgesOf(atoms);
  const out: Array<{ at: number; marks: number; closing: boolean }> = [];
  for (let at = 0; at < edges.length; at += 1) {
    const cells = [
      ...edges[at].close.map((mark) => ({ mark, closing: true })),
      ...edges[at].open.map((mark) => ({ mark, closing: false })),
    ].flatMap((d) => Array.from(DELIMITER[d.mark], () => d));
    const written = cells.map((c) => DELIMITER[c.mark][0]).join("");
    for (const run of written.matchAll(/\*+|_+/g)) {
      const from = run.index;
      const to = from + run[0].length;
      const can = flanking(
        run[0][0],
        from > 0 ? written[from - 1] : at > 0 ? lastOf(atoms[at - 1]) : undefined,
        to < written.length ? written[to] : at < atoms.length ? firstOf(atoms[at]) : undefined,
      );
      let closing = 0;
      let opening = 0;
      for (const c of cells.slice(from, to)) {
        if (c.closing) closing |= c.mark;
        else opening |= c.mark;
      }
      if (closing && !can.close) out.push({ at, marks: closing, closing: true });
      if (opening && !can.open) out.push({ at, marks: opening, closing: false });
    }
  }
  return out;
}

/**
 * Where each mark can begin and end.
 *
 * A delimiter beside whitespace opens or closes nothing, nor does one between
 * punctuation and a letter, nor an underscore inside a word - so written where
 * she put it, `**פחות. **` or `ו**"שקט"**` reaches the page as the asterisks
 * themselves, and the next save escapes them for good. A double-click selects
 * the space after a word, so this is the ordinary case, not the odd one.
 *
 * So a refused delimiter moves. Whitespace or punctuation at a mark's edge goes
 * outside it, which the page barely shows; italic that begins or ends inside a
 * word takes in the rest of the word instead, since shrinking it would cost
 * letters; a mark left with nothing goes. A link at the edge keeps the mark
 * inside its brackets rather than losing it. A run of spaces, or the rest of a
 * word, moves in one step, landing where a step per character would: each pass
 * reads the whole paragraph, so stepping per character is quadratic in it.
 * Marks only ever leave whitespace and punctuation and only italic
 * joins letters, so no pass undoes another and the bound is never met - it is
 * there so that a flaw in that reasoning costs a mark rather than a frozen tab.
 */
function settle(atoms: Atom[]): Atom[] {
  for (let pass = 0; pass <= atoms.length * MARKS.length; pass += 1) {
    const refusals = refused(atoms);
    if (!refusals.length) break;
    for (const { at, marks, closing } of refusals) {
      const inward = closing ? -1 : 1;
      const inside = closing ? at - 1 : at;
      const outside = inside - inward;
      const inner = (k: number): string | undefined => (closing ? lastOf(atoms[k]) : firstOf(atoms[k]));
      const outer = (k: number): string | undefined => (closing ? firstOf(atoms[k]) : lastOf(atoms[k]));
      if (marks === ITALIC && classOf(inner(inside)) === 0 && atoms[outside] && classOf(outer(outside)) === 0) {
        for (let k = outside; ; k -= inward) {
          atoms[k].marks |= ITALIC;
          const next = atoms[k - inward];
          if (!next || next.marks || classOf(outer(k - inward)) !== 0) break;
        }
      } else {
        for (let k = inside; ; k += inward) {
          const { link } = atoms[k];
          if (link) for (const atom of link.inner) atom.marks |= atoms[k].marks & marks;
          atoms[k].marks &= ~marks;
          const next = atoms[k + inward];
          if (!next || !(next.marks & marks) || classOf(inner(k + inward)) !== WHITESPACE) break;
        }
      }
    }
  }
  return atoms;
}

export const inlineToMarkdown = (nodes: Inline[]): string => render(layout(atomsOf(nodes)));

/** Links folded, every mark settled - a link's text last, once it has what its edges pushed in. */
function place(unfolded: Atom[]): Atom[] {
  const atoms = settle(foldLinks(unfolded));
  for (const { link } of atoms) if (link) link.inner = settle(link.inner);
  return atoms;
}

/** The characters a second save would read back, each with the marks this layout gives it. */
const reread = (atoms: Atom[]): Atom[] =>
  atoms.flatMap((atom) => {
    if (!atom.link) return [{ ...atom }];
    const link: Link = { href: atom.link.href, title: atom.link.title, inner: [] };
    return atom.link.inner.map((a) => ({ ...a, marks: a.marks | atom.marks, link }));
  });

const shape = (atoms: Atom[]): string =>
  atoms.map((a) => (a.link ? `[${a.marks}:${shape(a.link.inner)}]` : a.marks)).join(",");

/**
 * Where a link's marks go depends on its neighbours' marks, and settling
 * changes those - it moves a space out of a mark, or stretches italic over a
 * whole word. The file then reads back as characters this layout never saw,
 * and the next save folds them differently. So this lays out what it would
 * read back, until that is what it already has.
 */
function layout(unfolded: Atom[]): Atom[] {
  let atoms = place(unfolded);
  for (let pass = 0; pass < 8; pass += 1) {
    const again = place(reread(atoms));
    if (shape(again) === shape(atoms)) break;
    atoms = again;
  }
  return atoms;
}

/**
 * `bracketed` is a link's text, where the brackets stand beside the first and
 * last character just as a delimiter would.
 */
function render(atoms: Atom[], bracketed = false): string {
  const edges = edgesOf(atoms);
  let out = "";
  let text = "";
  let afterDelimiter = false;
  const flush = (beforeDelimiter: boolean, beforeLink = false): void => {
    if (text) {
      const escaped = escapeInlineText(text, { before: afterDelimiter, after: beforeDelimiter });
      // `![` opens an image.
      out += beforeLink ? escaped.replace(/!$/, "\\!") : escaped;
    }
    text = "";
  };
  edges.forEach(({ close, open }, at) => {
    const delimiters = [...close, ...open].map((mark) => DELIMITER[mark]).join("");
    if (delimiters) {
      flush(true);
      out += delimiters;
    }
    const atom = atoms[at];
    if (!atom) return;
    if (atom.link) {
      flush(true, true);
      out += `[${render(atom.link.inner, true)}](${destination(atom.link.href, atom.link.title)})`;
    } else if (atom.opaque) {
      flush(false);
      out += atom.source;
    } else {
      if (!text) afterDelimiter = delimiters !== "" || (at === 0 ? bracketed : Boolean(atoms[at - 1].link));
      text += atom.source;
    }
  });
  flush(bracketed);
  return out;
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
