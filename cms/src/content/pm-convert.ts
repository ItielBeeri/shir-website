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

export function pmToDoc(pm: PmNode, frontmatter: string): MdxDoc {
  const segments: Segment[] = [];
  (pm.content ?? []).forEach((node, i) => {
    const gap = typeof node.attrs?.gap === 'string' ? node.attrs.gap : i === 0 ? '' : DEFAULT_GAP;
    if (gap) segments.push({ type: 'gap', text: gap });
    segments.push({ type: 'block', block: pmToBlock(node) });
  });
  const trailing = typeof pm.attrs?.trailing === 'string' ? pm.attrs.trailing : '\n';
  if (trailing) segments.push({ type: 'gap', text: trailing });
  return { frontmatter, segments };
}
