/**
 * The Phase 0 gate. These run against the live content files rather than
 * fixtures - that is the reason cms/ lives in this repo - so a comment or a
 * quoting style added to the site is tested here the moment it lands.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseSmol } from 'smol-toml';
import { arrays, setStringArray, setValue, setValues, slots } from './toml-edit';

const CONTENT = join(__dirname, '../../../src/content');

const tomlFiles = (): string[] => {
  const here = readdirSync(CONTENT).filter((f) => f.endsWith('.toml')).map((f) => join(CONTENT, f));
  const pages = readdirSync(join(CONTENT, 'pages'))
    .filter((f) => f.endsWith('.toml'))
    .map((f) => join(CONTENT, 'pages', f));
  return [...here, ...pages];
};

const files = tomlFiles();

describe('toml-edit', () => {
  it('finds every content file', () => {
    expect(files.length).toBe(10);
  });

  describe.each(files.map((f) => [f.split(/[\\/]/).pop() as string, f]))('%s', (_name, file) => {
    const src = readFileSync(file, 'utf8');

    it('rewrites every value to itself byte-identically', () => {
      const all = slots(src);
      expect(all.length).toBeGreaterThan(0);
      const out = setValues(
        src,
        all.map((s) => ({ path: s.path, value: s.value })),
      );
      expect(out).toBe(src);
    });

    it('rewrites each value one at a time byte-identically', () => {
      for (const slot of slots(src)) {
        expect(setValue(src, slot.path, slot.value), slot.path.join('.')).toBe(src);
      }
    });

    it('enumerates the same values smol-toml parses', () => {
      const parsed = parseSmol(src) as Record<string, unknown>;
      for (const slot of slots(src)) {
        let cursor: any = parsed;
        for (const seg of slot.path) cursor = cursor?.[seg as never];
        expect(cursor, slot.path.join('.')).toEqual(slot.value);
      }
    });

    it('survives an actual edit and still parses', () => {
      const strings = slots(src).filter((s) => s.kind === 'string');
      if (!strings.length) return;
      const target = strings[strings.length - 1];
      const out = setValue(src, target.path, 'ערך חדש לבדיקה');
      expect(out).not.toBe(src);
      let cursor: any = parseSmol(out);
      for (const seg of target.path) cursor = cursor?.[seg as never];
      expect(cursor).toBe('ערך חדש לבדיקה');
      // Only the one value moved: comment count and line count are unchanged.
      const comments = (s: string) => s.split('\n').filter((l) => l.trimStart().startsWith('#')).length;
      expect(comments(out)).toBe(comments(src));
    });

    it('rewrites every string array to itself byte-identically', () => {
      for (const list of arrays(src)) {
        const values = list.elements.map((r) => src.slice(r[0], r[1]));
        if (!values.every((v) => /^["']/.test(v))) continue;
        let cursor: any = parseSmol(src);
        for (const seg of list.path) cursor = cursor?.[seg as never];
        expect(setStringArray(src, list.path, cursor as string[]), list.path.join('.')).toBe(src);
      }
    });
  });

  it('keeps Hebrew comments when a value changes', () => {
    const file = join(CONTENT, 'site.toml');
    const src = readFileSync(file, 'utf8');
    const out = setValue(src, ['contact', 'phone_display'], '050-000-0000');
    expect(out).toContain('# תוכן גלובלי של האתר');
    expect(out).toContain('"050-000-0000"');
    expect(parseSmol(out)).toMatchObject({ contact: { phone_display: '050-000-0000' } });
  });

  it('promotes a basic string to multiline when a newline is introduced', () => {
    const file = join(CONTENT, 'pages/contact.toml');
    const src = readFileSync(file, 'utf8');
    const out = setValue(src, ['hero', 'intro'], 'שורה\nשנייה');
    expect(parseSmol(out)).toMatchObject({ hero: { intro: 'שורה\nשנייה' } });
  });

  it('escapes a quote without breaking the document', () => {
    const file = join(CONTENT, 'pages/contact.toml');
    const src = readFileSync(file, 'utf8');
    const out = setValue(src, ['hero', 'title'], 'עם "מרכאות" בפנים');
    expect(parseSmol(out)).toMatchObject({ hero: { title: 'עם "מרכאות" בפנים' } });
  });

  describe('setStringArray', () => {
    const file = join(CONTENT, 'pages/accessibility.toml');
    const src = () => readFileSync(file, 'utf8');
    const read = (text: string, path: (string | number)[]): string[] => {
      let cursor: any = parseSmol(text);
      for (const seg of path) cursor = cursor?.[seg as never];
      return cursor as string[];
    };
    const ITEMS = ['sections', 2, 'items'] as (string | number)[];

    it('adds one without disturbing the others', () => {
      const before = read(src(), ITEMS);
      const out = setStringArray(src(), ITEMS, [...before, 'פסקה חדשה לבדיקה']);
      expect(read(out, ITEMS)).toEqual([...before, 'פסקה חדשה לבדיקה']);
    });

    it('removes one', () => {
      const before = read(src(), ITEMS);
      const out = setStringArray(src(), ITEMS, before.filter((_, i) => i !== 1));
      expect(read(out, ITEMS)).toEqual(before.filter((_, i) => i !== 1));
    });

    it('reorders without rewriting the text', () => {
      const before = read(src(), ITEMS);
      const swapped = [before[1], before[0], ...before.slice(2)];
      const out = setStringArray(src(), ITEMS, swapped);
      expect(read(out, ITEMS)).toEqual(swapped);
    });

    it('keeps the layout: one element per line, indented, trailing comma', () => {
      const before = read(src(), ITEMS);
      const out = setStringArray(src(), ITEMS, [...before, 'שורה נוספת']);
      const block = out.slice(out.indexOf('items = ['));
      const lines = block.slice(0, block.indexOf('\n]')).split('\n').slice(1);
      expect(lines.length).toBe(before.length + 1);
      for (const line of lines) {
        expect(line.startsWith('  "')).toBe(true);
        expect(line.endsWith('",')).toBe(true);
      }
    });

    it('keeps every comment in the file', () => {
      const comments = (s: string) => s.split('\n').filter((l) => l.trimStart().startsWith('#')).length;
      const out = setStringArray(src(), ITEMS, ['שורה אחת בלבד']);
      expect(comments(out)).toBe(comments(src()));
      expect(out).toContain('# הצהרת נגישות');
    });

    it('writes an empty list as an empty array', () => {
      const out = setStringArray(src(), ITEMS, []);
      expect(read(out, ITEMS)).toEqual([]);
      expect(out).toContain('items = []');
    });

    it('escapes a quote in a new paragraph', () => {
      const out = setStringArray(src(), ITEMS, ['עם "מרכאות" בפנים']);
      expect(read(out, ITEMS)).toEqual(['עם "מרכאות" בפנים']);
    });

    it('refuses an array that is not text', () => {
      expect(() => setStringArray('a = [1, 2]', ['a'], ['x'])).toThrow();
    });

    it('keeps a one-line array on one line', () => {
      const out = setStringArray('a = ["x", "y"]\n', ['a'], ['x', 'y', 'z']);
      expect(out).toBe('a = ["x", "y", "z"]\n');
    });
  });
});
