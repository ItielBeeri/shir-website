/**
 * N-8a: a control repeated once per row names its row.
 *
 * Every control on these screens had *a* name, so nothing failed a bare 4.1.2
 * check - but a screen-reader user listing the controls on the recommendations
 * screen heard "העברה למעלה" fifteen times with nothing to tell them apart.
 * The menu screen already did it right, which is what made it a gap rather
 * than a decision.
 *
 * A row control's name has to be built from the row, so it arrives as an
 * interpolation. A *constant* name is therefore the thing to watch for: every
 * one that is legitimately constant is listed below, and a new one fails here
 * until somebody says which it is. Read from the source, because these labels
 * live in JSX that renders only behind a store, a session and a gallery.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (file: string): string => readFileSync(join(__dirname, file), 'utf8');

const literalLabels = (source: string): string[] =>
  [...source.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]);

/** Names that belong to the screen rather than to any one row. */
const ONE_OFF: Record<string, string[]> = {
  'Collection.tsx': [
    // A status icon on the row, not a control: it has nothing to act on.
    'מוצמד',
  ],
  'Recommendations.tsx': ['סגירה'],
  'Images.tsx': ['תמונה חדשה', 'סגירה', 'תיאור התמונה'],
  'Misc.tsx': [],
};

describe.each(Object.keys(ONE_OFF))('%s', (file) => {
  const source = read(file);

  it('names every repeated control from its own row', () => {
    const unexpected = literalLabels(source).filter((l) => !ONE_OFF[file].includes(l));
    expect(unexpected, `${file}: a constant name on a control that repeats`).toEqual([]);
  });

  it('has row controls at all, or this file is watching nothing', () => {
    expect(source).toMatch(/aria-label=\{`/);
  });
});

describe('the pattern the menu screen set', () => {
  it('is still there to copy', () => {
    expect(read('Misc.tsx')).toContain('העברת «${item.label}» למעלה');
  });
});
