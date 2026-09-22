/**
 * The gallery.
 *
 * Every image is one card: what it looks like, what it is called for screen
 * readers, and whether anything still uses it. Ids and file paths never
 * surface - a photo is identified by looking at it.
 */
import { useState } from 'react';
import { api, FriendlyError } from '../api';
import { useStore } from '../store';
import { ImagePicker } from '../components/ImagePicker';
import { findUsage, imagePathFor, processImage } from '../lib/images';
import type { Usage } from '../lib/images';
import { setValue } from '../content/toml-edit';
import { removeImage } from '../content/toml-struct';

const GALLERY = 'src/content/images.toml';

/** Everywhere an image id can appear, with the Hebrew name of the place. */
const REFERENCING: Array<{ path: string; label: string }> = [
  { path: 'src/content/pages/home.toml', label: 'דף הבית' },
  { path: 'src/content/about/about.mdx', label: 'עמוד אודות' },
  { path: 'src/content/therapies/psychotherapy.mdx', label: 'פסיכותרפיה' },
  { path: 'src/content/therapies/shiatsu.mdx', label: 'טיפול במגע' },
  { path: 'src/content/therapies/voice.mdx', label: 'פתיחת קול' },
];

export function Images(): JSX.Element {
  const store = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usage, setUsage] = useState<{ id: string; found: Usage[] } | null>(null);

  async function saveAlt(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { content } = await api.read(GALLERY);
      if (!content) return;
      await api.save('עדכון תיאור תמונה', [
        { path: GALLERY, content: setValue(content, [id, 'alt'], alt.trim()) },
      ]);
      await store.refreshGallery();
      store.saved();
      setEditing(null);
      setNotice('התיאור נשמר.');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשמור.');
    } finally {
      setBusy(false);
    }
  }

  /** Replace the picture, keep the id, so every page using it follows along. */
  async function replace(id: string, file: File): Promise<void> {
    const image = store.gallery.find((g) => g.id === id);
    if (!image) return;
    setBusy(true);
    setError(null);
    try {
      const processed = await processImage(file);
      await api.save(`החלפת תמונה: ${image.alt || id}`, [
        { path: `public${image.file}`, content: processed.base64, encoding: 'base64' },
      ]);
      store.saved();
      setNotice('התמונה הוחלפה בכל מקום שבו היא מופיעה.');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי להחליף את התמונה.');
    } finally {
      setBusy(false);
    }
  }

  /** Never orphan a reference: check first, and say where it is used. */
  async function askDelete(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const files = await Promise.all(
        REFERENCING.map(async (f) => ({ ...f, content: (await api.read(f.path)).content ?? '' })),
      );
      const { files: posts } = await api.list('src/content/blog');
      const postFiles = await Promise.all(
        posts
          .filter((f) => f.endsWith('.mdx'))
          .map(async (f) => ({
            path: `src/content/blog/${f}`,
            label: `הפוסט ${f.replace(/\.mdx$/, '')}`,
            content: (await api.read(`src/content/blog/${f}`)).content ?? '',
          })),
      );
      setUsage({ id, found: findUsage(id, [...files, ...postFiles]) });
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לבדוק היכן התמונה בשימוש.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: string): Promise<void> {
    const image = store.gallery.find((g) => g.id === id);
    if (!image) return;
    setBusy(true);
    try {
      const { content } = await api.read(GALLERY);
      if (!content) return;
      const next = removeImage(content, id);
      await api.save(`מחיקת תמונה: ${image.alt || id}`, [{ path: GALLERY, content: next }]);
      await api.remove([`public${image.file}`], 'מחיקת קובץ התמונה');
      await store.refreshGallery();
      store.saved();
      setUsage(null);
      setNotice('התמונה נמחקה.');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי למחוק.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error && <p className="banner error">{error}</p>}
      {notice && <p className="banner">{notice}</p>}

      <button className="primary wide" onClick={() => setAdding(true)}>
        + העלאת תמונה חדשה
      </button>

      <ul className="gallery">
        {store.gallery.map((image) => {
          const url = store.urlFor(image.id);
          return (
            <li key={image.id} className="gallery-card">
              {url ? <img src={url} alt="" loading="lazy" /> : <span className="image-empty">—</span>}

              {editing === image.id ? (
                <div className="gallery-edit">
                  <label htmlFor={`alt-${image.id}`}>מה רואים בתמונה?</label>
                  <input
                    id={`alt-${image.id}`}
                    type="text"
                    value={alt}
                    onChange={(e) => setAlt(e.target.value)}
                  />
                  <div className="modal-actions">
                    <button className="primary" onClick={() => saveAlt(image.id)} disabled={busy}>
                      שמירה
                    </button>
                    <button className="ghost" onClick={() => setEditing(null)}>ביטול</button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="gallery-alt">{image.alt || <span className="muted">תמונת קישוט</span>}</p>
                  <div className="gallery-actions">
                    <button
                      className="ghost"
                      onClick={() => {
                        setEditing(image.id);
                        setAlt(image.alt);
                      }}
                    >
                      שינוי תיאור
                    </button>
                    <label className="ghost as-button">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => e.target.files?.[0] && void replace(image.id, e.target.files[0])}
                      />
                      <span>החלפת התמונה</span>
                    </label>
                    <button className="ghost danger" onClick={() => askDelete(image.id)} disabled={busy}>
                      מחיקה
                    </button>
                  </div>
                </>
              )}
            </li>
          );
        })}
      </ul>

      {adding && (
        <ImagePicker onPick={() => setNotice('התמונה נוספה לגלריה.')} onClose={() => setAdding(false)} />
      )}

      {usage && (
        <div className="modal-backdrop" onClick={() => setUsage(null)}>
          <div className="modal is-small" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {usage.found.length > 0 ? (
              <>
                <h2>אי אפשר למחוק</h2>
                <p>התמונה הזו בשימוש ב:</p>
                <ul className="usage">
                  {usage.found.map((u) => (
                    <li key={u.path}>{u.where}</li>
                  ))}
                </ul>
                <p className="muted">
                  כדי למחוק, צריך קודם להחליף אותה בכל מקום שמופיע כאן.
                </p>
                <div className="modal-actions">
                  <button className="ghost" onClick={() => setUsage(null)}>הבנתי</button>
                </div>
              </>
            ) : (
              <>
                <h2>למחוק את התמונה?</h2>
                <p className="muted">אף עמוד לא משתמש בה כרגע.</p>
                <div className="modal-actions">
                  <button className="danger" onClick={() => confirmDelete(usage.id)} disabled={busy}>
                    כן, למחוק
                  </button>
                  <button className="ghost" onClick={() => setUsage(null)}>ביטול</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export { imagePathFor };
