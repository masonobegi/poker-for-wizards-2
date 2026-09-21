import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeCard, type CardEntity, type Rank, type Suit } from '../shared/cards';
import { Cat, evaluate, type RuleMods } from '../shared/hand';

const C = (s: string): CardEntity => {
  const rankMap: Record<string, Rank> = {
    A: 14, K: 13, Q: 12, J: 11, T: 10,
    '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2,
  };
  const rank = rankMap[s[0]];
  const suit = s[1] as Suit;
  assert.ok(rank, `bad rank in ${s}`);
  return makeCard(rank, suit);
};

const hand = (spec: string, mods: RuleMods = {}) =>
  evaluate({ cards: spec.split(' ').map(C), viewerId: null, mods });

// --------------------------------------------------------------- standard

test('reads a royal flush', () => {
  const r = hand('AS KS QS JS TS 2H 3D');
  assert.equal(r.cat, Cat.StraightFlush);
  assert.equal(r.ranks[0], 14);
  assert.equal(r.name, 'Royal Flush');
});

test('reads four of a kind over a full house', () => {
  const quads = hand('9S 9H 9D 9C KS 2H 3D');
  const boat = hand('9S 9H 9D KS KH 2C 3D');
  assert.equal(quads.cat, Cat.Quads);
  assert.equal(boat.cat, Cat.FullHouse);
  assert.ok(quads.score > boat.score);
});

test('finds the wheel', () => {
  const r = hand('AS 2H 3D 4C 5S KH QD');
  assert.equal(r.cat, Cat.Straight);
  assert.equal(r.ranks[0], 5, 'wheel is five-high, not ace-high');
});

test('does not read a straight across a gap', () => {
  const r = hand('2S 3H 4D 6C 7S 9H JD');
  assert.ok(r.cat < Cat.Straight);
});

test('picks the best five of seven', () => {
  const r = hand('AS AH KS KH KD 2C 3D');
  assert.equal(r.cat, Cat.FullHouse);
  assert.equal(r.ranks[0], 13, 'kings full of aces, not aces full of kings');
  assert.equal(r.ranks[1], 14);
});

test('ranks two pair by the higher pair first', () => {
  const a = hand('AS AH 3D 3C 9S 5H 2D');
  const b = hand('KS KH QD QC 9S 5H 2D');
  assert.equal(a.cat, Cat.TwoPair);
  assert.equal(b.cat, Cat.TwoPair);
  assert.ok(a.score > b.score, 'aces up beats kings up');
});

test('returns no hand when there are fewer than five cards', () => {
  const r = evaluate({ cards: 'AS KS'.split(' ').map(C), viewerId: null });
  assert.equal(r.score, -1);
});

// ------------------------------------------------------------- impossible

test('reads five of a kind, which a physical deck cannot produce', () => {
  const cards = [C('9S'), C('9H'), C('9D'), C('9C'), C('9S'), C('2H'), C('3D')];
  const r = evaluate({ cards, viewerId: null });
  assert.equal(r.cat, Cat.FiveOfAKind);
  assert.ok(r.impossible);
});

test('reads a flush five above a flush house', () => {
  const five = evaluate({
    cards: [C('9S'), C('9S'), C('9S'), C('9S'), C('9S'), C('2H')],
    viewerId: null,
  });
  const house = evaluate({
    cards: [C('9S'), C('9S'), C('9S'), C('4S'), C('4S'), C('2H')],
    viewerId: null,
  });
  assert.equal(five.cat, Cat.FlushFive);
  assert.equal(house.cat, Cat.FlushHouse);
  assert.ok(five.score > house.score);
  assert.ok(five.impossible && house.impossible);
});

test('a wild card takes the best available identity', () => {
  const cards = 'AS KS QS JS 2H 3D'.split(' ').map(C);
  cards[4].marks.push('wild');
  const r = evaluate({ cards, viewerId: null });
  assert.equal(r.cat, Cat.StraightFlush, 'the wild should become the ten of spades');
});

test('superposition resolves to whichever face scores best', () => {
  const q = makeCard(2, 'C');
  q.faces = [{ rank: 2, suit: 'C' }, { rank: 14, suit: 'S' }];
  q.collapsed = null;
  const r = evaluate({ cards: [q, C('AH'), C('AD'), C('AC'), C('KS'), C('9D')], viewerId: null });
  assert.equal(r.cat, Cat.Quads, 'the undecided card should settle as the fourth ace');
});

test('a prism card counts as any suit', () => {
  const cards = 'AS KS QS JS 9H 2D 3C'.split(' ').map(C);
  cards[4].marks.push('prism');
  const r = evaluate({ cards, viewerId: null });
  assert.equal(r.cat, Cat.Flush);
});

test('blooded scores one rank higher', () => {
  const plain = hand('KS KH 2D 7C 9S JH 4D');
  assert.equal(plain.cat, Cat.Pair, 'unmarked, this is a pair of kings');

  const cards = 'KS KH 2D 7C 9S JH 4D'.split(' ').map(C);
  cards[0].marks.push('blooded');
  const r = evaluate({ cards, viewerId: null });
  assert.equal(r.cat, Cat.HighCard, 'the king became an ace, so the pair breaks');
  assert.equal(r.ranks[0], 14);
});

test('echo adds a rank for every pot the card has won', () => {
  const cards = 'TS 2H 5D 7C 9S QH KD'.split(' ').map(C);
  cards[0].marks.push('echo');
  cards[0].memory = 4;
  const r = evaluate({ cards, viewerId: null });
  assert.equal(r.ranks[0], 14, 'a ten with four wins scores as an ace');
});

test('a blooded ace cannot climb past an ace', () => {
  const cards = 'AS 2D 7C 9S JH 4D 6C'.split(' ').map(C);
  cards[0].marks.push('blooded');
  const r = evaluate({ cards, viewerId: null });
  assert.equal(r.ranks[0], 14, 'rank stays clamped at the top of the deck');
});

// ------------------------------------------------------------------ mods

test('merged colours make a four-red flush', () => {
  const r = hand('AH KD QH JD 9H 2S 3C', { mergedColors: true });
  assert.equal(r.cat, Cat.Flush);
});

test('a four-card flush relic lowers the requirement', () => {
  const plain = hand('AS KS QS 4H 9D 2C 3H');
  const relic = hand('AS KS QS 4H 9D 2C 3H', { flushSize: 4 });
  assert.ok(plain.cat < Cat.Flush);
  assert.equal(relic.cat, Cat.HighCard, 'still only three spades, so no flush either way');

  const four = hand('AS KS QS 4S 9D 2C 3H', { flushSize: 4 });
  assert.equal(four.cat, Cat.Flush);
});

test('wheel wrap allows a straight across the ace', () => {
  const plain = hand('QS KH AD 2C 3S 9H 8D');
  const wrap = hand('QS KH AD 2C 3S 9H 8D', { wheelWrap: true });
  assert.ok(plain.cat < Cat.Straight);
  assert.equal(wrap.cat, Cat.Straight);
});

test('dead ranks are struck from the hand entirely', () => {
  const plain = hand('AS AH KD KC 9S 2H 3D');
  const dead = hand('AS AH KD KC 9S 2H 3D', { deadRanks: [14] });
  assert.equal(plain.cat, Cat.TwoPair);
  assert.equal(dead.cat, Cat.Pair, 'with aces unmade only the kings remain paired');
  assert.equal(dead.ranks[0], 13);
});

test('face cards may all read as kings', () => {
  const r = hand('JS QH KD 2C 3S 9H 8D', { facesAreKings: true });
  assert.equal(r.cat, Cat.Trips);
  assert.equal(r.ranks[0], 13);
});

test('a category shift promotes the whole hand', () => {
  const plain = hand('AS AH 2D 3C 9S 5H 7D');
  const lifted = hand('AS AH 2D 3C 9S 5H 7D', { categoryShift: 1 });
  assert.equal(plain.cat, Cat.Pair);
  assert.equal(lifted.cat, Cat.TwoPair);
});

test('a cursed card drags its holder down a category', () => {
  const cards = 'AS AH 2D 3C 9S 5H 7D'.split(' ').map(C);
  const plain = evaluate({ cards: cards.map((c) => ({ ...c, marks: [] })), viewerId: null });
  cards[0].marks.push('cursed');
  const hexed = evaluate({ cards, viewerId: null });
  assert.equal(plain.cat, Cat.Pair);
  assert.equal(hexed.cat, Cat.HighCard);
});

test('divergence lets two viewers read the same card differently', () => {
  const shared = makeCard(2, 'C');
  shared.divergent = { alice: { rank: 14, suit: 'S' } };
  const rest = 'AH AD KC 9S 5H'.split(' ').map(C);

  const bob = evaluate({ cards: [shared, ...rest], viewerId: 'bob' });
  const alice = evaluate({ cards: [shared, ...rest], viewerId: 'alice' });

  assert.equal(bob.cat, Cat.Pair, 'bob sees a two and only the pair of aces');
  assert.equal(alice.cat, Cat.Trips, 'alice sees a third ace');
});

// ---------------------------------------------------------------- budget

test('evaluation stays fast enough for a live showdown', () => {
  const build = () => {
    const cards = 'AS KS QS JS 9H 2D 3C'.split(' ').map(C);
    cards[4].marks.push('wild');
    const q = makeCard(7, 'D');
    q.faces = [{ rank: 7, suit: 'D' }, { rank: 10, suit: 'S' }];
    q.collapsed = null;
    return [...cards, q];
  };

  const t0 = performance.now();
  for (let i = 0; i < 20; i++) evaluate({ cards: build(), viewerId: null });
  const per = (performance.now() - t0) / 20;

  assert.ok(per < 60, `a wild plus a superposed card took ${per.toFixed(1)}ms per hand`);
});
