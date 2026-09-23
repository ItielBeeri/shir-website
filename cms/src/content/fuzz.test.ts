/**
 * X-3 / F-18: the generated-sequence gate.
 *
 * Every other test here asks a question somebody thought to ask. The two
 * defects that actually reached production - text serialized unescaped, and an
 * escaper that ran over its own output - were both of a shape nobody thought
 * to ask about, and both would have died here on the first run.
 *
 * Two properties, over documents nobody wrote by hand:
 *
 *   **What she typed is what she reads back.** Text goes through the editor's
 *   model, out to MDX, and back; it has to return unchanged.
 *
 *   **A save settles.** Writing the same document twice produces the same
 *   bytes as writing it once, so nothing accumulates across saves.
 *
 * The generator is seeded, so a failure names a seed that reproduces it
 * exactly rather than a case that vanishes on the next run.
 */
import { describe, expect, it } from 'vitest';
import { allBlocks, parseMdx, serializeMdx } from './mdx-edit';
import type { Block, Inline, MdxDoc, Segment } from './mdx-edit';

/** mulberry32 - small, seeded, and good enough to shuffle punctuation. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ['שלום', 'מרחב', 'נשימה', 'גוף', 'קול', 'תנועה', 'מפגש', 'שקט', 'אור', 'דרך'];

/**
 * Every character the grammars care about, mixed in with ordinary words.
 * A bare address is deliberately absent: GFM autolinks one whatever the
 * escaper does, which `escaping.test.ts` establishes on its own.
 */
const HOSTILE = [
  '#', '##', '###', '>', '-', '+', '*', '_', '~', '~~', '`', '|', '[', ']', '{', '}',
  '<', '<b>', '1.', '2)', '---', '===', '~~~', '\\', '&amp;', '![', '](', ':', '!',
  '&', '<!--', '-->', '    ', '\t',
];

const pick = <T,>(rng: () => number, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

/** A line of text with punctuation scattered through it. */
function line(rng: () => number): string {
  const parts: string[] = [];
  const count = 1 + Math.floor(rng() * 6);
  for (let i = 0; i < count; i += 1) {
    parts.push(rng() < 0.45 ? pick(rng, HOSTILE) : pick(rng, WORDS));
  }
  // A leading token is the interesting case: that is where a block starts.
  // The ends are trimmed because markdown cannot carry an indent at the start
  // of a block at all - that loss is normalised once on write and covered by
  // its own tests, rather than left to make every property here noisy.
  const text = parts.join(rng() < 0.3 ? '' : ' ').trim();
  return text === '' ? pick(rng, WORDS) : text;
}

/** One to three lines, because remark-breaks makes every line a block start. */
const paragraphText = (rng: () => number): string =>
  Array.from({ length: 1 + Math.floor(rng() * 3) }, () => line(rng)).join('\n');

const text = (value: string): Inline[] => [{ type: 'text', value }];

/** Never an opaque block: those are the file's own bytes, not hers to type. */
function block(rng: () => number): Exclude<Block, { kind: 'opaque' }> {
  const roll = rng();
  if (roll < 0.55) return { kind: 'paragraph', source: '', inline: text(paragraphText(rng)) };
  if (roll < 0.75) {
    return { kind: 'heading', depth: rng() < 0.5 ? 2 : 3, source: '', inline: text(line(rng)) };
  }
  return {
    kind: 'list',
    ordered: rng() < 0.5,
    source: '',
    items: Array.from({ length: 1 + Math.floor(rng() * 3) }, () => text(line(rng))),
  };
}

function document(rng: () => number): { doc: MdxDoc; typed: string[] } {
  const segments: Segment[] = [];
  const typed: string[] = [];
  const count = 1 + Math.floor(rng() * 5);

  for (let i = 0; i < count; i += 1) {
    let b = block(rng);
    // Markdown cannot hold two lists of the same kind apart, so `pmToDoc`
    // merges them before they ever reach a file; generating a pair here would
    // only test a document the serializer is never handed.
    const last = segments[segments.length - 1];
    while (
      last?.type === 'block' &&
      last.block.kind === 'list' &&
      b.kind === 'list' &&
      last.block.ordered === b.ordered
    ) {
      b = block(rng);
    }
    segments.push({ type: 'gap', text: i === 0 ? '\n' : '\n\n' });
    segments.push({ type: 'block', block: b });
    if (b.kind === 'paragraph' || b.kind === 'heading') {
      typed.push((b.inline[0] as { value: string }).value);
    } else {
      for (const item of b.items) typed.push((item[0] as { value: string }).value);
    }
  }
  segments.push({ type: 'gap', text: '\n' });
  return { doc: { frontmatter: '---\ntitle: "בדיקה"\n---\n', segments }, typed };
}

/** What the editor reads back out of a file, block by block. */
function readBack(mdx: string): string[] {
  const out: string[] = [];
  for (const segment of parseMdx(mdx).segments) {
    if (segment.type !== 'block') continue;
    const b = segment.block;
    if (b.kind === 'paragraph' || b.kind === 'heading') {
      out.push(b.inline.map((n) => ('value' in n ? n.value : `«${n.type}»`)).join(''));
    } else if (b.kind === 'list') {
      for (const item of b.items) {
        out.push(item.map((n) => ('value' in n ? n.value : `«${n.type}»`)).join(''));
      }
    } else {
      out.push(`«opaque»`);
    }
  }
  return out;
}

const write = (doc: MdxDoc): string => serializeMdx(doc, allBlocks(doc));

const CASES = 500;

describe('generated documents', () => {
  const seeds = Array.from({ length: CASES }, (_, i) => i + 1);

  it('reads back exactly what was typed', () => {
    for (const seed of seeds) {
      const { doc, typed } = document(random(seed));
      expect(readBack(write(doc)), `seed ${seed}`).toEqual(typed);
    }
  });

  it('settles after one save', () => {
    for (const seed of seeds) {
      const { doc } = document(random(seed));
      const once = write(doc);
      const twice = write(parseMdx(once));
      expect(twice, `seed ${seed}`).toBe(once);
    }
  });

  it('keeps every block a block of its own', () => {
    for (const seed of seeds) {
      const { doc, typed } = document(random(seed));
      expect(readBack(write(doc)).length, `seed ${seed}`).toBe(typed.length);
    }
  });

  it('never writes a heading the owner did not ask for', () => {
    for (const seed of seeds) {
      const { doc } = document(random(seed));
      const wanted = doc.segments.filter(
        (s) => s.type === 'block' && s.block.kind === 'heading',
      ).length;
      const got = parseMdx(write(doc)).segments.filter(
        (s) => s.type === 'block' && s.block.kind === 'heading',
      ).length;
      expect(got, `seed ${seed}`).toBe(wanted);
    }
  });

  it('is generating documents worth testing', () => {
    // A generator that quietly stopped producing punctuation would make every
    // property above pass for the wrong reason.
    const sample = seeds.slice(0, 40).map((seed) => write(document(random(seed)).doc));
    const escaped = sample.filter((mdx) => mdx.includes('\\')).length;
    expect(escaped).toBeGreaterThan(30);
    expect(sample.some((mdx) => mdx.includes('\n\n'))).toBe(true);
  });
});
