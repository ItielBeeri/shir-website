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

/** Every kind of page that shows a recommendations heading. */
export type RecommendationsPlace = 'home' | 'therapy_pages' | 'recommendations_page';

const kickerSetting = z.object({ shown: z.boolean(), text: z.string() });

const recommendationsSchema = z.object({
  kicker: kickerSetting.extend({
    home: kickerSetting,
    therapy_pages: kickerSetting,
    recommendations_page: kickerSetting,
  }),
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

const loadFile = () => loadToml('recommendations.toml', recommendationsSchema);

/**
 * Active recommendations, in file order - that is the display order, so callers
 * must not re-sort. Screenshots stay out of images.toml on purpose: they are a
 * recommendation's content, and splitting them made every addition touch two files.
 */
export function loadRecommendations(): Recommendation[] {
  return loadFile().recommendations.filter((r) => r.active);
}

/**
 * The line above the recommendations heading in `place`, or undefined where it
 * is hidden. The shared switch hides it everywhere; a place's own text, when
 * not empty, replaces the shared text there. cms/ explains it to the owner in
 * those terms, so the two must agree.
 */
export function recommendationsKicker(place: RecommendationsPlace): string | undefined {
  const { kicker } = loadFile();
  const here = kicker[place];
  if (!kicker.shown || !here.shown) return undefined;
  return here.text.trim() || kicker.text.trim() || undefined;
}
