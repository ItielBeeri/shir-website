/**
 * The menu and the history list.
 *
 * `describePath` lives here too: it is how a repository path becomes something
 * the owner recognises, and both this file and the preview screen need it.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import type { CommitInfo } from '../api';
import { useStore } from '../store';
import { findSlot, setValue } from '../content/toml-edit';
import { parse as parseToml } from 'smol-toml';
import { screens } from '../model/screens';

/* ---------------------------------- menu ------------------------------------ */

const NAV_FILE = 'src/content/nav.toml';

interface NavItem {
  label: string;
  href: string;
  header?: boolean;
}

export function NavEditor({ onSaved }: { onSaved: () => void }): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [items, setItems] = useState<NavItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .read(NAV_FILE)
      .then(({ content }) => {
        if (!content) return;
        setSource(content);
        setItems(((parseToml(content) as { items?: NavItem[] }).items ?? []) as NavItem[]);
      })
      .catch((e: FriendlyError) => setError(e.message));
  }, []);

  /** Only labels and header visibility. `href` wires a name to a page. */
  async function save(next: NavItem[]): Promise<void> {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      let out = source;
      next.forEach((item, i) => {
        out = setValue(out, ['items', i, 'label'], item.label);
        try {
          findSlot(out, ['items', i, 'header']);
          out = setValue(out, ['items', i, 'header'], item.header !== false);
        } catch {
          // No `header` key on this item: it defaults to visible, and adding
          // the key is a structural change this screen does not make.
        }
      });
      await api.save('עדכון התפריט', [{ path: NAV_FILE, content: out }]);
      setSource(out);
      setItems(((parseToml(out) as { items?: NavItem[] }).items ?? []) as NavItem[]);
      store.saved();
      onSaved();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשמור.');
    } finally {
      setBusy(false);
    }
  }

  if (!source) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      <p className="help">
        אלה שמות העמודים בתפריט העליון ובכותרת התחתונה. אפשר לשנות את הכיתוב, ולבחור
        אילו מהם מופיעים גם בתפריט העליון.
      </p>

      <ul className="nav-items">
        {items.map((item, i) => (
          <li key={i} className="group">
            <div className="field">
              <label htmlFor={`nav-${i}`}>הכיתוב</label>
              <input
                id={`nav-${i}`}
                type="text"
                value={item.label}
                onChange={(e) => {
                  const next = items.slice();
                  next[i] = { ...item, label: e.target.value };
                  setItems(next);
                }}
              />
            </div>
            <div className="switch">
              <input
                id={`nav-h-${i}`}
                type="checkbox"
                checked={item.header !== false}
                onChange={(e) => {
                  const next = items.slice();
                  next[i] = { ...item, header: e.target.checked };
                  setItems(next);
                }}
              />
              <label htmlFor={`nav-h-${i}`}>מופיע גם בתפריט העליון</label>
            </div>
          </li>
        ))}
      </ul>

      {/* Beside the button: the save is at the foot of the form, and a
          message at the top is a message she never scrolls back to see. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="save-row">
        <button className="primary" onClick={() => save(items)} disabled={busy}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
      </div>
    </>
  );
}

/* --------------------------------- pending ---------------------------------- */

/** A path the owner never sees, named the way she thinks of it. */
export function describePath(path: string): string {
  const screen = screens.find((s) => s.file === path);
  if (screen) return screen.title;
  if (path.startsWith('src/content/blog/')) {
    return `הפוסט «${path.split('/').pop()?.replace(/\.mdx$/, '')}»`;
  }
  if (path.startsWith('src/content/therapies/')) {
    const slug = path.split('/').pop()?.replace(/\.mdx$/, '');
    const names: Record<string, string> = {
      psychotherapy: 'פסיכותרפיה',
      shiatsu: 'טיפול במגע',
      voice: 'פתיחת קול',
    };
    return `עמוד ${names[slug ?? ''] ?? slug}`;
  }
  if (path.startsWith('src/content/about/')) return 'עמוד אודות';
  if (path.startsWith('public/img/recommendations/')) return 'צילום מסך של המלצה';
  if (path.startsWith('public/img/')) return 'תמונה';
  if (path === 'src/content/pages/accessibility.toml') return 'הצהרת נגישות';
  if (path === 'src/content/pages/terms.toml') return 'תנאי שימוש ופרטיות';
  if (path === 'src/content/pages/consent.toml') return 'באנר ההסכמה';
  return path;
}

/* --------------------------------- history ---------------------------------- */

export function History(): JSX.Element {
  const [commits, setCommits] = useState<CommitInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCommits((await api.history()).commits);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לטעון את ההיסטוריה.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <p className="banner error">{error}</p>;
  if (!commits) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      <p className="help">
        כל שינוי שפורסם לאתר נשמר כאן. אם משהו השתבש, אפשר לפנות לאיתיאל עם התאריך
        ולחזור לגרסה קודמת.
      </p>
      <ul className="history">
        {commits.map((commit) => (
          <li key={commit.sha} className="group">
            <b>{commit.message.split('\n')[0]}</b>
            <span className="muted">
              {new Date(commit.date).toLocaleString('he-IL', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}
              {commit.author}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
