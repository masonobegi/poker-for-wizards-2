/**
 * The balance set of 2026-10-10, pinned.
 *
 * Measured from the player's chair (`npm run fun`, FUN-REVIEW.md): a solo run
 * could end in the first three hands, before the first Market, in one run of
 * seven; and the run arc was upside down, 100 big blinds deep at ante 1 and
 * push-or-fold by ante 7. Three numbers moved. These tests hold them where
 * the measurements put them, so a later change has to mean to move them.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { WARMTH_BY_ANTE, decideAction, warmth } from '../server/game/bots';
import { BLIND_GROWTH, bigBlindAt } from '../server/game/engine';
import { createTable } from '../server/game/table';
import { Rng } from '../shared/rng';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

test('the bots open warm at Hex I and play at full heat from ante 3', () => {
  const t = createTable('WARM', 'h', { ...DEFAULT_CONFIG, hex: 1 });
  t.ante = 1; assert.equal(warmth(t), 0.55);
  t.ante = 2; assert.equal(warmth(t), 0.8);
  t.ante = 3; assert.equal(warmth(t), 1);
  t.ante = 9; assert.equal(warmth(t), 1);
  assert.deepEqual(WARMTH_BY_ANTE, { 1: 0.55, 2: 0.8 });
  for (const hex of [2, 3, 4, 5]) {
    const h = createTable('HOT', 'h', { ...DEFAULT_CONFIG, hex });
    h.ante = 1;
    assert.equal(warmth(h), 1, `Hex ${hex} should start at full heat`);
  }
});

/** Hero facing a 2,000 bet into 4,000 on the river, the same 400 deals at each ante. */
function attackShare(ante: number, isBot: boolean, trials = 400): { attack: number; fold: number } {
  let attack = 0;
  let fold = 0;
  for (let i = 0; i < trials; i++) {
    const t: Table = createTable('PROBE', 'host', { ...DEFAULT_CONFIG, magicEnabled: false });
    for (const pid of ['a', 'b']) {
      t.players.push({
        id: pid, name: pid, isBot, seat: t.players.length, connected: true, ready: true,
        chips: 20000, bet: 0, committed: 0, folded: false, allIn: false, eliminated: false,
        hole: [], sigils: [], relics: [], mana: 5, maxMana: 5, shards: 0,
        warded: false, severed: false, hexed: 0, lastAction: null, avatar: 0,
      } as unknown as Player);
    }
    const deck = new Rng(`deal:${i}`).shuffle([...t.cards.keys()]);
    const hero = t.players[0];
    hero.hole = deck.slice(0, 2);
    t.players[1].hole = deck.slice(7, 9);
    t.board = deck.slice(2, 7);
    t.phase = 'river';
    t.ante = ante;
    t.currentBet = 2000;
    t.minRaise = t.bb;
    t.pot = 4000;
    t.players[1].bet = 2000;
    const act = decideAction(t, hero, new Rng(`act:${i}`));
    if (act.kind === 'raise' || act.kind === 'allin') attack++;
    if (act.kind === 'fold') fold++;
  }
  return { attack: attack / trials, fold: fold / trials };
}

test('a warm bot raises less at ante 1, and folds no more than it would anyway', () => {
  const cold = attackShare(1, true);
  const hot = attackShare(3, true);
  assert.ok(cold.attack < hot.attack * 0.8, `ante 1 ${cold.attack.toFixed(2)} vs ante 3 ${hot.attack.toFixed(2)}`);
  // Calling is untouched: a warm bot is gentler, not a pushover.
  assert.ok(cold.fold <= hot.fold + 0.02, `a warm bot folded more (${cold.fold.toFixed(2)} vs ${hot.fold.toFixed(2)})`);
});

test('warmth is how the house deals, not how a player plays: a human seat is never warmed', () => {
  // The fun harness drives the player's own seat with this same code.
  assert.deepEqual(attackShare(1, false, 200), attackShare(3, false, 200));
});

test('the blinds climb 1.4x an ante: deep enough late to cast, still a clock', () => {
  assert.equal(BLIND_GROWTH, 1.4);
  const ladder = Array.from({ length: 9 }, (_, i) => bigBlindAt(200, i));
  assert.deepEqual(ladder, [200, 300, 400, 550, 750, 1100, 1500, 2100, 2950]);
  // Doubling Down and the Quickening add a step every ante: still a wall.
  assert.ok(bigBlindAt(200, 8 + 4) > 10_000, 'an omen that adds steps no longer bites');
  // A 20,000 stack is 9 big blinds deep at ante 8 instead of 4.
  assert.ok(20_000 / bigBlindAt(200, 7) > 9);
});
