/**
 * The editor's vocabulary, and nothing else.
 *
 * AGENTS.md §13: the editor may only offer constructs `.prose` styles - h2, h3,
 * `ul`, `ol`, the three emphasis marks, links, `SoftImage` and `FramedSection`.
 * Everything StarterKit would otherwise hand us (blockquote, code, strike, underline,
 * rules, h1, h4-h6) is turned off here rather than merely hidden from the
 * toolbar, so a paste or a keyboard shortcut cannot introduce it either.
 *
 * Markdown gives `*x*` and `_x_` the same node; the site spends them
 * differently (§4.3), so they are two marks with two tags: `em` carries
 * Hebrew emphasis-by-weight, `i` carries real italic.
 */
import { Extension, Mark, Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import type { NodeType } from '@tiptap/pm/model';
import type { Selection, Transaction } from '@tiptap/pm/state';
import { findWrapping } from '@tiptap/pm/transform';
import StarterKit from '@tiptap/starter-kit';
import { isLinkable } from '../lib/links';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    framedSection: {
      /** Frames the blocks the selection touches, or takes away the frame it is in. */
      toggleFramedSection: () => ReturnType;
      /** Takes away the frame at `pos`, keeping everything it held. */
      unwrapFramedSection: (pos: number) => ReturnType;
    };
  }
}

/**
 * A lone `*` is the owner's divider, kept as the character she typed
 * (mdx-edit.ts, `STARS_ONLY`). StarterKit turns `*` followed by a space - or by
 * Enter, which input rules also see - into a list, so typing the divider and
 * pressing Enter opened a bullet and put her next sentence inside it. `-` and
 * `+` still start a list.
 */
const Kit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) => {
      if (extension.name === 'bulletList')
        return (extension as Node).extend({
          addInputRules() {
            return [wrappingInputRule({ find: /^\s*([-+])\s$/, type: this.type })];
          },
        });
      // The body is the one place a frame may stand (FramedSectionNode).
      if (extension.name === 'doc') return (extension as Node).extend({ content: '(block | frame)+' });
      return extension;
    });
  },
});

/** Hebrew emphasis: `*text*`, rendered at weight 600 by the site. */
export const Emphasis = Mark.create({
  name: 'emphasis',
  parseHTML: () => [{ tag: 'em' }],
  renderHTML: ({ HTMLAttributes }) => ['em', mergeAttributes(HTMLAttributes), 0],
  addKeyboardShortcuts() {
    return { 'Mod-e': () => this.editor.commands.toggleMark('emphasis') };
  },
});

/** Real italic: `_text_`, slanted synthetically because Heebo ships no italic. */
export const Italic = Mark.create({
  name: 'italic',
  parseHTML: () => [{ tag: 'i' }],
  renderHTML: ({ HTMLAttributes }) => ['i', mergeAttributes(HTMLAttributes), 0],
  addKeyboardShortcuts() {
    return { 'Mod-i': () => this.editor.commands.toggleMark('italic') };
  },
});

/** A body image. An atom: its content is its props, edited in the node view. */
export const SoftImageNode = Node.create({
  name: 'softImage',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes: () => ({
    id: { default: '' },
    aspect: { default: '4/3' },
    float: { default: undefined },
    width: { default: undefined },
    stack: { default: undefined },
  }),
  parseHTML: () => [{ tag: 'div[data-soft-image]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-soft-image': '' })],
});

/** The frame's contents in its place, the first of them taking over the frame's gap. */
export function unwrapFrame(tr: Transaction, pos: number): boolean {
  const frame = tr.doc.nodeAt(pos);
  if (frame?.type.name !== 'framedSection') return false;
  tr.replaceWith(pos, pos + frame.nodeSize, frame.content);
  tr.setNodeAttribute(pos, 'gap', frame.attrs.gap);
  return true;
}

/**
 * Takes away the frame the selection is in, or else frames the blocks of the
 * body it touches - the whole list, when it starts inside one. `apply` false
 * only asks whether it could.
 */
export function toggleFrame(tr: Transaction, type: NodeType, apply: boolean): boolean {
  const { $from, $to } = tr.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type === type) return apply ? unwrapFrame(tr, $from.before(depth)) : true;
  }
  const range = $from.blockRange($to, (node) => node.type === tr.doc.type);
  const wrapping = range && findWrapping(range, type);
  if (!range || !wrapping) return false;
  if (apply) {
    // The blank lines before the first block now come before the frame.
    const first = range.parent.child(range.startIndex);
    tr.wrap(range, [{ type, attrs: { gap: first.attrs.gap } }, ...wrapping.slice(1)]);
    tr.setNodeAttribute(range.start + 1, 'gap', null);
  }
  return true;
}

/**
 * Whether Enter should make one more empty line here rather than the
 * editor's default, which lifts an empty line out of its frame and so cuts the
 * frame in two around it. An empty line is space inside a frame as anywhere
 * in the body; only on the frame's last line does Enter step out of it - and
 * never from its only line, which would take the frame with it.
 */
export function enterKeepsInFrame(selection: Selection, type: NodeType): boolean {
  const { $from, empty } = selection;
  if (!empty || $from.depth !== 2 || $from.parent.content.size) return false;
  const frame = $from.node(1);
  return frame.type === type && (frame.childCount === 1 || $from.index(1) < frame.childCount - 1);
}

/**
 * A framed section (lib/frame.ts): blocks of the body, wrapped. Its props are
 * edited in the node view; what it holds is edited like the rest of the body.
 */
export const FramedSectionNode = Node.create({
  name: 'framedSection',
  // Not 'block', which list items and a frame may hold: the body itself is
  // the only place mdx-edit.ts reads a frame back from.
  group: 'frame',
  content: 'block+',
  defining: true,
  addAttributes: () => ({
    tone: { default: undefined },
    width: { default: undefined },
    align: { default: undefined },
  }),
  parseHTML: () => [{ tag: 'section[data-framed-section]' }],
  renderHTML: ({ HTMLAttributes }) => ['section', mergeAttributes(HTMLAttributes, { 'data-framed-section': '' }), 0],

  addCommands() {
    return {
      toggleFramedSection:
        () =>
        ({ tr, dispatch }) =>
          toggleFrame(tr, this.type, Boolean(dispatch)),
      unwrapFramedSection:
        (pos) =>
        ({ tr, dispatch }) =>
          dispatch ? unwrapFrame(tr, pos) : tr.doc.nodeAt(pos)?.type === this.type,
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => enterKeepsInFrame(editor.state.selection, this.type) && editor.commands.splitBlock(),
    };
  },
});

/**
 * Anything in the body the editor does not model - a `{/* PLACEHOLDER *\/}`
 * marker, an unfamiliar component. Kept byte-for-byte and shown as read-only,
 * so it can be moved or removed but never rewritten by accident.
 */
export const RawBlock = Node.create({
  name: 'rawBlock',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-raw-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-raw-block': '' })],
});

export const RawInline = Node.create({
  name: 'rawInline',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes: () => ({ source: { default: '' } }),
  parseHTML: () => [{ tag: 'span[data-raw-inline]' }],
  renderHTML: ({ HTMLAttributes, node }) => [
    'span',
    mergeAttributes(HTMLAttributes, { 'data-raw-inline': '', class: 'opaque' }),
    String(node.attrs.source ?? ''),
  ],
});

/**
 * The blank lines before each top-level block, carried through editing.
 * Several files separate sections with more than one blank line, and with
 * `remark-breaks` on that is visible spacing, not formatting noise.
 *
 * `trailing` is the same thing at the end of the file, and it has to be
 * declared: only attributes an extension names survive `getJSON`, and one file
 * ends without a newline, so guessing costs it a byte on its first save.
 */
const whitespace = { default: null, renderHTML: () => ({}), parseHTML: () => null };

const GapAttribute = Extension.create({
  name: 'gap',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'softImage', 'framedSection', 'rawBlock'],
        attributes: { gap: whitespace },
      },
      // A frame's is the space just inside its closing tag.
      { types: ['doc', 'framedSection'], attributes: { trailing: whitespace } },
    ];
  },
});

export const extensions = [
  Kit.configure({
    heading: { levels: [2, 3] },
    // Off because the site has no styles for them (AGENTS.md §13).
    blockquote: false,
    codeBlock: false,
    code: false,
    strike: false,
    horizontalRule: false,
    underline: false,
    // Replaced by the two marks above.
    italic: false,
    link: {
      // A click places the caret, as it does on any other word she edits.
      openOnClick: false,
      // Also what makes the mark non-inclusive, so the words she types after
      // a link are not swallowed into it. A typed address needs no mark: the
      // site's GFM links a bare one anyway.
      autolink: false,
      defaultProtocol: 'https',
      isAllowedUri: isLinkable,
      // The site decides where a link opens (scripts/rehype-links.mjs).
      HTMLAttributes: { target: null, rel: null, class: null },
    },
  }),
  Emphasis,
  Italic,
  SoftImageNode,
  FramedSectionNode,
  RawBlock,
  RawInline,
  GapAttribute,
];
