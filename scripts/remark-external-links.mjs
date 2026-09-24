/* A link in body copy that leaves the site opens in a new tab and says so to a
   screen reader, as every other outbound link here does ("נפתח בטאב חדש").
   The words go in a visually hidden span rather than an aria-label, which
   would replace the link's own text instead of adding to it. A link to the
   site's own address is internal however its host is spelled. */

const NOTE = ' - נפתח בטאב חדש';

export default function remarkExternalLinks({ site }) {
  const own = new URL(site).hostname.replace(/^www\./, '');

  const leaves = (url) => {
    if (!/^(https?:)?\/\//i.test(url)) return false;
    try {
      return new URL(url, site).hostname.replace(/^www\./, '') !== own;
    } catch {
      return false;
    }
  };

  return (tree) => {
    const walk = (node) => {
      if (node.type === 'link' && leaves(node.url)) {
        const data = (node.data ??= {});
        Object.assign((data.hProperties ??= {}), { target: '_blank', rel: ['noopener'] });
        node.children.push({
          type: 'linkNote',
          data: { hName: 'span', hProperties: { className: ['sr-only'] }, hChildren: [{ type: 'text', value: NOTE }] },
        });
        return;
      }
      if (node.children) node.children.forEach(walk);
    };
    walk(tree);
  };
}
