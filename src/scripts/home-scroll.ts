/**
 * home-scroll.ts — GSAP scroll choreography for the home page.
 * - Therapy triptych: image scale 1.0 → 1.08 on scroll (scrub).
 * - Accent overlay: fades in/out as section enters viewport.
 * Disabled when prefers-reduced-motion: reduce.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

function initHomeScroll() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // Only run on pages that have therapy teasers
  const teasers = document.querySelectorAll<HTMLElement>('.therapy-teaser');
  if (!teasers.length) return;

  // Kill previous triggers to avoid duplicates after view transitions
  ScrollTrigger.getAll()
    .filter((t) => (t.vars as { id?: string }).id?.startsWith('therapy-'))
    .forEach((t) => t.kill());

  teasers.forEach((teaser, i) => {
    const img = teaser.querySelector<HTMLElement>('.soft-image__img');
    const overlay = teaser.querySelector<HTMLElement>('.accent-overlay');

    // Image breathes: scale 1 → 1.08 as section scrolls through
    if (img) {
      gsap.fromTo(
        img,
        { scale: 1 },
        {
          scale: 1.08,
          ease: 'none',
          scrollTrigger: {
            id: `therapy-img-${i}`,
            trigger: teaser,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 1,
            invalidateOnRefresh: true,
          },
        },
      );
    }

    // Accent overlay: fade in as section enters (max 55% opacity for transparency)
    if (overlay) {
      gsap.fromTo(
        overlay,
        { opacity: 0 },
        {
          opacity: 0.55,
          ease: 'none',
          scrollTrigger: {
            id: `therapy-overlay-${i}`,
            trigger: teaser,
            start: 'top 80%',
            end: 'top 20%',
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    }
  });

  // Force an immediate refresh so GSAP calculates correct state for current scroll position
  ScrollTrigger.refresh();
}

initHomeScroll();
