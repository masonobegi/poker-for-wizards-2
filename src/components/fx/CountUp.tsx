/**
 * A payoff number that counts up from zero and lands with a pop.
 *
 * Ported from the basketball roguelike's reward screen: the total counts up
 * over 0.9s, eased out so the digits race and then settle, and the moment it
 * reaches the total it pops (1.18x -> 1x) — the number arriving is the beat,
 * not the number existing. `RollingNumber` is the right tool for a value that
 * keeps changing (a stack, a bet); this is for a total that is announced once.
 *
 * Under reduced motion the total is shown from the first frame and the pop is
 * a brief glow. It renders one plain inline-block span whose min-width is
 * reserved for the final value's characters from the first frame, so with the
 * caller's tabular `mono` digits a growing number does not shove its row.
 */
import { memo, useEffect, useRef } from 'react';
import { countUpValue, motionPrefs, punch } from './arcade';
import { useReducedMotionPref } from './useReducedMotionPref';

export interface CountUpProps {
  value: number;
  /** Milliseconds before counting starts (to sit behind an entrance). */
  delay?: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

const fmt = (n: number): string => n.toLocaleString();

/** Writes into React's own text node rather than replacing it, so a later
 *  render still owns the node it thinks it owns. */
function setText(el: HTMLElement, text: string): void {
  const node = el.firstChild;
  if (node && node.nodeType === 3) node.nodeValue = text;
  else el.textContent = text;
}

function CountUpBase({ value, delay = 0, duration = 900, format = fmt, className }: CountUpProps) {
  const reduced = useReducedMotionPref();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const prefs = motionPrefs();
    if (reduced || prefs.reduced || typeof requestAnimationFrame !== 'function') {
      setText(el, format(value));
      const t = window.setTimeout(() => punch(el, 'land', prefs), delay);
      return () => window.clearTimeout(t);
    }
    setText(el, format(0));
    let raf = 0;
    let start = 0;
    const tick = (now: number): void => {
      if (!start) start = now;
      const v = countUpValue(0, value, now - start, duration);
      setText(el, format(v));
      if (v === value) { punch(el, 'land', prefs); return; }
      raf = requestAnimationFrame(tick);
    };
    const t = window.setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    return () => { window.clearTimeout(t); cancelAnimationFrame(raf); };
    // `format` is a render-time callback; re-running on its identity would
    // restart the count on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, delay, duration, reduced]);

  return (
    <span
      ref={ref}
      className={`hx-countup${className ? ` ${className}` : ''}`}
      style={{ minWidth: `${format(value).length}ch` }}
    >
      {format(value)}
    </span>
  );
}

export const CountUp = memo(CountUpBase);
export default CountUp;
