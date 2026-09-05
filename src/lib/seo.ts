/**
 * seo.ts - SEO / JSON-LD helpers.
 * Used by BaseLayout and individual pages to generate structured data.
 *
 * Brand name and contact details are read from site.toml rather than repeated
 * here, so there is one place to change a phone number or an address.
 */
import { loadToml } from './content';
import { z } from 'zod';

export const SITE_URL = 'https://www.shir-amitai.com';

const site = loadToml(
  'site.toml',
  z.object({
    brand: z.object({ name: z.string() }),
    contact: z.object({
      whatsapp_url: z.string(),
      phone_href: z.string(),
      email_href: z.string(),
    }),
  }),
);

const PERSON_NAME = site.brand.name;
const WHATSAPP_URL = site.contact.whatsapp_url;
const PHONE = site.contact.phone_href.replace(/^tel:/, '');
const EMAIL = site.contact.email_href.replace(/^mailto:/, '');
/** Schema.org areaServed / addressLocality - the town, without the "| זום" the footer adds. */
const LOCATION = 'פרדס חנה-כרכור';

/** Person schema - sitewide */
export function personSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: PERSON_NAME,
    url: SITE_URL,
    jobTitle: 'פסיכותרפיסטית גופנית, מטפלת שיאצו ומנחת פתיחת קול',
    address: {
      '@type': 'PostalAddress',
      addressLocality: LOCATION,
      addressCountry: 'IL',
    },
    contactPoint: [
      // WhatsApp first (§5.4)
      {
        '@type': 'ContactPoint',
        contactType: 'WhatsApp',
        url: WHATSAPP_URL,
      },
      {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        telephone: PHONE,
      },
      {
        '@type': 'ContactPoint',
        contactType: 'email',
        email: EMAIL,
      },
    ],
  };
}

/** LocalBusiness / HealthAndBeautyBusiness - home page */
export function localBusinessSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'HealthAndBeautyBusiness',
    name: PERSON_NAME,
    url: SITE_URL,
    telephone: PHONE,
    email: EMAIL,
    address: {
      '@type': 'PostalAddress',
      addressLocality: LOCATION,
      addressCountry: 'IL',
    },
    priceRange: 'עם פנייה',
    inLanguage: 'he',
  };
}

/** Service schema - therapy pages. `path` is the page's pathname, e.g. "/shiatsu". */
export function serviceSchema(serviceType: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: serviceType,
    provider: {
      '@type': 'Person',
      name: PERSON_NAME,
      url: SITE_URL,
    },
    url: new URL(path, SITE_URL).href,
    areaServed: LOCATION,
    inLanguage: 'he',
  };
}

/** BlogPosting schema */
export function blogPostingSchema(opts: {
  title: string;
  excerpt: string;
  date: Date;
  slug: string;
  coverUrl?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: opts.title,
    description: opts.excerpt,
    datePublished: opts.date.toISOString(),
    author: { '@type': 'Person', name: PERSON_NAME },
    url: `${SITE_URL}/blog/${opts.slug}`,
    inLanguage: 'he',
    image: opts.coverUrl,
  };
}

/** Inject JSON-LD into <head> */
export function jsonLd(schema: object): string {
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}
