/**
 * Choosing an image, anywhere one is chosen.
 *
 * The owner picks by looking, never by id, and can add a photo without leaving
 * the form she is in - the two-step "upload, then register it" flow from the
 * editor guide is the single biggest source of broken pages, and it exists
 * only because uploading and registering were different places.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { UploadButton, UploadPanel } from './ImageUpload';
import type { Chosen } from './ImageUpload';

interface Props {
  value?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function ImagePicker({ value, onPick, onClose }: Props): JSX.Element {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialog.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const matches = store.gallery.filter(
    (image) => !query.trim() || image.alt.includes(query.trim()),
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="בחירת תמונה"
        tabIndex={-1}
        ref={dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>בחירת תמונה</h2>
          <button className="ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        {error && <p className="banner error" role="alert">{error}</p>}

        {chosen ? (
          <UploadPanel
            chosen={chosen}
            confirmLabel="הוספה ובחירה"
            onUploaded={(id) => {
              onPick(id);
              onClose();
            }}
            onCancel={() => setChosen(null)}
          />
        ) : (
          <>
            <div className="picker-tools">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="חיפוש לפי התיאור"
                aria-label="חיפוש תמונה"
              />
              <UploadButton
                label="העלאת תמונה חדשה"
                onChosen={setChosen}
                onFailed={setError}
              />
            </div>

            {matches.length === 0 ? (
              <p className="muted">לא נמצאה תמונה מתאימה.</p>
            ) : (
              <ul className="thumbs">
                {matches.map((image) => {
                  const url = store.urlFor(image.id);
                  return (
                    <li key={image.id}>
                      <button
                        className={`thumb${value === image.id ? ' is-chosen' : ''}`}
                        onClick={() => {
                          onPick(image.id);
                          onClose();
                        }}
                        aria-pressed={value === image.id}
                      >
                        {url && <img src={url} alt="" loading="lazy" />}
                        <span>{image.alt || 'תמונת קישוט'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The field itself: a thumbnail that opens the picker. */
export function ImageField({
  value,
  onChange,
  label,
  help,
  disabled,
}: {
  value: string | undefined;
  onChange: (id: string) => void;
  label: string;
  help?: string;
  disabled?: boolean;
}): JSX.Element {
  const store = useStore();
  const [open, setOpen] = useState(false);
  const url = value ? store.urlFor(value) : null;
  const chosen = store.gallery.find((g) => g.id === value);

  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {help && <p className="help">{help}</p>}
      <button className="image-field" onClick={() => setOpen(true)} disabled={disabled}>
        {url ? <img src={url} alt="" /> : <span className="image-empty">אין תמונה</span>}
        <span className="image-field-text">
          <span>{chosen?.alt || (value ? 'תמונה' : 'בחירת תמונה')}</span>
          <span className="muted">{value ? 'להחלפה, לחצי כאן' : 'מהגלריה או העלאה חדשה'}</span>
        </span>
      </button>
      {open && (
        <ImagePicker value={value} onPick={onChange} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
