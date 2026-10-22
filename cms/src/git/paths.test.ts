/** Gates B-1 … B-8 at the pure-function level. */
import { describe, expect, it } from 'vitest';
import {
  assertMovableBranch,
  assertReadablePath,
  assertWritableBranch,
  assertWritablePath,
  isMovableBranch,
  isReadablePath,
  isWritableBranch,
  isWritablePath,
  pathRejection,
} from './paths';

describe('writable paths', () => {
  it('allows content and image paths', () => {
    for (const p of [
      'src/content/site.toml',
      'src/content/pages/home.toml',
      'src/content/blog/מה-זה-צל.mdx',
      'src/content/therapies/voice.mdx',
      'public/img/content/portrait-1.jpeg',
      'public/img/recommendations/recommendation-01.jpeg',
      'public/img/bg/background.jpg',
    ]) {
      expect(pathRejection(p), p).toBeNull();
    }
  });

  it('B-1…B-4 rejects everything outside content', () => {
    for (const p of [
      'src/pages/index.astro',
      'src/components/ui/SoftImage.astro',
      'src/lib/images.ts',
      'src/content/config.ts',
      'astro.config.mjs',
      'package.json',
      'pnpm-lock.yaml',
      'AGENTS.md',
      'vercel.json',
      '.github/workflows/images.yml',
      'public/global.css',
      'public/fonts/heebo.woff2',
      'cms/src/main.tsx',
      '.gitignore',
    ]) {
      expect(pathRejection(p), p).toBeTruthy();
      expect(() => assertWritablePath(p)).toThrow(/refusing to write/);
    }
  });

  it('src/content/config.ts is rejected even though it is under src/content', () => {
    // It is the schema, not content - and it sits directly under the prefix.
    expect(isWritablePath('src/content/config.ts')).toBe(false);
  });

  it('rejects the generated derivative tree', () => {
    expect(pathRejection('public/img/_opt/manifest.json')).toMatch(/images workflow/);
    expect(pathRejection('public/img/_opt/portrait-2-900.abc.avif')).toMatch(/images workflow/);
    expect(pathRejection('public/video/_opt/manifest.json')).toMatch(/images workflow/);
    expect(pathRejection('public/video/_opt/clip-720.abc.mp4')).toMatch(/images workflow/);
  });

  it('allows videos as a phone saves them, and their captions', () => {
    for (const p of [
      'public/video/clip.mp4',
      'public/video/IMG_0042.MOV',
      'public/video/clip.m4v',
      'public/video/screen.webm',
      'public/video/clip.he.vtt',
    ]) {
      expect(pathRejection(p), p).toBeNull();
    }
  });

  it('allows nothing else under public/video/', () => {
    for (const p of [
      'public/video/evil.html',
      'public/video/evil.js',
      'public/video/evil.svg',
      'public/video/clip.mp4.html',
      'public/video/noext',
      'public/videoX/clip.mp4',
    ]) {
      expect(pathRejection(p), p).toBeTruthy();
    }
  });

  it('B-8 rejects traversal and encoding tricks', () => {
    for (const p of [
      'src/content/../../etc/passwd',
      'src/content/./../config.ts',
      '../src/content/site.toml',
      '/src/content/site.toml',
      'src\\content\\site.toml',
      'src/content//site.toml',
      'src/content/%2e%2e/config.ts',
      'src/content/ site.toml',
      'src/content/site.toml ',
      '',
      'src/content/site\x00.toml',
    ]) {
      expect(pathRejection(p), JSON.stringify(p)).toBeTruthy();
    }
  });

  it('rejects a path that only looks like a prefix', () => {
    expect(isWritablePath('src/contentX/file.toml')).toBe(false);
    expect(isWritablePath('public/imgX/file.jpg')).toBe(false);
    expect(isWritablePath('src/content')).toBe(false);
  });

  it('B-6…B-7 allows only the draft and target branches', () => {
    expect(isWritableBranch('content-draft')).toBe(true);
    expect(isWritableBranch('master')).toBe(true);
    for (const b of ['main', 'gh-pages', 'content-draft2', '', 'refs/heads/master', 'HEAD']) {
      expect(isWritableBranch(b), b).toBe(false);
      expect(() => assertWritableBranch(b)).toThrow();
    }
  });
});

describe('extension allowlist', () => {
  it('rejects a script or markup file even under a writable prefix', () => {
    for (const p of [
      'src/content/config.ts',
      'src/content/evil.js',
      'src/content/pages/home.html',
      'public/img/content/evil.svg',
      'public/img/content/evil.html',
      'public/img/content/payload.js',
      'public/img/content/noext',
    ]) {
      expect(pathRejection(p), p).toBeTruthy();
    }
  });

  it('accepts the extensions the owner actually uploads', () => {
    for (const p of [
      'public/img/content/a.jpg',
      'public/img/content/a.jpeg',
      'public/img/content/a.PNG',
      'public/img/recommendations/r.webp',
      'src/content/pages/home.toml',
      'src/content/blog/פוסט.mdx',
    ]) {
      expect(pathRejection(p), p).toBeNull();
    }
  });
});

/**
 * Reading is wider than writing by exactly one directory, and no wider. The
 * editor needs the derivative manifest to show a small thumbnail; nothing else
 * about `_opt/` becomes reachable.
 */
describe('reading versus writing', () => {
  const allowed = [
    'public/img/_opt/manifest.json',
    'public/img/_opt/content/a-400.abc123.webp',
    'public/img/_opt/content/a-400.abc123.avif',
    'public/video/_opt/manifest.json',
    'public/video/_opt/clip-poster-360.abc123.webp',
    'public/video/_opt/clip-poster-720.abc123.jpg',
  ];

  it.each(allowed)('%s may be read but never written', (path) => {
    expect(isReadablePath(path)).toBe(true);
    expect(isWritablePath(path)).toBe(false);
    expect(() => assertWritablePath(path)).toThrow();
  });

  it.each([
    'public/img/_opt/evil.ts',
    'public/img/_opt/evil.html',
    'public/img/_opt/evil.svg',
    'public/img/_opt/nested/../../../secret.json',
    'public/img/_opt/no-extension',
    // The editor plays a built video from the raw host, never through the API.
    'public/video/_opt/clip-720.abc123.mp4',
    'public/video/_opt/evil.html',
  ])('%s is not readable either', (path) => {
    expect(isReadablePath(path)).toBe(false);
    expect(() => assertReadablePath(path)).toThrow();
  });

  it('leaves every other path exactly as the write rule had it', () => {
    for (const path of [
      'src/content/site.toml',
      'src/content/blog/x.mdx',
      'public/img/content/a.jpg',
      'src/pages/index.astro',
      'astro.config.mjs',
      '../secret',
      'src/content/config.ts',
    ]) {
      expect(isReadablePath(path), path).toBe(isWritablePath(path));
    }
  });
});

/**
 * R3-1: nothing the owner can name begins with a dot, and a `.git`-named
 * directory should die here rather than be refused by GitHub upstream.
 */
describe('dot-prefixed segments', () => {
  it.each([
    'src/content/.hidden.toml',
    'public/img/content/.hidden.jpg',
    'src/content/.git/config.toml',
    'src/content/.well-known/x.toml',
    '.github/workflows/images.toml',
  ])('%s is refused', (path) => {
    expect(isWritablePath(path)).toBe(false);
    expect(pathRejection(path)).toBe('dot-prefixed path segment');
  });

  it('still accepts a dot inside a name, which is only an extension', () => {
    expect(isWritablePath('src/content/blog/מה-זה-צל.mdx')).toBe(true);
    expect(isWritablePath('public/img/content/a.b.jpg')).toBe(true);
  });

  it('refuses reading them too', () => {
    expect(isReadablePath('public/img/_opt/.hidden.json')).toBe(false);
  });
});

/**
 * R4-1: the allowlist has to describe every ref the engine moves, or it stops
 * being the thing B-7 pins down.
 */
describe('branches', () => {
  it('lets content be written only to the draft and master', () => {
    expect(isWritableBranch('content-draft')).toBe(true);
    expect(isWritableBranch('master')).toBe(true);
    expect(isWritableBranch('content-preview')).toBe(false);
    expect(() => assertWritableBranch('content-preview')).toThrow();
  });

  it('lets the preview ref be moved, since it carries nothing of its own', () => {
    expect(isMovableBranch('content-preview')).toBe(true);
    expect(() => assertMovableBranch('content-preview')).not.toThrow();
  });

  it('moves no other ref', () => {
    for (const branch of ['main', 'gh-pages', 'refs/heads/master', '']) {
      expect(isMovableBranch(branch), branch).toBe(false);
      expect(() => assertMovableBranch(branch)).toThrow();
    }
  });
});
