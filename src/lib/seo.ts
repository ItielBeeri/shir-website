/**
 * seo.ts — SEO / JSON-LD helpers.
 * Used by BaseLayout and individual pages to generate structured data.
 */

const SITE_URL = 'https://shir-amitai.co.il';
const PERSON_NAME = 'שיר אמיתי';
const WHATSAPP_URL = 'https://wa.me/972525201162';
const PHONE = '+972525201162';
const EMAIL = 'shir.amitai1@gmail.com';
const LOCATION = 'פרדס חנה-כרכור';

/** Person schema — sitewide */
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

/** LocalBusiness / HealthAndBeautyBusiness — home page */
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

/** Service schema — therapy pages */
export function serviceSchema(serviceType: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: serviceType,
    provider: {
      '@type': 'Person',
      name: PERSON_NAME,
      url: SITE_URL,
    },
    url,
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
