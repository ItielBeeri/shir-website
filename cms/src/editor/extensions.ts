/**
 * The editor's vocabulary, and nothing else.
 *
 * AGENTS.md §13: the editor may only offer constructs `.prose` styles - h2, h3,
 * `ul`, `ol`, the three emphasis marks and `SoftImage`. Everything StarterKit
 * would otherwise hand us (blockquote, code, strike, rules, h1, h4-h6) is
 * turned off here rather than merely hidden from the toolbar, so a paste or a
 * keyboard shortcut cannot introduce it either.
 *
 * Markdown gives `*x*` and `_x_` the same node; the site spends them
 * differently (§4.3), so they are two marks with two tags: `em` carries
 * Hebrew emphasis-by-weight, `i` carries real italic.
 */
import { Extension, Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

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
    floatWidth: { default: undefined },
  }),
  parseHTML: () => [{ tag: 'div[data-soft-image]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-soft-image': '' })],
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
        types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'softImage', 'rawBlock'],
        attributes: { gap: whitespace },
      },
      { types: ['doc'], attributes: { trailing: whitespace } },
    ];
  },
});

export const extensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    // Off because the site has no styles for them (AGENTS.md §13).
    blockquote: false,
    codeBlock: false,
    code: false,
    strike: false,
    horizontalRule: false,
    // Replaced by the two marks above.
    italic: false,
  }),
  Emphasis,
  Italic,
  SoftImageNode,
  RawBlock,
  RawInline,
  GapAttribute,
];
