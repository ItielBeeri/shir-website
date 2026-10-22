/**
 * Format-preserving edits to the site's TOML.
 *
 * The content files carry Hebrew comments addressed to the owner, which
 * AGENTS.md §0 requires stay accurate. Parse -> modify -> stringify destroys
 * them, so every edit here is a byte splice of one value's source range; the
 * rest of the file is never rewritten.
 *
 * Editing one element (`sections.0.body.1`) splices that element alone, so a
 * one-word change reflows nothing. Adding or removing one cannot be expressed
 * that way - the list is a different length - so `setStringArray` rewrites the
 * whole array, in the layout it already had.
 */
import { parseTOML } from 'toml-eslint-parser';

export type TomlPath = (string | number)[];

export type TomlScalar = string | boolean | number;

export interface TomlSlot {
  path: TomlPath;
  /** Source range of the value literal, splice-ready. */
  range: [number, number];
  kind: 'string' | 'boolean' | 'integer' | 'float' | 'datetime';
  value: TomlScalar;
}

export interface TomlArraySlot {
  path: TomlPath;
  /** Source range of the whole array, brackets included. */
  range: [number, number];
  /** Source range of each element, in order. */
  elements: Array<[number, number]>;
}

const keyNames = (key: { keys: Array<{ name?: string; value?: unknown }> }): string[] =>
  key.keys.map((k) => (k.name !== undefined ? k.name : String(k.value)));

/** Every value node in the document, in source order, each with its own path. */
function walkDocument(src: string, visit: (node: any, path: TomlPath) => void): void {
  const walkValue = (node: any, path: TomlPath): void => {
    visit(node, path);
    switch (node.type) {
      case 'TOMLValue':
        return;
      case 'TOMLArray':
        node.elements.forEach((el: any, i: number) => walkValue(el, [...path, i]));
        return;
      case 'TOMLInlineTable':
        node.body.forEach((kv: any) => walkValue(kv.value, [...path, ...keyNames(kv.key)]));
        return;
      default:
        throw new Error(`unsupported TOML node ${node.type} at ${path.join('.')}`);
    }
  };

  const top = parseTOML(src).body[0];
  for (const node of (top as any).body) {
    if (node.type === 'TOMLKeyValue') {
      walkValue(node.value, keyNames(node.key));
    } else if (node.type === 'TOMLTable') {
      for (const kv of node.body) {
        walkValue(kv.value, [...node.resolvedKey, ...keyNames(kv.key)]);
      }
    }
  }
}

/** Every scalar in the document, in source order, each with its own path. */
export function slots(src: string): TomlSlot[] {
  const out: TomlSlot[] = [];
  walkDocument(src, (node, path) => {
    if (node.type === 'TOMLValue') {
      out.push({ path, range: node.range, kind: node.kind, value: node.value });
    }
  });
  return out;
}

export function arrays(src: string): TomlArraySlot[] {
  const out: TomlArraySlot[] = [];
  walkDocument(src, (node, path) => {
    if (node.type === 'TOMLArray') {
      out.push({
        path,
        range: node.range,
        elements: node.elements.map((el: any) => el.range as [number, number]),
      });
    }
  });
  return out;
}

const samePath = (a: TomlPath, b: TomlPath): boolean =>
  a.length === b.length && a.every((seg, i) => String(seg) === String(b[i]));

export function findSlot(src: string, path: TomlPath): TomlSlot {
  const hit = slots(src).find((s) => samePath(s.path, path));
  if (!hit) throw new Error(`no such value: ${path.join('.')}`);
  return hit;
}

export function findArray(src: string, path: TomlPath): TomlArraySlot {
  const hit = arrays(src).find((a) => samePath(a.path, path));
  if (!hit) throw new Error(`no such array: ${path.join('.')}`);
  return hit;
}

const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;
const ctrl = (c: string) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`;

function encodeBasic(value: string): string {
  const body = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(CONTROL, ctrl);
  return `"${body}"`;
}

function encodeMultilineBasic(value: string, leadingNewline: boolean): string {
  // Newlines and lone quotes stay raw inside """; a backslash or a run of three
  // quotes would change how the literal parses, and a carriage return is not
  // carried at all - a parser is free to read CRLF back as LF, so it is written
  // as an escape rather than raw.
  const body = value
    .replace(/\\/g, '\\\\')
    // A run of three quotes closes the literal, and a quote against the
    // closing delimiter joins one; every other quote is left alone, because
    // Hebrew copy is full of them and rewriting one moves bytes for nothing.
    .replace(/"{3,}|"+$/g, (run) => run.replace(/"/g, '\\"'))
    .replace(/\r/g, '\\r')
    .replace(CONTROL, ctrl);
  // A newline straight after the opening delimiter is trimmed, so a value that
  // begins with one has to be pushed off the delimiter or it arrives short.
  return `"""${leadingNewline || body.startsWith('\n') ? '\n' : ''}${body}"""`;
}

/**
 * A control character a literal string cannot carry, since it has no escapes:
 * tab is allowed, a newline only across `'''`, and nothing else below a space.
 */
const UNLITERAL = /[\x00-\x08\x0b-\x1f\x7f]/;

/** Whether `value` can be written literally, quotes and all, exactly as it is. */
const fitsLiteral = (value: string, multiline: boolean): boolean =>
  multiline
    ? // A quote against the closing delimiter joins it, and a literal string
      // has no escape to break the pair apart with.
      !value.includes("'''") && !value.endsWith("'") && !UNLITERAL.test(value)
    : !value.includes("'") && !value.includes('\n') && !UNLITERAL.test(value);

function encodeLiteral(value: string, multiline: boolean, leadingNewline: boolean): string {
  if (!fitsLiteral(value, multiline)) throw new Error('value does not fit a literal string');
  if (multiline) {
    return `'''${leadingNewline || value.startsWith('\n') ? '\n' : ''}${value}'''`;
  }
  return `'${value}'`;
}

/**
 * Re-encode `value` in the same style as the literal currently at `raw`, so a
 * round trip is byte-identical and an edit changes only what it must.
 */
export function encodeLike(raw: string, value: TomlScalar): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    // The same number keeps the spelling it was written in - `19.0` reads
    // back as 19, and `String` would write the integer `19` for it.
    if (Number(raw.replace(/_/g, '')) === value) return raw;
    // A float stays a float to TOML when it changes to a whole number. (A hex
    // integer can hold an `e`, which is not an exponent.)
    const float = !/^[+-]?0[xob]/.test(raw) && /[.eE]/.test(raw);
    return float && Number.isInteger(value) ? `${value}.0` : String(value);
  }

  if (raw.startsWith('"""')) {
    return encodeMultilineBasic(value, raw.startsWith('"""\n'));
  }
  // A literal string that can no longer be one is promoted rather than lost.
  if (raw.startsWith("'''")) {
    if (!fitsLiteral(value, true)) return encodeMultilineBasic(value, raw.startsWith("'''\n"));
    return encodeLiteral(value, true, raw.startsWith("'''\n"));
  }
  if (raw.startsWith("'")) {
    if (!fitsLiteral(value, false)) {
      return value.includes('\n') ? encodeMultilineBasic(value, true) : encodeBasic(value);
    }
    return encodeLiteral(value, false, false);
  }
  // Basic. A newly multi-line value has to become a multiline literal.
  if (value.includes('\n')) return encodeMultilineBasic(value, true);
  return encodeBasic(value);
}

/* ------------------------------ whole arrays -------------------------------- */

/** The leading whitespace of the line `at` sits on. */
function indentOfLine(src: string, at: number): string {
  const start = src.lastIndexOf('\n', at - 1) + 1;
  return /^[ \t]*/.exec(src.slice(start))![0];
}

/** The same, but only when `at` is the first thing on its line. */
function ownLineIndent(src: string, at: number): string | null {
  const start = src.lastIndexOf('\n', at - 1) + 1;
  const before = src.slice(start, at);
  return /^[ \t]*$/.test(before) ? before : null;
}

/**
 * Replace a whole array of strings, keeping the layout it is written in.
 *
 * Adding or removing a paragraph changes the array's length, which no value
 * splice can express. The array is re-rendered, but its own style is read back
 * out of the source first - one line or many, how far each element is indented,
 * whether the last one carries a comma - so the only lines that move are the
 * ones that had to.
 */
export function setStringArray(src: string, path: TomlPath, values: string[]): string {
  const slot = findArray(src, path);
  for (const [from, to] of slot.elements) {
    const raw = src.slice(from, to).trimStart();
    if (!/^["']/.test(raw)) throw new Error(`not a list of text: ${path.join('.')}`);
  }

  const sample = slot.elements.length ? src.slice(...slot.elements[0]) : '""';
  const encode = (value: string): string => encodeLike(sample, value);
  const body = src.slice(slot.range[0], slot.range[1]);

  let next: string;
  if (values.length === 0) {
    next = '[]';
  } else if (!body.includes('\n')) {
    next = `[${values.map(encode).join(', ')}]`;
  } else {
    const close = indentOfLine(src, slot.range[0]);
    const indent =
      (slot.elements.length ? ownLineIndent(src, slot.elements[0][0]) : null) ?? `${close}  `;
    const tail = slot.elements.length
      ? src.slice(slot.elements[slot.elements.length - 1][1], slot.range[1]).includes(',')
      : true;
    const lines = values.map(
      (v, i) => `${indent}${encode(v)}${i === values.length - 1 && !tail ? '' : ','}`,
    );
    next = `[\n${lines.join('\n')}\n${close}]`;
  }

  return src.slice(0, slot.range[0]) + next + src.slice(slot.range[1]);
}

/** Replace one value, leaving every other byte of the document untouched. */
export function setValue(src: string, path: TomlPath, value: TomlScalar): string {
  const slot = findSlot(src, path);
  const raw = src.slice(slot.range[0], slot.range[1]);
  return src.slice(0, slot.range[0]) + encodeLike(raw, value) + src.slice(slot.range[1]);
}

/** Several edits at once, applied right-to-left so earlier ranges stay valid. */
export function setValues(
  src: string,
  edits: Array<{ path: TomlPath; value: TomlScalar }>,
): string {
  const resolved = edits.map((e) => ({ ...e, slot: findSlot(src, e.path) }));
  resolved.sort((a, b) => b.slot.range[0] - a.slot.range[0]);
  let out = src;
  for (const { slot, value } of resolved) {
    const raw = src.slice(slot.range[0], slot.range[1]);
    out = out.slice(0, slot.range[0]) + encodeLike(raw, value) + out.slice(slot.range[1]);
  }
  return out;
}
