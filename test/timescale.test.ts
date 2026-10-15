/**
 * Bending time without losing it.
 *
 * `TimeScale` is the one piece of the VFX layer that can break the whole game
 * rather than just look wrong: a playback rate of zero with nothing left to
 * put it back is a frozen screen, and the player's only recourse is to quit.
 * So the rules it has to keep are not about how a hit-stop feels. They are:
 *
 *   1. it always comes back to 1, from any sequence of calls;
 *   2. it comes back on its own, driven only by the ticker, with nobody
 *      holding a handle to it;
 *   3. it is ticked with REAL frame time, so the clock that ends the bend can
 *      never be slowed by the bend — which is the bug that makes a freeze
 *      permanent, and the reason `tick()` takes unscaled `dt`;
 *   4. two bends landing in the same frame take the SLOWER one, because an
 *      impossible hand is also a win and the second call would otherwise
 *      cancel the first's freeze a millisecond after it started.
 *
 * The previous implementation of this had none of these problems, because it
 * did nothing at all: it computed the ramp, rounded it, stored it in a private
 * field and stopped. Nothing read the field. Three call sites had been firing
 * slow motion into a void for as long as they had existed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TimeScale, rampAt } from '../src/vfx/timescale.ts';

/** Run a scale forward in 16ms frames, like the RAF loop does. */
function run(ts: TimeScale, seconds: number, step = 1 / 60): number[] {
  const seen: number[] = [];
  for (let t = 0; t < seconds; t += step) {
    ts.tick(step);
    seen.push(ts.value);
  }
  return seen;
}

test('a fresh scale is exactly 1 and stays there', () => {
  const ts = new TimeScale();
  assert.equal(ts.value, 1);
  assert.equal(ts.frozen, false);
  for (const v of run(ts, 2)) assert.equal(v, 1);
});

test('a hit-stop freezes, then ends on its own', () => {
  const ts = new TimeScale();
  ts.hitstop(100);
  assert.equal(ts.value, 0);
  assert.equal(ts.frozen, true);

  // Still frozen halfway through.
  run(ts, 0.05);
  assert.equal(ts.frozen, true);

  // And back at full speed well before anything else notices.
  run(ts, 0.2);
  assert.equal(ts.value, 1, 'the freeze must release itself');
  assert.equal(ts.frozen, false);
});

test('slow motion ramps back to 1 and does not overshoot', () => {
  const ts = new TimeScale();
  ts.slowmo(0.42, 900);
  assert.ok(Math.abs(ts.value - 0.42) < 1e-9);

  let prev = ts.value;
  for (const v of run(ts, 0.9)) {
    assert.ok(v >= prev - 1e-9, 'the ramp is monotonic');
    assert.ok(v <= 1 + 1e-9, 'and never goes past normal speed');
    prev = v;
  }
  assert.equal(ts.value, 1);
});

test('the clock is real time — a bend cannot slow its own deadline', () => {
  const ts = new TimeScale();
  ts.hitstop(100);
  // Tick with the SCALED value, the way a naive loop would. If the class
  // leaned on its own output it would never advance and the page would stay
  // frozen forever; it must not care what it is ticked with beyond the number.
  let guard = 0;
  while (ts.frozen && guard++ < 1000) ts.tick(1 / 60);
  assert.ok(guard < 1000, 'the freeze ended');
  assert.ok(guard <= 8, `and ended on schedule, not eventually (took ${guard} frames)`);
});

test('two bends in one frame take the slower, not the latest', () => {
  const ts = new TimeScale();
  ts.hitstop(120);
  ts.slowmo(0.6, 400);          // an impossible hand is also a win
  assert.equal(ts.value, 0, 'the freeze survives the slow-mo landing on top of it');

  // And the slow-mo's ramp is not lost either: there is still a bend after
  // the freeze lets go.
  run(ts, 0.13);
  assert.ok(ts.value < 1, 'the ramp outlives the freeze');
  run(ts, 1);
  assert.equal(ts.value, 1);
});

test('a slower bend replaces a faster one that is already running', () => {
  const ts = new TimeScale();
  ts.slowmo(0.8, 600);
  ts.hitstop(80);
  assert.equal(ts.value, 0);
  run(ts, 1);
  assert.equal(ts.value, 1);
});

test('reset is immediate and idempotent', () => {
  const ts = new TimeScale();
  ts.hitstop(500);
  ts.reset();
  assert.equal(ts.value, 1);
  ts.reset();
  assert.equal(ts.value, 1);
  for (const v of run(ts, 1)) assert.equal(v, 1);
});

test('the ramp curve starts where it is told and ends at 1', () => {
  assert.equal(rampAt(0.42, 0.9, 0), 0.42);
  assert.equal(rampAt(0.42, 0.9, 0.9), 1);
  assert.equal(rampAt(0.42, 0.9, 99), 1);
  assert.equal(rampAt(0.42, 0, 0), 1, 'a zero-length ramp is already over');
  // Ease-out cubic: most of the catching up happens early.
  const mid = rampAt(0, 1, 0.5);
  assert.ok(mid > 0.8, `an ease-out ramp is ${mid} at the halfway point, not 0.5`);
});

test('every reachable sequence of calls still lands on 1', () => {
  // A small fuzz, because the failure mode is a frozen game and the input is
  // whatever order the server's FX events happen to arrive in.
  let seed = 7;
  const rnd = (): number => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let run_ = 0; run_ < 200; run_++) {
    const ts = new TimeScale();
    for (let i = 0; i < 6; i++) {
      if (rnd() < 0.5) ts.hitstop(rnd() * 200);
      else ts.slowmo(rnd(), rnd() * 1000);
      run(ts, rnd() * 0.3);
    }
    run(ts, 3);
    assert.equal(ts.value, 1, 'a frozen screen is the one unacceptable outcome');
  }
});
