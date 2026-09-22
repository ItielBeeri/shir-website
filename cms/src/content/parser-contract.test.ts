/**
 * The CMS must read content with the same parsers the site does, or it shows
 * the owner a value the site never had.
 *
 * This is not hypothetical: js-yaml 5 rejects `psychotherapy.mdx` and
 * `voice.mdx` outright ("deficient indentation" - their summaries have
 * continuation lines at column 0), while the 4.x Astro pins folds them. An
 * unpinned upgrade here would break reading, not just formatting.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { load } from 'js-yaml';
import { parseFrontmatter } from './frontmatter';

const ROOT = join(__dirname, '../../..');
const major = (range: string) => /(\d+)/.exec(range)?.[1];

const pkg = (p: string) => JSON.parse(readFileSync(p, 'utf8')) as {
  version?: string;
  dependencies?: Record<string, string>;
};

describe('parser contract', () => {
  it('uses the same js-yaml major version as Astro', () => {
    const astro = pkg(join(ROOT, 'node_modules/astro/package.json'));
    const site = astro.dependencies?.['js-yaml'];
    expect(site, 'astro no longer depends on js-yaml - re-check this contract').toBeTruthy();

    const mine = pkg(join(__dirname, '../../node_modules/js-yaml/package.json')).version!;
    expect(major(mine)).toBe(major(site!));
  });

  it('parses every frontmatter the site parses', () => {
    const CONTENT = join(ROOT, 'src/content');
    const files = [
      join(CONTENT, 'about/about.mdx'),
      ...readdirSync(join(CONTENT, 'therapies')).map((f) => join(CONTENT, 'therapies', f)),
      ...readdirSync(join(CONTENT, 'blog')).map((f) => join(CONTENT, 'blog', f)),
    ];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      expect(() => parseFrontmatter(src), file).not.toThrow();
    }
  });

  it('folds an unindented continuation line rather than rejecting it', () => {
    const value = load('summary: "first\nsecond"\n') as { summary: string };
    expect(value.summary).toBe('first second');
  });
});
