/**
 * Load every serverless function the way Vercel will.
 *
 * The functions run as real Node ESM, where a relative import missing its
 * `.js` throws ERR_MODULE_NOT_FOUND at load time. Nothing else in the
 * toolchain minds: Vite, Vitest and `tsc --noEmit` all resolve the
 * extensionless form, so the first thing that ever disagreed was production -
 * as an opaque FUNCTION_INVOCATION_FAILED, after the deploy.
 *
 * `api/imports.test.ts` checks the specifiers statically and is the fast gate.
 * This is the one that is actually true: it compiles the handlers and their
 * whole import graph, then imports them in Node. It runs as part of the build,
 * because the only useful time to learn this is before the deploy.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const out = join(root, '.function-check');

/** Every `api/**\/*.ts` that is a handler rather than a helper or a test. */
function handlers(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === '_lib' ? [] : handlers(full);
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : [];
  });
}

const sources = handlers(join(root, 'api'));
if (sources.length === 0) {
  console.error('no functions found under api/');
  process.exit(1);
}

let failed = false;
try {
  execFileSync(
    'npx',
    [
      'tsc',
      ...sources,
      '--outDir', out,
      '--module', 'NodeNext',
      '--moduleResolution', 'NodeNext',
      '--target', 'ES2022',
      '--skipLibCheck',
      '--types', 'node',
    ],
    { cwd: root, stdio: 'inherit', shell: true },
  );

  for (const source of sources) {
    const compiled = join(out, relative(root, source).replace(/\.ts$/, '.js'));
    const module = await import(pathToFileURL(compiled).href);
    if (typeof module.default !== 'function') {
      console.error(`✗ ${relative(root, source)} exports no handler`);
      failed = true;
    } else {
      console.log(`✓ ${relative(root, source)} loads`);
    }
  }
} catch (error) {
  console.error(`✗ a function could not be loaded:\n${error.message ?? error}`);
  failed = true;
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
