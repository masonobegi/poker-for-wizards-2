/**
 * Game time, and how to bend it.
 *
 * BasketRogue's motion doc asks for four things and the app had three of them:
 * overshoot on the way in (`EASE_SNAP`), two-to-four-frame hit flashes
 * (`punch`), and screen shake (`vfx.shake`). The fourth — "freeze-frames
 * (hit-stop) of ~0.1s on big moments" — did not exist, and the slow-motion
 * that stood next to it in three call sites was not doing anything either:
 * `VfxEngine.applySlow` rounded a number into a private field, and the only
 * code that read that field was its own early-out. An impossible hand fired
 * `slowmo(0.42, 900)` and nothing on the screen slowed down.
 *
 * The reason it had rotted is worth keeping: it used to publish the scale as
 * `--vfx-time-scale` on `<html>`, which is the broadest style invalidation in
 * the browser, and when the one consumer was removed the writer was left
 * behind. So this does not use a custom property.
 *
 * It uses the Web Animations API instead. `document.getAnimations()` returns
 * every live CSS animation, CSS transition and WAAPI animation on the page,
 * and each of them has a `playbackRate`. Setting it is how you slow down a
 * whole screen's worth of motion that you did not author in one place — the
 * card float, the sigil pulses, the hum bar on the tube, the pot's count-up,
 * all of it — without any of them knowing this file exists.
 *
 * Three rules it follows, each from something that bit:
 *
 *   1. **Always restorable.** A rate of zero that is never put back is a
 *      frozen game. Every bend records a deadline and the ticker restores the
 *      moment it passes, whether or not anybody calls anything again.
 *   2. **Re-applied while bent.** An animation that STARTS during a hit-stop
 *      was not in the list when the rate was set, so it would run at full
 *      speed through a freeze. The ticker re-applies on a slow cadence while
 *      a bend is live; `getAnimations()` allocates, so not every frame.
 *   3. **Never under reduced motion.** Slowing the whole screen is the most
 *      disorienting thing in this file, and a freeze is a frame drop to
 *      anyone who did not ask for it. Both become no-ops.
 */

/** How often to re-apply the rate while a bend is live, in seconds. */
const REAPPLY_EVERY = 0.1;

/** Below this the rate counts as "bent" and is worth the WAAPI call. */
const EPSILON = 0.015;

function animations(): Animation[] {
  if (typeof document === 'undefined') return [];
  const doc = document as Document & { getAnimations?: () => Animation[] };
  if (typeof doc.getAnimations !== 'function') return [];
  try {
    return doc.getAnimations();
  } catch {
    return [];
  }
}

/**
 * What each animation's rate was before this file touched it.
 *
 * Restoring to a flat 1 is wrong and the wrongness is invisible until it
 * isn't: framer-motion reverses an animation by running it at a NEGATIVE
 * rate, and a few of the game's own effects idle at a rate that is not one.
 * Freeze the page while one of those is mid-reverse, put everything back at
 * 1, and that animation finishes playing forwards — once, silently, on the
 * one frame somebody happened to be watching. A WeakMap, so an animation that
 * is collected takes its entry with it.
 */
const priorRate = new WeakMap<Animation, number>();

/**
 * Sets the playback rate of every live animation on the page.
 *
 * Skips anything already finished or idle — setting a rate on a finished
 * animation can restart it — and swallows per-animation failures, because one
 * detached effect must not stop the rest of the screen being restored.
 */
export function setPagePlaybackRate(rate: number): void {
  const list = animations();
  const restoring = rate === 1;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    try {
      if (a.playState === 'finished' || a.playState === 'idle') continue;
      if (restoring) {
        const was = priorRate.get(a);
        priorRate.delete(a);
        // An animation we never bent keeps whatever rate it has.
        if (was === undefined) continue;
        if (a.playbackRate !== was) a.playbackRate = was;
        continue;
      }
      if (!priorRate.has(a)) priorRate.set(a, a.playbackRate);
      if (a.playbackRate !== rate) a.playbackRate = rate;
    } catch {
      /* one animation's problem is not the page's */
    }
  }
}

/**
 * The shape of a slow-motion ramp.
 *
 * Pure, so the curve is unit-tested rather than eyeballed: it starts at
 * `from` and eases back to 1 over `dur` seconds on an ease-out cubic, which
 * is the same curve the engine used before any of it was wired up.
 */
export function rampAt(from: number, dur: number, t: number): number {
  if (dur <= 0 || t >= dur) return 1;
  if (t <= 0) return from;
  const p = t / dur;
  const e = 1 - (1 - p) ** 3;
  return from + (1 - from) * e;
}

export interface Bend {
  /** 0 is a freeze; 0.42 is the impossible hand's slow-mo; 1 is normal. */
  scale: number;
  /** Seconds remaining at this exact scale before the ramp starts. */
  hold: number;
  /** Seconds the ramp back to 1 takes once the hold is over. */
  ramp: number;
}

/**
 * Time, bent.
 *
 * One of these drives the whole page. `VfxEngine` owns the instance and ticks
 * it with REAL frame time — a clock that scales itself can never come back.
 */
export class TimeScale {
  private scale = 1;
  private hold = 0;
  private ramp = 0;
  private from = 1;
  private t = 0;
  private sinceApply = 0;
  /** Whether the page's animations are currently off 1x because of us. */
  private applied = false;

  /** The current multiplier. 1 when nothing is bending it. */
  get value(): number {
    return this.scale;
  }

  /** True while the screen is held still. */
  get frozen(): boolean {
    return this.scale < EPSILON;
  }

  /**
   * A hard freeze, then straight back to full speed. No ramp: a hit-stop that
   * eases out is a slow-mo, and the whole point of the freeze is the hard edge
   * on both sides of it.
   */
  hitstop(ms: number): void {
    this.begin({ scale: 0, hold: Math.max(0, ms) / 1000, ramp: 0 });
  }

  /** A ramp from `scale` back to 1 over `ms`. */
  slowmo(scale: number, ms: number): void {
    const s = scale < 0 ? 0 : scale > 4 ? 4 : scale;
    this.begin({ scale: s, hold: 0, ramp: Math.max(0.001, ms / 1000) });
  }

  /**
   * Takes the SLOWER of the running bend and the new one, rather than letting
   * the last caller win. Two things landing in the same frame — an impossible
   * hand is also a win — would otherwise have the second one cancel the
   * first's freeze a millisecond after it started.
   */
  private begin(b: Bend): void {
    if (b.scale > this.scale && this.remaining() > 0) {
      this.hold = Math.max(this.hold, b.hold);
      this.ramp = Math.max(this.ramp, b.ramp);
      return;
    }
    this.scale = b.scale;
    this.from = b.scale;
    this.hold = b.hold;
    this.ramp = b.ramp;
    this.t = 0;
    this.sinceApply = REAPPLY_EVERY;
    this.apply();
  }

  private remaining(): number {
    return this.hold + Math.max(0, this.ramp - this.t);
  }

  /** Back to normal speed now, and put the page back with it. */
  reset(): void {
    this.scale = 1;
    this.from = 1;
    this.hold = 0;
    this.ramp = 0;
    this.t = 0;
    if (this.applied) {
      setPagePlaybackRate(1);
      this.applied = false;
    }
  }

  /** `dt` is REAL seconds — never the scaled value this returns. */
  tick(dt: number): void {
    if (this.scale === 1 && this.hold === 0 && this.ramp === 0) return;

    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold > 0) {
        this.reapply(dt);
        return;
      }
      dt = -this.hold;
      this.hold = 0;
      if (this.ramp === 0) { this.reset(); return; }
    }

    this.t += dt;
    const next = rampAt(this.from, this.ramp, this.t);
    if (next >= 1 - EPSILON) { this.reset(); return; }
    this.scale = next;
    this.sinceApply += dt;
    if (this.sinceApply >= REAPPLY_EVERY) this.apply();
  }

  private reapply(dt: number): void {
    this.sinceApply += dt;
    if (this.sinceApply >= REAPPLY_EVERY) this.apply();
  }

  private apply(): void {
    this.sinceApply = 0;
    setPagePlaybackRate(this.scale);
    this.applied = true;
  }
}
