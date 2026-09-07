import { resolve } from 'node:path';
import sharp from 'sharp';

export interface ScreenshotMetrics {
  width: number;
  height: number;
  /** Median ink height of one line of text, in the screenshot's own pixels. */
  textInk: number;
  /**
   * Screenshot pixels per 1px of rendered text: at `typeUnits * k` CSS px wide,
   * the text lands at `k`px of ink. Card widths proportional to `typeUnits`
   * therefore show every screenshot at the same apparent type size. Sizing by
   * aspect ratio or frame width cannot - these are captures from different
   * phones and apps, so their text is not a fixed fraction of their frame.
   */
  typeUnits: number;
}

/**
 * Ink threshold, and the ink pixels a row needs to count as text. Strict on
 * purpose: they measure the dense core of a line, not the sparse tips of its
 * ascenders. Loosen either and stray pixels from borders and emoji stretch a
 * run, so the measurement drifts with the threshold instead of with the type.
 */
const INK_LUMA = 100;
const MIN_INK_PIXELS = 8;
/** Runs outside this fraction of the frame width are avatars, rules or photos. */
const MIN_LINE_FRACTION = 0.005;
const MAX_LINE_FRACTION = 0.075;
/** Median of the current screenshot set - used only if no text is detectable. */
const FALLBACK_TYPE_UNITS = 38;
/** Type units don't fill the frame width, and a unit is narrower than it is tall. */
const PADDING_AND_WIDTH_HEIGHT_RATIO_FACTOR = 0.75;

const cache = new Map<string, Promise<ScreenshotMetrics>>();

/**
 * Measure a screenshot in public/ at build time. `publicPath` is site-absolute,
 * as written in a recommendation's `screenshot` field. Cached per path: several
 * pages render the same screenshots in one build.
 */
export function screenshotMetrics(publicPath: string): Promise<ScreenshotMetrics> {
  const cached = cache.get(publicPath);
  if (cached) return cached;

  const pending = measure(publicPath);
  cache.set(publicPath, pending);
  return pending;
}

async function measure(publicPath: string): Promise<ScreenshotMetrics> {
  const fullPath = resolve(process.cwd(), 'public', publicPath.replace(/^\/+/, ''));

  const { data, info } = await sharp(fullPath)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const textInk = medianTextLine(data, width, height, channels);

  if (!textInk) {
    console.warn(
      `[screenshots] no text lines detected in ${publicPath} - falling back to ` +
        `typeUnits ${FALLBACK_TYPE_UNITS}, so its type size may not match its neighbours`,
    );
    return { width, height, textInk: width / FALLBACK_TYPE_UNITS, typeUnits: FALLBACK_TYPE_UNITS * PADDING_AND_WIDTH_HEIGHT_RATIO_FACTOR };
  }

  return { width, height, textInk, typeUnits: width / textInk * PADDING_AND_WIDTH_HEIGHT_RATIO_FACTOR };
}

/**
 * Median text-line height from the row-by-row ink profile: consecutive inked
 * rows are one line of type, the gaps between them leading.
 */
function medianTextLine(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
): number | null {
  const minLine = Math.max(4, Math.round(width * MIN_LINE_FRACTION));
  const maxLine = Math.round(width * MAX_LINE_FRACTION);

  const lines: number[] = [];
  let run = 0;

  const pushRun = () => {
    if (run >= minLine && run <= maxLine) lines.push(run);
    run = 0;
  };

  for (let y = 0; y < height; y++) {
    const row = y * width * channels;
    let ink = 0;
    // Every second column is plenty to tell text from leading.
    for (let x = 0; x < width; x += 2) {
      if (data[row + x * channels] < INK_LUMA && ++ink >= MIN_INK_PIXELS) break;
    }
    if (ink >= MIN_INK_PIXELS) run++;
    else pushRun();
  }
  pushRun();

  if (!lines.length) return null;
  lines.sort((a, b) => a - b);
  return lines[Math.floor(lines.length / 2)];
}
