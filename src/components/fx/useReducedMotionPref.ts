/**
 * The single source of truth for "should this component hold back" — the OS
 * `prefers-reduced-motion` media query, OR the in-game accessibility toggle
 * in Settings, which sets `data-reduced-motion="1"` on `<html>` (see
 * `src/components/SettingsPanel.tsx`). `src/vfx/particles.ts`'s own
 * `prefersReducedMotion()` already honours both for the particle/shake/flash
 * layer; this hook is the React-friendly equivalent for components in this
 * folder that animate with framer-motion or plain CSS instead of going
 * through `vfx`.
 */
import { useEffect, useState } from 'react';

function computeReduced(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.dataset.reducedMotion === '1') {
    return true;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  return false;
}

/** True when the OS prefers reduced motion, or the in-game toggle is on. */
export function useReducedMotionPref(): boolean {
  const [reduced, setReduced] = useState(computeReduced);

  useEffect(() => {
    const sync = (): void => setReduced(computeReduced());
    sync();

    const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    mq?.addEventListener('change', sync);

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      observer = new MutationObserver(sync);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduced-motion'] });
    }

    return () => {
      mq?.removeEventListener('change', sync);
      observer?.disconnect();
    };
  }, []);

  return reduced;
}

export default useReducedMotionPref;
