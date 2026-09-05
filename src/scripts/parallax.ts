/**
 * parallax.ts - applies translateY to [data-parallax] elements.
 * Sets CSS transform based on scroll position and data-speed factor.
 * Disabled when prefers-reduced-motion: reduce.
 */

function initParallax() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const layers = document.querySelectorAll<HTMLElement>('[data-parallax]');
  if (!layers.length) return;

  const update = () => {
    layers.forEach((layer) => {
      const speed = parseFloat(layer.dataset.speed ?? '0.5');
      const rect = layer.getBoundingClientRect();
      const centerY = rect.top + rect.height / 2;
      const viewportCenter = window.innerHeight / 2;
      const offset = (centerY - viewportCenter) * (1 - speed);
      layer.style.transform = `translateY(${offset}px)`;
    });
  };

  // Use Lenis scroll if available, otherwise native
  const lenis = (window as unknown as Record<string, unknown>).__lenis;
  if (lenis && typeof (lenis as { on: (...args: unknown[]) => void }).on === 'function') {
    (lenis as { on: (event: string, cb: () => void) => void }).on('scroll', update);
  } else {
    window.addEventListener('scroll', update, { passive: true });
  }

  update();
}

initParallax();
