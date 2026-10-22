/**
 * Builds what SoftVideo plays, into public/video/_opt/ with a manifest: one
 * H.264 rendition of every videos.toml source, and its poster frame in the
 * formats SoftImage serves. Committed like the image derivatives, and for the
 * same reasons; .github/workflows/images.yml runs both scripts. The site build
 * has no ffmpeg, and a phone's HEVC original plays in Safari and little else.
 *
 * ONE RENDITION, NOT A LADDER. Nothing is fetched before the visitor presses
 * play, `+faststart` streams from the first byte, and no slot paints a video
 * wider than 720 CSS px on a phone. H.264 is decoded in hardware everywhere;
 * AV1 measured 21% smaller at equal SSIM, for four times the encode and a
 * software decoder on most phones.
 *
 * Filenames carry the source's digest exactly as in optimize-images.mjs, and a
 * poster's carries its frame as well, so choosing another moment is another
 * URL rather than a stale immutable one. Everything is written beside its
 * final name and renamed into place: existence is proof of freshness here, so
 * an encode cut short must never hold the name.
 *
 * `--check` encodes nothing and exits 1 when something would be, which lets CI
 * install ffmpeg only when it is needed.
 */
import { readFile, writeFile, mkdir, stat, readdir, rm, rename, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { parse as parseToml } from 'smol-toml';

const root = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(root, 'public');
const OUT_DIR = join(PUBLIC, 'video', '_opt');
const MANIFEST = join(OUT_DIR, 'manifest.json');
const SOURCES = join(root, 'src/content/videos.toml');

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
const FFPROBE = process.env.FFPROBE ?? 'ffprobe';

const CHECK_ONLY = process.argv.includes('--check');

/** 720p by its short edge, so a portrait phone video stays 720 wide. */
const SHORT_EDGE = 720;
const LONG_EDGE = 1280;

/** Poster rungs, capped at the rendition's own width, which always joins. */
const POSTER_WIDTHS = [360, 540, 720, 960, 1280];

/** The photo profile of optimize-images.mjs; JPEG is for <img src> and crawlers. */
const POSTER = {
  avif: { quality: 55, effort: 6, chromaSubsampling: '4:2:0' },
  webp: { quality: 76, effort: 6 },
  jpg: { quality: 80, mozjpeg: true },
};

/** High@4.0 and AAC-LC: what the encode below writes, named for <source type>. */
const MP4_TYPE = (audio) => `video/mp4; codecs="avc1.640028${audio ? ', mp4a.40.2' : ''}"`;

/**
 * HDR to SDR. iPhones record HLG by default, and played as SDR it comes out
 * flat and grey; this is ffmpeg's documented zscale recipe.
 */
const TONEMAP =
  'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv';

/** "/video/voice-opening-session.mp4" -> "voice-opening-session" */
function keyFor(publicPath) {
  return publicPath.replace(/^\/video\//, '').replace(new RegExp(`${extname(publicPath)}$`), '');
}

/** src/lib/videos.ts builds the same strings - keep the two in step. */
const renditionName = (key, width, digest) => `${key}-${width}.${digest}.mp4`;
const posterName = (key, width, digest, ext) => `${key}-poster-${width}.${digest}.${ext}`;

const sha16 = (data) => createHash('sha256').update(data).digest('hex').slice(0, 16);

/** `t=4.500` for a chosen moment, `auto` for none; null when a gallery image stands in. */
function posterSpec(entry) {
  if (entry.poster) return null;
  if (typeof entry.poster_time === 'number') return `t=${entry.poster_time.toFixed(3)}`;
  return 'auto';
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Runs a tool to completion, collecting stdout as bytes and stderr as text. */
function tool(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) =>
      reject(
        error.code === 'ENOENT'
          ? new Error(`${command} not found - install ffmpeg, or point FFMPEG/FFPROBE at it`)
          : error,
      ),
    );
    child.on('close', (code) =>
      code === 0
        ? resolvePromise({ stdout: Buffer.concat(out), stderr: err })
        : reject(new Error(`${command} exited ${code}: ${err.trim().split('\n').slice(-3).join(' | ')}`)),
    );
  });
}

async function probe(abs) {
  const { stdout } = await tool(FFPROBE, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', abs]);
  const info = JSON.parse(stdout.toString('utf8'));
  const video = info.streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  if (!video) throw new Error('no video stream');

  // A phone stores portrait as landscape plus a rotation; ffmpeg applies it on
  // decode, so the rendition's size has to be the displayed one.
  const rotation = Number(
    video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0,
  );
  const quarterTurn = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  const [sarNum, sarDen] = String(video.sample_aspect_ratio ?? '1:1').split(':').map(Number);
  const sar = sarNum > 0 && sarDen > 0 ? sarNum / sarDen : 1;
  const stored = { width: Math.round(video.width * sar), height: video.height };

  return {
    width: quarterTurn ? stored.height : stored.width,
    height: quarterTurn ? stored.width : stored.height,
    duration: Number(info.format.duration ?? video.duration ?? 0),
    audio: info.streams.some((s) => s.codec_type === 'audio'),
    hdr: ['smpte2084', 'arib-std-b67'].includes(video.color_transfer),
    located: Object.keys({ ...info.format.tags, ...video.tags }).some((k) => /location/i.test(k)),
  };
}

function fit({ width, height }) {
  const scale = Math.min(1, SHORT_EDGE / Math.min(width, height), LONG_EDGE / Math.max(width, height));
  const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

const frameFilter = (size, hdr) =>
  [hdr && TONEMAP, `scale=${size.width}:${size.height}:flags=lanczos`, 'setsar=1', 'format=yuv420p']
    .filter(Boolean)
    .join(',');

async function encode(abs, target, size, info) {
  const part = `${target}.part`;
  await tool(FFMPEG, [
    '-hide_banner', '-v', 'error', '-y', '-i', abs,
    '-map', '0:v:0', '-map', '0:a:0?',
    // The original keeps whatever the phone recorded; what is served does not.
    '-map_metadata', '-1', '-map_chapters', '-1', '-sn', '-dn',
    '-vf', frameFilter(size, info.hdr),
    '-fpsmax', '30',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-maxrate', '2500k', '-bufsize', '5000k',
    '-profile:v', 'high', '-level:v', '4.0', '-pix_fmt', 'yuv420p',
    // A keyframe every two seconds, so a seek lands near where it was aimed.
    '-force_key_frames', 'expr:gte(t,n_forced*2)',
    ...(info.audio ? ['-c:a', 'aac', '-b:a', '128k', '-ac', '2'] : ['-an']),
    '-movflags', '+faststart', '-f', 'mp4', part,
  ]);
  await rename(part, target);
}

/** The poster frame as PNG, and the moment it was taken from. */
async function grabFrame(abs, size, info, spec) {
  if (spec === 'auto') {
    // ffmpeg's `thumbnail` keeps the frame nearest the batch's average
    // histogram, which passes over the black and blurred ones; one sample a
    // second over the whole video is the batch.
    const batch = Math.max(1, Math.min(300, Math.floor(info.duration)));
    const { stdout, stderr } = await tool(FFMPEG, [
      '-hide_banner', '-nostats', '-v', 'info', '-i', abs,
      '-vf', `fps=1,${frameFilter(size, info.hdr)},thumbnail=n=${batch},showinfo`,
      '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-',
    ]);
    const time = Number(/pts_time:([\d.]+)/.exec(stderr)?.[1] ?? 0);
    return { png: stdout, time };
  }

  const wanted = Number(spec.slice(2));
  const time = Math.max(0, Math.min(wanted, info.duration - 0.1));
  const { stdout } = await tool(FFMPEG, [
    '-hide_banner', '-v', 'error', '-ss', time.toFixed(3), '-i', abs,
    '-frames:v', '1', '-vf', frameFilter(size, info.hdr), '-f', 'image2pipe', '-c:v', 'png', '-',
  ]);
  return { png: stdout, time };
}

async function writePosters(png, key, digest, widths) {
  for (const w of widths) {
    for (const ext of ['avif', 'webp', ...(w === widths.at(-1) ? ['jpg'] : [])]) {
      const target = join(OUT_DIR, posterName(key, w, digest, ext));
      if (await exists(target)) continue;
      const part = `${target}.part`;
      await sharp(png)
        .resize({ width: w, withoutEnlargement: true })
        .toFormat(ext === 'jpg' ? 'jpeg' : ext, POSTER[ext])
        .toFile(part);
      await rename(part, target);
    }
  }
}

/** Every file an entry claims, by name. */
function claimed(entry) {
  const files = entry.renditions.map((r) => r.file);
  if (entry.poster) {
    const widths = entry.poster.widths;
    for (const w of widths) {
      files.push(posterName(entry.key, w, entry.poster.digest, 'avif'));
      files.push(posterName(entry.key, w, entry.poster.digest, 'webp'));
    }
    files.push(posterName(entry.key, widths.at(-1), entry.poster.digest, 'jpg'));
  }
  return files;
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(MANIFEST, 'utf8'));
  } catch {
    return {};
  }
}

async function readEntries() {
  try {
    return parseToml(await readFile(SOURCES, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function build() {
  const entries = await readEntries();
  const previous = await readPrevious();
  const manifest = {};
  let encoded = 0;
  let reused = 0;
  let pending = 0;

  for (const [id, entry] of Object.entries(entries)) {
    const publicPath = entry?.file;
    if (typeof publicPath !== 'string' || !publicPath.startsWith('/video/') || publicPath.startsWith('/video/_opt/')) {
      console.warn(`  ! ${id}: file must name an original under /video/ - skipped`);
      continue;
    }
    const abs = join(PUBLIC, publicPath.slice(1));
    let source;
    try {
      source = await readFile(abs);
    } catch {
      console.warn(`  ! missing source, skipped: ${publicPath}`);
      continue;
    }

    const digest = sha16(source);
    const key = keyFor(publicPath);
    const spec = posterSpec(entry);
    const posterDigest = spec && sha16(`${digest}:${spec}`);

    // What a previous run built and is still on disk is kept without a probe,
    // which is what lets --check, and a run that only changes the poster to a
    // gallery image, go without ffmpeg.
    const prior = previous[publicPath]?.digest === digest ? previous[publicPath] : null;
    const allExist = async (files) =>
      (await Promise.all(files.map((f) => exists(join(OUT_DIR, f))))).every(Boolean);
    const renditionKept = prior && (await allExist(prior.renditions.map((r) => r.file)));
    const posterKept =
      !spec || (prior?.poster?.digest === posterDigest && (await allExist(claimed({ ...prior, renditions: [] }))));

    if (renditionKept && posterKept) {
      const { poster: _, ...rest } = prior;
      manifest[publicPath] = spec ? prior : rest;
      reused += 1;
      continue;
    }
    if (CHECK_ONLY) {
      console.log(`  ~ ${publicPath} needs encoding`);
      pending += 1;
      continue;
    }

    const info = await probe(abs);
    if (info.located) {
      console.warn(
        `  ! ${publicPath} records where it was filmed, and the original is public. ` +
          'Strip it before committing: ffmpeg -i in -map_metadata -1 -c copy out',
      );
    }

    const size = fit(info);
    await mkdir(join(OUT_DIR, dirname(key)), { recursive: true });

    const rendition = renditionName(key, size.width, digest);
    const target = join(OUT_DIR, rendition);
    if (!(await exists(target))) {
      console.log(`  encoding ${publicPath}  ${info.width}x${info.height} -> ${size.width}x${size.height}`);
      await encode(abs, target, size, info);
      encoded += 1;
    }

    let poster;
    if (spec) {
      const widths = [
        ...new Set([...POSTER_WIDTHS.filter((w) => w < size.width), size.width]),
      ].sort((a, b) => a - b);
      poster = { spec, digest: posterDigest, time: 0, widths };
      if (posterKept) {
        poster.time = prior.poster.time;
      } else {
        const frame = await grabFrame(abs, size, info, spec);
        await writePosters(frame.png, key, posterDigest, widths);
        poster.time = Math.round(frame.time * 1000) / 1000;
      }
    }

    const bytes = (await stat(target)).size;
    manifest[publicPath] = {
      key,
      digest,
      width: size.width,
      height: size.height,
      duration: Math.round(info.duration * 1000) / 1000,
      audio: info.audio,
      renditions: [{ file: rendition, type: MP4_TYPE(info.audio), bytes }],
      ...(poster ? { poster } : {}),
    };
    console.log(
      `  ${publicPath}  ${size.width}x${size.height}  ${(bytes / 1024 / 1024).toFixed(2)} MB` +
        (poster ? `  poster ${poster.spec === 'auto' ? `auto @ ${poster.time}s` : poster.spec}` : '  poster from the gallery'),
    );
  }

  if (CHECK_ONLY) {
    console.log(pending ? `\n  ${pending} video(s) need encoding.` : '\n  Video derivatives are current.');
    process.exit(pending ? 1 : 0);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  const pruned = await prune(manifest);
  console.log(`\n  ${encoded} video(s) encoded, ${reused} already current, ${pruned} file(s) pruned.`);
  await report();
}

/** Deletes anything under _opt/ the manifest no longer claims, superseded versions included. */
async function prune(manifest) {
  const keep = new Set([MANIFEST]);
  for (const entry of Object.values(manifest)) {
    for (const file of claimed(entry)) keep.add(join(OUT_DIR, file));
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
