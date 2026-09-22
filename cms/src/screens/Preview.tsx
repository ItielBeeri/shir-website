/**
 * See it, then publish it.
 *
 * The draft branch gets its own build, and this is that build - the real site
 * with the real changes, not an approximation.
 *
 * The changes, the preview and the publish button are one screen, because they
 * are one question: is this right, and should it go out? Splitting them meant
 * reading a list in one place and looking at the result in another.
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
import { useStore } from '../store';
import { describePath, sitePathFor } from './Misc';
import { DEPLOY_WORDS } from '../model/deploy';

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

export function Preview({ onPublished }: { onPublished: (sha: string) => void }): JSX.Element {
  const store = useStore();
  const [state, setState] = useState<State>('queued');
  const [url, setUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [page, setPage] = useState<string | null>(null);
  const [available, setAvailable] = useState(0);
  const [framed, setFramed] = useState<'waiting' | 'ok' | 'blocked'>('waiting');
  const [busy, setBusy] = useState(false);
  const [discarding, setDiscarding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(0);

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

  const check = useCallback(async () => {
    try {
      const { draft } = await api.refs();
      if (!draft) {
        setState('unknown');
        return;
      }
      const status = await api.status(draft);
      setState(status.state);
      if (status.url) setUrl(status.url);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לבדוק את מצב התצוגה.');
      setState('unknown');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check, nudge]);

  const waiting = state === 'queued' || state === 'building' || state === 'none';

  useEffect(() => {
    if (!waiting) return;
    timer.current = window.setTimeout(() => setNudge((n) => n + 1), POLL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [waiting, nudge]);

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
      const { sha } = await api.publish();
      await store.refreshPending();
      onPublished(sha);
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

  /**
   * The pages her changes actually land on. Opening the front door and asking
   * her to navigate inside a scaled-down frame to find her own edit is the
   * long way round to the one thing she came to look at.
   */
  const pages = (() => {
    const seen = new Map<string, string>();
    for (const change of store.pending) {
      const to = sitePathFor(change.path);
      if (to && !seen.has(to)) seen.set(to, describePath(change.path));
    }
    if (seen.size === 0) seen.set('/', 'דף הבית');
    return [...seen].map(([to, label]) => ({ to, label }));
  })();

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

      <div className="save-row publish-row">
        <button className="primary" onClick={publish} disabled={busy || waiting}>
          {busy ? 'מפרסם…' : 'פרסמי לאתר'}
        </button>
        {waiting && <span className="muted">אפשר לפרסם ברגע שהתצוגה מוכנה.</span>}
        {state === 'failed' && (
          <span className="invalid">הבנייה נכשלה. עדיף לפנות לאיתיאל לפני פרסום.</span>
        )}
      </div>
    </>
  );
}

function Status({ state }: { state: State }): JSX.Element {
  const text: Record<State, string> = {
    ...DEPLOY_WORDS,
    ready: 'התצוגה מוכנה',
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
