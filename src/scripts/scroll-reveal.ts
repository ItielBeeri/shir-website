/**
 * Reveals [data-reveal] on enter by adding .is-visible; CSS does the transition.
 * data-stagger="80" cascades nested [data-reveal] children.
 */

function initReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;

        const el = entry.target as HTMLElement;
        el.classList.add('is-visible');

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
      // Not a ratio: that is a fraction of the element's own height, so a tall
      // one (the therapy body) needs hundreds of px on screen before it fires
      // and stays hidden while its first paragraph is already in view.
      threshold: 0,
      rootMargin: '0px 0px -5% 0px',
    },
  );

  document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    observer.observe(el);
  });
}

initReveal();
