/**
 * The list of a collection's entries - blog posts, therapy pages.
 *
 * Ordering matches the site exactly by reusing its own rule, so what she sees
 * here is what a visitor sees. Blog: pinned first by descending `order`, then
 * newest first. Therapies: ascending `order`. The editor guide has to warn
 * that the two are opposite; here neither is a number she types.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import { parseFrontmatter, setField } from '../content/frontmatter';
import { useStore } from '../store';

export interface Entry {
  file: string;
  path: string;
  title: string;
  hidden: boolean;
  /** Blog only. */
  date?: string;
  order?: number;
  cover?: string;
}

interface Props {
  dir: string;
  kind: 'blog' | 'therapies';
  onOpen: (file: string) => void;
  onNew?: () => void;
}

export function Collection({ dir, kind, onOpen, onNew }: Props): JSX.Element {
  const store = useStore();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { files } = await api.list(dir);
      const wanted = files.filter((f) => f.endsWith('.mdx') && !f.startsWith('_'));
      const loaded = await Promise.all(
        wanted.map(async (file) => {
          const { content } = await api.read(`${dir}/${file}`);
          const data = content ? parseFrontmatter(content).data : {};
          return {
            file,
            path: `${dir}/${file}`,
            title: String(data.title ?? file.replace(/\.mdx$/, '')),
            hidden: Boolean(data.draft),
            date: data.date ? new Date(String(data.date)).toISOString().slice(0, 10) : undefined,
            order: typeof data.order === 'number' ? data.order : undefined,
            cover: typeof data.cover === 'string' ? data.cover : undefined,
          } satisfies Entry;
        }),
      );
      setEntries(sort(loaded, kind));
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לטעון את הרשימה.');
    }
  }, [dir, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleHidden(entry: Entry): Promise<void> {
    setBusy(entry.file);
    try {
      const { content } = await api.read(entry.path);
      if (!content) return;
      const next = setField(content, 'draft', !entry.hidden);
      await api.save(`${entry.hidden ? 'הצגת' : 'הסתרת'} ${entry.title}`, [
        { path: entry.path, content: next },
      ]);
      store.saved();
      await load();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשנות.');
    } finally {
      setBusy(null);
    }
  }

  /** Pinning writes an `order` above every other, so it needs no number. */
  async function pin(entry: Entry, on: boolean): Promise<void> {
    setBusy(entry.file);
    try {
      const highest = Math.max(0, ...(entries ?? []).map((e) => e.order ?? 0));
      const { content } = await api.read(entry.path);
      if (!content) return;
      const next = setField(content, 'order', on ? highest + 1 : 0);
      await api.save(`${on ? 'הצמדת' : 'שחרור'} ${entry.title}`, [
        { path: entry.path, content: next },
      ]);
      store.saved();
      await load();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשנות את הסדר.');
    } finally {
      setBusy(null);
    }
  }

  async function reorderTherapy(entry: Entry, direction: -1 | 1): Promise<void> {
    if (!entries) return;
    const at = entries.findIndex((e) => e.file === entry.file);
    const other = entries[at + direction];
    if (!other) return;
    setBusy(entry.file);
    try {
      const files = await Promise.all(
        [entry, other].map(async (e) => ({ e, content: (await api.read(e.path)).content })),
      );
      const writes = files.map(({ e, content }, i) => ({
        path: e.path,
        content: setField(content!, 'order', (i === 0 ? other : entry).order ?? i + 1),
      }));
      await api.save('שינוי סדר הטיפולים', writes);
      store.saved();
      await load();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשנות את הסדר.');
    } finally {
      setBusy(null);
    }
  }

  if (error && !entries) return <p className="banner error">{error}</p>;
  if (!entries) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      {error && <p className="banner error">{error}</p>}
      {onNew && (
        <button className="primary wide" onClick={onNew}>
          + כתיבת פוסט חדש
        </button>
      )}

      <ul className="entries">
        {entries.map((entry, i) => {
          const url = entry.cover ? store.urlFor(entry.cover) : null;
          return (
            <li key={entry.file} className={entry.hidden ? 'entry is-hidden' : 'entry'}>
              <button className="entry-main" onClick={() => onOpen(entry.file)}>
                {url ? <img src={url} alt="" /> : <span className="entry-thumb" aria-hidden="true" />}
                <span className="entry-text">
                  <span className="entry-title">{entry.title}</span>
                  <span className="muted">
                    {entry.hidden && 'מוסתר · '}
                    {kind === 'blog'
                      ? `${entry.order ? 'מוצמד לראש · ' : ''}${entry.date ?? ''}`
                      : `מיקום ${i + 1}`}
                  </span>
                </span>
              </button>

              <div className="entry-actions">
                {kind === 'blog' ? (
                  <>
                    <button
                      className="ghost"
                      disabled={busy === entry.file}
                      onClick={() => pin(entry, !entry.order)}
                    >
                      {entry.order ? 'שחרור' : 'הצמדה לראש'}
                    </button>
                    <button
                      className="ghost"
                      disabled={busy === entry.file}
                      onClick={() => toggleHidden(entry)}
                    >
                      {entry.hidden ? 'הצגה' : 'הסתרה'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className="ghost"
                      aria-label="העברה למעלה"
                      disabled={i === 0 || busy === entry.file}
                      onClick={() => reorderTherapy(entry, -1)}
                    >
                      ↑
                    </button>
                    <button
                      className="ghost"
                      aria-label="העברה למטה"
                      disabled={i === entries.length - 1 || busy === entry.file}
                      onClick={() => reorderTherapy(entry, 1)}
                    >
                      ↓
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The site's own ordering: src/lib/blog.ts for posts, `order` for therapies. */
export function sort(entries: Entry[], kind: 'blog' | 'therapies'): Entry[] {
  if (kind === 'therapies') {
    return [...entries].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }
  return [...entries].sort((a, b) => {
    const ao = a.order ?? 0;
    const bo = b.order ?? 0;
    if (ao > 0 !== bo > 0) return ao > 0 ? -1 : 1;
    if (ao > 0 && ao !== bo) return bo - ao;
    return (b.date ?? '').localeCompare(a.date ?? '');
  });
}
