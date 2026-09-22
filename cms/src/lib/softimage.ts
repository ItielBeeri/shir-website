/**
 * The one component allowed inside body copy (AGENTS.md §6), read and written
 * as structured props so the owner sets shape and placement with controls
 * rather than by editing an attribute.
 */
export interface SoftImageProps {
  id: string;
  /** "3/4" tall · "4/3" wide · "16/9" panoramic. */
  aspect: string;
  /** Absent means full width with no text beside it. */
  float?: 'start' | 'end';
  floatWidth?: string;
}

export const ASPECTS = [
  { value: '3/4', label: 'לאורך' },
  { value: '4/3', label: 'לרוחב' },
  { value: '16/9', label: 'רחבה' },
] as const;

export const FLOATS = [
  { value: '', label: 'ברוחב מלא' },
  { value: 'start', label: 'צמודה לימין, טקסט לצידה' },
  { value: 'end', label: 'צמודה לשמאל, טקסט לצידה' },
] as const;

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
    floatWidth: attr(source, 'floatWidth'),
  };
}

export function renderSoftImage(props: SoftImageProps): string {
  const parts = [`id="${props.id}"`, `aspect="${props.aspect}"`];
  if (props.float) {
    parts.push(`float="${props.float}"`);
    parts.push(`floatWidth="${props.floatWidth || '360'}"`);
  }
  return `<SoftImage ${parts.join(' ')} />`;
}
