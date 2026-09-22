/**
 * The content model: every editable field, with the Hebrew the owner reads.
 *
 * This is the one place where the CMS duplicates knowledge held in
 * src/content/config.ts and the page schemas, so AGENTS.md §13 requires it be
 * updated in the same commit as any shape change. `model.test.ts` fails when
 * the two drift.
 */
import type { TomlPath } from '../content/toml-edit';

export type FieldType =
  /** One line of Hebrew. */
  | 'text'
  /** Several lines; line breaks are kept. */
  | 'longtext'
  /** The constrained MDX body editor (AGENTS.md §13). */
  | 'richtext'
  | 'boolean'
  | 'number'
  | 'date'
  /** An id from images.toml, chosen from a thumbnail picker. */
  | 'image'
  | 'enum'
  /** Free list of short strings. */
  | 'tags'
  /** List of paragraphs. */
  | 'paragraphs'
  /** Derived channels: one input writes several keys (§9). */
  | 'phone'
  | 'whatsapp'
  | 'email'
  | 'url';

export interface EnumOption {
  value: string;
  /** Hebrew. */
  label: string;
}

export interface Field {
  /** Frontmatter key, or TOML path for a TOML screen. */
  key: string;
  path?: TomlPath;
  /** Hebrew. */
  label: string;
  /** Hebrew; shown under the input, not in a tooltip. */
  help?: string;
  type: FieldType;
  required?: boolean;
  /**
   * Hebrew reason this cannot be edited by the `owner` role. Present means
   * locked (see locks.ts); `maintainer` edits it behind a confirmation.
   */
  locked?: string;
  options?: EnumOption[];
  /** Soft guidance, shown as a counter; never a hard truncation. */
  maxLength?: number;
}

export interface FieldGroup {
  /** Hebrew section heading within a screen. */
  title?: string;
  help?: string;
  fields: Field[];
}

export type ScreenKind =
  /** Flat form over one TOML file. */
  | 'toml'
  /** One MDX file: frontmatter form plus body editor. */
  | 'mdx'
  /** Many MDX files in a folder. */
  | 'collection'
  /** The image gallery. */
  | 'images'
  /** The recommendation cards. */
  | 'recommendations'
  /** The reorderable menu. */
  | 'nav'
  /** Repeating titled sections with paragraph lists. */
  | 'sections';

export interface Screen {
  id: string;
  /** Hebrew, as it appears on the landing card and in the header. */
  title: string;
  /** Hebrew, one line, on the landing card. */
  blurb?: string;
  /** Generic signifier, not a brand name. */
  icon: string;
  kind: ScreenKind;
  /** Repo-relative, always under src/content/ or public/img/. */
  file?: string;
  dir?: string;
  groups?: FieldGroup[];
  /** Frontmatter fields, for `mdx` and `collection`. */
  frontmatter?: Field[];
  /** Whether the body is editable with the rich-text editor. */
  body?: boolean;
  /** Hidden behind "הגדרות נוספות" - rarely touched. */
  advanced?: boolean;
}

export const THERAPY_OPTIONS: EnumOption[] = [
  { value: 'psychotherapy', label: 'פסיכותרפיה' },
  { value: 'shiatsu', label: 'טיפול במגע' },
  { value: 'voice', label: 'פתיחת קול' },
];
