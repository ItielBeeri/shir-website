/**
 * Gates C-1 … C-6: the content model must not drift from the site.
 *
 * AGENTS.md §13 makes updating `cms/` part of any shape change; these tests are
 * what makes that enforceable rather than aspirational.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { DELIBERATELY_HIDDEN, screens } from './screens';
import { THERAPY_OPTIONS } from './types';
import type { Field } from './types';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const allFields = (): Field[] =>
  screens.flatMap((s) => [
    ...(s.groups?.flatMap((g) => g.fields) ?? []),
    ...(s.frontmatter ?? []),
  ]);

/** Dotted leaf keys of a parsed TOML document, skipping array-of-table bodies. */
function leafKeys(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return [prefix];
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
      leafKeys(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [prefix];
}

describe('content model', () => {
  it('every screen points at a path under src/content or public/img', () => {
    for (const s of screens) {
      const p = s.file ?? s.dir;
      expect(p, s.id).toBeTruthy();
      expect(p!.startsWith('src/content/') || p!.startsWith('public/img/'), p).toBe(true);
    }
  });

  it('screen ids and field keys are unique within a screen', () => {
    expect(new Set(screens.map((s) => s.id)).size).toBe(screens.length);
    for (const s of screens) {
      const keys = [
        ...(s.groups?.flatMap((g) => g.fields.map((f) => f.key)) ?? []),
        ...(s.frontmatter?.map((f) => f.key) ?? []),
      ];
      expect(new Set(keys).size, s.id).toBe(keys.length);
    }
  });

  describe.each([
    ['src/content/pages/home.toml', 'home'],
    ['src/content/pages/contact.toml', 'contact'],
    ['src/content/pages/404.toml', 'notfound'],
    ['src/content/site.toml', 'site'],
  ])('%s', (file, screenId) => {
    const live = leafKeys(parseToml(read(file))).filter(Boolean);
    const screen = screens.find((s) => s.id === screenId)!;
    const modelled = new Set(
      (screen.groups ?? []).flatMap((g) => g.fields.map((f) => (f.path ?? []).join('.'))),
    );

    it('C-1 every live key is modelled or deliberately hidden', () => {
      for (const key of live) {
        const known = modelled.has(key) || key in DELIBERATELY_HIDDEN;
        expect(known, `unmodelled key: ${key} (add a field or list it in DELIBERATELY_HIDDEN)`).toBe(
          true,
        );
      }
    });

    it('C-2 every modelled path exists in the live file', () => {
      for (const path of modelled) {
        expect(live, `phantom field: ${path}`).toContain(path);
      }
    });
  });

  it('C-3 collection frontmatter matches src/content/config.ts', () => {
    const config = read('src/content/config.ts');
    const block = (name: string) => {
      const i = config.indexOf(`const ${name} = defineCollection`);
      const j = config.indexOf('});', i);
      return config.slice(i, j);
    };
    const declared = (name: string) =>
      [...block(name).matchAll(/^\s{4}([a-z_]+):/gm)].map((m) => m[1]);

    for (const [collection, screenId] of [
      ['blog', 'blog'],
      ['therapies', 'therapies'],
      ['about', 'about'],
    ] as const) {
      const site = declared(collection);
      expect(site.length, collection).toBeGreaterThan(0);
      const screen = screens.find((s) => s.id === screenId)!;
      const modelled = new Set((screen.frontmatter ?? []).map((f) => f.key));
      for (const key of site) {
        const known = modelled.has(key) || key in DELIBERATELY_HIDDEN;
        expect(known, `${collection}.${key} is in config.ts but not modelled`).toBe(true);
      }
      for (const key of modelled) {
        expect(site, `${collection}.${key} is modelled but not in config.ts`).toContain(key);
      }
    }
  });

  it('C-4 therapy options equal the accent enum in config.ts', () => {
    const config = read('src/content/config.ts');
    const accents = [...config.matchAll(/z\.enum\(\[([^\]]+)\]\)/g)]
      .map((m) => m[1].split(',').map((s) => s.trim().replace(/['"]/g, '')))
      .find((list) => list.includes('psychotherapy'))!;
    expect(THERAPY_OPTIONS.map((o) => o.value).sort()).toEqual([...accents].sort());
  });

  it('C-5 every image id the site references exists in images.toml', () => {
    const ids = new Set(Object.keys(parseToml(read('src/content/images.toml'))));
    const files = [
      'src/content/about/about.mdx',
      'src/content/therapies/psychotherapy.mdx',
      'src/content/therapies/shiatsu.mdx',
      'src/content/therapies/voice.mdx',
      'src/content/therapies/workshops.mdx',
      'src/content/therapies/ceremonies.mdx',
      'src/content/pages/home.toml',
    ];
    for (const file of files) {
      const text = read(file);
      const referenced = [
        ...[...text.matchAll(/(?:hero_image|teaser_image|portrait_image|cover|portrait):\s*"([^"]+)"/g)].map(
          (m) => m[1],
        ),
        ...[...text.matchAll(/portrait\s*=\s*"([^"]+)"/g)].map((m) => m[1]),
        ...[...text.matchAll(/<SoftImage[^>]*\bid="([^"]+)"/g)].map((m) => m[1]),
      ];
      for (const id of referenced) {
        expect(ids, `${file} references missing image id "${id}"`).toContain(id);
      }
    }
  });

  it('C-6 every label and help string is Hebrew and non-empty', () => {
    const hebrew = /[֐-׿]/;
    for (const f of allFields()) {
      expect(f.label.trim().length, f.key).toBeGreaterThan(0);
      expect(hebrew.test(f.label), `${f.key}: "${f.label}" has no Hebrew`).toBe(true);
      if (f.help) expect(hebrew.test(f.help), `${f.key} help`).toBe(true);
    }
    for (const s of screens) {
      expect(hebrew.test(s.title), s.id).toBe(true);
      if (s.blurb) expect(hebrew.test(s.blurb), s.id).toBe(true);
    }
  });

  it('no field label leaks a file name, key name or syntax (A-2.1)', () => {
    for (const f of allFields()) {
      expect(f.label, f.key).not.toMatch(/\.toml|\.mdx|[=[\]{}]|"""/);
      if (f.help) expect(f.help, f.key).not.toMatch(/\.toml|\.mdx|"""/);
    }
  });

  it('offers no control the site cannot render (AGENTS.md §13)', () => {
    const types = new Set(allFields().map((f) => f.type));
    expect(types.has('url')).toBe(true); // social links are fields, not body links
    for (const f of allFields()) {
      expect(f.key, 'h1 is owned by the page template').not.toBe('h1');
    }
  });
});
