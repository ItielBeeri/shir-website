/**
 * The gallery.
 *
 * Every image is one card: what it looks like, what it is called for screen
 * readers, and whether anything still uses it. Ids and file paths never
 * surface - a photo is identified by looking at it.
 *
 * The add button is the file input itself. Opening the picker first meant
 * choosing before adding, which is three taps to do the one thing this screen
 * is for.
 */
import { useState } from 'react';
import { api, FriendlyError } from '../api';
import { useStore } from '../store';
import { AltFields, UploadButton, UploadPanel, altMissing } from '../components/ImageUpload';
import type { Chosen } from '../components/ImageUpload';
import { findUsage, imagePathFor, processImage } from '../lib/images';
import { screens } from '../model/screens';
import { describePath } from './Misc';
import type { Usage } from '../lib/images';
import { setValue } from '../content/toml-edit';
import { removeImage } from '../content/toml-struct';

const GALLERY = 'src/content/images.toml';

/**
 * Everywhere an image id can appear, derived from the model rather than listed.
 *
 * A hard-coded list silently stops covering a page the day one is added, and
 * the check it feeds is what stops a delete from breaking the build. An id
 * reaches the site through a TOML field of type `image`, or through any MDX
 * file - its frontmatter or a `<SoftImage>` in its body.
 */
async function referencingFiles(): Promise<Array<{ path: string; label: string; content: string }>> {
  const tomls = screens
    .filter((s) => s.file?.endsWith('.toml'))
    .filter((s) => (s.groups ?? []).some((g) => g.fields.some((f) => f.type === 'image')))
    .map((s) => ({ path: s.file as string, label: s.title }));

  const singleMdx = screens
    .filter((s) => s.file?.endsWith('.mdx'))
    .map((s) => ({ path: s.file as string, label: s.title }));

  const dirs = [...new Set(screens.map((s) => s.dir).filter(Boolean) as string[])];
  const listed = (
    await Promise.all(
      dirs.map(async (dir) => {
        const { files } = await api.list(dir);
        return files
          .filter((f) => f.endsWith('.mdx'))
          .map((f) => ({ path: `${dir}/${f}`, label: describePath(`${dir}/${f}`) }));
      }),
    )
  ).flat();

  const all = [...tomls, ...singleMdx, ...listed];
  const unique = all.filter((f, i) => all.findIndex((o) => o.path === f.path) === i);
  return Promise.all(
    unique.map(async (f) => ({ ...f, content: (await api.read(f.path)).content ?? '' })),
  );
}

interface Editing {
  id: string;
  alt: string;
  decorative: boolean;
}

export function Images(): JSX.Element {
  const store = useStore();
  const [adding, setAdding] = useState<Chosen | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** `found: null` means the scan is still running. */
  const [usage, setUsage] = useState<{ id: string; found: Usage[] | null } | null>(null);

  /** Description and decorative travel together: they are one decision. */
  async function saveDescription(edit: Editing): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const { content } = await api.read(GALLERY);
      if (!content) return;
      const alt = edit.decorative ? '' : edit.alt.trim();
      await api.save('עדכון תיאור תמונה', [
        { path: GALLERY, content: setValue(content, [edit.id, 'alt'], alt) },
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

  /**
   * Never orphan a reference: check first, and say where it is used. Reading
   * every page takes a few seconds, so the dialog opens first and says it is
   * checking - the button used to sit silent long enough to look broken.
   */
  async function askDelete(id: string): Promise<void> {
    setBusy(true);
    setError(null);
    setUsage({ id, found: null });
    try {
      setUsage({ id, found: findUsage(id, await referencingFiles()) });
    } catch (e) {
      setUsage(null);
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
      // One commit, like the add: two would leave an entry naming a file that
      // is gone, which is a failed build rather than a missing picture.
      await api.save(
        `מחיקת תמונה: ${image.alt || 'ללא תיאור'}`,
        [{ path: GALLERY, content: next }],
        [`public${image.file}`],
      );
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
      {error && <p className="banner error" role="alert">{error}</p>}
      {notice && <p className="banner">{notice}</p>}

      <UploadButton
        label="+ העלאת תמונה חדשה"
        className="primary wide as-button"
        onChosen={(chosen) => {
          setNotice(null);
          setAdding(chosen);
        }}
        onFailed={setError}
      />

      <ul className="gallery">
        {store.gallery.map((image) => {
          const url = store.urlFor(image.id, 240);
          return (
            <li key={image.id} className="gallery-card">
              {url ? <img src={url} alt="" loading="lazy" /> : <span className="image-empty">—</span>}

              <p className="gallery-alt">
                {image.alt || <span className="muted">תמונת קישוט, בלי תיאור</span>}
              </p>

              <div className="gallery-actions">
                <button
                  className="ghost"
                  onClick={() =>
                    setEditing({ id: image.id, alt: image.alt, decorative: image.alt === '' })
                  }
                >
                  שינוי תיאור
                </button>
                <label className="ghost as-button">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) void replace(image.id, file);
                    }}
                  />
                  <span>החלפת התמונה</span>
                </label>
                <button className="ghost danger" onClick={() => askDelete(image.id)} disabled={busy}>
                  מחיקה
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="תמונה חדשה"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>תמונה חדשה</h2>
              <button className="ghost" onClick={() => setAdding(null)} aria-label="סגירה">✕</button>
            </div>
            <UploadPanel
              chosen={adding}
              confirmLabel="הוספה לגלריה"
              onUploaded={() => {
                setAdding(null);
                setNotice('התמונה נוספה לגלריה.');
              }}
              onCancel={() => setAdding(null)}
            />
          </div>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="תיאור התמונה"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-head">
              <h2>תיאור התמונה</h2>
              <button className="ghost" onClick={() => setEditing(null)} aria-label="סגירה">✕</button>
            </div>

            {store.urlFor(editing.id) && (
              <img src={store.urlFor(editing.id)!} alt="" className="upload-preview" />
            )}

            <AltFields
              id="gallery"
              alt={editing.alt}
              decorative={editing.decorative}
              onAlt={(alt) => setEditing((e) => (e ? { ...e, alt } : e))}
              onDecorative={(decorative) => setEditing((e) => (e ? { ...e, decorative } : e))}
            />

            <div className="modal-actions">
              <button
                className="primary"
                onClick={() => saveDescription(editing)}
                disabled={busy || altMissing(editing.alt, editing.decorative)}
              >
                {busy ? 'שומר…' : 'שמירה'}
              </button>
              <button className="ghost" onClick={() => setEditing(null)} disabled={busy}>
                ביטול
              </button>
            </div>
            {altMissing(editing.alt, editing.decorative) && (
              <p className="invalid">צריך לכתוב מה רואים בתמונה, או לסמן שהיא קישוט בלבד.</p>
            )}
          </div>
        </div>
      )}

      {usage && (
        <div className="modal-backdrop" onClick={() => setUsage(null)}>
          <div className="modal is-small" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            {usage.found === null ? (
              <>
                <h2>רגע, בודקת</h2>
                <p className="muted">
                  <span className="spinner" aria-hidden="true" />
                  עוברת על כל העמודים כדי לוודא שאף אחד לא משתמש בתמונה הזו.
                </p>
              </>
            ) : usage.found.length > 0 ? (
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
