/**
 * The body of a page or post, as one document.
 *
 * One editor rather than a card per block, because undo that stops at a block
 * boundary is not undo. Everything the toolbar offers is something `.prose`
 * styles; the schema in ../editor/extensions.ts is what actually enforces that.
 */
import { useEffect } from 'react';
import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { extensions, RawBlock, SoftImageNode } from '../editor/extensions';
import { ImagePicker } from './ImagePicker';
import { ASPECTS, FLOATS } from '../lib/softimage';
import { useStore } from '../store';
import { useState } from 'react';
import type { PmNode } from '../content/pm-convert';

/* --------------------------------- node views -------------------------------- */

function SoftImageView({ node, updateAttributes, deleteNode }: any): JSX.Element {
  const store = useStore();
  const [picking, setPicking] = useState(false);
  const url = store.urlFor(node.attrs.id);
  const alt = store.gallery.find((g) => g.id === node.attrs.id)?.alt;

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
          {FLOATS.map((f) => (
            <button
              key={f.value}
              className={(node.attrs.float ?? '') === f.value ? 'chip is-on' : 'chip'}
              onClick={() =>
                updateAttributes({
                  float: f.value || undefined,
                  floatWidth: f.value ? node.attrs.floatWidth || '360' : undefined,
                })
              }
            >
              {f.label}
            </button>
          ))}
        </div>
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

function RawBlockView({ node }: any): JSX.Element {
  return (
    <NodeViewWrapper className="nv-raw">
      <span className="muted">קטע מיוחד שנשמר כמו שהוא</span>
      <code>{node.attrs.source}</code>
    </NodeViewWrapper>
  );
}

const withViews = [
  ...extensions.filter((e) => e.name !== 'softImage' && e.name !== 'rawBlock'),
  SoftImageNode.extend({ addNodeView: () => ReactNodeViewRenderer(SoftImageView) }),
  RawBlock.extend({ addNodeView: () => ReactNodeViewRenderer(RawBlockView) }),
];

/* ---------------------------------- toolbar ---------------------------------- */

function Toolbar({ editor }: { editor: Editor }): JSX.Element {
  const [picking, setPicking] = useState(false);
  const mark = (name: string) => (editor.isActive(name) ? 'is-on' : '');
  const block = (name: string, attrs?: Record<string, unknown>) =>
    editor.isActive(name, attrs) ? 'is-on' : '';

  return (
    <div className="editor-tools" role="toolbar" aria-label="עיצוב טקסט">
      <button className={mark('emphasis')} onClick={() => editor.chain().focus().toggleMark('emphasis').run()}>
        <em>הדגשה</em>
      </button>
      <button className={mark('italic')} onClick={() => editor.chain().focus().toggleMark('italic').run()}>
        <i>נטוי</i>
      </button>
      <button className={mark('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <b>מודגש</b>
      </button>

      <span className="tools-sep" aria-hidden="true" />

      <button
        className={block('heading', { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        כותרת
      </button>
      <button
        className={block('heading', { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        כותרת משנה
      </button>
      <button className={block('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        רשימה
      </button>
      <button className={block('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        ממוספרת
      </button>
      <button onClick={() => setPicking(true)}>תמונה</button>

      <span className="tools-sep" aria-hidden="true" />

      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        aria-label="ביטול הפעולה האחרונה"
      >
        ↶ ביטול
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
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

export function BodyEditor({ value, onChange }: Props): JSX.Element {
  const editor = useEditor(
    {
      extensions: withViews,
      content: value as never,
      editorProps: {
        attributes: { class: 'prose-edit', dir: 'rtl', 'aria-label': 'גוף הטקסט' },
      },
      onUpdate: ({ editor: e }) => onChange(e.getJSON() as PmNode),
    },
    [],
  );

  // Replace the document only when a different file is opened; setting content
  // on every keystroke would reset the caret and wipe the undo history.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(value as never, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) return <p className="muted">רגע…</p>;

  return (
    <div className="editor">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}
