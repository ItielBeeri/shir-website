/**
 * Format-preserving edits to MDX frontmatter.
 *
 * Reading goes through **js-yaml**, which is what Astro uses (via gray-matter)
 * - not the `yaml` package. The difference is not cosmetic: `voice.mdx` has a
 * double-quoted scalar whose continuation lines sit at column 0, which `yaml`
 * rejects outright and js-yaml folds into a space. Reading with anything but
 * Astro's own parser means the editor shows a value the site never had.
 *
 * Writing splices one value's source span, like toml-edit. js-yaml offers no
 * ranges, so the span is found by scanning from the key - which is tractable
 * because the frontmatter vocabulary is small and fixed by src/content/config.ts.
 *
 * An optional key the file does not have is written by inserting a line, and
 * cleared by removing that line. No value stands for absent: `order` is
 * `z.number().int().positive()`, so writing 0 to unpin a post fails the build
 * instead of unpinning it.
 */
import { load } from 'js-yaml';

export type FrontmatterValue = string | number | boolean | string[];

const FENCE = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/;

export interface Frontmatter {
  /** The whole block including both fences, exactly as written. */
  raw: string;
  /** Just the YAML between the fences. */
  text: string;
  /** Where `text` begins within the source. */
  offset: number;
  data: Record<string, unknown>;
}

export interface WriteOptions {
  /**
   * Preferred key sequence, consulted only when a key has to be inserted: the
   * new line goes after the last key of the list the file already has. Without
   * it an optional field lands at the end of the block, away from its siblings.
   */
  order?: readonly string[];
}

export function parseFrontmatter(source: string): Frontmatter {
  const m = source.match(FENCE);
  if (!m) throw new Error('no frontmatter');
  const data = load(m[2]);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter is not a mapping');
  }
  return { raw: m[0], text: m[2], offset: m[1].length, data: data as Record<string, unknown> };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Where a key's value begins, or null when the file has no such key. */
function valueStart(text: string, key: string): number | null {
  const m = new RegExp('^' + escapeRe(key) + ':[ \\t]*', 'm').exec(text);
  return m ? m.index + m[0].length : null;
}

/** Offsets of a key's value within the frontmatter text. */
export function fieldRange(text: string, key: string): [number, number] {
  const start = valueStart(text, key);
  if (start === null) throw new Error(`no such frontmatter field: ${key}`);
  return [start, valueEnd(text, start)];
}

export const hasField = (source: string, key: string): boolean =>
  valueStart(parseFrontmatter(source).text, key) !== null;

function valueEnd(text: string, start: number): number {
  const ch = text[start];

  if (ch === '"' || ch === "'") {
    // Quoted scalars may run across lines; only an unescaped closing quote ends
    // one. Doubled quotes are the escape inside a single-quoted scalar.
    let i = start + 1;
    while (i < text.length) {
      if (ch === '"' && text[i] === '\\') { i += 2; continue; }
      if (text[i] === ch) {
        if (ch === "'" && text[i + 1] === "'") { i += 2; continue; }
        return i + 1;
      }
      i += 1;
    }
    throw new Error('unterminated quoted scalar');
  }

  if (ch === '[' || ch === '{') {
    const close = ch === '[' ? ']' : '}';
    let depth = 0;
    let quote: string | null = null;
    for (let i = start; i < text.length; i += 1) {
      const c = text[i];
      if (quote) {
        if (c === '\\' && quote === '"') { i += 1; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === ch) depth += 1;
      else if (c === close) { depth -= 1; if (depth === 0) return i + 1; }
    }
    throw new Error('unterminated flow collection');
  }

  if (ch === '|' || ch === '>') {
    // Block scalar: the header line, then every more-indented or blank line.
    let i = text.indexOf('\n', start);
    if (i < 0) return text.length;
    const lines = text.slice(i + 1).split('\n');
    let consumed = 0;
    for (const line of lines) {
      if (line.trim() !== '' && !/^[ \t]/.test(line)) break;
      consumed += line.length + 1;
    }
    return Math.min(i + 1 + consumed, text.length);
  }

  const nl = text.indexOf('\n', start);
  const end = nl < 0 ? text.length : nl;
  // A plain scalar keeps no trailing spaces; leave them outside the span so a
  // rewrite cannot silently strip or duplicate them.
  let e = end;
  while (e > start && (text[e - 1] === ' ' || text[e - 1] === '\t')) e -= 1;
  return e;
}

const dq = (s: string) =>
  `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;

/** Re-encode in the style already at `raw`, so a round trip changes nothing. */
export function encodeLike(raw: string, value: FrontmatterValue): string {
  if (Array.isArray(value)) return `[${value.map(dq).join(', ')}]`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);

  const quoted = raw.startsWith('"') || raw.startsWith("'");
  if (!value.includes('\n')) {
    // Bare only where the parser reads back exactly this string. `true`, `123`
    // and `null` are otherwise a boolean, a number and nothing at all, and
    // `z.string()` rejects each of them - a post titled 123 would fail the
    // build rather than be called 123.
    const safe =
      !quoted &&
      !/^[\s"'\[{|>&*#!%@`]|[:#]\s|[:\s]$/.test(value) &&
      readSpan('v', value) === value;
    return safe ? value : dq(value);
  }
  // Newlines survive only in a block scalar. `|-` keeps them and drops the
  // trailing one, which is what a multi-line field means.
  const indented = value
    .split('\n')
    .map((l) => (l === '' ? '' : `  ${l}`))
    .join('\n');
  return `|-\n${indented}`;
}

/**
 * A value for a block that does not exist yet.
 *
 * Writing one by hand into a template is how a two-line excerpt becomes a
 * double-quoted scalar spanning two lines, which YAML folds back into one: the
 * owner types a line break and the site never sees it.
 */
export const encodeValue = (value: FrontmatterValue): string => encodeLike('', value);

/** What the parser reads back from an isolated value span. */
export function readSpan(key: string, raw: string): unknown {
  try {
    return (load(`${key}: ${raw}`) as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

/* ------------------------------- whole lines -------------------------------- */

function lineStart(text: string, key: string): number {
  const m = new RegExp('^' + escapeRe(key) + ':', 'm').exec(text);
  if (!m) throw new Error(`no such frontmatter field: ${key}`);
  return m.index;
}

/** Just past a key's last line, including its newline where it has one. */
function lineEnd(text: string, key: string): number {
  const [, end] = fieldRange(text, key);
  // A block scalar's span already runs past its final newline.
  if (end > 0 && text[end - 1] === '\n') return end;
  const nl = text.indexOf('\n', end);
  return nl < 0 ? text.length : nl + 1;
}

function insertionPoint(text: string, key: string, order: readonly string[]): number {
  const present = new Set(fieldNames(text));
  const at = order.indexOf(key);
  if (at >= 0) {
    for (let i = at - 1; i >= 0; i -= 1) if (present.has(order[i])) return lineEnd(text, order[i]);
    for (let i = at + 1; i < order.length; i += 1) if (present.has(order[i])) return lineStart(text, order[i]);
  }
  return text.length;
}

/** The block carries no trailing newline, so its end is a case of its own. */
function insertField(
  text: string,
  key: string,
  value: FrontmatterValue,
  order: readonly string[],
): string {
  const line = `${key}: ${encodeLike('', value)}`;
  const at = insertionPoint(text, key, order);
  return at >= text.length
    ? `${text}\n${line}`
    : `${text.slice(0, at)}${line}\n${text.slice(at)}`;
}

const splice = (source: string, fm: Frontmatter, text: string): string =>
  source.slice(0, fm.offset) + text + source.slice(fm.offset + fm.text.length);

export function setField(
  source: string,
  key: string,
  value: FrontmatterValue,
  options: WriteOptions = {},
): string {
  const fm = parseFrontmatter(source);
  const start = valueStart(fm.text, key);
  if (start === null) {
    return splice(source, fm, insertField(fm.text, key, value, options.order ?? []));
  }

  const end = valueEnd(fm.text, start);
  const raw = fm.text.slice(start, end);

  // A write that does not change the value must not change bytes. This is not
  // an optimisation: js-yaml folds a multi-line scalar's newlines into spaces,
  // so re-encoding what it read would collapse `voice.mdx`'s summary onto one
  // line and silently reformat copy nobody asked to touch.
  if (JSON.stringify(readSpan(key, raw)) === JSON.stringify(value)) return source;

  return splice(source, fm, fm.text.slice(0, start) + encodeLike(raw, value) + fm.text.slice(end));
}

export function removeField(source: string, key: string): string {
  const fm = parseFrontmatter(source);
  if (valueStart(fm.text, key) === null) return source;
  const cut = fm.text.slice(0, lineStart(fm.text, key)) + fm.text.slice(lineEnd(fm.text, key));
  return splice(source, fm, cut.replace(/\n$/, ''));
}

/** `undefined` removes the key: an optional field with no value is not there. */
export function setFields(
  source: string,
  edits: Array<{ key: string; value: FrontmatterValue | undefined }>,
  options: WriteOptions = {},
): string {
  let out = source;
  for (const { key, value } of edits) {
    out = value === undefined ? removeField(out, key) : setField(out, key, value, options);
  }
  return out;
}

/** Field names present, in source order - the owner's form follows the file. */
export function fieldNames(text: string): string[] {
  return [...text.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]);
}
