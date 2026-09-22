/**
 * The serverless functions run as real Node ESM (`"type": "module"`), where a
 * relative import without a file extension throws ERR_MODULE_NOT_FOUND at load
 * and surfaces as an opaque FUNCTION_INVOCATION_FAILED with no stack in the
 * build log. Nothing else in the toolchain complains: Vite, Vitest and tsc all
 * resolve the extensionless form happily.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

/** Everything the functions can pull in at runtime. */
const reachable = (): string[] => [...walk(join(ROOT, 'api')), ...walk(join(ROOT, 'src/git'))];

const RELATIVE = /(?:from|import)\s+['"](\.[^'"]*)['"]/g;

describe('function module resolution', () => {
  it('every relative import in a function-reachable file has a file extension', () => {
    const offences: string[] = [];
    for (const file of reachable()) {
      const source = readFileSync(file, 'utf8');
      for (const [, spec] of source.matchAll(RELATIVE)) {
        if (!/\.(js|json|css)$/.test(spec)) {
          offences.push(`${file.slice(ROOT.length + 1)} -> ${spec}`);
        }
      }
    }
    expect(offences, `add .js to these imports:\n${offences.join('\n')}`).toEqual([]);
  });

  it('covers the files it claims to', () => {
    const files = reachable().map((f) => f.slice(ROOT.length + 1).replace(/\\/g, '/'));
    expect(files).toContain('api/auth/[action].ts');
    expect(files).toContain('api/content/[action].ts');
    expect(files).toContain('src/git/engine.ts');
  });
});
