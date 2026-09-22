/**
 * The address a post answers at.
 *
 * The file name is the URL, and Astro lowercases the slug it derives, so this
 * lowercases too: a rename that previewed `/blog/QA2-…` sent the owner to a
 * 404, because the site was serving `/blog/qa2-…`. Hebrew has no case, so this
 * only touches the Latin an occasional title carries.
 */
export function slugFor(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/[\/:*?<>|#%{}\[\]]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
