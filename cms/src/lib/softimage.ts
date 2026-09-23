/**
 * The one component allowed inside body copy (AGENTS.md §6), read and written
 * as structured props so the owner sets shape and placement with controls
 * rather than by editing an attribute.
 */
export interface SoftImageProps {
  id: string;
  /** "3/4" tall · "4/3" wide · "16/9" panoramic. */
  aspect: string;
  float?: 'start' | 'end';
  /** In px. Absent, with no float, means the full width of the text. */
  width?: string;
}

export const ASPECTS = [
  { value: '3/4', label: 'לאורך' },
  { value: '4/3', label: 'לרוחב' },
  { value: '16/9', label: 'רחבה' },
] as const;

export type Placement = 'full' | 'centre' | 'start' | 'end';

export const PLACEMENTS: ReadonlyArray<{ value: Placement; label: string }> = [
  { value: 'full', label: 'ברוחב מלא' },
  { value: 'centre', label: 'באמצע, בלי טקסט לצידה' },
  { value: 'start', label: 'צמודה לימין, טקסט לצידה' },
  { value: 'end', label: 'צמודה לשמאל, טקסט לצידה' },
];

export const DEFAULT_WIDTH = '360';

export const placementOf = (props: Pick<SoftImageProps, 'float' | 'width'>): Placement =>
  props.float ?? (props.width ? 'centre' : 'full');

/** Every placement but the full width has a width, kept across a change of placement. */
export function place(
  placement: Placement,
  width: string | undefined,
): Pick<SoftImageProps, 'float' | 'width'> {
  if (placement === 'full') return { float: undefined, width: undefined };
  return {
    float: placement === 'centre' ? undefined : placement,
    width: width || DEFAULT_WIDTH,
  };
}

const attr = (source: string, name: string): string | undefined =>
  new RegExp(`\\b${name}=["']([^"']*)["']`).exec(source)?.[1];

export function parseSoftImage(source: string): SoftImageProps | null {
  if (!/^<SoftImage\b/.test(source.trim())) return null;
  const id = attr(source, 'id');
  if (!id) return null;
  const float = attr(source, 'float');
  return {
    id,
    aspect: attr(source, 'aspect') ?? '4/3',
    float: float === 'start' || float === 'end' ? float : undefined,
    // The site reads `floatWidth` as `width` too: the retired editing guide
    // teaches it, so a file can still carry it.
    width: attr(source, 'width') ?? attr(source, 'floatWidth'),
  };
}

export function renderSoftImage(props: SoftImageProps): string {
  const parts = [`id="${props.id}"`, `aspect="${props.aspect}"`];
  if (props.float) parts.push(`float="${props.float}"`);
  if (props.float || props.width) parts.push(`width="${props.width || DEFAULT_WIDTH}"`);
  return `<SoftImage ${parts.join(' ')} />`;
}
