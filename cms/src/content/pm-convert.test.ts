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
