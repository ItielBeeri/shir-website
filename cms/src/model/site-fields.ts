/**
 * The contact screen's fields, read off the model rather than restated.
 *
 * `App.tsx` renders this one screen itself instead of through `TomlForm`,
 * because its contact group derives five TOML keys from two inputs. That is a
 * good reason for a bespoke screen and was not a good reason for a bespoke
 * field list, which is what it grew: a second list of paths, labels and help
 * strings, describing the same screen as `screens.ts`. Help text added there
 * shipped in the bundle and reached no page - invisible and green at once.
 *
 * Only the contact group is genuinely different, and it differs in shape:
 * `screens.ts` models the three *keys* the owner's two inputs write, because
 * its job is to account for every editable key (C-1). Its title and its
 * sentence are still the model's, so nothing on the screen is written twice.
 */
import { screenById } from './screens.js';
import type { Field, FieldGroup } from './types.js';
import type { TomlPath } from '../content/toml-edit.js';

const SITE = screenById('site');

const isContact = (group: FieldGroup): boolean =>
  group.fields.every((f) => f.key.startsWith('contact.'));

/** The group whose inputs the screen builds by hand. */
export const contactGroup = (): FieldGroup => {
  const hit = (SITE.groups ?? []).find(isContact);
  if (!hit) throw new Error('the site screen has no contact group');
  return hit;
};

/** Every other group: a label, a path and a sentence, rendered as they come. */
export const plainGroups = (): FieldGroup[] => (SITE.groups ?? []).filter((g) => !isContact(g));

/** Their fields flattened, for reading and writing them in one pass. */
export const plainFields = (): Field[] => plainGroups().flatMap((g) => g.fields);

/**
 * A TOML screen's field without a path cannot be read or written, so this is a
 * mistake in the model rather than a case to handle.
 */
export function pathOf(field: Field): TomlPath {
  if (!field.path) throw new Error(`site field without a path: ${field.key}`);
  return field.path;
}
