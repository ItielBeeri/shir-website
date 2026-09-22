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
  let cursor = nodes.length ? nodes[0].position.start.offset : contentEnd;
  for (const n of nodes) {
    const start = n.position.start.offset;
    const end = n.position.end.offset;
    if (start > cursor) out.push({ type: 'text', value: body.slice(cursor, start) });
    cursor = end;
    switch (n.type) {
      case 'text':
        out.push({ type: 'text', value: body.slice(start, end) });
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
  if (contentEnd > cursor) out.push({ type: 'text', value: body.slice(cursor, contentEnd) });
  return out;
}

/**
 * Neutralise a mark character the owner typed as ordinary punctuation.
 *
 * Only a `*` or `_` that touches a non-space can open or close a mark, so a
 * lone asterisk on its own line - which this copy uses as a divider - is left
 * exactly as written. Escaping every one of them would rewrite existing body
 * text the moment an unrelated word changed, and the round-trip gate would
 * fail rather than let that through quietly.
 */
export function escapeInlineText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([*_])(?=\S)|(?<=\S)([*_])/g, (m) => `\\${m}`);
}

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
      return inlineToMarkdown(block.inline);
    case 'heading':
      return `${'#'.repeat(block.depth)} ${inlineToMarkdown(block.inline)}`;
    case 'list':
      return block.items
        .map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${inlineToMarkdown(item)}`)
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
