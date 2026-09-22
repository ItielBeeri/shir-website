/** Gates F-16 and F-17 from TEST-SPEC.md, against the live MDX files. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  fieldNames,
  fieldRange,
  hasField,
  parseFrontmatter,
  readSpan,
  encodeValue,
  removeField,
  setField,
  setFields,
} from './frontmatter';

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

  /* An optional key the file does not carry: pinning a post is exactly this. */
  describe('keys that are not in the file yet', () => {
    const BLOG_KEYS = ['title', 'excerpt', 'date', 'cover', 'tags', 'related_therapy', 'order', 'draft'];
    const unpinned = join(CONTENT, 'blog/מה-זה-צל.mdx');

    it('inserts the line rather than failing', () => {
      const src = readFileSync(unpinned, 'utf8');
      expect(hasField(src, 'order')).toBe(false);
      const out = setField(src, 'order', 2, { order: BLOG_KEYS });
      expect(parseFrontmatter(out).data.order).toBe(2);
    });

    it('puts it where the model says it belongs, not at the end', () => {
      const src = readFileSync(unpinned, 'utf8');
      const names = fieldNames(parseFrontmatter(setField(src, 'order', 2, { order: BLOG_KEYS })).text);
      expect(names.indexOf('order')).toBe(names.indexOf('related_therapy') + 1);
      expect(names.indexOf('order')).toBe(names.indexOf('draft') - 1);
    });

    it('changes nothing else, body included', () => {
      const src = readFileSync(unpinned, 'utf8');
      const before = parseFrontmatter(src);
      const out = setField(src, 'order', 2, { order: BLOG_KEYS });
      const after = parseFrontmatter(out);
      for (const key of Object.keys(before.data)) {
        expect(after.data[key], key).toEqual(before.data[key]);
      }
      expect(out.slice(after.raw.length)).toBe(src.slice(before.raw.length));
    });

    it('falls back to the end of the block with nothing to go by', () => {
      const src = readFileSync(unpinned, 'utf8');
      const names = fieldNames(parseFrontmatter(setField(src, 'order', 2)).text);
      expect(names[names.length - 1]).toBe('order');
    });
  });

  describe('clearing a key', () => {
    const BLOG_KEYS = ['title', 'excerpt', 'date', 'cover', 'tags', 'related_therapy', 'order', 'draft'];
    const pinned = join(CONTENT, 'blog/אנושיות-מרפאת.mdx');

    it('removes the whole line', () => {
      const src = readFileSync(pinned, 'utf8');
      expect(hasField(src, 'order')).toBe(true);
      const out = removeField(src, 'order');
      expect(hasField(out, 'order')).toBe(false);
      expect(parseFrontmatter(out).data.order).toBeUndefined();
    });

    it('leaves every other byte alone', () => {
      const src = readFileSync(pinned, 'utf8');
      const value = parseFrontmatter(src).data.order as number;
      expect(setField(removeField(src, 'order'), 'order', value, { order: BLOG_KEYS })).toBe(src);
    });

    it('is a no-op when the key was never there', () => {
      const src = readFileSync(join(CONTENT, 'blog/מה-זה-צל.mdx'), 'utf8');
      expect(removeField(src, 'order')).toBe(src);
    });

    it('does not leave a blank line when the last field goes', () => {
      const src = readFileSync(pinned, 'utf8');
      const last = fieldNames(parseFrontmatter(src).text).pop()!;
      const out = removeField(src, last);
      expect(parseFrontmatter(out).text.endsWith('\n')).toBe(false);
      expect(Object.keys(parseFrontmatter(out).data)).not.toContain(last);
    });

    it('setFields treats undefined as a removal', () => {
      const src = readFileSync(pinned, 'utf8');
      const out = setFields(src, [{ key: 'order', value: undefined }]);
      expect(hasField(out, 'order')).toBe(false);
    });
  });
});

describe('encodeValue, for a block being written from scratch', () => {
  const parse = (body: string) => parseFrontmatter(`---\n${body}\n---\n\nגוף\n`).data;

  it('keeps a line break the owner typed', () => {
    const out = parse(`excerpt: ${encodeValue('שורה ראשונה' + String.fromCharCode(10) + 'שורה שנייה')}`);
    expect(out.excerpt).toBe('שורה ראשונה' + String.fromCharCode(10) + 'שורה שנייה');
  });

  it('never writes a quoted scalar that spans lines', () => {
    const encoded = encodeValue('אחת' + String.fromCharCode(10) + 'שתיים');
    expect(encoded.startsWith('"')).toBe(false);
    expect(encoded.startsWith('|')).toBe(true);
  });

  it('quotes a value that would otherwise change meaning', () => {
    expect(parse(`title: ${encodeValue('בדיקה: "ציטוט" ו#תגית')}`).title).toBe('בדיקה: "ציטוט" ו#תגית');
    // Bare, these would be a boolean and a number, which z.string() rejects.
    expect(parse(`title: ${encodeValue('true')}`).title).toBe('true');
    expect(parse(`title: ${encodeValue('123')}`).title).toBe('123');
    expect(parse(`title: ${encodeValue('null')}`).title).toBe('null');
    expect(parse(`title: ${encodeValue('')}`).title).toBe('');
  });

  it('writes an empty list and a boolean the schema can read', () => {
    expect(parse(`tags: ${encodeValue([])}`).tags).toEqual([]);
    expect(parse(`draft: ${encodeValue(true)}`).draft).toBe(true);
    expect(parse(`tags: ${encodeValue(['אחת', 'שתיים'])}`).tags).toEqual(['אחת', 'שתיים']);
  });
});
