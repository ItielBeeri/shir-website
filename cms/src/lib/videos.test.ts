import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseVideos } from '../content/videos';
import { VIDEO_UPLOAD } from '../git/paths';
import {
  eraseRecordedPlace,
  findVideoUsage,
  posterFor,
  posterSpec,
  toWebVtt,
  videoExtension,
  videoIdFor,
  whyVideoRejected,
} from './videos';
import type { VideoDerivatives } from './videos';

const SITE = join(__dirname, '../../..');

/** An ISO BMFF box: size, type, payload. */
function box(type: string, ...payload: Uint8Array[]): Uint8Array {
  const size = 8 + payload.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, size);
  out.set([...type].map((c) => c.charCodeAt(0)), 4);
  let at = 8;
  for (const p of payload) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const text = (s: string): Uint8Array => new TextEncoder().encode(s);
const types = (bytes: Uint8Array): string => new TextDecoder('latin1').decode(bytes);

describe('eraseRecordedPlace', () => {
  const file = (): Uint8Array =>
    box(
      'root',
      box('ftyp', text('isom')),
      box('moov', box('mvhd', text('....')), box('udta', box('©xyz', text('+32.4+034.9/'))),
        box('trak', box('tkhd', text('....')), box('meta', text('location')))),
      box('mdat', text('picture')),
    ).subarray(8);

  it('renames the boxes that hold where it was filmed, and nothing else', () => {
    const bytes = file();
    const before = types(bytes);
    expect(eraseRecordedPlace(bytes)).toBe(2);
    const after = types(bytes);
    expect(after.length).toBe(before.length);
    expect(after).not.toContain('udta');
    expect(after).not.toContain('meta');
    expect(after).toContain('mvhd');
    expect(after).toContain('tkhd');
    expect(after).toContain('mdat');
    // Only the four letters of each box name changed: no offset into the media moved.
    const changed = [...bytes].filter((b, i) => b !== before.charCodeAt(i)).length;
    expect(changed).toBe(8);
  });

  it('leaves a file it does not understand alone', () => {
    const bytes = text('not a video at all');
    expect(eraseRecordedPlace(bytes)).toBe(0);
    expect(types(bytes)).toBe('not a video at all');
  });
});

describe('toWebVtt', () => {
  it('converts SubRip, a comma before the milliseconds', () => {
    const srt = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nשלום\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nשירה\r\n';
    expect(toWebVtt(srt)).toBe(
      'WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nשלום\n\n2\n00:00:04.000 --> 00:00:06.000\nשירה\n',
    );
  });

  it('keeps WebVTT as it is', () => {
    const vtt = 'WEBVTT\n\n00:01.000 --> 00:02.000\n[שירה]\n';
    expect(toWebVtt(vtt)).toBe(vtt);
  });

  it('refuses a file with no timed line', () => {
    expect(toWebVtt('just some words')).toBeNull();
    expect(toWebVtt('WEBVTT\n\n')).toBeNull();
  });
});

describe('a new video', () => {
  it('takes the extension the site can play, by name or by type', () => {
    expect(videoExtension({ name: 'IMG_1234.MOV', type: '' })).toBe('mov');
    expect(videoExtension({ name: 'clip', type: 'video/mp4' })).toBe('mp4');
    expect(videoExtension({ name: 'song.mp3', type: 'audio/mpeg' })).toBeNull();
  });

  it('says why it is refused, in Hebrew', () => {
    expect(whyVideoRejected({ name: 'a.mp4', type: 'video/mp4', size: 1000 })).toBeNull();
    expect(whyVideoRejected({ name: 'a.mp4', type: 'video/mp4', size: VIDEO_UPLOAD.maxBytes + 1 })).toMatch(/וואטסאפ/);
    expect(whyVideoRejected({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toMatch(/[א-ת]/);
  });

  it('gets a Latin id, unique among those taken', () => {
    expect(videoIdFor('IMG_0042.MOV', new Set())).toBe('img-0042');
    expect(videoIdFor('IMG_0042.MOV', new Set(['img-0042']))).toBe('img-0042-2');
    expect(videoIdFor('סרטון.mp4', new Set())).toMatch(/^video-\d{4}-\d{2}-\d{2}$/);
  });
});

describe('the live videos', () => {
  const videos = parseVideos(readFileSync(join(SITE, 'src/content/videos.toml'), 'utf8'));
  const manifest = JSON.parse(
    readFileSync(join(SITE, 'public/video/_opt/manifest.json'), 'utf8'),
  ) as VideoDerivatives;

  it('names each poster the way scripts/optimize-videos.mjs built it', () => {
    for (const video of videos) {
      const built = manifest[video.file];
      if (!built) continue;
      expect(built.poster?.spec ?? null, video.id).toBe(posterSpec(video));
    }
  });

  it('finds a built poster for a settled video, by its digest', () => {
    const video = videos.find((v) => manifest[v.file]?.poster)!;
    const url = posterFor(manifest, video, 160)!;
    expect(url).toMatch(/^\/video\/_opt\/.+-poster-\d+\.[0-9a-f]{16}\.webp$/);
    expect(url).toContain(manifest[video.file].poster!.digest);
    expect(posterFor(manifest, { ...video, posterTime: 99 }, 160), 'a moment not yet built').toBeNull();
  });

  it('knows where a video is used', () => {
    const files = [{ path: 'voice.mdx', label: 'עמוד פתיחת קול', content: readFileSync(join(SITE, 'src/content/therapies/voice.mdx'), 'utf8') }];
    expect(findVideoUsage('voice-opening-session', files)).toEqual([{ where: 'עמוד פתיחת קול', path: 'voice.mdx' }]);
    expect(findVideoUsage('another', files)).toEqual([]);
  });
});
