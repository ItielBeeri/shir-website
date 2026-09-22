/**
 * One MDX file: its details at the top, its body below.
 *
 * Serves about, the therapy pages and every blog post, because they are the
 * same shape - which is why `src/content/config.ts` can declare them with the
 * same handful of field types.
 */
import { useEffect, useMemo, useState } from 'react';
import { api, FriendlyError } from '../api';
import { BodyEditor } from '../components/BodyEditor';
import { FieldInput } from '../components/Fields';
import type { FieldValue } from '../components/Fields';
import { allBlocks, parseMdx, serializeMdx } from '../content/mdx-edit';
import { docToPm, pmToDoc } from '../content/pm-convert';
import type { PmNode } from '../content/pm-convert';
import { parseFrontmatter, setFields } from '../content/frontmatter';
import type { FrontmatterValue } from '../content/frontmatter';
import { useStore } from '../store';
import type { Field } from '../model/types';

interface Props {
  path: string;
  title: string;
  fields: Field[];
  onSaved: () => void;
  onDeleted?: () => void;
  deletable?: boolean;
}

export function MdxEntry({ path, title, fields, onSaved, onDeleted, deletable }: Props): JSX.Element {
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
          value: (f.invert ? !values[f.key] : values[f.key]) as FrontmatterValue,
        }));
      if (edits.length) next = setFields(next, edits);

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

  if (error && !source) return <p className="banner error">{error}</p>;
  if (!source || !pm) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      {error && <p className="banner error">{error}</p>}

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
      <BodyEditor
        value={pm}
        onChange={(next) => {
          setPm(next);
          setBodyTouched(true);
        }}
      />

      <div className="save-row">
        <button className="primary" onClick={save} disabled={!dirty || busy || missing.length > 0}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {!dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
        {deletable && (
          <button className="ghost danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            מחיקה
          </button>
        )}
      </div>
      {missing.length > 0 && (
        <p className="invalid">צריך למלא: {missing.map((f) => f.label).join(', ')}</p>
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
