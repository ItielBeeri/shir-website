/**
 * The accessibility statement, the terms, and the consent banner.
 *
 * Two duties that the editor guide asks the owner to remember are mechanical
 * here: the `updated` date bumps itself on every save, per file, and editing
 * the banner surfaces the terms section that has to say the same thing.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import { parse as parseToml } from 'smol-toml';
import { setValues } from '../content/toml-edit';
import type { TomlPath } from '../content/toml-edit';
import { useStore } from '../store';
import { CONSENT_PAIR_NOTE, lockForBannerKey, lockForSection } from '../model/locks';

const DOCS = [
  { file: 'src/content/pages/accessibility.toml', title: 'הצהרת נגישות' },
  { file: 'src/content/pages/terms.toml', title: 'תנאי שימוש ופרטיות' },
  { file: 'src/content/pages/consent.toml', title: 'באנר ההסכמה למדידה' },
] as const;

interface Edit {
  path: TomlPath;
  value: string;
}

export function Legal(): JSX.Element {
  const store = useStore();
  const [file, setFile] = useState<string>(DOCS[0].file);

  return (
    <>
      <div className="chips doc-switch">
        {DOCS.map((doc) => (
          <button
            key={doc.file}
            className={file === doc.file ? 'chip is-on' : 'chip'}
            onClick={() => setFile(doc.file)}
          >
            {doc.title}
          </button>
        ))}
      </div>
      <LegalDoc key={file} file={file} role={store.role} />
    </>
  );
}

function LegalDoc({ file, role }: { file: string; role: 'owner' | 'maintainer' }): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [values, setValues_] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  const isConsent = file.endsWith('consent.toml');

  const load = useCallback(async () => {
    const { content } = await api.read(file);
    if (!content) return;
    const collected: Record<string, string> = {};
    for (const { path, value } of walk(parseToml(content))) {
      if (typeof value === 'string') collected[path.join('.')] = value;
    }
    setSource(content);
    setValues_(collected);
    setInitial(collected);
  }, [file]);

  useEffect(() => {
    void load().catch((e: FriendlyError) => setError(e.message));
  }, [load]);

  const dirty = JSON.stringify(values) !== JSON.stringify(initial);

  async function save(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const edits: Edit[] = Object.entries(values)
        .filter(([key, value]) => value !== initial[key])
        .map(([key, value]) => ({ path: key.split('.').map(seg => (/^\d+$/.test(seg) ? Number(seg) : seg)), value }));

      // The date is part of the document's meaning, not bookkeeping: it is
      // shown to visitors and is what makes the statement current.
      if (!isConsent && edits.length) {
        edits.push({ path: ['meta', 'updated'], value: new Date().toISOString().slice(0, 10) });
      }

      const next = setValues(source, edits);
      await api.save(`עדכון ${DOCS.find((d) => d.file === file)?.title}`, [{ path: file, content: next }]);
      setSource(next);
      await load();
      store.saved();
      setNotice(isConsent ? CONSENT_PAIR_NOTE : 'נשמר, ותאריך העדכון התעדכן.');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשמור.');
    } finally {
      setBusy(false);
    }
  }

  if (error && !source) return <p className="banner error">{error}</p>;
  if (!source) return <p className="muted">רגע, טוען…</p>;

  const parsed = parseToml(source) as Record<string, unknown>;
  const groups = describe(file, parsed);

  return (
    <>
      {error && <p className="banner error">{error}</p>}
      {notice && <p className="banner">{notice}</p>}
      {role === 'maintainer' && (
        <p className="banner">את/ה נכנס/ת כמנהל: גם השדות הנעולים פתוחים לעריכה.</p>
      )}

      {groups.map((group) => {
        const lock = group.lockReason ? { reason: group.lockReason } : null;
        const locked = Boolean(lock) && role === 'owner';
        return (
          <section className={locked ? 'group is-locked' : 'group'} key={group.title}>
            <h2>{group.title}</h2>
            {locked && (
              <p className="locked-note">
                <span>{lock!.reason}</span>
                <button className="ghost" onClick={() => setAsked(group.title)}>
                  בקשת שינוי מאיתיאל
                </button>
              </p>
            )}
            {group.fields.map((field) => (
              <div className="field" key={field.key}>
                <label htmlFor={`l-${field.key}`}>{field.label}</label>
                <textarea
                  id={`l-${field.key}`}
                  value={values[field.key] ?? ''}
                  disabled={locked}
                  onChange={(e) => setValues_((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
              </div>
            ))}
          </section>
        );
      })}

      <div className="save-row">
        <button className="primary" onClick={save} disabled={!dirty || busy}>
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {!dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
      </div>

      {asked && (
        <div className="modal-backdrop" onClick={() => setAsked(null)}>
          <div className="modal is-small" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>בקשת שינוי</h2>
            <p>הסעיף «{asked}» מתאר מה האתר באמת עושה, ולכן שינוי שלו נעשה יחד עם שינוי באתר.</p>
            <div className="modal-actions">
              <a
                href={`mailto:?subject=${encodeURIComponent(`בקשת שינוי: ${asked}`)}`}
                className="as-button primary"
              >
                שליחת בקשה
              </a>
              <button className="ghost" onClick={() => setAsked(null)}>סגירה</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------ shape description ---------------------------- */

interface Group {
  title: string;
  lockReason?: string;
  fields: Array<{ key: string; label: string }>;
}

function walk(value: unknown, path: TomlPath = []): Array<{ path: TomlPath; value: unknown }> {
  if (Array.isArray(value)) return value.flatMap((v, i) => walk(v, [...path, i]));
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => walk(v, [...path, k]));
  }
  return [{ path, value }];
}

/** The document's own shape, turned into titled groups of text areas. */
function describe(file: string, parsed: Record<string, unknown>): Group[] {
  if (file.endsWith('consent.toml')) {
    const banner = (parsed.banner ?? {}) as Record<string, string>;
    const LABELS: Record<string, string> = {
      title: 'כותרת הבאנר',
      body: 'נוסח ההסבר',
      accept: 'כפתור האישור',
      decline: 'כפתור הדחייה',
      policy_prefix: 'המשפט לפני הקישור',
      policy_label: 'כיתוב הקישור',
      settings_label: 'כיתוב כפתור ההגדרות',
      aria_label: 'תיאור הבאנר להקראה',
    };
    return Object.keys(banner)
      .filter((key) => LABELS[key])
      .map((key) => ({
        title: LABELS[key],
        lockReason: lockForBannerKey(key)?.reason,
        fields: [{ key: `banner.${key}`, label: LABELS[key] }],
      }));
  }

  const groups: Group[] = [];
  const meta = (parsed.meta ?? {}) as Record<string, string>;
  groups.push({
    title: 'ראש העמוד',
    fields: [
      { key: 'meta.title', label: 'הכותרת' },
      { key: 'meta.description', label: 'תיאור לתוצאות חיפוש' },
      ...(meta.intro !== undefined ? [{ key: 'meta.intro', label: 'שורת הפתיחה' }] : []),
    ],
  });

  const sections = (parsed.sections ?? []) as Array<{ title: string; body?: string[]; items?: string[] }>;
  sections.forEach((section, i) => {
    groups.push({
      title: section.title,
      lockReason: lockForSection(file, section.title)?.reason,
      fields: [
        ...(section.body ?? []).map((_, j) => ({ key: `sections.${i}.body.${j}`, label: `פסקה ${j + 1}` })),
        ...(section.items ?? []).map((_, j) => ({ key: `sections.${i}.items.${j}`, label: `שורה ${j + 1}` })),
      ],
    });
  });

  const parts = (parsed.parts ?? []) as Array<{
    heading: string;
    sections?: Array<{ title: string; body?: string[]; items?: string[] }>;
  }>;
  parts.forEach((part, i) => {
    (part.sections ?? []).forEach((section, j) => {
      groups.push({
        title: `${part.heading} · ${section.title}`,
        lockReason: lockForSection(file, section.title)?.reason,
        fields: [
          ...(section.body ?? []).map((_, k) => ({
            key: `parts.${i}.sections.${j}.body.${k}`,
            label: `פסקה ${k + 1}`,
          })),
          ...(section.items ?? []).map((_, k) => ({
            key: `parts.${i}.sections.${j}.items.${k}`,
            label: `שורה ${k + 1}`,
          })),
        ],
      });
    });
  });

  return groups.filter((g) => g.fields.length > 0);
}
