/**
 * Block/Inline model ↔ ProseMirror document.
 *
 * The editor owns a whole document rather than one block at a time, so undo
 * spans the page the way the owner expects. That costs a conversion on the way
 * in and out, and this is it.
 *
 * **Every top-level node carries the whitespace that preceded it** in `gap`.
 * The body's blank-line rhythm is not decoration: `remark-breaks` makes line
 * breaks visible, and a serializer that normalised gaps to "\n\n" would
 * silently reflow copy. The round-trip gate is what holds this honest.
 *
 * **A blank line past the first is an empty paragraph.** The site draws each
 * one as a line of space (scripts/remark-blank-lines.mjs), so the editor has
 * to show it, and has to let her add one with Enter and remove it with
 * Backspace - which a count hidden in `gap` would not.
 */
import type { Block, Inline, MdxDoc, Segment } from './mdx-edit';
import { parseSoftImage, renderSoftImage } from '../lib/softimage';

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: PmMark[];
}

export interface PmMark {
  type: string;
  attrs?: Record<string, unknown>;
}

const MARK_OF: Record<string, string> = { '*': 'emphasis', _: 'italic' };
const MARKER_OF: Record<string, '*' | '_'> = { emphasis: '*', italic: '_' };

/* ------------------------------- to ProseMirror ------------------------------ */

function inlineToPm(nodes: Inline[], marks: PmMark[] = []): PmNode[] {
  const out: PmNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        // A newline is a hard break, because that is what the site renders.
        // The break carries the surrounding marks too: emphasis in this copy
        // routinely spans several lines, and an unmarked break would split one
        // span into two on the way back.
        const applied = marks.length ? { marks } : {};
        const parts = node.value.split('\n');
        parts.forEach((part, i) => {
          if (i > 0) out.push({ type: 'hardBreak', ...applied });
          if (part) out.push({ type: 'text', text: part, ...applied });
        });
        break;
      }
      case 'emphasis':
        out.push(...inlineToPm(node.children, [...marks, { type: MARK_OF[node.marker] }]));
        break;
      case 'strong':
        out.push(...inlineToPm(node.children, [...marks, { type: 'bold' }]));
        break;
      case 'link':
        out.push(...inlineToPm(node.children, [...marks, { type: 'link', attrs: { href: node.href, title: node.title } }]));
        break;
      case 'opaque':
        out.push({ type: 'rawInline', attrs: { source: node.source }, ...(marks.length ? { marks } : {}) });
        break;
    }
  }
  return out;
}

function blockToPm(block: Block, gap: string): PmNode {
  const attrs = { gap };
  switch (block.kind) {
    case 'paragraph':
      return { type: 'paragraph', attrs, content: inlineToPm(block.inline) };
    case 'heading':
      return { type: 'heading', attrs: { ...attrs, level: block.depth }, content: inlineToPm(block.inline) };
    case 'list':
      return {
        type: block.ordered ? 'orderedList' : 'bulletList',
        attrs,
        content: block.items.map((item) => ({
          type: 'listItem',
          content: [{ type: 'paragraph', attrs: { gap: '' }, content: inlineToPm(item) }],
        })),
      };
    case 'opaque': {
      const image = parseSoftImage(block.source);
      if (image) return { type: 'softImage', attrs: { ...attrs, ...image } };
      return { type: 'rawBlock', attrs: { ...attrs, source: block.source } };
    }
  }
}

const newlines = (text: string): number => text.split('\n').length - 1;

/**
 * One piece per blank line past the first, each ending at its newline, and
 * the rest - which still holds the two newlines that separate the blocks.
 * The pieces are the gap's own bytes, so an untouched file writes back the
 * same, trailing spaces and all.
 */
function splitBlankLines(gap: string): { pieces: string[]; rest: string } {
  const pieces: string[] = [];
  let rest = gap;
  while (newlines(rest) > 2) {
    const end = rest.indexOf('\n') + 1;
    pieces.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  return { pieces, rest };
}

export function docToPm(doc: MdxDoc): PmNode {
  const content: PmNode[] = [];
  let gap = '';
  for (const segment of doc.segments) {
    if (segment.type === 'gap') {
      gap += segment.text;
      continue;
    }
    // Above the first block there is nothing to make room from, and the site
    // draws no space there either.
    if (content.length) {
      const { pieces, rest } = splitBlankLines(gap);
      for (const piece of pieces) content.push({ type: 'paragraph', attrs: { gap: piece } });
      gap = rest;
    }
    content.push(blockToPm(segment.block, gap));
    gap = '';
  }
  // Whatever trailed the last block has nowhere else to live.
  return { type: 'doc', attrs: { trailing: gap }, content };
}

/* ------------------------------ from ProseMirror ----------------------------- */

/**
 * A fixed order, so that nodes carrying the same marks compare equal. How the
 * marks nest in the file is not decided here: `inlineToMarkdown` works that
 * out from the characters, since markdown can close only some nestings.
 */
const MARK_ORDER = ['emphasis', 'italic', 'bold'] as const;

const markSet = (node: PmNode): string[] =>
  MARK_ORDER.filter((name) => (node.marks ?? []).some((m) => m.type === name));

/** Which link a node belongs to, if any: the same address and title is the same link. */
const linkOf = (node: PmNode): string | null => {
  const link = node.marks?.find((m) => m.type === 'link');
  return link ? JSON.stringify([link.attrs?.href ?? '', link.attrs?.title ?? null]) : null;
};

/** Each run of nodes in one link becomes that link, its marks inside it. */
function pmToInline(nodes: PmNode[] = []): Inline[] {
  const out: Inline[] = [];
  for (let start = 0; start < nodes.length; ) {
    const link = linkOf(nodes[start]);
    let end = start + 1;
    while (end < nodes.length && linkOf(nodes[end]) === link) end += 1;
    const children = marked(nodes.slice(start, end));
    if (link === null) out.push(...children);
    else {
      const [href, title] = JSON.parse(link) as [string, string | null];
      out.push({ type: 'link', href: String(href), title: title === null ? null : String(title), children });
    }
    start = end;
  }
  return out;
}

function marked(nodes: PmNode[]): Inline[] {
  const out: Inline[] = [];

  const flush = (marks: string[], children: Inline[]): void => {
    if (children.length === 0) return;
    let built = children;
    for (const name of marks) {
      built = [
        name === 'bold'
          ? { type: 'strong', children: built }
          : { type: 'emphasis', marker: MARKER_OF[name], children: built },
      ];
    }
    for (const node of built) {
      const last = out[out.length - 1];
      if (node.type === 'text' && last?.type === 'text') last.value += node.value;
      else out.push(node);
    }
  };

  let marks: string[] = [];
  let run: Inline[] = [];

  const add = (node: PmNode, value: Inline): void => {
    const mine = markSet(node);
    if (mine.join('|') !== marks.join('|')) {
      flush(marks, run);
      marks = mine;
      run = [];
    }
    const last = run[run.length - 1];
    if (value.type === 'text' && last?.type === 'text') last.value += value.value;
    else run.push(value);
  };

  for (const node of nodes) {
    if (node.type === 'hardBreak') add(node, { type: 'text', value: '\n' });
    else if (node.type === 'rawInline') add(node, { type: 'opaque', source: String(node.attrs?.source ?? '') });
    else if (node.type === 'text' && node.text !== undefined) add(node, { type: 'text', value: node.text });
  }
  flush(marks, run);
  return out;
}

function pmToBlock(node: PmNode): Block {
  switch (node.type) {
    case 'heading':
      return {
        kind: 'heading',
        depth: Number(node.attrs?.level ?? 2),
        source: '',
        inline: pmToInline(node.content),
      };
    case 'bulletList':
    case 'orderedList':
      return {
        kind: 'list',
        ordered: node.type === 'orderedList',
        source: '',
        items: (node.content ?? []).map((item) => pmToInline(item.content?.[0]?.content)),
      };
    case 'softImage':
      return {
        kind: 'opaque',
        source: renderSoftImage({
          id: String(node.attrs?.id ?? ''),
          aspect: String(node.attrs?.aspect ?? '4/3'),
          float: (node.attrs?.float as 'start' | 'end' | undefined) || undefined,
          width: node.attrs?.width ? String(node.attrs.width) : undefined,
        }),
      };
    case 'rawBlock':
      return { kind: 'opaque', source: String(node.attrs?.source ?? '') };
    default:
      return { kind: 'paragraph', source: '', inline: pmToInline(node.content) };
  }
}

/** Default separation for a block the owner just added. */
const DEFAULT_GAP = '\n\n';

/**
 * A heading with no words is an empty line as well, because that is what the
 * editor shows her: deleting a heading's text leaves one, and so does pressing
 * H2 on an empty line. Written out, `## ` ships an `<h2>` with no name; dropped
 * outright, it takes away a line of space she can see.
 */
const isEmptyLine = (block: Block): boolean =>
  (block.kind === 'paragraph' || block.kind === 'heading') &&
  block.inline.every((n) => n.type === 'text' && n.value.trim() === '');

/**
 * Whether `gap` still leaves `next` a block of its own.
 *
 * ProseMirror copies a node's attributes when it splits one, so a paragraph
 * the owner makes with Enter inherits the gap of the paragraph she split from
 * - often a single newline, which markdown reads as a line break inside one
 * paragraph. Four paragraphs then ship as one, and the help text above the
 * editor becomes a lie.
 *
 * A blank line always separates. One newline is enough only where the previous
 * block ends at its own line - a heading, or a JSX element the editor keeps
 * verbatim. After running text nothing but a heading can interrupt.
 */
export function separates(gap: string, prev: Block | null, next: Block): boolean {
  if (!prev) return true;
  if (/\n[^\S\n]*\n/.test(gap)) return true;
  if (!gap.includes('\n')) return false;
  if (prev.kind === 'heading' || prev.kind === 'opaque') return true;
  return next.kind === 'heading';
}

const widen = (gap: string): string => (gap.includes('\n') ? `${gap}\n` : DEFAULT_GAP);

/**
 * Two lists of the same kind, one after the other, are one list.
 *
 * Markdown has no way to hold them apart - a blank line between items only
 * loosens a list, it does not end one - so a file written from two of them
 * reads back as one, renumbered, and the next save writes bytes the last one
 * did not. The model reconciles to what the file will say.
 */
const joinable = (prev: Block | null, next: Block): boolean =>
  prev?.kind === 'list' && next.kind === 'list' && prev.ordered === next.ordered;

/**
 * The blank lines an empty paragraph stands for: one, plus one per line break
 * she put inside it, since each of those shows as another empty line.
 *
 * Not its `gap` as carried: Enter copies the gap of the paragraph it split,
 * so one empty paragraph made after a blank-line gap would otherwise write
 * two blank lines - and two lines of space on the site for one she can see.
 * A gap already one line long is kept byte for byte.
 */
function blankLinesOf(own: string, text: string): string {
  const line = newlines(own) === 1 ? own : '\n';
  return line + '\n'.repeat(newlines(text));
}

const textOf = (block: Block): string =>
  block.kind === 'paragraph' || block.kind === 'heading' ? block.inline.map((n) => (n.type === 'text' ? n.value : '')).join('') : '';

/** Two newlines, the least that separates the block the empty lines come before. */
const separated = (own: string): string => '\n'.repeat(Math.max(0, 2 - newlines(own))) + own;

export function pmToDoc(pm: PmNode, frontmatter: string): MdxDoc {
  const segments: Segment[] = [];
  let prev: Block | null = null;
  // Empty paragraphs are blank lines, written into the gap of whatever comes
  // next. Above the first block and below the last there is nothing to make
  // room between - StarterKit's trailing node puts one below the last block of
  // any document that does not end in a paragraph - so those write nothing.
  let pending = '';

  (pm.content ?? []).forEach((node, i) => {
    const own = typeof node.attrs?.gap === 'string' ? node.attrs.gap : i === 0 ? '' : DEFAULT_GAP;
    const block = pmToBlock(node);
    if (isEmptyLine(block)) {
      if (prev) pending += blankLinesOf(own, textOf(block));
      return;
    }

    if (prev?.kind === 'list' && block.kind === 'list' && joinable(prev, block)) {
      prev.items.push(...block.items);
      pending = '';
      return;
    }

    let gap = pending ? pending + separated(own) : own;
    pending = '';
    if (!separates(gap, prev, block)) gap = widen(gap);
    if (gap) segments.push({ type: 'gap', text: gap });
    segments.push({ type: 'block', block });
    prev = block;
  });

  // A trailing empty paragraph is spacing after the last word, which markdown
  // has no way to mean; `pending` is deliberately dropped here so a file does
  // not grow a blank line every time it is opened and saved.
  const trailing = typeof pm.attrs?.trailing === 'string' ? pm.attrs.trailing : '\n';
  if (trailing) segments.push({ type: 'gap', text: trailing });
  return { frontmatter, segments };
}
