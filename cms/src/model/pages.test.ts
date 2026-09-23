/**
 * R6-1: the preview may not send her to a page the build will not have.
 *
 * Both absent cases are ordinary, not edge cases. Every post the CMS creates
 * is `draft: true`, and the site filters drafts out of `getStaticPaths`, so
 * writing a post and looking at it before publishing - the main reason to
 * preview at all - is the one path that used to render a 404 under the words
 * "התצוגה מוכנה". A deletion is the same shape from the other end.
 *
 * The site's own filters are read here rather than restated, so a change to
 * either half fails this instead of quietly disagreeing with it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { absences, isBlogPost, pageFor, pagesFor, sitePathFor } from './pages';

const SITE = join(__dirname, '../../../src');
const POST = 'src/content/blog/מה-זה-צל.mdx';

describe('sitePathFor', () => {
  it.each([
    ['src/content/pages/home.toml', '/'],
    ['src/content/pages/contact.toml', '/contact'],
    ['src/content/about/about.mdx', '/about'],
    ['src/content/therapies/shiatsu.mdx', '/shiatsu'],
  ])('%s → %s', (path, to) => {
    expect(sitePathFor(path)).toBe(to);
  });

  it('percent-encodes a Hebrew slug, because the URL does', () => {
    expect(sitePathFor(POST)).toBe(`/blog/${encodeURIComponent('מה-זה-צל')}`);
  });

  it('has no page for what appears on every page', () => {
    expect(sitePathFor('src/content/nav.toml')).toBeNull();
    expect(sitePathFor('src/content/images.toml')).toBeNull();
  });
});

describe('a page the build will not have', () => {
  it('sends a deletion to the listing it came off', () => {
    const page = pageFor({ path: POST, status: 'removed' })!;
    expect(page.to).toBe('/blog');
    expect(page.absent).toContain('נמחק');
  });

  it('sends a hidden post to the listing, and says how to see it', () => {
    const page = pageFor({ path: POST, status: 'added', hidden: true })!;
    expect(page.to).toBe('/blog');
    expect(page.absent).toContain('מוסתר');
    expect(page.absent).toContain('מוצג באתר');
  });

  it('sends a shown post to the post', () => {
    const page = pageFor({ path: POST, status: 'modified' })!;
    expect(page.to).toBe(sitePathFor(POST));
    expect(page.absent).toBeUndefined();
  });

  // A therapy page is not filtered by anything, so only deletion removes it -
  // and the CMS offers no way to delete one. The rule still has to hold.
  it('sends a deleted top-level page home', () => {
    expect(pageFor({ path: 'src/content/therapies/shiatsu.mdx', status: 'removed' })!.to).toBe('/');
  });
});

describe('pagesFor', () => {
  it('keeps the order of the changes and drops repeats', () => {
    const pages = pagesFor([
      { path: 'src/content/pages/contact.toml', status: 'modified' },
      { path: POST, status: 'modified' },
      { path: 'src/content/pages/contact.toml', status: 'modified' },
    ]);
    expect(pages.map((p) => p.to)).toEqual(['/contact', sitePathFor(POST)]);
  });

  it('offers home when nothing changed has a page of its own', () => {
    const pages = pagesFor([{ path: 'src/content/nav.toml', status: 'modified' }]);
    expect(pages).toEqual([{ to: '/', label: 'דף הבית' }]);
  });

  it('is never empty, so the frame always has somewhere to go', () => {
    expect(pagesFor([]).length).toBe(1);
  });

  /**
   * A deleted page stands in for home, and home is not missing. Letting the
   * stand-in win would put an apology on a page that is perfectly fine.
   */
  it('prefers the real page over a listing standing in for it', () => {
    const pages = pagesFor([
      { path: 'src/content/therapies/shiatsu.mdx', status: 'removed' },
      { path: 'src/content/pages/home.toml', status: 'modified' },
    ]);
    expect(pages.map((p) => p.to)).toEqual(['/']);
    expect(absences(pages)).toHaveLength(0);
  });

  it('keeps a hidden post apart from the posts that are shown', () => {
    const pages = pagesFor([
      { path: POST, status: 'added', hidden: true },
      { path: 'src/content/blog/אחר.mdx', status: 'modified' },
    ]);
    expect(pages.map((p) => p.to)).toEqual(['/blog', sitePathFor('src/content/blog/אחר.mdx')]);
    expect(absences(pages)).toHaveLength(1);
  });

  it('explains each absence once', () => {
    const pages = pagesFor([
      { path: POST, status: 'removed' },
      { path: 'src/content/pages/home.toml', status: 'modified' },
    ]);
    expect(absences(pages)).toHaveLength(1);
  });
});

/**
 * The two halves have to agree. If the site stops filtering drafts, or starts
 * filtering something else, the preview's idea of what exists goes stale - and
 * a stale preview is exactly the defect this file was written for.
 */
describe('the site the CMS is guessing about', () => {
  const read = (p: string): string => readFileSync(join(SITE, p), 'utf8');

  it('still filters drafts out of the post pages and the listings', () => {
    expect(read('pages/blog/[slug].astro')).toMatch(/getStaticPaths[\s\S]*?!p\.data\.draft/);
    expect(read('pages/blog/index.astro')).toContain('!p.data.draft');
    expect(read('pages/index.astro')).toContain('!p.data.draft');
  });

  it('hides a page nowhere else, so no other change needs explaining', () => {
    const found = readdirSync(join(SITE, 'pages'), { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.astro'))
      .filter((f) => /\.data\.(draft|hidden|published)\b/.test(read(join('pages', f))))
      .map((f) => f.split(/[\\/]/).pop());
    expect(found.sort()).toEqual(['[slug].astro', 'index.astro', 'index.astro']);
  });

  it('agrees with isBlogPost about where posts live', () => {
    const dir = readdirSync(join(SITE, 'content/blog'));
    expect(dir.length).toBeGreaterThan(0);
    for (const file of dir) expect(isBlogPost(`src/content/blog/${file}`)).toBe(true);
    expect(isBlogPost('src/content/therapies/shiatsu.mdx')).toBe(false);
  });
});
