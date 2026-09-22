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
import { FriendlyError } from '../api';
import { fileNameFor, formatBytes, imagePathFor, processImage } from '../lib/images';
import type { ProcessedImage } from '../lib/images';

interface Props {
  value?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function ImagePicker({ value, onPick, onClose }: Props): JSX.Element {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [uploading, setUploading] = useState<ProcessedImage | null>(null);
  const [fileName, setFileName] = useState('');
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [busy, setBusy] = useState(false);
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

  async function onFile(file: File): Promise<void> {
    setError(null);
    try {
      const processed = await processImage(file);
      setUploading(processed);
      setFileName(fileNameFor(file.name, new Set(store.gallery.map((g) => g.id))));
      setAlt('');
      setDecorative(false);
    } catch {
      setError('לא הצלחתי לקרוא את הקובץ. אפשר לנסות תמונה אחרת.');
    }
  }

  async function confirmUpload(): Promise<void> {
    if (!uploading) return;
    setBusy(true);
    setError(null);
    try {
      const id = await store.addImage({
        fileName,
        path: imagePathFor(fileName),
        base64: uploading.base64,
        alt: decorative ? '' : alt.trim(),
        previewUrl: uploading.previewUrl,
      });
      onPick(id);
      onClose();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי להעלות את התמונה.');
    } finally {
      setBusy(false);
    }
  }

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

        {error && <p className="banner error">{error}</p>}

        {uploading ? (
          <div className="upload-review">
            <img src={uploading.previewUrl} alt="" className="upload-preview" />
            <p className="muted">
              {uploading.width}×{uploading.height} · הוקטנה מ־{formatBytes(uploading.originalBytes)} ל־
              {formatBytes(uploading.bytes)}
            </p>

            <div className="field">
              <label htmlFor="pick-alt">מה רואים בתמונה?</label>
              <p className="help">
                המשפט הזה נקרא בקול למי שגולשת עם תוכנת הקראה, ומוצג אם התמונה לא נטענת.
              </p>
              <input
                id="pick-alt"
                type="text"
                value={alt}
                disabled={decorative}
                onChange={(e) => setAlt(e.target.value)}
                placeholder="למשל: שיר אמיתי מטפלת במגע"
              />
            </div>

            <div className="switch">
              <input
                id="pick-decorative"
                type="checkbox"
                checked={decorative}
                onChange={(e) => setDecorative(e.target.checked)}
              />
              <label htmlFor="pick-decorative">זו תמונת קישוט בלבד, אין בה מידע</label>
            </div>

            <div className="modal-actions">
              <button
                className="primary"
                onClick={confirmUpload}
                disabled={busy || (!decorative && !alt.trim())}
              >
                {busy ? 'מעלה…' : 'הוספה ובחירה'}
              </button>
              <button className="ghost" onClick={() => setUploading(null)} disabled={busy}>
                ביטול
              </button>
            </div>
            {!decorative && !alt.trim() && (
              <p className="invalid">צריך לכתוב מה רואים בתמונה, או לסמן שהיא קישוט בלבד.</p>
            )}
          </div>
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
              <label className="upload-button">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])}
                />
                <span>העלאת תמונה חדשה</span>
              </label>
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
