import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSoftVideo, renderSoftVideo, VIDEO_PLACEMENTS } from './softvideo';
import { PLACEMENTS, place, placementOf } from './softimage';

const SITE = join(__dirname, '../../..');
const component = readFileSync(join(SITE, 'src/components/ui/SoftVideo.astro'), 'utf8');

describe('SoftVideo props', () => {
  it.each([
    '<SoftVideo id="a" />',
    '<SoftVideo id="a" width="360" />',
    '<SoftVideo id="a" float="end" width="280" stack="after" />',
    '<SoftVideo id="a" float="start" width="300" />',
  ])('round-trips %s', (source) => {
    expect(renderSoftVideo(parseSoftVideo(source)!)).toBe(source);
  });

  it('is not mistaken for an image, nor an image for it', () => {
    expect(parseSoftVideo('<SoftImage id="a" aspect="4/3" />')).toBeNull();
    expect(parseSoftVideo('<SoftVideo />')).toBeNull();
  });

  it('places as an image does: a width kept across placements, none at full width', () => {
    const props = parseSoftVideo('<SoftVideo id="a" float="end" width="300" stack="after" />')!;
    expect(placementOf(props)).toBe('end');
    expect(renderSoftVideo({ ...props, ...place('centre', props.width) })).toBe('<SoftVideo id="a" width="300" />');
    expect(renderSoftVideo({ ...props, ...place('full', props.width) })).toBe('<SoftVideo id="a" />');
  });

  it('offers the same placements as an image, worded for a video', () => {
    expect(VIDEO_PLACEMENTS.map((p) => p.value)).toEqual(PLACEMENTS.map((p) => p.value));
  });

  it('writes only props the site component declares', () => {
    expect(component).toMatch(/\bid: string;/);
    expect(component).toMatch(/float\?: 'start' \| 'end';/);
    expect(component).toMatch(/width\?: string;/);
    // `stack` is never a prop: the site's plugin turns it into two copies.
    expect(readFileSync(join(SITE, 'scripts/remark-stack-after.mjs'), 'utf8')).toMatch(/'SoftVideo'/);
  });

  it('is in every map that renders a body (AGENTS.md §6)', () => {
    for (const page of [
      'src/components/therapy/TherapyPage.astro',
      'src/pages/about.astro',
      'src/pages/blog/[slug].astro',
    ]) {
      expect(readFileSync(join(SITE, page), 'utf8'), page).toMatch(/components=\{\{[^}]*\bSoftVideo\b/);
    }
  });
});
