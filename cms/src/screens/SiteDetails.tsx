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
import { contactGroup, pathOf, plainFields, plainGroups } from '../model/site-fields';
import type { Field } from '../model/types';

const FILE = 'src/content/site.toml';

// Both lists are the model's; only the contact inputs are built here, and
// `site-fields.ts` says why.
const CONTACT = contactGroup();
const PLAIN = plainGroups();
const FIELDS = plainFields();

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
        for (const f of FIELDS) values[f.key] = read(pathOf(f));
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
  /**
   * What is wrong with each field, in the field's own words.
   *
   * `required` is the model's flag and this screen owes it the same answer the
   * generic form gives: `brand.name` is read into five JSON-LD strings and the
   * footer watermark, and an empty one is a page that says nothing inside
   * markup claiming it does. A link is the other way round - emptying one is
   * how a platform is dropped, so blank is fine and only a non-address is not.
   */
  const problems = FIELDS.flatMap((field) => {
    const value = simple[field.key];
    if (typeof value !== 'string') return [];
    if (field.required && !value.trim()) return [{ field, message: 'שדה חובה' }];
    if (field.type === 'url' && value !== '' && !isValidHttpsUrl(value)) {
      return [{ field, message: 'הכתובת צריכה להתחיל ב-https://' }];
    }
    return [];
  });

  const missing = problems.filter((p) => p.field.required && !simple[p.field.key].trim());

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
        ...FIELDS.map((f) => ({ path: pathOf(f), value: simple[f.key] })),
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
        <h2>{CONTACT.title}</h2>
        {CONTACT.help && <p className="help">{CONTACT.help}</p>}

        <div className="field">
          <label htmlFor="phone">מספר הטלפון</label>
          <p className="help" id="phone-help">אותו מספר משמש גם לוואטסאפ.</p>
          <input
            id="phone"
            type="text"
            inputMode="tel"
            value={phone}
            aria-describedby={phone && !phoneOk ? 'phone-help phone-bad' : 'phone-help'}
            aria-invalid={Boolean(phone) && !phoneOk}
            onChange={(e) => setPhone(e.target.value)}
          />
          {phone && !phoneOk && <p className="invalid" id="phone-bad">זה לא נראה כמו מספר נייד ישראלי.</p>}
          {phoneOk && (
            <p className="derived">
              על המסך יופיע <b>{derived.phone_display}</b> · בלחיצה יתקשרו אליו · וואטסאפ ייפתח לאותו מספר
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="email">כתובת האימייל</label>
          <input
            id="email"
            type="text"
            inputMode="email"
            value={email}
            aria-describedby={email && !emailOk ? 'email-bad' : undefined}
            aria-invalid={Boolean(email) && !emailOk}
            onChange={(e) => setEmail(e.target.value)}
          />
          {email && !emailOk && <p className="invalid" id="email-bad">זו לא נראית ככתובת אימייל תקינה.</p>}
        </div>
      </section>

      {PLAIN.map((group) => (
        <Group
          key={group.title}
          title={group.title ?? ''}
          help={group.help}
          fields={group.fields}
          values={simple}
          onChange={setSimple}
          problems={problems}
        />
      ))}

      {/* Beside the button: the save is at the foot of the form, and a
          message at the top is a message she never scrolls back to see. */}
      {error && <p className="banner error" role="alert">{error}</p>}

      <div className="save-row">
        <button
          className="primary"
          onClick={save}
          disabled={!dirty || busy || !phoneOk || !emailOk || problems.length > 0}
        >
          {busy ? 'שומר…' : 'שמירה'}
        </button>
        {missing.length > 0 && (
          <span className="invalid">צריך למלא: {missing.map((p) => p.field.label).join(', ')}</span>
        )}
        {!dirty && !busy && <span className="muted">אין שינויים לשמור.</span>}
      </div>
    </>
  );
}

function Group({
  title,
  help,
  fields,
  values,
  onChange,
  problems = [],
}: {
  title: string;
  help?: string;
  fields: Field[];
  values: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  problems?: Array<{ field: Field; message: string }>;
}): JSX.Element {
  return (
    <section className="group">
      <h2>{title}</h2>
      {help && <p className="help">{help}</p>}
      {fields.map((field) => {
        const key = field.key;
        const id = `f-${key.replace(/\W/g, '-')}`;
        const bad = problems.find((p) => p.field === field)?.message;
        // Sentences beside a box are not attached to it. The help here carries
        // a consequence - an emptied link leaves the site - so it has to reach
        // somebody who never sees the paragraph.
        const describedBy = [field.help && `${id}-help`, bad && `${id}-bad`]
          .filter(Boolean)
          .join(' ');
        return (
          <div className="field" key={key}>
            <label htmlFor={id}>{field.label}</label>
            {field.help && (
              <p className="help" id={`${id}-help`}>
                {field.help}
              </p>
            )}
            <input
              id={id}
              type="text"
              value={values[key] ?? ''}
              required={field.required}
              aria-describedby={describedBy || undefined}
              aria-invalid={bad ? true : undefined}
              onChange={(e) => onChange({ ...values, [key]: e.target.value })}
            />
            {bad && (
              <p className="invalid" id={`${id}-bad`}>
                {bad}
              </p>
            )}
          </div>
        );
      })}
    </section>
  );
}
