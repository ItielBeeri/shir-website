/**
 * The menu and the history list.
 *
 * `describePath` lives here too: it is how a repository path becomes something
 * the owner recognises, and both this file and the preview screen need it.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import type { CommitInfo } from '../api';
import type { PathChange } from '../git/engine';
import { PUBLISH_PREFIX } from '../git/engine';
import { isWritablePath } from '../git/paths';
import { useStore } from '../store';
import { findSlot, setValue } from '../content/toml-edit';
import { reorderArrayTables } from '../content/toml-struct';
import { parse as parseToml } from 'smol-toml';
import { screens } from '../model/screens';

/* ---------------------------------- menu ------------------------------------ */

const NAV_FILE = 'src/content/nav.toml';

interface NavItem {
  /** Position in the file, which is what a reorder permutes. */
  origin: number;
  label: string;
  href: string;
  header?: boolean;
}

export function NavEditor({ onSaved }: { onSaved: () => void }): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [items, setItems] = useState<NavItem[]>([]);
  const [initial, setInitial] = useState<NavItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback((content: string) => {
    const parsed = ((parseToml(content) as { items?: Array<Omit<NavItem, 'origin'>> }).items ??
      []) as Array<Omit<NavItem, 'origin'>>;
    const next = parsed.map((item, origin) => ({ ...item, origin }));
    setSource(content);
    setItems(next);
    setInitial(next);
  }, []);

  useEffect(() => {
    api
      .read(NAV_FILE)
      .then(({ content }) => content && adopt(content))
      .catch((e: FriendlyError) => setError(e.message));
  }, [adopt]);

  const dirty = JSON.stringify(items) !== JSON.stringify(initial);

  const move = (at: number, direction: -1 | 1): void => {
    const to = at + direction;
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    [next[at], next[to]] = [next[to], next[at]];
    setItems(next);
  };

  /**
   * Labels and header visibility are value splices; order is the arrangement
   * of whole blocks, so it is applied last, over the already-edited text.
   * `href` wires a name to a page and is never editable here.
   */
  async function save(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      let out = source;
      for (const item of items) {
        out = setValue(out, ['items', item.origin, 'label'], item.label);
        try {
          findSlot(out, ['items', item.origin, 'header']);
          out = setValue(out, ['items', item.origin, 'header'], item.header !== false);
        } catch {
          // No `header` key on this item: it defaults to visible, and adding
          // the key is a structural change this screen does not make.
        }
      }
      const order = items.map((item) => item.origin);
      if (order.some((origin, at) => origin !== at)) out = reorderArrayTables(out, order);

      await api.save('עדכון התפריט', [{ path: NAV_FILE, content: out }]);
      adopt(out);
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
        אלה שמות העמודים בתפריט העליון ובכותרת התחתונה, לפי הסדר. אפשר לשנות את הכיתוב,
        לשנות את הסדר, ולבחור אילו מהם מופיעים גם בתפריט העליון.
      </p>

      <ul className="nav-items">
        {items.map((item, at) => (
          <li key={item.origin} className="group">
            {/* Every row reads the same to a screen reader unless its own name
                is in the labels, and eight rows of "הכיתוב" name nothing. */}
            <h2>
              {at + 1}. {item.label || 'ללא שם'}
            </h2>
            <div className="field">
              <label htmlFor={`nav-${item.origin}`}>הכיתוב</label>
              <input
                id={`nav-${item.origin}`}
                type="text"
                value={item.label}
                onChange={(e) => {
                  const next = items.slice();
                  next[at] = { ...item, label: e.target.value };
                  setItems(next);
                }}
              />
            </div>
            <div className="switch">
              <input
                id={`nav-h-${item.origin}`}
                type="checkbox"
                checked={item.header !== false}
                onChange={(e) => {
                  const next = items.slice();
                  next[at] = { ...item, header: e.target.checked };
                  setItems(next);
                }}
              />
              <label htmlFor={`nav-h-${item.origin}`}>
                «{item.label}» מופיע גם בתפריט העליון
              </label>
            </div>
            <div className="nav-move">
              <button
                className="ghost"
                aria-label={`העברת «${item.label}» למעלה`}
                disabled={at === 0}
                onClick={() => move(at, -1)}
              >
                ↑
              </button>
              <button
                className="ghost"
                aria-label={`העברת «${item.label}» למטה`}
                disabled={at === items.length - 1}
                onClick={() => move(at, 1)}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>

      {/* Beside the button: the save is at the foot of the form, and a
          message at the top is a message she never scrolls back to see. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="save-row">
        <button className="primary" onClick={save} disabled={busy || !dirty}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {!dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
      </div>
    </>
  );
}

/* -------------------------------- describing -------------------------------- */

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
      workshops: 'סדנאות',
      ceremonies: 'טקסים',
    };
    return `עמוד ${names[slug ?? ''] ?? slug}`;
  }
  if (path.startsWith('src/content/about/')) return 'עמוד אודות';
  if (path.startsWith('public/img/recommendations/')) return 'צילום מסך של המלצה';
  if (path.startsWith('public/img/_opt/')) return 'גרסאות מוקטנות של תמונות';
  if (path.startsWith('public/img/')) return 'תמונה';
  if (path === 'src/content/pages/accessibility.toml') return 'הצהרת נגישות';
  if (path === 'src/content/pages/terms.toml') return 'תנאי שימוש ופרטיות';
  if (path === 'src/content/pages/consent.toml') return 'באנר ההסכמה';
  return path;
}

/**
 * The page on the site a content file produces, so a preview can open where
 * the change is rather than at the front door.
 *
 * `null` means "everywhere": the brand details, the menu, the image manifest
 * and the pictures themselves show up on every page, and no one of them is a
 * better place to look than the home page.
 */
export function sitePathFor(path: string): string | null {
  if (path === 'src/content/pages/home.toml') return '/';
  if (path === 'src/content/pages/contact.toml') return '/contact';
  if (path === 'src/content/pages/accessibility.toml') return '/accessibility';
  if (path === 'src/content/pages/terms.toml') return '/terms';
  if (path === 'src/content/recommendations.toml') return '/recommendations';
  if (path.startsWith('src/content/about/')) return '/about';

  const therapy = /^src\/content\/therapies\/(.+)\.mdx$/.exec(path);
  if (therapy) return `/${encodeURIComponent(therapy[1])}`;

  const post = /^src\/content\/blog\/(.+)\.mdx$/.exec(path);
  if (post) return `/blog/${encodeURIComponent(post[1])}`;

  return null;
}

/**
 * A commit subject the owner can read.
 *
 * Master carries three kinds of commit: her own publishes, the images bot's
 * derivative commits, and maintenance written in English for developers. Only
 * the first was ever addressed to her, so the other two are named for what
 * they are rather than shown as `chore:` and a repository URL.
 */
export function describeCommit(message: string): string {
  const subject = message.split('\n')[0].trim();
  if (subject.startsWith(PUBLISH_PREFIX)) return subject.slice(PUBLISH_PREFIX.length);
  if (/rebuild image derivatives/i.test(subject)) return 'עדכון אוטומטי של גרסאות התמונות';
  if (!/[֐-׿]/.test(subject)) return 'עדכון טכני של האתר';
  return subject.replace(/https?:\/\/\S+/g, '').trim();
}

/* --------------------------------- history ---------------------------------- */

const when = (iso: string): string =>
  new Date(iso).toLocaleString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

export function History(): JSX.Element {
  const store = useStore();
  const [commits, setCommits] = useState<CommitInfo[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [paths, setPaths] = useState<Record<string, PathChange[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ sha: string; path: string; at: string } | null>(
    null,
  );

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

  /** The paths a commit touched, fetched the first time a row is opened. */
  async function expand(sha: string): Promise<void> {
    setOpen((prev) => (prev === sha ? null : sha));
    if (paths[sha]) return;
    setBusy(sha);
    setError(null);
    try {
      const { paths: changed } = await api.commit(sha);
      // Only what this system is allowed to write back is offered.
      setPaths((prev) => ({ ...prev, [sha]: changed.filter((c) => isWritablePath(c.path)) }));
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לקרוא מה השתנה.');
    } finally {
      setBusy(null);
    }
  }

  /**
   * Restoring is a new change waiting to be published, not a rewrite of what
   * already happened: the old version comes forward as an edit she can look at
   * and cancel, exactly like any other.
   */
  async function restore(sha: string, path: string, at: string): Promise<void> {
    setBusy(path);
    setError(null);
    try {
      await api.restore(path, sha, `שחזור ${describePath(path)} לגרסה מ-${at}`);
      await store.refreshPending();
      await store.refreshGallery().catch(() => undefined);
      setConfirming(null);
      setNotice('הגרסה הישנה מחכה עכשיו לפרסום. אפשר לראות אותה במסך «צפייה ופרסום».');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשחזר.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !commits) return <p className="banner error">{error}</p>;
  if (!commits) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      {notice && <p className="banner">{notice}</p>}
      {error && <p className="banner error" role="alert">{error}</p>}
      <p className="help">
        כל שינוי שפורסם לאתר נשמר כאן. אפשר לפתוח שינוי, לראות מה הוא כלל, ולהחזיר קובץ
        לגרסה שלו מאותו רגע.
      </p>

      <ul className="history">
        {commits.map((commit) => {
          const at = when(commit.date);
          const isOpen = open === commit.sha;
          const changed = paths[commit.sha];
          return (
            <li key={commit.sha} className="group">
              <button
                className="history-head"
                onClick={() => expand(commit.sha)}
                aria-expanded={isOpen}
              >
                <span className="history-text">
                  <b>{describeCommit(commit.message)}</b>
                  <span className="muted">
                    {at} · {commit.author}
                  </span>
                </span>
                <span aria-hidden="true">{isOpen ? '▴' : '▾'}</span>
              </button>

              {isOpen && (
                <div className="history-body">
                  {busy === commit.sha && <p className="muted">רגע…</p>}
                  {changed && changed.length === 0 && (
                    <p className="muted">אין כאן קובץ שאפשר להחזיר.</p>
                  )}
                  {changed && changed.length > 0 && (
                    <ul className="change-list">
                      {changed.map((change) => (
                        <li key={change.path}>
                          <span>{describePath(change.path)}</span>
                          <button
                            className="ghost"
                            disabled={busy === change.path}
                            onClick={() => setConfirming({ sha: commit.sha, path: change.path, at })}
                          >
                            {busy === change.path ? 'מחזיר…' : 'החזרה לגרסה הזו'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(null)}>
          <div className="modal is-small" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>להחזיר את «{describePath(confirming.path)}»?</h2>
            <p className="muted">
              זה יחזיר אותו למה שהיה ב{confirming.at}. השינוי יחכה לפרסום, כך שאפשר לראות
              אותו קודם ולבטל אם משהו לא מתאים.
            </p>
            <div className="modal-actions">
              <button
                className="primary"
                disabled={busy === confirming.path}
                onClick={() => restore(confirming.sha, confirming.path, confirming.at)}
              >
                כן, להחזיר
              </button>
              <button className="ghost" onClick={() => setConfirming(null)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
