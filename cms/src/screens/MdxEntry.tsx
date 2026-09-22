/**
 * One MDX file: its details at the top, its body below.
 *
 * Serves about, the therapy pages and every blog post, because they are the
 * same shape - which is why `src/content/config.ts` can declare them with the
 * same handful of field types.
 */
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { api, FriendlyError } from '../api';
import { FieldInput } from '../components/Fields';
import type { FieldValue } from '../components/Fields';
import { allBlocks, parseMdx, serializeMdx } from '../content/mdx-edit';
import { docToPm, pmToDoc } from '../content/pm-convert';
import type { PmNode } from '../content/pm-convert';
import { hasField, parseFrontmatter, setField, setFields } from '../content/frontmatter';
import type { FrontmatterValue } from '../content/frontmatter';
import { useStore } from '../store';
import { slugFor } from '../lib/slug';
import { DraftOffer, useDraftKeeper } from '../lib/unsaved';
import type { Field } from '../model/types';

/**
 * The rich-text editor is most of the bundle and is needed only on a screen
 * that has a body to edit, so it arrives when one opens rather than before
 * the landing screen can paint.
 */
const BodyEditor = lazy(async () => ({
  default: (await import('../components/BodyEditor')).BodyEditor,
}));

interface Props {
  path: string;
  title: string;
  fields: Field[];
  onSaved: () => void;
  onDeleted?: () => void;
  /** Only where the file name is the public address: a blog post. */
  onRenamed?: (file: string) => void;
  deletable?: boolean;
}

export function MdxEntry({
  path,
  title,
  fields,
  onSaved,
  onDeleted,
  onRenamed,
  deletable,
}: Props): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [pm, setPm] = useState<PmNode | null>(null);
  const [frontmatterRaw, setFrontmatterRaw] = useState('');
  const [values, setValues] = useState<Record<string, FieldValue>>({});
  const [initial, setInitial] = useState<Record<string, FieldValue>>({});
  const [bodyTouched, setBodyTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  /** Bumped to remount the editor when a whole document is put back. */
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setSource(null);
    api
      .read(path)
      .then(({ content }) => {
        if (cancelled || content === null) return;
        const fm = parseFrontmatter(content);
        const next: Record<string, FieldValue> = {};
        for (const field of fields) {
          const raw = fm.data[field.key];
          next[field.key] = normalise(raw, field);
        }
        const parsed = parseMdx(content);
        setSource(content);
        setFrontmatterRaw(parsed.frontmatter);
        setPm(docToPm(parsed));
        setValues(next);
        setInitial(next);
        setBodyTouched(false);
      })
      .catch((e: FriendlyError) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [path, fields]);

  const dirty = useMemo(
    () => bodyTouched || fields.some((f) => !same(values[f.key], initial[f.key])),
    [bodyTouched, fields, values, initial],
  );

  const missing = fields.filter((f) => f.required && isEmpty(values[f.key]));

  const draft = useDraftKeeper(
    path,
    { values, pm },
    { dirty, ready: source !== null && pm !== null },
  );

  async function save(): Promise<void> {
    if (!source || !pm) return;
    setBusy(true);
    setError(null);
    try {
      // Body first, then the frontmatter splices on top of the result.
      let next = source;
      if (bodyTouched) {
        const back = pmToDoc(pm, frontmatterRaw);
        next = serializeMdx(back, allBlocks(back));
      }
      const edits = fields
        .filter((f) => !same(values[f.key], initial[f.key]))
        .map((f) => ({
          key: f.key,
          value: (f.invert ? !values[f.key] : values[f.key]) as FrontmatterValue | undefined,
        }));
      // The model's order places a key the file does not carry yet - an
      // optional field left blank until now - beside the ones it belongs with.
      if (edits.length) next = setFields(next, edits, { order: fields.map((f) => f.key) });

      await api.save(`עדכון ${title}`, [{ path, content: next }]);
      const reparsed = parseMdx(next);
      setSource(next);
      setFrontmatterRaw(reparsed.frontmatter);
      setPm(docToPm(reparsed));
      setInitial(values);
      setBodyTouched(false);
      store.saved();
      onSaved();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשמור.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      await api.remove([path], `מחיקת ${title}`);
      store.saved();
      onDeleted?.();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי למחוק.');
      setBusy(false);
    }
  }

  /**
   * The file name is the address, and Astro lets a `slug` field override it -
   * so both move together or the post keeps answering at its old URL. One
   * commit, because a post that exists at two addresses is worse than either.
   */
  async function rename(): Promise<void> {
    if (!source) return;
    const stem = slugFor(renaming ?? '');
    const dir = path.slice(0, path.lastIndexOf('/'));
    const target = `${dir}/${stem}.mdx`;
    setRenameBusy(true);
    setRenameError(null);
    try {
      const { files } = await api.list(dir);
      if (files.includes(`${stem}.mdx`)) {
        setRenameError('כבר יש פוסט בכתובת הזו. צריך לבחור כותרת אחרת.');
        return;
      }
      const next = hasField(source, 'slug') ? setField(source, 'slug', stem) : source;
      await api.rename(path, target, next, `שינוי כתובת: ${title} ← ${stem}`);
      store.saved();
      setRenaming(null);
      onRenamed?.(`${stem}.mdx`);
    } catch (e) {
      setRenameError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשנות את הכתובת.');
    } finally {
      setRenameBusy(false);
    }
  }

  if (error && !source) return <p className="banner error">{error}</p>;
  if (!source || !pm) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      <DraftOffer
        keeper={draft}
        onRestore={(value) => {
          setValues(value.values);
          if (value.pm) setPm(value.pm);
          setBodyTouched(true);
          // The editor reads its document once, at construction.
          setRevision((n) => n + 1);
        }}
      />

      <section className="group">
        <h2>הפרטים</h2>
        {fields.map((field) => (
          <FieldInput
            key={field.key}
            field={field}
            value={values[field.key]}
            onChange={(value) => setValues((prev) => ({ ...prev, [field.key]: value }))}
          />
        ))}
      </section>

      <h2 className="section-heading">הטקסט</h2>
      {/* Keyed by file: a new document is a new editor, so undo never reaches
          back past the moment it was opened. */}
      <Suspense fallback={<p className="muted">רגע, טוען את העורך…</p>}>
        <BodyEditor
          key={`${path}#${revision}`}
          value={pm}
          onChange={(next) => {
            setPm(next);
            setBodyTouched(true);
          }}
        />
      </Suspense>

      {/* Beside the button, not at the top: she is at the foot of a long form
          when she presses Save, and a message she has to scroll up to find is
          a message she never sees. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="save-row">
        <button className="primary" onClick={save} disabled={!dirty || busy || missing.length > 0}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {!dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
        {onRenamed && (
          <button className="ghost" onClick={() => setRenaming(title)} disabled={busy}>
            שינוי הכתובת
          </button>
        )}
        {deletable && (
          <button className="ghost danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            מחיקה
          </button>
        )}
      </div>
      {missing.length > 0 && (
        <p className="invalid">צריך למלא: {missing.map((f) => f.label).join(', ')}</p>
      )}

      {renaming !== null && (
        <div className="modal-backdrop" onClick={() => !renameBusy && setRenaming(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="שינוי הכתובת" onClick={(e) => e.stopPropagation()}>
            <h2>הכתובת של הפוסט</h2>
            <p className="help">
              הכתובת נגזרת מהכותרת. אם שינית את הכותרת ורוצה שגם הכתובת תשתנה, אפשר לעדכן
              אותה כאן.
            </p>

            <div className="field">
              <label htmlFor="rename-to">הכותרת שממנה תיגזר הכתובת</label>
              <input
                id="rename-to"
                type="text"
                value={renaming}
                onChange={(e) => setRenaming(e.target.value)}
              />
            </div>

            <p className="muted">
              הכתובת החדשה תהיה: <span dir="ltr">/blog/{slugFor(renaming) || '…'}</span>
            </p>
            <p className="invalid">
              הכתובת הישנה תפסיק לעבוד. אם שלחת אותה למישהו או שהיא מופיעה במקום אחר,
              הקישור יישבר.
            </p>

            {renameError && <p className="banner error" role="alert">{renameError}</p>}

            <div className="modal-actions">
              <button
                className="primary"
                onClick={rename}
                disabled={renameBusy || !slugFor(renaming) || `${slugFor(renaming)}.mdx` === path.split('/').pop()}
              >
                {renameBusy ? 'משנה…' : 'שינוי הכתובת'}
              </button>
              <button className="ghost" onClick={() => setRenaming(null)} disabled={renameBusy}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-backdrop" onClick={() => setConfirmDelete(false)}>
          <div className="modal is-small" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>למחוק את «{title}»?</h2>
            <p className="muted">
              אפשר לשחזר אחר כך ממסך ההיסטוריה, אבל עדיף פשוט להסתיר אם יש ספק.
            </p>
            <div className="modal-actions">
              <button className="danger" onClick={remove} disabled={busy}>
                כן, למחוק
              </button>
              <button className="ghost" onClick={() => setConfirmDelete(false)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function normalise(raw: unknown, field: Field): FieldValue {
  if (raw === undefined || raw === null) return field.type === 'tags' ? [] : undefined;
  if (field.type === 'date') {
    const date = raw instanceof Date ? raw : new Date(String(raw));
    return Number.isNaN(date.getTime()) ? String(raw) : date.toISOString().slice(0, 10);
  }
  if (field.type === 'tags') return Array.isArray(raw) ? raw.map(String) : [];
  if (field.type === 'boolean') return field.invert ? !raw : Boolean(raw);
  if (field.type === 'number') return typeof raw === 'number' ? raw : Number(raw);
  return String(raw);
}

const same = (a: FieldValue, b: FieldValue): boolean => JSON.stringify(a) === JSON.stringify(b);

const isEmpty = (v: FieldValue): boolean =>
  v === undefined || v === null || (typeof v === 'string' && !v.trim());
