/**
 * What is about to go out, the button that sends it, and a preview if she asks.
 *
 * Publishing applies the draft's paths straight onto master; it never needed a
 * build of its own. The preview is a real build of the draft's commit - the
 * site with the changes, not an approximation - and that takes a minute or two,
 * which is why it waits to be asked for rather than holding the button. Until
 * she opens it nothing touches `content-preview`, so a publish she did not want
 * to watch costs no build. Once open, it follows the draft (`syncPreview`), one
 * build per draft commit.
 *
 * **One viewport at a time.** Two frames side by side each get half the width,
 * and the site's layout switches at 768px, so a pair of frames on a laptop is
 * just the mobile layout twice. Instead the widest *real* viewport that fits
 * the space is rendered at its true width and scaled down to suit, which keeps
 * the layout honest and only shrinks the pixels.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, FriendlyError } from '../api';
import type { DeployState } from '../api';
import type { PathChange } from '../git/engine';
import { useStore } from '../store';
import { describePath } from './Misc';
import { DEPLOY_WORDS } from '../model/deploy';
import { absences, isBlogPost, pagesFor } from '../model/pages';
import { parseFrontmatter } from '../content/frontmatter';

type State = DeployState['state'];
type Device = 'desktop' | 'mobile';

/**
 * The site's header swaps the hamburger for full navigation at 768px, so a
 * frame narrower than that is a phone however wide the screen showing it is.
 * 1280 is a laptop and is one of the widths §1 of AGENTS.md says to test at.
 */
const VIEWPORTS: Record<Device, { width: number; height: number; label: string }> = {
  desktop: { width: 1280, height: 800, label: 'במסך מחשב' },
  mobile: { width: 390, height: 844, label: 'בנייד' },
};

/** Below this the type is too small to judge copy by, so desktop is not offered. */
const MIN_SCALE = 0.45;
const STATUS_WORD: Record<string, string> = {
  added: 'נוסף',
  modified: 'שונה',
  removed: 'נמחק',
};

const POLL_MS = 6000;
const FRAME_TIMEOUT_MS = 8000;

/** Unreadable or unparseable counts as shown: a wrong banner is worse. */
async function isHidden(path: string): Promise<boolean> {
  try {
    const { content } = await api.read(path);
    return Boolean(content) && parseFrontmatter(content as string).data.draft === true;
  } catch {
    return false;
  }
}

export function Preview({
  onPublished,
}: {
  onPublished: (sha: string, paths: PathChange[]) => void;
}): JSX.Element {
  const store = useStore();
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Paths the site itself has changed since this draft started. */
  const [clashes, setClashes] = useState<string[]>([]);

  // Asked once, here, because this is the only screen where the answer
  // changes what she would do.
  useEffect(() => {
    void api
      .conflicts()
      .then(({ paths }) => setClashes(paths))
      .catch(() => undefined);
  }, [store.pending]);

  /** Undo one change without touching the others. */
  async function discard(path: string): Promise<void> {
    setDiscarding(path);
    setError(null);
    try {
      await api.discard(path, `ביטול שינוי ב${describePath(path)}`);
      await store.refreshPending();
      await store.refreshGallery().catch(() => undefined);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לבטל את השינוי.');
    } finally {
      setDiscarding(null);
    }
  }

  async function publish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { sha, paths } = await api.publish();
      await store.refreshPending();
      onPublished(sha, paths);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לפרסם.');
    } finally {
      setBusy(false);
    }
  }

  if (store.pending.length === 0) {
    return (
      <>
        <p className="banner">אין שינויים שממתינים לפרסום.</p>
        <p className="muted">כל מה ששמרת כבר נמצא באתר.</p>
      </>
    );
  }

  return (
    <>
      {error && <p className="banner error">{error}</p>}

      {clashes.length > 0 && (
        <section className="group is-clash">
          <h2>שווה לשים לב</h2>
          <p>
            {clashes.length === 1
              ? 'הדבר הבא השתנה גם באתר מאז ששמרת אותו כאן, ופרסום יחזיר את הגרסה שלך:'
              : 'הדברים הבאים השתנו גם באתר מאז ששמרת אותם כאן, ופרסום יחזיר את הגרסאות שלך:'}
          </p>
          <ul className="usage">
            {clashes.map((path) => (
              <li key={path}>{describePath(path)}</li>
            ))}
          </ul>
          <p className="muted">
            אם את לא בטוחה מה השתנה שם, אפשר לבטל את השינוי כאן ולהתחיל מהגרסה שבאתר.
          </p>
        </section>
      )}

      <section className="group">
        <h2>מה ישתנה באתר</h2>
        <ul className="change-list">
          {store.pending.map((change) => (
            <li key={change.path}>
              <span>
                <b>{describePath(change.path)}</b>
                <span className="muted"> · {STATUS_WORD[change.status] ?? change.status}</span>
              </span>
              <button
                className="ghost danger"
                onClick={() => discard(change.path)}
                disabled={discarding === change.path || busy}
              >
                {discarding === change.path ? 'מבטל…' : 'ביטול השינוי'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="save-row publish-row">
        {/* A discard in flight is a draft commit publish would race. */}
        <button className="primary" onClick={publish} disabled={busy || discarding !== null}>
          {busy ? 'מפרסם…' : 'פרסמי לאתר'}
        </button>
      </div>

      <section className="group" aria-labelledby="preview-heading">
        <div className="preview-offer">
          <h2 id="preview-heading">תצוגה מקדימה</h2>
          <button
            className={previewing ? 'ghost' : undefined}
            aria-expanded={previewing}
            aria-controls="preview-panel"
            onClick={() => setPreviewing((open) => !open)}
            disabled={busy && !previewing}
          >
            {previewing ? 'הסתרת התצוגה' : 'צפייה בתצוגה מקדימה'}
          </button>
        </div>
        {!previewing && (
          <p className="muted">
            אפשר לראות איך השינויים ייראו באתר עצמו לפני שמפרסמים. הכנת התצוגה לוקחת דקה או
            שתיים, ואין צורך לחכות לה כדי לפרסם.
          </p>
        )}
        <div id="preview-panel" className="preview-panel">
          {previewing && <PreviewPanel held={busy} />}
        </div>
      </section>
    </>
  );
}

/**
 * The build and the frame, alive only while open: mounting it is the request.
 *
 * `held` stops it syncing while a publish is under way. Publish moves the draft
 * onto master, and a poll landing in between would point `content-preview` at
 * master's own content - a build of nothing.
 */
function PreviewPanel({ held }: { held: boolean }): JSX.Element {
  const store = useStore();
  const [state, setState] = useState<State>('queued');
  const [url, setUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [page, setPage] = useState<string | null>(null);
  const [available, setAvailable] = useState(0);
  const [framed, setFramed] = useState<'waiting' | 'ok' | 'blocked'>('waiting');
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(0);
  /** Pending posts the site will leave out of the build it is about to make. */
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const stage = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);

  // The frame is sized from the space it actually has, so the same screen gives
  // a bigger preview when the drawer is closed or the window is widened.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = (): void => setAvailable(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [url]);

  /**
   * `draft: true` is what every post the CMS creates starts as, so this is the
   * ordinary case and not an edge one - and the only way to know is to read
   * the file the preview is about to build.
   */
  useEffect(() => {
    const posts = store.pending.filter((c) => c.status !== 'removed' && isBlogPost(c.path));
    if (posts.length === 0) {
      setHidden(new Set());
      return;
    }
    let cancelled = false;
    void Promise.all(posts.map((c) => isHidden(c.path))).then((flags) => {
      if (cancelled) return;
      setHidden(new Set(posts.filter((_, i) => flags[i]).map((c) => c.path)));
    });
    return () => {
      cancelled = true;
    };
  }, [store.pending]);

  const check = useCallback(async () => {
    try {
      const { sha } = await api.preview();
      const status = await api.status(sha);
      setError(null);
      setState(status.state);
      if (status.url) setUrl(status.url);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לבדוק את מצב התצוגה.');
      setState('unknown');
    }
  }, []);

  // Rerun when the changes do: a discard here is a new draft commit, and the
  // frame is showing the one before it. The screen unmounts this with nothing
  // pending, so master's own content never costs a build.
  useEffect(() => {
    if (!held) void check();
  }, [check, nudge, held, store.pending]);

  const waiting = state === 'queued' || state === 'building' || state === 'none';

  useEffect(() => {
    if (!waiting || held) return;
    timer.current = window.setTimeout(() => setNudge((n) => n + 1), POLL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [waiting, held, nudge]);

  /**
   * A frame that never loads is almost always Vercel Deployment Protection: the
   * preview redirects to a login on vercel.com, which the content security
   * policy refuses to frame. That fires neither load nor error, so the only
   * signal available is the absence of a load.
   */
  useEffect(() => {
    if (!url) return;
    setFramed('waiting');
    const id = window.setTimeout(
      () => setFramed((f) => (f === 'ok' ? f : 'blocked')),
      FRAME_TIMEOUT_MS,
    );
    return () => window.clearTimeout(id);
  }, [url, device]);

  /**
   * The pages her changes actually land on. Opening the front door and asking
   * her to navigate inside a scaled-down frame to find her own edit is the
   * long way round to the one thing she came to look at.
   */
  const pages = pagesFor(store.pending.map((c) => ({ ...c, hidden: hidden.has(c.path) })));
  const missing = absences(pages);

  const shownPage = page && pages.some((p) => p.to === page) ? page : pages[0].to;
  const frameUrl = url ? `${url.replace(/\/$/, '')}${shownPage}` : null;

  const fitScale = (width: number): number =>
    available > 0 ? Math.min(1, available / width) : 1;

  const desktopFits = fitScale(VIEWPORTS.desktop.width) >= MIN_SCALE;
  const shown: Device = desktopFits ? device : 'mobile';
  const viewport = VIEWPORTS[shown];
  const scale = fitScale(viewport.width);

  return (
    <>
      {error && <p className="banner error">{error}</p>}

      {missing.length > 0 && (
        <div className="preview-absent">
          <h3>מה לא יופיע בתצוגה</h3>
          <ul className="usage">
            {missing.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}

      {pages.length > 1 && url && (
        <div className="chips preview-pages" role="group" aria-label="בחירת עמוד">
          {pages.map((p) => (
            <button
              key={p.to}
              className={shownPage === p.to ? 'chip is-on' : 'chip'}
              aria-pressed={shownPage === p.to}
              onClick={() => setPage(p.to)}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      <div className="preview-head">
        <Status state={state} />
        {url && (
          <div className="preview-switch">
            {desktopFits && (
              <div className="chips" role="group" aria-label="בחירת תצוגה">
                {(['desktop', 'mobile'] as Device[]).map((d) => (
                  <button
                    key={d}
                    className={shown === d ? 'chip is-on' : 'chip'}
                    aria-pressed={shown === d}
                    onClick={() => setDevice(d)}
                  >
                    {VIEWPORTS[d].label}
                  </button>
                ))}
              </div>
            )}
            <a href={frameUrl ?? url} target="_blank" rel="noopener noreferrer" className="chip">
              פתיחה בחלון חדש
            </a>
          </div>
        )}
      </div>

      <div className="stage-wrap" ref={stage}>
        {frameUrl ? (
          <div
            className={`stage is-${shown}`}
            style={{
              inlineSize: viewport.width * scale,
              blockSize: viewport.height * scale,
            }}
          >
            <iframe
              key={`${shown}${shownPage}`}
              src={frameUrl}
              title={`תצוגה מקדימה ${viewport.label}`}
              style={{
                width: viewport.width,
                height: viewport.height,
                transform: `scale(${scale})`,
              }}
              onLoad={() => setFramed('ok')}
            />
          </div>
        ) : (
          <p className="muted">{waiting ? 'הבנייה בתהליך…' : 'אין עדיין תצוגה להראות.'}</p>
        )}
      </div>

      {url && framed === 'blocked' && (
        <p className="banner">
          התצוגה לא נטענת כאן, כנראה בגלל הגדרת אבטחה של Vercel.{' '}
          <a href={url} target="_blank" rel="noopener noreferrer">
            אפשר לפתוח אותה בחלון חדש
          </a>{' '}
          — וכדאי לספר על כך לאיתיאל.
        </p>
      )}
    </>
  );
}

function Status({ state }: { state: State }): JSX.Element {
  const text: Record<State, string> = {
    ...DEPLOY_WORDS,
    ready: 'התצוגה מוכנה',
    failed: 'הבנייה נכשלה. עדיף לפנות לאיתיאל לפני פרסום.',
    unknown: 'לא הצלחתי לקבל מצב בנייה. אפשר לפרסם, ולבדוק באתר אחרי דקה.',
  };
  const busy = state === 'queued' || state === 'building' || state === 'none';
  return (
    <p className={state === 'failed' ? 'invalid' : 'muted'} role="status">
      {busy && <span className="spinner" aria-hidden="true" />}
      {text[state]}
    </p>
  );
}
