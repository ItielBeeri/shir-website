/**
 * The videos - the gallery's counterpart.
 *
 * Each card holds what a visitor who cannot see or hear the video gets in its
 * place: its name and its description, and captions when there is speech.
 * The poster is chosen by looking, as a picture is: she plays the video to the
 * moment she wants and takes it, or takes a photo from the gallery instead.
 *
 * Every action is one commit, the file and its entry together, for the reason
 * the gallery's are: two commits is how a page ends up naming a file that is
 * not there.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api, FriendlyError } from '../api';
import { useStore, VIDEOS_FILE } from '../store';
import { ImagePicker } from '../components/ImagePicker';
import { VideoThumb } from '../components/VideoPicker';
import { VideoFields, VideoUploadButton, VideoUploadPanel, chooseVideo } from '../components/VideoUpload';
import type { ChosenVideo } from '../components/VideoUpload';
import {
  captionsPathFor,
  clock,
  findVideoUsage,
  toWebVtt,
  uploadInPieces,
  videoIdFor,
  videoPathFor,
  whyVideoRejected,
} from '../lib/videos';
import type { VideoEntry } from '../lib/videos';
import { referencingFiles } from '../lib/references';
import { removeVideo, setEntryValue } from '../content/toml-struct';
import { todayInIsrael } from '../lib/today';

type Dialog =
  | { kind: 'add'; chosen: ChosenVideo }
  | { kind: 'details'; id: string; title: string; description: string }
  | { kind: 'poster'; id: string }
  | { kind: 'captions'; id: string }
  | { kind: 'usage'; id: string; found: Array<{ where: string; path: string }> | null };

/** The poster as she would describe it. */
function posterLabel(video: VideoEntry): string {
  if (video.poster) return 'תמונת השער: תמונה מהגלריה';
  if (typeof video.posterTime === 'number') return `תמונת השער: הרגע ${clock(video.posterTime)}`;
  return 'תמונת השער: נבחרת אוטומטית';
}

export function Videos(): JSX.Element {
  const store = useStore();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const find = (id: string): VideoEntry | undefined => store.videos.find((v) => v.id === id);

  /**
   * One commit: the entry's edits, plus whatever files ride along. Each key is
   * set or cleared where it stands, so the comments in the entry survive.
   */
  async function commit(
    message: string,
    id: string,
    edits: Array<[string, string | number | undefined]>,
    files: Parameters<typeof api.save>[1] = [],
    remove: string[] = [],
  ): Promise<void> {
    const { content } = await api.read(VIDEOS_FILE);
    if (content === null) throw new FriendlyError('לא הצלחתי לקרוא את רשימת הסרטונים.');
    let next = content;
    for (const [key, value] of edits) next = setEntryValue(next, id, key, value);
    await api.save(message, [...files, { path: VIDEOS_FILE, content: next }], remove);
    await store.refreshVideos();
    store.saved();
  }

  async function run(action: () => Promise<void>, done: string, failed: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
      setDialog(null);
      setNotice(done);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : failed);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const saveDetails = (id: string, title: string, description: string) =>
    run(
      () =>
        commit(`עדכון פרטי סרטון: ${title.trim()}`, id, [
          ['title', title.trim()],
          ['description', description.trim() || undefined],
        ]),
      'הפרטים נשמרו.',
      'לא הצלחתי לשמור.',
    );

  /** `moment` in seconds, `image` an image id; neither means automatic. */
  const savePoster = (id: string, choice: { moment?: number; image?: string }) =>
    run(
      () =>
        commit(`בחירת תמונת שער לסרטון: ${find(id)?.title ?? id}`, id, [
          ['poster', choice.image],
          ['poster_time', choice.moment === undefined ? undefined : Math.round(choice.moment * 10) / 10],
        ]),
      'תמונת השער נשמרה. באתר היא תתעדכן אחרי הפרסום.',
      'לא הצלחתי לשמור את תמונת השער.',
    );

  async function addCaptions(id: string, file: File): Promise<void> {
    const vtt = toWebVtt(await file.text());
    if (!vtt) {
      setError('הקובץ הזה לא נראה כמו קובץ כתוביות. צריך קובץ vtt או srt, עם זמנים לכל שורה.');
      return;
    }
    const path = captionsPathFor(id);
    await run(
      () =>
        commit(`הוספת כתוביות לסרטון: ${find(id)?.title ?? id}`, id, [['captions', path.replace(/^public/, '')]], [
          { path, content: vtt },
        ]),
      'הכתוביות נוספו.',
      'לא הצלחתי להוסיף את הכתוביות.',
    );
  }

  const removeCaptions = (video: VideoEntry) =>
    run(
      () =>
        commit(`הסרת כתוביות מהסרטון: ${video.title}`, video.id, [['captions', undefined]], [], [
          `public${video.captions}`,
        ]),
      'הכתוביות הוסרו.',
      'לא הצלחתי להסיר את הכתוביות.',
    );

  /**
   * The new video under a new file name, the old one removed in the same
   * commit. A new name rather than the old one overwritten, because the
   * raw-file host the editor previews from caches by address for minutes.
   */
  async function replace(video: VideoEntry, file: File): Promise<void> {
    const rejected = whyVideoRejected(file);
    if (rejected) {
      setError(rejected);
      return;
    }
    await run(
      async () => {
        const stems = new Set(store.videos.map((v) => v.file.replace(/^\/video\//, '').replace(/\.[^.]+$/, '')));
        const chosen = await chooseVideo(file, stems);
        const name = videoIdFor(video.id, stems);
        const path = videoPathFor(name, chosen.extension);
        const chunks = await uploadInPieces(chosen.bytes, (sent, total) => setProgress(sent / total));
        // The moment chosen in the old video means nothing in the new one.
        await commit(
          `החלפת סרטון: ${video.title}`,
          video.id,
          [
            ['file', path.replace(/^public/, '')],
            ['poster_time', undefined],
            ['date', todayInIsrael()],
          ],
          [{ path, chunks }],
          [`public${video.file}`],
        );
      },
      'הסרטון הוחלף בכל מקום שבו הוא מופיע.',
      'לא הצלחתי להחליף את הסרטון.',
    );
  }

  /** Never orphan a reference: check first, and say where it is used. */
  async function askDelete(id: string): Promise<void> {
    setError(null);
    setDialog({ kind: 'usage', id, found: null });
    try {
      setDialog({ kind: 'usage', id, found: findVideoUsage(id, await referencingFiles()) });
    } catch (e) {
      setDialog(null);
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לבדוק היכן הסרטון בשימוש.');
    }
  }

  const confirmDelete = (video: VideoEntry) =>
    run(
      async () => {
        const { content } = await api.read(VIDEOS_FILE);
        if (content === null) throw new FriendlyError('לא הצלחתי לקרוא את רשימת הסרטונים.');
        await api.save(
          `מחיקת סרטון: ${video.title}`,
          [{ path: VIDEOS_FILE, content: removeVideo(content, video.id) }],
          [`public${video.file}`, ...(video.captions ? [`public${video.captions}`] : [])],
        );
        await store.refreshVideos();
        store.saved();
      },
      'הסרטון נמחק.',
      'לא הצלחתי למחוק.',
    );

  const current = dialog && 'id' in dialog ? find(dialog.id) : undefined;

  return (
    <>
      {error && <p className="banner error" role="alert">{error}</p>}
      {notice && <p className="banner">{notice}</p>}
      {progress !== null && (
        <p className="upload-progress" role="status">
          <progress max={1} value={progress} />
          <span>מעלה… {Math.round(progress * 100)}%</span>
        </p>
      )}

      <VideoUploadButton
        label="+ העלאת סרטון חדש"
        className="primary wide as-button"
        onChosen={(chosen) => {
          setNotice(null);
          setDialog({ kind: 'add', chosen });
        }}
        onFailed={setError}
      />

      {store.videos.length === 0 && <p className="muted">עדיין אין סרטונים באתר.</p>}

      <ul className="gallery">
        {store.videos.map((video) => (
          <li key={video.id} className="gallery-card">
            <VideoThumb id={video.id} width={240} className="video-thumb" />
            <p className="gallery-alt">
              <b>{video.title}</b>
              <br />
              <span className="muted">
                {posterLabel(video)}
                {video.captions ? ' · עם כתוביות' : ''}
              </span>
            </p>
            {!video.description && (
              <p className="gallery-alt muted">אין עדיין תיאור של מה רואים ושומעים בסרטון.</p>
            )}

            <div className="gallery-actions">
              <button
                className="ghost"
                aria-label={`שם ותיאור של «${video.title}»`}
                onClick={() =>
                  setDialog({ kind: 'details', id: video.id, title: video.title, description: video.description ?? '' })
                }
              >
                שם ותיאור
              </button>
              <button
                className="ghost"
                aria-label={`תמונת השער של «${video.title}»`}
                onClick={() => setDialog({ kind: 'poster', id: video.id })}
              >
                תמונת שער
              </button>
              <button
                className="ghost"
                aria-label={`כתוביות ל«${video.title}»`}
                onClick={() => setDialog({ kind: 'captions', id: video.id })}
              >
                כתוביות
              </button>
              {/* The input is the control, so the name goes on it. */}
              <label className="ghost as-button">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm"
                  aria-label={`החלפת «${video.title}»`}
                  disabled={busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) void replace(video, file);
                  }}
                />
                <span>החלפת הסרטון</span>
              </label>
              <button
                className="ghost danger"
                aria-label={`מחיקת «${video.title}»`}
                onClick={() => askDelete(video.id)}
                disabled={busy}
              >
                מחיקה
              </button>
            </div>
          </li>
        ))}
      </ul>

      {dialog?.kind === 'add' && (
        <Modal label="סרטון חדש" onClose={() => setDialog(null)}>
          <VideoUploadPanel
            chosen={dialog.chosen}
            confirmLabel="הוספה לסרטונים"
            onUploaded={() => {
              setDialog(null);
              setNotice('הסרטון נוסף. באתר הוא יופיע במקום שבו תשבצי אותו בטקסט.');
            }}
            onCancel={() => setDialog(null)}
          />
        </Modal>
      )}

      {dialog?.kind === 'details' && current && (
        <Modal label="שם ותיאור" onClose={() => setDialog(null)}>
          <VideoFields
            id="video-details"
            title={dialog.title}
            description={dialog.description}
            onTitle={(title) => setDialog({ ...dialog, title })}
            onDescription={(description) => setDialog({ ...dialog, description })}
          />
          <div className="modal-actions">
            <button
              className="primary"
              onClick={() => saveDetails(dialog.id, dialog.title, dialog.description)}
              disabled={busy || !dialog.title.trim()}
            >
              {busy ? 'שומרת…' : 'שמירה'}
            </button>
            <button className="ghost" onClick={() => setDialog(null)} disabled={busy}>ביטול</button>
          </div>
          {!dialog.title.trim() && <p className="invalid">צריך לתת לסרטון שם.</p>}
        </Modal>
      )}

      {dialog?.kind === 'poster' && current && (
        <PosterDialog video={current} busy={busy} onSave={(choice) => savePoster(current.id, choice)} onClose={() => setDialog(null)} />
      )}

      {dialog?.kind === 'captions' && current && (
        <Modal label="כתוביות" onClose={() => setDialog(null)}>
          <p className="help">
            כתוביות הן מה שמי שאינה שומעת קוראת בזמן שהסרטון רץ - כל מה שנאמר בו, ובסוגריים גם צלילים
            חשובים, כמו [שירה]. הן מגיעות כקובץ vtt או srt, למשל מתוכנת עריכה או משירות תמלול.
          </p>
          <p>{current.captions ? 'לסרטון הזה יש כתוביות.' : 'לסרטון הזה אין עדיין כתוביות.'}</p>
          <div className="modal-actions">
            <label className="primary as-button">
              <input
                type="file"
                accept=".vtt,.srt,text/vtt"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) void addCaptions(current.id, file);
                }}
              />
              <span>{current.captions ? 'החלפת הכתוביות' : 'הוספת כתוביות'}</span>
            </label>
            {current.captions && (
              <button className="ghost danger" onClick={() => removeCaptions(current)} disabled={busy}>
                הסרת הכתוביות
              </button>
            )}
            <button className="ghost" onClick={() => setDialog(null)} disabled={busy}>סגירה</button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'usage' && current && (
        <Modal label="מחיקת סרטון" small onClose={() => setDialog(null)}>
          {dialog.found === null ? (
            <>
              <h2>רגע, בודקת</h2>
              <p className="muted">
                <span className="spinner" aria-hidden="true" />
                עוברת על כל העמודים כדי לוודא שאף אחד לא משתמש בסרטון הזה.
              </p>
            </>
          ) : dialog.found.length > 0 ? (
            <>
              <h2>אי אפשר למחוק</h2>
              <p>הסרטון הזה מופיע ב:</p>
              <ul className="usage">
                {dialog.found.map((u) => (
                  <li key={u.path}>{u.where}</li>
                ))}
              </ul>
              <p className="muted">כדי למחוק, צריך קודם להוריד אותו מכל מקום שמופיע כאן.</p>
              <div className="modal-actions">
                <button className="ghost" onClick={() => setDialog(null)}>הבנתי</button>
              </div>
            </>
          ) : (
            <>
              <h2>למחוק את הסרטון?</h2>
              <p className="muted">אף עמוד לא משתמש בו כרגע.</p>
              <div className="modal-actions">
                <button className="danger" onClick={() => confirmDelete(current)} disabled={busy}>
                  כן, למחוק
                </button>
                <button className="ghost" onClick={() => setDialog(null)}>ביטול</button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

function Modal({
  label,
  small,
  onClose,
  children,
}: {
  label: string;
  small?: boolean;
  onClose: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={small ? 'modal is-small' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        onClick={(e) => e.stopPropagation()}
      >
        {!small && (
          <div className="modal-head">
            <h2>{label}</h2>
            <button className="ghost" onClick={onClose} aria-label="סגירה">✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * The poster, chosen by looking: the video plays here, and the moment it is
 * paused on is the one taken. A photo from the gallery, or the site's own
 * choice, are the other two answers.
 */
function PosterDialog({
  video,
  busy,
  onSave,
  onClose,
}: {
  video: VideoEntry;
  busy: boolean;
  onSave: (choice: { moment?: number; image?: string }) => void;
  onClose: () => void;
}): JSX.Element {
  const store = useStore();
  const player = useRef<HTMLVideoElement>(null);
  const [picking, setPicking] = useState(false);
  const src = store.videoUrlFor(video.id);

  return (
    <Modal label="תמונת השער" onClose={onClose}>
      <p className="help">
        תמונת השער מופיעה במקום הסרטון עד שלוחצים על הפעלה. אפשר להריץ את הסרטון לרגע שרוצים, לעצור,
        ולבחור אותו - או לבחור תמונה מהגלריה.
      </p>
      {src && (
        <video
          ref={player}
          className="upload-preview"
          src={`${src}#t=${video.posterTime ?? 0}`}
          controls
          playsInline
          preload="metadata"
        />
      )}
      <p className="muted">{posterLabel(video)}</p>
      <div className="modal-actions">
        <button
          className="primary"
          onClick={() => player.current && onSave({ moment: player.current.currentTime })}
          disabled={busy || !src}
        >
          הרגע הזה בסרטון
        </button>
        <button className="ghost" onClick={() => setPicking(true)} disabled={busy}>
          תמונה מהגלריה
        </button>
        <button className="ghost" onClick={() => onSave({})} disabled={busy}>
          שהאתר יבחר לבד
        </button>
      </div>
      {picking && (
        <ImagePicker value={video.poster} onPick={(image) => onSave({ image })} onClose={() => setPicking(false)} />
      )}
    </Modal>
  );
}
