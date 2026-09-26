/**
 * Bots look at a spell before they cast it.
 *
 * The magic layer is meant to be readable: an opponent's cast should say
 * something about their hand. Bots that fire at random targets fill the ledger
 * with spells that did nothing and teach a watching player nothing. These
 * tests hold the two halves of that: a bot never casts a spell that cannot do
 * anything, and a bot rarely spends a counter on a spell that does not touch
 * it.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { decideCast, decideResponse } from '../server/game/bots';
import { createTable } from '../server/game/table';
import { Rng } from '../shared/rng';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

function seat(t: Table, id: string, sigils: string[]): Player {
  const p = {
    id, name: id, isBot: true, seat: t.players.length, connected: true, ready: true,
    chips: 20000, bet: 0, committed: 0, folded: false, allIn: false, eliminated: false,
    hole: [], sigils: sigils.map((defId, i) => ({ uid: `${id}-${i}`, defId })),
    relics: [], mana: 9, maxMana: 10, shards: 0, coven: 'unaligned',
    warded: false, severed: false, hexed: 0, blinded: false, sittingOut: false,
    lastAction: null, avatar: 0,
    foreknowledge: { deckPeek: [], seenHole: [], divergedFrom: {}, lies: {} },
  } as unknown as Player;
  t.players.push(p);
  return p;
}

/** A flop with nothing undecided anywhere on it. */
function flop(trial: number): { t: Table; a: Player; b: Player } {
  const t = createTable('PROBE', 'host', { ...DEFAULT_CONFIG, botSkill: 'master' });
  const a = seat(t, 'a', ['collapse']);
  const b = seat(t, 'b', ['nullify']);
  const deck = new Rng(`bm:${trial}`).shuffle([...t.cards.keys()]);
  a.hole = deck.slice(0, 2);
  b.hole = deck.slice(2, 4);
  t.board = deck.slice(4, 7);
  t.deck = deck.slice(7);
  t.phase = 'flop';
  t.pot = 1000;
  return { t, a, b };
}

test('a bot never casts Collapse when nothing is undecided', () => {
  for (let i = 0; i < 120; i++) {
    const { t, a } = flop(i);
    const cast = decideCast(t, a, new Rng(`c:${i}`));
    assert.equal(cast, null, `trial ${i} cast a Collapse with nothing to collapse`);
  }
});

test('a bot rarely counters a spell that does not touch its hand', () => {
  let answered = 0;
  const trials = 150;
  for (let i = 0; i < trials; i++) {
    const { t, a, b } = flop(i);
    // Foresight only shows its caster the river. It changes nobody's cards.
    t.phase = 'preflop';
    t.board = [];
    t.stack = {
      entries: [{
        id: 'x', casterId: a.id, sigilId: 'foresight', targets: {}, countered: false, costPaid: 2,
      }],
      pending: [b.id],
      closesAt: Date.now() + 5000,
    };
    if (decideResponse(t, b, new Rng(`r:${i}`))) answered++;
  }
  assert.ok(answered / trials < 0.2, `countered a harmless peek ${answered} times in ${trials}`);
});
