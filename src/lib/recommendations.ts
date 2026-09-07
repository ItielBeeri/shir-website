import { loadToml } from './content';
import { z } from 'zod';

export interface Recommendation {
  id: string;
  /** Site-absolute path into public/, e.g. "/img/recommendations/recommendation-01.jpeg". */
  screenshot: string;
  alt: string;
  transcription: string;
  relatedTherapies: string[];
  author_label?: string;
  date_label?: string;
  active: boolean;
}

const recommendationsSchema = z.object({
  recommendations: z.array(z.object({
    id: z.string().min(1),
    screenshot: z.string().min(1),
    alt: z.string().min(1),
    transcription: z.string().min(1),
    relatedTherapies: z.array(z.string()).default([]),
    author_label: z.string().optional(),
    date_label: z.string().optional(),
    active: z.boolean().default(true),
  })),
});

/**
 * Active recommendations, in file order - that is the display order, so callers
 * must not re-sort. Screenshots stay out of images.toml on purpose: they are a
 * recommendation's content, and splitting them made every addition touch two files.
 */
export function loadRecommendations(): Recommendation[] {
  const data = loadToml('recommendations.toml', recommendationsSchema);
  return data.recommendations.filter((r) => r.active);
}
