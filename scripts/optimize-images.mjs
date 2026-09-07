/**
 * Builds the responsive derivatives SoftImage and BackgroundField render, into
 * public/img/_opt/ with a manifest. SoftImage renders a plain <img> out of
 * public/ rather than through astro:assets, so nothing else generates modern
 * formats or a srcset.
 *
 * Output is committed like the originals, which keeps sharp out of the render
 * path and lets any host that runs `astro build` work unwired.
 * .github/workflows/images.yml runs this on every push touching an image and
 * commits the result, so an owner uploading through the GitHub web editor
 * never runs anything.
 *
 * EVERY DERIVATIVE CARRIES ITS SOURCE'S DIGEST IN ITS FILENAME
 * (`portrait-2-900.<digest>.avif`). That does three jobs: it makes the URLs
 * honestly immutable for vercel.json; it makes this script idempotent without
 * consulting mtimes, which are meaningless in CI where checkout stamps every
 * file alike; and it keeps superseded derivatives addressable until prune()
 * takes them, so nothing 404s mid-deploy.
 *
 * The manifest records the digest separately and src/lib/images.ts re-checks it
 * against the live source. That is not redundant: between the commit that
 * replaces a photo and the one this pushes back, the manifest still names the
 * old derivatives. Keep both.
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

/** No slot paints wider than ~1000 CSS px; 2048 is the top rung so a
 *  full-bleed background still has something to pick on a 4K screen. */
const WIDTHS = [400, 640, 900, 1280, 1600, 2048];

/** Watercolour-soft gradients band before anything else, so AVIF stays ≥55. */
const PHOTO = {
  avif: { quality: 55, effort: 6, chromaSubsampling: '4:2:0' },
  webp: { quality: 76, effort: 6 },
};

/** Screenshots are pictures of text: artefacts land on letterforms rather
 *  than open sky, so quality is higher and chroma full. */
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

  // Screenshots live in their own manifest and bypass SoftImage, but they are
  // images in public/ like any other and need derivatives just as much.
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

/** src/lib/images.ts builds the same string - keep the two in step. */
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
    /* Capped at the top rung and at the source width - upscaling costs bytes
       and buys nothing. The source's own width joins the ladder when it is
       under the ceiling, so a full-bleed image keeps its native resolution. */
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
 * Deletes anything under _opt/ the manifest no longer claims. Because the
 * digest is in the filename, that includes every superseded version of a
 * replaced image, which would otherwise accumulate forever.
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
