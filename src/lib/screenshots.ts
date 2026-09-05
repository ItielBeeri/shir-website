import { resolve } from 'node:path';
import sharp from 'sharp';

export interface ScreenshotMetrics {
  width: number;
  height: number;
  /** Median ink height of one line of text, in the screenshot's own pixels. */
  textInk: number;
  /**
   * Screenshot pixels per 1px of rendered text.
   *
   * Render a screenshot `typeUnits * k` CSS px wide and its text lands at `k`px
   * of ink. So a row whose card widths are proportional to `typeUnits` shows
   * every screenshot at the same apparent type size - which is the whole point:
   * the screenshots are captures from different phones and apps, so their text
   * is *not* a fixed fraction of their frame. Sizing by aspect ratio or by
   * frame width instead makes one card's letters twice the size of its
   * neighbour's.
   */
  typeUnits: number;
}

/**
 * Luma below this counts as ink, and a row needs this many ink pixels to count
 * as part of a line of text. Both are deliberately strict: they measure the
 * dense core of a text line rather than the sparse tips of its ascenders, which
 * is what makes the reading stable. Loosening either one lets stray pixels from
 * borders and emoji stretch a run, and the measurement starts drifting with the
 * threshold instead of with the type.
 */
const INK_LUMA = 100;
const MIN_INK_PIXELS = 8;
/** Text-line runs outside this fraction of the frame width are avatars, rules,
 *  photos or full-bleed images rather than a line of type. */
const MIN_LINE_FRACTION = 0.005;
const MAX_LINE_FRACTION = 0.075;
/** Median of the current screenshot set - used only if no text is detectable. */
const FALLBACK_TYPE_UNITS = 38;
/** In a typical screenshots there the type units don't fill its entire width; also, a typical type unit width is less than its height */
const PADDING_AND_WIDTH_HEIGHT_RATIO_FACTOR = 0.75;

const cache = new Map<string, Promise<ScreenshotMetrics>>();

/**
 * Measure a screenshot in public/ at build time: its pixel dimensions and how
 * large the text inside it is.
 *
 * `publicPath` is the site-absolute path as written in images.toml, e.g.
 * "/img/recommendations/recommendation-01.jpeg". Results are cached per path -
 * several pages render the same screenshots in one build.
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
 * Median height of a text line, found from the image's row-by-row ink profile:
 * consecutive rows carrying ink are one line of type, the gaps between them are
 * leading. Robust enough for chat and post screenshots, which is all this needs
 * to handle.
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
    // Every second column is plenty to tell a line of text from leading.
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
