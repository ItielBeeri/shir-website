/**
 * Every screen the owner can open, in landing-card order.
 *
 * Field keys and paths mirror the live content files exactly; model.test.ts
 * asserts neither side has a key the other lacks. Hebrew here is UI copy, not
 * site copy - it is the one place in this repo where Hebrew is written by a
 * maintainer rather than by the owner.
 */
import type { Screen } from './types';
import { THERAPY_OPTIONS } from './types';

const CONTENT = 'src/content';

export const screens: Screen[] = [
  {
    id: 'blog',
    title: 'בלוג',
    blurb: 'כתיבת פוסט חדש, עריכה, סדר והסתרה',
    icon: 'book',
    kind: 'collection',
    dir: `${CONTENT}/blog`,
    body: true,
    frontmatter: [
      { key: 'title', label: 'כותרת הפוסט', type: 'text', required: true },
      {
        key: 'excerpt',
        label: 'משפט הזמנה',
        help: 'מופיע בכרטיס הפוסט ומזמין לקרוא',
        type: 'longtext',
        required: true,
      },
      { key: 'date', label: 'תאריך', type: 'date', required: true },
      { key: 'cover', label: 'תמונת הנושא', type: 'image' },
      { key: 'tags', label: 'מילות נושא', type: 'tags' },
      {
        key: 'related_therapy',
        label: 'טיפול קשור',
        type: 'enum',
        options: THERAPY_OPTIONS,
      },
      {
        key: 'order',
        label: 'הצמדה לראש הרשימה',
        help: 'מספר גבוה יותר מופיע ראשון. בלי מספר - הפוסט מסודר לפי תאריך',
        type: 'number',
      },
      {
        key: 'draft',
        label: 'מוצג באתר',
        help: 'כל עוד זה כבוי, הפוסט נשמר אצלך ואינו מופיע באתר',
        type: 'boolean',
        invert: true,
      },
    ],
  },
  {
    id: 'recommendations',
    title: 'המלצות',
    blurb: 'צילומי מסך של המלצות',
    icon: 'quote',
    kind: 'recommendations',
    file: `${CONTENT}/recommendations.toml`,
  },
  {
    id: 'images',
    title: 'התמונות שלי',
    blurb: 'העלאה, החלפה ותיאורים',
    icon: 'image',
    kind: 'images',
    file: `${CONTENT}/images.toml`,
  },
  {
    id: 'home',
    title: 'דף הבית',
    icon: 'home',
    kind: 'toml',
    file: `${CONTENT}/pages/home.toml`,
    groups: [
      {
        title: 'מסך הפתיחה',
        fields: [
          { key: 'hero.title', path: ['hero', 'title'], label: 'השם', type: 'text', required: true },
          { key: 'hero.tagline', path: ['hero', 'tagline'], label: 'שורת התחומים', type: 'text', required: true },
          { key: 'hero.descriptor', path: ['hero', 'descriptor'], label: 'שורת תיאור', type: 'text' },
          { key: 'hero.subtitle', path: ['hero', 'subtitle'], label: 'שורת תיאור נוספת', type: 'text' },
          { key: 'hero.scroll_cue', path: ['hero', 'scroll_cue'], label: 'כיתוב הגלילה', type: 'text' },
        ],
      },
      {
        title: 'אזור ההיכרות',
        fields: [
          { key: 'intro.portrait', path: ['intro', 'portrait'], label: 'התמונה', type: 'image', required: true },
          { key: 'intro.paragraph_1', path: ['intro', 'paragraph_1'], label: 'קטע ראשון', type: 'longtext', required: true },
          { key: 'intro.paragraph_2', path: ['intro', 'paragraph_2'], label: 'קטע שני', type: 'longtext' },
          { key: 'intro.cta_label', path: ['intro', 'cta_label'], label: 'כיתוב הכפתור', type: 'text' },
        ],
      },
      {
        title: 'אזור הבלוג',
        fields: [
          { key: 'teasers.blog.label', path: ['teasers', 'blog', 'label'], label: 'כותרת האזור', type: 'text' },
          { key: 'teasers.blog.cta_label', path: ['teasers', 'blog', 'cta_label'], label: 'כיתוב הקישור', type: 'text' },
        ],
      },
      {
        title: 'משפט הסיום',
        fields: [
          { key: 'closing.enabled', path: ['closing', 'enabled'], label: 'מוצג באתר', type: 'boolean' },
          { key: 'closing.line', path: ['closing', 'line'], label: 'המשפט', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'about',
    title: 'עמוד אודות',
    icon: 'person',
    kind: 'mdx',
    file: `${CONTENT}/about/about.mdx`,
    body: true,
    frontmatter: [
      { key: 'title', label: 'הכותרת', type: 'text', required: true },
      { key: 'intro', label: 'שורת הפתיחה', type: 'longtext', required: true },
      { key: 'portrait_image', label: 'תמונת הפורטרט', type: 'image', required: true },
    ],
  },
  {
    id: 'therapies',
    title: 'עמודי הטיפולים',
    blurb: 'פסיכותרפיה · טיפול במגע · פתיחת קול · סדנאות · טקסים',
    icon: 'leaf',
    kind: 'collection',
    dir: `${CONTENT}/therapies`,
    body: true,
    frontmatter: [
      { key: 'title', label: 'שם הטיפול', type: 'text', required: true },
      { key: 'kicker', label: 'משפט מעל הכותרת', type: 'text', required: true },
      {
        key: 'summary',
        label: 'תקציר',
        help: 'מופיע בכרטיס הטיפול בדף הבית',
        type: 'longtext',
        required: true,
      },
      { key: 'hero_image', label: 'התמונה הראשית', type: 'image', required: true },
      { key: 'teaser_image', label: 'התמונה בכרטיס שבדף הבית', type: 'image' },
      {
        key: 'order',
        label: 'סדר ההופעה',
        help: 'מספר נמוך יותר מופיע ראשון',
        type: 'number',
        required: true,
      },
      {
        key: 'related_blog_tags',
        label: 'מילות נושא לפוסטים קשורים',
        type: 'tags',
      },
    ],
  },
  {
    id: 'contact',
    title: 'יצירת קשר',
    blurb: 'הטקסטים בעמוד',
    icon: 'envelope',
    kind: 'toml',
    file: `${CONTENT}/pages/contact.toml`,
    groups: [
      {
        title: 'ראש העמוד',
        fields: [
          { key: 'hero.kicker', path: ['hero', 'kicker'], label: 'משפט מעל הכותרת', type: 'text' },
          { key: 'hero.title', path: ['hero', 'title'], label: 'הכותרת', type: 'text', required: true },
          { key: 'hero.intro', path: ['hero', 'intro'], label: 'שורת הפתיחה', type: 'longtext' },
        ],
      },
      {
        title: 'מיקום',
        help: 'הטלפון, הוואטסאפ והאימייל אינם כאן - הם מופיעים בכל עמודי האתר ונמצאים במסך "פרטי הקשר שלי"',
        fields: [
          { key: 'location.title', path: ['location', 'title'], label: 'כותרת האזור', type: 'text' },
          { key: 'location.address', path: ['location', 'address'], label: 'המיקום', type: 'text' },
          { key: 'location.note', path: ['location', 'note'], label: 'הערה נוספת', type: 'longtext' },
        ],
      },
    ],
  },
  {
    id: 'nav',
    title: 'תפריט וכותרת תחתונה',
    icon: 'list',
    kind: 'nav',
    file: `${CONTENT}/nav.toml`,
  },
  {
    id: 'site',
    title: 'פרטי הקשר שלי',
    blurb: 'טלפון, וואטסאפ, אימייל, שם ופוטר',
    icon: 'phone',
    kind: 'toml',
    file: `${CONTENT}/site.toml`,
    groups: [
      {
        title: 'דרכי יצירת קשר',
        help: 'כל פרט נכתב פעם אחת בלבד - גם מה שרואים על המסך וגם מה שקורה בלחיצה מתעדכנים יחד',
        fields: [
          {
            key: 'contact.whatsapp',
            path: ['contact', 'whatsapp_url'],
            label: 'מספר לוואטסאפ',
            help: 'המספר כמו שמחייגים אליו בארץ',
            type: 'whatsapp',
            required: true,
          },
          {
            key: 'contact.phone',
            path: ['contact', 'phone_display'],
            label: 'מספר טלפון',
            type: 'phone',
            required: true,
          },
          {
            key: 'contact.email',
            path: ['contact', 'email_display'],
            label: 'כתובת אימייל',
            type: 'email',
            required: true,
          },
        ],
      },
      {
        title: 'השם ושורת התחומים',
        fields: [
          { key: 'brand.name', path: ['brand', 'name'], label: 'השם', type: 'text', required: true },
          { key: 'brand.tagline', path: ['brand', 'tagline'], label: 'שורת התחומים', type: 'text', required: true },
        ],
      },
      {
        title: 'קישורים',
        fields: [
          { key: 'social.facebook_url', path: ['social', 'facebook_url'], label: 'קישור לפייסבוק', type: 'url' },
          { key: 'social.youtube_url', path: ['social', 'youtube_url'], label: 'קישור ליוטיוב', type: 'url' },
          { key: 'social.spotify_url', path: ['social', 'spotify_url'], label: 'קישור לספוטיפיי', type: 'url' },
          { key: 'social.biosynthesis_url', path: ['social', 'biosynthesis_url'], label: 'קישור לבית הספר', type: 'url' },
        ],
      },
      {
        title: 'כותרת תחתונה',
        fields: [
          { key: 'footer.copyright_name', path: ['footer', 'copyright_name'], label: 'השם ליד סימן הזכויות', type: 'text' },
          { key: 'footer.rights', path: ['footer', 'rights'], label: 'נוסח הזכויות', type: 'text' },
          { key: 'footer.location', path: ['footer', 'location'], label: 'המיקום', type: 'text' },
        ],
      },
    ],
  },
  {
    id: 'legal',
    title: 'עמודים משפטיים',
    blurb: 'הצהרת נגישות · תנאי שימוש · באנר ההסכמה',
    icon: 'scale',
    kind: 'sections',
    file: `${CONTENT}/pages/accessibility.toml`,
  },
  {
    id: 'notfound',
    title: 'הדף לא נמצא',
    icon: 'question',
    kind: 'toml',
    advanced: true,
    file: `${CONTENT}/pages/404.toml`,
    groups: [
      {
        fields: [
          { key: 'page.title', path: ['page', 'title'], label: 'הכותרת', type: 'text' },
          { key: 'page.poetic', path: ['page', 'poetic'], label: 'המשפט', type: 'longtext' },
          { key: 'page.home_label', path: ['page', 'home_label'], label: 'כיתוב כפתור הבית', type: 'text' },
          { key: 'page.contact_label', path: ['page', 'contact_label'], label: 'כיתוב כפתור הקשר', type: 'text' },
        ],
      },
    ],
  },
];

export const screenById = (id: string): Screen => {
  const hit = screens.find((s) => s.id === id);
  if (!hit) throw new Error(`no such screen: ${id}`);
  return hit;
};

/**
 * Keys the owner never sees, by design: they wire pages together or carry a
 * value only code should choose. model.test.ts requires every live key to be
 * either modelled or listed here, so nothing is forgotten by accident.
 */
export const DELIBERATELY_HIDDEN: Record<string, string> = {
  'intro.cta_href': 'קישור פנימי לעמוד אודות',
  'teasers.blog.cta_href': 'קישור פנימי לבלוג',
  'page.home_href': 'קישור פנימי לעמוד הבית',
  'page.contact_href': 'קישור פנימי ליצירת קשר',
  'contact.whatsapp_label': 'שם הערוץ, זהה בכל האתר',
  'contact.phone_label': 'שם הערוץ, זהה בכל האתר',
  'contact.email_label': 'שם הערוץ, זהה בכל האתר',
  'contact.phone_href': 'נגזר ממספר הטלפון',
  'contact.email_href': 'נגזר מכתובת האימייל',
  'social.facebook_label': 'כיתוב קבוע',
  'social.youtube_label': 'כיתוב קבוע',
  'social.spotify_label': 'כיתוב קבוע',
  'social.biosynthesis_label': 'כיתוב קבוע',
  'analytics.enabled': 'הפעלת המדידה - שינוי קוד',
  'analytics.measurement_id': 'מזהה המדידה - שינוי קוד',
  'footer.accessibility_label': 'כיתוב קישור קבוע',
  'footer.accessibility_href': 'קישור פנימי',
  'footer.terms_label': 'כיתוב קישור קבוע',
  'footer.terms_href': 'קישור פנימי',
  accent: 'קובע את צבע העמוד',
  slug: 'כתובת הפוסט, נשלטת דרך שינוי שם',
};
