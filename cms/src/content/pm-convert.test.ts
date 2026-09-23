/**
 * The editor may not change what it did not touch. Every live MDX file goes
 * through the ProseMirror document and back, and must come out byte-identical.
 *
 * This is the gate that makes a whole-document editor safe: without it, the
 * first save on any page would silently renormalise blank lines, trailing
 * spaces and mark nesting across the entire body.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { allBlocks, parseMdx, serializeMdx } from './mdx-edit';
import { docToPm, pmToDoc } from './pm-convert';
import type { PmNode } from './pm-convert';
import { extensions } from '../editor/extensions';

const CONTENT = join(__dirname, '../../../src/content');
const files = [
  join(CONTENT, 'about/about.mdx'),
  ...readdirSync(join(CONTENT, 'therapies')).map((f) => join(CONTENT, 'therapies', f)),
  ...readdirSync(join(CONTENT, 'blog')).map((f) => join(CONTENT, 'blog', f)),
];

const roundTrip = (src: string): string => {
  const doc = parseMdx(src);
  const back = pmToDoc(docToPm(doc), doc.frontmatter);
  return serializeMdx(back, allBlocks(back));
};

describe('ProseMirror conversion', () => {
  describe.each(files.map((f) => [f.split(/[\\/]/).pop() as string, f]))('%s', (name, file) => {
    const src = readFileSync(file, 'utf8');

    it('survives a full round trip byte-identically', () => {
      expect(roundTrip(src), name).toBe(src);
    });

    it('keeps every block, in order', () => {
      const before = parseMdx(src);
      const after = pmToDoc(docToPm(before), before.frontmatter);
      const kinds = (d: typeof before) =>
        d.segments.filter((s) => s.type === 'block').map((s) => (s as { block: { kind: string } }).block.kind);
      expect(kinds(after)).toEqual(kinds(before));
    });

    it('carries the gap before every block', () => {
      const pm = docToPm(parseMdx(src));
      for (const node of pm.content ?? []) {
        expect(typeof node.attrs?.gap, `${name} ${node.type}`).toBe('string');
      }
    });
  });

  it('models the three marks distinctly', () => {
    const pm = docToPm(parseMdx(readFileSync(join(CONTENT, 'about/about.mdx'), 'utf8')));
    const marks = new Set<string>();
    const walk = (nodes: typeof pm.content): void => {
      for (const node of nodes ?? []) {
        for (const m of node.marks ?? []) marks.add(m.type);
        walk(node.content);
      }
    };
    walk(pm.content);
    expect(marks.has('emphasis')).toBe(true);
    expect(marks.has('italic')).toBe(true);
  });

  it('turns a SoftImage into a node with editable props, not raw text', () => {
    const pm = docToPm(parseMdx(readFileSync(join(CONTENT, 'therapies/shiatsu.mdx'), 'utf8')));
    const image = (pm.content ?? []).find((n) => n.type === 'softImage');
    expect(image).toBeTruthy();
    expect(image?.attrs).toMatchObject({ id: expect.any(String), aspect: expect.any(String) });
  });

  it('keeps a placeholder comment as an untouchable block', () => {
    const pm = docToPm(parseMdx(readFileSync(join(CONTENT, 'therapies/voice.mdx'), 'utf8')));
    const raw = (pm.content ?? []).filter((n) => n.type === 'rawBlock');
    expect(raw.length).toBeGreaterThan(0);
    expect(String(raw[0].attrs?.source)).toContain('PLACEHOLDER');
  });

  it('newline inside a paragraph becomes a hard break and returns as a newline', () => {
    const src = '---\ntitle: "x"\n---\n\nשורה\nשנייה\n';
    expect(roundTrip(src)).toBe(src);
    const pm = docToPm(parseMdx(src));
    expect(pm.content?.[0].content?.some((n) => n.type === 'hardBreak')).toBe(true);
  });

  it('a block added by the editor gets a blank line before it', () => {
    const src = '---\ntitle: "x"\n---\n\nאחת\n';
    const doc = parseMdx(src);
    const pm = docToPm(doc);
    pm.content!.push({ type: 'paragraph', content: [{ type: 'text', text: 'שתיים' }] });
    const out = serializeMdx(pmToDoc(pm, doc.frontmatter), allBlocks(pmToDoc(pm, doc.frontmatter)));
    expect(out).toContain('אחת');
    expect(out).toContain('שתיים');
    expect(out).toContain('אחת\n\nשתיים');
  });
});

/**
 * Pressing Enter has to produce a paragraph, not a line break.
 *
 * ProseMirror copies a node's attributes when it splits one, so a paragraph
 * made with Enter arrives carrying the gap of the paragraph it came from. If
 * that is a single newline the two ship as one block, and the editor's own
 * help text - Enter starts a new paragraph - is false.
 */
describe('separation between blocks', () => {
  const emit = (pm: PmNode, frontmatter: string): string => {
    const doc = pmToDoc(pm, frontmatter);
    return serializeMdx(doc, allBlocks(doc));
  };

  const blocksOf = (mdx: string): string[] =>
    parseMdx(mdx).segments.flatMap((s) => (s.type === 'block' ? [s.block.kind] : []));

  const para = (text: string, gap: string): PmNode => ({
    type: 'paragraph',
    attrs: { gap },
    content: [{ type: 'text', text }],
  });

  it('splitting a paragraph yields two paragraphs, not one with a break', () => {
    const fm = '---\ntitle: "x"\n---\n';
    // Both carry the gap of the paragraph that was split - what Enter gives.
    const pm: PmNode = { type: 'doc', content: [para('אחת', '\n'), para('שתיים', '\n')] };
    const out = emit(pm, fm);
    expect(blocksOf(out)).toEqual(['paragraph', 'paragraph']);
    expect(out).toContain('אחת\n\nשתיים');
  });

  it('four paragraphs stay four', () => {
    const fm = '---\ntitle: "x"\n---\n';
    const pm: PmNode = {
      type: 'doc',
      content: ['אחת', 'שתיים', 'שלוש', 'ארבע'].map((t) => para(t, '\n')),
    };
    expect(blocksOf(emit(pm, fm))).toEqual(['paragraph', 'paragraph', 'paragraph', 'paragraph']);
  });

  /**
   * Markdown has one list where the editor may hold two. Writing both left the
   * file saying something the next read disagreed with, so the second save
   * wrote different bytes than the first for an edit nobody made.
   */
  describe('two lists of the same kind', () => {
    const list = (ordered: boolean, items: string[], gap: string): PmNode => ({
      type: ordered ? 'orderedList' : 'bulletList',
      attrs: { gap },
      content: items.map((t) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
      })),
    });
    const fm = '---\ntitle: "x"\n---\n';

    it('become one list, and the file says the same thing twice', () => {
      const pm: PmNode = {
        type: 'doc',
        content: [list(true, ['אחת', 'שתיים'], '\n'), list(true, ['שלוש'], '\n\n')],
      };
      const once = emit(pm, fm);
      expect(blocksOf(once)).toEqual(['list']);
      expect(once).toContain('3. שלוש');
      const twice = serializeMdx(parseMdx(once), allBlocks(parseMdx(once)));
      expect(twice).toBe(once);
    });

    it('stay two when the kinds differ, which markdown can say', () => {
      const pm: PmNode = {
        type: 'doc',
        content: [list(false, ['אחת'], '\n'), list(true, ['שתיים'], '\n\n')],
      };
      expect(blocksOf(emit(pm, fm))).toEqual(['list', 'list']);
    });
  });

  it('a paragraph with no gap at all still separates', () => {
    const fm = '---\ntitle: "x"\n---\n';
    const pm: PmNode = { type: 'doc', content: [para('אחת', '\n'), para('שתיים', '')] };
    expect(blocksOf(emit(pm, fm))).toEqual(['paragraph', 'paragraph']);
  });

  it('keeps a single newline where the source legitimately had one', () => {
    const src = '---\ntitle: "x"\n---\n\n## כותרת\nפסקה\n';
    expect(roundTrip(src)).toBe(src);
  });

  it('the trailing empty paragraph StarterKit adds costs no newline', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      const doc = parseMdx(src);
      const pm = docToPm(doc);
      // What the editor hands back for a document not ending in a paragraph.
      pm.content!.push({ type: 'paragraph', content: [] });
      expect(emit(pm, doc.frontmatter), file).toBe(src);
    }
  });

  /**
   * `getJSON` returns only the attributes an extension declared, and one file
   * ends with no newline at all - so without the declaration the round trip
   * silently adds one. The guess is a fallback, not the mechanism.
   */
  it('declares trailing on the document, because the fallback is a guess', () => {
    const gap = extensions.find((e) => e.name === 'gap')!;
    const globals = (gap.config as { addGlobalAttributes: () => Array<{ types: string[]; attributes: object }> })
      .addGlobalAttributes.call(gap);
    const forDoc = globals.find((g) => g.types.includes('doc'));
    expect(Object.keys(forDoc?.attributes ?? {})).toContain('trailing');

    const ends = files.map((f) => readFileSync(f, 'utf8').match(/\n*$/)![0]);
    expect(new Set(ends).size, 'files do not all end the same way').toBeGreaterThan(1);
  });
});
