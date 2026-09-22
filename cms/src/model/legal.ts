/**
 * The rules the legal documents have to keep, checked where they cannot be
 * argued with.
 *
 * `locks.ts` describes which claims are not the owner's to reword. Describing
 * it in the client only means the lock is a greyed-out box, and a greyed-out
 * box is not a rule: one POST to the save endpoint goes straight past it. This
 * module is the rule, and the API runs it on every write.
 *
 * The consent checks are different in kind and apply to everyone, maintainer
 * included: a banner whose refusal is weaker than its acceptance does not
 * gather valid consent (AGENTS.md §12), so the acceptances it already
 * collected stop being valid too. That is not a permission question.
 */
import { parse as parseToml } from 'smol-toml';
import { lockForBannerKey, lockForSection } from './locks.js';

export interface LegalProblem {
  /** `locked` is the maintainer's to cross; `invalid` is nobody's. */
  kind: 'locked' | 'invalid';
  /** Hebrew, addressed to whoever is about to save. */
  reason: string;
}

export type Role = 'owner' | 'maintainer';

const LEGAL_FILES = [
  'src/content/pages/accessibility.toml',
  'src/content/pages/terms.toml',
  'src/content/pages/consent.toml',
];

export const isLegalFile = (path: string): boolean => LEGAL_FILES.includes(path);

type Doc = Record<string, unknown>;
interface Section {
  title?: unknown;
  body?: unknown;
  items?: unknown;
}

/** Every section of a document, keyed by its Hebrew title. */
function sectionsOf(doc: Doc): Map<string, string> {
  const out = new Map<string, string>();
  const add = (section: Section): void => {
    const title = String(section.title ?? '');
    if (title) out.set(title, JSON.stringify([section.body ?? null, section.items ?? null]));
  };
  for (const section of (doc.sections as Section[]) ?? []) add(section);
  for (const part of (doc.parts as Array<{ sections?: Section[] }>) ?? []) {
    for (const section of part.sections ?? []) add(section);
  }
  return out;
}

/**
 * The section of the terms the banner has to agree with.
 *
 * Editing one without the other leaves the site saying two different things
 * about the same measurement, and the banner is only the first layer of a
 * disclosure the terms complete (AGENTS.md §12).
 */
export function measurementSection(termsToml: string): { title: string; lines: string[] } | null {
  let doc: Doc;
  try {
    doc = parseToml(termsToml) as Doc;
  } catch {
    return null;
  }
  const all: Section[] = [
    ...((doc.sections as Section[]) ?? []),
    ...((doc.parts as Array<{ sections?: Section[] }>) ?? []).flatMap((p) => p.sections ?? []),
  ];
  const hit = all.find((s) => /מדידה וסטטיסטיקה/.test(String(s.title ?? '')));
  if (!hit) return null;
  return {
    title: String(hit.title),
    lines: [...((hit.body as string[]) ?? []), ...((hit.items as string[]) ?? [])],
  };
}

/** Words that make one option sound like the right one. */
const NUDGE = /[!]|מומלץ|כדאי|בשמחה/;

/**
 * What the banner has to keep saying. Each of these is the legal basis for
 * something the site then does, not a description of it: the transfer abroad
 * is permitted by the visitor's consent to that transfer, and the consent is
 * the click here (consent.toml says so in its own header).
 */
const REQUIRED: Array<{ test: RegExp; reason: string }> = [
  { test: /עוגי/, reason: 'הנוסח חייב לומר שנשמרות עוגיות בדפדפן.' },
  {
    test: /מחוץ לישראל/,
    reason: 'הנוסח חייב לומר שהמידע מועבר אל מחוץ לישראל - ההסכמה להעברה הזו היא ההיתר לבצע אותה.',
  },
  { test: /google|גוגל/i, reason: 'הנוסח חייב לנקוב בשם מי שמקבל את המידע.' },
];

/** Balance and disclosure, for a banner about to be saved. */
export function bannerProblems(banner: Record<string, unknown>): LegalProblem[] {
  const out: LegalProblem[] = [];
  const accept = String(banner.accept ?? '').trim();
  const decline = String(banner.decline ?? '').trim();

  if (!accept || !decline) {
    out.push({ kind: 'invalid', reason: 'שני הכפתורים חייבים להיות מלאים.' });
  } else {
    if (NUDGE.test(accept) || NUDGE.test(decline)) {
      out.push({
        kind: 'invalid',
        reason:
          'אי אפשר להמליץ על אחת האפשרויות או להוסיף סימן קריאה. הסכמה שהושגה בכפתור סירוב מוחלש אינה תקפה - וגם ההסכמות שכבר נאספו מאבדות את תוקפן.',
      });
    }
    const long = Math.max(accept.length, decline.length);
    const short = Math.min(accept.length, decline.length);
    if (long > short * 2 + 4) {
      out.push({
        kind: 'invalid',
        reason: 'שני הכפתורים צריכים להיות דומים באורך ובניסוח, כדי ששניהם יישמעו אותה מידה של הצעה.',
      });
    }
  }

  const body = String(banner.body ?? '');
  for (const rule of REQUIRED) {
    if (!rule.test.test(body)) out.push({ kind: 'invalid', reason: rule.reason });
  }
  return out;
}

/**
 * Everything wrong with writing `after` over `before`. An empty array is
 * permission to save.
 */
export function legalProblems(
  path: string,
  before: string,
  after: string,
  role: Role,
): LegalProblem[] {
  if (!isLegalFile(path)) return [];

  let was: Doc;
  let now: Doc;
  try {
    was = parseToml(before) as Doc;
    now = parseToml(after) as Doc;
  } catch {
    return [{ kind: 'invalid', reason: 'לא הצלחתי לקרוא את הקובץ הזה.' }];
  }

  if (path.endsWith('consent.toml')) {
    const bannerWas = (was.banner ?? {}) as Record<string, unknown>;
    const bannerNow = (now.banner ?? {}) as Record<string, unknown>;
    const out: LegalProblem[] = [];
    if (role === 'owner') {
      for (const key of new Set([...Object.keys(bannerWas), ...Object.keys(bannerNow)])) {
        const lock = lockForBannerKey(key);
        if (lock && bannerWas[key] !== bannerNow[key]) out.push({ kind: 'locked', reason: lock.reason });
      }
    }
    return [...out, ...bannerProblems(bannerNow)];
  }

  if (role !== 'owner') return [];

  const wasSections = sectionsOf(was);
  const nowSections = sectionsOf(now);
  const out: LegalProblem[] = [];
  for (const title of new Set([...wasSections.keys(), ...nowSections.keys()])) {
    const lock = lockForSection(path, title);
    if (lock && wasSections.get(title) !== nowSections.get(title)) {
      out.push({ kind: 'locked', reason: lock.reason });
    }
  }
  return out;
}
