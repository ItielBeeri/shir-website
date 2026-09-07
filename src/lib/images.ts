import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Responsive sources for the images in public/img/.
 *
 * SoftImage renders a plain <img> out of public/ rather than going through
 * astro:assets, so Astro generates no modern formats and no srcset for us.
 * `scripts/optimize-images.mjs` fills that gap ahead of the build and writes
 * the manifest this module reads: for every source it records the intrinsic
 * size and the widths that were actually emitted into public/img/_opt/.
 *
 * Everything here degrades to nothing. An image with no manifest entry - one
 * just dropped in, before the images workflow has rebuilt - returns no sources
 * at all, and the callers fall back to the original <img src>. A missing
 * derivative is a missed optimisation, never a missing picture.
 *
 * The same holds for a *replaced* image, which matters more: a photo swapped
 * under a name that already has derivatives would otherwise keep serving the
 * old picture to every browser that takes AVIF, and that is precisely the
 * state of the repository between the commit that uploads it and the one the
 * workflow pushes back. Each entry therefore carries a digest of the source it
 * was built from, and an entry whose source no longer matches is ignored.
 * Wrong-but-fast is the one failure mode not on offer.
 */

export interface ImageSources {
  /** srcset for <source type="image/avif">, empty when unavailable. */
  avif: string;
  /** srcset for <source type="image/webp">, empty when unavailable. */
  webp: string;
  /** Intrinsic pixel size of the original - lets callers set width/height. */
  width?: number;
  height?: number;
}

interface ManifestEntry {
  key: string;
  width: number;
  height: number;
  widths: number[];
  /**
   * First 16 hex of the sha256 of the source the derivatives were built from.
   * Used twice: to spot a source that has changed since (see currentEntry) and
   * as part of every derivative's filename, which is what lets vercel.json
   * serve _opt/ as immutable.
   */
  digest: string;
}

/**
 * The one place a derivative's path is spelled out on this side.
 * scripts/optimize-images.mjs writes the same string - keep the two in step.
 */
function derivativeUrl(entry: ManifestEntry, width: number, ext: 'avif' | 'webp'): string {
  return `/img/_opt/${entry.key}-${width}.${entry.digest}.${ext}`;
}

const MANIFEST_PATH = 'public/img/_opt/manifest.json';

let manifest: Record<string, ManifestEntry> | null = null;
/** publicPath -> "source no longer matches its derivatives". Hash each file once. */
const staleness = new Map<string, boolean>();

function load(): Record<string, ManifestEntry> {
  if (manifest) return manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(process.cwd(), MANIFEST_PATH), 'utf-8'));
  } catch {
    // No manifest yet - the site still builds and still renders every image.
    manifest = {};
  }
  return manifest!;
}

/**
 * The largest emitted derivative of each modern format, as a bare URL.
 *
 * For a full-bleed `object-fit: cover` layer, srcset is the wrong tool: the
 * box is portrait and the photograph landscape, so the rendered image is
 * roughly 2.3x the viewport's *height* wide - about 1968px on a phone and
 * 2098px on a 1440px desktop. Every viewport therefore wants the source at its
 * native width, and a `sizes` hint expressed in viewport widths would quietly
 * hand a phone a 400px file to stretch fivefold. One full-size AVIF, at ~27 KB
 * against the 401 KB JPEG, is both simpler and sharper.
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

/**
 * A CSS `image-set()` for a public path, for the few places a decorative
 * backdrop genuinely wants a CSS background rather than an <img>.
 *
 * `preferredWidth` snaps to the nearest emitted width at or above it. Returns
 * a plain `url()` of the original when there are no derivatives, so the
 * declaration is always valid.
 */
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

/**
 * Build the AVIF and WebP srcsets for a public path such as
 * "/img/content/portrait-2.jpeg".
 */
/**
 * The manifest entry for a source, or undefined when there is none or when the
 * source has changed since the derivatives were built.
 */
function currentEntry(publicPath: string): ManifestEntry | undefined {
  const entry = load()[publicPath];
  if (!entry) return undefined;

  const cached = staleness.get(publicPath);
  if (cached !== undefined) return cached ? undefined : entry;

  let stale = true;
  try {
    const buf = readFileSync(resolve(process.cwd(), 'public', publicPath.replace(/^\//, '')));
    // A view rather than the Buffer itself: @types/node types Buffer's backing
    // store loosely enough that createHash rejects it under strict settings.
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
