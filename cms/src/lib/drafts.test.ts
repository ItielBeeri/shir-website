/** X-9: what she typed survives leaving the screen. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDraft, prune, readDraft, writeDraft } from './drafts';

const memory = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

describe('prune', () => {
  const now = 1_000_000_000_000;

  it('keeps what is recent', () => {
    const store = { a: { at: now - 1000, value: 1 } };
    expect(prune(store, now)).toEqual(store);
  });

  it('drops what is older than the window', () => {
    const store = { a: { at: now - 8 * 24 * 3600 * 1000, value: 1 } };
    expect(prune(store, now)).toEqual({});
  });

  it('drops anything shaped wrong, rather than trusting it', () => {
    expect(prune({ a: { value: 1 } as never }, now)).toEqual({});
  });
});

describe('the store', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memory() });
  });

  it('round-trips a draft', () => {
    writeDraft('page', { title: 'שלום' });
    expect(readDraft('page')).toEqual({ title: 'שלום' });
  });

  it('keeps drafts of different screens apart', () => {
    writeDraft('a', 1);
    writeDraft('b', 2);
    expect(readDraft('a')).toBe(1);
    expect(readDraft('b')).toBe(2);
  });

  it('clears one without touching the others', () => {
    writeDraft('a', 1);
    writeDraft('b', 2);
    clearDraft('a');
    expect(readDraft('a')).toBeNull();
    expect(readDraft('b')).toBe(2);
  });

  it('returns null rather than throwing when there is no storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    expect(() => writeDraft('a', 1)).not.toThrow();
    expect(readDraft('a')).toBeNull();
  });

  it('survives content that is not JSON', () => {
    const storage = memory();
    storage.setItem('shir-cms-drafts', 'not json');
    vi.stubGlobal('window', { localStorage: storage });
    expect(readDraft('a')).toBeNull();
  });
});
