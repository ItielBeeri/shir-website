/**
 * The shell: sign-in, the landing cards, one open screen, and the tray that
 * says what is waiting to be published.
 *
 * There is no router. The owner is in exactly one place at a time and reaches
 * everything from the landing screen in one tap, so a URL to restore would be
 * a concept she never needs.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from './api';
import type { PathChange } from './git/engine';
import { screens } from './model/screens';
import type { Screen } from './model/types';
import { TomlForm } from './screens/TomlForm';

type Role = 'owner' | 'maintainer';

const GLYPHS: Record<string, string> = {
  pencil: '✍', book: '📚', quote: '💬', image: '🖼', home: '🏠', person: '🙋',
  leaf: '🌿', envelope: '✉', list: '☰', phone: '📞', scale: '⚖', question: '❓',
};

export default function App(): JSX.Element {
  const [state, setState] = useState<'checking' | 'out' | 'in' | 'broken'>('checking');
  const [role, setRole] = useState<Role>('owner');
  const [pending, setPending] = useState<PathChange[]>([]);
  const [open, setOpen] = useState<Screen | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { pending: p } = await api.pending();
      setPending(p);
    } catch {
      /* the tray is advisory; a failed refresh must not block editing */
    }
  }, []);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let signedIn = false;
      try {
        signedIn = (await api.me()).signedIn;
      } catch {
        if (!cancelled) setState('out');
        return;
      }
      if (cancelled) return;
      if (!signedIn) {
        setState('out');
        return;
      }
      // Signed in. Anything that fails from here is a fault to report, never a
      // silent bounce back to the sign-in button - that reads as "it forgot me"
      // and leaves nothing to act on.
      try {
        const start = await api.start();
        if (cancelled) return;
        setRole(start.role);
        setPending(start.pending);
        setState('in');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לפתוח את המערכת.');
        setState('broken');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function doPublish(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.publish('פרסום שינויים מהמערכת');
      setPending([]);
      setNotice('פורסם. השינוי יופיע באתר בתוך כדקה או שתיים.');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לפרסם.');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'checking') {
    return <main className="app center"><p className="muted">רגע…</p></main>;
  }

  if (state === 'broken') {
    return (
      <main className="app center">
        <div>
          <h1 style={{ fontWeight: 400 }}>לא הצלחתי לפתוח את המערכת</h1>
          <p className="banner error" style={{ maxInlineSize: '34ch', marginInline: 'auto' }}>
            {error}
          </p>
          <p style={{ marginBlockStart: 20, display: 'flex', gap: 12, justifyContent: 'center' }}>
            <button className="primary" onClick={() => setAttempt((n) => n + 1)}>
              נסי שוב
            </button>
            <a href="/api/auth/logout">
              <button className="ghost">התנתקות</button>
            </a>
          </p>
        </div>
      </main>
    );
  }

  if (state === 'out') {
    return (
      <main className="app center">
        <div>
          <h1 style={{ fontWeight: 400 }}>עריכת האתר</h1>
          <p className="muted" style={{ maxInlineSize: '30ch', marginInline: 'auto' }}>
            כאן אפשר לשנות טקסטים, תמונות, פוסטים והמלצות באתר.
          </p>
          <p style={{ marginBlockStart: 24 }}>
            <a href="/api/auth/login">
              <button className="primary">התחברות</button>
            </a>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="app" id="main">
      {notice && <p className="banner">{notice}</p>}
      {error && <p className="banner error">{error}</p>}

      {open ? (
        open.kind === 'toml' ? (
          <TomlForm
            screen={open}
            role={role}
            onSaved={() => {
              setNotice('נשמר. עוד לא פורסם לאתר.');
              void refresh();
            }}
            onBack={() => {
              setOpen(null);
              setNotice(null);
            }}
          />
        ) : (
          <>
            <div className="topbar">
              <button className="ghost" onClick={() => setOpen(null)} aria-label="חזרה למסך הראשי">
                →
              </button>
              <h1>{open.title}</h1>
            </div>
            <p className="banner">המסך הזה עדיין בבנייה.</p>
          </>
        )
      ) : (
        <>
          <div className="topbar">
            <h1>שלום שיר</h1>
          </div>
          <div className="cards">
            {screens
              .filter((s) => !s.advanced)
              .map((screen) => (
                <button
                  key={screen.id}
                  className="card"
                  onClick={() => {
                    setOpen(screen);
                    setNotice(null);
                    setError(null);
                  }}
                >
                  <span className="glyph" aria-hidden="true">{GLYPHS[screen.icon] ?? '•'}</span>
                  <span className="label">{screen.title}</span>
                  {screen.blurb && <span className="blurb">{screen.blurb}</span>}
                </button>
              ))}
          </div>
        </>
      )}

      {pending.length > 0 && (
        <div className="tray" role="region" aria-label="שינויים שטרם פורסמו">
          <div className="tray-inner">
            <span className="count">
              {pending.length === 1 ? 'שינוי אחד ממתין לפרסום' : `${pending.length} שינויים ממתינים לפרסום`}
            </span>
            <button className="primary" onClick={doPublish} disabled={busy}>
              {busy ? 'מפרסם…' : 'פרסמי לאתר'}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
