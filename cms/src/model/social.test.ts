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
 * The site has no test runner of its own, so its function is imported here.
 * That is the point: the guard belongs to the site, where it also covers a
 * hand edit, and this is the suite that can say so.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { socialLinks } from '../../../src/lib/social';
import { screens } from './screens';

const CONTENT = join(__dirname, '../../../src/content');

const FULL = {
  facebook_url: 'https://www.facebook.com/x',
  facebook_label: 'פייסבוק',
  youtube_url: 'https://www.youtube.com/x',
  youtube_label: 'יוטיוב',
  spotify_url: 'https://open.spotify.com/x',
  spotify_label: 'ספוטיפיי',
  biosynthesis_url: 'https://biosynthesis.co.il/x',
  biosynthesis_label: 'ביוסינתזה',
};

describe('a social link the owner cleared', () => {
  it('is not in the list at all', () => {
    const links = socialLinks({ ...FULL, facebook_url: '' });
    expect(links.map((l) => l.event)).toEqual(['youtube', 'spotify', 'biosynthesis']);
  });

  it('counts whitespace as cleared, because a space is not an address', () => {
    expect(socialLinks({ ...FULL, youtube_url: '   ' }).map((l) => l.event)).not.toContain('youtube');
  });

  it('never yields a link with nowhere to go', () => {
    const emptied = { ...FULL, facebook_url: '', youtube_url: '', spotify_url: '', biosynthesis_url: '' };
    expect(socialLinks(emptied)).toEqual([]);
  });

  it('leaves a full set alone, in its order', () => {
    expect(socialLinks(FULL).map((l) => l.event)).toEqual([
      'facebook',
      'youtube',
      'spotify',
      'biosynthesis',
    ]);
  });

  it('reads the live file without dropping anything', () => {
    const src = readFileSync(join(CONTENT, 'site.toml'), 'utf8');
    const urls = [...src.matchAll(/^(\w+)_url\s*=\s*"([^"]*)"/gm)].filter(
      ([, key]) => key !== 'whatsapp',
    );
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every(([, , value]) => value.trim() !== '')).toBe(true);
  });
});

/**
 * The editor's half. The site no longer breaks, but silently dropping a link
 * from every page is still a consequence worth naming before she does it.
 */
describe('what the editor says about clearing one', () => {
  const socialFields = screens
    .flatMap((screen) => screen.groups ?? [])
    .flatMap((group) => group.fields)
    .filter((field) => field.key.endsWith('_url') && field.key !== 'whatsapp_url');

  it('has the social URL fields to speak for', () => {
    expect(socialFields.length).toBeGreaterThanOrEqual(3);
  });

  it('says what an empty one means', () => {
    for (const field of socialFields) {
      expect(field.help, field.key).toBeTruthy();
      expect(field.help, field.key).toContain('ריק');
    }
  });
});
