/**
 * The list of a collection's entries - blog posts, therapy pages.
 *
 * Ordering matches the site exactly by reusing its own rule, so what she sees
 * here is what a visitor sees. Blog: pinned first by descending `order`, then
 * newest first. Therapies: ascending `order`. The editor guide has to warn
 * that the two are opposite; here neither is a number she types - both lists
 * move with the same arrows as recommendations.
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
            // Posts name their picture `cover`; a therapy page names it
            // `hero_image`. A row with neither is a row with a grey square.
            cover: firstImage(data),
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
   * The arrows over blog posts. Pinned posts move among themselves; ↑ on an
   * unpinned post pins it just below the last pinned one, and ↓ on the last
   * pinned post unpins it back into date order. Afterwards the pinned posts are
   * renumbered n..1, so a tie between two equal `order`s can never make an
   * arrow do nothing. Unpinning removes the key rather than writing 0 - the
   * schema requires a positive number, so 0 is a broken build.
   */
  const reorderPost = (entry: Entry, direction: -1 | 1): Promise<void> =>
    act(entry, 'לא הצלחתי לשנות את הסדר.', async () => {
      const all = entries ?? [];
      const pinned = all.filter((e) => e.order);
      const at = pinned.findIndex((e) => e.file === entry.file);
      let next: Entry[];
      let message = 'שינוי סדר הפוסטים';
      if (at === -1) {
        if (direction === 1) return;
        next = [...pinned, entry];
        message = `הצמדת ${entry.title}`;
      } else if (direction === 1 && at === pinned.length - 1) {
        next = pinned.slice(0, -1);
        message = `שחרור ${entry.title}`;
      } else {
        if (at + direction < 0) return;
        next = [...pinned];
        [next[at], next[at + direction]] = [next[at + direction], next[at]];
      }
      const orders = new Map(next.map((e, i) => [e.file, next.length - i]));
      const changed = all.filter((e) => orders.get(e.file) !== e.order);
      const writes = await Promise.all(
        changed.map(async (e) => {
          const { content } = await api.read(e.path);
          const order = orders.get(e.file);
          return {
            path: e.path,
            content: order
              ? setField(content!, 'order', order, { order: fieldOrder })
              : removeField(content!, 'order'),
          };
        }),
      );
      await api.save(message, writes);
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
          const url = entry.cover ? store.urlFor(entry.cover, 60) : null;
          return (
            <li key={entry.file} className={entry.hidden ? 'entry is-hidden' : 'entry'}>
              <button className="entry-main" onClick={() => onOpen(entry.file)}>
                {url ? <img src={url} alt="" /> : <span className="entry-thumb" aria-hidden="true" />}
                <span className="entry-text">
                  <span className="entry-title">
                    {kind === 'blog' && !!entry.order && (
                      <span className="entry-pin" role="img" aria-label="מוצמד" title="מוצמד">
                        📌
                      </span>
                    )}
                    {entry.title}
                  </span>
                  <span className="muted">
                    {entry.hidden && 'מוסתר · '}
                    {kind === 'blog' ? entry.date ?? '' : `מיקום ${i + 1}`}
                  </span>
                </span>
              </button>

              <div className="entry-actions">
                <button
                  className="ghost"
                  aria-label="העברה למעלה"
                  disabled={(i === 0 && (kind !== 'blog' || !!entry.order)) || busy === entry.file}
                  onClick={() => (kind === 'blog' ? reorderPost : reorderTherapy)(entry, -1)}
                >
                  ↑
                </button>
                <button
                  className="ghost"
                  aria-label="העברה למטה"
                  disabled={
                    (kind === 'blog' ? !entry.order : i === entries.length - 1) ||
                    busy === entry.file
                  }
                  onClick={() => (kind === 'blog' ? reorderPost : reorderTherapy)(entry, 1)}
                >
                  ↓
                </button>
                {kind === 'blog' && (
                  <button
                    className="ghost"
                    disabled={busy === entry.file}
                    onClick={() => toggleHidden(entry)}
                  >
                    {entry.hidden ? 'הצגה' : 'הסתרה'}
                  </button>
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

const IMAGE_KEYS = ['cover', 'teaser_image', 'hero_image', 'portrait_image'] as const;

const firstImage = (data: Record<string, unknown>): string | undefined => {
  for (const key of IMAGE_KEYS) {
    if (typeof data[key] === 'string' && data[key]) return data[key] as string;
  }
  return undefined;
};

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
