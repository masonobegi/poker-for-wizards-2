/**
 * The pot pile.
 *
 * One invariant matters and it is easy to break: a bigger pot must never draw
 * a smaller pile. The first version decomposed the pot into denominations the
 * way a real dealer would, which is authentic and produced exactly that bug —
 * four big blinds came out as four chips and twenty-five as a single one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chipsFor } from '../src/components/table/PotChips';

const BB = 200;

test('a bigger pot never draws a smaller pile', () => {
  let prev = 0;
  let prevPot = 0;
  for (let potBB = 0.5; potBB <= 3000; potBB *= 1.12) {
    const pot = Math.round(potBB * BB);
    const n = chipsFor(pot, BB).length;
    assert.ok(n >= prev, `pot ${pot} drew ${n} chips, but ${prevPot} drew ${prev}`);
    prev = n;
    prevPot = pot;
  }
});

test('the pile is bounded, so a huge pot stays countable', () => {
  assert.ok(chipsFor(50_000_000, BB).length <= 15);
  assert.ok(chipsFor(Number.MAX_SAFE_INTEGER, BB).length <= 15);
});

test('an empty pot draws nothing, and a live one always draws something', () => {
  assert.equal(chipsFor(0, BB).length, 0);
  assert.equal(chipsFor(-100, BB).length, 0);
  // Guard against a divide-by-zero drawing an infinite pile.
  assert.equal(chipsFor(500, 0).length, 0);
  assert.ok(chipsFor(1, BB).length >= 1);
});

test('the pile shifts denomination as the stakes climb', () => {
  const at = (bb: number) => chipsFor(bb * BB, BB);
  assert.ok(!at(2).includes('is-high'), 'a two-blind pot should show no gold');
  assert.ok(!at(2).includes('is-mid'), 'a two-blind pot should show no violet');
  assert.ok(at(10).includes('is-mid'), 'a ten-blind pot should have reached violet');
  assert.ok(at(60).includes('is-high'), 'a sixty-blind pot should have reached gold');
  // And the brightest chips sit on top of the pile, not under it.
  const big = at(100);
  assert.equal(big[big.length - 1], 'is-high');
});
