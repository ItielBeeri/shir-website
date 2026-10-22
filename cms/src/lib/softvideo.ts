/**
 * A body video: src/components/ui/SoftVideo.astro, read and written as
 * structured props as SoftImage is, so the owner places it with the same
 * controls. It takes no shape: the site always shows a video in its own.
 */
import type { Placement } from './softimage';
import { DEFAULT_WIDTH } from './softimage';

export interface SoftVideoProps {
  id: string;
  float?: 'start' | 'end';
  /** In px. Absent, with no float, means the full width of the text. */
  width?: string;
  /** As SoftImage's: on a phone, after the next paragraph. Only with a float. */
  stack?: 'after';
}

export const SOFT_VIDEO = 'SoftVideo';

/** SoftImage's placements, in the masculine a סרטון takes. */
export const VIDEO_PLACEMENTS: ReadonlyArray<{ value: Placement; label: string }> = [
  { value: 'full', label: 'ברוחב מלא' },
  { value: 'centre', label: 'באמצע, בלי טקסט לצידו' },
  { value: 'start', label: 'צמוד לימין, טקסט לצידו' },
  { value: 'end', label: 'צמוד לשמאל, טקסט לצידו' },
];

const attr = (source: string, name: string): string | undefined =>
  new RegExp(`\\b${name}=["']([^"']*)["']`).exec(source)?.[1];

export function parseSoftVideo(source: string): SoftVideoProps | null {
  if (!/^<SoftVideo\b/.test(source.trim())) return null;
  const id = attr(source, 'id');
  if (!id) return null;
  const float = attr(source, 'float');
  return {
    id,
    float: float === 'start' || float === 'end' ? float : undefined,
    width: attr(source, 'width'),
    stack: attr(source, 'stack') === 'after' ? 'after' : undefined,
  };
}

export function renderSoftVideo(props: SoftVideoProps): string {
  const parts = [`id="${props.id}"`];
  if (props.float) parts.push(`float="${props.float}"`);
  if (props.float || props.width) parts.push(`width="${props.width || DEFAULT_WIDTH}"`);
  if (props.float && props.stack) parts.push(`stack="${props.stack}"`);
  return `<${SOFT_VIDEO} ${parts.join(' ')} />`;
}
