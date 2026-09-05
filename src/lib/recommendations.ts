import { loadToml } from './content';
import { z } from 'zod';

export interface Recommendation {
  id: string;
  transcription: string;
  relatedTherapies: string[];
  author_label?: string;
  date_label?: string;
  active: boolean;
}

const recommendationsSchema = z.object({
  recommendations: z.array(z.object({
    id: z.string().min(1),
    transcription: z.string().min(1),
    relatedTherapies: z.array(z.string()).default([]),
    author_label: z.string().optional(),
    date_label: z.string().optional(),
    active: z.boolean().default(true),
  })),
});

/**
 * Load active recommendations from recommendations.toml.
 *
 * Ordering guarantee: the returned array keeps the exact order in which
 * recommendations appear in the TOML file — never sorted by id, image
 * file name, or any other key. Callers must not reorder it.
 */
export function loadRecommendations(): Recommendation[] {
  const data = loadToml('recommendations.toml', recommendationsSchema);
  return data.recommendations.filter((r) => r.active);
}