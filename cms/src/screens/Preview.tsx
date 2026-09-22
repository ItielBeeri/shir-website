/**
 * See it, then publish it.
 *
 * The draft branch gets its own build, and this is that build - the real site
 * with the real changes, not an approximation.
 *
 * **One viewport at a time.** Two frames side by side each get half the width,
 * and the site's layout switches at 768px, so a pair of frames on a laptop is
 * just the mobile layout twice. Instead the widest *real* viewport that fits
 * the space is rendered at its true width and scaled down to suit, which keeps
 * the layout honest and only shrinks the pixels.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, FriendlyError } from '../api';
import { useStore } from '../store';
import { describePath } from './Misc';

type State = 'building' | 'ready' | 'failed' | 'unknown';
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
const POLL_MS = 6000;
const FRAME_TIMEOUT_MS = 8000;

export function Preview({ onPublished }: { onPublished: () => void }): JSX.Element {
  const store = useStore();
  const [state, setState] = useState<State>('building');
  const [url, setUrl] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>('desktop');
  const [available, setAvailable] = useState(0);
  const [framed, setFramed] = useState<'waiting' | 'ok' | 'blocked'>('waiting');
  const [busy, setBusy] = useState(false);
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

  useEffect(() => {
    if (state !== 'building') return;
    timer.current = window.setTimeout(() => setNudge((n) => n + 1), POLL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state, nudge]);

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

  async function publish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.publish();
      await store.refreshPending();
      onPublished();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לפרסם.');
    } finally {
      setBusy(false);
    }
  }

  if (store.pending.length === 0) {
    return <p className="banner">אין שינויים שממתינים לפרסום.</p>;
  }

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
            <li key={change.path}>{describePath(change.path)}</li>
          ))}
        </ul>
      </section>

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
            <a href={url} target="_blank" rel="noopener noreferrer" className="chip">
              פתיחה בחלון חדש
            </a>
          </div>
        )}
      </div>

      <div className="stage-wrap" ref={stage}>
        {url ? (
          <div
            className={`stage is-${shown}`}
            style={{
              inlineSize: viewport.width * scale,
              blockSize: viewport.height * scale,
            }}
          >
            <iframe
              key={shown}
              src={url}
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
          <p className="muted">
            {state === 'building' ? 'הבנייה בתהליך…' : 'אין עדיין תצוגה להראות.'}
          </p>
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
        <button className="primary" onClick={publish} disabled={busy || state === 'building'}>
          {busy ? 'מפרסם…' : 'פרסמי לאתר'}
        </button>
        {state === 'building' && <span className="muted">אפשר לפרסם ברגע שהתצוגה מוכנה.</span>}
        {state === 'failed' && (
          <span className="invalid">הבנייה נכשלה. עדיף לפנות לאיתיאל לפני פרסום.</span>
        )}
      </div>
    </>
  );
}

function Status({ state }: { state: State }): JSX.Element {
  const text: Record<State, string> = {
    building: 'בונה את התצוגה…',
    ready: 'התצוגה מוכנה',
    failed: 'הבנייה נכשלה',
    unknown: 'לא הצלחתי לקבל מצב בנייה. אפשר לפרסם, ולבדוק באתר אחרי דקה.',
  };
  return (
    <p className={state === 'failed' ? 'invalid' : 'muted'} role="status">
      {state === 'building' && <span className="spinner" aria-hidden="true" />}
      {text[state]}
    </p>
  );
}
