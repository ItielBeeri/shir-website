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
 */
import { load } from 'js-yaml';

export type FrontmatterValue = string | number | boolean | string[];

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export interface Frontmatter {
  /** The whole block including both fences, exactly as written. */
  raw: string;
  /** Just the YAML between the fences. */
  text: string;
  data: Record<string, unknown>;
}

export function parseFrontmatter(source: string): Frontmatter {
  const m = source.match(FENCE);
  if (!m) throw new Error('no frontmatter');
  const data = load(m[1]);
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('frontmatter is not a mapping');
  }
  return { raw: m[0], text: m[1], data: data as Record<string, unknown> };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Offsets of a key's value within the frontmatter text. */
export function fieldRange(text: string, key: string): [number, number] {
  const re = new RegExp('^' + escapeRe(key) + ':[ \\t]*', 'm');
  const m = re.exec(text);
  if (!m) throw new Error(`no such frontmatter field: ${key}`);
  const start = m.index + m[0].length;
  return [start, valueEnd(text, start)];
}

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
    // An unquoted scalar that would now need quoting gets them; one that
    // already had them keeps them.
    if (!quoted && !/^[\s"'\[{|>&*#!%@`]|[:#]\s|[:\s]$/.test(value)) return value;
    return dq(value);
  }
  // Newlines survive only in a block scalar. `|-` keeps them and drops the
  // trailing one, which is what a multi-line field means.
  const indented = value
    .split('\n')
    .map((l) => (l === '' ? '' : `  ${l}`))
    .join('\n');
  return `|-\n${indented}`;
}

/** What the parser reads back from an isolated value span. */
export function readSpan(key: string, raw: string): unknown {
  try {
    return (load(`${key}: ${raw}`) as Record<string, unknown>)[key];
  } catch {
    return undefined;
  }
}

export function setField(source: string, key: string, value: FrontmatterValue): string {
  const fm = parseFrontmatter(source);
  const [start, end] = fieldRange(fm.text, key);
  const raw = fm.text.slice(start, end);

  // A write that does not change the value must not change bytes. This is not
  // an optimisation: js-yaml folds a multi-line scalar's newlines into spaces,
  // so re-encoding what it read would collapse `voice.mdx`'s summary onto one
  // line and silently reformat copy nobody asked to touch.
  if (JSON.stringify(readSpan(key, raw)) === JSON.stringify(value)) return source;

  const text = fm.text.slice(0, start) + encodeLike(raw, value) + fm.text.slice(end);
  return source.slice(0, fm.raw.length).replace(fm.text, text) + source.slice(fm.raw.length);
}

export function setFields(
  source: string,
  edits: Array<{ key: string; value: FrontmatterValue }>,
): string {
  let out = source;
  for (const { key, value } of edits) out = setField(out, key, value);
  return out;
}

/** Field names present, in source order - the owner's form follows the file. */
export function fieldNames(text: string): string[] {
  return [...text.matchAll(/^([A-Za-z_][\w-]*):/gm)].map((m) => m[1]);
}
