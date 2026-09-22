/**
 * Structural TOML edits - adding, removing and reordering whole entries,
 * which toml-edit's value splices cannot express.
 *
 * `images.toml` carries owner comments, so entries are appended and never
 * rewritten. `recommendations.toml` has none, which is what lets its blocks be
 * cut and recomposed for drag-to-reorder; if a comment is ever added to that
 * file this approach has to change, and the round-trip gate will say so.
 */
import { parseTOML } from 'toml-eslint-parser';

export interface ImageEntry {
  id: string;
  /** Site-absolute path under public/, e.g. "/img/content/x.jpg". */
  file: string;
  alt: string;
}

export interface RecommendationEntry {
  id: string;
  screenshot: string;
  alt: string;
  transcription: string;
  relatedTherapies: string[];
  active: boolean;
}

const basic = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** `"""` so a transcription keeps the line breaks the visitor wrote. */
const multiline = (s: string) =>
  `"""${s.replace(/\\/g, '\\\\').replace(/"""/g, '\\"""')}"""`;

const endsWithNewline = (s: string) => s.length === 0 || s.endsWith('\n');

export function renderImageEntry(entry: ImageEntry): string {
  // `alt` is padded to align with `file`, matching every entry already there.
  return `[${entry.id}]\nfile = ${basic(entry.file)}\nalt  = ${basic(entry.alt)}\n`;
}

export function appendImage(src: string, entry: ImageEntry): string {
  if (imageIds(src).includes(entry.id)) throw new Error(`image id in use: ${entry.id}`);
  const gap = endsWithNewline(src) ? (src.endsWith('\n\n') ? '' : '\n') : '\n\n';
  return src + gap + renderImageEntry(entry);
}

export function imageIds(src: string): string[] {
  const top = parseTOML(src).body[0] as any;
  return top.body
    .filter((n: any) => n.type === 'TOMLTable' && n.kind === 'standard')
    .map((n: any) => String(n.resolvedKey[0]));
}

/**
 * Remove one image entry, taking the blank line that separated it. The header
 * comments and every other entry keep their exact bytes.
 */
export function removeImage(src: string, id: string): string {
  const top = parseTOML(src).body[0] as any;
  const tables = top.body.filter((n: any) => n.type === 'TOMLTable' && n.kind === 'standard');
  const at = tables.findIndex((t: any) => String(t.resolvedKey[0]) === id);
  if (at < 0) throw new Error(`no such image: ${id}`);

  const start = tables[at].range[0];
  const end = at + 1 < tables.length ? tables[at + 1].range[0] : src.length;
  const joined = src.slice(0, start) + src.slice(end);
  // Removing a block leaves the blank line that separated it on both sides.
  return joined.replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n');
}

export function renderRecommendationEntry(entry: RecommendationEntry): string {
  return [
    '[[recommendations]]',
    `id = ${basic(entry.id)}`,
    `screenshot = ${basic(entry.screenshot)}`,
    `alt = ${basic(entry.alt)}`,
    `transcription = ${multiline(entry.transcription)}`,
    `relatedTherapies = [${entry.relatedTherapies.map(basic).join(', ')}]`,
    `active = ${entry.active ? 'true' : 'false'}`,
    '',
  ].join('\n');
}

interface Block {
  id: string;
  /** Source text including the separator that follows it. */
  text: string;
}

/**
 * Each `[[recommendations]]` block, from its header to the start of the next -
 * so the blank line between them travels with the block above and a reorder
 * cannot collapse two blocks together.
 */
function recommendationBlocks(src: string): { blocks: Block[]; head: string } {
  const top = parseTOML(src).body[0] as any;
  const tables = top.body.filter(
    (n: any) => n.type === 'TOMLTable' && n.kind === 'array',
  );
  if (!tables.length) return { blocks: [], head: src };

  const head = src.slice(0, tables[0].range[0]);
  const blocks: Block[] = tables.map((t: any, i: number) => {
    const end = i + 1 < tables.length ? tables[i + 1].range[0] : src.length;
    const idKv = t.body.find((kv: any) => kv.key.keys[0].name === 'id');
    return { id: String(idKv?.value.value ?? i), text: src.slice(t.range[0], end) };
  });
  return { blocks, head };
}

export function recommendationIds(src: string): string[] {
  return recommendationBlocks(src).blocks.map((b) => b.id);
}

/** Blocks separate cleanly only if each ends in a blank line; normalise once. */
const withSeparator = (text: string, last: boolean): string => {
  const body = text.replace(/\s*$/, '');
  return last ? `${body}\n` : `${body}\n\n`;
};

export function appendRecommendation(src: string, entry: RecommendationEntry): string {
  if (recommendationIds(src).includes(entry.id)) {
    throw new Error(`recommendation id in use: ${entry.id}`);
  }
  const { blocks, head } = recommendationBlocks(src);
  const next = [...blocks.map((b) => b.text), renderRecommendationEntry(entry)];
  return head + next.map((t, i) => withSeparator(t, i === next.length - 1)).join('');
}

/** `order` is the full list of ids in their new order. */
export function reorderRecommendations(src: string, order: string[]): string {
  const { blocks, head } = recommendationBlocks(src);
  const ids = blocks.map((b) => b.id);
  if (order.length !== ids.length || !ids.every((id) => order.includes(id))) {
    throw new Error('reorder must list every id exactly once');
  }
  const byId = new Map(blocks.map((b) => [b.id, b.text]));
  const next = order.map((id) => byId.get(id)!);
  return head + next.map((t, i) => withSeparator(t, i === next.length - 1)).join('');
}

export function deleteRecommendation(src: string, id: string): string {
  const { blocks, head } = recommendationBlocks(src);
  if (!blocks.some((b) => b.id === id)) throw new Error(`no such recommendation: ${id}`);
  const next = blocks.filter((b) => b.id !== id).map((b) => b.text);
  return head + next.map((t, i) => withSeparator(t, i === next.length - 1)).join('');
}

/** The next free `recommendation-NN`, so the owner never invents an id. */
export function nextRecommendationId(src: string): string {
  const used = recommendationIds(src)
    .map((id) => /^recommendation-(\d+)$/.exec(id)?.[1])
    .filter(Boolean)
    .map((n) => Number(n));
  const next = (used.length ? Math.max(...used) : 0) + 1;
  return `recommendation-${String(next).padStart(2, '0')}`;
}
