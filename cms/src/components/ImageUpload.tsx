/**
 * Adding a photo: the button, the review, and the two fields that decide how a
 * screen reader will announce it.
 *
 * Separate from ImagePicker because adding and choosing are different acts
 * that happen in different places - the gallery adds without choosing, a form
 * chooses and sometimes adds on the way. Both describe an image the same way,
 * and they do so by sharing these, not by saying it twice.
 */
import { useState } from 'react';
import { FriendlyError } from '../api';
import { useStore } from '../store';
import { fileNameFor, formatBytes, imagePathFor, processImage, whyImageFailed } from '../lib/images';
import type { ProcessedImage } from '../lib/images';

export interface Chosen {
  image: ProcessedImage;
  /** Latin, unique in the gallery, and never shown. */
  fileName: string;
}

/** A file input that looks like a button and hands back a shrunk image. */
export function UploadButton({
  label,
  className = 'upload-button',
  onChosen,
  onFailed,
}: {
  label: string;
  className?: string;
  onChosen: (chosen: Chosen) => void;
  onFailed: (message: string) => void;
}): JSX.Element {
  const store = useStore();

  return (
    <label className={className}>
      <input
        type="file"
        accept="image/*"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // Cleared so that choosing the same file again still counts as a
          // change; otherwise a second attempt after a cancel does nothing.
          e.target.value = '';
          if (!file) return;
          try {
            onChosen({
              image: await processImage(file),
              fileName: fileNameFor(file.name, new Set(store.gallery.map((g) => g.id))),
            });
          } catch {
            onFailed(whyImageFailed(file));
          }
        }}
      />
      <span>{label}</span>
    </label>
  );
}

/**
 * Alt text, or the declaration that there is nothing to say.
 *
 * An empty `alt` is what marks an image decorative (AGENTS.md §10), and it is
 * the one thing here that must not be reachable by leaving a box blank: a
 * forgotten description and a deliberate one look identical in the file, so
 * the difference is a switch she has to touch.
 */
export function AltFields({
  id,
  alt,
  decorative,
  onAlt,
  onDecorative,
}: {
  id: string;
  alt: string;
  decorative: boolean;
  onAlt: (alt: string) => void;
  onDecorative: (decorative: boolean) => void;
}): JSX.Element {
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-alt`}>מה רואים בתמונה?</label>
        <p className="help">
          המשפט הזה נקרא בקול למי שגולשת עם תוכנת הקראה, ומוצג אם התמונה לא נטענת.
        </p>
        <input
          id={`${id}-alt`}
          type="text"
          value={alt}
          disabled={decorative}
          onChange={(e) => onAlt(e.target.value)}
          placeholder="למשל: שיר אמיתי מטפלת במגע"
        />
      </div>

      <div className="switch">
        <input
          id={`${id}-decorative`}
          type="checkbox"
          checked={decorative}
          onChange={(e) => onDecorative(e.target.checked)}
        />
        <label htmlFor={`${id}-decorative`}>זו תמונת קישוט בלבד, אין בה מידע</label>
      </div>
    </>
  );
}

export const altMissing = (alt: string, decorative: boolean): boolean =>
  !decorative && !alt.trim();

/** The review before the commit: what it will look like, and what it is called. */
export function UploadPanel({
  chosen,
  confirmLabel,
  onUploaded,
  onCancel,
}: {
  chosen: Chosen;
  confirmLabel: string;
  onUploaded: (id: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const store = useStore();
  const [alt, setAlt] = useState('');
  const [decorative, setDecorative] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      onUploaded(
        await store.addImage({
          fileName: chosen.fileName,
          path: imagePathFor(chosen.fileName),
          base64: chosen.image.base64,
          alt: decorative ? '' : alt.trim(),
          previewUrl: chosen.image.previewUrl,
        }),
      );
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי להעלות את התמונה.');
    } finally {
      setBusy(false);
    }
  }

  const missing = altMissing(alt, decorative);

  return (
    <div className="upload-review">
      <img src={chosen.image.previewUrl} alt="" className="upload-preview" />
      <p className="muted">
        {chosen.image.width}×{chosen.image.height} · הוקטנה מ־
        {formatBytes(chosen.image.originalBytes)} ל־{formatBytes(chosen.image.bytes)}
      </p>

      <AltFields
        id="upload"
        alt={alt}
        decorative={decorative}
        onAlt={setAlt}
        onDecorative={setDecorative}
      />

      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="modal-actions">
        <button className="primary" onClick={confirm} disabled={busy || missing}>
          {busy ? 'מעלה…' : confirmLabel}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          ביטול
        </button>
      </div>
      {missing && (
        <p className="invalid">צריך לכתוב מה רואים בתמונה, או לסמן שהיא קישוט בלבד.</p>
      )}
    </div>
  );
}
