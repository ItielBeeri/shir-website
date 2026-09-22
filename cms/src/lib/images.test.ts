/** L-6 and L-9: what a thumbnail costs, and what a size reads as. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { derivativeFor, formatBytes } from './images';
import type { Derivatives } from './images';

const MANIFEST = join(__dirname, '../../../public/img/_opt/manifest.json');
const live = (): Derivatives => JSON.parse(readFileSync(MANIFEST, 'utf8')) as Derivatives;

describe('formatBytes', () => {
  it('never says a file is 0 KB', () => {
    expect(formatBytes(400)).toBe('400 בתים');
    expect(formatBytes(0)).toBe('0 בתים');
  });

  it('keeps a decimal where whole kilobytes would round away the difference', () => {
    expect(formatBytes(1500)).toBe('1.5 KB');
    expect(formatBytes(45_600)).toBe('45.6 KB');
  });

  it('switches to whole kilobytes, then megabytes', () => {
    expect(formatBytes(240_000)).toBe('240 KB');
    expect(formatBytes(5_400_000)).toBe('5.4 MB');
  });
});

describe('derivativeFor', () => {
  const manifest = live();
  const anyPath = Object.keys(manifest)[0];

  it('finds a live image in the manifest to work from', () => {
    expect(anyPath).toBeTruthy();
    expect(manifest[anyPath].widths.length).toBeGreaterThan(1);
  });

  it('asks for twice the painted size, for a dense screen', () => {
    const entry = manifest[anyPath];
    const url = derivativeFor(manifest, anyPath, 200)!;
    const chosen = Number(/-(\d+)\./.exec(url)![1]);
    expect(entry.widths).toContain(chosen);
    const smaller = entry.widths.filter((w) => w < chosen);
    for (const w of smaller) expect(w).toBeLessThan(400);
  });

  it('carries the digest, which is what makes the URL cacheable', () => {
    const entry = manifest[anyPath];
    expect(derivativeFor(manifest, anyPath, 200)).toContain(entry.digest);
    expect(derivativeFor(manifest, anyPath, 200)).toMatch(/^\/img\/_opt\//);
  });

  it('falls back to nothing when the picture has no derivatives yet', () => {
    expect(derivativeFor(manifest, '/img/content/just-uploaded.jpg', 200)).toBeNull();
    expect(derivativeFor(null, anyPath, 200)).toBeNull();
  });

  it('takes the widest it has when the request is larger than any of them', () => {
    const entry = manifest[anyPath];
    const url = derivativeFor(manifest, anyPath, 99_999)!;
    expect(url).toContain(`-${entry.widths[entry.widths.length - 1]}.`);
  });
});
