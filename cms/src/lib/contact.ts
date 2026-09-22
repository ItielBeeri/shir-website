/**
 * One number in, every field out.
 *
 * `site.toml` stores each channel twice - what happens on tap and what appears
 * on screen - and the editor guide warns that changing only one makes the site
 * show one number and dial another. Here they are both derived from a single
 * input, so they cannot disagree (TEST-SPEC X-8).
 */

export interface ContactFields {
  phone_display: string;
  phone_href: string;
  whatsapp_url: string;
  email_display: string;
  email_href: string;
}

/** Digits only, dropping a leading 0 or a +972 / 972 prefix. */
export function nationalDigits(input: string): string {
  const digits = input.replace(/[^\d]/g, '');
  if (digits.startsWith('972')) return digits.slice(3).replace(/^0/, '');
  return digits.replace(/^0/, '');
}

export const isValidIsraeliMobile = (input: string): boolean => {
  const national = nationalDigits(input);
  return national.length === 9 && national.startsWith('5');
};

/** Israeli mobiles read as 0NN-NNN-NNNN. */
export function formatPhoneDisplay(input: string): string {
  const n = nationalDigits(input);
  if (n.length !== 9) return input.trim();
  return `0${n.slice(0, 2)}-${n.slice(2, 5)}-${n.slice(5)}`;
}

export const phoneHref = (input: string): string => `tel:+972${nationalDigits(input)}`;

export const whatsappUrl = (input: string): string => `https://wa.me/972${nationalDigits(input)}`;

export const emailHref = (email: string): string => `mailto:${email.trim()}`;

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

export const isValidHttpsUrl = (url: string): boolean => {
  try {
    return new URL(url.trim()).protocol === 'https:';
  } catch {
    return false;
  }
};

/** Everything site.toml needs for one phone number and one address. */
export function deriveContact(phone: string, email: string): ContactFields {
  return {
    phone_display: formatPhoneDisplay(phone),
    phone_href: phoneHref(phone),
    whatsapp_url: whatsappUrl(phone),
    email_display: email.trim(),
    email_href: emailHref(email),
  };
}
