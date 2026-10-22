import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { loadToml } from './content';
import { imageSources } from './images';

/**
 * What SoftVideo renders, resolved at build time from videos.toml and the
 * manifest scripts/optimize-videos.mjs writes. This is the only place video
 * derivative URLs are constructed.
 *
 * A source whose digest no longer matches its manifest entry plays as the
 * original, as images.ts serves a photo: correct at once, unoptimised until
 * `pnpm videos` rebuilds it, locally or in the images workflow. That workflow
 * never runs for the content-preview branch, so every
 * video the owner previews before publishing takes this path - which is why
 * its shape is read from the file's own header instead of being guessed: a
 * portrait video previewed in a landscape box looks broken, not unoptimised.
 */

const videoSchema = z.object({
  file: z.string().startsWith('/video/'),
  title: z.string().min(1),
  description: z.string().optional(),
  captions: z.string().startsWith('/video/').optional(),
  /** An image id from images.toml, shown instead of a frame. */
  poster: z.string().optional(),
  poster_time: z.number().nonnegative().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const imagesSchema = z.record(z.string(), z.object({ file: z.string(), alt: z.string() }));

export interface Video {
  id: string;
  title: string;
  description?: string;
  /** Public path of a WebVTT file that exists. */
  captions?: string;
  /** YYYY-MM-DD. */
  date: string;
  width: number;
  height: number;
  /** Seconds; unknown only for an original whose header could not be read. */
  duration?: number;
  audio: boolean;
  /** In preference order. A fallback original carries no type: browsers sniff it. */
  sources: Array<{ src: string; type?: string }>;
  poster?: { avif: string; webp: string; src: string; width: number; height: number };
  /** Without a poster image yet, the frame the video itself shows, by media fragment. */
  posterTime?: number;
  /** JPEG URL of the poster, for VideoObject. */
  thumbnail?: string;
}

interface ManifestEntry {
  key: string;
  digest: string;
  width: number;
  height: number;
  duration: number;
  audio: boolean;
  renditions: Array<{ file: string; type: string; bytes: number }>;
  poster?: { spec: string; digest: string; time: number; widths: number[] };
}

const MANIFEST_PATH = 'public/video/_opt/manifest.json';

/** scripts/optimize-videos.mjs writes the same strings - keep the two in step. */
const derivativeUrl = (file: string): string => `/video/_opt/${file}`;
const posterUrl = (entry: ManifestEntry, width: number, ext: 'avif' | 'webp' | 'jpg'): string =>
  derivativeUrl(`${entry.key}-poster-${width}.${entry.poster!.digest}.${ext}`);

/** The poster a manifest entry was built for, in the form the script names it. */
function posterSpec(entry: z.infer<typeof videoSchema>): string | null {
  if (entry.poster) return null;
  return typeof entry.poster_time === 'number' ? `t=${entry.poster_time.toFixed(3)}` : 'auto';
}

let entries: Record<string, z.infer<typeof videoSchema>> | null = null;
let images: z.infer<typeof imagesSchema> | null = null;
let manifest: Record<string, ManifestEntry> | null = null;
const sourceDigests = new Map<string, string | null>();

const publicFile = (publicPath: string): string =>
  resolve(process.cwd(), 'public', publicPath.replace(/^\//, ''));

function loadManifest(): Record<string, ManifestEntry> {
  if (manifest) return manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(process.cwd(), MANIFEST_PATH), 'utf-8'));
  } catch {
    manifest = {};
  }
  return manifest!;
}

/** First 16 hex of the source's sha256, or null when it cannot be read. Once per file. */
function digestOf(publicPath: string, bytes?: Buffer): string | null {
  if (sourceDigests.has(publicPath)) return sourceDigests.get(publicPath)!;
  let digest: string | null = null;
  try {
    const buf = bytes ?? readFileSync(publicFile(publicPath));
    // A view, as in images.ts: createHash rejects Buffer's loose typing.
    digest = createHash('sha256')
      .update(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength))
      .digest('hex')
      .slice(0, 16);
  } catch {
    digest = null;
  }
  sourceDigests.set(publicPath, digest);
  return digest;
}

/**
 * Display size and duration from an MP4 or QuickTime header - what every phone
 * records - for the original that has no manifest entry yet.
 *
 * The track header holds the stored size and a matrix; a phone stores portrait
 * as landscape plus a quarter turn, which is when the matrix's diagonal is
 * zero. Anything else returns null and the caller assumes 16:9.
 */
export function probeIsoBmff(buf: Buffer): { width: number; height: number; duration?: number } | null {
  let duration: number | undefined;
  let size: { width: number; height: number } | null = null;

  const walk = (start: number, end: number, depth: number): void => {
    let at = start;
    while (at + 8 <= end && !(size && duration !== undefined)) {
      let boxSize = buf.readUInt32BE(at);
      const type = buf.toString('latin1', at + 4, at + 8);
      let header = 8;
      if (boxSize === 1) {
        boxSize = Number(buf.readBigUInt64BE(at + 8));
        header = 16;
      } else if (boxSize === 0) {
        boxSize = end - at;
      }
      if (boxSize < header || at + boxSize > end) return;
      const body = at + header;

      if (type === 'moov' || type === 'trak') {
        if (depth < 2) walk(body, at + boxSize, depth + 1);
      } else if (type === 'mvhd') {
        const v1 = buf[body] === 1;
        const timescale = buf.readUInt32BE(body + (v1 ? 20 : 12));
        const units = v1 ? Number(buf.readBigUInt64BE(body + 24)) : buf.readUInt32BE(body + 16);
        if (timescale > 0) duration = units / timescale;
      } else if (type === 'tkhd' && !size) {
        const matrix = body + (buf[body] === 1 ? 52 : 40);
        const width = buf.readUInt32BE(matrix + 36) / 65536;
        const height = buf.readUInt32BE(matrix + 40) / 65536;
        // Audio tracks are 0x0; the first track with a picture is the video.
        if (width > 0 && height > 0) {
          const a = buf.readInt32BE(matrix);
          const d = buf.readInt32BE(matrix + 16);
          const quarterTurn = a === 0 && d === 0;
          size = quarterTurn ? { width: height, height: width } : { width, height };
        }
      }
      at += boxSize;
    }
  };

  try {
    walk(0, buf.length, 0);
  } catch {
    return null;
  }
  return size ? { ...(size as { width: number; height: number }), duration } : null;
}

function load(): Record<string, z.infer<typeof videoSchema>> {
  entries ??= loadToml('videos.toml', z.record(z.string(), videoSchema));
  return entries;
}

let instances = 0;

/** A page-unique element id, for a video that can appear twice on a page. */
export const instanceId = (id: string): string => `video-${id}-${(instances += 1)}`;

const resolved = new Map<string, Video | null>();

/**
 * When videos.toml or the manifest last changed. A dev server outlives both:
 * `pnpm videos` prunes the poster a cached entry still names, and that
 * poster would 404 until a restart.
 */
const inputsChanged = (): string =>
  ['src/content/videos.toml', MANIFEST_PATH]
    .map((path) => {
      try {
        return statSync(resolve(process.cwd(), path)).mtimeMs;
      } catch {
        return 0;
      }
    })
    .join(':');
let resolvedAt = '';

/** Null for an unknown id or a missing file, which the caller renders as nothing. */
export function video(id: string): Video | null {
  if (import.meta.env.DEV) {
    const now = inputsChanged();
    if (now !== resolvedAt) {
      resolvedAt = now;
      entries = null;
      manifest = null;
      resolved.clear();
      sourceDigests.clear();
    }
  }
  if (!resolved.has(id)) resolved.set(id, resolveVideo(id));
  return resolved.get(id)!;
}

function resolveVideo(id: string): Video | null {
  const entry = load()[id];
  if (!entry) return null;

  const captions = entry.captions && existsSync(publicFile(entry.captions)) ? entry.captions : undefined;
  if (entry.captions && !captions) {
    console.warn(`[videos] ${id}: captions file ${entry.captions} is missing - rendering without it.`);
  }

  const base = {
    id,
    title: entry.title,
    description: entry.description?.trim() || undefined,
    captions,
    date: entry.date,
  };

  let bytes: Buffer | undefined;
  try {
    bytes = readFileSync(publicFile(entry.file));
  } catch {
    console.warn(`[videos] ${id}: ${entry.file} is missing - not rendered.`);
    return null;
  }

  const galleryPoster = entry.poster ? galleryPosterFor(entry.poster) : undefined;
  const optimised = loadManifest()[entry.file];
  const fresh = optimised && optimised.digest === digestOf(entry.file, bytes);

  if (fresh) {
    const spec = posterSpec(entry);
    const framePoster = spec !== null && optimised.poster?.spec === spec ? optimised : undefined;
    const widths = framePoster?.poster?.widths ?? [];
    const srcset = (ext: 'avif' | 'webp') =>
      widths.map((w) => `${posterUrl(optimised, w, ext)} ${w}w`).join(', ');
    const jpg = framePoster ? posterUrl(optimised, widths.at(-1)!, 'jpg') : undefined;

    if (spec !== null && !framePoster) {
      console.warn(
        `[videos] ${id}: its poster frame changed since it was built - showing the ` +
          "video's own frame until `pnpm videos` rebuilds it (CI does, on push to master).",
      );
    }

    const poster =
      galleryPoster ??
      (framePoster && jpg
        ? { avif: srcset('avif'), webp: srcset('webp'), src: jpg, width: optimised.width, height: optimised.height }
        : undefined);
    return {
      ...base,
      width: optimised.width,
      height: optimised.height,
      duration: optimised.duration,
      audio: optimised.audio,
      sources: optimised.renditions.map((r) => ({ src: derivativeUrl(r.file), type: r.type })),
      poster,
      posterTime: poster ? undefined : (entry.poster_time ?? optimised.poster?.time ?? 0),
      thumbnail: poster?.src,
    };
  }

  if (optimised) {
    console.warn(
      `[videos] ${entry.file} has changed since it was optimised - serving the ` +
        'original until `pnpm videos` rebuilds it (CI does, on push to master).',
    );
  }
  const header = probeIsoBmff(bytes);
  return {
    ...base,
    width: header?.width ?? 16,
    height: header?.height ?? 9,
    duration: header?.duration,
    audio: true,
    sources: [{ src: entry.file }],
    poster: galleryPoster,
    posterTime: galleryPoster ? undefined : (entry.poster_time ?? 0),
    thumbnail: galleryPoster?.src,
  };
}

function galleryPosterFor(imageId: string): Video['poster'] {
  images ??= loadToml('images.toml', imagesSchema);
  const image = images[imageId];
  if (!image) {
    console.warn(`[videos] poster image ${imageId} is not in images.toml - using a frame instead.`);
    return undefined;
  }
  const { avif, webp, width, height } = imageSources(image.file);
  return { avif, webp, src: image.file, width: width ?? 0, height: height ?? 0 };
}
