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
 * a brief glow.
 *
 * Two layers, so counting costs nothing outside itself. The final value sits
 * in the flow, transparent: it sets the width and the baseline and is what a
 * screen reader reads. The counting digits are an absolutely placed overlay
 * with `contain: strict`, which Chromium treats as a relayout boundary. The
 * first version wrote the digits into the flow, and each frame of the count
 * re-laid-out whatever held it: on the game-over panel under a 4x CPU
 * throttle that was 300ms of layout per run summary (test/anim-frames.mjs).
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
const TWOS_MS = 1000 / 30;

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
    let shown = -1;
    const tick = (now: number): void => {
      if (!start) start = now;
      // Digits change "on twos", 30 times a second, the way the basketball
      // game animates its props: nobody reads a digit that lasts 16ms, and it
      // halves the text writes on a frame budget a Deck has to share.
      const step = Math.floor((now - start) / TWOS_MS);
      const v = countUpValue(0, value, now - start, duration);
      if (step !== shown || v === value) { shown = step; setText(el, format(v)); }
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
    <span className={`hx-countup${className ? ` ${className}` : ''}`}>
      <span className="hx-countup__hold">{format(value)}</span>
      <span ref={ref} className="hx-countup__live" aria-hidden>{format(value)}</span>
    </span>
  );
}

export const CountUp = memo(CountUpBase);
export default CountUp;
