/**
 * See it, then publish it.
 *
 * The draft branch gets its own build, and this is that build - the real site
 * with the real changes, not an approximation. On a wide screen both viewports
 * show at once, because the owner writes on a laptop and half her visitors
 * read on a phone, and the difference is exactly where copy goes wrong.
 *
 * The status comes from the deployment statuses Vercel pushes to the
 * repository. If that permission is not granted it reads `unknown`, and rather
 * than blocking publishing forever the screen says so and lets her through.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, FriendlyError } from '../api';
import { useStore } from '../store';
import { describePath } from './Misc';

type State = 'building' | 'ready' | 'failed' | 'unknown';

const POLL_MS = 6000;

export function Preview({ onPublished }: { onPublished: () => void }): JSX.Element {
  const store = useStore();
  const [state, setState] = useState<State>('building');
  const [url, setUrl] = useState<string | null>(null);
  const [both, setBoth] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nudge, setNudge] = useState(0);
  const timer = useRef<number | null>(null);

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
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [check, nudge]);

  // Keep asking only while something is actually happening.
  useEffect(() => {
    if (state !== 'building') return;
    timer.current = window.setTimeout(() => setNudge((n) => n + 1), POLL_MS);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [state, nudge]);

  async function publish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.publish('פרסום שינויים מהמערכת');
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
            <button className={both ? 'chip is-on' : 'chip'} onClick={() => setBoth(true)}>
              מסך ונייד
            </button>
            <button className={both ? 'chip' : 'chip is-on'} onClick={() => setBoth(false)}>
              נייד בלבד
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" className="chip">
              פתיחה בחלון חדש
            </a>
          </div>
        )}
      </div>

      {url ? (
        <div className={both ? 'frames is-both' : 'frames'}>
          <figure className="frame is-phone">
            <figcaption className="muted">בנייד</figcaption>
            <iframe src={url} title="תצוגה מקדימה בנייד" loading="lazy" />
          </figure>
          {both && (
            <figure className="frame is-desktop">
              <figcaption className="muted">במסך רחב</figcaption>
              <iframe src={url} title="תצוגה מקדימה במסך רחב" loading="lazy" />
            </figure>
          )}
        </div>
      ) : (
        <p className="muted">{state === 'building' ? 'הבנייה בתהליך…' : 'אין עדיין תצוגה להראות.'}</p>
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
