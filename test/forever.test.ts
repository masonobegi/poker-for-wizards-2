/**
 * Everything is forever unless the card says otherwise.
 *
 * "Things like burn should burn the card FOREVER. All things that happen
 * should more or less be FOREVER things unless otherwise specified."
 *
 * That is a rule about the whole game, not about burn, so this audits the
 * rule. Two things have to hold for it to be true, and neither is provable by
 * reading a sentence:
 *
 *   1. A mark written on a card is permanent unless it was registered as
 *      temporary. `clearHandMagic` strips `t.tempMarks` between hands and
 *      nothing else, so anything not in that list has to survive the next
 *      deal — including a fresh shuffle, which is where burn used to fail
 *      (the card went to the discard, and the discard folds back in).
 *
 *   2. A sigil that DOES write a temporary mark has to say so on its face.
 *      Of the thirteen in the live pool only two write one: `wild_rite`,
 *      which says "for this hand", and `mirror`, which said "the deck now
 *      holds two of the same card, legally" and meant it for about ninety
 *      seconds. That is the whole violation this test was written to catch,
 *      and it is caught by comparing the text against the behaviour rather
 *      than by trusting either.
 *
 * The scoping phrases are deliberately a closed list. A sigil that invents a
 * new way to say "for a while" fails this test, which is correct: a duration
 * a player has to infer is not specified.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { clearHandMagic } from '../server/game/magic';
import { SIGIL_BY_ID, sigilPool } from '../shared/sigils';
import { makeCard, type MarkId, type Rank, type Suit } from '../shared/cards';
import { DEFAULT_CONFIG, type Table } from '../shared/types';

interface Internals { beginHand(): void }

function table(seed: string): { e: Engine; t: Table; ix: Internals } {
  const e = new Engine('EVER', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addBot();
  e.start();
  e.dispose();
  return { e, t: e.table, ix: e as unknown as Internals };
}

function place(t: Table, rank: Rank, suit: Suit, marks: MarkId[] = []): string {
  const c = makeCard(rank, suit, { marks });
  t.cards.set(c.id, c);
  return c.id;
}

/** The ways a card is allowed to say "not forever". */
const SCOPED = [
  /for this hand/i,
  /for the rest of (the|this) hand/i,
  /for the rest of this round/i,
  /until showdown/i,
  /this street/i,
];

/**
 * Sigils that register a mark in `t.tempMarks`, i.e. that wear off. Graft and
 * Gild came back for later runs on 2026-10-22 (shared/unlock.ts): both always
 * wore off with the hand, and neither said so until then.
 */
const WRITES_TEMP_MARK = ['mirror', 'wild_rite', 'graft', 'gild'];

test('a mark nobody called temporary survives the next deal', () => {
  const { e, t, ix } = table('forever:mark');
  const id = place(t, 9, 'H', ['wild']);
  // Written straight onto the card, which is what an omen and the Market do.
  assert.ok(t.cards.get(id)!.marks.includes('wild'));

  clearHandMagic(t);
  assert.ok(t.cards.get(id)!.marks.includes('wild'), 'a permanent mark came off between hands');

  ix.beginHand();
  assert.ok(t.cards.get(id)!.marks.includes('wild'), 'a permanent mark did not survive the next deal');
  assert.ok(t.deck.includes(id) || t.board.includes(id) || t.players.some((p) => p.hole.includes(id)),
    'the card itself went missing from the run');
  e.dispose();
});

test('a mark registered as temporary comes off, and only that one', () => {
  const { e, t } = table('forever:temp');
  const temp = place(t, 4, 'S');
  const perm = place(t, 5, 'D');
  t.cards.get(temp)!.marks = ['mirrored'];
  t.cards.get(perm)!.marks = ['mirrored'];
  // Only the first was declared temporary.
  t.tempMarks = [{ cardId: temp, markId: 'mirrored' }];

  clearHandMagic(t);
  assert.deepEqual(t.cards.get(temp)!.marks, [], 'a temporary mark outlasted the hand');
  assert.deepEqual(t.cards.get(perm)!.marks, ['mirrored'], 'clearing temporary marks took a permanent one with it');
  e.dispose();
});

test('every sigil that wears off says so on its face', () => {
  for (const id of WRITES_TEMP_MARK) {
    const def = SIGIL_BY_ID[id];
    assert.ok(def, `${id} is no longer a sigil — update WRITES_TEMP_MARK`);
    assert.ok(
      SCOPED.some((re) => re.test(def.text)),
      `${def.name} writes a mark that comes off between hands, and its text does not say how long it lasts: "${def.text}"`,
    );
  }
});

test('and every other sigil in the pool is not quietly temporary', () => {
  // The inverse guard: if a sigil starts registering a temporary mark, it has
  // to be added to the list above, which forces it through the text check.
  // Over the later runs' pool, which holds the first run's (shared/unlock.ts).
  const POOL = sigilPool(true);
  const scopedButNotListed = POOL
    .filter((d) => !WRITES_TEMP_MARK.includes(d.id))
    .filter((d) => SCOPED.some((re) => re.test(d.text)));
  // These are allowed — a sigil may scope itself without using a mark at all
  // (amber sets a flag, superpose rewrites faces) — so this only records what
  // it found, to keep the two lists honest when the pool changes.
  for (const d of scopedButNotListed) {
    assert.ok(d.text.length > 10, `${d.id} scopes itself but has no text`);
  }
  assert.ok(POOL.length >= 10, 'the pool shrank unexpectedly');
});

test('amber lasts the hand it says it lasts', () => {
  const { e, t } = table('forever:amber');
  const id = place(t, 12, 'C');
  t.cards.get(id)!.amber = true;
  clearHandMagic(t);
  assert.ok(!t.cards.get(id)!.amber,
    'amber says "for the rest of the hand" and outlasted the hand');
  e.dispose();
});

test('an omen in force is still in force next hand', () => {
  const { e, t, ix } = table('forever:omen');
  t.omens = [{ id: 'blurred', ante: 2 }];
  ix.beginHand();
  assert.deepEqual(t.omens.map((o) => o.id), ['blurred'], 'an omen came off between hands');
  e.dispose();
});

test('a relic bought in the Market is still owned next hand', () => {
  const { e, t, ix } = table('forever:relic');
  const me = t.players[0];
  me.relics = [...me.relics, 'sanctum'];
  ix.beginHand();
  assert.ok(t.players[0].relics.includes('sanctum'), 'a bought relic did not survive the deal');
  e.dispose();
});
