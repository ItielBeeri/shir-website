/**
 * X-3 / F-18: the generated-sequence gate.
 *
 * Every other test here asks a question somebody thought to ask. The two
 * defects that actually reached production - text serialized unescaped, and an
 * escaper that ran over its own output - were both of a shape nobody thought
 * to ask about, and both would have died here on the first run.
 *
 * Three properties, over documents nobody wrote by hand:
 *
 *   **What she typed is what she reads back.** Text goes through the editor's
 *   model, out to MDX, and back; it has to return unchanged.
 *
 *   **What she marked stays marked.** Markdown cannot end a mark just anywhere,
 *   so an edge may move off whitespace or punctuation, and italic may take in
 *   the rest of a word - but no letter loses a mark, and the site shows the
 *   marks the editor reads back.
 *
 *   **A save settles.** Writing the same document twice produces the same
 *   bytes as writing it once, so nothing accumulates across saves.
 *
 * The generator is seeded, so a failure names a seed that reproduces it
 * exactly rather than a case that vanishes on the next run.
 */
import { describe, expect, it } from 'vitest';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdxjs } from 'micromark-extension-mdxjs';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
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

/** Each character and its marks: `b` bold, `e` asterisk emphasis, `i` underscore italic. */
type Marked = Array<[string, string]>;

const withMark = (marks: string, mark: string): string =>
  [...new Set(marks + mark)].sort().join('');

function markedOf(nodes: Inline[], marks = ''): Marked {
  return nodes.flatMap((n): Marked => {
    if (n.type === 'text') return Array.from(n.value, (ch): [string, string] => [ch, marks]);
    if (n.type === 'strong') return markedOf(n.children, withMark(marks, 'b'));
    if (n.type === 'emphasis') return markedOf(n.children, withMark(marks, n.marker === '_' ? 'i' : 'e'));
    return [[`«${n.type}»`, marks]];
  });
}

/**
 * Marks over typed text, in the shape the editor hands them on: each run of
 * characters sharing marks, wrapped in all of them. The edges fall anywhere a
 * selection can - on a space, inside a word, beside punctuation - and a
 * double-click takes the space after a word, so often one does.
 */
function marked(rng: () => number, value: string): Inline[] {
  const chars = Array.from(value);
  const marks = chars.map(() => '');
  for (let s = Math.floor(rng() * 4); s > 0; s -= 1) {
    const mark = pick(rng, ['b', 'e', 'i']);
    const from = Math.floor(rng() * chars.length);
    let to = from + 1 + Math.floor(rng() * (chars.length - from));
    if (to < chars.length && /\s/.test(chars[to]) && rng() < 0.5) to += 1;
    for (let k = from; k < to; k += 1) marks[k] = withMark(marks[k], mark);
  }
  const inline: Inline[] = [];
  for (let k = 0; k < chars.length; ) {
    let end = k;
    while (end < chars.length && marks[end] === marks[k]) end += 1;
    let node: Inline = { type: 'text', value: chars.slice(k, end).join('') };
    for (const m of ['e', 'i', 'b'].filter((m) => marks[k].includes(m))) {
      node = m === 'b'
        ? { type: 'strong', children: [node] }
        : { type: 'emphasis', marker: m === 'i' ? '_' : '*', children: [node] };
    }
    inline.push(node);
    k = end;
  }
  return inline;
}

const typedAs = (rng: () => number, value: string): Inline[] =>
  rng() < 0.6 ? marked(rng, value) : [{ type: 'text', value }];

/** Never an opaque block: those are the file's own bytes, not hers to type. */
function block(rng: () => number): Exclude<Block, { kind: 'opaque' }> {
  const roll = rng();
  if (roll < 0.55) return { kind: 'paragraph', source: '', inline: typedAs(rng, paragraphText(rng)) };
  if (roll < 0.75) {
    return { kind: 'heading', depth: rng() < 0.5 ? 2 : 3, source: '', inline: typedAs(rng, line(rng)) };
  }
  return {
    kind: 'list',
    ordered: rng() < 0.5,
    source: '',
    items: Array.from({ length: 1 + Math.floor(rng() * 3) }, () => typedAs(rng, line(rng))),
  };
}

/** Every run of text she typed, block by block and item by item. */
const runsOf = (doc: MdxDoc): Inline[][] =>
  doc.segments.flatMap((s) => {
    if (s.type !== 'block') return [];
    if (s.block.kind === 'paragraph' || s.block.kind === 'heading') return [s.block.inline];
    if (s.block.kind === 'list') return s.block.items;
    return [[{ type: 'opaque' as const, source: s.block.source }]];
  });

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
  }
  segments.push({ type: 'gap', text: '\n' });
  const doc = { frontmatter: '---\ntitle: "בדיקה"\n---\n', segments };
  for (const run of runsOf(doc)) typed.push(markedOf(run).map(([ch]) => ch).join(''));
  return { doc, typed };
}

/** What the editor reads back out of a file, block by block. */
const readBack = (mdx: string): string[] =>
  runsOf(parseMdx(mdx)).map((run) => markedOf(run).map(([ch]) => ch).join(''));

/** What the site's own parser marks, in order - whitespace left out, since it keeps less of it. */
function siteMarks(mdx: string): Marked {
  const body = mdx.slice(parseMdx(mdx).frontmatter.length);
  const out: Marked = [];
  const walk = (node: any, marks: string): void => {
    if (node.type === 'text') for (const ch of node.value) out.push([ch, marks]);
    const own = node.type === 'strong' ? 'b'
      : node.type === 'emphasis' ? (body[node.position.start.offset] === '_' ? 'i' : 'e')
      : '';
    for (const child of node.children ?? []) walk(child, withMark(marks, own));
  };
  walk(fromMarkdown(body, { extensions: [mdxjs(), gfm()], mdastExtensions: [mdxFromMarkdown(), gfmFromMarkdown()] }), '');
  return out.filter(([ch]) => /\S/.test(ch));
}

const isLetter = (ch: string): boolean => !/[\s\p{P}\p{S}]/u.test(ch);

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

  it('keeps every letter she marked marked, and marks nothing else', () => {
    for (const seed of seeds) {
      const { doc } = document(random(seed));
      const typed = runsOf(doc).map((run) => markedOf(run));
      const read = runsOf(parseMdx(write(doc))).map((run) => markedOf(run));
      expect(read.map((run) => run.length), `seed ${seed}`).toEqual(typed.map((run) => run.length));
      typed.forEach((run, r) =>
        run.forEach(([ch, marks], k) => {
          const got = read[r][k][1];
          const lost = [...marks].filter((m) => !got.includes(m));
          const gained = [...got].filter((m) => !marks.includes(m));
          const where = `seed ${seed}, run ${r}, ${JSON.stringify(ch)} at ${k}`;
          if (isLetter(ch)) {
            expect(lost, where).toEqual([]);
            expect(gained.filter((m) => m !== 'i'), where).toEqual([]);
          } else {
            expect(gained, where).toEqual([]);
          }
        }),
      );
    }
  });

  it('shows on the site the marks the editor reads back', () => {
    // Lone asterisks are her divider, which the site draws as bullets.
    const divider = (run: Marked): boolean =>
      run.every(([, marks]) => !marks) && /^\*[ \t]*(?:\n(?:\*[ \t]*|[ \t]*))*$/.test(run.map(([ch]) => ch).join(''));
    for (const seed of seeds) {
      const mdx = write(document(random(seed)).doc);
      const editor = runsOf(parseMdx(mdx))
        .map((run) => markedOf(run))
        .filter((run) => !divider(run))
        .flat()
        .filter(([ch]) => /\S/.test(ch));
      expect(siteMarks(mdx), `seed ${seed}`).toEqual(editor);
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

    // Nor one whose marks never needed to move.
    let spaceAtEdge = 0;
    let moved = 0;
    let grown = 0;
    for (const seed of seeds) {
      const { doc } = document(random(seed));
      const typed = runsOf(doc).flatMap((run) => markedOf(run));
      const read = runsOf(parseMdx(write(doc))).flatMap((run) => markedOf(run));
      const edge = typed.some(([ch, marks], k) =>
        /\s/.test(ch) && [...marks].some((m) => !typed[k - 1]?.[1].includes(m) || !typed[k + 1]?.[1].includes(m)));
      if (edge) spaceAtEdge += 1;
      if (typed.some(([ch, marks], k) => !isLetter(ch) && read[k][1] !== marks)) moved += 1;
      if (typed.some(([ch, marks], k) => isLetter(ch) && read[k][1] !== marks)) grown += 1;
    }
    expect(spaceAtEdge).toBeGreaterThan(CASES / 10);
    expect(moved).toBeGreaterThan(CASES / 10);
    expect(grown).toBeGreaterThan(CASES / 20);
  });
});
