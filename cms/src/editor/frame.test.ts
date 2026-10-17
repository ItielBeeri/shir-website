/**
 * What the frame's toolbar button, its remove button and Enter inside it do
 * to the file. Run on a bare ProseMirror state - the commands are the
 * extension's own, minus the view, which this suite has no DOM for.
 */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { Transaction } from '@tiptap/pm/state';
import { enterKeepsInFrame, extensions, toggleFrame, unwrapFrame } from './extensions';
import { allBlocks, parseMdx, serializeMdx } from '../content/mdx-edit';
import { docToPm, pmToDoc } from '../content/pm-convert';
import type { PmNode } from '../content/pm-convert';

const schema = getSchema(extensions);
const frameType = schema.nodes.framedSection;
const fm = '---\ntitle: "x"\n---\n';

const open = (body: string): EditorState =>
  EditorState.create({ doc: schema.nodeFromJSON(docToPm(parseMdx(fm + body))) });

const write = (state: EditorState): string => {
  const doc = pmToDoc(state.doc.toJSON() as PmNode, fm);
  return serializeMdx(doc, allBlocks(doc)).slice(fm.length);
};

/** The position just before `text`, wherever it is in the document. */
const at = (doc: PMNode, text: string): number => {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found < 0 && node.isText && node.text!.includes(text)) found = pos + node.text!.indexOf(text);
  });
  expect(found, text).toBeGreaterThanOrEqual(0);
  return found;
};

const select = (state: EditorState, from: string, to = from): EditorState =>
  state.apply(state.tr.setSelection(TextSelection.create(state.doc, at(state.doc, from), at(state.doc, to))));

const run = (state: EditorState, command: (tr: Transaction) => boolean): EditorState => {
  const tr = state.tr;
  expect(command(tr)).toBe(true);
  return state.apply(tr);
};

const toggle = (state: EditorState): EditorState => run(state, (tr) => toggleFrame(tr, frameType, true));

describe('the frame button', () => {
  const BODY = '\nאחת\n\nשתיים\n\nשלוש\n';

  it('frames the paragraph the caret is in', () => {
    expect(write(toggle(select(open(BODY), 'שתיים')))).toBe(
      '\nאחת\n\n<FramedSection>\n\nשתיים\n\n</FramedSection>\n\nשלוש\n',
    );
  });

  it('frames every block the selection touches', () => {
    expect(write(toggle(select(open(BODY), 'אחת', 'שתיים')))).toBe(
      '\n<FramedSection>\n\nאחת\n\nשתיים\n\n</FramedSection>\n\nשלוש\n',
    );
  });

  it('frames a whole list from inside one of its items', () => {
    expect(write(toggle(select(open('\nלפני\n\n- א\n- ב\n'), 'ב')))).toBe(
      '\nלפני\n\n<FramedSection>\n\n- א\n- ב\n\n</FramedSection>\n',
    );
  });

  it('keeps the blank lines a framed block had before it, outside the frame', () => {
    expect(write(toggle(select(open('\nאחת\n\n\nשתיים\n'), 'שתיים')))).toBe(
      '\nאחת\n\n\n<FramedSection>\n\nשתיים\n\n</FramedSection>\n',
    );
  });

  it('pressed again inside the frame, takes it away and gives the file back as it was', () => {
    const framed = toggle(select(open(BODY), 'אחת', 'שתיים'));
    expect(write(toggle(select(framed, 'שתיים')))).toBe(BODY);
  });

  it('cannot frame a frame', () => {
    const framed = toggle(select(open(BODY), 'שתיים'));
    const state = select(framed, 'אחת', 'שלוש');
    expect(toggleFrame(state.tr, frameType, false)).toBe(false);
  });
});

describe('removing a frame', () => {
  it('keeps everything it held, in place, with the frame’s own spacing', () => {
    const src = '\nלפני\n\n\n<FramedSection tone="rose">\n\n## כותרת\n\nא\n\n\nב\n\n</FramedSection>\n\nאחרי\n';
    const state = open(src);
    let pos = -1;
    state.doc.forEach((node, offset) => {
      if (node.type === frameType) pos = offset;
    });
    expect(write(run(state, (tr) => unwrapFrame(tr, pos)))).toBe('\nלפני\n\n\n## כותרת\n\nא\n\n\nב\n\nאחרי\n');
  });
});

describe('Enter inside a frame', () => {
  const frame = (...content: PmNode[]): PmNode => ({ type: 'framedSection', content });
  const para = (text?: string): PmNode => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] });
  const stateAt = (doc: PmNode, path: number[]): EditorState => {
    const state = EditorState.create({ doc: schema.nodeFromJSON(doc) });
    // The start of the textblock found by walking `path` from the document.
    let node = state.doc;
    let pos = 0;
    for (const index of path) {
      for (let i = 0; i < index; i += 1) pos += node.child(i).nodeSize;
      pos += 1;
      node = node.child(index);
    }
    return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
  };
  const doc = { type: 'doc', content: [frame(para('א'), para(), para('ב'), para()), para('אחרי')] };

  it('on an empty line in the middle makes another empty line, rather than cutting the frame in two', () => {
    expect(enterKeepsInFrame(stateAt(doc, [0, 1]).selection, frameType)).toBe(true);
  });

  it('on the empty last line steps out, as the editor does by default', () => {
    expect(enterKeepsInFrame(stateAt(doc, [0, 3]).selection, frameType)).toBe(false);
  });

  it('on the only line of an empty frame makes another line, rather than taking the frame away', () => {
    const lone = { type: 'doc', content: [frame(para()), para('אחרי')] };
    expect(enterKeepsInFrame(stateAt(lone, [0, 0]).selection, frameType)).toBe(true);
  });

  it('anywhere else is left to the editor', () => {
    expect(enterKeepsInFrame(stateAt(doc, [0, 0]).selection, frameType)).toBe(false);
    expect(enterKeepsInFrame(stateAt(doc, [1]).selection, frameType)).toBe(false);
  });
});
