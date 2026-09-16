/* Markdown gives `*text*` and `_text_` the same `emphasis` node, but the site
   spends them differently: asterisks carry Hebrew emphasis-by-weight (§4.3),
   underscores ask for real italic. The marker survives only in the source, so
   read it back off the node's offset and tag the underscored ones. */

export default function remarkUnderscoreItalic() {
  return (tree, file) => {
    const source = String(file.value);

    const walk = (node) => {
      if (node.type === 'emphasis' && source[node.position?.start?.offset] === '_') {
        const data = (node.data ??= {});
        const props = (data.hProperties ??= {});
        props.className = ['italic'];
      }
      if (node.children) node.children.forEach(walk);
    };

    walk(tree);
  };
}
