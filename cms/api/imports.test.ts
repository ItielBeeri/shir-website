/**
 * The serverless functions run as real Node ESM (`"type": "module"`), where a
 * relative import without a file extension throws ERR_MODULE_NOT_FOUND at load
 * and surfaces as an opaque FUNCTION_INVOCATION_FAILED with no stack in the
 * build log. Nothing else in the toolchain complains: Vite, Vitest and tsc all
 * resolve the extensionless form happily.
 *
 * This used to check a hard-coded pair of directories, which held only until
 * a function reached one file further - and then the bug it exists to catch
 * shipped anyway. It now follows the imports themselves, from the handlers
 * outwards, so a file is covered because a function can reach it rather than
 * because somebody remembered to list its folder.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = join(__dirname, '..');

const show = (file: string): string => relative(ROOT, file).replace(/\\/g, '/');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

/** Every relative specifier, whether the import is a type-only one or not. */
const RELATIVE = /(?:^|[\s;{(])(?:import|export)[\s\S]{0,200}?from\s+['"](\.[^'"]*)['"]/g;

/** What `./x.js`, `./x` or `./x/` actually is on disk. */
function onDisk(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec.replace(/\.js$/, ''));
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

interface Edge {
  from: string;
  spec: string;
}

/** Everything the handlers can reach, and every relative import along the way. */
function graph(): { files: Set<string>; edges: Edge[] } {
  const files = new Set<string>();
  const edges: Edge[] = [];
  const queue = walk(join(ROOT, 'api'));

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);

    for (const [, spec] of readFileSync(file, 'utf8').matchAll(RELATIVE)) {
      edges.push({ from: file, spec });
      const next = onDisk(file, spec);
      if (next && !files.has(next)) queue.push(next);
    }
  }
  return { files, edges };
}

describe('function module resolution', () => {
  const { files, edges } = graph();

  it('every relative import a function can reach carries a file extension', () => {
    const offences = edges
      .filter(({ spec }) => !/\.(js|json|css)$/.test(spec))
      .map(({ from, spec }) => `${show(from)} -> ${spec}`);
    expect(offences, `add .js to these imports:\n${offences.join('\n')}`).toEqual([]);
  });

  it('every relative import a function can reach resolves to a real file', () => {
    const missing = edges
      .filter(({ from, spec }) => onDisk(from, spec) === null)
      .map(({ from, spec }) => `${show(from)} -> ${spec}`);
    expect(missing, `these point at nothing:\n${missing.join('\n')}`).toEqual([]);
  });

  it('reaches past the handlers into the code they depend on', () => {
    const reached = [...files].map(show);
    expect(reached).toContain('api/content/[action].ts');
    expect(reached).toContain('src/git/engine.ts');
    // The one that shipped broken: pulled in through the engine, two hops out.
    expect(reached).toContain('src/model/describe.ts');
    expect(reached).toContain('src/model/screens.ts');
  });
});
