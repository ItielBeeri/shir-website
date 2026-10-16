/**
 * Recommendations.
 *
 * Adding one is a single act: drop the screenshot, paste the text. The id and
 * the screenshot path are derived, so the editor guide's most destructive
 * mistake - a `screenshot` line that names a file that is not there, which
 * fails the build and takes every recommendation off the site - cannot happen.
 *
 * Editing is the same act: one form holding everything a recommendation is,
 * saved once. Every field committing the moment it is touched turned a card of
 * corrections into a page of history and left no way back from a half-made
 * change - the screens with forms all work the other way, and so does this.
 *
 * File order is display order (`loadRecommendations` does not re-sort), so the
 * list here is the list a visitor sees.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, FriendlyError } from '../api';
import { useStore } from '../store';
import { setValue } from '../content/toml-edit';
import { FieldInput } from '../components/Fields';
import { DraftOffer } from '../lib/unsaved';
import { useTomlFields } from '../lib/toml-fields';
import { screenById } from '../model/screens';
import {
  appendRecommendation,
  deleteRecommendation,
  nextRecommendationId,
  reorderRecommendations,
  replaceRecommendation,
} from '../content/toml-struct';
import { parse as parseToml } from 'smol-toml';
import { processImage, formatBytes, rawUrl } from '../lib/images';
import type { ProcessedImage } from '../lib/images';
import { THERAPY_OPTIONS } from '../model/types';

const FILE = 'src/content/recommendations.toml';
const DIR = 'public/img/recommendations';
/** The `Trouble` id of the kicker settings, which belong to no card. */
const KICKER = 'kicker';

interface Rec {
  id: string;
  screenshot: string;
  alt: string;
  transcription: string;
  relatedTherapies: string[];
  active: boolean;
}

/** Everything about a recommendation except what code decides. */
interface Draft {
  alt: string;
  transcription: string;
  relatedTherapies: string[];
  active: boolean;
}

const EMPTY: Draft = { alt: '', transcription: '', relatedTherapies: [], active: true };

/**
 * A recommendation has no title, so its opening words are its name. Not its
 * position: the arrows change that, and a control whose name moves while she
 * is using it is worse than one with no name.
 */
function nameOf(rec: { transcription: string; alt: string }): string {
  const words = (rec.transcription || rec.alt).trim().split(/\s+/).slice(0, 5).join(' ');
  return words.length > 0 ? `${words}…` : 'המלצה בלי טקסט';
}

const draftOf = (rec: Rec): Draft => ({
  alt: rec.alt,
  transcription: rec.transcription,
  relatedTherapies: [...rec.relatedTherapies],
  active: rec.active,
});

interface Trouble {
  id: string | null;
  message: string;
}

export function Recommendations(): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [items, setItems] = useState<Rec[]>([]);
  const [busy, setBusy] = useState(false);
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [adding, setAdding] = useState<ProcessedImage | null>(null);
  const [editing, setEditing] = useState<Rec | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  /** Screenshots committed this session, so a replacement is visible at once. */
  const [fresh, setFresh] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const { content } = await api.read(FILE);
      if (!content) return;
      setSource(content);
      setItems(((parseToml(content) as { recommendations?: Rec[] }).recommendations ?? []) as Rec[]);
    } catch (e) {
      setTrouble({
        id: null,
        message: e instanceof FriendlyError ? e.message : 'לא הצלחתי לטעון את ההמלצות.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const adopt = (next: string): void => {
    setSource(next);
    setItems(((parseToml(next) as { recommendations?: Rec[] }).recommendations ?? []) as Rec[]);
  };

  /** One write, with its failure attached to the card that caused it. */
  async function act(
    id: string | null,
    whenItGoesWrong: string,
    run: () => Promise<void>,
  ): Promise<boolean> {
    setBusy(true);
    setTrouble(null);
    try {
      await run();
      store.saved();
      return true;
    } catch (e) {
      setTrouble({ id, message: e instanceof FriendlyError ? e.message : whenItGoesWrong });
      return false;
    } finally {
      setBusy(false);
    }
  }

  const toggleActive = (rec: Rec): Promise<boolean> =>
    act(rec.id, 'לא הצלחתי לשנות.', async () => {
      const at = items.findIndex((r) => r.id === rec.id);
      const next = setValue(source!, ['recommendations', at, 'active'], !rec.active);
      await api.save(`${rec.active ? 'הסתרת' : 'הצגת'} המלצה`, [{ path: FILE, content: next }]);
      adopt(next);
    });

  const move = (rec: Rec, direction: -1 | 1): Promise<boolean> =>
    act(rec.id, 'לא הצלחתי לשנות את הסדר.', async () => {
      const ids = items.map((r) => r.id);
      const at = ids.indexOf(rec.id);
      if (at + direction < 0 || at + direction >= ids.length) return;
      [ids[at], ids[at + direction]] = [ids[at + direction], ids[at]];
      const next = reorderRecommendations(source!, ids);
      await api.save('שינוי סדר ההמלצות', [{ path: FILE, content: next }]);
      adopt(next);
    });

  /** The whole card at once, and the screenshot with it when it changed. */
  async function saveEdit(rec: Rec, draft: Draft, replacement: ProcessedImage | null): Promise<void> {
    const ok = await act(rec.id, 'לא הצלחתי לשמור.', async () => {
      const next = replaceRecommendation(source!, rec.id, {
        id: rec.id,
        screenshot: rec.screenshot,
        alt: draft.alt.trim(),
        transcription: draft.transcription.trim(),
        relatedTherapies: draft.relatedTherapies,
        active: draft.active,
      });
      const files = [{ path: FILE, content: next, encoding: 'utf-8' as const }];
      if (replacement) {
        files.unshift({
          path: `public${rec.screenshot}`,
          content: replacement.base64,
          encoding: 'base64' as never,
        });
      }
      await api.save('עדכון המלצה', files);
      adopt(next);
      if (replacement) setFresh((prev) => ({ ...prev, [rec.id]: replacement.previewUrl }));
    });
    if (ok) setEditing(null);
  }

  async function add(draft: Draft, replacement: ProcessedImage | null): Promise<void> {
    const shot = replacement ?? adding;
    if (!shot) return;
    const ok = await act(null, 'לא הצלחתי להוסיף את ההמלצה.', async () => {
      const id = nextRecommendationId(source!);
      const screenshot = `/img/recommendations/${id}.jpeg`;
      const next = appendRecommendation(source!, {
        id,
        screenshot,
        alt: draft.alt.trim(),
        transcription: draft.transcription.trim(),
        relatedTherapies: draft.relatedTherapies,
        active: draft.active,
      });
      // Screenshot and entry in one commit - they are meaningless apart.
      await api.save('הוספת המלצה', [
        { path: `${DIR}/${id}.jpeg`, content: shot.base64, encoding: 'base64' },
        { path: FILE, content: next },
      ]);
      adopt(next);
      setFresh((prev) => ({ ...prev, [id]: shot.previewUrl }));
    });
    if (ok) setAdding(null);
  }

  async function remove(rec: Rec): Promise<void> {
    const ok = await act(rec.id, 'לא הצלחתי למחוק.', async () => {
      const next = deleteRecommendation(source!, rec.id);
      await api.save('מחיקת המלצה', [{ path: FILE, content: next }]);
      await api.remove([`public${rec.screenshot}`], 'מחיקת צילום המסך');
      adopt(next);
    });
    if (ok) setConfirming(null);
  }

  const saveKicker = (splice: (src: string) => string): Promise<boolean> =>
    act(KICKER, 'לא הצלחתי לשמור.', async () => {
      const next = splice(source!);
      await api.save('עדכון המשפט מעל הכותרת', [{ path: FILE, content: next }]);
      adopt(next);
    });

  const shotUrl = (rec: Rec): string =>
    fresh[rec.id] ?? rawUrl(store.repo, 'content-draft', rec.screenshot);

  if (!source) {
    return trouble ? <p className="banner error">{trouble.message}</p> : <p className="muted">רגע, טוען…</p>;
  }

  return (
    <>
      {trouble && trouble.id === null && !adding && (
        <p className="banner error" role="alert">{trouble.message}</p>
      )}

      <label className="primary wide as-button">
        <input
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setTrouble(null);
            setAdding(await processImage(file));
          }}
        />
        <span>+ הוספת המלצה</span>
      </label>

      <KickerSettings
        source={source}
        busy={busy}
        error={trouble?.id === KICKER ? trouble.message : null}
        onSave={saveKicker}
      />

      <ul className="recs">
        {items.map((rec, i) => (
          <li key={rec.id} className={rec.active ? 'rec' : 'rec is-hidden'}>
            <img src={shotUrl(rec)} alt="" loading="lazy" />
            <div className="rec-body">
              <p className="rec-text">{rec.transcription}</p>
              <p className="muted">
                {rec.alt ? `תיאור הצילום: ${rec.alt}` : 'אין תיאור לצילום'}
                {rec.relatedTherapies.length > 0 &&
                  ` · ${rec.relatedTherapies
                    .map((v) => THERAPY_OPTIONS.find((t) => t.value === v)?.label ?? v)
                    .join(', ')}`}
              </p>
              {/* Fifteen rows, five controls each: without the row's own words
                  that is seventy-five buttons with four names between them. */}
              <div className="rec-actions">
                <button
                  className="ghost"
                  onClick={() => setEditing(rec)}
                  disabled={busy}
                  aria-label={`עריכת «${nameOf(rec)}»`}
                >
                  עריכה
                </button>
                <button
                  className="ghost"
                  onClick={() => move(rec, -1)}
                  disabled={i === 0 || busy}
                  aria-label={`העברת «${nameOf(rec)}» למעלה`}
                >
                  ↑
                </button>
                <button
                  className="ghost"
                  onClick={() => move(rec, 1)}
                  disabled={i === items.length - 1 || busy}
                  aria-label={`העברת «${nameOf(rec)}» למטה`}
                >
                  ↓
                </button>
                <button
                  className="ghost"
                  onClick={() => toggleActive(rec)}
                  disabled={busy}
                  aria-label={`${rec.active ? 'הסתרת' : 'הצגת'} «${nameOf(rec)}»`}
                >
                  {rec.active ? 'הסתרה' : 'הצגה'}
                </button>
                <button
                  className="ghost danger"
                  onClick={() => setConfirming(rec.id)}
                  disabled={busy}
                  aria-label={`מחיקת «${nameOf(rec)}»`}
                >
                  מחיקה
                </button>
              </div>
              {trouble?.id === rec.id && !editing && (
                <p className="invalid" role="alert">{trouble.message}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      {adding && (
        <RecForm
          heading="המלצה חדשה"
          confirmLabel="הוספה"
          initial={EMPTY}
          preview={adding.previewUrl}
          note={`הוקטן ל־${formatBytes(adding.bytes)}`}
          busy={busy}
          error={trouble && trouble.id === null ? trouble.message : null}
          onSubmit={add}
          onCancel={() => setAdding(null)}
        />
      )}

      {editing && (
        <RecForm
          heading="עריכת המלצה"
          confirmLabel="שמירה"
          initial={draftOf(editing)}
          preview={shotUrl(editing)}
          busy={busy}
          error={trouble && trouble.id === editing.id ? trouble.message : null}
          onSubmit={(draft, replacement) => saveEdit(editing, draft, replacement)}
          onCancel={() => setEditing(null)}
        />
      )}

      {confirming && (
        <div className="modal-backdrop" onClick={() => setConfirming(null)}>
          <div className="modal is-small" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>למחוק את ההמלצה?</h2>
            <p className="muted">
              אם מישהו ביקש להסיר אותה, הסתרה מספיקה ומשאירה אותה שמורה.
            </p>
            <div className="modal-actions">
              <button className="danger" onClick={() => remove(items.find((r) => r.id === confirming)!)} disabled={busy}>
                כן, למחוק
              </button>
              <button
                className="ghost"
                disabled={busy}
                onClick={async () => {
                  const rec = items.find((r) => r.id === confirming)!;
                  if (rec.active) await toggleActive(rec);
                  setConfirming(null);
                }}
              >
                רק להסתיר
              </button>
              <button className="ghost" onClick={() => setConfirming(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------------------------- the form --------------------------------- */

function RecForm({
  heading,
  confirmLabel,
  initial,
  preview,
  note,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  heading: string;
  confirmLabel: string;
  initial: Draft;
  preview: string;
  note?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (draft: Draft, replacement: ProcessedImage | null) => void;
  onCancel: () => void;
}): JSX.Element {
  const [draft, setDraft] = useState<Draft>(initial);
  const [replacement, setReplacement] = useState<ProcessedImage | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const missing = !draft.transcription.trim() || !draft.alt.trim();
  const shown = replacement?.previewUrl ?? preview;

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>{heading}</h2>
          <button className="ghost" onClick={onCancel} disabled={busy} aria-label="סגירה">✕</button>
        </div>

        <img src={shown} alt="" className="upload-preview" />
        <div className="rec-shot-row">
          {(replacement || note) && (
            <span className="muted">
              {replacement ? `הוקטן ל־${formatBytes(replacement.bytes)}` : note}
            </span>
          )}
          <label className="ghost as-button">
            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setFailed(null);
                try {
                  setReplacement(await processImage(file));
                } catch {
                  setFailed('לא הצלחתי לקרוא את הקובץ. אפשר לנסות תמונה אחרת.');
                }
              }}
            />
            <span>החלפת הצילום</span>
          </label>
        </div>

        <div className="field">
          <label htmlFor="rec-text">הטקסט של ההמלצה</label>
          <p className="help">מעתיקים כמו שהוא. הוא משמש לחיפוש ולהקראה.</p>
          <textarea
            id="rec-text"
            value={draft.transcription}
            onChange={(e) => setDraft((d) => ({ ...d, transcription: e.target.value }))}
          />
        </div>

        <div className="field">
          <label htmlFor="rec-alt">תיאור קצר של הצילום</label>
          <p className="help">נקרא בקול למי שגולשת עם תוכנת הקראה.</p>
          <input
            id="rec-alt"
            type="text"
            value={draft.alt}
            onChange={(e) => setDraft((d) => ({ ...d, alt: e.target.value }))}
            placeholder="למשל: המלצה על טיפול במגע ושחרור כאבי גב"
          />
        </div>

        <div className="field">
          <span className="field-label">לאיזה טיפול ההמלצה שייכת?</span>
          <div className="chips">
            {THERAPY_OPTIONS.map((t) => {
              const on = draft.relatedTherapies.includes(t.value);
              return (
                <button
                  key={t.value}
                  className={on ? 'chip is-on' : 'chip'}
                  aria-pressed={on}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      relatedTherapies: d.relatedTherapies.includes(t.value)
                        ? d.relatedTherapies.filter((v) => v !== t.value)
                        : [...d.relatedTherapies, t.value],
                    }))
                  }
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="switch">
          <input
            id="rec-active"
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
          />
          <label htmlFor="rec-active">מוצגת באתר</label>
        </div>

        {failed && <p className="banner error" role="alert">{failed}</p>}
        {error && <p className="banner error" role="alert">{error}</p>}

        <div className="modal-actions">
          <button
            className="primary"
            onClick={() => onSubmit(draft, replacement)}
            disabled={busy || missing}
          >
            {busy ? 'שומר…' : confirmLabel}
          </button>
          <button className="ghost" onClick={onCancel} disabled={busy}>ביטול</button>
        </div>
        {missing && <p className="invalid">צריך גם את הטקסט וגם תיאור קצר.</p>}
      </div>
    </div>
  );
}

/* ------------------------------ the kicker line ------------------------------ */

const KICKER_GROUPS = screenById('recommendations').groups ?? [];

/**
 * The line above the heading wherever recommendations show. One row until it
 * is opened, because the screen is for the cards; the row says what the
 * visitor sees now, so most visits need not open it at all.
 */
function KickerSettings({
  source,
  busy,
  error,
  onSave,
}: {
  source: string;
  busy: boolean;
  error: string | null;
  onSave: (splice: (src: string) => string) => Promise<boolean>;
}): JSX.Element | null {
  const [general, ...places] = KICKER_GROUPS;
  const fields = useMemo(() => KICKER_GROUPS.flatMap((g) => g.fields), []);
  const form = useTomlFields(FILE, fields, source);
  const [open, setOpen] = useState(false);

  // Work kept from an earlier visit is offered inside; a closed row would hide it.
  const offered = form.draft.offered !== null;
  useEffect(() => {
    if (offered) setOpen(true);
  }, [offered]);

  // A draft begun before the file had these settings has nothing to splice into.
  if (!general || fields.every((f) => form.values[f.key] === undefined)) return null;

  const [shownField, textField] = general.fields;
  const shared = String(form.values[textField.key] ?? '').trim();
  const exceptions = places.flatMap((g) => {
    const [placeShown, placeText] = g.fields;
    if (form.values[placeShown.key] === false) return [`${g.title}: מוסתר`];
    if (String(form.values[placeText.key] ?? '').trim()) return [`${g.title}: נוסח אחר`];
    return [];
  });
  const state = form.values[shownField.key] === false
    ? 'מוסתר בכל האתר'
    : [shared ? `«${shared}»` : 'בלי משפט כללי', ...exceptions].join(' · ');

  const field = (f: (typeof fields)[number]): JSX.Element => (
    <FieldInput key={f.key} field={f} value={form.values[f.key]} onChange={(v) => form.set(f.key, v)} />
  );

  return (
    <details
      className="group kicker-settings"
      open={open}
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>
        {general.title}
        <span className="muted">{state}</span>
      </summary>

      <DraftOffer keeper={form.draft} onRestore={form.restore} />
      {general.help && <p className="help muted">{general.help}</p>}
      {general.fields.map(field)}

      {places.map((group) => (
        <div key={group.title}>
          <h3 className="section-heading">{group.title}</h3>
          {group.fields.map(field)}
        </div>
      ))}

      {error && <p className="banner error" role="alert">{error}</p>}
      <div className="save-row">
        <button
          className="primary"
          disabled={!form.dirty || busy}
          onClick={async () => {
            if (await onSave(form.splice)) form.settle();
          }}
        >
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {!form.dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
      </div>
    </details>
  );
}
