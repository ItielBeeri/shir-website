/**
 * The accessibility statement, the terms, and the consent banner.
 *
 * Two duties that the editor guide asks the owner to remember are mechanical
 * here: the `updated` date bumps itself on every save, per file, and editing
 * the banner surfaces the terms section that has to say the same thing.
 *
 * A section's paragraphs are a list, not a fixed set of boxes. These documents
 * describe what the site actually does, and what the site does gains and loses
 * clauses - so a sentence can be added and removed here, not only rewritten.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import { parse as parseToml } from 'smol-toml';
import { setStringArray, setValues } from '../content/toml-edit';
import type { TomlPath } from '../content/toml-edit';
import { ParagraphsInput } from '../components/Fields';
import { DraftOffer, useDraftKeeper } from '../lib/unsaved';
import { useStore } from '../store';
import { CONSENT_PAIR_NOTE, lockForBannerKey, lockForSection } from '../model/locks';
import { bannerProblems, legalProblems, measurementSection } from '../model/legal';
import { todayInIsrael } from '../lib/today';

const DOCS = [
  { file: 'src/content/pages/accessibility.toml', title: 'הצהרת נגישות' },
  { file: 'src/content/pages/terms.toml', title: 'תנאי שימוש ופרטיות' },
  { file: 'src/content/pages/consent.toml', title: 'באנר ההסכמה למדידה' },
] as const;

const TERMS_FILE = DOCS[1].file;

interface Edit {
  path: TomlPath;
  value: string;
}

const toPath = (key: string): TomlPath =>
  key.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg));

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
  const [lists, setLists] = useState<Record<string, string[]>>({});
  const [initialLists, setInitialLists] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  /** The terms section the banner has to agree with, and whether she read it. */
  const [pair, setPair] = useState<{ title: string; lines: string[] } | null>(null);
  const [paired, setPaired] = useState(false);

  const isConsent = file.endsWith('consent.toml');

  const load = useCallback(async () => {
    const { content } = await api.read(file);
    if (!content) return;
    const parsed = parseToml(content);
    const collected: Record<string, string> = {};
    const collectedLists: Record<string, string[]> = {};
    for (const { path, value } of walk(parsed)) {
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        collectedLists[path.join('.')] = value as string[];
      } else if (typeof value === 'string') {
        collected[path.join('.')] = value;
      }
    }
    setSource(content);
    setValues_(collected);
    setInitial(collected);
    setLists(collectedLists);
    setInitialLists(collectedLists);
  }, [file]);

  useEffect(() => {
    void load().catch((e: FriendlyError) => setError(e.message));
  }, [load]);

  // The banner is the first layer of a disclosure the terms complete, so the
  // matching section is brought here rather than left to be remembered.
  useEffect(() => {
    if (!isConsent) return;
    void api
      .read(TERMS_FILE)
      .then(({ content }) => setPair(content ? measurementSection(content) : null))
      .catch(() => undefined);
  }, [isConsent]);

  const dirty =
    JSON.stringify(values) !== JSON.stringify(initial) ||
    JSON.stringify(lists) !== JSON.stringify(initialLists);

  const draft = useDraftKeeper(file, { values, lists }, { dirty, ready: source !== null });

  /**
   * The balance rules, live. They are the reason a save is refused, so she
   * reads them beside the field rather than after a round trip that says no.
   */
  const bannerIssues = isConsent
    ? bannerProblems(
        Object.fromEntries(
          Object.entries(values)
            .filter(([key]) => key.startsWith('banner.'))
            .map(([key, value]) => [key.slice('banner.'.length), value]),
        ),
      )
    : [];

  const bannerChanged =
    isConsent && ['banner.title', 'banner.body', 'banner.accept', 'banner.decline'].some(
      (key) => values[key] !== initial[key],
    );

  async function save(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      // Lists first and one at a time: each rewrite moves every byte after it,
      // so the ranges the next edit needs are only valid once it has landed.
      let next = source;
      for (const [key, items] of Object.entries(lists)) {
        if (JSON.stringify(items) === JSON.stringify(initialLists[key])) continue;
        next = setStringArray(next, toPath(key), items);
      }

      const edits: Edit[] = Object.entries(values)
        .filter(([key, value]) => value !== initial[key])
        .map(([key, value]) => ({ path: toPath(key), value }));

      // The date is part of the document's meaning, not bookkeeping: it is
      // shown to visitors and is what makes the statement current.
      if (!isConsent && dirty) {
        edits.push({ path: ['meta', 'updated'], value: todayInIsrael() });
      }

      next = setValues(next, edits);

      // The same rules the API runs, run here first so she reads the reason
      // next to the field rather than after a round trip that refuses her.
      const problems = legalProblems(file, source, next, role);
      if (problems.length > 0) {
        setError(problems[0].reason);
        return;
      }

      await api.save(`עדכון ${DOCS.find((d) => d.file === file)?.title}`, [{ path: file, content: next }]);
      setSource(next);
      await load();
      store.saved();
      setPaired(false);
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
      <DraftOffer
        keeper={draft}
        onRestore={(value) => {
          setValues_(value.values);
          setLists(value.lists);
        }}
      />
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
            {group.fields.map((field) =>
              field.kind === 'list' ? (
                <div className="field" key={field.key}>
                  <span className="field-label">{field.label}</span>
                  <ParagraphsInput
                    value={lists[field.key] ?? []}
                    disabled={locked}
                    itemLabel={field.itemLabel}
                    onChange={(items) => setLists((prev) => ({ ...prev, [field.key]: items }))}
                  />
                </div>
              ) : (
                <div className="field" key={field.key}>
                  <label htmlFor={`l-${field.key}`}>{field.label}</label>
                  <textarea
                    id={`l-${field.key}`}
                    value={values[field.key] ?? ''}
                    disabled={locked}
                    onChange={(e) => setValues_((prev) => ({ ...prev, [field.key]: e.target.value }))}
                  />
                </div>
              ),
            )}
          </section>
        );
      })}

      {/* X-14: the two say the same thing or they contradict each other, so
          the other one is here rather than somewhere she has to remember. */}
      {isConsent && bannerChanged && (
        <section className="group is-paired">
          <h2>הסעיף המקביל בתנאי השימוש</h2>
          <p className="help">{CONSENT_PAIR_NOTE}</p>
          {pair ? (
            <>
              <p className="muted">«{pair.title}»</p>
              <ul className="pair-lines">
                {pair.lines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">לא הצלחתי לטעון את הסעיף. כדאי לפתוח את תנאי השימוש ולבדוק ידנית.</p>
          )}
          <div className="switch">
            <input
              id="pair-read"
              type="checkbox"
              checked={paired}
              onChange={(e) => setPaired(e.target.checked)}
            />
            <label htmlFor="pair-read">קראתי, והשניים אומרים את אותו הדבר</label>
          </div>
        </section>
      )}

      {/* Beside the button: the save is at the foot of a long document. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      {bannerIssues.length > 0 && (
        <ul className="invalid banner-issues">
          {bannerIssues.map((problem, i) => (
            <li key={i}>{problem.reason}</li>
          ))}
        </ul>
      )}

      <div className="save-row">
        <button
          className="primary"
          onClick={save}
          disabled={!dirty || busy || bannerIssues.length > 0 || (bannerChanged && !paired)}
        >
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {!dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
      </div>
      {bannerChanged && !paired && (
        <p className="invalid">צריך לאשר שקראת את הסעיף המקביל בתנאי השימוש.</p>
      )}

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

type LegalField =
  | { kind: 'text'; key: string; label: string }
  | { kind: 'list'; key: string; label: string; itemLabel: string };

interface Group {
  title: string;
  lockReason?: string;
  fields: LegalField[];
}

function walk(value: unknown, path: TomlPath = []): Array<{ path: TomlPath; value: unknown }> {
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'string')) return [{ path, value }];
    return value.flatMap((v, i) => walk(v, [...path, i]));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => walk(v, [...path, k]));
  }
  return [{ path, value }];
}

/** The document's own shape, turned into titled groups of fields. */
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
        fields: [{ kind: 'text' as const, key: `banner.${key}`, label: LABELS[key] }],
      }));
  }

  const groups: Group[] = [];
  const meta = (parsed.meta ?? {}) as Record<string, string>;
  groups.push({
    title: 'ראש העמוד',
    fields: [
      { kind: 'text', key: 'meta.title', label: 'הכותרת' },
      { kind: 'text', key: 'meta.description', label: 'תיאור לתוצאות חיפוש' },
      ...(meta.intro !== undefined
        ? [{ kind: 'text' as const, key: 'meta.intro', label: 'שורת הפתיחה' }]
        : []),
    ],
  });

  const sectionFields = (prefix: string, section: { body?: string[]; items?: string[] }): LegalField[] => [
    ...(section.body ? [{ kind: 'list' as const, key: `${prefix}.body`, label: 'הפסקאות', itemLabel: 'פסקה' }] : []),
    ...(section.items ? [{ kind: 'list' as const, key: `${prefix}.items`, label: 'הרשימה', itemLabel: 'שורה' }] : []),
  ];

  const sections = (parsed.sections ?? []) as Array<{ title: string; body?: string[]; items?: string[] }>;
  sections.forEach((section, i) => {
    groups.push({
      title: section.title,
      lockReason: lockForSection(file, section.title)?.reason,
      fields: sectionFields(`sections.${i}`, section),
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
        fields: sectionFields(`parts.${i}.sections.${j}`, section),
      });
    });
  });

  return groups.filter((g) => g.fields.length > 0);
}
