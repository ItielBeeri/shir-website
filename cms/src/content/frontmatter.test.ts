/** Gates F-16 and F-17 from TEST-SPEC.md, against the live MDX files. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fieldNames, fieldRange, parseFrontmatter, readSpan, setField } from './frontmatter';

const CONTENT = join(__dirname, '../../../src/content');
const files = [
  join(CONTENT, 'about/about.mdx'),
  ...readdirSync(join(CONTENT, 'therapies')).map((f) => join(CONTENT, 'therapies', f)),
  ...readdirSync(join(CONTENT, 'blog')).map((f) => join(CONTENT, 'blog', f)),
];

describe('frontmatter', () => {
  describe.each(files.map((f) => [f.split(/[\\/]/).pop() as string, f]))('%s', (name, file) => {
    const src = readFileSync(file, 'utf8');
    const fm = parseFrontmatter(src);

    it('parses with the same parser Astro uses', () => {
      expect(Object.keys(fm.data).length).toBeGreaterThan(0);
    });

    it('F-16 rewrites every field to itself byte-identically', () => {
      for (const key of fieldNames(fm.text)) {
        const [start, end] = fieldRange(fm.text, key);
        const raw = fm.text.slice(start, end);
        const value = fm.data[key];
        if (value === undefined) continue;
        const out = setField(src, key, value as never);
        expect(out, `${name}.${key} (raw ${JSON.stringify(raw)})`).toBe(src);
      }
    });

    it('field spans agree with what the parser read', () => {
      for (const key of fieldNames(fm.text)) {
        const [start, end] = fieldRange(fm.text, key);
        expect(readSpan(key, fm.text.slice(start, end)), `${name}.${key}`).toEqual(fm.data[key]);
      }
    });

    it('F-17 keeps every PLACEHOLDER marker across an edit', () => {
      const markers = (s: string) => (s.match(/PLACEHOLDER/g) ?? []).length;
      const key = fieldNames(fm.text)[0];
      const out = setField(src, key, 'כותרת חדשה');
      expect(markers(out)).toBe(markers(src));
    });

    it('an edit changes one field and no other', () => {
      const key = fieldNames(fm.text).find((k) => typeof fm.data[k] === 'string')!;
      const out = setField(src, key, 'ערך חדש');
      const after = parseFrontmatter(out);
      expect(after.data[key]).toBe('ערך חדש');
      for (const other of Object.keys(fm.data)) {
        if (other === key) continue;
        expect(after.data[other], other).toEqual(fm.data[other]);
      }
      // Body untouched.
      expect(out.slice(after.raw.length)).toBe(src.slice(fm.raw.length));
    });
  });

  it('handles the unindented multi-line scalar in voice.mdx', () => {
    const src = readFileSync(join(CONTENT, 'therapies/voice.mdx'), 'utf8');
    const fm = parseFrontmatter(src);
    const [start, end] = fieldRange(fm.text, 'summary');
    const raw = fm.text.slice(start, end);
    expect(raw).toMatch(/^"/);
    expect(raw).toMatch(/"$/);
    expect(raw).toContain('\n');
    // js-yaml folds the single newline to a space; the value has none.
    expect(fm.data.summary).not.toContain('\n');
    expect(setField(src, 'summary', fm.data.summary as string)).toBe(src);
  });

  it('promotes to a block scalar when a real line break is introduced', () => {
    const src = readFileSync(join(CONTENT, 'blog/מה-זה-צל.mdx'), 'utf8');
    const out = setField(src, 'excerpt', 'שורה ראשונה\nשורה שנייה');
    expect(parseFrontmatter(out).data.excerpt).toBe('שורה ראשונה\nשורה שנייה');
  });

  it('keeps an array field as a flow sequence', () => {
    const src = readFileSync(join(CONTENT, 'blog/מה-זה-צל.mdx'), 'utf8');
    const out = setField(src, 'tags', ['אור', 'צל', 'נפש']);
    expect(out).toContain('tags: ["אור", "צל", "נפש"]');
    expect(parseFrontmatter(out).data.tags).toEqual(['אור', 'צל', 'נפש']);
  });

  it('writes booleans and numbers unquoted so the schema still coerces', () => {
    const src = readFileSync(join(CONTENT, 'blog/מה-זה-צל.mdx'), 'utf8');
    expect(parseFrontmatter(setField(src, 'draft', true)).data.draft).toBe(true);
    const ordered = setField(src, 'title', 'x');
    expect(parseFrontmatter(ordered).data.title).toBe('x');
  });

  it('escapes a quote without breaking the document', () => {
    const src = readFileSync(join(CONTENT, 'blog/מה-זה-צל.mdx'), 'utf8');
    const out = setField(src, 'title', 'עם "מרכאות" בפנים');
    expect(parseFrontmatter(out).data.title).toBe('עם "מרכאות" בפנים');
  });
});
