/**
 * Not losing what she wrote.
 *
 * Two halves of one promise. `useDraftKeeper` puts the work in this browser
 * while it differs from what is saved, and offers it back next time the same
 * screen opens. `confirmLeave` is the other half: a prompt at the moment she
 * would lose it, because a recovery banner on her return is a consolation and
 * a question beforehand is a choice.
 */
import { useEffect, useRef, useState } from 'react';
import { clearDraft, readDraft, writeDraft } from './drafts';

/** Typing settles before anything is written; this is not a keystroke log. */
const SETTLE_MS = 700;

let unsaved = false;

export const hasUnsaved = (): boolean => unsaved;

/**
 * Ask before leaving a screen with unsaved work. A native dialog, because it
 * is the one prompt that cannot be missed, reaches the keyboard for free and
 * needs no Hebrew layout work of its own.
 */
export function confirmLeave(): boolean {
  if (!unsaved) return true;
  const leaving = window.confirm(
    'יש כאן שינויים שלא נשמרו. לצאת בלי לשמור? מה שכתבת יישמר בדפדפן ויחכה לך כאן.',
  );
  // The screen is going away, so the flag is answered either way. Clearing it
  // here also means a screen that somehow left it set costs one prompt rather
  // than making the whole app unnavigable.
  if (leaving) unsaved = false;
  return leaving;
}

export interface DraftKeeper<T> {
  /** Work from a previous visit that never reached the site, or null. */
  offered: T | null;
  /** Take it, and stop offering. */
  accept: () => T | null;
  /** Throw it away. */
  discard: () => void;
}

export function useDraftKeeper<T>(
  id: string,
  snapshot: T,
  options: { dirty: boolean; ready: boolean },
): DraftKeeper<T> {
  const [offered, setOffered] = useState<T | null>(null);
  const asked = useRef(false);

  // Looked for once, when the screen first has something to compare against.
  useEffect(() => {
    if (asked.current || !options.ready) return;
    asked.current = true;
    const stored = readDraft<T>(id);
    if (stored && JSON.stringify(stored) !== JSON.stringify(snapshot)) setOffered(stored);
  }, [id, options.ready, snapshot]);

  useEffect(() => {
    if (!options.ready) return;
    if (!options.dirty) {
      clearDraft(id);
      return;
    }
    const timer = window.setTimeout(() => writeDraft(id, snapshot), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [id, snapshot, options.dirty, options.ready]);

  // The flag is module-level because the thing that needs to read it - the
  // navigation in App - is nowhere near the form that knows.
  useEffect(() => {
    unsaved = options.dirty;
    if (!options.dirty) return;
    const onLeave = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => {
      unsaved = false;
      window.removeEventListener('beforeunload', onLeave);
    };
  }, [options.dirty]);

  return {
    offered,
    accept: () => {
      const value = offered;
      setOffered(null);
      clearDraft(id);
      return value;
    },
    discard: () => {
      setOffered(null);
      clearDraft(id);
    },
  };
}

/** The banner that offers it back. Applying it is the screen's own business. */
export function DraftOffer<T>({
  keeper,
  onRestore,
}: {
  keeper: DraftKeeper<T>;
  onRestore: (value: T) => void;
}): JSX.Element | null {
  if (!keeper.offered) return null;
  return (
    <p className="banner draft-offer" role="status">
      <span>יש כאן שינויים שהתחלת ולא נשמרו.</span>
      <span className="draft-actions">
        <button
          className="primary"
          onClick={() => {
            const value = keeper.accept();
            if (value !== null) onRestore(value);
          }}
        >
          שחזור מה שכתבתי
        </button>
        <button className="ghost" onClick={keeper.discard}>
          להתחיל מהגרסה שבאתר
        </button>
      </span>
    </p>
  );
}
