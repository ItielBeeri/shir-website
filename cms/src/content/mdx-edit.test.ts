/**
 * The second Phase 0 gate: every MDX file in the site must survive a parse and
 * a full re-serialization of every editable block, byte for byte. Run against
 * the live files, not fixtures.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { blockToMarkdown, editableBlocks, parseMdx, serializeMdx } from './mdx-edit';

const CONTENT = join(__dirname, '../../../src/content');

const mdxFiles = (): string[] => [
  join(CONTENT, 'about/about.mdx'),
  ...readdirSync(join(CONTENT, 'therapies')).map((f) => join(CONTENT, 'therapies', f)),
  ...readdirSync(join(CONTENT, 'blog')).map((f) => join(CONTENT, 'blog', f)),
];

const files = mdxFiles();

describe('mdx-edit', () => {
  it('finds every mdx file', () => {
    expect(files.length).toBe(8);
  });

  describe.each(files.map((f) => [f.split(/[\\/]/).pop() as string, f]))('%s', (_name, file) => {
    const src = readFileSync(file, 'utf8');
    const doc = parseMdx(src);

    it('segments the whole document with no gaps', () => {
      expect(serializeMdx(doc)).toBe(src);
    });

    it('keeps the frontmatter verbatim', () => {
      expect(src.startsWith(doc.frontmatter)).toBe(true);
      expect(doc.frontmatter).toMatch(/^---\r?\n[\s\S]*\r?\n---\r?\n$/);
    });

    it('re-serializes every editable block byte-identically', () => {
      const editable = editableBlocks(doc);
      expect(editable.length).toBeGreaterThan(0);
      for (const i of editable) {
        const seg = doc.segments[i];
        if (seg.type !== 'block') throw new Error('not a block');
        expect(blockToMarkdown(seg.block), `${_name} segment ${i}`).toBe(seg.block.source);
      }
    });

    it('re-serializes the whole document with every block marked changed', () => {
      expect(serializeMdx(doc, new Set(editableBlocks(doc)))).toBe(src);
    });

    it('offers no h1 and no links', () => {
      for (const seg of doc.segments) {
        if (seg.type !== 'block') continue;
        if (seg.block.kind === 'heading') expect(seg.block.depth).toBeGreaterThanOrEqual(2);
      }
      expect(src).not.toMatch(/\]\(https?:\/\//);
    });
  });

  it('distinguishes asterisk emphasis from underscore italic', () => {
    const doc = parseMdx(readFileSync(join(CONTENT, 'about/about.mdx'), 'utf8'));
    const markers = new Set<string>();
    for (const seg of doc.segments) {
      if (seg.type !== 'block' || !('inline' in seg.block)) continue;
      for (const n of seg.block.inline) if (n.type === 'emphasis') markers.add(n.marker);
    }
    expect(markers).toEqual(new Set(['*', '_']));
  });

  it('rewrites one paragraph and leaves the rest of the file alone', () => {
    const file = join(CONTENT, 'blog/מה-זה-צל.mdx');
    const src = readFileSync(file, 'utf8');
    const doc = parseMdx(src);
    const target = editableBlocks(doc).find((i) => {
      const seg = doc.segments[i];
      return seg.type === 'block' && seg.block.kind === 'paragraph';
    })!;
    const seg = doc.segments[target];
    if (seg.type !== 'block' || seg.block.kind !== 'paragraph') throw new Error('bad target');
    seg.block.inline = [{ type: 'text', value: 'פסקה חדשה לגמרי.' }];

    const out = serializeMdx(doc, new Set([target]));
    expect(out).toContain('פסקה חדשה לגמרי.');
    expect(out.startsWith(doc.frontmatter)).toBe(true);
    // Everything else is untouched: same block count, same opaque sources.
    const after = parseMdx(out);
    expect(after.segments.length).toBe(doc.segments.length);
    const opaque = (d: typeof doc) =>
      d.segments.filter((s) => s.type === 'block' && s.block.kind === 'opaque').length;
    expect(opaque(after)).toBe(opaque(doc));
  });
});
