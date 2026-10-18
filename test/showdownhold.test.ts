/**
 * Long enough to read who won with what.
 *
 * "On the final part where it shows who won with what hands... it goes by too
 * quick." Measured from a real table at standard speed before this: a
 * two-hand showdown held for 2688ms. In that time a player has to take in the
 * board, two names, two hand categories and two chip counts, while the
 * winning hand's name is still decoding character by character — the decode
 * alone is about 1.5s of it.
 *
 * So this puts a floor under the thing that was complained about, in the
 * units it was complained about in: seconds in front of a reader. It asserts
 * the hold against what is on screen rather than against the formula, so
 * rebalancing the formula is free and shortening the moment is not.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import type { CardView } from '../shared/cards';
import { DEFAULT_CONFIG, type PayoutInfo, type ShowdownEntry, type TableSpeed } from '../shared/types';

interface Internals { payoutHold(p: PayoutInfo): number }

function engine(speed: TableSpeed = 'standard'): Engine {
  const e = new Engine('HOLD', 'host', { ...DEFAULT_CONFIG, speed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < 3; i++) e.addBot();
  e.start();
  return e;
}

/** A payout with `shown` players turning over a five-card hand. */
function payout(e: Engine, shown: number, impossible = false): PayoutInfo {
  const card = { id: 'x' } as unknown as CardView;
  const ids = e.table.players.map((p) => p.id);
  const entry = (playerId: string, won: number, reveal: boolean): ShowdownEntry => ({
    playerId,
    cards: reveal ? [card, card] : [],
    handName: impossible ? 'Five of a Kind, Aces' : 'Two Pair, Queens and Jacks',
    cat: 0,
    score: 0,
    usedIds: reveal ? ['a', 'b', 'c', 'd', 'e'] : [],
    impossible: impossible && won > 0,
    won,
  });
  return {
    pots: [{ amount: 1000, winners: [ids[1]] }],
    entries: ids.map((id, i) => entry(id, i === 1 ? 1000 : 0, i < shown)),
    shards: {},
  };
}

test('a contested showdown stays on screen long enough to read', () => {
  const e = engine();
  try {
    const hold = (e as unknown as Internals).payoutHold(payout(e, 2));
    // Two hands, a board and two chip counts. The measured "too quick" was
    // 2688ms; anything in that neighbourhood is the bug coming back.
    assert.ok(hold >= 4500, `a two-hand showdown held for only ${hold}ms`);
    assert.ok(hold <= 14000, `${hold}ms is a wait, not a moment`);
  } finally { e.dispose(); }
});

test('every extra hand buys more time, not the same time split', () => {
  const e = engine();
  try {
    const two = (e as unknown as Internals).payoutHold(payout(e, 2));
    const four = (e as unknown as Internals).payoutHold(payout(e, 4));
    assert.ok(four >= two + 1500, `two hands ${two}ms, four hands ${four}ms`);
  } finally { e.dispose(); }
});

test('an impossible hand is not cut off by the ceiling', () => {
  // Four players, five cards each revealed slowly, plus the ceremony: this is
  // the longest the game ever asks for, and it used to hit a 9s cap.
  const e = engine();
  try {
    const hold = (e as unknown as Internals).payoutHold(payout(e, 4, true));
    const reveal = 320 + 5 * 300;
    assert.ok(hold > reveal + 2400, `${hold}ms does not cover the reveal and its ceremony`);
  } finally { e.dispose(); }
});

test('a pot nobody contested still names its winner', () => {
  const e = engine();
  try {
    const hold = (e as unknown as Internals).payoutHold(payout(e, 0));
    assert.ok(hold >= 2000, `an uncontested pot flashed past in ${hold}ms`);
  } finally { e.dispose(); }
});

test('blitz is quicker but still readable', () => {
  const e = engine('blitz');
  try {
    const hold = (e as unknown as Internals).payoutHold(payout(e, 2));
    assert.ok(hold >= 2400, `blitz cut the showdown to ${hold}ms`);
    const std = engine('standard');
    try {
      assert.ok(hold < (std as unknown as Internals).payoutHold(payout(std, 2)),
        'blitz is supposed to be quicker than standard');
    } finally { std.dispose(); }
  } finally { e.dispose(); }
});
