/**
 * Burned is burned.
 *
 * "Things like burn should burn the card FOREVER. All things that happen
 * should more or less be FOREVER things unless otherwise specified." Burn's
 * own card says "Destroy a community card. The board is shorter now. It is
 * not replaced." — and it used to put the card in the discard, which folds
 * back into the deck when the deck runs dry and is rebuilt from scratch at
 * the start of the next hand. The card was destroyed for about ninety
 * seconds.
 *
 * And the row used to close up behind it, so the hole moved to the end and
 * the board looked like a street had been skipped. It leaves a hole where it
 * was, and `displaySlot` is what keeps the hole in the right place when more
 * than one card goes.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { burnCard, displaySlot } from '../server/game/table';
import { makeCard, type Rank, type Suit } from '../shared/cards';
import { DEFAULT_CONFIG, type Table } from '../shared/types';

interface Internals {
  beginHand(): void;
  dealStreet(phase: string): void;
}

function table(seed: string): { e: Engine; t: Table; ix: Internals } {
  const e = new Engine('BURN', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addBot();
  e.start();
  e.dispose();
  return { e, t: e.table, ix: e as unknown as Internals };
}

function place(t: Table, rank: Rank, suit: Suit): string {
  const c = makeCard(rank, suit);
  t.cards.set(c.id, c);
  return c.id;
}

test('a burned card leaves the board, the deck, and the run', () => {
  const { e, t, ix } = table('burn:forever');
  t.board = [];
  const doomed = place(t, 7, 'S');
  t.deck = [doomed, place(t, 2, 'H'), place(t, 9, 'C')];
  ix.dealStreet('flop');
  assert.ok(t.board.includes(doomed));

  burnCard(t, doomed);
  assert.ok(!t.board.includes(doomed), 'still on the board');
  assert.ok(!t.deck.includes(doomed), 'still in the deck');
  assert.ok(!t.discard.includes(doomed), 'in the discard, which folds back in');
  assert.equal(t.cards.get(doomed)?.destroyed, true, 'not marked destroyed');

  // The next hand builds a fresh deck out of everything that still exists.
  ix.beginHand();
  assert.ok(!t.deck.includes(doomed), 'it came back next hand');
  assert.ok(t.cards.has(doomed), 'the entity is kept so old log lines resolve');
  e.dispose();
});

test('the hole stays where the card was, even after two burns', () => {
  const { e, t, ix } = table('burn:holes');
  t.board = [];
  const a = place(t, 4, 'S');
  const b = place(t, 5, 'H');
  const c = place(t, 6, 'D');
  const d = place(t, 7, 'C');
  t.deck = [a, b, c];
  ix.dealStreet('flop');
  t.deck = [d];
  ix.dealStreet('turn');
  assert.deepEqual(t.board, [a, b, c, d]);

  burnCard(t, b);              // the second card of four
  assert.deepEqual(t.burnedSlots, [1]);
  burnCard(t, d);              // the fourth, now living at live index 2
  assert.deepEqual(t.burnedSlots, [1, 3], 'the second hole landed in the wrong place');
  assert.deepEqual(t.board, [a, c]);
  e.dispose();
});

test('displaySlot maps a live index onto the row the table shows', () => {
  assert.equal(displaySlot(0, []), 0);
  assert.equal(displaySlot(2, []), 2);
  // One hole at 1: live 1 is the third seat of the row.
  assert.equal(displaySlot(1, [1]), 2);
  assert.equal(displaySlot(0, [1]), 0);
  // Holes at 0 and 2: live 0 lands at 1, live 1 lands at 3.
  assert.equal(displaySlot(0, [0, 2]), 1);
  assert.equal(displaySlot(1, [0, 2]), 3);
});

test('a card set in amber cannot be burned by the Burning mark', () => {
  const { e, t, ix } = table('burn:amber');
  t.board = [];
  const safe = place(t, 11, 'H');
  t.cards.get(safe)!.marks = ['burning'];
  t.cards.get(safe)!.amber = true;
  t.deck = [safe, place(t, 3, 'C'), place(t, 8, 'D')];
  ix.dealStreet('flop');

  (e as unknown as { burnOffBoard(): void }).burnOffBoard();
  assert.ok(t.board.includes(safe), 'amber did not hold');
  assert.ok(!t.cards.get(safe)!.destroyed);
  e.dispose();
});
