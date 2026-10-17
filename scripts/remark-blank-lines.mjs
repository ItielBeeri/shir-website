/* Markdown reads any run of blank lines as one paragraph break, so an empty
   line the owner leaves to make room - as she would in a word processor -
   never reached the page. Each blank line past the first between two blocks
   of the body becomes a line of space, and a FramedSection's contents count
   as a body of their own. The CMS shows those same lines as empty paragraphs
   and counts them the same way (cms/src/content/pm-convert.ts). */

const blankLine = () => ({
  type: 'blankLine',
  data: { hName: 'div', hProperties: { className: ['blank-line'], ariaHidden: 'true' } },
});

const isFrame = (node) => node.type === 'mdxJsxFlowElement' && node.name === 'FramedSection';

function space(parent) {
  const children = [];
  let previous;
  for (const node of parent.children) {
    if (previous?.position && node.position) {
      const extra = node.position.start.line - previous.position.end.line - 2;
      for (let i = 0; i < extra; i += 1) children.push(blankLine());
    }
    if (isFrame(node)) space(node);
    children.push(node);
    previous = node;
  }
  parent.children = children;
}

export default function remarkBlankLines() {
  return space;
}
