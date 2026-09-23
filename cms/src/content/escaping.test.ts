/**
 * Escaping has to be its own inverse across a save.
 *
 * A text node carries the source slice, escapes and all, because the trailing
 * spaces CommonMark drops from a line end have to survive. An escaper that
 * then ran over its own output added a backslash on every save - `\#` became
 * `\\#` became `\\\\#` - and the owner watched her words grow slashes. These
 * are the gates that say it settles after the first save and stays settled.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import {
  allBlocks,
  blockToMarkdown,
  escapeInlineText,
  parseMdx,
  serializeMdx,
  unescapeInlineText,
} from './mdx-edit';

const CONTENT = join(__dirname, '../../../src/content');
const files = [
  join(CONTENT, 'about/about.mdx'),
  ...readdirSync(join(CONTENT, 'therapies')).map((f) => join(CONTENT, 'therapies', f)),
  ...readdirSync(join(CONTENT, 'blog')).map((f) => join(CONTENT, 'blog', f)),
];

/** One save: read the file and write every block back. */
const rewrite = (src: string): string => {
  const doc = parseMdx(src);
  return serializeMdx(doc, allBlocks(doc));
};

/** The paragraph a save would write for text typed into the editor. */
const typedAs = (value: string): string =>
  blockToMarkdown({ kind: 'paragraph', source: '', inline: [{ type: 'text', value }] });

/** What the editor reads back out of a document. */
const readBack = (mdx: string): string => {
  const doc = parseMdx(mdx);
  return doc.segments
    .flatMap((s) => (s.type === 'block' && s.block.kind === 'paragraph' ? s.block.inline : []))
    .map((n) => ('value' in n ? n.value : ''))
    .join('');
};

describe('escape and unescape are inverses', () => {
  const samples = [
    'טקסט רגיל',
    '# סולמית בתחילת שורה',
    '[סוגריים](כתובת)',
    'נתיב C:\\temp\\x',
    'כוכבית*באמצע',
    'גרש הפוך \\ לבד',
    'קוד `כאן`',
    'ביטוי {expr} וגם <tag>',
    'ישות &amp; באמצע',
    '*',
  ];

  it.each(samples)('%s survives a round trip through the escaper', (value) => {
    expect(unescapeInlineText(escapeInlineText(value))).toBe(value);
  });

  it('is stable when applied to its own output', (): void => {
    for (const value of samples) {
      const once = escapeInlineText(value);
      expect(escapeInlineText(unescapeInlineText(once))).toBe(once);
    }
  });

  /** A mark's own delimiter beside the text is a non-space, and would join the run. */
  it('escapes a mark character a delimiter touches, and still inverts', () => {
    expect(escapeInlineText('*')).toBe('*');
    expect(escapeInlineText('*', { before: true })).toBe('\\*');
    expect(escapeInlineText('מילה _', { after: true })).toBe('מילה \\_');
    for (const value of ['*', '_ מילה', 'מילה ~', '* * *']) {
      expect(unescapeInlineText(escapeInlineText(value, { before: true, after: true }))).toBe(value);
    }
  });
});

describe('a second save changes nothing the first save did not', () => {
  it.each(files.map((f) => [f.split(/[\\/]/).pop() as string, f]))('%s', (_name, file) => {
    const once = rewrite(readFileSync(file, 'utf8'));
    expect(rewrite(once)).toBe(once);
  });

  it('settles after the first save for text that needed escaping', () => {
    const hostile = [
      '# ניסיון כותרת',
      '[קישור](url)',
      'נתיב C:\\temp',
      '1. פריט',
      'קוד `כאן`',
      '<tag> וגם {expr}',
    ].join('\n\n');
    const first = `---\nt: 1\n---\n\n${typedAs(hostile)}\n`;
    expect(rewrite(first)).toBe(first);
    expect(rewrite(rewrite(first))).toBe(first);
  });

  it('reads back exactly what was typed, not what was written', () => {
    const typed = 'נתיב C:\\temp וגם # סולמית וגם [סוגריים]';
    expect(readBack(`---\nt: 1\n---\n\n${typedAs(typed)}\n`)).toBe(typed);
  });

  it('does not grow a backslash on a file that already carries escapes', () => {
    const src = `---\nt: 1\n---\n\n\\# לא כותרת\n\n\\[לא קישור\\](כתובת)\n`;
    expect(rewrite(src)).toBe(src);
    expect(rewrite(rewrite(src))).toBe(src);
    expect(readBack(src)).toContain('# לא כותרת');
  });
});

/**
 * R2-3, settled by experiment rather than by argument.
 *
 * The site's markdown is GFM, which turns a bare address into a link with no
 * control involved. Escaping cannot stop it: GFM resolves character escapes
 * before it scans for addresses, so `https:\/\/`, `www\.` and `https\://` all
 * still autolink. These tests exist so the next person does not spend a round
 * discovering that - the only lever left is the site's own `markdown.gfm`.
 */
describe('a bare address', () => {
  const parse = (body: string) =>
    fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });

  const linksIn = (node: any, out: string[] = []): string[] => {
    if (node.type === 'link') out.push(node.url);
    (node.children ?? []).forEach((c: any) => linksIn(c, out));
    return out;
  };

  it('becomes a link even after the escaper has run over it', () => {
    const written = typedAs('ראו https://example.com כאן');
    expect(linksIn(parse(written))).toEqual(['https://example.com']);
  });

  it('resists every escape that would work on anything else', () => {
    for (const attempt of [
      'https:\\/\\/example.com',
      'https\\://example.com',
      'www\\.example.com',
    ]) {
      expect(attempt.includes('\\'), 'the attempt must actually contain an escape').toBe(true);
      expect(linksIn(parse(attempt)).length, attempt).toBe(1);
    }
  });

  it('still reads back as the address she typed', () => {
    const typed = 'ראו https://example.com כאן';
    expect(readBack(`---\nt: 1\n---\n\n${typedAs(typed)}\n`)).toBe(typed);
  });
});

/**
 * The one thing a save changes: an indent at the head of a block.
 *
 * Markdown has no way to carry it - the parser strips up to three spaces and
 * reads the fourth as a code block, and after a list marker the space is the
 * marker's own padding. Left in, the file changes again on the next save for an
 * edit nobody made, so it goes once, on the way out.
 */
describe('an indent markdown cannot carry', () => {
  const item = (value: string): string =>
    blockToMarkdown({
      kind: 'list',
      ordered: false,
      source: '',
      items: [[{ type: 'text', value }]],
    });

  it('goes from the head of a paragraph', () => {
    expect(typedAs('   מרווח')).toBe('מרווח');
  });

  it('goes from a list item, where the space belongs to the marker', () => {
    expect(item('\t מרווח')).toBe('- מרווח');
  });

  it('stays everywhere the file can hold it', () => {
    expect(typedAs('שורה\n   מוזחת')).toBe('שורה\n   מוזחת');
    expect(typedAs('מילה   ועוד')).toBe('מילה   ועוד');
  });

  it('leaves nothing for a second save to change', () => {
    const first = `---\nt: 1\n---\n\n${typedAs('   מרווח')}\n`;
    expect(rewrite(first)).toBe(first);
  });
});

/** The GFM constructs that *can* be escaped, and now are. */
describe('the wider GFM vocabulary', () => {
  const parse = (body: string) =>
    fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] });

  const kindsIn = (node: any, out: string[] = []): string[] => {
    if (node.type !== 'root' && node.type !== 'paragraph' && node.type !== 'text') {
      out.push(node.type);
    }
    (node.children ?? []).forEach((c: any) => kindsIn(c, out));
    return out;
  };

  it.each([
    ['strikethrough', 'טקסט ~~מחוק~~ כאן'],
    ['a table', 'עמודה | עמודה'],
    ['a task list', '- [ ] משימה'],
  ])('keeps %s as text', (_name, typed) => {
    expect(kindsIn(parse(typedAs(typed)))).toEqual([]);
    expect(readBack(`---\nt: 1\n---\n\n${typedAs(typed)}\n`)).toBe(typed);
  });
});
