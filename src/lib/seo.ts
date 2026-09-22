/** JSON-LD builders. Brand and contact details come from site.toml, never from here. */
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
/** areaServed / addressLocality - the town alone, without the "| זום" the footer adds. */
const LOCATION = 'פרדס חנה-כרכור';

export function personSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: PERSON_NAME,
    url: SITE_URL,
    jobTitle: 'פסיכותרפיסטית גופנית, מטפלת שיאצו, מנחת פתיחת קול, סדנאות וטקסים',
    address: {
      '@type': 'PostalAddress',
      addressLocality: LOCATION,
      addressCountry: 'IL',
    },
    contactPoint: [
      // WhatsApp first - the sitewide channel priority.
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

/** `path` is the page's pathname, e.g. "/shiatsu". */
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

export function jsonLd(schema: object): string {
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}
