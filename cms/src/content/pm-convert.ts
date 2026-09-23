/**
 * Block/Inline model ↔ ProseMirror document.
 *
 * The editor owns a whole document rather than one block at a time, so undo
 * spans the page the way the owner expects. That costs a conversion on the way
 * in and out, and this is it.
 *
 * **Every top-level node carries the whitespace that preceded it** in `gap`.
 * The body's blank-line rhythm is not decoration: `remark-breaks` makes line
 * breaks visible, several files separate sections with more than one blank
 * line, and a serializer that normalised gaps to "\n\n" would silently reflow
 * copy. The round-trip gate is what holds this honest.
 */
import type { Block, Inline, MdxDoc, Segment } from './mdx-edit';
import { parseSoftImage, renderSoftImage } from '../lib/softimage';

export interface PmNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PmNode[];
  text?: string;
  marks?: Array<{ type: string }>;
}

const MARK_OF: Record<string, string> = { '*': 'emphasis', _: 'italic' };
const MARKER_OF: Record<string, '*' | '_'> = { emphasis: '*', italic: '_' };

/* ------------------------------- to ProseMirror ------------------------------ */

function inlineToPm(nodes: Inline[], marks: string[] = []): PmNode[] {
  const out: PmNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        // A newline is a hard break, because that is what the site renders.
        // The break carries the surrounding marks too: emphasis in this copy
        // routinely spans several lines, and an unmarked break would split one
        // span into two on the way back.
        const applied = marks.length ? { marks: marks.map((type) => ({ type })) } : {};
        const parts = node.value.split('\n');
        parts.forEach((part, i) => {
          if (i > 0) out.push({ type: 'hardBreak', ...applied });
          if (part) out.push({ type: 'text', text: part, ...applied });
        });
        break;
      }
      case 'emphasis':
        out.push(...inlineToPm(node.children, [...marks, MARK_OF[node.marker]]));
        break;
      case 'strong':
        out.push(...inlineToPm(node.children, [...marks, 'bold']));
        break;
      case 'opaque':
        out.push({ type: 'rawInline', attrs: { source: node.source } });
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

export function docToPm(doc: MdxDoc): PmNode {
  const content: PmNode[] = [];
  let gap = '';
  for (const segment of doc.segments) {
    if (segment.type === 'gap') {
      gap += segment.text;
      continue;
    }
    content.push(blockToPm(segment.block, gap));
    gap = '';
  }
  // Whatever trailed the last block has nowhere else to live.
  return { type: 'doc', attrs: { trailing: gap }, content };
}

/* ------------------------------ from ProseMirror ----------------------------- */

/** Marks nest outside-in, in a fixed order, so a document always serializes the same way. */
const MARK_ORDER = ['emphasis', 'italic', 'bold'] as const;

const markSet = (node: PmNode): string[] =>
  MARK_ORDER.filter((name) => (node.marks ?? []).some((m) => m.type === name));

/**
 * Consecutive inline nodes sharing a mark set become ONE wrapped span. Doing it
 * per node would turn a single emphasis that spans three lines into three
 * emphases, which changes both the markup and the meaning.
 */
function pmToInline(nodes: PmNode[] = []): Inline[] {
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
          floatWidth: node.attrs?.floatWidth ? String(node.attrs.floatWidth) : undefined,
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

const isEmptyParagraph = (block: Block): boolean =>
  block.kind === 'paragraph' &&
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

export function pmToDoc(pm: PmNode, frontmatter: string): MdxDoc {
  const segments: Segment[] = [];
  let prev: Block | null = null;
  // An empty paragraph is nothing in markdown, and StarterKit's trailing node
  // adds one after any document that does not end in a paragraph. Its spacing
  // is real, though, so the gap travels on to whatever comes next.
  let pending = '';

  (pm.content ?? []).forEach((node, i) => {
    const own = typeof node.attrs?.gap === 'string' ? node.attrs.gap : i === 0 ? '' : DEFAULT_GAP;
    const block = pmToBlock(node);
    if (isEmptyParagraph(block)) {
      pending += own;
      return;
    }

    if (prev?.kind === 'list' && block.kind === 'list' && joinable(prev, block)) {
      prev.items.push(...block.items);
      pending = '';
      return;
    }

    let gap = pending + own;
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
