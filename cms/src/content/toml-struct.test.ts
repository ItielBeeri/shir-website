/** Gates F-12 … F-15 from TEST-SPEC.md, against the live content files. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseSmol } from 'smol-toml';
import {
  appendImage,
  appendRecommendation,
  appendVideo,
  deleteRecommendation,
  imageIds,
  nextRecommendationId,
  recommendationIds,
  removeImage,
  removeVideo,
  reorderArrayTables,
  arrayTableCount,
  reorderRecommendations,
  replaceRecommendation,
  setEntryValue,
} from './toml-struct';

const CONTENT = join(__dirname, '../../../src/content');
const images = () => readFileSync(join(CONTENT, 'images.toml'), 'utf8');
const recs = () => readFileSync(join(CONTENT, 'recommendations.toml'), 'utf8');
const videos = () => readFileSync(join(CONTENT, 'videos.toml'), 'utf8');

describe('videos.toml', () => {
  const LIVE = 'voice-opening-session';
  const added = { id: 'test-clip', file: '/video/test-clip.mp4', title: 'בדיקה', date: '2026-10-19' };

  it('appends without disturbing existing entries or comments', () => {
    const src = videos();
    const out = appendVideo(src, { ...added, description: 'שורה\nועוד "שורה"' });
    expect(out.startsWith(src.replace(/\n*$/, ''))).toBe(true);
    const before = parseSmol(src) as Record<string, unknown>;
    const after = parseSmol(out) as Record<string, any>;
    for (const id of Object.keys(before)) expect(after[id]).toEqual(before[id]);
    expect(after['test-clip']).toEqual({ ...added, id: undefined, description: 'שורה\nועוד "שורה"' });
  });

  it('aligns a new entry as the file aligns its own', () => {
    expect(appendVideo(videos(), added)).toContain(
      '[test-clip]\nfile  = "/video/test-clip.mp4"\ntitle = "בדיקה"\ndate  = "2026-10-19"\n',
    );
  });

  it('refuses a duplicate id, and removes exactly one entry', () => {
    expect(() => appendVideo(videos(), { ...added, id: LIVE })).toThrow();
    const out = removeVideo(appendVideo(videos(), added), 'test-clip');
    expect(out).toBe(videos());
  });

  it('sets a key where it stands, in the style it was written in', () => {
    const out = setEntryValue(videos(), LIVE, 'title', 'שם אחר');
    expect((parseSmol(out) as any)[LIVE].title).toBe('שם אחר');
    const before = videos().split('\n');
    const changed = out.split('\n').filter((line, i) => line !== before[i]);
    expect(changed).toEqual(['title       = "שם אחר"']);
  });

  /** The live file plus an entry of our own carrying a comment, as an owner's entry may. */
  const withNote = (extra: { description?: string } = {}): string =>
    `${appendVideo(videos(), { ...added, ...extra })}# הערה בתוך הערך\n`;

  it('adds a missing key below the last one, above the comments, at the same alignment', () => {
    const live = setEntryValue(videos(), LIVE, 'captions', '/video/voice-opening-session.he.vtt');
    expect((parseSmol(live) as any)[LIVE].captions).toBe('/video/voice-opening-session.he.vtt');
    expect(live).toContain('\ncaptions    = "/video/voice-opening-session.he.vtt"\n');
    const own = setEntryValue(withNote(), 'test-clip', 'captions', '/video/test-clip.he.vtt');
    expect(own).toContain('date  = "2026-10-19"\ncaptions = "/video/test-clip.he.vtt"\n# הערה בתוך הערך\n');
  });

  it('clears a key with all of its lines, a multi-line one included, and keeps the comments', () => {
    const src = withNote({ description: 'שורה\nשנייה' });
    const out = setEntryValue(src, 'test-clip', 'description', undefined);
    expect((parseSmol(out) as any)['test-clip'].description).toBeUndefined();
    expect(out.split('\n').length, 'both lines of the value go').toBe(src.split('\n').length - 2);
    expect(out).toContain('# הערה בתוך הערך\n');
    const live = setEntryValue(videos(), LIVE, 'poster_time', undefined);
    expect((parseSmol(live) as any)[LIVE].poster_time).toBeUndefined();
    expect(setEntryValue(live, LIVE, 'poster_time', undefined), 'clearing what is not there').toBe(live);
  });

  it('keeps a number a number', () => {
    const out = setEntryValue(videos(), LIVE, 'poster_time', 12.5);
    expect((parseSmol(out) as any)[LIVE].poster_time).toBe(12.5);
  });
});

const rec = (id: string) => ({
  id,
  screenshot: `/img/recommendations/${id}.jpeg`,
  alt: 'המלצה חדשה לבדיקה',
  transcription: 'שורה ראשונה\nשורה שנייה',
  relatedTherapies: ['shiatsu', 'voice'],
  active: true,
});

describe('images.toml', () => {
  it('F-12 appends without disturbing existing entries or comments', () => {
    const src = images();
    const out = appendImage(src, { id: 'test-photo', file: '/img/content/t.jpg', alt: 'בדיקה' });

    expect(out.startsWith(src.replace(/\n*$/, ''))).toBe(true);
    expect(out).toContain('# מאגר תמונות מרכזי');
    const before = parseSmol(src) as Record<string, unknown>;
    const after = parseSmol(out) as Record<string, unknown>;
    for (const id of Object.keys(before)) expect(after[id]).toEqual(before[id]);
    expect(after['test-photo']).toEqual({ file: '/img/content/t.jpg', alt: 'בדיקה' });
  });

  it('matches the alignment already used in the file', () => {
    const out = appendImage(images(), { id: 'x', file: '/img/content/x.jpg', alt: 'א' });
    expect(out).toContain('[x]\nfile = "/img/content/x.jpg"\nalt  = "א"\n');
  });

  it('refuses a duplicate id', () => {
    expect(() => appendImage(images(), { id: 'portrait-1', file: '/a.jpg', alt: 'א' })).toThrow();
  });

  it('lists every id the site can reference', () => {
    const ids = imageIds(images());
    expect(ids).toContain('portrait-1');
    expect(ids).toContain('shiatsu-1');
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('recommendations.toml', () => {
  it('F-13 appends leaving every existing block byte-identical', () => {
    const src = recs();
    const out = appendRecommendation(src, rec('recommendation-90'));
    expect(out.startsWith(src.replace(/\s*$/, ''))).toBe(true);
    const after = parseSmol(out) as any;
    const before = parseSmol(src) as any;
    expect(after.recommendations.slice(0, before.recommendations.length)).toEqual(
      before.recommendations,
    );
    expect(after.recommendations.at(-1)).toEqual(rec('recommendation-90'));
  });

  it('keeps a transcription with line breaks intact', () => {
    const out = appendRecommendation(recs(), rec('recommendation-91'));
    const after = parseSmol(out) as any;
    expect(after.recommendations.at(-1).transcription).toBe('שורה ראשונה\nשורה שנייה');
  });

  it('F-14 reorders blocks and changes nothing inside any block', () => {
    const src = recs();
    const ids = recommendationIds(src);
    const rotated = [ids.at(-1)!, ...ids.slice(0, -1)];
    const out = reorderRecommendations(src, rotated);

    expect(recommendationIds(out)).toEqual(rotated);
    const before = parseSmol(src) as any;
    const after = parseSmol(out) as any;
    const byId = (d: any) => new Map(d.recommendations.map((r: any) => [r.id, r]));
    const b = byId(before);
    const a = byId(after);
    for (const [id, value] of b) expect(a.get(id)).toEqual(value);
    expect(after.recommendations.length).toBe(before.recommendations.length);
  });

  it('a full-cycle reorder returns the original bytes', () => {
    const src = recs();
    const ids = recommendationIds(src);
    expect(reorderRecommendations(src, ids)).toBe(src);
  });

  it('refuses a reorder that drops or repeats an id', () => {
    const ids = recommendationIds(recs());
    expect(() => reorderRecommendations(recs(), ids.slice(1))).toThrow();
    expect(() => reorderRecommendations(recs(), [ids[0], ...ids])).toThrow();
  });

  it('F-15 deletes exactly one block and its separator', () => {
    const src = recs();
    const ids = recommendationIds(src);
    const victim = ids[1];
    const out = deleteRecommendation(src, victim);

    expect(recommendationIds(out)).toEqual(ids.filter((i) => i !== victim));
    expect(out).not.toContain(`"${victim}"`);
    expect(out).not.toMatch(/\n\n\n/);
    const after = parseSmol(out) as any;
    expect(after.recommendations.length).toBe(ids.length - 1);
  });

  it('deleting the last block leaves a single trailing newline', () => {
    const ids = recommendationIds(recs());
    const out = deleteRecommendation(recs(), ids.at(-1)!);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('refuses to delete an id that is not there', () => {
    expect(() => deleteRecommendation(recs(), 'nope')).toThrow();
  });

  it('replaces one entry in place, keeping its position', () => {
    const src = recs();
    const ids = recommendationIds(src);
    const target = ids[1];
    const out = replaceRecommendation(src, target, { ...rec(target), transcription: 'טקסט חדש' });

    expect(recommendationIds(out)).toEqual(ids);
    const after = parseSmol(out) as any;
    const before = parseSmol(src) as any;
    expect(after.recommendations[1].transcription).toBe('טקסט חדש');
    expect(after.recommendations[1].relatedTherapies).toEqual(['shiatsu', 'voice']);
    for (const i of [0, 2].filter((n) => n < ids.length)) {
      expect(after.recommendations[i]).toEqual(before.recommendations[i]);
    }
  });

  it('accepts a related-therapy list of a different length', () => {
    const src = recs();
    const target = recommendationIds(src)[0];
    const out = replaceRecommendation(src, target, { ...rec(target), relatedTherapies: [] });
    expect((parseSmol(out) as any).recommendations[0].relatedTherapies).toEqual([]);
  });

  it('refuses to replace an id that is not there, or to change one', () => {
    const src = recs();
    const target = recommendationIds(src)[0];
    expect(() => replaceRecommendation(src, 'nope', rec('nope'))).toThrow();
    expect(() => replaceRecommendation(src, target, rec('something-else'))).toThrow();
  });

  it('keeps everything above the first entry byte-identical', () => {
    const src = recs();
    const head = src.slice(0, src.indexOf('[[recommendations]]'));
    // Settings below the entries would ride along with the last one.
    expect((parseSmol(head) as any).kicker).toEqual((parseSmol(src) as any).kicker);

    const ids = recommendationIds(src);
    for (const out of [
      appendRecommendation(src, rec('recommendation-92')),
      reorderRecommendations(src, [...ids].reverse()),
      replaceRecommendation(src, ids[0], { ...rec(ids[0]), transcription: 'טקסט חדש' }),
      deleteRecommendation(src, ids[0]),
    ]) {
      expect(out.startsWith(head)).toBe(true);
    }
  });

  it('derives the next id so the owner never invents one', () => {
    const src = recs();
    const next = nextRecommendationId(src);
    expect(next).toMatch(/^recommendation-\d{2}$/);
    expect(recommendationIds(src)).not.toContain(next);
    // And it stays free after appending it.
    const out = appendRecommendation(src, rec(next));
    expect(nextRecommendationId(out)).not.toBe(next);
  });
});

describe('removeImage', () => {
  it('removes exactly one entry and keeps the header comments', () => {
    const src = images();
    const before = parseSmol(src) as Record<string, unknown>;
    const out = removeImage(src, 'portrait-2');

    expect(out).toContain('# מאגר תמונות מרכזי');
    const after = parseSmol(out) as Record<string, unknown>;
    expect(after['portrait-2']).toBeUndefined();
    for (const id of Object.keys(before)) {
      if (id === 'portrait-2') continue;
      expect(after[id], id).toEqual(before[id]);
    }
    expect(Object.keys(after).length).toBe(Object.keys(before).length - 1);
  });

  it('leaves no blank-line pile-up and one trailing newline', () => {
    const out = removeImage(images(), 'portrait-2');
    expect(out).not.toMatch(/\n{3,}/);
    expect(out.endsWith('\n')).toBe(true);
    expect(out.endsWith('\n\n')).toBe(false);
  });

  it('can remove the last entry', () => {
    const ids = imageIds(images());
    const out = removeImage(images(), ids[ids.length - 1]);
    expect(imageIds(out)).toEqual(ids.slice(0, -1));
  });

  it('refuses an id that is not there', () => {
    expect(() => removeImage(images(), 'nope')).toThrow();
  });
});

describe('nav.toml order', () => {
  const nav = () => readFileSync(join(CONTENT, 'nav.toml'), 'utf8');
  const labels = (text: string): string[] =>
    ((parseSmol(text) as { items: Array<{ label: string }> }).items ?? []).map((i) => i.label);

  it('has more than one entry to reorder', () => {
    expect(arrayTableCount(nav())).toBeGreaterThan(2);
  });

  it('the identity permutation changes nothing', () => {
    const src = nav();
    const same = [...Array(arrayTableCount(src)).keys()];
    expect(reorderArrayTables(src, same)).toBe(src);
  });

  it('moves one entry and leaves the rest in order', () => {
    const src = nav();
    const before = labels(src);
    const order = [...Array(before.length).keys()];
    [order[0], order[1]] = [order[1], order[0]];
    const out = reorderArrayTables(src, order);
    expect(labels(out)).toEqual([before[1], before[0], ...before.slice(2)]);
  });

  it('keeps every key of every entry, header flags included', () => {
    const src = nav();
    const before = parseSmol(src) as { items: Array<Record<string, unknown>> };
    const order = [...Array(before.items.length).keys()].reverse();
    const after = parseSmol(reorderArrayTables(src, order)) as { items: Array<Record<string, unknown>> };
    expect(after.items).toEqual([...before.items].reverse());
  });

  it('keeps the owner comments at the top of the file', () => {
    const src = nav();
    const order = [...Array(arrayTableCount(src)).keys()].reverse();
    const out = reorderArrayTables(src, order);
    expect(out).toContain('# ניווט האתר');
    expect(out.includes('\n\n\n')).toBe(false);
  });

  it('refuses a permutation that drops, repeats or invents a position', () => {
    const src = nav();
    const n = arrayTableCount(src);
    const all = [...Array(n).keys()];
    expect(() => reorderArrayTables(src, all.slice(1))).toThrow();
    expect(() => reorderArrayTables(src, [0, ...all])).toThrow();
    expect(() => reorderArrayTables(src, all.map(() => 0))).toThrow();
    expect(() => reorderArrayTables(src, [...all.slice(1), n])).toThrow();
  });
});
