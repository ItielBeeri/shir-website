/**
 * The frame's controls offer exactly what the site's component renders, in
 * the colours the site paints them - and every combination the controls can
 * make reads back as itself.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdxjs } from 'micromark-extension-mdxjs';
import { ALIGNS, TONES, WIDTHS, frameProps, parseFrameAttributes, renderFrameOpen } from './frame';
import type { FrameProps } from './frame';

const ROOT = join(__dirname, '../../..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

const attributesOf = (open: string): any[] => {
  const tree = fromMarkdown(`${open}\n\nא\n\n</FramedSection>\n`, {
    extensions: [mdxjs()],
    mdastExtensions: [mdxFromMarkdown()],
  });
  return (tree.children[0] as any).attributes;
};

const every: FrameProps[] = TONES.flatMap((t) =>
  WIDTHS.flatMap((w) => ALIGNS.map((a) => frameProps({ tone: t.value, width: w.value, align: a.value }))),
);

describe('frame props', () => {
  it('read back as themselves, every combination the controls make', () => {
    expect(every).toHaveLength(TONES.length * WIDTHS.length * ALIGNS.length);
    for (const props of every) {
      expect(parseFrameAttributes(attributesOf(renderFrameOpen(props))), renderFrameOpen(props)).toEqual(props);
    }
  });

  it('write the defaults as nothing at all', () => {
    expect(renderFrameOpen({})).toBe('<FramedSection>');
    expect(renderFrameOpen({ align: 'center', tone: 'rose' })).toBe('<FramedSection tone="rose" align="center">');
  });

  it.each([
    ['an attribute it has no control for', '<FramedSection id="x">'],
    ['a value it does not offer', '<FramedSection tone="black">'],
    ['an empty value', '<FramedSection tone="">'],
    ['an expression', '<FramedSection tone={"rose"}>'],
    ['a bare attribute', '<FramedSection width>'],
    ['a spread', '<FramedSection {...x}>'],
  ])('refuse %s, so the frame stays as it was written', (_label, open) => {
    expect(parseFrameAttributes(attributesOf(open))).toBeNull();
  });

  it('drop from the editor whatever no control offers', () => {
    expect(frameProps({ tone: 'black', width: null, align: 'center', gap: '\n\n' })).toEqual({ align: 'center' });
  });
});

describe('parity with the site', () => {
  const component = read('src/components/ui/FramedSection.astro');
  const declared = (prop: string): string[] => {
    const line = new RegExp(`^\\s*${prop}\\?:\\s*([^;]+);`, 'm').exec(component)?.[1] ?? '';
    return [...line.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  };

  it.each([
    ['tone', TONES],
    ['width', WIDTHS],
    ['align', ALIGNS],
  ] as const)('offers exactly the %s values FramedSection.astro renders', (prop, options) => {
    const offered = options.flatMap((o) => o.value ?? []);
    expect(declared(prop).length, `${prop} is no longer declared as a union in FramedSection.astro`).toBeGreaterThan(0);
    expect([...offered].sort()).toEqual(declared(prop).sort());
  });

  it('paints each swatch in the colour of the token the site paints that tone in', () => {
    const css = read('public/global.css');
    for (const tone of TONES.filter((t) => t.swatch)) {
      expect(component, tone.value).toContain(`[data-tone='${tone.value}']`);
      const token = new RegExp(`--color-${tone.value}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1];
      expect(tone.swatch, tone.value).toBe(token?.toLowerCase());
    }
  });

  it('labels every control in Hebrew', () => {
    for (const { label } of [...TONES, ...WIDTHS, ...ALIGNS]) expect(label).toMatch(/^[֐-׿][֐-׿\s,()]*$/);
  });
});
