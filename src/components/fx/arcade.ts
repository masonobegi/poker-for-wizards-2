/**
 * Arcade impact, ported from the basketball roguelike's cut-ins (2026-10-11).
 *
 * That game's big plays feel good for four reasons, and each one is a small
 * rule here rather than a look copied wholesale:
 *
 *  1. Things LAND. A word or a badge arrives larger than it ends and snaps down
 *     through a slight overshoot (easeOutBack, `EASE_SNAP`), instead of fading
 *     up. Its callouts go 3x -> 1x in 0.15s; its charm slots 1.25x -> 1x in
 *     0.25s.
 *  2. Impact frames. At contact the thing goes white for two or three frames
 *     and fades back over ~80ms (`_hit_flash`: 3/60s held, 0.08s fade). Short
 *     enough to read as a hit rather than as a light.
 *  3. Squash and stretch, on contact and on the way out: a callout leaves by
 *     stretching wide and flattening (`scaleX 1 + 1.4s, scaleY 1 - s`).
 *  4. Nothing waits on it. Every one of these is decoration over a game that
 *     keeps running; none of them blocks input or holds a turn.
 *
 * The two accessibility settings are kept apart, as they are everywhere else:
 *
 *  - Reduced motion keeps the cue and drops the movement. A punch becomes a
 *    brief glow at the soft peak; a slam becomes a fade. Never louder than the
 *    full version, never deleted.
 *  - Reduce flashing keeps the movement and caps the white at FLASH_SOFT, a
 *    glow rather than a flash.
 *
 * The keyframe builders are pure so the rules above are unit-tested
 * (test/arcade.test.ts) instead of only eyeballed.
 */
import type { MotionProps, Transition } from 'framer-motion';
import { EASE_OUT, EASE_SNAP, T_REDUCED } from '@/styles/motion';

export interface MotionPrefs {
  /** Reduced motion: the OS preference or the in-game toggle. */
  reduced: boolean;
  /** Reduce flashing: its own toggle, and implied by reduced motion. */
  noFlash: boolean;
}

/** Both settings, read the same way `videoPrefs.ts` publishes them. */
export function motionPrefs(): MotionPrefs {
  if (typeof document === 'undefined') return { reduced: false, noFlash: false };
  const ds = document.documentElement.dataset;
  let os = false;
  try { os = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no media queries */ }
  const reduced = ds.reducedMotion === '1' || os;
  return { reduced, noFlash: reduced || ds.reducedFlashing === '1' };
}

/** Peak brightness of an impact frame. */
export const FLASH_PEAK = 2.4;
/** The cap when flashing is reduced, and the whole cue under reduced motion. */
export const FLASH_SOFT = 1.3;

export const flashPeak = (p: MotionPrefs): number => (p.noFlash ? FLASH_SOFT : FLASH_PEAK);

const bezier = (c: readonly number[]): string => `cubic-bezier(${c.join(', ')})`;
export const CSS_EASE_SNAP = bezier(EASE_SNAP);
export const CSS_EASE_OUT = bezier(EASE_OUT);

// ---------------------------------------------------------------------------
// Punch: a one-shot pop on an element nothing else animates (WAAPI)
// ---------------------------------------------------------------------------

/**
 * - `relic`  a relic's rule just fired (the charm-trigger punch).
 * - `impact` a spell struck this card (squash on contact plus impact frames).
 * - `land`   a number finished counting and lands (the reward count-up's pop).
 */
export type PunchKind = 'relic' | 'impact' | 'land';

export interface PunchPlan {
  /** null under reduced motion: the movement goes, the glow stays. */
  transform: Keyframe[] | null;
  transformMs: number;
  transformEasing: string;
  filter: Keyframe[];
  filterMs: number;
}

export function punchPlan(kind: PunchKind, p: MotionPrefs): PunchPlan {
  const peak = flashPeak(p);
  const glow = (top: number, hold = 0): Keyframe[] => (hold > 0
    ? [{ filter: `brightness(${top})`, offset: 0 }, { filter: `brightness(${top})`, offset: hold }, { filter: 'brightness(1)', offset: 1 }]
    : [{ filter: `brightness(${top})` }, { filter: 'brightness(1)' }]);

  if (kind === 'impact') {
    return {
      // Squash flat on contact, rebound a little tall, settle.
      transform: p.reduced ? null : [
        { transform: 'scale(1.12, 0.88)', offset: 0 },
        { transform: 'scale(0.96, 1.05)', offset: 0.45 },
        { transform: 'scale(1, 1)', offset: 1 },
      ],
      transformMs: 240,
      transformEasing: CSS_EASE_OUT,
      // Two frames of white at 60fps, then gone by 130ms.
      filter: glow(p.reduced ? FLASH_SOFT : peak, 0.3),
      filterMs: 130,
    };
  }
  if (kind === 'land') {
    return {
      transform: p.reduced ? null : [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      transformMs: 200,
      transformEasing: CSS_EASE_SNAP,
      filter: glow(p.reduced ? FLASH_SOFT : Math.min(peak, 1.6)),
      filterMs: 260,
    };
  }
  // relic: 1.25 -> 1 with overshoot in 0.25s; overbright 2 -> 1 over 0.35s.
  return {
    transform: p.reduced ? null : [{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
    transformMs: 250,
    transformEasing: CSS_EASE_SNAP,
    filter: glow(p.reduced ? FLASH_SOFT : Math.min(peak, 2)),
    filterMs: 350,
  };
}

/**
 * Plays a punch on an element. A no-op without WAAPI (jsdom, a very old
 * engine) and never throws: this is decoration.
 *
 * `composite: 'add'` layers the punch on top of whatever the element already
 * has — a dimmed seat's filter, a winning card's float — instead of replacing
 * it for a quarter of a second.
 */
export function punch(el: Element | null | undefined, kind: PunchKind, prefs: MotionPrefs = motionPrefs()): void {
  const h = el as HTMLElement | null | undefined;
  if (!h || typeof h.animate !== 'function') return;
  const plan = punchPlan(kind, prefs);
  try {
    if (plan.transform) {
      h.animate(plan.transform, { duration: plan.transformMs, easing: plan.transformEasing, composite: 'add' });
    }
    h.animate(plan.filter, { duration: plan.filterMs, easing: 'linear', composite: 'add' });
  } catch { /* decoration only */ }
}

// ---------------------------------------------------------------------------
// Slam: a word that lands (framer-motion props)
// ---------------------------------------------------------------------------

export interface SlamOptions {
  /** Starting scale. The basketball callouts use 3-3.4; a stamp on a seat ~2.4. */
  from?: number;
  /** Resting tilt, in degrees. Kept in the transform so it survives framer. */
  rotate?: number;
  /** Seconds before it lands. */
  delay?: number;
}

export interface SlamMotion {
  initial: MotionProps['initial'];
  animate: MotionProps['animate'];
  exit: MotionProps['exit'];
  transition: Transition;
}

/** How a slammed word leaves: stretched wide, flattened, gone. */
export const SLAM_EXIT = { x: 2.2, y: 0.08 } as const;

/**
 * framer props for a word that slams in, flashes on contact and squashes out.
 * Full transform strings throughout, never the x/y/scale shorthands, so the
 * element's resting tilt and the slam compose in one property.
 */
export function slamMotion(p: MotionPrefs, o: SlamOptions = {}): SlamMotion {
  const from = o.from ?? 2.4;
  const tilt = `rotate(${o.rotate ?? 0}deg)`;
  const d = o.delay ?? 0;
  if (p.reduced) {
    return {
      initial: { opacity: 0, transform: `scale(1) ${tilt}` },
      animate: { opacity: 1, transform: `scale(1) ${tilt}` },
      exit: { opacity: 0 },
      transition: { duration: T_REDUCED, ease: EASE_OUT, delay: d },
    };
  }
  const peak = flashPeak(p);
  return {
    initial: { opacity: 0, transform: `scale(${from}) ${tilt}`, filter: `brightness(${peak})` },
    animate: {
      opacity: 1,
      transform: `scale(1) ${tilt}`,
      // Held white for the first frames after contact, then back.
      filter: [`brightness(${peak})`, `brightness(${peak})`, 'brightness(1)'],
    },
    exit: {
      opacity: 0,
      transform: `scale(${SLAM_EXIT.x}, ${SLAM_EXIT.y}) ${tilt}`,
      transition: { duration: 0.18, ease: EASE_OUT },
    },
    transition: {
      transform: { duration: 0.18, ease: EASE_SNAP, delay: d },
      opacity: { duration: 0.05, delay: d },
      filter: { duration: 0.24, times: [0, 0.45, 1], ease: 'linear', delay: d },
    },
  };
}

// ---------------------------------------------------------------------------
// Count-up
// ---------------------------------------------------------------------------

/**
 * The value a count-up shows `elapsed` ms into a `duration` ms count, eased
 * out (cubic) so the digits race first and settle onto the total — the
 * basketball reward screen's `tween_method(..., 0.9).set_ease(EASE_OUT)`.
 */
export function countUpValue(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  const s = elapsed / duration;
  const e = 1 - (1 - s) ** 3;
  return Math.round(from + (to - from) * e);
}
