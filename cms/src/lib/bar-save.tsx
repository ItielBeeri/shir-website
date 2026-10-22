/**
 * The screen's Save, repeated in the bar.
 *
 * A form's own button is at its foot, beside the messages that explain why it
 * is disabled or why a save failed. A small change near the top should not
 * cost a scroll to the bottom, so while there is something to save the bar
 * offers the same action - and, when the answer is down there, takes her to it
 * rather than failing silently up here.
 */
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';

export interface BarSave {
  busy: boolean;
  /** Pressed: saves, or scrolls to the reason it cannot. */
  press: () => void;
}

export const BarSaveSlot = createContext<(save: BarSave | null) => void>(() => undefined);

/**
 * Offers `save` in the bar while `dirty`. Returns the ref for the screen's own
 * save row, which is where she is taken when the save is blocked or fails.
 */
export function useBarSave<T extends HTMLElement = HTMLDivElement>({
  dirty,
  busy,
  blocked,
  error,
  save,
}: {
  dirty: boolean;
  busy: boolean;
  blocked: boolean;
  error: string | null;
  save: () => unknown;
}): RefObject<T> {
  const offer = useContext(BarSaveSlot);
  const anchor = useRef<T>(null);
  const latest = useRef({ save, blocked });
  latest.current = { save, blocked };
  const fromBar = useRef(false);

  const show = (): void => anchor.current?.scrollIntoView({ block: 'center' });

  const entry = useMemo<BarSave | null>(
    () =>
      dirty
        ? {
            busy,
            press: () => {
              if (latest.current.blocked) {
                show();
                return;
              }
              fromBar.current = true;
              void latest.current.save();
            },
          }
        : null,
    [dirty, busy],
  );

  useEffect(() => {
    offer(entry);
  }, [offer, entry]);
  useEffect(() => () => offer(null), [offer]);

  useEffect(() => {
    if (busy || !fromBar.current) return;
    fromBar.current = false;
    if (error) show();
  }, [busy, error]);

  return anchor;
}
