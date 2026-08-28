import type { CollectionEntry } from 'astro:content';

/**
 * Sort blog posts for the blog index and home page teaser.
 *
 * 1. Posts with `order` > 0 appear first, sorted by `order` descending.
 * 2. Posts sharing the same `order` are sorted by date, descending.
 * 3. All remaining posts (no `order`) follow, sorted by date, descending.
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