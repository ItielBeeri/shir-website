/**
 * `cms/` compiles alone, or it does not compile on Vercel.
 *
 * This package is deliberately not a pnpm workspace member (AGENTS.md §13):
 * the site's dependency tree must not move, so it is installed separately and
 * the CMS's Vercel project installs only `cms/package.json`. Import a file
 * from `../src/` and `tsc --noEmit` follows it into dependencies that are not
 * there, and `pnpm build` fails - *on Vercel only*. On a developer's machine
 * the repo-root `node_modules` is one directory up, so the same import
 * resolves and every local check passes. That is what makes this worth a test
 * rather than a rule: the failure is invisible where it is written.
 *
 * Reading the site's files is fine and is how several gates here work; it is
 * *importing* them that drags a second dependency tree into this one.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const ROOT = join(__dirname, '..');

const show = (file: string): string => relative(ROOT, file).replace(/\\/g, '/');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === 'node_modules' ? [] : walk(full);
    return /\.(ts|tsx|mts|mjs)$/.test(full) ? [full] : [];
  });
}

/** Every relative specifier, type-only imports and re-exports included. */
function specifiers(source: string): string[] {
  return [
    ...source.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g),
  ].map((m) => m[1]);
}

const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'api')), ...walk(join(ROOT, 'scripts'))];

describe('the cms package boundary', () => {
  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('imports nothing from outside cms/', () => {
    const escapes = files.flatMap((file) =>
      specifiers(readFileSync(file, 'utf8'))
        .map((spec) => resolve(dirname(file), spec))
        .filter((target) => relative(ROOT, target).startsWith('..'))
        .map((target) => `${show(file)} → ${relative(ROOT, target).replace(/\\/g, '/')}`),
    );
    expect(escapes, 'an import outside cms/ compiles here but not on Vercel').toEqual([]);
  });

  it('still lets a test read the site, which is how the cross-checks work', () => {
    const social = readFileSync(join(ROOT, 'src/model/social.test.ts'), 'utf8');
    expect(social).toContain('../../../src');
    expect(specifiers(social).some((s) => s.includes('../../../src'))).toBe(false);
  });
});
