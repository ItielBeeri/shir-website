/**
 * Adding a video: the button, the review, and the two fields that say what it
 * is to someone who cannot see or hear it - ImageUpload's counterpart.
 *
 * The title is required, as a picture's description is: it is what a screen
 * reader announces on the play button. The description is asked for rather
 * than demanded, because what to write depends on the video, and the help
 * text says what it is for instead.
 */
import { useState } from 'react';
import { FriendlyError } from '../api';
import { useStore } from '../store';
import { formatBytes } from '../lib/images';
import {
  clock,
  eraseRecordedPlace,
  readVideo,
  uploadInPieces,
  videoExtension,
  videoIdFor,
  videoPathFor,
  whyVideoRejected,
} from '../lib/videos';
import { todayInIsrael } from '../lib/today';

export interface ChosenVideo {
  /** The bytes that will be committed: the file, its recorded place erased. */
  bytes: Uint8Array;
  /** Object URL of those bytes, for the review and until the site rebuilds. */
  previewUrl: string;
  extension: string;
  /** Latin, unique, and never shown: both the id and the file name. */
  id: string;
  /** Null where this browser cannot read the video itself - an iPhone's HEVC on Chrome. */
  meta: { width: number; height: number; duration: number } | null;
}

/** Reads a chosen file into what the review and the upload need. */
export async function chooseVideo(file: File, taken: ReadonlySet<string>): Promise<ChosenVideo> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  eraseRecordedPlace(bytes);
  const previewUrl = URL.createObjectURL(new Blob([bytes], { type: file.type || 'video/mp4' }));
  return {
    bytes,
    previewUrl,
    extension: videoExtension(file) ?? 'mp4',
    id: videoIdFor(file.name, taken),
    meta: await readVideo(previewUrl).catch(() => null),
  };
}

/** A file input that looks like a button and hands back a video ready to review. */
export function VideoUploadButton({
  label,
  className = 'upload-button',
  onChosen,
  onFailed,
}: {
  label: string;
  className?: string;
  onChosen: (chosen: ChosenVideo) => void;
  onFailed: (message: string) => void;
}): JSX.Element {
  const store = useStore();
  const [reading, setReading] = useState(false);

  return (
    <label className={className} aria-busy={reading}>
      <input
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm"
        disabled={reading}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          // Cleared so that choosing the same file again still counts as a change.
          e.target.value = '';
          if (!file) return;
          const rejected = whyVideoRejected(file);
          if (rejected) {
            onFailed(rejected);
            return;
          }
          setReading(true);
          try {
            onChosen(await chooseVideo(file, new Set(store.videos.map((v) => v.id))));
          } catch {
            onFailed('לא הצלחתי לקרוא את הקובץ. אפשר לנסות סרטון אחר.');
          } finally {
            setReading(false);
          }
        }}
      />
      <span>{reading ? 'קוראת את הסרטון…' : label}</span>
    </label>
  );
}

/** The name and the description, shared by the upload and the details dialog. */
export function VideoFields({
  id,
  title,
  description,
  onTitle,
  onDescription,
}: {
  id: string;
  title: string;
  description: string;
  onTitle: (title: string) => void;
  onDescription: (description: string) => void;
}): JSX.Element {
  return (
    <>
      <div className="field">
        <label htmlFor={`${id}-title`}>שם הסרטון</label>
        <p className="help">
          כמה מילים. זה מה שתוכנת הקראה אומרת על כפתור ההפעלה.
        </p>
        <input
          id={`${id}-title`}
          type="text"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="למשל: סשן פתיחת קול דרך מגע"
        />
      </div>
      <div className="field">
        <label htmlFor={`${id}-description`}>מה רואים ושומעים בסרטון?</label>
        <p className="help">
          מופיע מתחת לסרטון, בשביל מי שאינה יכולה לראות או לשמוע אותו. כדאי לכתוב כאן גם כל כיתוב
          שמופיע על המסך, ומה אומרים או שרים.
        </p>
        <textarea
          id={`${id}-description`}
          rows={4}
          value={description}
          onChange={(e) => onDescription(e.target.value)}
        />
      </div>
    </>
  );
}

/** The review before the commit: what it is, what it is called, and the upload. */
export function VideoUploadPanel({
  chosen,
  confirmLabel,
  onUploaded,
  onCancel,
}: {
  chosen: ChosenVideo;
  confirmLabel: string;
  onUploaded: (id: string) => void;
  onCancel: () => void;
}): JSX.Element {
  const store = useStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setError(null);
    setProgress(0);
    try {
      const chunks = await uploadInPieces(chosen.bytes, (sent, total) => setProgress(sent / total));
      onUploaded(
        await store.addVideo({
          id: chosen.id,
          path: videoPathFor(chosen.id, chosen.extension),
          chunks,
          title: title.trim(),
          description: description.trim(),
          date: todayInIsrael(),
          previewUrl: chosen.previewUrl,
        }),
      );
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי להעלות את הסרטון.');
    } finally {
      setProgress(null);
    }
  }

  const busy = progress !== null;
  const missing = !title.trim();

  return (
    <div className="upload-review">
      {chosen.meta ? (
        <video className="upload-preview" src={chosen.previewUrl} controls playsInline preload="metadata" />
      ) : (
        <p className="banner">
          הדפדפן הזה לא מציג את הסרטון, כנראה בגלל הפורמט שבו הטלפון צילם אותו. זה בסדר: אחרי הפרסום
          האתר מכין ממנו גרסה שכל דפדפן מציג.
        </p>
      )}
      <p className="muted">
        {/* Isolated, or the Hebrew around them reorders "5.7 MB" into "MB 5.7". */}
        {chosen.meta && (
          <>
            <bdi>{clock(chosen.meta.duration)}</bdi> ·{' '}
          </>
        )}
        <bdi>{formatBytes(chosen.bytes.length)}</bdi> · אחרי הפרסום האתר יכין ממנו גרסה קלה לצפייה
      </p>

      <VideoFields
        id="video-upload"
        title={title}
        description={description}
        onTitle={setTitle}
        onDescription={setDescription}
      />

      {error && <p className="banner error" role="alert">{error}</p>}

      {busy && (
        <p className="upload-progress" role="status">
          <progress max={1} value={progress ?? 0} />
          <span>מעלה… {Math.round((progress ?? 0) * 100)}%</span>
        </p>
      )}

      <div className="modal-actions">
        <button className="primary" onClick={confirm} disabled={busy || missing}>
          {busy ? 'מעלה…' : confirmLabel}
        </button>
        <button className="ghost" onClick={onCancel} disabled={busy}>
          ביטול
        </button>
      </div>
      {missing && <p className="invalid">צריך לתת לסרטון שם.</p>}
    </div>
  );
}
