/**
 * The body of a page or post, as one document.
 *
 * One editor rather than a card per block, because undo that stops at a block
 * boundary is not undo. Everything the toolbar offers is something `.prose`
 * styles; the schema in ../editor/extensions.ts is what actually enforces that.
 */
import {
  EditorContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  useEditor,
  useEditorState,
} from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { extensions, RawBlock, RawInline, SoftImageNode } from '../editor/extensions';
import { ImagePicker } from './ImagePicker';
import { LinkDialog } from './LinkDialog';
import { ASPECTS, DEFAULT_WIDTH, PLACEMENTS, place, placementOf } from '../lib/softimage';
import { useStore } from '../store';
import { useEffect, useId, useState } from 'react';
import type { PmNode } from '../content/pm-convert';

/* --------------------------------- node views -------------------------------- */

/** Narrower than this is a thumbnail, not a picture in the text. */
const MIN_WIDTH = 100;

/**
 * The field holds what she is typing and the node only a width worth
 * rendering: mid-way through "360" it reads "3", and applying that would
 * shrink the picture to a speck on every keystroke.
 */
function WidthField({ value, onChange }: { value: string; onChange: (width: string) => void }): JSX.Element {
  const id = useId();
  const [typed, setTyped] = useState(value);
  // Undo moves the node without passing through this field.
  useEffect(() => setTyped(value), [value]);
  return (
    <div className="nv-width">
      <label htmlFor={id}>רוחב בפיקסלים</label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={MIN_WIDTH}
        step={10}
        dir="ltr"
        value={typed}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          setTyped(e.target.value);
          if (/^\d+$/.test(e.target.value) && Number(e.target.value) >= MIN_WIDTH) onChange(e.target.value);
        }}
        onBlur={() => setTyped(value)}
      />
      <span id={`${id}-hint`} className="muted">
        360 זה בערך שליש מרוחב הטקסט.
      </span>
    </div>
  );
}

function SoftImageView({ node, updateAttributes, deleteNode }: any): JSX.Element {
  const store = useStore();
  const [picking, setPicking] = useState(false);
  const url = store.urlFor(node.attrs.id, 80);
  const alt = store.gallery.find((g) => g.id === node.attrs.id)?.alt;
  const placement = placementOf(node.attrs);

  return (
    <NodeViewWrapper className="nv-image">
      <div className="nv-head">
        <span className="muted">תמונה בתוך הטקסט</span>
        <button className="ghost danger" onClick={deleteNode} aria-label="הסרת התמונה">✕</button>
      </div>

      <button className="image-field" onClick={() => setPicking(true)}>
        {url ? <img src={url} alt="" /> : <span className="image-empty">אין תמונה</span>}
        <span className="image-field-text">
          <span>{alt || 'תמונה'}</span>
          <span className="muted">להחלפה, לחצי כאן</span>
        </span>
      </button>

      <div className="nv-controls">
        <div className="chips">
          {ASPECTS.map((a) => (
            <button
              key={a.value}
              className={node.attrs.aspect === a.value ? 'chip is-on' : 'chip'}
              onClick={() => updateAttributes({ aspect: a.value })}
            >
              {a.label}
            </button>
          ))}
        </div>
        <div className="chips">
          {PLACEMENTS.map((p) => (
            <button
              key={p.value}
              className={placement === p.value ? 'chip is-on' : 'chip'}
              onClick={() => updateAttributes(place(p.value, node.attrs.width))}
            >
              {p.label}
            </button>
          ))}
        </div>
        {placement !== 'full' && (
          <WidthField
            value={node.attrs.width || DEFAULT_WIDTH}
            onChange={(width) => updateAttributes({ width })}
          />
        )}
      </div>

      {picking && (
        <ImagePicker
          value={node.attrs.id}
          onPick={(id) => updateAttributes({ id })}
          onClose={() => setPicking(false)}
        />
      )}
    </NodeViewWrapper>
  );
}

/**
 * A marker the maintainer left in the copy - `{/* PLACEHOLDER: ... *\/}` - which
 * sits inside a paragraph and was rendering as the first words of it. She was
 * reading MDX syntax and taking it for her own sentence.
 */
function RawInlineView({ node }: any): JSX.Element {
  const source = String(node.attrs?.source ?? '');
  const name = /PLACEHOLDER:\s*([A-Z0-9_]+)/.exec(source)?.[1];
  return (
    <NodeViewWrapper as="span" className="nv-inline" title={source}>
      <span aria-hidden="true">📎</span>
      <span className="visually-hidden">{name ? `סימון פנימי ${name}` : 'סימון פנימי'}</span>
    </NodeViewWrapper>
  );
}

function RawBlockView({ node }: any): JSX.Element {
  return (
    <NodeViewWrapper className="nv-raw">
      <span className="muted">קטע מיוחד שנשמר כמו שהוא</span>
      <code>{node.attrs.source}</code>
    </NodeViewWrapper>
  );
}

const hasView = new Set(['softImage', 'rawBlock', 'rawInline']);

const withViews = [
  ...extensions.filter((e) => !hasView.has(e.name)),
  SoftImageNode.extend({ addNodeView: () => ReactNodeViewRenderer(SoftImageView) }),
  RawBlock.extend({ addNodeView: () => ReactNodeViewRenderer(RawBlockView) }),
  RawInline.extend({
    addNodeView: () => ReactNodeViewRenderer(RawInlineView, { as: 'span' }),
  }),
];

/* ---------------------------------- toolbar ---------------------------------- */

function Toolbar({ editor, onLink }: { editor: Editor; onLink: () => void }): JSX.Element {
  const [picking, setPicking] = useState(false);

  /**
   * The toolbar reports where the caret is, not what was last pressed.
   * `useEditor` deliberately does not re-render on a transaction, so reading
   * `isActive` straight from the editor lights a button when it is clicked and
   * leaves it lit everywhere after - and never lights it when she simply moves
   * into text that is already bold. This subscribes to the parts read here.
   */
  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      emphasis: e.isActive('emphasis'),
      italic: e.isActive('italic'),
      bold: e.isActive('bold'),
      link: e.isActive('link'),
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });

  const toggle = (active: boolean): Record<string, unknown> => ({
    className: active ? 'is-on' : '',
    'aria-pressed': active,
  });

  return (
    <div className="editor-tools" role="toolbar" aria-label="עיצוב טקסט">
      <button {...toggle(on.emphasis)} onClick={() => editor.chain().focus().toggleMark('emphasis').run()}>
        <em>הדגשה</em>
      </button>
      <button {...toggle(on.italic)} onClick={() => editor.chain().focus().toggleMark('italic').run()}>
        <i>נטוי</i>
      </button>
      <button {...toggle(on.bold)} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>מודגש</b>
      </button>
      <button {...toggle(on.link)} onClick={onLink} aria-haspopup="dialog">
        קישור
      </button>

      <span className="tools-sep" aria-hidden="true" />

      <button {...toggle(on.h2)} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
        כותרת
      </button>
      <button {...toggle(on.h3)} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
        כותרת משנה
      </button>
      <button {...toggle(on.bullet)} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        רשימה
      </button>
      <button {...toggle(on.ordered)} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        ממוספרת
      </button>
      <button onClick={() => setPicking(true)}>תמונה</button>

      <span className="tools-sep" aria-hidden="true" />

      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!on.canUndo}
        aria-label="ביטול הפעולה האחרונה"
      >
        ↶ ביטול
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!on.canRedo}
        aria-label="ביצוע מחדש"
      >
        ↷
      </button>

      {picking && (
        <ImagePicker
          onPick={(id) =>
            editor.chain().focus().insertContent({ type: 'softImage', attrs: { id, aspect: '4/3' } }).run()
          }
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/* ---------------------------------- editor ----------------------------------- */

interface Props {
  /** ProseMirror document produced by docToPm. */
  value: PmNode;
  onChange: (doc: PmNode) => void;
}

/**
 * The document is the editor's starting content and is never pushed in again:
 * a `setContent` is a transaction, so it becomes the first thing undo undoes,
 * and the button offers to take back an edit she never made. The caller opens
 * a different file by giving this a new `key`, which is also what a fresh undo
 * history for that file means.
 */
export function BodyEditor({ value, onChange }: Props): JSX.Element {
  const [linking, setLinking] = useState(false);
  const editor = useEditor(
    {
      extensions: withViews,
      content: value as never,
      editorProps: {
        attributes: { class: 'prose-edit', dir: 'rtl', 'aria-label': 'גוף הטקסט' },
        // By the key's place rather than its letter: on a Hebrew layout Ctrl+K
        // reports `ל`.
        handleKeyDown: (_view, event) => {
          if (!(event.ctrlKey || event.metaKey) || event.code !== 'KeyK') return false;
          event.preventDefault();
          setLinking(true);
          return true;
        },
      },
      onUpdate: ({ editor: e }) => onChange(e.getJSON() as PmNode),
    },
    [],
  );

  if (!editor) return <p className="muted">רגע…</p>;

  return (
    <div className="editor">
      <Toolbar editor={editor} onLink={() => setLinking(true)} />
      {/* What is not visible by looking at it: both keys make a line, and only
          the spacing tells them apart - and an empty line is space she can add. */}
      <p className="editor-help">
        המקש <kbd dir="ltr">Enter</kbd> מתחיל פסקה חדשה, עם רווח בין הפסקאות.{' '}
        <kbd dir="ltr">Shift + Enter</kbd> יורד שורה בתוך אותה פסקה, בלי רווח.{' '}
        כל שורה ריקה בין פסקאות מוסיפה עוד רווח.
      </p>
      <EditorContent editor={editor} />
      {linking && <LinkDialog editor={editor} onClose={() => setLinking(false)} />}
    </div>
  );
}
