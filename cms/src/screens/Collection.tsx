/**
 * The list of a collection's entries - blog posts, therapy pages.
 *
 * Ordering matches the site exactly by reusing its own rule, so what she sees
 * here is what a visitor sees. Blog: pinned first by descending `order`, then
 * newest first. Therapies: ascending `order`. The editor guide has to warn
 * that the two are opposite; here neither is a number she types.
 *
 * A failure is reported inside the row that failed. A banner at the top of a
 * list is out of sight by the third entry, and a button that does nothing and
 * says nothing reads as a broken button.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import { parseFrontmatter, removeField, setField } from '../content/frontmatter';
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
  /** Frontmatter keys in model order, so an inserted key lands among its kin. */
  fieldOrder: string[];
  onOpen: (file: string) => void;
  onNew?: () => void;
}

/** Whose fault the message is: a row, or the screen as a whole. */
interface Trouble {
  file: string | null;
  message: string;
}

export function Collection({ dir, kind, fieldOrder, onOpen, onNew }: Props): JSX.Element {
  const store = useStore();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTrouble(null);
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
      setTrouble({
        file: null,
        message: e instanceof FriendlyError ? e.message : 'לא הצלחתי לטעון את הרשימה.',
      });
    }
  }, [dir, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  /** One row's write, start to finish, with its own failure attached to it. */
  async function act(
    entry: Entry,
    whenItGoesWrong: string,
    run: () => Promise<void>,
  ): Promise<void> {
    setBusy(entry.file);
    setTrouble(null);
    try {
      await run();
      store.saved();
      await load();
    } catch (e) {
      setTrouble({
        file: entry.file,
        message: e instanceof FriendlyError ? e.message : whenItGoesWrong,
      });
    } finally {
      setBusy(null);
    }
  }

  const toggleHidden = (entry: Entry): Promise<void> =>
    act(entry, 'לא הצלחתי לשנות.', async () => {
      const { content } = await api.read(entry.path);
      if (!content) return;
      const next = setField(content, 'draft', !entry.hidden, { order: fieldOrder });
      await api.save(`${entry.hidden ? 'הצגת' : 'הסתרת'} ${entry.title}`, [
        { path: entry.path, content: next },
      ]);
    });

  /**
   * Pinning writes an `order` above every other, so it needs no number, and
   * unpinning takes the key away rather than writing 0 - the schema requires a
   * positive number, so 0 is a broken build, not an unpinned post.
   */
  const pin = (entry: Entry, on: boolean): Promise<void> =>
    act(entry, 'לא הצלחתי לשנות את הסדר.', async () => {
      const highest = Math.max(0, ...(entries ?? []).map((e) => e.order ?? 0));
      const { content } = await api.read(entry.path);
      if (!content) return;
      const next = on
        ? setField(content, 'order', highest + 1, { order: fieldOrder })
        : removeField(content, 'order');
      await api.save(`${on ? 'הצמדת' : 'שחרור'} ${entry.title}`, [
        { path: entry.path, content: next },
      ]);
    });

  const reorderTherapy = (entry: Entry, direction: -1 | 1): Promise<void> =>
    act(entry, 'לא הצלחתי לשנות את הסדר.', async () => {
      const at = (entries ?? []).findIndex((e) => e.file === entry.file);
      const other = (entries ?? [])[at + direction];
      if (!other) return;
      const files = await Promise.all(
        [entry, other].map(async (e) => ({ e, content: (await api.read(e.path)).content })),
      );
      const writes = files.map(({ e, content }, i) => ({
        path: e.path,
        content: setField(content!, 'order', (i === 0 ? other : entry).order ?? i + 1, {
          order: fieldOrder,
        }),
      }));
      await api.save('שינוי סדר הטיפולים', writes);
    });

  if (trouble && !entries) return <p className="banner error">{trouble.message}</p>;
  if (!entries) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      {trouble && trouble.file === null && <p className="banner error">{trouble.message}</p>}
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

              {trouble?.file === entry.file && (
                <p className="entry-error invalid" role="alert">
                  {trouble.message}
                </p>
              )}
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
