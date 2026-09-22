/** Gates F-12 … F-15 from TEST-SPEC.md, against the live content files. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseSmol } from 'smol-toml';
import {
  appendImage,
  appendRecommendation,
  deleteRecommendation,
  imageIds,
  nextRecommendationId,
  recommendationIds,
  reorderRecommendations,
} from './toml-struct';

const CONTENT = join(__dirname, '../../../src/content');
const images = () => readFileSync(join(CONTENT, 'images.toml'), 'utf8');
const recs = () => readFileSync(join(CONTENT, 'recommendations.toml'), 'utf8');

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
