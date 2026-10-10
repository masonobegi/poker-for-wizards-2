/**
 * Covens that last the whole run, and a mark that has to be a real mark.
 *
 * Round 3 of the fun pass (FUN-REVIEW.md, 2026-10-10):
 *   - A coven's two signature sigils were dealt once and gone when cast, so by
 *     the third hand every coven drew from the same pool. Half of all hands,
 *     a coven's first draw now comes from its school (COVEN_LEAN).
 *   - Bots inscribed Blooded every time, so the Loom never wrote the marks
 *     that break the deck. Bots now pick a mark and preview it.
 *   - The mark Inscribe writes is held to the picker's list on the server.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { decideCast, previewClock } from '../server/game/bots';
import { Engine } from '../server/game/engine';
import { createTable } from '../server/game/table';
import { sanitizeTargets } from '../server/net/io';
import { INSCRIBE_MARKS, isInscribeMark } from '../shared/cards';
import { COVENS, COVEN_LEAN, COVEN_BY_ID, leanOf } from '../shared/covens';
import { Rng } from '../shared/rng';
import { SIGIL_BY_ID } from '../shared/sigils';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

test('every coven but the Unaligned leans to its own school', () => {
  assert.equal(COVEN_LEAN, 0.5);
  for (const c of COVENS) {
    if (c.id === 'unaligned') assert.equal(leanOf(c), null);
    else assert.equal(leanOf(c), c.school, c.name);
  }
});

/** Sigils drawn over many hands by one seat of each coven, by school. */
function drawShare(coven: string, hands = 300): number {
  const e = new Engine('LEAN', 'host', { ...DEFAULT_CONFIG, seed: `lean:${coven}` }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addBot();
  const hero = e.table.players.find((p) => p.id === 'host')!;
  hero.coven = coven;
  e.start();
  e.dispose();
  const school = COVEN_BY_ID[coven].school;
  const internals = e as unknown as { beginHand(): void };
  let mine = 0;
  let all = 0;
  for (let h = 0; h < hands; h++) {
    // Empty the hand so every draw lands, then deal the next hand.
    hero.sigils = [];
    e.table.phase = 'payout';
    internals.beginHand();
    e.dispose();
    for (const s of hero.sigils) {
      all++;
      if (SIGIL_BY_ID[s.defId]?.school === school) mine++;
    }
  }
  return mine / Math.max(1, all);
}

test('a leaning coven draws far more of its school than the shared pool would give it', () => {
  // Six schools, so the shared pool alone gives about one draw in six.
  const plain = drawShare('unaligned');
  const twinned = drawShare('twinned');
  assert.ok(plain < 0.26, `the Unaligned drew ${plain.toFixed(2)} Veil`);
  assert.ok(twinned > 0.3, `the Twinned drew only ${twinned.toFixed(2)} Bind`);
});

function seat(t: Table, id: string, sigils: string[]): Player {
  const p = {
    id, name: id, isBot: true, seat: t.players.length, connected: true, ready: true,
    chips: 20000, bet: 0, committed: 0, folded: false, allIn: false, eliminated: false,
    hole: [], sigils: sigils.map((defId, i) => ({ uid: `${id}-${i}`, defId })),
    relics: [], mana: 9, maxMana: 10, shards: 0, coven: 'loom',
    warded: false, severed: false, hexed: 0, blinded: false, sittingOut: false,
    lastAction: null, avatar: 0,
    foreknowledge: { deckPeek: [], seenHole: [], divergedFrom: {}, lies: {} },
  } as unknown as Player;
  t.players.push(p);
  return p;
}

test('a bot that inscribes writes the marks a player would, not Blooded every time', () => {
  const marks = new Map<string, number>();
  const was = previewClock.now;
  previewClock.now = () => 0; // every preview runs: time stands still
  try {
    for (let i = 0; i < 80; i++) {
      const t = createTable('INSC', 'host', { ...DEFAULT_CONFIG });
      const a = seat(t, 'a', ['inscribe']);
      seat(t, 'b', []);
      const deck = new Rng(`insc:${i}`).shuffle([...t.cards.keys()]);
      a.hole = deck.slice(0, 2);
      t.players[1].hole = deck.slice(2, 4);
      t.board = deck.slice(4, 7);
      t.deck = deck.slice(7);
      t.phase = 'flop';
      t.pot = 1000;
      const cast = decideCast(t, a, new Rng(`ic:${i}`));
      if (cast?.targets.markId) marks.set(cast.targets.markId, (marks.get(cast.targets.markId) ?? 0) + 1);
    }
  } finally {
    previewClock.now = was;
  }
  const total = [...marks.values()].reduce((x, y) => x + y, 0);
  assert.ok(total > 10, `only ${total} inscriptions in 80 tries`);
  assert.ok((marks.get('wild') ?? 0) > total / 3, `wild ${marks.get('wild') ?? 0} of ${total}`);
  for (const m of marks.keys()) assert.ok(isInscribeMark(m), m);
});

test('the server only accepts a mark the Inscribe picker offers', () => {
  for (const m of INSCRIBE_MARKS) assert.equal(sanitizeTargets({ markId: m }).markId, m);
  for (const bad of ['mirrored', 'bound', 'burning', 'constructor', '__proto__', 'x'.repeat(5000), 7]) {
    assert.equal(sanitizeTargets({ markId: bad }).markId, undefined, String(bad).slice(0, 20));
  }
});
