import { describe, expect, it } from 'vitest';
import { checkHref, isLinkable } from './links';

const SITE = 'https://www.shir-amitai.com';
const href = (input: string, site?: string): string | undefined => {
  const result = checkHref(input, site);
  return 'href' in result ? result.href : undefined;
};

describe('checkHref', () => {
  it('keeps a full address as she pasted it', () => {
    expect(href('https://example.com/a?b=1#c')).toBe('https://example.com/a?b=1#c');
    expect(href('  http://example.com ')).toBe('http://example.com');
  });

  it('adds the https:// a typed address leaves out', () => {
    expect(href('www.example.co.il')).toBe('https://www.example.co.il');
    expect(href('example.com/page')).toBe('https://example.com/page');
  });

  it('turns an email into a mailto: link', () => {
    expect(href('shir@example.com')).toBe('mailto:shir@example.com');
    expect(href('mailto:shir@example.com')).toBe('mailto:shir@example.com');
  });

  it('turns a phone number into an international tel: link', () => {
    expect(href('050-123-4567')).toBe('tel:+972501234567');
    expect(href('03-1234567')).toBe('tel:+97231234567');
    expect(href('tel:+972 50 123 4567')).toBe('tel:+972501234567');
  });

  it('keeps a path on the site, and her own site as a path', () => {
    expect(href('/about')).toBe('/about');
    expect(href('https://www.shir-amitai.com/blog/%D7%A9%D7%9C%D7%95%D7%9D', SITE)).toBe('/blog/שלום');
    expect(href('shir-amitai.com/about#x', SITE)).toBe('/about#x');
    expect(href('https://www.shir-amitai.com/about')).toBe('https://www.shir-amitai.com/about');
  });

  it.each([
    ['', 'nothing'],
    ['javascript:alert(1)', 'a script'],
    ['ftp://example.com', 'another scheme'],
    ['localhost', 'a host with no domain'],
    ['some words here', 'a sentence'],
    ['mailto:nobody', 'an email with no domain'],
    ['123', 'a number too short to dial'],
  ])('refuses %j (%s) with a Hebrew reason', (input) => {
    const result = checkHref(input, SITE);
    expect('error' in result && /[֐-׿]/.test(result.error)).toBe(true);
  });

  it('only ever returns an address a link may carry', () => {
    for (const input of ['https://a.com', 'a.com', 'x@y.co', '050-1234567', '/p', '#top']) {
      expect(isLinkable(href(input)!), input).toBe(true);
    }
  });
});

describe('isLinkable', () => {
  it('refuses what a paste could smuggle in', () => {
    expect(isLinkable('javascript:alert(1)')).toBe(false);
    expect(isLinkable('//evil.example')).toBe(false);
    expect(isLinkable('data:text/html,x')).toBe(false);
  });
});
