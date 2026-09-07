/**
 * The consent gate in front of Google Analytics.
 *
 * Nothing is requested from Google until the visitor opts in. GA sets a
 * persistent identifier and sends data abroad, which under חוק הגנת הפרטיות
 * needs informed consent first - so the gate has to sit in front of the
 * network request, not merely in front of the cookie.
 *
 * Google's Consent Mode is not that gate and cannot replace it: with defaults
 * denied it still downloads gtag.js and pings Google before any choice is
 * made. The consent calls below are set anyway, so that the tag is correct on
 * its own terms if it is ever loaded by some other path.
 *
 * State lives on <html data-consent>, restored before first paint by the
 * inline script in BaseLayout so the banner never flashes at someone who has
 * already answered.
 */

export type ConsentState = 'granted' | 'denied';

const KEY = 'shir:consent';

/**
 * Bump when what is collected changes. A record written under an older
 * version stops counting as consent, and the visitor is asked again - consent
 * covers the purposes disclosed at the time it was given, not later ones.
 */
const VERSION = 1;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    va?: (event: string, payload: unknown) => void;
  }
}

export function readConsent(): ConsentState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { v?: number; state?: string };
    if (parsed.v !== VERSION) return null;
    return parsed.state === 'granted' || parsed.state === 'denied' ? parsed.state : null;
  } catch {
    return null;
  }
}

export function writeConsent(state: ConsentState): void {
  document.documentElement.setAttribute('data-consent', state);
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, state, ts: Date.now() }));
  } catch {
    /* storage blocked - the choice still holds for this page view */
  }
}

export function clearConsent(): void {
  document.documentElement.removeAttribute('data-consent');
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage blocked - nothing was persisted to remove */
  }
}

/** Present only when [analytics] is enabled in site.toml. */
function measurementId(): string | null {
  return document.body.dataset.ga || null;
}

export function analyticsAvailable(): boolean {
  return measurementId() !== null;
}

let loaded = false;

export function loadGA(): void {
  const id = measurementId();
  if (loaded || !id) return;
  loaded = true;

  window.dataLayer = window.dataLayer || [];

  /*
   * Pushes `arguments`, not a rest array. gtag.js recognises its commands by
   * Arguments-object type and silently drops anything else, so the tidier
   * `(...args) => dataLayer.push(args)` loads the tag, queues every call, and
   * records nothing at all. The official snippet is shaped this way for that
   * reason; it is not legacy style.
   */
  function gtag(..._args: unknown[]): void {
    /* `arguments`, deliberately - not the rest parameter, which exists only
       to give callers a signature to type-check against. */
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  }
  window.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('set', 'ads_data_redaction', true);

  gtag('js', new Date());
  gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    /*
     * Blog slugs are Hebrew, so the raw pathname reaches GA percent-encoded
     * and every report reads as %D7%9E%D7%94. Decoding restores the titles.
     */
    page_path: decodeURIComponent(location.pathname),
  });

  const tag = document.createElement('script');
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(tag);
}

/**
 * Withdrawal has to be as easy as consent. gtag.js stays in memory until the
 * next navigation - there is no way to unload it - so collection is stopped
 * through Consent Mode and the identifiers it already wrote are deleted.
 */
export function revokeGA(): void {
  window.gtag?.('consent', 'update', { analytics_storage: 'denied' });

  const host = location.hostname;
  const registrable = host.split('.').slice(-2).join('.');
  const scopes = ['', `; domain=${host}`, `; domain=.${host}`, `; domain=.${registrable}`];

  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim();
    if (!name.startsWith('_ga')) continue;
    for (const scope of scopes) {
      document.cookie = `${name}=; Max-Age=0; path=/${scope}`;
    }
  }
}
