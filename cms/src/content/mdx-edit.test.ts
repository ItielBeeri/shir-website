/**
 * The second Phase 0 gate: every MDX file in the site must survive a parse and
 * a full re-serialization of every editable block, byte for byte. Run against
 * the live files, not fixtures.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { mdxFromMarkdown } from 'mdast-util-mdx';
import { mdxjs } from 'micromark-extension-mdxjs';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import {
  allBlocks,
  blockToMarkdown,
  editableBlocks,
  escapeInlineText,
  parseMdx,
  serializeMdx,
} from './mdx-edit';
import type { Block, Inline } from './mdx-edit';

const CONTENT = join(__dirname, '../../../src/content');

const mdxFiles = (): string[] => [
  join(CONTENT, 'about/about.mdx'),
  ...readdirSync(join(CONTENT, 'therapies')).map((f) => join(CONTENT, 'therapies', f)),
  ...readdirSync(join(CONTENT, 'blog')).map((f) => join(CONTENT, 'blog', f)),
];

const files = mdxFiles();

describe('mdx-edit', () => {
  // A count was a tripwire for a broken glob; it became a chore that failed
  // every time the site gained a page, which is not what it was watching for.
  it('finds every mdx file', () => {
    expect(files.length).toBeGreaterThan(5);
    expect(new Set(files).size).toBe(files.length);
    expect(files.some((f) => f.endsWith('about.mdx'))).toBe(true);
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

    // Link syntax in the source may be escaped text; only the parser can say
    // whether the page actually has a link on it.
    it('offers no h1 and no links', () => {
      for (const seg of doc.segments) {
        if (seg.type !== 'block') continue;
        if (seg.block.kind === 'heading') expect(seg.block.depth).toBeGreaterThanOrEqual(2);
      }
      const tree = fromMarkdown(src.slice(doc.frontmatter.length), {
        extensions: [mdxjs(), gfm()],
        mdastExtensions: [mdxFromMarkdown(), gfmFromMarkdown()],
      });
      const links: string[] = [];
      const walk = (node: any): void => {
        if (node.type === 'link' || node.type === 'linkReference') links.push(node.url ?? '');
        (node.children ?? []).forEach(walk);
      };
      walk(tree);
      expect(links, `${_name} has links`).toEqual([]);
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

/**
 * The escaping gate for C-1.
 *
 * Every case goes through the whole path the owner's keystrokes take - typed
 * text, serialized to MDX, then parsed again by the very parser the site
 * builds with. What comes back has to be the words she typed and nothing more:
 * no heading she did not ask for, no link she had no control to create.
 */
describe('body text the grammar would otherwise claim', () => {
  /**
   * Anything that is not running text is named, so a construct that survived
   * the escaping shows up in the comparison instead of hiding inside its own
   * label - a link would otherwise read as the words between its brackets.
   */
  const collect = (node: any): string => {
    if (node.type === 'text') return node.value;
    if (node.type === 'root' || node.type === 'paragraph') {
      return (node.children ?? []).map(collect).join('');
    }
    return `«${node.type}»`;
  };

  /** What the site's own parser makes of the bytes a save would write. */
  const shipped = (typed: string): { kinds: string[]; text: string } => {
    const block = {
      kind: 'paragraph' as const,
      source: '',
      inline: [{ type: 'text' as const, value: typed }],
    };
    const tree = fromMarkdown(`${blockToMarkdown(block)}\n`, {
      extensions: [mdxjs(), gfm()],
      mdastExtensions: [mdxFromMarkdown(), gfmFromMarkdown()],
    });
    return { kinds: (tree.children as any[]).map((n) => n.type), text: collect(tree) };
  };

  const cases: Array<[string, string]> = [
    ['a heading', '# ניסיון כותרת ראשית'],
    ['a second-level heading', '## ניסיון כותרת שנייה'],
    ['a link', '[קישור אסור](עמוד-אחר)'],
    ['an image', '![תמונה](a.png)'],
    ['a bullet', '- פריט ברשימה'],
    ['a plus bullet', '+ פריט ברשימה'],
    ['a numbered item', '1. פריט ממוספר'],
    ['a block quote', '> ציטוט'],
    ['a code span', 'קוד `כאן` בתוך שורה'],
    ['a tilde fence', '~~~'],
    ['raw html', 'טקסט <b>מודגש</b> ידנית'],
    ['an autolink', 'כתובת <example> בתוך טקסט'],
    ['an MDX expression', 'סוגריים {1 + 1} בתוך טקסט'],
    ['a JSX element', '<SoftImage id="x" />'],
    ['an entity', 'טקסט &amp; עוד'],
    ['a setext underline', 'שורה\n==='],
    ['a single-character setext underline', 'שורה\n='],
    ['a dash underline', 'שורה\n-'],
    ['a thematic break', '---'],
    ['a spaced thematic break', '* * *'],
    ['a break with a gap in it', '--- -'],
    ['an underscore break', '___'],
    ['a dash alone on the line', '-'],
    ['a number alone on the line', '1.'],
    ['strikethrough', 'טקסט ~~מחוק~~ כאן'],
    ['a table row', 'עמודה | עמודה'],
    ['a task list', '- [ ] משימה'],
  ];

  it.each(cases)('keeps %s as the words she typed', (_name, typed) => {
    const out = shipped(typed);
    expect(out.kinds).toEqual(['paragraph']);
    expect(out.text).toBe(typed);
  });

  it('escapes a line start anywhere in the paragraph, not only the first', () => {
    const out = shipped('שורה רגילה\n# לא כותרת\nעוד שורה');
    expect(out.kinds).toEqual(['paragraph']);
    expect(out.text).toBe('שורה רגילה\n# לא כותרת\nעוד שורה');
  });

  /**
   * A lone `*` is her divider, and the bullet markdown draws for it is the
   * mark she wants - so it ships bare, and reads back as what she typed.
   */
  describe('a paragraph of lone asterisks', () => {
    const readBack = (mdx: string): Block[] =>
      parseMdx(mdx).segments.flatMap((s) => (s.type === 'block' ? [s.block] : []));

    it.each([['one', '*'], ['several', '*\n*\n*'], ['a blank line between', '*\n\n*']])(
      'ships %s as the empty bullet the site draws',
      (_name, typed) => {
        expect(shipped(typed).kinds).toEqual(['list']);
        const [block] = readBack(blockToMarkdown({ kind: 'paragraph', source: '', inline: [{ type: 'text', value: typed }] }));
        expect(block).toMatchObject({ kind: 'paragraph', inline: [{ type: 'text', value: typed }] });
      },
    );

    it('is still escaped with anything else in the paragraph', () => {
      expect(shipped('*\nשורה').kinds).toEqual(['paragraph']);
      expect(shipped('*\nשורה').text).toBe('*\nשורה');
    });

    it('is not an empty bullet under another marker', () => {
      expect(readBack('-\n')[0].kind).toBe('opaque');
    });
  });

  it('leaves the lone asterisk this copy uses as a divider alone', () => {
    expect(escapeInlineText('*')).toBe('*');
    expect(escapeInlineText('*\n*')).toBe('*\n*');
  });

  // An empty list item cannot interrupt a paragraph, so past the first line the
  // divider is punctuation and escaping it would rewrite pages that use it.
  it('keeps a divider inside a paragraph exactly as the owner wrote it', () => {
    const block = {
      kind: 'paragraph' as const,
      source: '',
      inline: [{ type: 'text' as const, value: 'שורה\n*\nשורה' }],
    };
    expect(blockToMarkdown(block)).toBe('שורה\n*\nשורה');
    expect(shipped('שורה\n*\nשורה').kinds).toEqual(['paragraph']);
  });

  /**
   * A run of `#` at the end of an ATX heading is its closing sequence, not
   * content: `## ##` is an empty heading. And the heading is one line, so a
   * break inside it would end it and ship the rest as a paragraph.
   */
  describe('a heading', () => {
    const shippedHeading = (value: string): { kinds: string[]; text: string } => {
      const src = blockToMarkdown({
        kind: 'heading',
        depth: 2,
        source: '',
        inline: [{ type: 'text', value }],
      });
      const tree = fromMarkdown(`${src}\n`, {
        extensions: [mdxjs(), gfm()],
        mdastExtensions: [mdxFromMarkdown(), gfmFromMarkdown()],
      });
      const heads = (tree.children as any[]).filter((n) => n.type === 'heading');
      return {
        kinds: (tree.children as any[]).map((n) => n.type),
        text: heads.flatMap((n: any) => n.children).map(collect).join(''),
      };
    };

    it('that ends in hashes does not close itself', () => {
      expect(shippedHeading('##')).toEqual({ kinds: ['heading'], text: '##' });
      expect(shippedHeading('כותרת ##')).toEqual({ kinds: ['heading'], text: 'כותרת ##' });
    });

    it('holds a line break as the space it reads as, rather than ending', () => {
      expect(shippedHeading('כותרת\nארוכה')).toEqual({
        kinds: ['heading'],
        text: 'כותרת ארוכה',
      });
    });
  });

  /**
   * A delimiter beside whitespace, between punctuation and a letter, or an
   * underscore inside a word, is not a delimiter, and ships as itself.
   */
  describe('a mark where markdown cannot end one', () => {
    const written = (inline: Inline[]): string => blockToMarkdown({ kind: 'paragraph', source: '', inline });
    /** `<u>` is underscore italic, which the site styles apart from `<i>`. */
    const page = (md: string): string => {
      const read = (node: any): string => {
        const inner = (node.children ?? []).map(read).join('');
        if (node.type === 'text') return node.value;
        if (node.type === 'strong') return `<b>${inner}</b>`;
        if (node.type === 'emphasis') return md[node.position.start.offset] === '_' ? `<u>${inner}</u>` : `<i>${inner}</i>`;
        return inner;
      };
      return read(
        fromMarkdown(`${md}\n`, {
          extensions: [mdxjs(), gfm()],
          mdastExtensions: [mdxFromMarkdown(), gfmFromMarkdown()],
        }),
      );
    };
    const text = (value: string): Inline => ({ type: 'text', value });
    const bold = (...children: Inline[]): Inline => ({ type: 'strong', children });
    const em = (marker: '*' | '_', ...children: Inline[]): Inline => ({ type: 'emphasis', marker, children });

    const cases: Array<[string, Inline[], string]> = [
      ['a trailing space', [bold(text('מילה ')), text('אחרי')], '<b>מילה</b> אחרי'],
      ['a leading space', [text('לפני'), bold(text(' מילה'))], 'לפני <b>מילה</b>'],
      ['a line break', [bold(text('סוף.\n')), text('שורה')], '<b>סוף.</b>\nשורה'],
      ['underscore italic', [text('א '), em('_', text('מילה ')), text('ב')], 'א <u>מילה</u> ב'],
      ['a mark inside a mark', [bold(text('א '), em('*', text('ב ')))], '<b>א <i>ב</i></b>'],
      ['nothing but space', [text('א'), bold(text(' ')), text('ב')], 'א ב'],
      ['quotes inside a word', [text('א'), bold(text('"ב"')), text('ג')], 'א"<b>ב</b>"ג'],
      // Only the edge the parser refuses moves: the closing quote can stay bold.
      ['a quote after a prefix letter', [text('ו'), bold(text('"שקט"'))], 'ו"<b>שקט"</b>'],
      ['a full stop against the next word', [bold(text('סוף.')), text('הבא')], '<b>סוף</b>.הבא'],
      ['an escaped character at its edge', [text('ב'), bold(text('*א'))], 'ב*<b>א</b>'],
      ['a mark character marked alone', [bold(text('*')), text(' א')], '<b>*</b> א'],
      ['italic after a prefix letter', [text('ב'), em('_', text('גוף'))], '<u>בגוף</u>'],
      ['italic ending inside a word', [em('_', text('תנו')), text('עה שם')], '<u>תנועה</u> שם'],
      ['italic inside a bold word', [bold(text('א'), em('_', text('ב')), text('ג'))], '<b>א</b><u><b>ב</b></u><b>ג</b>'],
      // The editor hands over a tree wrapped run by run, which is this shape.
      ['emphasis running on past bold', [bold(em('*', text('א'))), em('*', text('ב'))], '<i><b>א</b>ב</i>'],
    ];

    it.each(cases)('keeps the mark with %s', (_name, inline, shown) => {
      expect(page(written(inline))).toBe(shown);
    });

    it.each(cases)('writes it once with %s, so a second save changes nothing', (_name, inline) => {
      const once = `---\nt: 1\n---\n\n${written(inline)}\n`;
      const doc = parseMdx(once);
      expect(serializeMdx(doc, allBlocks(doc))).toBe(once);
    });

    it('moves the space out rather than escaping the asterisks', () => {
      expect(written([bold(text('פחות. '))])).toBe('**פחות.** ');
    });
  });

  it('still escapes a mark character that touches a word', () => {
    expect(escapeInlineText('כוכבית*באמצע')).toBe('כוכבית\\*באמצע');
  });

  it('escapes a backslash so it does not eat the next character', () => {
    const out = shipped('נתיב C:\\temp\\x');
    expect(out.text).toBe('נתיב C:\\temp\\x');
  });

  it('does not touch a real link the owner already had in the file', () => {
    // A link in the source parses to an opaque inline and is emitted verbatim.
    const doc = parseMdx('---\nt: 1\n---\n\nראו [כאן](https://example.com).\n');
    expect(serializeMdx(doc, allBlocks(doc))).toContain('[כאן](https://example.com)');
  });
});
