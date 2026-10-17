/**
 * A framed section of body copy: src/components/ui/FramedSection.astro, which
 * the owner wraps around her own paragraphs. Read and written as structured
 * props, as SoftImage is, so she sets its look with controls rather than by
 * editing an attribute.
 */
export type FrameTone = 'page' | 'lavender' | 'teal' | 'rose' | 'peach' | 'moss';

export interface FrameProps {
  /** A wash of colour over the glass; absent, plain glass. */
  tone?: FrameTone;
  /** Centred at about two thirds of the text width; absent, the full width. */
  width?: 'narrow';
  /** Absent, the text runs from the start edge as the body's does. */
  align?: 'center';
}

export const FRAME_NAME = 'FramedSection';
export const FRAME_CLOSE = `</${FRAME_NAME}>`;

/**
 * `swatch` is the site's own palette value (`--color-<tone>` in
 * public/global.css), which frame.test.ts holds it to. `page` has none: it
 * takes the colour of whichever page the frame is on.
 */
export const TONES: ReadonlyArray<{ value: FrameTone | undefined; label: string; swatch?: string }> = [
  { value: undefined, label: 'שקופה' },
  { value: 'page', label: 'בצבע העמוד' },
  { value: 'lavender', label: 'סגול', swatch: '#c9bde0' },
  { value: 'teal', label: 'טורקיז', swatch: '#a6d4c8' },
  { value: 'rose', label: 'ורוד', swatch: '#e9b8c2' },
  { value: 'peach', label: 'אפרסק', swatch: '#f3c9bb' },
  { value: 'moss', label: 'ירוק', swatch: '#c3d3ae' },
];

export const WIDTHS: ReadonlyArray<{ value: FrameProps['width']; label: string }> = [
  { value: undefined, label: 'ברוחב מלא' },
  { value: 'narrow', label: 'צרה, באמצע' },
];

export const ALIGNS: ReadonlyArray<{ value: FrameProps['align']; label: string }> = [
  { value: undefined, label: 'טקסט מימין' },
  { value: 'center', label: 'טקסט במרכז' },
];

const ALLOWED: Record<keyof FrameProps, ReadonlyArray<string | undefined>> = {
  tone: TONES.map((t) => t.value),
  width: WIDTHS.map((w) => w.value),
  align: ALIGNS.map((a) => a.value),
};

const known = (name: string): name is keyof FrameProps => Object.hasOwn(ALLOWED, name);

/** Only what a control offers survives: anything else is the default, which is what the site renders for it. */
export function frameProps(attrs: Record<string, unknown> = {}): FrameProps {
  const props: FrameProps = {};
  for (const name of Object.keys(ALLOWED) as Array<keyof FrameProps>) {
    const value = attrs[name];
    if (typeof value === 'string' && value && ALLOWED[name].includes(value)) {
      (props as Record<string, string>)[name] = value;
    }
  }
  return props;
}

interface JsxAttribute {
  type: string;
  name?: string;
  value?: unknown;
}

/**
 * The props of a parsed `<FramedSection>`, or null when it carries anything
 * the controls cannot show - an expression, a spread, an attribute or value
 * they do not offer. The caller then keeps the element as written, so a
 * maintainer's hand-made frame is never rewritten into something else.
 */
export function parseFrameAttributes(attributes: JsxAttribute[]): FrameProps | null {
  const props: Record<string, string> = {};
  for (const a of attributes) {
    if (a.type !== 'mdxJsxAttribute' || !a.name || !known(a.name) || typeof a.value !== 'string') return null;
    if (!a.value || !ALLOWED[a.name].includes(a.value)) return null;
    props[a.name] = a.value;
  }
  return props as FrameProps;
}

/** The opening tag, attributes in a fixed order and defaults left out. */
export function renderFrameOpen(props: FrameProps): string {
  const parts = (Object.keys(ALLOWED) as Array<keyof FrameProps>)
    .filter((name) => props[name])
    .map((name) => `${name}="${props[name]}"`);
  return `<${[FRAME_NAME, ...parts].join(' ')}>`;
}
