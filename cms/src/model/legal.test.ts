/**
 * X-11 and X-13, against the live legal documents.
 *
 * The point of these is that they are not a UI state: each one asks what
 * happens when the bytes arrive, which is the only question an attacker - or
 * an owner with a second browser tab - gets to ask.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bannerProblems, isLegalFile, legalProblems } from './legal';
import { parse as parseToml } from 'smol-toml';
import { setStringArray } from '../content/toml-edit';

const CONTENT = join(__dirname, '../../../src/content');
const read = (name: string): string => readFileSync(join(CONTENT, 'pages', name), 'utf8');

const ACCESSIBILITY = 'src/content/pages/accessibility.toml';
const CONSENT = 'src/content/pages/consent.toml';
const TERMS = 'src/content/pages/terms.toml';

describe('which files are governed', () => {
  it('names the three legal documents and nothing else', () => {
    expect(isLegalFile(ACCESSIBILITY)).toBe(true);
    expect(isLegalFile(TERMS)).toBe(true);
    expect(isLegalFile(CONSENT)).toBe(true);
    expect(isLegalFile('src/content/pages/home.toml')).toBe(false);
    expect(isLegalFile('src/content/blog/x.mdx')).toBe(false);
  });
});

describe('the live documents pass their own rules', () => {
  it.each([
    [ACCESSIBILITY, 'accessibility.toml'],
    [TERMS, 'terms.toml'],
    [CONSENT, 'consent.toml'],
  ])('%s saved unchanged is allowed', (path, name) => {
    const src = read(name);
    expect(legalProblems(path, src, src, 'owner')).toEqual([]);
    expect(legalProblems(path, src, src, 'maintainer')).toEqual([]);
  });
});

describe('locked sections (X-11)', () => {
  const src = read('accessibility.toml');
  /** Replace the first paragraph of the named section. */
  const editSection = (text: string, title: string, replacement: string): string => {
    const at = text.indexOf(`title = "${title}"`);
    expect(at, title).toBeGreaterThan(-1);
    const open = text.indexOf('[\n', at);
    const close = text.indexOf('\n]', open);
    return `${text.slice(0, open)}[\n  "${replacement}",${text.slice(close)}`;
  };

  it('refuses an owner rewriting a section that states what the site does', () => {
    const after = editSection(src, 'ההתאמות שבוצעו באתר', 'הכול נגיש לגמרי.');
    const problems = legalProblems(ACCESSIBILITY, src, after, 'owner');
    expect(problems.map((p) => p.kind)).toEqual(['locked']);
    expect(problems[0].reason).toContain('באתר בפועל');
  });

  it('lets the maintainer make the same edit', () => {
    const after = editSection(src, 'ההתאמות שבוצעו באתר', 'הכול נגיש לגמרי.');
    expect(legalProblems(ACCESSIBILITY, src, after, 'maintainer')).toEqual([]);
  });

  it('lets the owner edit an unlocked section freely', () => {
    const after = editSection(src, 'המחויבות שלי', 'נוסח חדש לגמרי, וזה בסדר גמור.');
    expect(legalProblems(ACCESSIBILITY, src, after, 'owner')).toEqual([]);
  });

  it('counts deleting a locked section as changing it', () => {
    const doc = parseToml(src) as { sections: Array<{ title: string }> };
    const locked = doc.sections.find((s) => /ההתאמות שבוצעו/.test(s.title))!;
    const at = src.indexOf(`title = "${locked.title}"`);
    const after = src.slice(0, src.lastIndexOf('[[sections]]', at));
    expect(legalProblems(ACCESSIBILITY, src, after, 'owner').map((p) => p.kind)).toContain('locked');
  });

  it('applies to the terms document too', () => {
    const terms = read('terms.toml');
    const doc = parseToml(terms) as {
      parts?: Array<{ sections?: Array<{ title: string; body?: string[] }> }>;
      sections?: Array<{ title: string; body?: string[] }>;
    };
    // Wherever the measurement section lives, it is the one the banner has to
    // agree with, and it is locked.
    let path: Array<string | number> | null = null;
    doc.sections?.forEach((s, i) => {
      if (/מדידה וסטטיסטיקה/.test(s.title) && s.body) path = ['sections', i, 'body'];
    });
    doc.parts?.forEach((part, i) =>
      part.sections?.forEach((s, j) => {
        if (/מדידה וסטטיסטיקה/.test(s.title) && s.body) path = ['parts', i, 'sections', j, 'body'];
      }),
    );
    expect(path, 'no measurement section in terms.toml').not.toBeNull();

    const after = setStringArray(terms, path!, ['לא אוספים כלום.']);
    expect(after).not.toBe(terms);
    expect(legalProblems(TERMS, terms, after, 'owner').map((p) => p.kind)).toEqual(['locked']);
    expect(legalProblems(TERMS, terms, after, 'maintainer')).toEqual([]);
  });
});

describe('the consent banner (X-13)', () => {
  const src = read('consent.toml');
  const banner = (over: Record<string, string>): Record<string, unknown> => ({
    ...((parseToml(src) as { banner: Record<string, unknown> }).banner),
    ...over,
  });

  it('accepts the banner as it stands', () => {
    expect(bannerProblems(banner({}))).toEqual([]);
  });

  it('refuses a recommended acceptance', () => {
    const out = bannerProblems(banner({ accept: 'כן, אני מסכימה בשמחה! (מומלץ)', decline: 'לא' }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((p) => p.kind === 'invalid')).toBe(true);
    expect(out.map((p) => p.reason).join(' ')).toContain('אינה תקפה');
  });

  it('refuses a refusal much shorter than the acceptance', () => {
    const out = bannerProblems(banner({ accept: 'אני מסכימה לשמירת עוגיות', decline: 'לא' }));
    expect(out.map((p) => p.reason).join(' ')).toContain('דומים באורך');
  });

  it('allows two labels of comparable weight', () => {
    expect(bannerProblems(banner({ accept: 'מאשרת', decline: 'מסרבת' }))).toEqual([]);
  });

  it('refuses an empty button', () => {
    expect(bannerProblems(banner({ decline: '   ' })).length).toBeGreaterThan(0);
  });

  it('refuses a body that drops the required disclosures', () => {
    const out = bannerProblems(banner({ body: 'עוגיות.' }));
    const reasons = out.map((p) => p.reason).join(' ');
    expect(reasons).toContain('מחוץ לישראל');
    expect(reasons).toContain('מי שמקבל את המידע');
  });

  it('holds for the maintainer as well - this is not a permission', () => {
    const after = src
      .replace(/accept {2}= "[^"]*"/, 'accept  = "כן, אני מסכימה בשמחה"')
      .replace(/decline = "[^"]*"/, 'decline = "לא"');
    expect(after).not.toBe(src);
    for (const role of ['maintainer', 'owner'] as const) {
      const problems = legalProblems(CONSENT, src, after, role);
      expect(problems.some((p) => p.kind === 'invalid'), role).toBe(true);
    }
  });

  it('still locks the wording of the two buttons against the owner', () => {
    const after = src.replace(/accept  = "[^"]*"/, 'accept  = "מאשרת"');
    const problems = legalProblems(CONSENT, src, after, 'owner');
    expect(problems.map((p) => p.kind)).toContain('locked');
    // Balanced wording, so the only objection is the lock.
    expect(problems.filter((p) => p.kind === 'invalid')).toEqual([]);
  });

  it('reports unreadable TOML rather than letting it through', () => {
    expect(legalProblems(CONSENT, src, '[banner\nbroken', 'maintainer')).toEqual([
      { kind: 'invalid', reason: 'לא הצלחתי לקרוא את הקובץ הזה.' },
    ]);
  });
});
