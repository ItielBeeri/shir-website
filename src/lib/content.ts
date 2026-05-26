import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'smol-toml';
import type { ZodTypeAny, z } from 'zod';

/**
 * Load and parse a TOML file from src/content/, validate with a Zod schema,
 * and return a fully-typed object.
 *
 * Usage:
 *   const home = await loadToml('pages/home.toml', homeSchema);
 */
export function loadToml<T extends ZodTypeAny>(
  relativePath: string,
  schema: T,
): z.infer<T> {
  const fullPath = resolve(process.cwd(), 'src/content', relativePath);
  const raw = readFileSync(fullPath, 'utf-8');
  const parsed = parse(raw);
  return schema.parse(parsed);
}
