/** Gate X-8: the displayed number and the dialled number cannot disagree. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import {
  deriveContact,
  emailHref,
  formatPhoneDisplay,
  isValidEmail,
  isValidHttpsUrl,
  isValidIsraeliMobile,
  nationalDigits,
  phoneHref,
  whatsappUrl,
} from './contact';

const site = parseToml(
  readFileSync(join(__dirname, '../../../src/content/site.toml'), 'utf8'),
) as { contact: Record<string, string> };

describe('contact derivation', () => {
  it('reproduces the live site.toml from the number alone', () => {
    const derived = deriveContact('052-520-1162', site.contact.email_display);
    expect(derived.phone_display).toBe(site.contact.phone_display);
    expect(derived.phone_href).toBe(site.contact.phone_href);
    expect(derived.whatsapp_url).toBe(site.contact.whatsapp_url);
    expect(derived.email_href).toBe(site.contact.email_href);
  });

  it('accepts every shape the owner might type', () => {
    for (const input of [
      '052-520-1162',
      '0525201162',
      '052 520 1162',
      '+972525201162',
      '972-52-520-1162',
      '  052-520-1162  ',
    ]) {
      expect(nationalDigits(input), input).toBe('525201162');
      expect(phoneHref(input), input).toBe('tel:+972525201162');
      expect(whatsappUrl(input), input).toBe('https://wa.me/972525201162');
      expect(formatPhoneDisplay(input), input).toBe('052-520-1162');
    }
  });

  it('X-8 display and href always describe the same number', () => {
    // Property: for any accepted input, the digits in the display equal the
    // digits in the href and in the WhatsApp url.
    for (let n = 0; n < 200; n += 1) {
      const digits = `5${String(10_000_000 + n * 37).slice(0, 8)}`;
      const input = `0${digits}`;
      const { phone_display, phone_href, whatsapp_url } = deriveContact(input, 'a@b.co');
      const fromDisplay = nationalDigits(phone_display);
      expect(nationalDigits(phone_href)).toBe(fromDisplay);
      expect(nationalDigits(whatsapp_url)).toBe(fromDisplay);
    }
  });

  it('never emits a leading zero or a separator in a link', () => {
    const { phone_href, whatsapp_url } = deriveContact('052-520-1162', 'a@b.co');
    expect(phone_href).toMatch(/^tel:\+972\d{9}$/);
    expect(whatsapp_url).toMatch(/^https:\/\/wa\.me\/972\d{9}$/);
  });

  it('validates israeli mobiles', () => {
    expect(isValidIsraeliMobile('052-520-1162')).toBe(true);
    expect(isValidIsraeliMobile('+972525201162')).toBe(true);
    expect(isValidIsraeliMobile('04-620-1162')).toBe(false);
    expect(isValidIsraeliMobile('052-520')).toBe(false);
    expect(isValidIsraeliMobile('')).toBe(false);
  });

  it('validates email and https links', () => {
    expect(isValidEmail(site.contact.email_display)).toBe(true);
    expect(emailHref(' a@b.co ')).toBe('mailto:a@b.co');
    for (const bad of ['no-at', 'a@b', 'a b@c.co', '']) expect(isValidEmail(bad), bad).toBe(false);

    expect(isValidHttpsUrl('https://www.facebook.com/x')).toBe(true);
    for (const bad of ['http://x.com', 'ftp://x.com', 'facebook.com', '']) {
      expect(isValidHttpsUrl(bad), bad).toBe(false);
    }
  });
});
