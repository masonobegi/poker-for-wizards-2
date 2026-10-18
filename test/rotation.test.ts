/**
 * The button moves, and the right person acts first.
 *
 * Asked for directly after a two-player session: "make sure first to act
 * rotates like an actual poker game". It did, but nothing held it to that —
 * and the client had been deriving positions itself and getting heads-up
 * wrong, which is exactly the sort of thing that is true until it quietly
 * is not. These are the Hold'em rules, as assertions:
 *
 *   · the button moves one live seat every hand, and skips the dead ones;
 *   · the small blind is the next live seat after the button, the big blind
 *     the one after that;
 *   · heads up, the button IS the small blind and acts first before the flop;
 *   · before the flop the action opens after the big blind;
 *   · after the flop it opens with the first live seat after the button.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { viewFor } from '../server/game/table';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

interface Internals {
  beginHand(): void;
  beginStreet(first?: boolean): void;
  onDeadline: (() => void) | null;
  deadline: number;
}

function table(seed: string, bots: number): { e: Engine; t: Table; ix: Internals } {
  const e = new Engine('ROTA', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < bots; i++) e.addBot();
  e.start();
  e.dispose();
  return { e, t: e.table, ix: e as unknown as Internals };
}

/** Seats still in the run, in seating order from `after` (exclusive). */
function ring(t: Table, after: number): Player[] {
  const live = [...t.players].filter((p) => !p.eliminated).sort((a, b) => a.seat - b.seat);
  const at = live.findIndex((p) => p.seat > after);
  const start = at === -1 ? 0 : at;
  return [...live.slice(start), ...live.slice(0, start)];
}

const seatOf = (t: Table, id: string | null): number => t.players.find((p) => p.id === id)?.seat ?? -1;

test('the button moves one live seat a hand, and the blinds follow it', () => {
  const { e, t, ix } = table('rotation:four', 3);
  const seen: number[] = [];

  for (let hand = 0; hand < 6; hand++) {
    const before = t.dealerSeat;
    ix.beginHand();
    seen.push(t.dealerSeat);

    const expected = ring(t, before)[0];
    assert.equal(t.dealerSeat, expected.seat, `hand ${hand}: the button skipped a seat`);

    // Blinds are the next two live seats round from the button.
    const after = ring(t, t.dealerSeat);
    assert.equal(seatOf(t, t.sbId), after[0].seat, `hand ${hand}: small blind`);
    assert.equal(seatOf(t, t.bbId), after[1].seat, `hand ${hand}: big blind`);

    // And the action opens on the seat after the big blind.
    const afterBb = ring(t, seatOf(t, t.bbId));
    assert.equal(seatOf(t, t.actingId), afterBb[0].seat, `hand ${hand}: first to act preflop`);
  }

  // Four seats, six hands: every seat takes the button, in order, twice over.
  assert.equal(new Set(seen).size, 4, 'the button visited every seat');
  e.dispose();
});

test('after the flop the action opens with the first live seat after the button', () => {
  const { e, t, ix } = table('rotation:postflop', 3);
  ix.beginHand();

  // Nobody has folded, so this is a straight ring question.
  t.phase = 'flop';
  for (const p of t.players) p.bet = 0;
  t.currentBet = 0;
  ix.beginStreet();

  const expected = ring(t, t.dealerSeat)[0];
  assert.equal(seatOf(t, t.actingId), expected.seat,
    'post-flop the small blind acts first, not the seat after the big blind');
  e.dispose();
});

test('the button skips a player who is out of the run', () => {
  const { e, t, ix } = table('rotation:dead-seat', 3);
  ix.beginHand();

  // Knock out whoever would have had the button next.
  const doomed = ring(t, t.dealerSeat)[0];
  doomed.eliminated = true;
  doomed.chips = 0;

  const before = t.dealerSeat;
  ix.beginHand();
  assert.notEqual(t.dealerSeat, doomed.seat, 'the button landed on an empty chair');
  assert.equal(t.dealerSeat, ring(t, before)[0].seat, 'it should pass to the next live seat');
  assert.notEqual(seatOf(t, t.sbId), doomed.seat, 'a dead seat posted the small blind');
  assert.notEqual(seatOf(t, t.bbId), doomed.seat, 'a dead seat posted the big blind');
  e.dispose();
});

test('heads up, the button is the small blind and acts first before the flop', () => {
  const { e, t, ix } = table('rotation:heads-up', 1);
  ix.beginHand();

  assert.equal(t.players.filter((p) => !p.eliminated).length, 2);
  assert.equal(seatOf(t, t.sbId), t.dealerSeat, 'heads up the button posts the small blind');
  assert.notEqual(seatOf(t, t.bbId), t.dealerSeat);
  // The seat after the big blind is the button, so the button opens.
  assert.equal(seatOf(t, t.actingId), t.dealerSeat, 'the button acts first before the flop');

  // ...and acts second after it.
  t.phase = 'flop';
  for (const p of t.players) p.bet = 0;
  t.currentBet = 0;
  ix.beginStreet();
  assert.equal(seatOf(t, t.actingId), seatOf(t, t.bbId),
    'heads up the big blind acts first after the flop');
  e.dispose();
});

test('every seat is told its position, and only one seat holds each', () => {
  const { e, t, ix } = table('rotation:view', 3);
  ix.beginHand();
  const view = viewFor(t, 'host');

  const dealers = view.players.filter((p) => p.pos === 'dealer');
  const sbs = view.players.filter((p) => p.pos === 'sb');
  const bbs = view.players.filter((p) => p.pos === 'bb');
  assert.equal(dealers.length, 1, 'exactly one button');
  assert.equal(sbs.length, 1, 'exactly one small blind');
  assert.equal(bbs.length, 1, 'exactly one big blind');
  assert.equal(dealers[0].seat, t.dealerSeat);
  assert.equal(sbs[0].id, t.sbId);
  assert.equal(bbs[0].id, t.bbId);
  e.dispose();
});
