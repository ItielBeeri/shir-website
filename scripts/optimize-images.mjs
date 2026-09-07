/**
 * optimize-images - build the responsive derivatives that SoftImage and
 * BackgroundField render.
 *
 * Why this exists: SoftImage renders a plain <img> out of public/ rather than
 * going through astro:assets (see its header comment), so nothing generates
 * modern formats or srcset for us. Lighthouse measured the cost: 837 KiB of
 * waste on the home page alone, because four JPEGs ship at 1200-4592px wide
 * for slots that paint them at 220-464px, in a format from 1992.
 *
 * Derivatives land in public/img/_opt/ next to a manifest that records each
 * source's intrinsic size and the widths that were actually emitted. They are
 * committed, exactly like the originals: AGENTS.md §6 asks for images to be
 * optimised before they are committed, and committing the output keeps the
 * build free of a sharp dependency at render time and keeps any host that runs
 * `astro build` working without extra wiring.
 *
 * .github/workflows/images.yml runs this on every push that touches an image
 * or one of the two manifests and commits the result back, so an owner adding a
 * photo through the GitHub web editor gets derivatives without ever needing to
 * know this file exists. Run it by hand when working locally:
 *     pnpm run images
 *
 * EVERY DERIVATIVE CARRIES ITS SOURCE'S DIGEST IN ITS FILENAME
 * (`portrait-2-900.<digest>.avif`), and that one decision does three jobs:
 *
 *  1. It makes the URLs safe to cache forever. vercel.json serves _opt/ as
 *     `immutable`, which is only honest because the bytes behind a given URL
 *     can never change - a different photo produces a different name.
 *  2. It makes this script idempotent without consulting the clock. It used to
 *     compare mtimes, which is worthless in CI: `actions/checkout` stamps every
 *     file with the checkout time, so "is the derivative newer than its source"
 *     was a coin flip and CI would rebuild a random subset on every run and
 *     commit the churn. Now the question is just "does this exact file exist".
 *  3. It keeps the old derivatives addressable until prune() removes them, so
 *     nothing 404s mid-deploy.
 *
 * The manifest still records the digest separately, and src/lib/images.ts still
 * checks it against the live source. That is what makes the workflow safe to be
 * late: between the commit that replaces a photo and the one this pushes back,
 * the manifest still names the *old* derivatives, and serving them would show
 * the old picture. The check catches that and falls back to the original. The
 * hash in the filename does not remove the need for it - the two solve
 * different halves of the same problem.
 */
import { readFile, writeFile, mkdir, stat, readdir, rm, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse as parseToml } from 'smol-toml';

const root = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(root, 'public');
const OUT_DIR = join(PUBLIC, 'img', '_opt');
const MANIFEST = join(OUT_DIR, 'manifest.json');

/**
 * Ladder of widths. A slot never paints wider than ~1000 CSS px on this site,
 * and the widest realistic device pixel ratio doubles that; 2048 is the top
 * rung so a full-bleed background still has something to pick on a 4K screen.
 */
const WIDTHS = [400, 640, 900, 1280, 1600, 2048];

/**
 * Quality per format. The photography here is watercolour-soft with wide
 * gradients, which is where AVIF is strongest and where banding would show
 * first - hence AVIF is not pushed below 55.
 */
const PHOTO = {
  avif: { quality: 55, effort: 6, chromaSubsampling: '4:2:0' },
  webp: { quality: 76, effort: 6 },
};

/**
 * The recommendation screenshots are pictures *of text*, and the whole point of
 * RecommendationsSection is that the type inside them stays readable at a
 * consistent size. Compression artefacts land on letterforms rather than on
 * open sky, so they get a higher quality and full chroma - still far below the
 * JPEGs they replace.
 */
const TEXT = {
  avif: { quality: 72, effort: 6, chromaSubsampling: '4:4:4' },
  webp: { quality: 88, effort: 6 },
};

const isScreenshot = (publicPath) => publicPath.startsWith('/img/recommendations/');

/** Sources that are not in images.toml but still need derivatives. */
const EXTRA_SOURCES = ['/img/bg/background.jpg'];

async function collectSources() {
  const images = parseToml(await readFile(join(root, 'src/content/images.toml'), 'utf8'));
  const files = Object.values(images).map((entry) => entry.file);

  // Recommendation screenshots live in their own file and are rendered by
  // RecommendationsSection rather than by SoftImage, but they are images in
  // public/ like any other and were the heaviest page on the site without this.
  const recs = parseToml(await readFile(join(root, 'src/content/recommendations.toml'), 'utf8'));
  const shots = Object.values(recs)
    .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
    .map((entry) => entry?.screenshot)
    .filter(Boolean);

  return [...new Set([...files, ...shots, ...EXTRA_SOURCES])];
}

/** "/img/content/portrait-2.jpeg" -> "content/portrait-2" */
function keyFor(publicPath) {
  return publicPath.replace(/^\/img\//, '').replace(new RegExp(`${extname(publicPath)}$`), '');
}

/**
 * The one place a derivative's path is spelled out. src/lib/images.ts builds
 * the same string from the same manifest fields - keep the two in step.
 */
function derivativePath(key, width, digest, ext) {
  return `${key}-${width}.${digest}.${ext}`;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function build() {
  const sources = await collectSources();
  const manifest = {};
  let written = 0;
  let skipped = 0;

  for (const publicPath of sources) {
    const abs = join(PUBLIC, publicPath.replace(/^\//, ''));
    let source;
    try {
      source = await readFile(abs);
    } catch {
      console.warn(`  ! missing source, skipped: ${publicPath}`);
      continue;
    }

    const digest = createHash('sha256').update(source).digest('hex').slice(0, 16);
    const { width, height } = await sharp(source, { failOn: 'none' }).metadata();
    const key = keyFor(publicPath);
    /*
     * Never emit above the ladder's top rung - shiatsu-4.jpeg is 4592px wide
     * and no slot on this site would ever pick that - and never above the
     * source width, since upscaling costs bytes and buys nothing. The source's
     * own width joins the ladder when it is under the ceiling, so a
     * full-bleed image can still be served at its native resolution.
     */
    const widths = [
      ...new Set([...WIDTHS, ...(width <= WIDTHS.at(-1) ? [width] : [])].filter((w) => w <= width)),
    ].sort((a, b) => a - b);
    if (widths.length === 0) widths.push(width);

    await mkdir(join(OUT_DIR, dirname(key)), { recursive: true });

    const profile = isScreenshot(publicPath) ? TEXT : PHOTO;

    for (const w of widths) {
      for (const ext of ['avif', 'webp']) {
        const target = join(OUT_DIR, derivativePath(key, w, digest, ext));
        // The name encodes the source, so existence is proof of freshness.
        if (await exists(target)) {
          skipped += 1;
          continue;
        }
        await sharp(source, { failOn: 'none' })
          .rotate()
          .resize({ width: w, withoutEnlargement: true })
          .toFormat(ext, profile[ext])
          .toFile(target);
        written += 1;
      }
    }

    manifest[publicPath] = { key, width, height, widths, digest };
    console.log(`  ${publicPath}  ${width}x${height}  ->  ${widths.join(', ')}`);
  }

  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const pruned = await prune(manifest);
  console.log(
    `\n  ${written} derivative(s) written, ${skipped} already current, ${pruned} pruned.`,
  );
  await report();
}

/**
 * Delete anything under _opt/ that the manifest no longer claims: the
 * derivatives of an image that has been removed or renamed, and - now that the
 * digest is in the filename - every earlier version of one that was replaced.
 * Without this they would accumulate forever with nothing pointing at them.
 */
async function prune(manifest) {
  const keep = new Set([MANIFEST]);
  for (const entry of Object.values(manifest)) {
    for (const w of entry.widths) {
      for (const ext of ['avif', 'webp']) {
        keep.add(join(OUT_DIR, derivativePath(entry.key, w, entry.digest, ext)));
      }
    }
  }

  let pruned = 0;
  const walk = async (dir) => {
    for (const item of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, item.name);
      if (item.isDirectory()) await walk(p);
      else if (!keep.has(p)) {
        await rm(p);
        pruned += 1;
        console.log(`  - pruned ${p.slice(PUBLIC.length)}`);
      }
    }
  };
  await walk(OUT_DIR);
  return pruned;
}

async function report() {
  const walk = async (dir) => {
    let total = 0;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      total += entry.isDirectory() ? await walk(p) : (await stat(p)).size;
    }
    return total;
  };
  console.log(`  _opt total: ${((await walk(OUT_DIR)) / 1024 / 1024).toFixed(2)} MB`);
}

await build();
