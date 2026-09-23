/**
 * R6-2: "צפייה באתר" has to point at the site.
 *
 * GitHub reports a deployment's own URL, which is an immutable snapshot of one
 * build. Echoing it told her to look at an address that is right today, frozen
 * forever, and not the one she would give anybody.
 */
import { describe, expect, it } from 'vitest';
import { siteLink } from './Deploy';

const SITE = 'https://www.shir-amitai.com';
const DEPLOYMENT = 'https://shir-amitai-28cjc8xck-x.vercel.app';

describe('the link after publishing', () => {
  it('goes to the site, on the page that changed', () => {
    const link = siteLink(SITE, [{ path: 'src/content/pages/contact.toml', status: 'modified' }], DEPLOYMENT);
    expect(link).toBe(`${SITE}/contact`);
  });

  it('goes to the listing when the page was deleted', () => {
    const link = siteLink(SITE, [{ path: 'src/content/blog/x.mdx', status: 'removed' }], DEPLOYMENT);
    expect(link).toBe(`${SITE}/blog`);
  });

  it('goes home when what changed shows on every page', () => {
    const link = siteLink(SITE, [{ path: 'src/content/nav.toml', status: 'modified' }], DEPLOYMENT);
    expect(link).toBe(`${SITE}/`);
  });

  it('does not double the slash on a configured trailing one', () => {
    const link = siteLink(`${SITE}/`, [{ path: 'src/content/pages/home.toml', status: 'modified' }], DEPLOYMENT);
    expect(link).toBe(`${SITE}/`);
  });

  // Without the address configured, the deployment URL is still a link to
  // something she published; silence would be worse than a frozen snapshot.
  it('falls back to the deployment when the site address is unknown', () => {
    const link = siteLink(undefined, [{ path: 'src/content/pages/home.toml', status: 'modified' }], DEPLOYMENT);
    expect(link).toBe(DEPLOYMENT);
  });

  it('has nothing to offer when neither is known', () => {
    expect(siteLink(undefined, [], undefined)).toBeUndefined();
  });
});
