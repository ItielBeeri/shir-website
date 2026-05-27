/**
 * scroll-reveal.ts — IntersectionObserver-based reveal for [data-reveal] elements.
 * On enter: adds .is-visible → CSS handles fade + translateY(0).
 * Supports data-stagger="80" to cascade direct children.
 */

function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const el = entry.target as HTMLElement;
        el.classList.add('is-visible');

        // Stagger direct children if requested
        const staggerMs = Number(el.dataset.stagger ?? 0);
        if (staggerMs > 0) {
          const children = el.querySelectorAll<HTMLElement>('[data-reveal]');
          children.forEach((child, i) => {
            child.style.transitionDelay = `${i * staggerMs}ms`;
            child.classList.add('is-visible');
          });
        }

        observer.unobserve(el);
      });
    },
    {
      threshold: 0.15,
      rootMargin: '0px 0px -10% 0px',
    },
  );

  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    observer.observe(el);
  });
}

// Run on initial load
initReveal();
