/**
 * Contact details, brand, links and footer.
 *
 * One field per channel. `site.toml` stores each twice - what happens on tap
 * and what shows on screen - and the editor guide has to warn that changing
 * only one makes the site display one number and dial another. Here both are
 * derived from a single input, so they cannot disagree.
 */
import { useEffect, useState } from 'react';
import { api, FriendlyError } from '../api';
import { setValues } from '../content/toml-edit';
import type { TomlPath } from '../content/toml-edit';
import { findSlot } from '../content/toml-edit';
import { useStore } from '../store';
import { deriveContact, isValidEmail, isValidHttpsUrl, isValidIsraeliMobile } from '../lib/contact';

const FILE = 'src/content/site.toml';

interface Simple {
  path: TomlPath;
  label: string;
  help?: string;
}

const BRAND: Simple[] = [
  { path: ['brand', 'name'], label: 'השם' },
  { path: ['brand', 'tagline'], label: 'שורת התחומים' },
];

const FOOTER: Simple[] = [
  { path: ['footer', 'copyright_name'], label: 'השם ליד סימן הזכויות' },
  { path: ['footer', 'rights'], label: 'נוסח הזכויות' },
  { path: ['footer', 'location'], label: 'המיקום' },
];

const LINKS: Simple[] = [
  { path: ['social', 'facebook_url'], label: 'קישור לפייסבוק', help: 'הכתובת המלאה, כמו שמופיעה בדפדפן' },
  { path: ['social', 'biosynthesis_url'], label: 'קישור לבית הספר' },
];

export function SiteDetails({ onSaved }: { onSaved: () => void }): JSX.Element {
  const store = useStore();
  const [source, setSource] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [simple, setSimple] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState({ phone: '', email: '', simple: {} as Record<string, string> });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .read(FILE)
      .then(({ content }) => {
        if (cancelled || !content) return;
        const read = (path: TomlPath): string => String(findSlot(content, path).value);
        const values: Record<string, string> = {};
        for (const f of [...BRAND, ...FOOTER, ...LINKS]) values[f.path.join('.')] = read(f.path);
        const p = read(['contact', 'phone_display']);
        const e = read(['contact', 'email_display']);
        setSource(content);
        setPhone(p);
        setEmail(e);
        setSimple(values);
        setInitial({ phone: p, email: e, simple: values });
      })
      .catch((err: FriendlyError) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const phoneOk = isValidIsraeliMobile(phone);
  const emailOk = isValidEmail(email);
  const badLinks = LINKS.filter((l) => {
    const v = simple[l.path.join('.')];
    return v !== undefined && v !== '' && !isValidHttpsUrl(v);
  });

  const dirty =
    phone !== initial.phone ||
    email !== initial.email ||
    JSON.stringify(simple) !== JSON.stringify(initial.simple);

  async function save(): Promise<void> {
    if (!source) return;
    setBusy(true);
    setError(null);
    try {
      const derived = deriveContact(phone, email);
      const edits: Array<{ path: TomlPath; value: string }> = [
        { path: ['contact', 'phone_display'], value: derived.phone_display },
        { path: ['contact', 'phone_href'], value: derived.phone_href },
        { path: ['contact', 'whatsapp_url'], value: derived.whatsapp_url },
        { path: ['contact', 'email_display'], value: derived.email_display },
        { path: ['contact', 'email_href'], value: derived.email_href },
        ...[...BRAND, ...FOOTER, ...LINKS].map((f) => ({
          path: f.path,
          value: simple[f.path.join('.')],
        })),
      ];
      const next = setValues(source, edits);
      await api.save('עדכון פרטי הקשר', [{ path: FILE, content: next }]);
      setSource(next);
      setPhone(derived.phone_display);
      setInitial({ phone: derived.phone_display, email, simple });
      store.saved();
      onSaved();
    } catch (e) {
      setError(e instanceof FriendlyError ? e.message : 'לא הצלחתי לשמור.');
    } finally {
      setBusy(false);
    }
  }

  if (!source) return <p className="muted">רגע, טוען…</p>;

  const derived = deriveContact(phone, email);

  return (
    <>

      <section className="group">
        <h2>דרכי יצירת קשר</h2>
        <p className="help">
          כל פרט נכתב פעם אחת. מה שרואים על המסך ומה שקורה בלחיצה מתעדכנים יחד.
        </p>

        <div className="field">
          <label htmlFor="phone">מספר הטלפון</label>
          <p className="help">אותו מספר משמש גם לוואטסאפ.</p>
          <input id="phone" type="text" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          {phone && !phoneOk && <p className="invalid">זה לא נראה כמו מספר נייד ישראלי.</p>}
          {phoneOk && (
            <p className="derived">
              על המסך יופיע <b>{derived.phone_display}</b> · בלחיצה יתקשרו אליו · וואטסאפ ייפתח לאותו מספר
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="email">כתובת האימייל</label>
          <input id="email" type="text" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          {email && !emailOk && <p className="invalid">זו לא נראית ככתובת אימייל תקינה.</p>}
        </div>
      </section>

      <Group title="השם ושורת התחומים" fields={BRAND} values={simple} onChange={setSimple} />
      <Group title="קישורים" fields={LINKS} values={simple} onChange={setSimple} invalid={badLinks} />
      <Group title="כותרת תחתונה" fields={FOOTER} values={simple} onChange={setSimple} />

      {/* Beside the button: the save is at the foot of the form, and a
          message at the top is a message she never scrolls back to see. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="save-row">
        <button
          className="primary"
          onClick={save}
          disabled={!dirty || busy || !phoneOk || !emailOk || badLinks.length > 0}
        >
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {!dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
      </div>
    </>
  );
}

function Group({
  title,
  fields,
  values,
  onChange,
  invalid = [],
}: {
  title: string;
  fields: Simple[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  invalid?: Simple[];
}): JSX.Element {
  return (
    <section className="group">
      <h2>{title}</h2>
      {fields.map((field) => {
        const key = field.path.join('.');
        const id = `f-${key.replace(/\W/g, '-')}`;
        return (
          <div className="field" key={key}>
            <label htmlFor={id}>{field.label}</label>
            {field.help && <p className="help">{field.help}</p>}
            <input
              id={id}
              type="text"
              value={values[key] ?? ''}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            />
            {invalid.includes(field) && <p className="invalid">הכתובת צריכה להתחיל ב-https://</p>}
          </div>
        );
      })}
    </section>
  );
}
