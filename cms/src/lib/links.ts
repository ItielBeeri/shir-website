/**
 * What the owner types as a link's address, and what the file gets.
 *
 * She pastes whatever her browser's address bar gave her, or types an email or
 * a phone number the way she would say it, so each of those is recognised
 * rather than rejected. A page of her own site comes back as a path: the full
 * address would send a preview build's visitors to the live site instead of
 * the page beside them.
 */
import { emailHref, isValidEmail, nationalDigits, phoneHref } from './contact';

export type Checked = { href: string } | { error: string };

/** Scheme-relative `//host` is someone else's site, not a path on hers. */
const PATH = /^\/(?!\/)/;

/** The addresses a link in body copy may point at - also what a paste may carry in. */
export const isLinkable = (href: string): boolean =>
  /^(https?:\/\/|mailto:|tel:|#)/i.test(href) || PATH.test(href);

const hostOf = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
};

/** Hebrew in a path reads as Hebrew in the file, not as `%D7%A9…`. */
const readable = (url: URL): string => {
  const path = `${url.pathname}${url.search}${url.hash}`;
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
};

export function checkHref(input: string, siteUrl?: string): Checked {
  const value = input.trim();
  if (!value) return { error: 'צריך לכתוב לאן הקישור מוביל.' };

  if (PATH.test(value) || value.startsWith('#')) return { href: value.replace(/\s/g, '%20') };

  if (/^mailto:/i.test(value)) {
    return isValidEmail(value.slice(7).split('?')[0])
      ? { href: value }
      : { error: 'כתובת האימייל לא נראית שלמה.' };
  }
  if (isValidEmail(value)) return { href: emailHref(value) };

  const phone = value.replace(/^tel:/i, '');
  if (/^\+?[\d\s\-().]+$/.test(phone)) {
    const national = nationalDigits(phone);
    return national.length === 8 || national.length === 9
      ? { href: phoneHref(phone) }
      : { error: 'מספר הטלפון לא נראה שלם.' };
  }

  if (/\s/.test(value)) return { error: 'בכתובת של אתר אין רווחים.' };

  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    return { error: 'אפשר לקשר לאתר, לאימייל או לטלפון בלבד.' };
  }
  const address = scheme ? value : `https://${value}`;
  const host = hostOf(address);
  if (!host || !host.includes('.')) {
    return { error: 'זו לא נראית כתובת של אתר. אפשר להעתיק אותה משורת הכתובת בדפדפן.' };
  }

  if (siteUrl && host === hostOf(siteUrl)) return { href: readable(new URL(address)) };
  return { href: address };
}
