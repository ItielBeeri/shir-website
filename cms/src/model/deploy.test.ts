/**
 * R7-1: a publish whose build never reports still has to end.
 *
 * The store stops polling at the limit, so after it the screen is showing the
 * last thing it will ever show. It used to go on counting anyway, which is how
 * a publish that had already succeeded came to read "כבר 150 דקות" under a
 * spinner. The limit is shared rather than duplicated precisely so the two
 * cannot drift apart, and these tests are what say so.
 */
import { describe, expect, it } from 'vitest';
import { DEPLOY_WORDS, WATCH_LIMIT_MS, gaveUp, settled } from './deploy';

const at = (ms: number): number => 1_000_000 + ms;
const since = at(0);
const watch = (state: string, elapsed: number) => ({
  since,
  state: state as Parameters<typeof settled>[0]['state'],
  now: at(elapsed),
});

describe('settled', () => {
  it.each([
    ['ready', true],
    ['failed', true],
    ['none', false],
    ['queued', false],
    ['building', false],
    ['unknown', false],
  ])('%s → %s', (state, expected) => {
    expect(settled({ state } as Parameters<typeof settled>[0])).toBe(expected);
  });
});

describe('gaveUp', () => {
  it('is false while the store is still polling', () => {
    const w = watch('none', WATCH_LIMIT_MS - 1);
    expect(gaveUp(w, w.now)).toBe(false);
  });

  it('is true once past the limit the store stops at', () => {
    const w = watch('none', WATCH_LIMIT_MS + 1);
    expect(gaveUp(w, w.now)).toBe(true);
  });

  it.each(['none', 'queued', 'building', 'unknown'])(
    'catches %s, the states nothing will move off on its own',
    (state) => {
      const w = watch(state, WATCH_LIMIT_MS * 15);
      expect(gaveUp(w, w.now)).toBe(true);
    },
  );

  it.each(['ready', 'failed'])('never overrides %s, which already reported', (state) => {
    const w = watch(state, WATCH_LIMIT_MS * 15);
    expect(gaveUp(w, w.now)).toBe(false);
  });

  /** The reading that started this: two and a half hours of "still waiting". */
  it('is true long after the wait stopped meaning anything', () => {
    const w = watch('none', 150 * 60 * 1000);
    expect(gaveUp(w, w.now)).toBe(true);
  });
});

describe('the words', () => {
  it('has one for every state, so a new state cannot render blank', () => {
    for (const state of ['none', 'queued', 'building', 'ready', 'failed', 'unknown'] as const) {
      expect(DEPLOY_WORDS[state]).toBeTruthy();
    }
  });
});
