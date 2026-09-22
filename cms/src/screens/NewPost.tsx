/**
 * A new blog post.
 *
 * No template to copy, no file name to invent, no `---` fences to preserve.
 * The post is created hidden, so writing it is never a race against it being
 * visible, and the last step is the one that shows it.
 */
import { useState } from 'react';
import { api, FriendlyError } from '../api';
import { ImageField } from '../components/ImagePicker';
import { useStore } from '../store';

const DIR = 'src/content/blog';

/** The filename is the URL, so it is the title with spaces as hyphens. */
export function slugFor(title: string): string {
  return title
    .trim()
    .replace(/["'`]/g, '')
    .replace(/[\\/:*?<>|#%{}\[\]]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export function NewPost({ onCreated }: { onCreated: (file: string) => void }): JSX.Element {
  const store = useStore();
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [cover, setCover] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugFor(title);
  const ready = slug.length > 0 && excerpt.trim().length > 0;

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

      const today = new Date().toISOString().slice(0, 10);
      const frontmatter = [
        '---',
        `title: "${title.trim().replace(/"/g, '\\"')}"`,
        `excerpt: "${excerpt.trim().replace(/"/g, '\\"')}"`,
        `date: ${today}`,
        ...(cover ? [`cover: "${cover}"`] : []),
        'tags: []',
        'draft: true',
        '---',
        '',
        'כאן מתחיל הפוסט.',
        '',
      ].join('\n');

      await api.save(`פוסט חדש: ${title.trim()}`, [{ path: `${DIR}/${name}`, content: frontmatter }]);
      store.saved();
      onCreated(name);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי ליצור את הפוסט.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className="banner error">{error}</p>}
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

      <div className="save-row">
        <button className="primary" onClick={create} disabled={!ready || busy}>
          {busy ? 'יוצר…' : 'יצירה והתחלת כתיבה'}
        </button>
      </div>
      {!ready && <p className="invalid">צריך כותרת ומשפט הזמנה.</p>}
    </>
  );
}
