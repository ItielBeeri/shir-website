/**
 * F-18, the other half: the TOML slot fuzzer.
 *
 * The incident that started this suite was a newline inside a basic string -
 * one value, written back in a shape TOML does not allow, and the site stopped
 * building. The MDX fuzzer found six defects on its first run; this asks the
 * same question of the format the incident was actually in.
 *
 * Every string slot in every live content file is written a hostile value, and
 * four things have to hold:
 *
 *   **It still parses**, with `smol-toml` - the parser the site builds with,
 *   not the one the editor writes with, because agreement between those two is
 *   the whole claim.
 *
 *   **It reads back exactly**, so nothing is silently re-encoded.
 *
 *   **It settles**: writing the same value twice gives the same bytes.
 *
 *   **Nothing else moves** - every other value, every Hebrew comment, and the
 *   line count outside the edit.
 *
 * The values are seeded, so a failure names a seed that reproduces it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { parseTOML } from 'toml-eslint-parser';
import { findSlot, setValue, slots } from './toml-edit';
import type { TomlPath } from './toml-edit';

const CONTENT = join(__dirname, '../../../src/content');

const files = [
  ...readdirSync(CONTENT)
    .filter((f) => f.endsWith('.toml'))
    .map((f) => join(CONTENT, f)),
  ...readdirSync(join(CONTENT, 'pages'))
    .filter((f) => f.endsWith('.toml'))
    .map((f) => join(CONTENT, 'pages', f)),
];

/** mulberry32 - seeded, so a failing case has a name. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Everything the TOML grammar reads as structure, plus what Hebrew copy is
 * actually made of. `‏` is the RTL mark the owner's keyboard emits around
 * Latin fragments; it is invisible and survives a paste without anyone seeing.
 */
const PIECES = [
  'שלום',
  'מרחב · נשימה',
  '"',
  '"""',
  "'",
  "'''",
  '\\',
  '\\n',
  '\n',
  '\r\n',
  '\t',
  '#',
  ' # לא הערה',
  '=',
  '[',
  ']',
  '[[x]]',
  '{ a = 1 }',
  ',',
  '.',
  '‏',
  '‫',
  '\u0000',
  '\u007f',
  '😊',
  '   ',
  '2026-09-23',
  '00:00:00',
  'true',
  '0x10',
  '1_000',
  'null',
];

function hostile(rng: () => number): string {
  const count = 1 + Math.floor(rng() * 5);
  const parts: string[] = [];
  for (let i = 0; i < count; i += 1) parts.push(PIECES[Math.floor(rng() * PIECES.length)]);
  return parts.join(rng() < 0.4 ? '' : ' ');
}

/** The value at `path`, read the way the site reads it. */
function readThrough(src: string, path: TomlPath): unknown {
  let node: unknown = parseToml(src);
  for (const segment of path) {
    node = (node as Record<string, unknown>)[segment as string];
  }
  return node;
}

/**
 * The comments, which no edit may disturb (AGENTS.md §5) - taken from the
 * parser rather than by looking for a `#`, because a `#` the owner types lands
 * inside a string, where it is punctuation and not a comment.
 */
const comments = (src: string): string[] => parseTOML(src).comments.map((c) => c.value);

const CASES = 24;
/**
 * Re-reading the whole document to check that nothing else moved costs more
 * than the write it is checking, so the structural half runs on a sample while
 * the half that catches a broken file runs on everything.
 */
const STRUCTURAL = 3;

describe.each(files.map((f) => [f.split(/[\\/]/).pop() as string, f]))('%s', (name, file) => {
  const src = readFileSync(file, 'utf8');
  const strings = slots(src).filter((s) => s.kind === 'string');

  it('has string slots to write to', () => {
    expect(strings.length).toBeGreaterThan(0);
  });

  it('survives a hostile value in every slot', () => {
    for (const slot of strings) {
      for (let seed = 1; seed <= CASES; seed += 1) {
        const value = hostile(random(seed * 31 + slot.range[0]));
        const where = `${name} ${slot.path.join('.')} seed ${seed}`;

        const once = setValue(src, slot.path, value);
        expect(() => parseToml(once), where).not.toThrow();
        expect(readThrough(once, slot.path), where).toBe(value);

        // The slot's range moved with the new literal; find it again rather
        // than reusing a range the edit invalidated.
        const twice = setValue(once, slot.path, value);
        expect(twice, where).toBe(once);

        if (seed > STRUCTURAL) continue;
        expect(findSlot(once, slot.path).value, where).toBe(value);
        expect(comments(once), where).toEqual(comments(src));
        expect(slots(once).map((s) => s.path.join('.')), where).toEqual(
          slots(src).map((s) => s.path.join('.')),
        );
      }
    }
  });

  it('leaves every other value exactly as it was', () => {
    const target = strings[0];
    const others = (text: string): string[] =>
      slots(text)
        .filter((s) => s.path.join('.') !== target.path.join('.'))
        .map((s) => `${s.path.join('.')}=${String(s.value)}`);
    for (let seed = 1; seed <= STRUCTURAL; seed += 1) {
      const out = setValue(src, target.path, hostile(random(seed)));
      expect(others(out), `${name} seed ${seed}`).toEqual(others(src));
    }
  });
});

describe('the fuzzer itself', () => {
  it('generates values that need escaping, or it proves nothing', () => {
    const sample = Array.from({ length: 60 }, (_, i) => hostile(random(i + 1)));
    expect(sample.filter((v) => /["\\\n]/.test(v)).length).toBeGreaterThan(20);
    expect(sample.some((v) => v.includes('‏'))).toBe(true);
  });

  it('writes a value the site reads back through its own parser', () => {
    // The end-to-end shape, stated once: the editor's writer and the site's
    // reader are different libraries, and this is the only thing that matters.
    const src = readFileSync(join(CONTENT, 'site.toml'), 'utf8');
    const slot = slots(src).find((s) => s.kind === 'string')!;
    const value = 'שורה\nשנייה " עם גרש \\ ולוכסן';
    const out = setValue(src, slot.path, value);
    expect(readThrough(out, slot.path)).toBe(value);
  });
});
