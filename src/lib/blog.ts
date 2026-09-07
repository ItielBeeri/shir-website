import type { CollectionEntry } from 'astro:content';

/**
 * The one ordering for blog posts, shared by the blog index and home teaser:
 * `order` > 0 first by `order` descending, then everything by date descending.
 */
export function sortBlogPosts(posts: CollectionEntry<'blog'>[]): CollectionEntry<'blog'>[] {
  return [...posts].sort((a, b) => {
    const aOrder = a.data.order ?? 0;
    const bOrder = b.data.order ?? 0;
    const aFeatured = aOrder > 0;
    const bFeatured = bOrder > 0;
    if (aFeatured !== bFeatured) return aFeatured ? -1 : 1;
    if (aFeatured && aOrder !== bOrder) return bOrder - aOrder;
    return b.data.date.getTime() - a.data.date.getTime();
  });
}