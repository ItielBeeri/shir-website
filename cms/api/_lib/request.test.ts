/** What a save may carry: the guards in front of GitHub, a video's pieces included. */
import { describe, expect, it } from 'vitest';
import { VIDEO_UPLOAD } from '../../src/git/paths';
import { MAX_CHUNK, asChunk, asFiles, joinChunks } from './request';

const sha = (n: number): string => n.toString(16).padStart(40, '0');

describe('asFiles', () => {
  it('takes a video as the shas of its pieces', () => {
    const [file] = asFiles([{ path: 'public/video/clip.mp4', chunks: [sha(1), sha(2)] }]);
    expect(file).toEqual({ path: 'public/video/clip.mp4', content: '', encoding: 'base64', chunks: [sha(1), sha(2)] });
  });

  it('lets nothing but a video arrive in pieces', () => {
    for (const path of ['src/content/videos.toml', 'public/img/content/a.jpg', 'public/video/clip.he.vtt']) {
      expect(() => asFiles([{ path, chunks: [sha(1)] }]), path).toThrow(/empty/);
    }
  });

  it('refuses a piece that is not a blob sha, and a video of too many pieces', () => {
    expect(() => asFiles([{ path: 'public/video/a.mp4', chunks: ['../../etc'] }])).toThrow(/empty/);
    expect(() => asFiles([{ path: 'public/video/a.mp4', chunks: [] }])).toThrow(/empty/);
    const many = Array.from({ length: Math.ceil(VIDEO_UPLOAD.maxBytes / VIDEO_UPLOAD.chunkBytes) + 1 }, (_, i) => sha(i));
    expect(() => asFiles([{ path: 'public/video/a.mp4', chunks: many }])).toThrow(/too-large/);
  });

  it('still holds every path to the permission model', () => {
    expect(() => asFiles([{ path: 'public/video/_opt/a-720.abc.mp4', chunks: [sha(1)] }])).toThrow(/refusing to write/);
    expect(() => asFiles([{ path: 'src/pages/voice.astro', content: 'x' }])).toThrow(/refusing to write/);
  });
});

describe('joinChunks', () => {
  const store = new Map([
    [sha(1), Buffer.from('first ')],
    [sha(2), Buffer.from('second')],
  ]);
  const git = { readBlob: async (s: string) => store.get(s) ?? null };

  it('joins the pieces, in order, into one base64 file', async () => {
    const [file, other] = await joinChunks(git, [
      { path: 'public/video/a.mp4', content: '', encoding: 'base64', chunks: [sha(1), sha(2)] },
      { path: 'src/content/videos.toml', content: 'x', encoding: 'utf-8' },
    ]);
    expect(Buffer.from(file.content, 'base64').toString()).toBe('first second');
    expect(file.chunks).toBeUndefined();
    expect(other).toEqual({ path: 'src/content/videos.toml', content: 'x', encoding: 'utf-8' });
  });

  it('says so when a piece never arrived', async () => {
    await expect(
      joinChunks(git, [{ path: 'public/video/a.mp4', content: '', encoding: 'base64', chunks: [sha(1), sha(9)] }]),
    ).rejects.toThrow(/missing-chunk/);
  });
});

describe('asChunk', () => {
  it('takes base64 no larger than one piece', () => {
    expect(asChunk('QUJD')).toBe('QUJD');
    expect(() => asChunk('')).toThrow(/empty/);
    expect(() => asChunk('not base64!')).toThrow(/empty/);
    expect(() => asChunk('A'.repeat(MAX_CHUNK + 4))).toThrow(/too-large/);
  });
});
