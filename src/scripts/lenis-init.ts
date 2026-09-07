/** Lenis inertial scroll, wired into GSAP's ticker and ScrollTrigger. */
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!prefersReducedMotion) {
  const lenis = new Lenis({
    lerp: 0.085,
    wheelMultiplier: 1,
    touchMultiplier: 1.5,
    smoothWheel: true,
    // No smoothTouch - native touch scroll feels better on mobile.
  });

  lenis.on('scroll', ScrollTrigger.update);

  // --scroll-y lets pure-CSS layers react to scroll.
  lenis.on('scroll', ({ scroll }: { scroll: number }) => {
    document.documentElement.style.setProperty('--scroll-y', `${scroll}px`);
  });

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  gsap.ticker.lagSmoothing(0);

  // ScrollTrigger must read Lenis's virtual position, not the document's.
  ScrollTrigger.scrollerProxy(document.body, {
    scrollTop(value) {
      if (arguments.length && value !== undefined) {
        lenis.scrollTo(value, { immediate: true });
      }
      return lenis.scroll;
    },
    getBoundingClientRect() {
      return {
        top: 0,
        left: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
    },
    pinType: document.body.style.transform ? 'transform' : 'fixed',
  });

  ScrollTrigger.addEventListener('refresh', () => lenis.resize());
  ScrollTrigger.refresh();

  const header = document.getElementById('site-header');
  lenis.on('scroll', ({ scroll }: { scroll: number }) => {
    header?.classList.toggle('scrolled', scroll > 80);
  });

  // parallax.ts picks this up.
  (window as unknown as Record<string, unknown>).__lenis = lenis;
} else {
  // Reduced motion: ScrollTrigger alone, no Lenis.
  ScrollTrigger.refresh();
}
