/**
 * Links through every layer the editor has: the file, the model, the
 * ProseMirror document the schema will actually accept, and back.
 *
 * fuzz.test.ts generates links by the hundred; these are the cases worth
 * naming, each one a way the markdown could quietly disagree with the editor.
 */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdxjs } from 'micromark-extension-mdxjs';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { allBlocks, blockToMarkdown, parseMdx, serializeMdx } from './mdx-edit';
import type { Inline } from './mdx-edit';
import { docToPm, pmToDoc } from './pm-convert';
import type { PmNode } from './pm-convert';
import { extensions } from '../editor/extensions';

const FM = '---\ntitle: "x"\n---\n';
const schema = getSchema(extensions);

/** Through the schema, as the editor loads a file and hands it back on save. */
const throughEditor = (src: string): string => {
  const doc = parseMdx(src);
  const json = schema.nodeFromJSON(docToPm(doc)).toJSON() as PmNode;
  const back = pmToDoc(json, doc.frontmatter);
  return serializeMdx(back, allBlocks(back));
};

const paragraph = (inline: Inline[]): string => blockToMarkdown({ kind: 'paragraph', source: '', inline });

const link = (href: string, children: Inline[], title: string | null = null): Inline => ({
  type: 'link',
  href,
  title,
  children,
});
const text = (value: string): Inline => ({ type: 'text', value });

/** What the site's parser makes of a paragraph: its links and what is bold. */
function site(md: string): { links: Array<[string, string]>; bold: string } {
  const tree = fromMarkdown(md, { extensions: [mdxjs(), gfm()], mdastExtensions: [mdxFromMarkdown(), gfmFromMarkdown()] });
  const links: Array<[string, string]> = [];
  let bold = '';
  const textOf = (node: any): string => (node.type === 'text' ? node.value : (node.children ?? []).map(textOf).join(''));
  const walk = (node: any, strong: boolean): void => {
    if (node.type === 'link') links.push([node.url, textOf(node)]);
    if (node.type === 'text' && strong) bold += node.value;
    for (const child of node.children ?? []) walk(child, strong || node.type === 'strong');
  };
  walk(tree, false);
  return { links, bold };
}

describe('a link in the body', () => {
  it('survives the editor byte for byte', () => {
    for (const body of [
      'ראו [את העמוד](/about) לפרטים.',
      'כתבו [לי](mailto:shir@example.com) או [התקשרו](tel:+972501234567).',
      '[קישור *עם הדגשה*](https://example.com/a_b) בתחילת פסקה',
      '[**מודגש כולו**](https://example.com) ו[_נטוי_](/p)',
      '[שורה\nושורה](https://example.com)',
      '[עם כותרת](https://example.com "הסבר קצר")',
    ]) {
      const src = `${FM}\n${body}\n`;
      expect(throughEditor(src), body).toBe(src);
    }
  });

  it('moves a mark that covers only the link inside it, which reads the same', () => {
    const src = `${FM}\n**[מודגש](/p)** ואז\n`;
    const out = throughEditor(src);
    expect(out).toBe(`${FM}\n[**מודגש**](/p) ואז\n`);
    expect(site(out.slice(FM.length))).toEqual(site(src.slice(FM.length)));
  });

  it('keeps its title through the schema', () => {
    const src = `${FM}\n[א](https://example.com "הסבר")\n`;
    const pm = schema.nodeFromJSON(docToPm(parseMdx(src))).toJSON() as PmNode;
    const mark = pm.content?.[0].content?.[0].marks?.find((m) => m.type === 'link');
    expect(mark?.attrs).toMatchObject({ href: 'https://example.com', title: 'הסבר' });
  });

  it('is one link however many marks run through it', () => {
    const md = paragraph([
      link('https://example.com', [text('אחת '), { type: 'strong', children: [text('שתיים')] }, text(' שלוש')]),
    ]);
    expect(md).toBe('[אחת **שתיים** שלוש](https://example.com)');
    expect(site(md).links).toEqual([['https://example.com', 'אחת שתיים שלוש']]);
  });

  it('keeps a mark that ends at its edge inside the brackets, where markdown can end it', () => {
    // `**[א](u)**ב` is not bold at all: the closing run sits between `)` and a letter.
    const md = paragraph([{ type: 'strong', children: [link('/p', [text('א')])] }, text('ב')]);
    expect(site(md).bold).toBe('א');
    expect(site(md).links).toEqual([['/p', 'א']]);
  });

  it('wraps the whole link in a mark its neighbours share', () => {
    const md = paragraph([{ type: 'strong', children: [text('לפני '), link('/p', [text('באמצע')]), text(' אחרי')] }]);
    expect(md).toBe('**לפני [באמצע](/p) אחרי**');
  });

  it.each([
    ['a space', 'https://example.com/a b', '<https://example.com/a b>'],
    ['parentheses', 'https://example.com/(x)', 'https://example.com/\\(x\\)'],
    ['a backslash', 'a\\b', 'a\\\\b'],
    ['angle brackets', 'https://example.com/<x>', '<https://example.com/\\<x\\>>'],
    ['nothing at all', '', '<>'],
    ['Hebrew', '/בלוג/פוסט', '/בלוג/פוסט'],
  ])('carries an address with %s', (_name, href, written) => {
    const md = paragraph([link(href, [text('כאן')])]);
    expect(md).toBe(`[כאן](${written})`);
    expect(site(md).links).toEqual([[href, 'כאן']]);
  });

  it('escapes what its text would otherwise say to the parser', () => {
    const md = paragraph([link('/p', [text('[סוגריים] ו-*כוכבית* ו-{סוגר}')])]);
    expect(site(md).links).toEqual([['/p', '[סוגריים] ו-*כוכבית* ו-{סוגר}']]);
  });

  it('does not turn into an image after an exclamation mark', () => {
    const md = paragraph([text('וואו!'), link('/p', [text('תמונה?')])]);
    expect(md).toBe('וואו\\![תמונה?](/p)');
    expect(site(md).links).toEqual([['/p', 'תמונה?']]);
  });

  it('is written from text the editor split by marks as one link, not several', () => {
    const mark = { type: 'link', attrs: { href: '/p', title: null } };
    const pm: PmNode = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'רגיל ', marks: [mark] },
            { type: 'text', text: 'מודגש', marks: [{ type: 'bold' }, mark] },
          ],
        },
      ],
    };
    const doc = pmToDoc(pm, FM);
    expect(serializeMdx(doc, allBlocks(doc))).toBe(`${FM}[רגיל **מודגש**](/p)\n`);
  });

  it('keeps a marker the editor does not model inside the link it sat in', () => {
    const src = `${FM}\n[לפני {/* PLACEHOLDER: X */} אחרי](/p)\n`;
    expect(throughEditor(src)).toBe(src);
  });
});

describe('the schema', () => {
  it('has links, and no underline to lose on save', () => {
    expect(schema.marks.link).toBeTruthy();
    expect(schema.marks.underline).toBeUndefined();
  });

  it('does not stretch a link over the words typed after it', () => {
    expect(schema.marks.link.spec.inclusive).toBe(false);
  });
});
