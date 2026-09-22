/**
 * The image gallery: reading the manifest, naming new files, shrinking what
 * the owner picks, and knowing what is still in use.
 *
 * Ids are generated, never typed. The owner chooses images by looking at them,
 * so the id is an implementation detail she should never meet - which is also
 * what makes the guide's "register it in the list" step disappear.
 */
import { parse as parseToml } from 'smol-toml';
import { IMAGE_DIRS } from '../git/paths';

export interface GalleryImage {
  id: string;
  /** Site-absolute, e.g. "/img/content/portrait-1.jpeg". */
  file: string;
  alt: string;
  credit?: string;
}

export function parseGallery(source: string): GalleryImage[] {
  const data = parseToml(source) as Record<string, { file: string; alt: string; credit?: string }>;
  return Object.entries(data).map(([id, entry]) => ({
    id,
    file: entry.file,
    alt: entry.alt,
    credit: entry.credit,
  }));
}

/**
 * Thumbnails come from raw.githubusercontent at the draft ref, so an image
 * committed a moment ago is visible before the site has rebuilt. The repo is
 * public, so no token travels with the request.
 */
export const rawUrl = (repo: string, ref: string, publicPath: string): string =>
  `https://raw.githubusercontent.com/${repo}/${ref}/public${publicPath}`;

/** Latin, lowercase, hyphenated - the filename never shows in the UI. */
export function fileNameFor(original: string, taken: ReadonlySet<string>): string {
  const stem = original
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const base = stem || `image-${new Date().toISOString().slice(0, 10)}`;
  let candidate = base;
  let n = 2;
  while (taken.has(candidate)) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

export interface ProcessedImage {
  /** Base64 without the data: prefix, ready for a git blob. */
  base64: string;
  /** Object URL for immediate display, before the commit lands. */
  previewUrl: string;
  width: number;
  height: number;
  bytes: number;
  originalBytes: number;
}

/** Long edge cap. Nothing on the site paints wider than ~1000 CSS px. */
const MAX_EDGE = 2048;
const QUALITY = 0.82;

/**
 * Shrink and re-encode in the browser, so a 6 MB phone photo does not travel
 * to GitHub or sit in the repository at full size. `createImageBitmap` with
 * `imageOrientation: 'from-image'` applies EXIF rotation, without which
 * portrait photos from a phone arrive sideways.
 */
export async function processImage(file: File): Promise<ProcessedImage> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no canvas context');
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', QUALITY),
  );
  if (!blob) throw new Error('could not encode image');

  const buffer = await blob.arrayBuffer();
  return {
    base64: bytesToBase64(new Uint8Array(buffer)),
    previewUrl: URL.createObjectURL(blob),
    width,
    height,
    bytes: blob.size,
    originalBytes: file.size,
  };
}

/** Chunked so a multi-megabyte image does not blow the argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export const imagePathFor = (fileName: string, kind: keyof typeof IMAGE_DIRS = 'content'): string =>
  `${IMAGE_DIRS[kind]}${fileName}.jpg`;

/** Where an id is used, so a delete can explain itself instead of breaking a page. */
export interface Usage {
  /** Hebrew description of the place, for the owner. */
  where: string;
  path: string;
}

const ID_PATTERNS = [
  /(?:hero_image|teaser_image|portrait_image|cover):\s*["']([^"']+)["']/g,
  /portrait\s*=\s*["']([^"']+)["']/g,
  /<SoftImage[^>]*\bid=["']([^"']+)["']/g,
];

export function findUsage(id: string, files: Array<{ path: string; label: string; content: string }>): Usage[] {
  const out: Usage[] = [];
  for (const file of files) {
    for (const pattern of ID_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of file.content.matchAll(pattern)) {
        if (match[1] === id) {
          out.push({ where: file.label, path: file.path });
          break;
        }
      }
    }
  }
  return out.filter((u, i) => out.findIndex((o) => o.path === u.path) === i);
}

export const formatBytes = (bytes: number): string =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;
