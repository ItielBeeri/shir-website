/* Markdown reads any run of blank lines as one paragraph break, so an empty
   line the owner leaves to make room - as she would in a word processor -
   never reached the page. Each blank line past the first between two
   top-level blocks becomes a line of space. The CMS shows those same lines as
   empty paragraphs and counts them the same way (cms/src/content/pm-convert.ts). */

const blankLine = () => ({
  type: 'blankLine',
  data: { hName: 'div', hProperties: { className: ['blank-line'], ariaHidden: 'true' } },
});

export default function remarkBlankLines() {
  return (tree) => {
    const children = [];
    let previous;
    for (const node of tree.children) {
      if (previous?.position && node.position) {
        const extra = node.position.start.line - previous.position.end.line - 2;
        for (let i = 0; i < extra; i += 1) children.push(blankLine());
      }
      children.push(node);
      previous = node;
    }
    tree.children = children;
  };
}
