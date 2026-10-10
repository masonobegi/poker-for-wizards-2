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

import { decideCast, decideResponse, previewClock } from '../server/game/bots';
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

/**
 * Run `fn` with the bots' preview budget on a simulated clock.
 *   - 'idle': time stands still while a bot thinks, so every preview is
 *     measured, as on a quiet server.
 *   - 'overloaded': every read of the clock is a second later than the last,
 *     so the budget is spent before the first equity read, as on a server at
 *     100% CPU.
 * The wall clock made this test pass or fail with the machine's load: a busy
 * box skipped the equity reads and the bot decided differently.
 */
function onClock<T>(kind: 'idle' | 'overloaded', fn: () => T): T {
  const real = previewClock.now;
  let now = 0;
  previewClock.now = kind === 'idle' ? () => 0 : () => (now += 1000);
  try { return fn(); } finally { previewClock.now = real; }
}

function counteredHarmlessPeeks(): number {
  let answered = 0;
  for (let i = 0; i < 150; i++) {
    const { t, a, b } = flop(i);
    // Foresight only shows its caster the river. It changes nobody's cards.
    t.phase = 'preflop';
    t.board = [];
    t.stack = {
      entries: [{
        id: 'x', casterId: a.id, sigilId: 'foresight', targets: {}, countered: false, costPaid: 2,
      }],
      pending: [b.id],
      closesAt: 0,
    };
    if (decideResponse(t, b, new Rng(`r:${i}`))) answered++;
  }
  return answered;
}

test('a bot rarely counters a spell that does not touch its hand', () => {
  const answered = onClock('idle', counteredHarmlessPeeks);
  assert.ok(answered / 150 < 0.2, `countered a harmless peek ${answered} times in 150`);
  // Same seeds, same simulated clock, same answer: nothing here reads the
  // wall clock any more.
  assert.equal(onClock('idle', counteredHarmlessPeeks), answered);
});

test('a busy server does not make bots counter harmless spells', () => {
  // With the budget spent, the equity reads are skipped. The bot used to fall
  // back to rarity alone and Nullify about a third of harmless peeks, so the
  // same table played differently depending on server load.
  const answered = onClock('overloaded', counteredHarmlessPeeks);
  assert.ok(answered / 150 < 0.2, `under load, countered a harmless peek ${answered} times in 150`);
});

test('every sentence a bot might write reads cleanly, whoever is at the table', async () => {
  const { draftsFor } = await import('../server/game/bots');
  const { readSpell } = await import('../shared/scribe');
  const { rosterFor } = await import('../server/game/shop');
  const { Engine } = await import('../server/game/engine');
  for (let seed = 0; seed < 12; seed++) {
    const e = new Engine(`DR${seed}`, 'host', { seed: `daily:2026-10-${String(seed + 1).padStart(2, '0')}` }, () => {}, () => {});
    e.addPlayer('host', 'Hero');
    for (let i = 0; i < 5; i++) e.addBot();
    e.start();
    e.dispose();
    const t = e.table;
    // Every situation: behind, ahead, rich in mana.
    for (const p of t.players) {
      for (const [chips, maxMana] of [[1000, 8], [90000, 8], [20000, 11]]) {
        p.chips = chips; p.maxMana = maxMana;
        for (const d of draftsFor(t, p)) {
          const r = readSpell(d.text, rosterFor(t, p));
          assert.ok(r.ok, `"${d.text}" for ${p.name}: ${r.error}`);
          assert.equal(r.notes.filter((n) => /Ignored|Read "/.test(n)).length, 0, `"${d.text}": ${r.notes.join(' ')}`);
        }
      }
    }
  }
});
