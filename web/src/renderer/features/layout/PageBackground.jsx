import { useEffect, useRef } from 'react';
import './page-motion.css';

const SCROLL_SURFACES = '.item-gallery-grid, .catalog-tree-panel, .editor-pane';

export default function PageBackground() {
  const layerRef = useRef(null);

  useEffect(() => {
    const layer = layerRef.current;
    const shell = layer?.parentElement;
    if (!shell || typeof window.requestAnimationFrame !== 'function') return;

    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let stopped = false;
    let frame = null;
    let pendingSource = null;

    function documentSource() {
      return document.scrollingElement || document.documentElement;
    }

    function defaultSource() {
      const page = documentSource();
      if (page.scrollHeight > page.clientHeight) return page;
      return [...shell.querySelectorAll(SCROLL_SURFACES)].find(surface => surface.scrollHeight > surface.clientHeight) || page;
    }

    function draw() {
      frame = null;
      if (stopped || preference?.matches) return;
      const source = pendingSource?.isConnected ? pendingSource : defaultSource();
      pendingSource = null;
      const range = Math.max(0, source.scrollHeight - source.clientHeight);
      const progress = range ? Math.min(1, Math.max(0, source.scrollTop / range)) : 0;
      layer.style.setProperty('--page-parallax-y', `${Math.round(-56 * progress * 100) / 100}px`);
    }

    function schedule(source) {
      if (stopped || preference?.matches) return;
      pendingSource = source;
      if (frame === null) frame = window.requestAnimationFrame(draw);
    }

    function onScroll(event) {
      const target = event.target;
      if (target === document || target === window) {
        schedule(documentSource());
      } else if (target instanceof Element && shell.contains(target) && target.matches(SCROLL_SURFACES)
        && !target.closest('[role="dialog"], .dialog-backdrop') && target.scrollHeight > target.clientHeight) {
        schedule(target);
      }
    }

    function cancelPending() {
      if (frame !== null) window.cancelAnimationFrame?.(frame);
      frame = null;
      pendingSource = null;
    }

    function onPreferenceChange() {
      cancelPending();
      if (preference?.matches) layer.style.setProperty('--page-parallax-y', '0px');
      else schedule(defaultSource());
    }

    function onResize() {
      schedule(defaultSource());
    }

    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    if (preference?.addEventListener) preference.addEventListener('change', onPreferenceChange);
    else preference?.addListener?.(onPreferenceChange);
    onPreferenceChange();

    return () => {
      stopped = true;
      cancelPending();
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      if (preference?.removeEventListener) preference.removeEventListener('change', onPreferenceChange);
      else preference?.removeListener?.(onPreferenceChange);
    };
  }, []);

  return <div ref={layerRef} className="page-background" aria-hidden="true" />;
}
