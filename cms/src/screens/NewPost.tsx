/**
 * A new blog post.
 *
 * No template to copy, no file name to invent, no `---` fences to preserve.
 * The post is created hidden, so writing it is never a race against it being
 * visible, and the last step is the one that shows it.
 */
import { useState } from 'react';
import { api, FriendlyError } from '../api';
import { encodeValue } from '../content/frontmatter';
import type { FrontmatterValue } from '../content/frontmatter';
import { ImageField } from '../components/ImagePicker';
import { DraftOffer, useDraftKeeper } from '../lib/unsaved';
import { useStore } from '../store';
import { slugFor } from '../lib/slug';
import { todayInIsrael } from '../lib/today';

const DIR = 'src/content/blog';

export function NewPost({ onCreated }: { onCreated: (file: string) => void }): JSX.Element {
  const store = useStore();
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [cover, setCover] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugFor(title);
  const ready = slug.length > 0 && excerpt.trim().length > 0;
  const draft = useDraftKeeper(
    'new-post',
    { title, excerpt, cover },
    { dirty: Boolean(title.trim() || excerpt.trim() || cover), ready: true },
  );

  async function create(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { files } = await api.list(DIR);
      let name = `${slug}.mdx`;
      let n = 2;
      while (files.includes(name)) {
        name = `${slug}-${n}.mdx`;
        n += 1;
      }

      const today = todayInIsrael();
      // Every value goes through the encoder rather than into a quoted
      // template: a two-line excerpt written between quotes is a YAML scalar
      // that folds back into one line, and the owner's line break is gone
      // before she ever sees the post.
      const field = (key: string, value: FrontmatterValue): string =>
        `${key}: ${encodeValue(value)}`;
      const frontmatter = [
        '---',
        field('title', title.trim()),
        field('excerpt', excerpt.trim()),
        `date: ${today}`,
        ...(cover ? [field('cover', cover)] : []),
        field('tags', []),
        field('draft', true),
        '---',
        '',
        'כאן מתחיל הפוסט.',
        '',
      ].join('\n');

      await api.save(`פוסט חדש: ${title.trim()}`, [{ path: `${DIR}/${name}`, content: frontmatter }]);
      store.saved();
      // The post is the draft now; keeping a copy would offer it back on the
      // next new post as if it had been abandoned.
      draft.discard();
      onCreated(name);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי ליצור את הפוסט.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DraftOffer
        keeper={draft}
        onRestore={(value) => {
          setTitle(value.title);
          setExcerpt(value.excerpt);
          setCover(value.cover);
        }}
      />

      <p className="help">
        נתחיל בשלושה פרטים. הפוסט ייווצר מוסתר, כך שאפשר לכתוב אותו בנחת ולהציג אותו
        כשהוא מוכן.
      </p>

      <section className="group">
        <div className="field">
          <label htmlFor="np-title">כותרת הפוסט</label>
          <input id="np-title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          {title && !slug && <p className="invalid">הכותרת צריכה לכלול אותיות או מספרים.</p>}
        </div>

        <div className="field">
          <label htmlFor="np-excerpt">משפט הזמנה</label>
          <p className="help">מופיע בכרטיס הפוסט ומזמין לקרוא.</p>
          <textarea id="np-excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
        </div>

        <ImageField label="תמונת הנושא" help="אפשר גם לבחור אחר כך." value={cover} onChange={setCover} />
      </section>

      {/* Beside the button: the save is at the foot of the form, and a
          message at the top is a message she never scrolls back to see. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="save-row">
        <button className="primary" onClick={create} disabled={!ready || busy}>
          {busy ? 'יוצר…' : 'יצירה והתחלת כתיבה'}
        </button>
      </div>
      {!ready && <p className="invalid">צריך כותרת ומשפט הזמנה.</p>}
    </>
  );
}
