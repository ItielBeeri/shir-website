/**
 * Which page on the site a content file produces, and whether the build under
 * preview will actually have one.
 *
 * The preview deep-links to the page that changed, which is right whenever
 * that page exists. Twice it does not, and both are ordinary: a post the CMS
 * has just created carries `draft: true` and the site filters drafts out of
 * `getStaticPaths`, and a deleted page is gone from the very build being
 * previewed. Sending the frame there renders the site's own 404 under the
 * words "התצוגה מוכנה" - the build is fine, the address is not.
 *
 * So the target comes from what the build will serve, and a page that will not
 * be there says so in Hebrew instead of being shown as itself. Publishing asks
 * the same question for the same reason: the link afterwards has to land on a
 * page.
 */
import { describePath } from './describe.js';

/**
 * The page a content file produces.
 *
 * `null` means "everywhere": the brand details, the menu, the image manifest
 * and the pictures themselves show up on every page, and no one of them is a
 * better place to look than the home page.
 */
export function sitePathFor(path: string): string | null {
  if (path === 'src/content/pages/home.toml') return '/';
  if (path === 'src/content/pages/contact.toml') return '/contact';
  if (path === 'src/content/pages/accessibility.toml') return '/accessibility';
  if (path === 'src/content/pages/terms.toml') return '/terms';
  if (path === 'src/content/recommendations.toml') return '/recommendations';
  if (path.startsWith('src/content/about/')) return '/about';

  const therapy = /^src\/content\/therapies\/(.+)\.mdx$/.exec(path);
  if (therapy) return `/${encodeURIComponent(therapy[1])}`;

  const post = /^src\/content\/blog\/(.+)\.mdx$/.exec(path);
  if (post) return `/blog/${encodeURIComponent(post[1])}`;

  return null;
}

export const isBlogPost = (path: string): boolean =>
  /^src\/content\/blog\/.+\.mdx$/.test(path);

export interface ChangedPage {
  /** A path the build serves. Never one it is about to 404 on. */
  to: string;
  /** What changed, for the page chip. */
  label: string;
  /** Why the page she changed is not the one being shown, when it is not. */
  absent?: string;
}

/** A change, narrowed to what choosing a page needs. */
export interface PageInput {
  path: string;
  status: string;
  /** A post the site filters out of the build (`draft: true`). */
  hidden?: boolean;
}

/** The listing a page sits under: `/blog/x` → `/blog`, anything else → `/`. */
const listingOf = (to: string): string => {
  const cut = to.lastIndexOf('/');
  return cut > 0 ? to.slice(0, cut) : '/';
};

export function pageFor(change: PageInput): ChangedPage | null {
  const to = sitePathFor(change.path);
  if (!to) return null;
  const label = describePath(change.path);

  if (change.status === 'removed') {
    return {
      to: listingOf(to),
      label,
      absent: `${label} נמחק, ולכן הוא כבר לא באתר. זו הרשימה שהוא ירד ממנה.`,
    };
  }

  if (change.hidden) {
    return {
      to: listingOf(to),
      label,
      absent: `${label} מוגדר כרגע כמוסתר, ולכן הוא לא מופיע באתר ואי אפשר לראות אותו כאן. אפשר להדליק «מוצג באתר» בעמוד הפוסט ולחזור לכאן.`,
    };
  }

  return { to, label };
}

/**
 * The pages to offer, in the order the changes were listed, without repeats.
 *
 * A change the site has no page for - the menu, the image manifest - is not a
 * page to look at; with nothing else pending, home is.
 */
export function pagesFor(changes: readonly PageInput[]): ChangedPage[] {
  const seen = new Map<string, ChangedPage>();
  for (const change of changes) {
    const page = pageFor(change);
    if (!page) continue;
    const already = seen.get(page.to);
    // A listing stood in for a page that is not there; a change that really is
    // that listing describes it better, and carries no absence to explain.
    if (!already) seen.set(page.to, page);
    else if (already.absent && !page.absent) seen.set(page.to, page);
  }
  if (seen.size === 0) return [{ to: '/', label: 'דף הבית' }];
  return [...seen.values()];
}

/** Everything that will not be where she changed it, said once each. */
export const absences = (pages: readonly ChangedPage[]): string[] =>
  pages.map((p) => p.absent).filter((a): a is string => Boolean(a));
