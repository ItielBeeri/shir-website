/**
 * Analytics dispatcher - one call site per interaction, several sinks.
 *
 * Instrumentation never asks which tools exist or whether consent was given;
 * it calls track() and this file fans out. That is what lets the cookieless
 * layer run for everyone while GA4 runs only for visitors who opted in.
 *
 * Interactions are declared in markup as data-an-* attributes rather than
 * wired one by one, and read here by a single delegated listener. Elements
 * that come and go - the contact pill hides itself near the footer, the
 * drawer is built at runtime - therefore need no re-binding.
 */
import { readConsent, loadGA } from './consent';

export type Params = Record<string, string | number | boolean>;

export function track(name: string, params: Params = {}): void {
  /*
   * Cookieless first-party layer, no consent gate. Custom events are a paid
   * feature of it, so on the free plan this call is an accepted no-op; page
   * views, which are the numbers this layer exists for, are unaffected.
   */
  window.va?.('event', { name, data: params });

  /* Undefined until consent is granted, so this is the gate in practice. */
  window.gtag?.('event', name, params);
}

/** anContentType -> content_type, matching GA4's parameter convention. */
function paramName(datasetKey: string): string {
  return datasetKey
    .slice(2)
    .replace(/^./, (c) => c.toLowerCase())
    .replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

function initDelegation(): void {
  /*
   * Capture, because handlers closer to the target legitimately stop
   * propagation - the drawer closes itself on link clicks - and a bubbling
   * listener would miss exactly the interactions worth counting.
   */
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const el = target.closest<HTMLElement>('[data-an-event]');
      const name = el?.dataset.anEvent;
      if (!el || !name) return;

      const params: Params = {};
      for (const [key, value] of Object.entries(el.dataset)) {
        if (key === 'anEvent' || !key.startsWith('an') || !value) continue;
        params[paramName(key)] = value;
      }

      track(name, params);
    },
    { capture: true },
  );
}

if (readConsent() === 'granted') loadGA();
initDelegation();
