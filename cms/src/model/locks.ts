/**
 * The legal fields the owner may read but not change.
 *
 * A locked field is a factual or legal claim about what the site and the
 * clinic actually do, where a well-meant improvement to the wording creates
 * exposure. Everything else in these documents - and that is most of them - is
 * ordinary prose she should be able to fix without asking anyone.
 *
 * `maintainer` edits these behind a confirmation; `owner` gets the reason and
 * a way to ask.
 */
export interface Lock {
  reason: string;
}

const ACCESSIBILITY: Array<{ test: RegExp; reason: string }> = [
  {
    test: /רמת הנגישות והתקן/,
    reason: 'הסעיף מצהיר לפי איזה תקן האתר הונגש. שינוי שלו הוא שינוי של ההצהרה עצמה.',
  },
  {
    test: /ההתאמות שבוצעו/,
    reason: 'כל שורה כאן מתארת משהו שקיים באתר בפועל. הצהרה על התאמה שאינה קיימת גרועה מהיעדר הצהרה.',
  },
  {
    test: /מגבלות ידועות/,
    reason: 'הסעיף מפרט בכנות מה עדיין לא נגיש. צמצום שלו הוא בדיוק מה שיוצר חשיפה.',
  },
  {
    test: /פטור|הקלה/,
    reason: 'משפט סטטוטורי על כך שלא ניתן פטור.',
  },
];

const TERMS: Array<{ test: RegExp; reason: string }> = [
  {
    test: /מדידה וסטטיסטיקה/,
    reason: 'הסעיף חייב לומר בדיוק את מה שאומר באנר ההסכמה. שינוי באחד בלי השני יוצר סתירה.',
  },
];

const CONSENT: Record<string, string> = {
  body: 'המשפט על העוגיות ועל העברת המידע מחוץ לישראל הוא הבסיס החוקי להסכמה. אי אפשר לקצר אותו.',
  accept: 'שני הכפתורים חייבים להישאר שווים בניסוח ובמשקל. הסכמה שהושגה בכפתור סירוב מוחלש אינה תקפה.',
  decline: 'שני הכפתורים חייבים להישאר שווים בניסוח ובמשקל. הסכמה שהושגה בכפתור סירוב מוחלש אינה תקפה.',
};

/** A whole section of a legal document, by its Hebrew title. */
export function lockForSection(file: string, title: string): Lock | null {
  const rules = file.endsWith('accessibility.toml')
    ? ACCESSIBILITY
    : file.endsWith('terms.toml')
      ? TERMS
      : [];
  const hit = rules.find((rule) => rule.test.test(title));
  return hit ? { reason: hit.reason } : null;
}

/** One key of the consent banner. */
export function lockForBannerKey(key: string): Lock | null {
  return CONSENT[key] ? { reason: CONSENT[key] } : null;
}

/**
 * Editing the banner and editing the terms section about measurement are the
 * same change described twice; the screen makes the second one unavoidable.
 */
export const CONSENT_PAIR_NOTE =
  'שינוי בנוסח הבאנר מחייב גם עדכון של הסעיף «מדידה וסטטיסטיקה» בתנאי השימוש, כדי שהשניים לא יסתרו זה את זה.';
