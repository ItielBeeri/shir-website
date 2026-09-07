import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Responsive sources for images under public/img/.
 *
 * SoftImage renders a plain <img> from public/, so Astro emits no modern
 * formats and no srcset; scripts/optimize-images.mjs writes both, plus the
 * manifest read here.
 *
 * A source whose digest no longer matches its manifest entry is ignored and
 * the caller falls back to the original <img src>. Without that, a photo
 * replaced under an existing name keeps serving the old derivatives to every
 * browser that takes AVIF, until the images workflow catches up.
 */

export interface ImageSources {
  /** srcset, empty when unavailable. */
  avif: string;
  webp: string;
  /** Intrinsic pixel size of the original. */
  width?: number;
  height?: number;
}

interface ManifestEntry {
  key: string;
  width: number;
  height: number;
  widths: number[];
  /**
   * First 16 hex of the source's sha256. Also part of every derivative's
   * filename, which is what lets vercel.json serve _opt/ as immutable.
   */
  digest: string;
}

/** scripts/optimize-images.mjs writes the same string - keep the two in step. */
function derivativeUrl(entry: ManifestEntry, width: number, ext: 'avif' | 'webp'): string {
  return `/img/_opt/${entry.key}-${width}.${entry.digest}.${ext}`;
}

const MANIFEST_PATH = 'public/img/_opt/manifest.json';

let manifest: Record<string, ManifestEntry> | null = null;
/** publicPath -> source no longer matches its derivatives. Hash each file once. */
const staleness = new Map<string, boolean>();

function load(): Record<string, ManifestEntry> {
  if (manifest) return manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(process.cwd(), MANIFEST_PATH), 'utf-8'));
  } catch {
    // No manifest yet - callers fall back to the originals.
    manifest = {};
  }
  return manifest!;
}

/**
 * Largest derivative of each format, as bare URLs.
 *
 * srcset is the wrong tool for a full-bleed `object-fit: cover` layer: the box
 * is portrait and the photo landscape, so the rendered width tracks the
 * viewport's *height* (~2.3x it) on every viewport, and a `sizes` hint in
 * viewport widths would hand a phone a 400px file to stretch fivefold.
 */
export function largestSources(publicPath: string): { avif: string; webp: string } {
  const entry = currentEntry(publicPath);
  if (!entry) return { avif: '', webp: '' };
  const w = entry.widths.at(-1)!;
  return {
    avif: derivativeUrl(entry, w, 'avif'),
    webp: derivativeUrl(entry, w, 'webp'),
  };
}

/** CSS `image-set()`, for the rare backdrop that wants a background over an <img>. */
export function imageSet(publicPath: string, preferredWidth: number): string {
  const entry = currentEntry(publicPath);
  if (!entry) return `url("${publicPath}")`;

  const w = entry.widths.find((candidate) => candidate >= preferredWidth) ?? entry.widths.at(-1)!;
  return [
    `url("${derivativeUrl(entry, w, 'avif')}") type("image/avif")`,
    `url("${derivativeUrl(entry, w, 'webp')}") type("image/webp")`,
    `url("${publicPath}") type("image/jpeg")`,
  ].join(', ');
}

/** The manifest entry for a source, or undefined when missing or stale. */
function currentEntry(publicPath: string): ManifestEntry | undefined {
  const entry = load()[publicPath];
  if (!entry) return undefined;

  const cached = staleness.get(publicPath);
  if (cached !== undefined) return cached ? undefined : entry;

  let stale = true;
  try {
    const buf = readFileSync(resolve(process.cwd(), 'public', publicPath.replace(/^\//, '')));
    // A view, not the Buffer itself: @types/node types Buffer's backing store
    // loosely enough that createHash rejects it under strict settings.
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    stale = createHash('sha256').update(bytes).digest('hex').slice(0, 16) !== entry.digest;
  } catch {
    stale = true;
  }

  staleness.set(publicPath, stale);
  if (stale) {
    console.warn(
      `[images] ${publicPath} has changed since its derivatives were built - ` +
        'serving the original until the images workflow rebuilds it.',
    );
  }
  return stale ? undefined : entry;
}

export function imageSources(publicPath: string): ImageSources {
  const entry = currentEntry(publicPath);
  if (!entry) return { avif: '', webp: '' };

  const srcset = (ext: 'avif' | 'webp') =>
    entry.widths.map((w) => `${derivativeUrl(entry, w, ext)} ${w}w`).join(', ');

  return {
    avif: srcset('avif'),
    webp: srcset('webp'),
    width: entry.width,
    height: entry.height,
  };
}
