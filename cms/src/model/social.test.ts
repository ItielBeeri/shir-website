/**
 * V-6: a field she cleared may not become a broken artefact on the site.
 *
 * Dropping a platform is an ordinary thing to do, and the editor does it by
 * clearing the field. That leaves `facebook_url = ""`, which rendered is
 * `<a href="">` in the footer of *every* page - a link that reloads where she
 * already is, under an accessible name promising a new tab. It is the mirror
 * of `X-4`, which guarantees she cannot author a dangling image reference; the
 * same guarantee has to cover a link.
 *
 * The guard belongs to the site, in `socialLinks()`, where it covers the
 * footer, `/about`, `/contact` and a hand edit alike. The site has no test
 * runner, and this suite may not import its source: `cms/` is not a workspace
 * member (AGENTS.md §13), so the site's dependencies are not installed beside
 * it and `tsc` cannot resolve them. So this reads, the way `pages.test.ts`
 * reads the `.astro` filters - enough to fail loudly if the guard leaves,
 * which is what a gate across a boundary can honestly promise.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { plainFields, plainGroups } from './site-fields';

const SITE = join(__dirname, '../../../src');
const read = (p: string): string => readFileSync(join(SITE, p), 'utf8');

describe('the site, on a social link the owner cleared', () => {
  const social = read('lib/social.ts');

  it('drops it rather than rendering it', () => {
    expect(social).toMatch(/export function socialLinks[\s\S]*?\.filter\(/);
    expect(social).toContain("href.trim() !== ''");
  });

  /**
   * The filter is only worth anything if every surface goes through it. A page
   * reading `site.social` directly would render the empty link the function
   * exists to remove.
   */
  it.each(['components/layout/Footer.astro', 'pages/about.astro', 'pages/contact.astro'])(
    '%s renders through socialLinks()',
    (page) => {
      const source = read(page);
      expect(source).toContain('socialLinks(site.social)');
      expect(source).not.toMatch(/site\.social\.\w+_url/);
    },
  );

  it('has no emptied link in the live file today', () => {
    const urls = [...read('content/site.toml').matchAll(/^(\w+)_url\s*=\s*"([^"]*)"/gm)];
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter(([, , value]) => value.trim() === '')).toEqual([]);
  });
});

/**
 * The editor's half. The site no longer breaks, but silently dropping a link
 * from every page is still a consequence worth naming before she does it.
 *
 * Asked of `plainFields()` - the list the screen renders - and not of
 * `screens.ts`. The first version of this test asked the model, and passed
 * while the screen showed a different sentence from a list of its own.
 */
describe('what the editor says about clearing one', () => {
  const socialFields = plainFields().filter(
    (field) => field.key.startsWith('social.') && field.key.endsWith('_url'),
  );

  it('has the social URL fields to speak for', () => {
    expect(socialFields.length).toBeGreaterThanOrEqual(3);
  });

  it('says what an empty one means', () => {
    for (const field of socialFields) {
      expect(field.help, field.key).toBeTruthy();
      expect(field.help, field.key).toContain('ריק');
    }
  });

  it('reaches the screen, because the screen has no list of its own', () => {
    const screen = readFileSync(join(__dirname, '../screens/SiteDetails.tsx'), 'utf8');
    expect(screen).toContain("from '../model/site-fields'");
    // A second array of paths and labels here is what made the help invisible.
    expect(screen).not.toMatch(/path: \['(brand|social|footer)'/);
  });

  it('covers every group the screen draws', () => {
    expect(plainGroups().map((g) => g.title)).toEqual([
      'השם ושורת התחומים',
      'קישורים',
      'כותרת תחתונה',
    ]);
  });
});
