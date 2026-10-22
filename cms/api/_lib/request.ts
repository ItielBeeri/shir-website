/**
 * What a save may carry, checked before anything reaches GitHub - including a
 * video, which arrives as the blob shas of its pieces and is joined here.
 */
import { VIDEO_DIR, VIDEO_UPLOAD, assertWritablePath } from '../../src/git/paths.js';

/**
 * A request that is wrong in itself, as opposed to one GitHub refused. The
 * distinction reaches the owner: an oversized image told her GitHub was
 * unreachable, which is neither true nor something she can act on.
 */
export class InvalidRequest extends Error {
  constructor(
    readonly code: string,
    readonly detail?: string,
  ) {
    super(detail ?? code);
    this.name = 'InvalidRequest';
  }
}

/** Base64 of 8 MB, plus slack. Vercel caps the body well below this anyway. */
const MAX_CONTENT = 12_000_000;
/** One piece of a video, as base64: four characters for every three bytes. */
export const MAX_CHUNK = Math.ceil(VIDEO_UPLOAD.chunkBytes / 3) * 4;
const MAX_CHUNKS = Math.ceil(VIDEO_UPLOAD.maxBytes / VIDEO_UPLOAD.chunkBytes);
const BLOB_SHA = /^[0-9a-f]{40}$/;

export interface IncomingFile {
  path: string;
  content: string;
  encoding: 'utf-8' | 'base64';
  /** A video's pieces, as blob shas in order, standing in for `content`. */
  chunks?: string[];
}

export function asFiles(value: unknown, mayBeEmpty = false): IncomingFile[] {
  if (!Array.isArray(value)) throw new InvalidRequest('empty');
  if (value.length === 0 && !mayBeEmpty) throw new InvalidRequest('empty');
  return value.map((raw) => {
    const file = raw as Record<string, unknown>;
    const path = String(file.path ?? '');
    assertWritablePath(path);
    if (Array.isArray(file.chunks)) {
      // Only a video is too big to arrive whole; nothing else may take this road.
      const chunks = file.chunks.map(String);
      if (!path.startsWith(VIDEO_DIR) || path.endsWith('.vtt')) throw new InvalidRequest('empty');
      if (chunks.length === 0 || !chunks.every((sha) => BLOB_SHA.test(sha))) throw new InvalidRequest('empty');
      if (chunks.length > MAX_CHUNKS) throw new InvalidRequest('too-large');
      return { path, content: '', encoding: 'base64', chunks };
    }
    const content = String(file.content ?? '');
    const encoding = file.encoding === 'base64' ? 'base64' : 'utf-8';
    if (content.length > MAX_CONTENT) throw new InvalidRequest('too-large');
    return { path, content, encoding };
  });
}

/**
 * Each chunked file, joined into the one blob its path will name - so the
 * save is still one commit holding the whole video and its entry. Fetched a
 * few pieces at a time, which keeps well inside GitHub's concurrency limits.
 */
export async function joinChunks(
  git: { readBlob: (sha: string) => Promise<Buffer | null> },
  files: IncomingFile[],
): Promise<IncomingFile[]> {
  const out: IncomingFile[] = [];
  for (const file of files) {
    if (!file.chunks) {
      out.push(file);
      continue;
    }
    const parts: Buffer[] = [];
    for (let i = 0; i < file.chunks.length; i += 4) {
      const batch = await Promise.all(file.chunks.slice(i, i + 4).map((sha) => git.readBlob(sha)));
      if (batch.some((part) => !part)) throw new InvalidRequest('missing-chunk');
      parts.push(...(batch as Buffer[]));
    }
    const whole = Buffer.concat(parts);
    if (whole.length > VIDEO_UPLOAD.maxBytes) throw new InvalidRequest('too-large');
    out.push({ path: file.path, content: whole.toString('base64'), encoding: 'base64' });
  }
  return out;
}

/** One piece of a video, as it arrives: base64, and no larger than a piece. */
export function asChunk(value: unknown): string {
  const content = String(value ?? '');
  if (!content || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new InvalidRequest('empty');
  if (content.length > MAX_CHUNK) throw new InvalidRequest('too-large');
  return content;
}
