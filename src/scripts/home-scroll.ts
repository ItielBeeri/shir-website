/**
 * home-scroll.ts — GSAP scroll choreography for the home page.
 *
 * Behaviours:
 * 1. Section-snap: wheel/touch "ticks" jump Lenis to the next major section
 *    with a graceful ease. In-between there is a brief lock so the snap
 *    completes before the next one fires — giving the "gentle chapter jump"
 *    feel while preserving Lenis inertia within a section.
 *
 * 2. Therapy triptych: image scale 1.0 → 1.08 on scroll (scrub).
 *
 * 3. Accent overlay: fades in/out as section enters viewport.
 *
 * Disabled when prefers-reduced-motion: reduce.
 */
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/* ─────────────────────────────────────────────────────────────
   1. Section-snap (gentle chapter jumps)
───────────────────────────────────────────────────────────── */

function initSectionSnap() {
  // Collect snap targets — hero + intro + each therapy teaser + blog + closing
  const SNAP_SELECTORS = [
    '#hero-section',
    '.intro-block',
    '.therapy-teaser',
    '.blog-teaser',
    '.closing-section',
  ] as const;

  const sections = Array.from(
    document.querySelectorAll<HTMLElement>(SNAP_SELECTORS.join(', ')),
  ).filter(Boolean);

  if (sections.length < 2) return;

  const lenis = (window as unknown as Record<string, unknown>).__lenis as
    | {
        scrollTo: (target: number, opts: { duration: number; easing: (t: number) => number }) => void;
        scroll: number;
        on: (event: string, cb: (e: { scroll: number }) => void) => void;
        stop: () => void;
        start: () => void;
      }
    | undefined;

  if (!lenis) return; // safety guard (reduced-motion path has no Lenis)

  let isSnapping = false;
  let currentIndex = 0;

  /** Find which section contains the current scroll position */
  const getCurrentIndex = (): number => {
    const scroll = lenis.scroll;
    let best = 0;
    for (let i = 0; i < sections.length; i++) {
      const top = sections[i].getBoundingClientRect().top + scroll;
      if (scroll >= top - window.innerHeight * 0.3) best = i;
    }
    return best;
  };

  /** Custom easing — ease-out-quart for a buttery deceleration */
  const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);

  const snapTo = (index: number) => {
    if (isSnapping) return;
    index = Math.max(0, Math.min(sections.length - 1, index));
    if (index === currentIndex && Math.abs(lenis.scroll - sections[index].getBoundingClientRect().top - lenis.scroll) < 4) return;

    currentIndex = index;
    isSnapping = true;

    const targetY =
      sections[index].getBoundingClientRect().top + lenis.scroll;

    lenis.scrollTo(targetY, {
      duration: 1.05,
      easing: easeOutQuart,
    });

    // Release lock after animation completes + small buffer
    setTimeout(() => {
      isSnapping = false;
    }, 1200);
  };

  // Sync currentIndex to scroll position (for when user resizes / reloads mid-page)
  lenis.on('scroll', () => {
    if (!isSnapping) {
      currentIndex = getCurrentIndex();
    }
  });

  /* Wheel handler — always preventDefault so Lenis never sees the raw
     wheel event while snap is active. A snap fires when the accumulated
     delta crosses the threshold (one deliberate scroll gesture).
     Threshold is kept low (20px) so even slow trackpad swipes register. */
  const WHEEL_THRESHOLD = 20; // px accumulated delta before a snap fires
  let wheelAccum = 0;
  let wheelTimer: ReturnType<typeof setTimeout> | null = null;

  const onWheel = (e: WheelEvent) => {
    // Always prevent default — snap is the only scroll driver on this page
    e.preventDefault();

    if (isSnapping) return;

    wheelAccum += e.deltaY;

    if (wheelTimer) clearTimeout(wheelTimer);
    // Reset accumulator if no new wheel events arrive within 250ms
    wheelTimer = setTimeout(() => { wheelAccum = 0; }, 250);

    if (Math.abs(wheelAccum) >= WHEEL_THRESHOLD) {
      const direction = wheelAccum > 0 ? 1 : -1;
      wheelAccum = 0;
      if (wheelTimer) clearTimeout(wheelTimer);
      snapTo(currentIndex + direction);
    }
  };

  /* Touch handler */
  let touchStartY = 0;
  const TOUCH_THRESHOLD = 50;

  const onTouchStart = (e: TouchEvent) => {
    touchStartY = e.touches[0].clientY;
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (isSnapping) return;
    const delta = touchStartY - e.changedTouches[0].clientY;
    if (Math.abs(delta) >= TOUCH_THRESHOLD) {
      snapTo(currentIndex + (delta > 0 ? 1 : -1));
    }
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchend', onTouchEnd, { passive: true });

  // Initial index sync after a frame
  requestAnimationFrame(() => {
    currentIndex = getCurrentIndex();
  });
}

/* ─────────────────────────────────────────────────────────────
   2. Therapy triptych scroll effects
───────────────────────────────────────────────────────────── */

function initHomeScroll() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const teasers = document.querySelectorAll<HTMLElement>('.therapy-teaser');
  if (!teasers.length) return;

  ScrollTrigger.getAll()
    .filter((t) => (t.vars as { id?: string }).id?.startsWith('therapy-'))
    .forEach((t) => t.kill());

  teasers.forEach((teaser, i) => {
    const img = teaser.querySelector<HTMLElement>('.soft-image__img');
    const overlay = teaser.querySelector<HTMLElement>('.accent-overlay');

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

  ScrollTrigger.refresh();

  // Wire section snap after Lenis has had a frame to initialise
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      initSectionSnap();
    });
  });
}

initHomeScroll();
