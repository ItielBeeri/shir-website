/**
 * Lenis smooth scroll + GSAP ScrollTrigger integration.
 * Lenis drives GSAP's ticker via scrollerProxy.
 * Disabled when prefers-reduced-motion: reduce.
 */
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
    // smoothTouch: false — native touch scroll feels better on mobile
  });

  // Drive GSAP's ticker from Lenis
  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });

  gsap.ticker.lagSmoothing(0);

  // Register scrollerProxy so ScrollTrigger reads Lenis's virtual scroll position
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

  // Header glass on scroll (driven by Lenis scroll event)
  const header = document.getElementById('site-header');
  lenis.on('scroll', ({ scroll }: { scroll: number }) => {
    header?.classList.toggle('scrolled', scroll > 80);
  });

  // Expose lenis globally for other scripts
  (window as unknown as Record<string, unknown>).__lenis = lenis;
} else {
  // Reduced motion: still wire up ScrollTrigger without Lenis
  ScrollTrigger.refresh();
}
