/**
 * What she typed, kept in this browser until it is saved.
 *
 * Nothing was persisted anywhere before a save, so a closed tab, a stray tap
 * on the title, or a session that expired mid-sentence took the work with it
 * and said nothing. A draft here is not a second source of truth - it is only
 * ever offered back, never applied on its own, because the file may have moved
 * on in the meantime and quietly overwriting it would be worse.
 *
 * Every accessor is guarded: a private window, blocked site data or a full
 * quota all throw, and none of them is a reason to stop editing.
 */
const KEY = 'shir-cms-drafts';

/** Long enough to survive a weekend, short enough not to hoard old text. */
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export interface StoredDraft {
  at: number;
  value: unknown;
}

export type DraftStore = Record<string, StoredDraft>;

/** Drop what is too old to still be the thing she was writing. */
export function prune(store: DraftStore, now: number, maxAge = MAX_AGE_MS): DraftStore {
  const out: DraftStore = {};
  for (const [id, draft] of Object.entries(store)) {
    if (typeof draft?.at === 'number' && now - draft.at < maxAge) out[id] = draft;
  }
  return out;
}

function read(): DraftStore {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DraftStore;
    return parsed && typeof parsed === 'object' ? prune(parsed, Date.now()) : {};
  } catch {
    return {};
  }
}

function write(store: DraftStore): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* no storage, or none left: editing carries on without the safety net */
  }
}

export function readDraft<T>(id: string): T | null {
  const draft = read()[id];
  return draft ? (draft.value as T) : null;
}

export function writeDraft(id: string, value: unknown): void {
  write({ ...read(), [id]: { at: Date.now(), value } });
}

export function clearDraft(id: string): void {
  const store = read();
  if (!(id in store)) return;
  delete store[id];
  write(store);
}
