/**
 * A Mirrored card copies the one to its left — all of it.
 *
 * Reported from a real hand under The Twinned: the board came out
 * 3♣ 4♠ 7♦ with the last two Mirrored, and read as 3♣ 3♣ 4♠. Two of the
 * three are right and the third copied what its neighbour USED to be, which
 * is the kind of thing that only shows up when two mirrored cards land in the
 * same flop. And a copy of a Wild card was not Wild: "the mirroring 3 should
 * be a wild one, it should take the mods too."
 *
 * So this fixes the copy at both ends: the whole identity, including the
 * marks that make the card what it is, and the chain when several land at
 * once.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { makeCard, faceLabel, viewCard, type CardEntity, type Rank, type Suit } from '../shared/cards';
import { DEFAULT_CONFIG, type Table } from '../shared/types';

interface Internals {
  dealStreet(phase: string): void;
}

function table(seed: string): { e: Engine; t: Table; ix: Internals } {
  const e = new Engine('MIRR', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addBot();
  e.start();
  e.dispose();
  return { e, t: e.table, ix: e as unknown as Internals };
}

/** Put a card of our own into the table's population and return its id. */
function place(t: Table, rank: Rank, suit: Suit, patch: Partial<CardEntity> = {}): string {
  const c = makeCard(rank, suit, patch);
  t.cards.set(c.id, c);
  return c.id;
}

/** What the board reads as, left to right. */
const reads = (t: Table): string[] =>
  t.board.map((id) => {
    const c = t.cards.get(id)!;
    return faceLabel(c.faces[c.collapsed ?? 0]);
  });

test('two mirrored cards in one flop both copy, and the chain holds', () => {
  const { e, t, ix } = table('mirror:chain');
  t.board = [];
  // 3♣, then a 4♠ and a 7♦ that each copy the card to their left.
  t.deck = [
    place(t, 3, 'C'),
    place(t, 4, 'S', { marks: ['mirrored'] }),
    place(t, 7, 'D', { marks: ['mirrored'] }),
  ];

  ix.dealStreet('flop');

  assert.deepEqual(reads(t), ['3♣', '3♣', '3♣'],
    'the second mirror copied what its neighbour used to be, not what it is');
  e.dispose();
});

test('a mirrored card copies the marks, so a copy of a Wild is Wild', () => {
  const { e, t, ix } = table('mirror:marks');
  t.board = [];
  t.deck = [
    place(t, 9, 'H', { marks: ['wild'] }),
    place(t, 2, 'S', { marks: ['mirrored'] }),
  ];

  ix.dealStreet('flop');

  const copy = t.cards.get(t.board[1])!;
  assert.deepEqual(reads(t).slice(0, 2), ['9♥', '9♥']);
  assert.ok(copy.marks.includes('wild'),
    'the copy is the same card as the original, so it is Wild like the original');
  // And it is still a copy: it keeps saying so.
  assert.ok(copy.marks.includes('mirrored'), 'it is still the mirrored card');
  e.dispose();
});

test('a mirrored card still shows what it was printed as', () => {
  /* "You can see the real card and the card of what it is in like a half and
     half, and what the card really is is bright while what it was is grayed
     out." The client can only draw that if the server keeps the old face, and
     the reported board — 3♣ 4♠ 7♦ reading as three 3♣s — is exactly the case
     where losing it leaves a player with no way to tell what happened. */
  const { e, t, ix } = table('mirror:wasface');
  t.board = [];
  t.deck = [
    place(t, 3, 'C'),
    place(t, 4, 'S', { marks: ['mirrored'] }),
    place(t, 7, 'D', { marks: ['mirrored'] }),
  ];
  ix.dealStreet('flop');

  const [, second, third] = t.board.map((id) => t.cards.get(id)!);
  assert.deepEqual(second.wasFace, { rank: 4, suit: 'S' }, 'the 4♠ forgot it was a 4♠');
  assert.deepEqual(third.wasFace, { rank: 7, suit: 'D' }, 'the 7♦ forgot it was a 7♦');

  // A chain keeps the first answer: the third copied a card that was already a
  // copy, and what a player needs is "it was a 7♦", not "it was a 3♣ a moment
  // ago".
  assert.notDeepEqual(third.wasFace, { rank: 3, suit: 'C' });

  // And the viewer gets it only with the face itself.
  const seen = viewCard(third, { reveal: true, viewerId: 'host' });
  assert.deepEqual(seen.wasFace, { rank: 7, suit: 'D' });
  const hidden = viewCard(third, { reveal: false, viewerId: 'other' });
  assert.equal(hidden.wasFace, undefined, 'a card you may not read leaked what it used to be');
  e.dispose();
});

test('a card that was not rewritten has nothing to show', () => {
  const { e, t, ix } = table('mirror:plain');
  t.board = [];
  t.deck = [place(t, 2, 'H'), place(t, 8, 'S')];
  ix.dealStreet('flop');
  for (const id of t.board) {
    assert.equal(t.cards.get(id)!.wasFace, undefined, 'an untouched card claims it used to be something else');
  }
  e.dispose();
});

test('a mirrored card with nothing to its left stays itself', () => {
  const { e, t, ix } = table('mirror:leftmost');
  t.board = [];
  t.deck = [
    place(t, 5, 'D', { marks: ['mirrored'] }),
    place(t, 8, 'C'),
  ];

  ix.dealStreet('flop');
  assert.deepEqual(reads(t).slice(0, 2), ['5♦', '8♣'], 'the leftmost card has nothing to copy');
  e.dispose();
});

test('a mirrored card dealt on a later street copies what is beside it then', () => {
  const { e, t, ix } = table('mirror:turn');
  t.board = [];
  t.deck = [place(t, 10, 'S'), place(t, 2, 'H'), place(t, 6, 'C')];
  ix.dealStreet('flop');
  assert.deepEqual(reads(t), ['10♠', '2♥', '6♣']);

  t.deck = [place(t, 13, 'D', { marks: ['mirrored'] })];
  ix.dealStreet('turn');
  assert.deepEqual(reads(t), ['10♠', '2♥', '6♣', '6♣'], 'the turn copies the river-side neighbour');
  e.dispose();
});
