/**
 * A repository path, named the way the owner thinks of it.
 *
 * In the model rather than beside the screen that shows it, because the
 * publish commit is written on the server and its subject says which pages
 * changed - the same names she read on the way to pressing the button.
 */
import { screens } from './screens';

const THERAPY_NAMES: Record<string, string> = {
  psychotherapy: 'פסיכותרפיה',
  shiatsu: 'טיפול במגע',
  voice: 'פתיחת קול',
  workshops: 'סדנאות',
  ceremonies: 'טקסים',
};

export function describePath(path: string): string {
  const screen = screens.find((s) => s.file === path);
  if (screen) return screen.title;

  if (path.startsWith('src/content/blog/')) {
    return `הפוסט «${path.split('/').pop()?.replace(/\.mdx$/, '')}»`;
  }
  if (path.startsWith('src/content/therapies/')) {
    const slug = path.split('/').pop()?.replace(/\.mdx$/, '') ?? '';
    return `עמוד ${THERAPY_NAMES[slug] ?? slug}`;
  }
  if (path.startsWith('src/content/about/')) return 'עמוד אודות';
  if (path.startsWith('public/img/recommendations/')) return 'צילום מסך של המלצה';
  if (path.startsWith('public/img/_opt/')) return 'גרסאות מוקטנות של תמונות';
  if (path.startsWith('public/img/')) return 'תמונה';
  if (path === 'src/content/pages/accessibility.toml') return 'הצהרת נגישות';
  if (path === 'src/content/pages/terms.toml') return 'תנאי שימוש ופרטיות';
  if (path === 'src/content/pages/consent.toml') return 'באנר ההסכמה';
  return path;
}
