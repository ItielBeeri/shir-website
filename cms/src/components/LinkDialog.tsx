/**
 * Adding, changing or removing the link at the caret.
 *
 * It works on the selection the editor had when it opened, which ProseMirror
 * keeps while focus is here. With nothing selected and no link under the
 * caret there are no words to link, so it asks for those too - otherwise the
 * link would be made of nothing and never reach the page.
 */
import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { checkHref } from '../lib/links';
import { useStore } from '../store';

interface Props {
  editor: Editor;
  onClose: () => void;
}

export function LinkDialog({ editor, onClose }: Props): JSX.Element {
  const store = useStore();
  const id = useId();
  const [start] = useState(() => ({
    href: String(editor.getAttributes('link').href ?? ''),
    empty: editor.state.selection.empty,
  }));
  const editing = start.href !== '';
  const needsWords = start.empty && !editing;
  const [address, setAddress] = useState(start.href);
  const [words, setWords] = useState('');
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLInputElement>(null);

  const close = (): void => {
    onClose();
    editor.commands.focus();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    first.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /** A caret inside a link means the whole link; a selection means just that. */
  const target = () => {
    const chain = editor.chain().focus();
    return start.empty ? chain.extendMarkRange('link') : chain;
  };

  const apply = (e: FormEvent): void => {
    e.preventDefault();
    const checked = checkHref(address, store.siteUrl);
    if ('error' in checked) {
      setError(checked.error);
      return;
    }
    if (needsWords) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'text',
          text: words.trim() || address.trim(),
          marks: [{ type: 'link', attrs: { href: checked.href } }],
        })
        .run();
    } else {
      target().setLink({ href: checked.href }).run();
    }
    onClose();
  };

  const remove = (): void => {
    target().unsetLink().run();
    onClose();
  };

  const checked = checkHref(address, store.siteUrl);
  const tryAt =
    'href' in checked && checked.href.startsWith('/') && store.siteUrl
      ? `${store.siteUrl.replace(/\/$/, '')}${checked.href}`
      : 'href' in checked && !checked.href.startsWith('/') && !checked.href.startsWith('#')
        ? checked.href
        : null;

  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal is-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id={`${id}-title`}>{editing ? 'עריכת קישור' : 'הוספת קישור'}</h2>
          <button type="button" className="ghost" onClick={close} aria-label="סגירה">✕</button>
        </div>

        <form onSubmit={apply} noValidate>
          {needsWords && (
            <div className="field">
              <label htmlFor={`${id}-words`}>הטקסט שיופיע</label>
              <p className="help" id={`${id}-words-help`}>
                אם משאירים ריק, תופיע הכתובת עצמה.
              </p>
              <input
                ref={first}
                id={`${id}-words`}
                type="text"
                value={words}
                aria-describedby={`${id}-words-help`}
                onChange={(e) => setWords(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label htmlFor={`${id}-href`}>לאן הקישור מוביל</label>
            <p className="help" id={`${id}-href-help`}>
              כתובת של אתר, אימייל או מספר טלפון. לעמוד באתר שלך אפשר להדביק את הכתובת שלו מהדפדפן.
            </p>
            <input
              ref={needsWords ? undefined : first}
              id={`${id}-href`}
              type="text"
              inputMode="url"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={address}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-href-help${error ? ` ${id}-error` : ''}`}
              onChange={(e) => {
                setAddress(e.target.value);
                setError(null);
              }}
            />
            {error && (
              <p className="field-error" id={`${id}-error`} role="alert">
                {error}
              </p>
            )}
            {tryAt && (
              <p className="help link-try">
                <a href={tryAt} target="_blank" rel="noopener noreferrer">
                  לבדיקה: פתיחת הקישור בכרטיסייה חדשה
                </a>
              </p>
            )}
          </div>

          <div className="modal-actions">
            <button type="submit" className="primary">
              {editing ? 'עדכון הקישור' : 'הוספת הקישור'}
            </button>
            {editing && (
              <button type="button" className="ghost danger" onClick={remove}>
                הסרת הקישור
              </button>
            )}
            <button type="button" className="ghost" onClick={close}>
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
