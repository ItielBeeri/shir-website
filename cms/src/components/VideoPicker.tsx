/**
 * Choosing a video, anywhere one is chosen - ImagePicker's counterpart, and
 * the same promise: she picks by looking, and can add one without leaving.
 */
import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { VideoUploadButton, VideoUploadPanel } from './VideoUpload';
import type { ChosenVideo } from './VideoUpload';

/**
 * What a video looks like at a glance: its poster once the site has built one,
 * and until then the video's own frame at the chosen moment.
 */
export function VideoThumb({ id, width, className }: { id: string; width: number; className?: string }): JSX.Element {
  const store = useStore();
  const entry = store.videos.find((v) => v.id === id);
  const poster = store.videoPosterFor(id, width);
  const src = store.videoUrlFor(id);

  if (poster) return <img src={poster} alt="" loading="lazy" className={className} />;
  if (!entry || !src) return <span className="image-empty">אין סרטון</span>;
  return (
    <video
      className={className}
      src={`${src}#t=${entry.posterTime ?? 0.5}`}
      preload="metadata"
      muted
      playsInline
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

interface Props {
  value?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}

export function VideoPicker({ value, onPick, onClose }: Props): JSX.Element {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<ChosenVideo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !chosen && onClose();
    document.addEventListener('keydown', onKey);
    dialog.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, chosen]);

  const matches = store.videos.filter((video) => !query.trim() || video.title.includes(query.trim()));

  return (
    <div className="modal-backdrop" onClick={() => !chosen && onClose()}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="בחירת סרטון"
        tabIndex={-1}
        ref={dialog}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>בחירת סרטון</h2>
          <button className="ghost" onClick={onClose} aria-label="סגירה">✕</button>
        </div>

        {error && <p className="banner error" role="alert">{error}</p>}

        {chosen ? (
          <VideoUploadPanel
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
                placeholder="חיפוש לפי השם"
                aria-label="חיפוש סרטון"
              />
              <VideoUploadButton
                label="העלאת סרטון חדש"
                onChosen={(next) => {
                  setError(null);
                  setChosen(next);
                }}
                onFailed={setError}
              />
            </div>

            {matches.length === 0 ? (
              <p className="muted">
                {store.videos.length ? 'לא נמצא סרטון מתאים.' : 'עדיין אין סרטונים. אפשר להעלות את הראשון.'}
              </p>
            ) : (
              <ul className="thumbs">
                {matches.map((video) => (
                  <li key={video.id}>
                    <button
                      className={`thumb${value === video.id ? ' is-chosen' : ''}`}
                      onClick={() => {
                        onPick(video.id);
                        onClose();
                      }}
                      aria-pressed={value === video.id}
                    >
                      <VideoThumb id={video.id} width={160} />
                      <span>{video.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
