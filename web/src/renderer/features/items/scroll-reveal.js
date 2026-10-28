// Content stays visible by default; observation only adds a brief entrance.
export function observeScrollReveal(container, seen) {
  if (!container) return undefined;
  const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let observer;
  let active = true;

  function clearMotion() {
    container.querySelectorAll('.scroll-reveal-enter').forEach(element => element.classList.remove('scroll-reveal-enter'));
  }

  function configure() {
    observer?.disconnect();
    observer = null;
    clearMotion();
    if (preference?.matches || typeof IntersectionObserver !== 'function') return;
    const waiting = new WeakSet();
    try {
      const next = new IntersectionObserver(entries => {
        if (!active || observer !== next || preference?.matches) return;
        for (const { target, isIntersecting } of entries) {
          if (!container.contains(target) || seen.has(target)) continue;
          if (!isIntersecting) {
            waiting.add(target);
            continue;
          }
          seen.add(target);
          next.unobserve(target);
          // The initial visible cards never wait for an animation.
          if (waiting.has(target)) target.classList.add('scroll-reveal-enter');
        }
      }, { threshold: 0.05 });
      observer = next;
      container.querySelectorAll('.item-gallery-card').forEach(element => {
        if (!seen.has(element)) next.observe(element);
      });
    } catch {
      observer?.disconnect();
      observer = null;
    }
  }

  function finish(event) {
    if (event.target.matches?.('.item-gallery-card')) event.target.classList.remove('scroll-reveal-enter');
  }

  configure();
  if (preference?.addEventListener) preference.addEventListener('change', configure);
  else preference?.addListener?.(configure);
  container.addEventListener('animationend', finish);
  container.addEventListener('animationcancel', finish);
  container.addEventListener('focusin', finish);

  return () => {
    active = false;
    observer?.disconnect();
    if (preference?.removeEventListener) preference.removeEventListener('change', configure);
    else preference?.removeListener?.(configure);
    container.removeEventListener('animationend', finish);
    container.removeEventListener('animationcancel', finish);
    container.removeEventListener('focusin', finish);
    clearMotion();
  };
}
