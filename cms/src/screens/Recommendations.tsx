/**
 * Recommendations.
 *
 * Adding one is a single act: drop the screenshot, paste the text. The id and
 * the screenshot path are derived, so the editor guide's most destructive
 * mistake - a `screenshot` line that names a file that is not there, which
 * fails the build and takes every recommendation off the site - cannot happen.
 *
 * File order is display order (`loadRecommendations` does not re-sort), so the
 * list here is the list a visitor sees.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import { useStore } from '../store';
import { setValue } from '../content/toml-edit';
import {
  appendRecommendation,
  deleteRecommendation,
  nextRecommendationId,
  reorderRecommendations,
} from '../content/toml-struct';
import { parse as parseToml } from 'smol-toml';
import { processImage, formatBytes, rawUrl } from '../lib/images';
import type { ProcessedImage } from '../lib/images';
import { THERAPY_OPTIONS } from '../model/types';

const FILE = 'src/content/recommendations.toml';
const DIR = 'public/img/recommendations';

interface Rec {
  id: string;
  screenshot: string;
  alt: string;
  transcription: string;
  relatedTherapies: string[];
  active: boolean;
}

export function Recommendations(): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [items, setItems] = useState<Rec[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<ProcessedImage | null>(null);
  const [draft, setDraft] = useState({ alt: '', text: '', therapies: [] as string[] });
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { content } = await api.read(FILE);
      if (!content) return;
      setSource(content);
      setItems(((parseToml(content) as { recommendations?: Rec[] }).recommendations ?? []) as Rec[]);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לטעון את ההמלצות.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const write = async (next: string, message: string): Promise<void> => {
    await api.save(message, [{ path: FILE, content: next }]);
    store.saved();
    setSource(next);
    setItems(((parseToml(next) as { recommendations?: Rec[] }).recommendations ?? []) as Rec[]);
  };

  async function toggleActive(rec: Rec): Promise<void> {
    if (!source) return;
    setBusy(true);
    try {
      const at = items.findIndex((r) => r.id === rec.id);
      await write(
        setValue(source, ['recommendations', at, 'active'], !rec.active),
        `${rec.active ? 'הסתרת' : 'הצגת'} המלצה`,
      );
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשנות.');
    } finally {
      setBusy(false);
    }
  }

  async function move(rec: Rec, direction: -1 | 1): Promise<void> {
    if (!source) return;
    const ids = items.map((r) => r.id);
    const at = ids.indexOf(rec.id);
    if (at + direction < 0 || at + direction >= ids.length) return;
    setBusy(true);
    try {
      [ids[at], ids[at + direction]] = [ids[at + direction], ids[at]];
      await write(reorderRecommendations(source, ids), 'שינוי סדר ההמלצות');
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשנות את הסדר.');
    } finally {
      setBusy(false);
    }
  }

  async function setTherapies(rec: Rec, therapies: string[]): Promise<void> {
    if (!source) return;
    setBusy(true);
    try {
      const at = items.findIndex((r) => r.id === rec.id);
      // The array is rewritten element-wise, so a change of length needs the
      // whole block replaced; simplest correct route is remove-and-re-add.
      const without = deleteRecommendation(source, rec.id);
      const next = appendRecommendation(without, { ...rec, relatedTherapies: therapies });
      const ids = items.map((r) => r.id);
      await write(reorderRecommendations(next, ids), 'שיוך המלצה לטיפול');
      void at;
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשנות את השיוך.');
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    if (!source || !adding) return;
    setBusy(true);
    setError(null);
    try {
      const id = nextRecommendationId(source);
      const screenshot = `/img/recommendations/${id}.jpeg`;
      const next = appendRecommendation(source, {
        id,
        screenshot,
        alt: draft.alt.trim(),
        transcription: draft.text.trim(),
        relatedTherapies: draft.therapies,
        active: true,
      });
      // Screenshot and entry in one commit - they are meaningless apart.
      await api.save('הוספת המלצה', [
        { path: `${DIR}/${id}.jpeg`, content: adding.base64, encoding: 'base64' },
        { path: FILE, content: next },
      ]);
      store.saved();
      setSource(next);
      setItems(((parseToml(next) as { recommendations?: Rec[] }).recommendations ?? []) as Rec[]);
      setAdding(null);
      setDraft({ alt: '', text: '', therapies: [] });
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי להוסיף את ההמלצה.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(rec: Rec): Promise<void> {
    if (!source) return;
    setBusy(true);
    try {
      await write(deleteRecommendation(source, rec.id), 'מחיקת המלצה');
      await api.remove([`public${rec.screenshot}`], 'מחיקת צילום המסך');
      store.saved();
      setConfirming(null);
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי למחוק.');
    } finally {
      setBusy(false);
    }
  }

  if (!source) return <p className="muted">רגע, טוען…</p>;

  return (
    <>
      {error && <p className="banner error">{error}</p>}

      {adding ? (
        <section className="group">
          <h2>המלצה חדשה</h2>
          <img src={adding.previewUrl} alt="" className="upload-preview" />
          <p className="muted">הוקטן ל־{formatBytes(adding.bytes)}</p>

          <div className="field">
            <label htmlFor="rec-text">הטקסט של ההמלצה</label>
            <p className="help">מעתיקים כמו שהוא. הוא משמש לחיפוש ולהקראה.</p>
            <textarea
              id="rec-text"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </div>

          <div className="field">
            <label htmlFor="rec-alt">תיאור קצר של הצילום</label>
            <input
              id="rec-alt"
              type="text"
              value={draft.alt}
              onChange={(e) => setDraft({ ...draft, alt: e.target.value })}
              placeholder="למשל: המלצה על טיפול במגע ושחרור כאבי גב"
            />
          </div>

          <div className="field">
            <span className="field-label">לאיזה טיפול ההמלצה שייכת?</span>
            <div className="chips">
              {THERAPY_OPTIONS.map((t) => (
                <button
                  key={t.value}
                  className={draft.therapies.includes(t.value) ? 'chip is-on' : 'chip'}
                  aria-pressed={draft.therapies.includes(t.value)}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      therapies: draft.therapies.includes(t.value)
                        ? draft.therapies.filter((v) => v !== t.value)
                        : [...draft.therapies, t.value],
                    })
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button className="primary" onClick={add} disabled={busy || !draft.text.trim() || !draft.alt.trim()}>
              {busy ? 'מוסיף…' : 'הוספה'}
            </button>
            <button className="ghost" onClick={() => setAdding(null)} disabled={busy}>ביטול</button>
          </div>
          {(!draft.text.trim() || !draft.alt.trim()) && (
            <p className="invalid">צריך גם את הטקסט וגם תיאור קצר.</p>
          )}
        </section>
      ) : (
        <label className="primary wide as-button">
          <input
            type="file"
            accept="image/*"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setAdding(await processImage(file));
            }}
          />
          <span>+ הוספת המלצה</span>
        </label>
      )}

      <ul className="recs">
        {items.map((rec, i) => (
          <li key={rec.id} className={rec.active ? 'rec' : 'rec is-hidden'}>
            <img src={rawUrl(store.repo, 'content-draft', rec.screenshot)} alt="" loading="lazy" />
            <div className="rec-body">
              <p className="rec-text">{rec.transcription}</p>
              <div className="chips">
                {THERAPY_OPTIONS.map((t) => (
                  <button
                    key={t.value}
                    className={rec.relatedTherapies.includes(t.value) ? 'chip is-on' : 'chip'}
                    disabled={busy}
                    onClick={() =>
                      setTherapies(
                        rec,
                        rec.relatedTherapies.includes(t.value)
                          ? rec.relatedTherapies.filter((v) => v !== t.value)
                          : [...rec.relatedTherapies, t.value],
                      )
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="rec-actions">
                <button className="ghost" onClick={() => move(rec, -1)} disabled={i === 0 || busy} aria-label="העברה למעלה">↑</button>
                <button className="ghost" onClick={() => move(rec, 1)} disabled={i === items.length - 1 || busy} aria-label="העברה למטה">↓</button>
                <button className="ghost" onClick={() => toggleActive(rec)} disabled={busy}>
                  {rec.active ? 'הסתרה' : 'הצגה'}
                </button>
                <button className="ghost danger" onClick={() => setConfirming(rec.id)} disabled={busy}>
                  מחיקה
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

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
                onClick={() => {
                  void toggleActive(items.find((r) => r.id === confirming)!);
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
