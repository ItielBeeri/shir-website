/**
 * The video library: naming a new file, carrying it to GitHub in pieces,
 * caption files, posters, and knowing what still uses a video.
 *
 * Nothing here re-encodes. A phone video cannot be shrunk well in a browser,
 * and it does not need to be: the images workflow builds what the site plays
 * (scripts/optimize-videos.mjs). The original is what the owner chose, minus
 * the place it was filmed.
 */
import { api } from '../api';
import { VIDEO_DIR, VIDEO_UPLOAD } from '../git/paths';
import { bytesToBase64, formatBytes } from './images';

export type { VideoEntry } from '../content/videos';

const EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-m4v': 'm4v',
};

/** The extension a file will be stored under, or null for one the site cannot play. */
export function videoExtension(file: Pick<File, 'name' | 'type'>): string | null {
  const byName = /\.(mp4|m4v|mov|webm)$/i.exec(file.name)?.[1].toLowerCase();
  return byName ?? EXTENSIONS[file.type] ?? null;
}

/** Why a file cannot be added, in Hebrew, or null when it can. */
export function whyVideoRejected(file: Pick<File, 'name' | 'type' | 'size'>): string | null {
  if (!videoExtension(file)) {
    return 'אפשר להעלות כאן רק סרטון (mp4, mov או webm). את הקובץ הזה האתר לא יודע להציג.';
  }
  if (file.size > VIDEO_UPLOAD.maxBytes) {
    // First-strong isolates: in a Hebrew sentence "52.0 MB" would read "MB 52.0".
    const size = (bytes: number): string => `⁨${formatBytes(bytes)}⁩`;
    return (
      `הסרטון שוקל ${size(file.size)}, והאתר מקבל עד ${size(VIDEO_UPLOAD.maxBytes)}. ` +
      'אפשר לקצר אותו, או לשלוח אותו לעצמך בוואטסאפ ולהעלות את מה שהתקבל - הוא יוצא קטן בהרבה.'
    );
  }
  return null;
}

/** Latin, lowercase, hyphenated, unique among `taken` - the id and the file name both. */
export function videoIdFor(original: string, taken: ReadonlySet<string>): string {
  const stem = original
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const base = stem || `video-${new Date().toISOString().slice(0, 10)}`;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

export const videoPathFor = (id: string, extension: string): string => `${VIDEO_DIR}${id}.${extension}`;

export const captionsPathFor = (id: string): string => `${VIDEO_DIR}${id}.he.vtt`;

/**
 * The place a phone wrote into its video, made unreadable without moving a
 * byte: the boxes that hold it are renamed `free`, which every player skips.
 * The original is served from /video/ until the site's own copy is built,
 * and a therapist's home should not be one right-click away.
 *
 * Only the static metadata of an MP4 or QuickTime file - `udta` and `meta`
 * under `moov` and under each track, where iPhones and Android cameras keep
 * the coordinates. Renamed in place, so no offset into the media changes.
 */
export function eraseRecordedPlace(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const type = (at: number): string => String.fromCharCode(...bytes.subarray(at + 4, at + 8));
  let erased = 0;

  const walk = (start: number, end: number, depth: number): void => {
    let at = start;
    while (at + 8 <= end) {
      let size = view.getUint32(at);
      let header = 8;
      if (size === 1) {
        size = Number(view.getBigUint64(at + 8));
        header = 16;
      } else if (size === 0) {
        size = end - at;
      }
      if (size < header || at + size > end) return;
      const name = type(at);
      if (depth > 0 && (name === 'udta' || name === 'meta')) {
        bytes.set([0x66, 0x72, 0x65, 0x65], at + 4); // "free"
        erased += 1;
      } else if (name === 'moov' || (depth === 1 && name === 'trak')) {
        walk(at + header, at + size, depth + 1);
      }
      at += size;
    }
  };

  walk(0, bytes.length, 0);
  return erased;
}

/**
 * Carry a video to GitHub a piece at a time, each piece a blob of its own,
 * and return the pieces' shas for the save that joins them. Two travel at
 * once: faster on a phone's connection than one, and kinder than all of them.
 */
export async function uploadInPieces(
  bytes: Uint8Array,
  onProgress: (sent: number, total: number) => void,
): Promise<string[]> {
  const size = VIDEO_UPLOAD.chunkBytes;
  const count = Math.ceil(bytes.length / size);
  const shas: string[] = new Array(count);
  let sent = 0;
  onProgress(0, bytes.length);

  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < count) {
      const i = next;
      next += 1;
      const piece = bytes.subarray(i * size, Math.min(bytes.length, (i + 1) * size));
      shas[i] = (await api.chunk(bytesToBase64(piece))).sha;
      sent += piece.length;
      onProgress(sent, bytes.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return shas;
}

/**
 * Captions as WebVTT, from WebVTT or SubRip - SRT is what most captioning
 * tools hand back. Null when the file holds no timed line at all, which is
 * what a wrong file looks like.
 */
export function toWebVtt(text: string): string | null {
  const unified = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  const timing = /(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}/;
  if (!timing.test(unified)) return null;
  if (/^WEBVTT\b/.test(unified)) return `${unified}\n`;
  // SubRip writes a comma before the milliseconds; WebVTT a full stop.
  const body = unified.replace(
    /(\d{1,2}:\d{2}:\d{2}),(\d{3})(\s*-->\s*)(\d{1,2}:\d{2}:\d{2}),(\d{3})/g,
    '$1.$2$3$4.$5',
  );
  return `WEBVTT\n\n${body}\n`;
}

/** How long a video is, in words she reads: "0:33", "2:05". */
export function clock(seconds: number): string {
  const t = Math.max(0, Math.floor(seconds));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** What a video's metadata says about it, read by the browser. */
export function readVideo(url: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () =>
      resolve({ width: video.videoWidth, height: video.videoHeight, duration: video.duration });
    video.onerror = () => reject(new Error('unreadable video'));
    video.src = url;
  });
}

/** Where a video id is used, so a delete can explain itself instead of breaking a page. */
export function findVideoUsage(
  id: string,
  files: Array<{ path: string; label: string; content: string }>,
): Array<{ where: string; path: string }> {
  const pattern = /<SoftVideo[^>]*\bid=["']([^"']+)["']/g;
  return files
    .filter((file) => [...file.content.matchAll(pattern)].some((m) => m[1] === id))
    .map((file) => ({ where: file.label, path: file.path }));
}

/** One row of public/video/_opt/manifest.json, written by scripts/optimize-videos.mjs. */
export interface VideoDerivative {
  key: string;
  digest: string;
  width: number;
  height: number;
  duration: number;
  audio: boolean;
  renditions: Array<{ file: string; type: string; bytes: number }>;
  poster?: { spec: string; digest: string; time: number; widths: number[] };
}

export type VideoDerivatives = Record<string, VideoDerivative>;

/** scripts/optimize-videos.mjs writes the same spec - keep the two in step. */
export const posterSpec = (entry: { poster?: string; posterTime?: number }): string | null =>
  entry.poster ? null : typeof entry.posterTime === 'number' ? `t=${entry.posterTime.toFixed(3)}` : 'auto';

/** The built poster of a settled video, at about `want` px, or null. */
export function posterFor(
  derivatives: VideoDerivatives | null,
  entry: { file: string; poster?: string; posterTime?: number },
  want: number,
): string | null {
  const built = derivatives?.[entry.file];
  if (!built?.poster || built.poster.spec !== posterSpec(entry)) return null;
  const widths = built.poster.widths;
  const width = widths.find((w) => w >= want * 2) ?? widths[widths.length - 1];
  return `/video/_opt/${built.key}-poster-${width}.${built.poster.digest}.webp`;
}
