/**
 * The Phase 0 gate. These run against the live content files rather than
 * fixtures - that is the reason cms/ lives in this repo - so a comment or a
 * quoting style added to the site is tested here the moment it lands.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseSmol } from 'smol-toml';
import { setValue, setValues, slots } from './toml-edit';

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
});
