/**
 * The image manifest, read.
 *
 * Its own module because it is the only thing in the gallery code that needs a
 * TOML parser, and the store - which every screen mounts - would otherwise
 * pull one into the first bytes the owner downloads.
 */
import { parse as parseToml } from 'smol-toml';

export interface GalleryImage {
  id: string;
  /** Site-absolute, e.g. "/img/content/portrait-1.jpeg". */
  file: string;
  alt: string;
  credit?: string;
}

export function parseGallery(source: string): GalleryImage[] {
  const data = parseToml(source) as Record<string, { file: string; alt: string; credit?: string }>;
  return Object.entries(data).map(([id, entry]) => ({
    id,
    file: entry.file,
    alt: entry.alt,
    credit: entry.credit,
  }));
}
