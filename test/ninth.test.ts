/**
 * Round 9 of the fun pass (FUN-REVIEW.md, 2026-10-23): seven relics written
 * for the later shelf, because every relic left in the registry failed round
 * 7's bar. Each test holds one to what its card says, and to the ledger line
 * that says when it acted: a rule that works where nobody can see it is the
 * thing the bar rules out.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { castSigil, clearHandMagic, resolveStack, type MagicCtx } from '../server/game/magic';
import { runShowdown } from '../server/game/showdown';
import { rosterFor } from '../server/game/shop';
import { modsFor } from '../server/game/table';
import { type CardEntity, type Rank, type Suit, makeCard } from '../shared/cards';
import { Cat, evaluate } from '../shared/hand';
import {
  LATER_RELIC_CEILING, NINTH_RELIC_IDS, RELIC_BY_ID, RELIC_POOL, UNLOCKED_RELIC_IDS, relicPool,
} from '../shared/relics';
import { Rng } from '../shared/rng';
import { readSpell } from '../shared/scribe';
import { SCRIBED_ID } from '../shared/sigils';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

// ---------------------------------------------------------------- helpers

const c = (rank: Rank, suit: Suit, patch: Partial<CardEntity> = {}): CardEntity => makeCard(rank, suit, patch);

interface Internals {
  beginHand(): void;
  endHand(): void;
  toShowdown(): void;
  burnOffBoard(): void;
}

/** A started solo table: the host and three bots, every clock stopped. */
function table(seed = 'ninth'): { e: Engine; t: Table; hero: Player; others: Player[]; ix: Internals } {
  const e = new Engine('NINE', 'host', { ...DEFAULT_CONFIG, seed: `ninth:${seed}`, unlocked: true }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < 3; i++) e.addBot();
  e.start();
  e.dispose();
  const t = e.table;
  return { e, t, hero: t.players.find((p) => p.id === 'host')!, others: t.players.filter((p) => p.id !== 'host'), ix: e as unknown as Internals };
}

function place(t: Table, card: CardEntity): string {
  t.cards.set(card.id, card);
  return card.id;
}

const ctxOf = (t: Table): MagicCtx => ({ t, rng: new Rng('ninth'), fx: [] });

function give(p: Player, defId: string): string {
  const uid = `${p.id}-${defId}-${p.sigils.length}`;
  p.sigils.push({ uid, defId });
  return uid;
}

/** Cast on the caster's own turn and let it resolve, nobody answering. */
function castAndResolve(t: Table, p: Player, uid: string, targets: Parameters<typeof castSigil>[3]): void {
  const ctx = ctxOf(t);
  t.actingId = p.id;
  t.stack = null;
  const r = castSigil(ctx, p, uid, targets);
  assert.ok(r.ok, r.error);
  t.stack!.pending = [];
  resolveStack(ctx);
}

/** Hero against one opponent at a showdown, every other seat folded. */
function headsUp(seed: string, heroHole: CardEntity[], foeHole: CardEntity[], board: CardEntity[]) {
  const { e, t, hero, others } = table(seed);
  const foe = others[0];
  for (const q of t.players) { q.folded = q.id !== hero.id && q.id !== foe.id; q.committed = 0; q.bet = 0; }
  hero.hole = heroHole.map((x) => place(t, x));
  foe.hole = foeHole.map((x) => place(t, x));
  t.board = board.map((x) => place(t, x));
  hero.committed = 400; foe.committed = 400;
  t.relicDeals = [];
  return { e, t, hero, foe };
}

const lines = (t: Table, rule: string, who = 'host') => t.log.filter((l) => l.rule === rule && l.playerId === who);

// ------------------------------------------------------------ the shelf

test('the seven are on the later shelf only, and the first run\'s shelf is the same object', () => {
  assert.equal(NINTH_RELIC_IDS.size, 7);
  for (const id of NINTH_RELIC_IDS) {
    assert.ok(UNLOCKED_RELIC_IDS.includes(id), `${id} is not sold in a later run`);
    assert.ok(!RELIC_POOL.some((r) => r.id === id), `${id} is on the first run's shelf`);
    const def = RELIC_BY_ID[id];
    assert.ok(def.rule, `${def.name} changes no rule the engine runs`);
    assert.ok(!def.coven && def.price > 0);
    assert.ok(def.text.length <= 113, `${def.name}'s rule is ${def.text.length} characters, past what the Market card holds`);
  }
  assert.equal(relicPool(false), RELIC_POOL);
  assert.equal(relicPool(true).length, 30);
  assert.ok(relicPool(true).length <= LATER_RELIC_CEILING);
});

// ------------------------------------------------------------ The Witness

test('The Witness: an undecided community card settles on the face that helps its owner, and says so', () => {
  const run = (owner: boolean) => {
    const { e, t, hero, others, ix } = table('witness');
    const foe = others[0];
    for (const q of others) q.folded = q.id !== foe.id;
    hero.relics = owner ? ['the_witness'] : [];
    hero.hole = [place(t, c(13, 'H')), place(t, c(13, 'C'))];
    foe.hole = [place(t, c(4, 'S')), place(t, c(9, 'D'))];
    // Undecided between a Two and the King that makes the hero's trips.
    const coin = c(2, 'D', { faces: [{ rank: 2, suit: 'D' }, { rank: 13, suit: 'S' }], collapsed: null });
    t.board = [place(t, coin), place(t, c(7, 'D')), place(t, c(8, 'C')), place(t, c(3, 'S')), place(t, c(11, 'H'))];
    for (const p of t.players) p.committed = p.folded ? 0 : 200;
    ix.toShowdown();
    e.dispose();
    return { t, coin };
  };
  const owned = run(true);
  assert.equal(owned.coin.faces[owned.coin.collapsed!].rank, 13, 'it settled on the King');
  const said = lines(owned.t, 'the_witness');
  assert.equal(said.length, 1);
  assert.match(said[0].text, /Hero's Witness: the undecided 2♦\/K♠ settles as K♠/);
  // Without it the card is a coin, and nothing is said.
  const plain = run(false);
  assert.equal(lines(plain.t, 'the_witness').length, 0);
});

test('The Witness says nothing when every face reads the same for its owner', () => {
  const { e, t, hero, others, ix } = table('witness-idle');
  const foe = others[0];
  for (const q of others) q.folded = q.id !== foe.id;
  hero.relics = ['the_witness'];
  // A straight flush on the board: neither face of the coin changes it.
  hero.hole = [place(t, c(2, 'C')), place(t, c(3, 'D'))];
  foe.hole = [place(t, c(4, 'S')), place(t, c(9, 'D'))];
  const coin = c(5, 'H', { faces: [{ rank: 5, suit: 'H' }, { rank: 6, suit: 'C' }], collapsed: null });
  t.board = [place(t, c(10, 'S')), place(t, c(11, 'S')), place(t, c(12, 'S')), place(t, c(13, 'S')), place(t, c(14, 'S'))];
  t.board.push(place(t, coin));
  for (const p of t.players) p.committed = p.folded ? 0 : 200;
  ix.toShowdown();
  e.dispose();
  assert.notEqual(coin.collapsed, null);
  assert.equal(lines(t, 'the_witness').length, 0);
});

// ------------------------------------------------------------ The Ember Jar

test('The Ember Jar: a burned community card comes to its owner\'s hand, still burned', () => {
  const { e, t, hero, others, ix } = table('ember');
  const foe = others[0];
  hero.relics = ['ember_jar'];
  hero.folded = false;
  t.phase = 'flop';
  hero.hole = [place(t, c(13, 'H')), place(t, c(4, 'C'))];
  const king = place(t, c(13, 'S'));
  t.board = [king, place(t, c(5, 'H')), place(t, c(8, 'D'))];
  foe.sigils = [];
  foe.mana = 9;
  castAndResolve(t, foe, give(foe, 'burn'), { cardIds: [king] });
  assert.ok(!t.board.includes(king), 'the King left the board');
  assert.ok(hero.hole.includes(king), 'and is in the Ember Jar owner\'s hand');
  assert.ok(t.cards.get(king)!.destroyed, 'it is still burned');
  assert.ok(evaluate({ cards: [...hero.hole, ...t.board].map((id) => t.cards.get(id)!), viewerId: hero.id, mods: modsFor(t, hero) }).cat >= Cat.Pair);
  const said = lines(t, 'ember_jar');
  assert.equal(said.length, 1);
  assert.match(said[0].text, /Hero's Ember Jar catches K♠/);
  // The burn line comes first, then the catch.
  const burnAt = t.log.findIndex((l) => /burns K♠ out of the board/.test(l.text));
  assert.ok(burnAt >= 0 && burnAt < t.log.indexOf(said[0]));
  // Burned is burned: the next hand's deck does not hold it.
  t.phase = 'payout';
  ix.beginHand();
  e.dispose();
  assert.ok(!t.deck.includes(king) && !t.players.some((p) => p.hole.includes(king)));
});

test('The Ember Jar catches The Kindling\'s cards too, and never for a player who folded', () => {
  const { e, t, hero, others, ix } = table('kindling');
  hero.relics = ['ember_jar'];
  t.phase = 'flop';
  hero.hole = [place(t, c(13, 'H')), place(t, c(4, 'C'))];
  const ember = place(t, c(9, 'D', { marks: ['burning'] }));
  t.board = [ember, place(t, c(5, 'H')), place(t, c(8, 'D'))];
  // Three cards on the flop and two to come: the floor lets one burn.
  hero.folded = true;
  others[0].relics = [];
  ix.burnOffBoard();
  assert.ok(!t.board.includes(ember));
  assert.ok(!hero.hole.includes(ember), 'a folded owner catches nothing');
  assert.equal(lines(t, 'ember_jar').length, 0);

  hero.folded = false;
  const second = place(t, c(10, 'D', { marks: ['burning'] }));
  t.board = [second, place(t, c(5, 'C')), place(t, c(8, 'S'))];
  ix.burnOffBoard();
  e.dispose();
  assert.ok(hero.hole.includes(second));
  assert.equal(lines(t, 'ember_jar').length, 1);
});

// ------------------------------------------------------------ Indelible Ink

test('Indelible Ink: the Wild Wild Rite writes stays on the card after the hand; without it, it fades', () => {
  const run = (ink: boolean) => {
    const { t, hero } = table(`ink:${ink}`);
    t.phase = 'flop';
    hero.relics = ink ? ['indelible_ink'] : [];
    hero.sigils = [];
    hero.mana = 9;
    const mine = c(7, 'C');
    hero.hole = [place(t, mine), place(t, c(2, 'D'))];
    castAndResolve(t, hero, give(hero, 'wild_rite'), { cardIds: [mine.id] });
    assert.ok(mine.marks.includes('wild'), 'Wild for the hand either way');
    clearHandMagic(t);
    return { t, mine };
  };
  const kept = run(true);
  assert.ok(kept.mine.marks.includes('wild'), 'the Wild stayed');
  const said = lines(kept.t, 'indelible_ink');
  assert.equal(said.length, 1);
  assert.match(said[0].text, /Hero's Indelible Ink: 7♣ stays Wild, for good/);
  const faded = run(false);
  assert.ok(!faded.mine.marks.includes('wild'), 'without the ink the Wild fades');
});

test('Indelible Ink keeps Gild\'s Prism too, signed for the Loom; a card already Wild is left as it was', () => {
  const { t, hero } = table('ink-gild');
  t.phase = 'flop';
  hero.relics = ['creed_signature', 'indelible_ink'];
  hero.sigils = [];
  hero.mana = 12;
  const board = c(9, 'H');
  t.board = [place(t, board), place(t, c(5, 'C')), place(t, c(2, 'S'))];
  castAndResolve(t, hero, give(hero, 'gild'), { cardIds: [board.id] });
  clearHandMagic(t);
  assert.ok(board.marks.includes('prism'));
  assert.equal(board.markBy?.prism, hero.id, 'the Loom\'s ink works for the Loom alone');

  // Already Wild for good (a rite): the ink writes nothing, and the Wild stays.
  const wild = c(6, 'S', { marks: ['wild'] });
  hero.hole = [place(t, wild), place(t, c(3, 'D'))];
  hero.mana = 12;
  const before = lines(t, 'indelible_ink').length;
  castAndResolve(t, hero, give(hero, 'wild_rite'), { cardIds: [wild.id] });
  clearHandMagic(t);
  assert.ok(wild.marks.includes('wild'));
  assert.equal(lines(t, 'indelible_ink').length, before);
});

// ------------------------------------------------------------ Twofold

test('Twofold: a Wild fills two of the five places, for its owner only', () => {
  const wild = () => c(2, 'C', { marks: ['wild'] });
  const pair = [c(9, 'S'), c(9, 'H'), c(4, 'D'), c(12, 'C'), c(6, 'S'), c(3, 'H')];
  const plain = evaluate({ cards: [wild(), ...pair], viewerId: 'me', mods: {} });
  const twice = evaluate({ cards: [wild(), ...pair], viewerId: 'me', mods: { wildTwice: true } });
  assert.equal(plain.cat, Cat.Trips);
  assert.equal(twice.cat, Cat.Quads, 'a pair and a Wild counted twice is four of a kind');
  const trips = [c(9, 'S'), c(9, 'H'), c(9, 'D'), c(12, 'C'), c(6, 'S'), c(3, 'H')];
  assert.equal(evaluate({ cards: [wild(), ...trips], viewerId: 'me', mods: { wildTwice: true } }).cat, Cat.FiveOfAKind);
  // A Prism under the Prism Lens is Wild for its owner, so it doubles too.
  const lens = evaluate({ cards: [c(5, 'D', { marks: ['prism'] }), ...pair], viewerId: 'me', mods: { prismIsWild: true, wildTwice: true } });
  assert.equal(lens.cat, Cat.Quads);
});

test('Twofold reaches the evaluator through modsFor, and the showdown says when it made the hand', () => {
  const w = c(2, 'C', { marks: ['wild'] });
  const { e, t, hero, foe } = headsUp('twofold', [w, c(9, 'H')], [c(13, 'C'), c(13, 'D')],
    [c(9, 'S'), c(4, 'D'), c(12, 'C'), c(6, 'S'), c(3, 'H')]);
  hero.relics = ['twofold'];
  assert.equal(modsFor(t, hero).wildTwice, true);
  assert.equal(modsFor(t, foe).wildTwice, undefined);
  const memory = w.memory;
  const { payout } = runShowdown(t, new Rng('twofold'));
  e.dispose();
  const mine = payout.entries.find((x) => x.playerId === hero.id)!;
  assert.match(mine.handName, /Four of a Kind/);
  assert.ok(mine.won > 0);
  const said = lines(t, 'twofold');
  assert.equal(said.length, 1);
  assert.match(said[0].text, /Hero's Twofold: the Wild 2♣ fills two places, in Four of a Kind/);
  assert.equal(w.memory, memory + 1, 'a card named twice remembers the pot once');
});

// ------------------------------------------------------------ The High Spade

test('The High Spade: lose holding the highest Spade in the hole and half the pot is yours', () => {
  const { e, t, hero, foe } = headsUp('spade', [c(14, 'S'), c(3, 'D')], [c(13, 'C'), c(13, 'D')],
    [c(9, 'S'), c(4, 'D'), c(12, 'C'), c(6, 'H'), c(2, 'H')]);
  hero.relics = ['high_spade'];
  const before = { hero: hero.chips, foe: foe.chips };
  const { payout } = runShowdown(t, new Rng('spade'));
  e.dispose();
  const pot = payout.pots[0].amount;
  assert.deepEqual(payout.pots[0].winners, [foe.id], 'the Kings still win the hand');
  assert.equal(hero.chips - before.hero, Math.floor(pot / 2));
  assert.equal(foe.chips - before.foe, pot - Math.floor(pot / 2));
  assert.equal(payout.entries.find((x) => x.playerId === hero.id)!.won, Math.floor(pot / 2));
  const said = lines(t, 'high_spade');
  assert.equal(said.length, 1);
  assert.match(said[0].text, /Hero's High Spade: A♠ is the highest Spade in the hole, and takes half the pot/);
  assert.ok(!t.log.some((l) => /Hero takes \d/.test(l.text)), 'a half is not a pot won');
});

test('The High Spade pays nothing to a winner, to a lower Spade, or on a tie; a Wild is the Ace', () => {
  const play = (heroHole: CardEntity[], foeHole: CardEntity[]) => {
    const { e, t, hero, foe } = headsUp('spade2', heroHole, foeHole,
      [c(9, 'D'), c(4, 'D'), c(12, 'C'), c(7, 'H'), c(2, 'H')]);
    hero.relics = ['high_spade'];
    const chips = hero.chips;
    const { payout } = runShowdown(t, new Rng('spade2'));
    e.dispose();
    return { got: hero.chips - chips, pot: payout.pots[0].amount, said: lines(t, 'high_spade').length, foe };
  };
  // A lower Spade than the opponent's.
  assert.equal(play([c(10, 'S'), c(3, 'D')], [c(13, 'S'), c(13, 'D')]).said, 0);
  // The winner holds it: they take the pot, not a half more.
  const won = play([c(14, 'S'), c(14, 'D')], [c(13, 'C'), c(13, 'D')]);
  assert.equal(won.got, won.pot);
  assert.equal(won.said, 0);
  // A Wild in the hole is the Ace of Spades, and beats a King of them.
  const wild = play([c(3, 'D', { marks: ['wild'] }), c(5, 'C')], [c(13, 'S'), c(13, 'D')]);
  assert.equal(wild.said, 1);
  assert.equal(wild.got, Math.floor(wild.pot / 2));
  // Two Aces of Spades (a Wild and the real one): nobody's is the highest.
  assert.equal(play([c(3, 'D', { marks: ['wild'] }), c(5, 'C')], [c(14, 'S'), c(14, 'D')]).said, 0);
});

// ------------------------------------------------------------ The Changeling

test('The Changeling wears an opponent\'s relic for the hand, says whose, and gives it back', () => {
  const { e, t, hero, others, ix } = table('changeling');
  hero.relics = ['changeling'];
  for (const q of others) q.relics = q === others[1] ? ['creed_last_word', 'third_hand'] : ['creed_last_word'];
  t.phase = 'payout';
  ix.beginHand();
  assert.equal(hero.borrowed, 'third_hand', 'the only relic on offer that is not a creed');
  assert.ok(hero.relics.includes('third_hand'));
  assert.equal(hero.hole.length, 3, 'and it acts: three hole cards');
  const said = lines(t, 'changeling');
  assert.equal(said.length, 1);
  assert.match(said[0].text, new RegExp(`Hero's Changeling wears ${others[1].name}'s Third Hand for this hand`));
  assert.ok(others[1].relics.includes('third_hand'), 'a copy: the lender keeps theirs');
  // The hand ends, the relic goes back.
  t.payout = { pots: [], entries: [], shards: {} };
  ix.endHand();
  e.dispose();
  assert.equal(hero.borrowed, undefined);
  assert.deepEqual(hero.relics, ['changeling']);
});

test('The Changeling borrows nothing when no opponent holds a relic it could wear', () => {
  const { e, t, hero, others, ix } = table('changeling-idle');
  hero.relics = ['changeling', 'third_hand'];
  for (const q of others) q.relics = ['creed_last_word', ...(q === others[0] ? ['third_hand', 'changeling'] : [])];
  t.phase = 'payout';
  ix.beginHand();
  e.dispose();
  assert.equal(hero.borrowed, undefined, 'a creed, a relic it holds and another Changeling are not on offer');
  assert.equal(lines(t, 'changeling').length, 0);
});

test('The Changeling: a card kept under a borrowed Keepsake still comes back, and a Usurper keeps what it took', () => {
  const { e, t, hero, others, ix } = table('changeling-keep');
  // The Keepsake, worn for a hand: fold before the flop and the card is kept.
  hero.relics = ['changeling'];
  for (const q of others) q.relics = q === others[0] ? ['keepsake'] : [];
  t.phase = 'payout';
  ix.beginHand();
  assert.equal(hero.borrowed, 'keepsake');
  t.actingId = hero.id;
  const ranks = hero.hole.map((id) => t.cards.get(id)!.faces[0].rank);
  const best = hero.hole[ranks.indexOf(Math.max(...ranks))];
  assert.ok(e.act(hero.id, { kind: 'fold' }).ok);
  e.dispose();
  assert.equal(hero.keepsake, best);
  t.payout = { pots: [], entries: [], shards: {} };
  ix.endHand();
  e.dispose();
  assert.ok(!hero.relics.includes('keepsake'), 'given back');
  // Next hand nobody has a relic to lend: the kept card comes back anyway.
  for (const q of others) q.relics = [];
  t.phase = 'payout';
  ix.beginHand();
  e.dispose();
  assert.ok(hero.hole.includes(best), 'the card kept under the borrowed Keepsake came back');

  // The Usurper knocks out the player it borrowed from: the relic is now its own.
  const u = table('changeling-usurp');
  const [foe] = u.others;
  u.hero.relics = ['changeling', 'the_usurper', 'third_hand'];
  u.hero.borrowed = 'third_hand';
  foe.relics = ['third_hand', 'ouroboros'];
  foe.chips = 0;
  u.t.payout = {
    pots: [{ amount: 1000, winners: [u.hero.id], label: 'Main Pot' }],
    entries: [
      { playerId: u.hero.id, cards: [], handName: 'Pair of Aces', cat: Cat.Pair, score: 1, usedIds: [], impossible: false, won: 1000 },
      { playerId: foe.id, cards: [], handName: 'High Card', cat: Cat.HighCard, score: 0, usedIds: [], impossible: false, won: 0 },
    ],
    shards: {},
  };
  u.ix.endHand();
  u.e.dispose();
  assert.ok(foe.eliminated);
  assert.ok(u.hero.relics.includes('third_hand') && u.hero.relics.includes('ouroboros'));
  assert.equal(u.hero.borrowed, undefined);
});

// ------------------------------------------------------------ The Grimoire

test('The Grimoire: a sigil you wrote comes back to your hand when the hand ends', () => {
  const run = (grimoire: boolean) => {
    const { e, t, hero, others, ix } = table(`grimoire:${grimoire}`);
    hero.relics = grimoire ? ['grimoire'] : [];
    hero.sigils = [];
    hero.mana = 10;
    t.phase = 'river';
    const read = readSpell('draw two sigils', rosterFor(t, hero));
    assert.ok(read.ok, read.error);
    hero.sigils.push({ uid: 'page', defId: SCRIBED_ID, scribed: read.spell });
    castAndResolve(t, hero, 'page', {});
    assert.ok(!hero.sigils.some((s) => s.uid === 'page'), 'cast, it leaves the hand');
    for (const q of others) q.chips = Math.max(q.chips, 1);
    t.payout = { pots: [], entries: [], shards: {} };
    ix.endHand();
    e.dispose();
    return { t, hero };
  };
  const kept = run(true);
  assert.ok(kept.hero.sigils.some((s) => s.uid === 'page' && s.scribed), 'the page came back');
  const said = lines(kept.t, 'grimoire');
  assert.equal(said.length, 1);
  assert.match(said[0].text, /Hero's Grimoire: .+ comes back to their hand/);
  const spent = run(false);
  assert.ok(!spent.hero.sigils.some((s) => s.uid === 'page'), 'without it, a written sigil is spent');
});

test('The Grimoire keeps only what its owner wrote: a printed sigil is spent as ever', () => {
  const { e, t, hero, ix } = table('grimoire-printed');
  hero.relics = ['grimoire'];
  hero.sigils = [];
  hero.mana = 10;
  t.phase = 'flop';
  castAndResolve(t, hero, give(hero, 'second_sight'), {});
  t.payout = { pots: [], entries: [], shards: {} };
  ix.endHand();
  e.dispose();
  assert.ok(!hero.sigils.some((s) => s.defId === 'second_sight'));
  assert.equal(lines(t, 'grimoire').length, 0);
});
