/**
 * The video manifest, read - gallery.ts's counterpart, and its own module for
 * the same reason: only it needs a TOML parser, which the store would
 * otherwise carry into the first bytes the owner downloads.
 */
import { parse as parseToml } from 'smol-toml';

export interface VideoEntry {
  id: string;
  /** Site-absolute, e.g. "/video/voice-opening-session.mp4". */
  file: string;
  title: string;
  description?: string;
  /** Site-absolute path of a WebVTT file. */
  captions?: string;
  /** An image id from images.toml, shown instead of a frame. */
  poster?: string;
  /** Seconds into the video the poster frame is taken from. */
  posterTime?: number;
  date: string;
}

export function parseVideos(source: string): VideoEntry[] {
  const data = parseToml(source) as Record<string, Record<string, unknown>>;
  return Object.entries(data).map(([id, entry]) => ({
    id,
    file: String(entry.file ?? ''),
    title: String(entry.title ?? ''),
    description: typeof entry.description === 'string' ? entry.description : undefined,
    captions: typeof entry.captions === 'string' ? entry.captions : undefined,
    poster: typeof entry.poster === 'string' ? entry.poster : undefined,
    posterTime: typeof entry.poster_time === 'number' ? entry.poster_time : undefined,
    date: String(entry.date ?? ''),
  }));
}
