/** R2-2: the previewed address has to be the one the site serves. */
import { describe, expect, it } from 'vitest';
import { slugFor } from './slug';
import { todayInIsrael } from './today';

describe('slugFor', () => {
  it('lowercases, because Astro does', () => {
    expect(slugFor('QA2 בדיקה')).toBe('qa2-בדיקה');
    expect(slugFor('About The Method')).toBe('about-the-method');
  });

  it('leaves Hebrew alone', () => {
    expect(slugFor('מה זה צל')).toBe('מה-זה-צל');
  });

  it('drops what a file name and a URL cannot carry', () => {
    expect(slugFor('שאלה? "ציטוט" / נתיב')).toBe('שאלה-ציטוט-נתיב');
    expect(slugFor('  רווחים   מרובים  ')).toBe('רווחים-מרובים');
  });

  it('is idempotent, so renaming twice settles', () => {
    const once = slugFor('QA2 בדיקת רגרסיה: "ציטוט"');
    expect(slugFor(once)).toBe(once);
  });

  it('gives nothing back for a title with nothing in it', () => {
    expect(slugFor('   ')).toBe('');
    expect(slugFor('///')).toBe('');
  });
});

describe('todayInIsrael', () => {
  it('names today where the owner is, not in UTC', () => {
    // 00:30 Israel time on the 23rd is still the 22nd in UTC.
    const justAfterMidnight = new Date('2026-09-22T21:30:00Z');
    expect(justAfterMidnight.toISOString().slice(0, 10)).toBe('2026-09-22');
    expect(todayInIsrael(justAfterMidnight)).toBe('2026-09-23');
  });

  it('agrees with UTC during the working day', () => {
    const midday = new Date('2026-09-23T09:00:00Z');
    expect(todayInIsrael(midday)).toBe('2026-09-23');
  });

  it('reads as the date format the schemas expect', () => {
    expect(todayInIsrael()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
