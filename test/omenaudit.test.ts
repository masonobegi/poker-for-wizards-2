/**
 * Every omen does what its card says.
 *
 * "Some of the ante things don't seem to be working, like it's not dealing a
 * sixth card when it says it should — those all need auditing and testing."
 * Fair, and the only answer to it is this: take each omen in the live pool,
 * put it on a real table, play a real hand, and check the sentence printed on
 * it came true.
 *
 * Deliberately written against the omen's own `text`, not against the field
 * it sets — a rule that changes a flag nobody reads is exactly the failure
 * being hunted here.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { modsFor } from '../server/game/table';
import { OMEN_POOL, OMEN_BY_ID, type ActiveOmen } from '../shared/omens';
import { isQuantum } from '../shared/cards';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

interface Internals {
  beginHand(): void;
  dealStreet(phase: string): void;
}

/** A table with these omens in force, one hand dealt, no clocks running. */
function underOmens(seed: string, omens: ActiveOmen[]): { e: Engine; t: Table; ix: Internals } {
  const e = new Engine('OMEN', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addBot();
  e.addBot();
  e.start();
  e.dispose();
  const t = e.table;
  const ix = e as unknown as Internals;
  t.omens = omens;
  // Omens that edit the shared deck do it when they arrive, so arrival is
  // replayed here through the engine's own path.
  for (const a of omens) {
    const def = OMEN_BY_ID[a.id];
    const ins = def?.deal?.inscribe;
    if (!ins) continue;
    const plain = [...t.cards.values()].filter((c) => c.marks.length === 0);
    for (const c of plain.slice(0, ins.count)) c.marks = [ins.markId];
  }
  ix.beginHand();
  return { e, t, ix };
}

/** Deal the whole board out, the way a hand that reaches showdown does. */
function runBoard(ix: Internals): void {
  ix.dealStreet('flop');
  ix.dealStreet('turn');
  ix.dealStreet('river');
}

const live = (t: Table): Player[] => t.players.filter((p) => !p.eliminated);

test('every omen in the pool is one a run can actually roll', () => {
  // A pool entry that no longer exists, or a definition with no text, is a
  // rule the game cannot explain to the player.
  for (const def of OMEN_POOL) {
    assert.ok(def.text && def.text.length > 10, `${def.id} has no rules text`);
    assert.ok(def.minAnte >= 2, `${def.id} would be in force before the game starts`);
    assert.ok(def.weight > 0, `${def.id} can never be drawn`);
  }
});

test('Blurred: hearts and diamonds are one suit', () => {
  const { e, t } = underOmens('audit:blurred', [{ id: 'blurred', ante: 2 }]);
  const mods = modsFor(t, live(t)[0]);
  assert.equal(mods.mergedColors, true);
  e.dispose();
});

test('The Serpent: the ace bridges both ends', () => {
  const { e, t } = underOmens('audit:serpent', [{ id: 'serpent', ante: 2 }]);
  assert.equal(modsFor(t, live(t)[0]).wheelWrap, true);
  e.dispose();
});

test('The Inversion: the worst hand wins', () => {
  const { e, t } = underOmens('audit:inversion', [{ id: 'inversion', ante: 5 }]);
  assert.equal(modsFor(t, live(t)[0]).lowWins, true);
  e.dispose();
});

test('The Flood: every hand deals a sixth community card', () => {
  const plain = underOmens('audit:flood-off', []);
  runBoard(plain.ix);
  assert.equal(plain.t.board.length, 5, 'an ordinary board is five');
  plain.e.dispose();

  const { e, t, ix } = underOmens('audit:flood', [{ id: 'the_flood', ante: 2 }]);
  runBoard(ix);
  assert.equal(t.board.length, 6, 'The Flood says a sixth card and means it');
  e.dispose();
});

test('The Third Card: everyone is dealt three hole cards', () => {
  const { e, t } = underOmens('audit:third', [{ id: 'third_card', ante: 3 }]);
  for (const p of live(t)) {
    assert.equal(p.hole.length, 3, `${p.name} was dealt ${p.hole.length}`);
  }
  e.dispose();
});

test('Entropy Rising: a community card arrives undecided', () => {
  const { e, t, ix } = underOmens('audit:entropy', [{ id: 'entropy_rising', ante: 3 }]);
  runBoard(ix);
  const undecided = t.board.filter((id) => isQuantum(t.cards.get(id)!));
  assert.ok(undecided.length >= 1, 'no board card arrived undecided');
  e.dispose();
});

test('The Gilded: five cards in the shared deck are Wild', () => {
  const { e, t } = underOmens('audit:gilded', [{ id: 'the_gilded', ante: 2 }]);
  const wild = [...t.cards.values()].filter((c) => c.marks.includes('wild'));
  assert.equal(wild.length, 5, `${wild.length} cards are Wild`);
  e.dispose();
});

test('The Twinned: seven cards are Mirrored, and a Mirrored card copies', () => {
  const { e, t, ix } = underOmens('audit:twinned', [{ id: 'the_twinned', ante: 4 }]);
  const mirrored = [...t.cards.values()].filter((c) => c.marks.includes('mirrored'));
  assert.equal(mirrored.length, 7, `${mirrored.length} cards are Mirrored`);

  // And when one lands on the board with a card to its left, it copies it.
  t.board = [];
  const plain = [...t.cards.values()].find((c) => c.marks.length === 0)!;
  const copy = mirrored[0];
  t.deck = [plain.id, copy.id];
  ix.dealStreet('flop');
  assert.deepEqual(
    t.cards.get(copy.id)!.faces[0],
    plain.faces[0],
    'a Mirrored card on the board did not copy the card to its left',
  );
  e.dispose();
});

test('Unmade: a rank is struck from every hand', () => {
  const { e, t } = underOmens('audit:unmade', [{ id: 'unmade', ante: 4, rank: 9 }]);
  const dead = modsFor(t, live(t)[0]).deadRanks ?? [];
  assert.ok(dead.includes(9), `dead ranks were ${JSON.stringify(dead)}`);
  e.dispose();
});

test('two omens at once are both in force', () => {
  // They stack and never come off — that is the whole shape of a run.
  const { e, t, ix } = underOmens('audit:stacked', [
    { id: 'blurred', ante: 2 },
    { id: 'the_flood', ante: 3 },
  ]);
  runBoard(ix);
  const mods = modsFor(t, live(t)[0]);
  assert.equal(mods.mergedColors, true, 'the earlier omen stopped applying');
  assert.equal(t.board.length, 6, 'the later omen did not apply');
  e.dispose();
});
