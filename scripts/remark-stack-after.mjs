/* A floated image has no room beside its text on a phone, so SoftImage stacks
   it full width above that text. `stack="after"` puts it after the paragraph
   that follows it instead - with the paragraph's heading, if it has one - and
   leaves the wide layout as it is. SoftVideo floats and stacks the same way.

   The image is rendered twice: in place, shown only while it floats
   (`only="wide"`), and after the paragraph, shown only once stacked
   (`only="narrow"`). Reordering one copy with flex `order` would stop every
   margin in the column collapsing, and a screen reader would still meet the
   image before the text it follows. Both copies are lazy, so a hidden one is
   never fetched.

   Runs after remark-blank-lines, which reads node positions to count blank
   lines, and a copy carries the position of the original. */

const MEDIA = new Set(['SoftImage', 'SoftVideo']);

const isStackAfter = (node) =>
  node.type === 'mdxJsxFlowElement' &&
  MEDIA.has(node.name) &&
  node.attributes.some((a) => a.type === 'mdxJsxAttribute' && a.name === 'stack' && a.value === 'after');

const only = (node, layout) => ({
  ...node,
  attributes: [
    ...node.attributes.filter((a) => a.name !== 'stack'),
    { type: 'mdxJsxAttribute', name: 'only', value: layout },
  ],
});

const LEADS_IN = new Set(['heading', 'blankLine']);
const PARAGRAPH = new Set(['paragraph', 'list']);

const isFrame = (node) => node.type === 'mdxJsxFlowElement' && node.name === 'FramedSection';

/** A FramedSection's contents are a body of their own: its image stacks inside it. */
function stack(children) {
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];
    if (isFrame(node)) stack(node.children);
    if (!isStackAfter(node)) continue;
    let end = i + 1;
    while (end < children.length && LEADS_IN.has(children[end].type)) end += 1;
    if (end < children.length && PARAGRAPH.has(children[end].type)) end += 1;
    children[i] = only(node, 'wide');
    children.splice(end, 0, only(node, 'narrow'));
  }
}

export default function remarkStackAfter() {
  return (tree) => stack(tree.children);
}
