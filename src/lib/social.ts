/**
 * The outbound profile links, in display order, each paired with its icon.
 *
 * The footer and the contact page both render this list. Order, icon and
 * analytics label live here rather than at the two call sites so the two
 * surfaces cannot drift apart - the same reason ordering is centralised in
 * `sortBlogPosts()` and `loadRecommendations()`.
 */
import { z } from 'zod';

export const socialSchema = z.object({
  facebook_url:       z.string(),
  facebook_label:     z.string(),
  youtube_url:        z.string(),
  youtube_label:      z.string(),
  spotify_url:        z.string(),
  spotify_label:      z.string(),
  biosynthesis_url:   z.string(),
  biosynthesis_label: z.string(),
});

export interface SocialLink {
  href: string;
  /** Hebrew, from site.toml. */
  label: string;
  /** A name under src/icons/. */
  icon: string;
  /**
   * `data-an-cta-label`. It is the key the outbound_click history is grouped
   * by, so it stays put when a label or a URL is edited.
   */
  event: string;
}

export function socialLinks(social: z.infer<typeof socialSchema>): SocialLink[] {
  return [
    { href: social.facebook_url, label: social.facebook_label, icon: 'facebook', event: 'facebook' },
    { href: social.youtube_url,  label: social.youtube_label,  icon: 'youtube',  event: 'youtube' },
    { href: social.spotify_url,  label: social.spotify_label,  icon: 'spotify',  event: 'spotify' },
    // The school is a website, not a profile, and has no mark of its own to
    // carry - the generic outbound arrow is the honest icon for it.
    {
      href: social.biosynthesis_url,
      label: social.biosynthesis_label,
      icon: 'external',
      event: 'biosynthesis',
    },
  ];
}
