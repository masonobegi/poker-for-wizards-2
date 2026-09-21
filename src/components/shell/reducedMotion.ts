/**
 * Whether motion should be minimized right now, from either source: the OS
 * `prefers-reduced-motion` setting or the in-app manual override. Components
 * in this folder use it to pick a near-zero transition duration instead of
 * relying on CSS transition rules, so framer-motion animations respect it too.
 */
import { useEffect, useState } from 'react';
import { useReducedMotionPref } from './videoPrefs';

function systemPrefersReduced(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

export function useMotionReduced(): boolean {
  const [manual] = useReducedMotionPref();
  const [system, setSystem] = useState(systemPrefersReduced);

  useEffect(() => {
    let mq: MediaQueryList | null = null;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return undefined; }
    const onChange = () => setSystem(mq!.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq?.removeEventListener?.('change', onChange);
  }, []);

  return manual || system;
}

/** Pick a duration (seconds) for a framer-motion `transition`, collapsing to
 * near-zero when motion should be minimized. */
export function motionDuration(base: number, reduced: boolean): number {
  return reduced ? 0.001 : base;
}
