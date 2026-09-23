/**
 * A screen that renders the model by hand owes every property in it.
 *
 * `R10-1` and `R11-1` are one bug twice: the contact screen is the only one
 * `App.tsx` draws itself rather than through `TomlForm`, and each time the
 * model grew something the screen did not read - `help`, then `required` - it
 * shipped, passed its tests and reached no page. Removing the duplicate list
 * (`site-fields.ts`) made the second one a missing line rather than a second
 * list, which is progress and not a fix.
 *
 * So this closes the family instead of the instance. `CONSUMED` is what the
 * bespoke renderer actually reads; a site field carrying anything else fails
 * here until somebody teaches the screen about it. Adding a property to the
 * model is then a deliberate act rather than a silent one.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contactGroup, pathOf, plainFields, plainGroups } from './site-fields';
import type { Field } from './types';

/** Every property `SiteDetails.tsx` reads off a field. */
const CONSUMED = ['key', 'path', 'label', 'help', 'type', 'required'] as const;

/** The field types its single `<input type="text">` can honestly render. */
const RENDERABLE = ['text', 'url'];

const screen = readFileSync(join(__dirname, '../screens/SiteDetails.tsx'), 'utf8');

describe('the fields the contact screen draws by hand', () => {
  const fields = plainFields();

  it('there are some, or this file is watching nothing', () => {
    expect(fields.length).toBeGreaterThan(5);
    expect(plainGroups().length).toBeGreaterThan(1);
  });

  it('carry no property the screen would drop on the floor', () => {
    const dropped = fields.flatMap((field) =>
      (Object.keys(field) as Array<keyof Field>)
        .filter((prop) => !(CONSUMED as readonly string[]).includes(prop))
        .map((prop) => `${field.key}.${String(prop)}`),
    );
    expect(dropped, 'SiteDetails.tsx reads none of these').toEqual([]);
  });

  it('are all types a plain text box can stand in for', () => {
    const odd = fields.filter((f) => !RENDERABLE.includes(f.type)).map((f) => `${f.key}:${f.type}`);
    expect(odd, 'a text box cannot render these').toEqual([]);
  });

  it('all have the path a TOML screen needs', () => {
    for (const field of fields) expect(() => pathOf(field), field.key).not.toThrow();
  });
});

/**
 * R11-1 itself. The flag has to be read *and* acted on, so both halves are
 * named: the save is held, and the field says which one it is.
 */
describe('required, on the screen that ignored it', () => {
  it('is set on the brand fields, which is why this matters', () => {
    const required = plainFields().filter((f) => f.required);
    expect(required.map((f) => f.key)).toEqual(['brand.name', 'brand.tagline']);
  });

  it('holds the save', () => {
    expect(screen).toMatch(/disabled=\{[^}]*problems\.length > 0/);
  });

  it('names the empty field, in the same words the generic form uses', () => {
    const generic = readFileSync(join(__dirname, '../screens/TomlForm.tsx'), 'utf8');
    expect(generic).toContain('צריך למלא:');
    expect(screen).toContain('צריך למלא:');
  });

  it('marks the field itself, not only the summary under the button', () => {
    expect(screen).toContain('aria-invalid');
    expect(screen).toContain('שדה חובה');
  });
});

describe('the contact group, which is bespoke on purpose', () => {
  it('is the one whose inputs do not match its keys', () => {
    const group = contactGroup();
    expect(group.fields.map((f) => f.key)).toEqual([
      'contact.whatsapp',
      'contact.phone',
      'contact.email',
    ]);
    // Three keys, two inputs: one number writes whatsapp and phone (§9).
    expect(screen).toContain('deriveContact(phone, email)');
  });

  it('takes its heading and its sentence from the model all the same', () => {
    expect(screen).toContain('{CONTACT.title}');
    expect(screen).toContain('{CONTACT.help}');
  });
});
