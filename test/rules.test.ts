/**
 * Relics that change a rule, and a creed for every coven.
 *
 * Round 4 of the fun pass (FUN-REVIEW.md, 2026-10-10). The locked rubric
 * scored "relics are more than numbers" 6 and "covens differ and deliver
 * their pitch" 6. Twelve number relics became twelve rules (shared/relics.ts
 * RULES) and each coven gained one rule for the whole run (CREEDS). Each test
 * here holds one rule to what its card says.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { equity } from '../server/game/bots';
import { Engine } from '../server/game/engine';
import { castSigil, resolveStack, superposeCard, type MagicCtx } from '../server/game/magic';
import { runShowdown } from '../server/game/showdown';
import { buy } from '../server/game/shop';
import { castBlock, modsFor } from '../server/game/table';
import { type CardEntity, type Rank, type Suit, makeCard } from '../shared/cards';
import { BOT_CREEDS_FROM_ANTE, COVENS, COVEN_BY_ID, COVEN_CREEDS, creedOf } from '../shared/covens';
import { Cat, evaluate, type RuleMods } from '../shared/hand';
import { CREEDS, RELICS, RELIC_BY_ID, RULE_RELICS } from '../shared/relics';
import { Rng } from '../shared/rng';
import { SIGILS } from '../shared/sigils';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

/**
 * Cast on the caster's own turn.
 *
 * A sigil is an action and actions happen on your turn (see `castBlock`'s
 * `turn` rule), so a fixture that casts has to say whose turn it is. These
 * tests are about what a sigil does once it is cast, not about turn order —
 * that is `test/rotation.test.ts` — so the table is simply put on whoever is
 * casting. Responses are exempt from the rule and unaffected by this.
 */
function castOnTurn(
  ctx: MagicCtx, p: Player, uid: string, targets: Parameters<typeof castSigil>[3],
): ReturnType<typeof castSigil> {
  ctx.t.actingId = p.id;
  return castSigil(ctx, p, uid, targets);
}


// ---------------------------------------------------------------- helpers

const c = (rank: Rank, suit: Suit, patch: Partial<CardEntity> = {}): CardEntity => makeCard(rank, suit, patch);
const read = (cards: CardEntity[], mods: RuleMods = {}, viewer: string | null = 'me') =>
  evaluate({ cards, viewerId: viewer, mods });

interface Internals {
  beginHand(): void;
  dealStreet(phase: string): void;
  secondRiver(): void;
  tells(p: Player): void;
  endHand(): void;
}

/** A started solo table: the host and three bots, every clock stopped. */
function table(coven = 'unaligned', bots = 3): { e: Engine; t: Table; hero: Player; others: Player[]; ix: Internals } {
  const e = new Engine('RULE', 'host', { ...DEFAULT_CONFIG, seed: `rules:${coven}` }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < bots; i++) e.addBot();
  const hero = e.table.players.find((p) => p.id === 'host')!;
  hero.coven = coven;
  e.start();
  e.dispose();
  return { e, t: e.table, hero, others: e.table.players.filter((p) => p.id !== 'host'), ix: e as unknown as Internals };
}

/** Put a card into the table's population and return its id. */
function place(t: Table, card: CardEntity): string {
  t.cards.set(card.id, card);
  return card.id;
}

const ctxOf = (t: Table): MagicCtx => ({ t, rng: new Rng('rules'), fx: [] });

function give(p: Player, defId: string): string {
  const uid = `${p.id}-${defId}-${p.sigils.length}`;
  p.sigils.push({ uid, defId });
  return uid;
}

// ---------------------------------------------------------------- the shelf

test('the rule shelf is on, and the registry is 45 and round 9\'s seven', () => {
  assert.equal(RULE_RELICS, true);
  assert.equal(RELICS.length, 52);
  assert.equal(new Set(RELICS.map((r) => r.id)).size, 52);
});

test('no creed is for sale, and every coven has its own', () => {
  assert.equal(COVEN_CREEDS, true);
  for (const r of RELICS) assert.ok(!r.coven, `${r.name} is a creed on the Market's shelf`);
  const owners = new Set<string>();
  for (const coven of COVENS) {
    const creed = RELIC_BY_ID[coven.creed];
    assert.ok(creed, `${coven.name} has no creed`);
    assert.equal(creed.coven, coven.id, `${creed.name} names the wrong coven`);
    owners.add(creed.id);
  }
  assert.equal(owners.size, COVENS.length);
  assert.equal(CREEDS.length, COVENS.length);
});

test('the player holds their creed from the first hand; at Hex I a bot\'s wakes at ante 3', () => {
  assert.equal(BOT_CREEDS_FROM_ANTE, 3);
  for (const coven of COVENS) {
    const { t, hero, others, ix } = table(coven.id);
    assert.equal(hero.relics[0], creedOf(coven), coven.name);
    for (const p of others) assert.ok(!p.relics.includes(creedOf(COVEN_BY_ID[p.coven])!), `${p.name} woke early`);
    t.ante = BOT_CREEDS_FROM_ANTE;
    t.phase = 'payout';
    ix.beginHand();
    for (const p of others) assert.equal(p.relics[0], creedOf(COVEN_BY_ID[p.coven]), p.name);
  }
});

test('at Hex II every seat holds its creed from the first hand', () => {
  const e = new Engine('RULE', 'host', { ...DEFAULT_CONFIG, hex: 2, seed: 'rules:hex2' }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < 3; i++) e.addBot();
  e.start();
  e.dispose();
  for (const p of e.table.players) assert.equal(p.relics[0], creedOf(COVEN_BY_ID[p.coven]), p.name);
});

test('an undecided hole card settles on the face that helps its holder, as Superpose says', () => {
  const { t, hero, others, ix } = table();
  for (const q of others) q.folded = true;
  const pivot = c(13, 'H');
  pivot.faces = [{ rank: 13, suit: 'H' }, { rank: 7, suit: 'S' }];
  pivot.collapsed = null;
  hero.hole = [place(t, pivot), place(t, c(2, 'C'))];
  t.board = [place(t, c(7, 'D')), place(t, c(7, 'C')), place(t, c(9, 'S')), place(t, c(4, 'H')), place(t, c(11, 'D'))];
  for (const p of t.players) p.committed = p.id === hero.id ? 200 : 0;
  (ix as unknown as { toShowdown(): void }).toShowdown();
  assert.equal(pivot.faces[pivot.collapsed!].rank, 7, 'the Seven makes trips; the King made a pair');
});

// ------------------------------------------------------- hands read differently

test('Stepping Stones: a straight may skip one rank', () => {
  const hand = [c(5, 'S'), c(6, 'H'), c(8, 'D'), c(9, 'C'), c(10, 'S'), c(2, 'H'), c(13, 'D')];
  assert.notEqual(read(hand).cat, Cat.Straight);
  const r = read(hand, { straightGap: true });
  assert.equal(r.cat, Cat.Straight);
  assert.equal(r.ranks[0], 10);
  // An unbroken run is still read as the higher straight it is.
  const run = [c(9, 'S'), c(10, 'H'), c(11, 'D'), c(12, 'C'), c(13, 'S'), c(2, 'H'), c(4, 'D')];
  assert.equal(read(run, { straightGap: true }).ranks[0], 13);
  // Two holes are not a straight.
  const holes = [c(4, 'S'), c(6, 'H'), c(8, 'D'), c(9, 'C'), c(10, 'S'), c(13, 'H'), c(2, 'D')];
  assert.notEqual(read(holes, { straightGap: true }).cat, Cat.Straight);
});

test('the Lodestone: a drawn rank is Wild for its owner', () => {
  const hand = [c(7, 'S'), c(13, 'H'), c(13, 'D'), c(2, 'C'), c(9, 'S'), c(4, 'H'), c(11, 'D')];
  assert.equal(read(hand).cat, Cat.Pair);
  assert.equal(read(hand, { wildRanks: [7] }).cat, Cat.Trips);
});

test('the Prism Lens: a Prism is fully Wild', () => {
  const hand = [c(3, 'S', { marks: ['prism'] }), c(13, 'H'), c(13, 'D'), c(2, 'C'), c(9, 'S'), c(5, 'H'), c(11, 'D')];
  assert.equal(read(hand).cat, Cat.Pair);
  assert.equal(read(hand, { prismIsWild: true }).cat, Cat.Trips);
});

test('Kin: a copy on the board is Wild for the Twinned; a copy in the hole is not', () => {
  // Two King of Spades on the board (a Mirror) beside Queen, Jack, Ten: a
  // pair of Kings for the table, a Straight for the Twinned.
  const hole = [c(2, 'D'), c(5, 'C')];
  const board = [c(13, 'S'), c(13, 'S'), c(12, 'H'), c(11, 'D'), c(10, 'C')];
  const hand = [...hole, ...board];
  const kin = { copiesWild: true, kinHole: hole.map((x) => x.id) };
  assert.equal(read(hand).cat, Cat.Pair);
  assert.equal(read(hand, kin).cat, Cat.Straight);
  // The same two Kings in the hole (a Graft) are a pair, not a Wild.
  const grafted = [c(13, 'S'), c(13, 'S'), c(12, 'H'), c(11, 'D'), c(10, 'C'), c(2, 'D'), c(5, 'C')];
  assert.equal(read(grafted, { copiesWild: true, kinHole: [grafted[0].id, grafted[1].id] }).cat, Cat.Pair);
  // No copy, no Wild.
  const plain = [c(13, 'S'), c(12, 'S'), c(13, 'H'), c(7, 'D'), c(7, 'C'), c(2, 'S'), c(4, 'H')];
  assert.equal(read(plain, { copiesWild: true }).score, read(plain).score);
});

test('Signature: a signed mark works for its writer and nobody else', () => {
  const signed = c(3, 'S', { marks: ['wild'], markBy: { wild: 'loom' } });
  const hand = [signed, c(13, 'H'), c(13, 'D'), c(2, 'C'), c(9, 'S'), c(5, 'H'), c(11, 'D')];
  assert.equal(read(hand, {}, 'loom').cat, Cat.Trips);
  assert.equal(read(hand, {}, 'someone').cat, Cat.Pair);
});

test('every relic\'s hand rule reaches the evaluator (Heirloom never did)', () => {
  const { t, hero } = table();
  for (const r of [...RELICS, ...CREEDS, RELIC_BY_ID.heirloom, RELIC_BY_ID.the_long_game]) {
    if (!r?.mods) continue;
    hero.relics = [r.id];
    const m = modsFor(t, hero) as Record<string, unknown>;
    for (const key of Object.keys(r.mods)) {
      assert.notEqual(m[key], undefined, `${r.name}'s ${key} never reaches a hand`);
    }
  }
});

// ------------------------------------------------------------- the stack

test('Twice-Told: the first sigil of the hand resolves twice, the second once', () => {
  const { t, hero } = table();
  t.phase = 'flop';
  t.stack = null;
  hero.relics = ['twice_told'];
  hero.sigils = [];
  hero.mana = 9;
  hero.castsThisHand = 0;
  const ctx = ctxOf(t);
  assert.ok(castOnTurn(ctx, hero, give(hero, 'second_wind'), {}).ok);
  assert.equal(t.stack!.entries[0].twice, true);
  t.stack!.pending = [];
  resolveStack(ctx);
  assert.equal(hero.sigils.length, 4, 'Second Wind twice draws four');
  hero.sigils = [];
  assert.ok(castOnTurn(ctx, hero, give(hero, 'second_wind'), {}).ok);
  assert.equal(t.stack!.entries[0].twice, undefined);
});

test('the Magpie: countering a sigil brings it to your hand', () => {
  const { t, hero, others } = table();
  const [foe] = others;
  t.phase = 'flop';
  t.stack = null;
  hero.relics = ['magpie'];
  hero.sigils = [];
  hero.mana = 9;
  foe.sigils = [];
  foe.mana = 9;
  const ctx = ctxOf(t);
  const counter = give(hero, 'nullify');
  assert.ok(castOnTurn(ctx, foe, give(foe, 'second_wind'), {}).ok);
  assert.ok(castOnTurn(ctx, hero, counter, {}).ok);
  t.stack!.pending = [];
  resolveStack(ctx);
  assert.deepEqual(hero.sigils.map((s) => s.defId), ['second_wind']);
  assert.equal(foe.sigils.length, 0, 'the countered Second Wind drew nothing');
});

test('Vow of Silence: nobody may answer, and its owner answers nothing', () => {
  const { t, hero, others } = table();
  const [foe] = others;
  t.phase = 'flop';
  t.stack = null;
  hero.relics = ['vow_of_silence'];
  hero.sigils = [];
  hero.mana = 9;
  foe.sigils = [];
  foe.mana = 9;
  give(foe, 'nullify');
  const ctx = ctxOf(t);
  assert.ok(castOnTurn(ctx, hero, give(hero, 'second_wind'), {}).ok);
  assert.deepEqual(t.stack!.pending, [], 'a vowed sigil opens no response window');
  resolveStack(ctx);
  const counter = give(hero, 'nullify');
  assert.deepEqual(castBlock(t, hero, hero.sigils.find((s) => s.uid === counter)!), { why: 'relic', relic: 'vow_of_silence' });
});

test('the Sanctum: it cannot be named, and it names nobody', () => {
  const { t, hero, others } = table();
  const [foe] = others;
  t.phase = 'turn';
  t.stack = null;
  foe.relics = ['sanctum'];
  hero.sigils = [];
  hero.mana = 9;
  const ctx = ctxOf(t);
  const hex = castOnTurn(ctx, hero, give(hero, 'hex'), { playerId: foe.id });
  assert.equal(hex.ok, false);
  assert.match(hex.error ?? '', /Sanctum/);
  const touch = castOnTurn(ctx, hero, give(hero, 'superpose'), { cardIds: [foe.hole[0]] });
  assert.equal(touch.ok, false, 'a Sanctum holder\'s hole card is out of reach');
  hero.relics = ['sanctum'];
  const read = hero.sigils.find((s) => s.defId === 'hex')!;
  assert.deepEqual(castBlock(t, hero, read), { why: 'relic', relic: 'sanctum' });
});

test('the Blood Price: mana short is paid in chips, a big blind a mana, never the last chip', () => {
  const { t, hero } = table();
  t.phase = 'flop';
  t.stack = null;
  hero.relics = ['blood_price'];
  hero.sigils = [];
  hero.mana = 0;
  hero.chips = 5000;
  const ctx = ctxOf(t);
  const uid = give(hero, 'second_wind');
  assert.equal(castBlock(t, hero, hero.sigils[0]), null);
  assert.ok(castOnTurn(ctx, hero, uid, {}).ok);
  assert.equal(hero.chips, 5000 - 2 * t.bb);
  // A stack that would have to bleed its last chip cannot.
  hero.mana = 0;
  hero.chips = 2 * t.bb;
  t.stack = null;
  const again = give(hero, 'second_wind');
  assert.deepEqual(castBlock(t, hero, hero.sigils.find((s) => s.uid === again)!), { why: 'mana', need: 2 });
});

// ------------------------------------------------------------- the deal

test('the Lodestone draws a rank at the deal, says so, and makes it Wild', () => {
  const { t, hero, ix } = table();
  hero.relics = ['lodestone'];
  t.phase = 'payout';
  ix.beginHand();
  assert.ok(hero.lodestone && hero.lodestone >= 2 && hero.lodestone <= 14);
  assert.deepEqual(modsFor(t, hero).wildRanks, [hero.lodestone]);
  assert.ok(t.modNotes.some((n) => /Wild for Hero/.test(n)));
  assert.ok(t.log.some((l) => l.rule === 'lodestone'));
});

test('the Keepsake: the higher card folded before the flop comes back next hand', () => {
  const { e, t, hero, ix } = table();
  hero.relics = ['keepsake'];
  t.phase = 'payout';
  ix.beginHand();
  // Turn order is not what is under test: hand the hero the action.
  t.actingId = hero.id;
  const ranks = hero.hole.map((id) => t.cards.get(id)!.faces[0].rank);
  const best = hero.hole[ranks.indexOf(Math.max(...ranks))];
  assert.ok(e.act(hero.id, { kind: 'fold' }).ok);
  e.dispose();
  assert.equal(hero.keepsake, best);
  t.phase = 'payout';
  ix.beginHand();
  e.dispose();
  assert.ok(hero.hole.includes(best), 'the kept card was dealt back');
  assert.equal(hero.hole.length, 2);
  assert.equal(t.deck.includes(best), false, 'and nobody else can draw it');
});

test('the Second River: a river that leaves you High Card runs again, once', () => {
  const { t, hero, others, ix } = table();
  hero.relics = ['second_river'];
  for (const q of others) q.folded = true;
  hero.folded = false;
  hero.hole = [place(t, c(2, 'S')), place(t, c(7, 'H'))];
  t.board = [place(t, c(9, 'D')), place(t, c(11, 'C')), place(t, c(13, 'S')), place(t, c(4, 'D')), place(t, c(3, 'C'))];
  const river = t.board[4];
  const next = place(t, c(7, 'C'));
  t.deck = [next, ...t.deck.filter((id) => id !== next)];
  ix.secondRiver();
  assert.equal(t.board[4], next);
  assert.ok(t.discard.includes(river));
  assert.ok(t.log.some((l) => l.rule === 'second_river'));
});

test('the Engraver: a showdown win engraves a card of the winning hand Prism, for good', () => {
  const { t, hero, others } = table();
  const [foe] = others;
  for (const q of others) q.folded = q.id !== foe.id;
  hero.relics = ['the_engraver'];
  hero.hole = [place(t, c(14, 'S')), place(t, c(14, 'H'))];
  foe.hole = [place(t, c(2, 'C')), place(t, c(7, 'D'))];
  t.board = [place(t, c(14, 'D')), place(t, c(9, 'C')), place(t, c(5, 'S')), place(t, c(4, 'H')), place(t, c(11, 'D'))];
  hero.committed = 400; foe.committed = 400;
  for (const q of others) if (q.id !== foe.id) q.committed = 0;
  const { payout } = runShowdown(t, new Rng('engrave'));
  assert.equal(payout.pots[0].winners[0], hero.id);
  const engraved = [...hero.hole, ...t.board].map((id) => t.cards.get(id)!).filter((x) => x.marks.includes('prism'));
  assert.equal(engraved.length, 1);
  assert.equal(engraved[0].faces[0].rank, 14, 'the highest card of the winning hand');
});

test('the Usurper: knocking a player out takes their relics, never their creed', () => {
  const { t, hero, others, ix } = table();
  const [foe] = others;
  hero.relics = ['the_usurper'];
  foe.relics = [creedOf(COVEN_BY_ID[foe.coven])!, 'thin_veil', 'ouroboros'];
  foe.chips = 0;
  t.payout = {
    pots: [{ amount: 1000, winners: [hero.id], label: 'Main Pot' }],
    entries: [
      { playerId: hero.id, cards: [], handName: 'Pair of Aces', cat: Cat.Pair, score: 1, usedIds: [], impossible: false, won: 1000 },
      { playerId: foe.id, cards: [], handName: 'High Card', cat: Cat.HighCard, score: 0, usedIds: [], impossible: false, won: 0 },
    ],
    shards: {},
  };
  ix.endHand();
  assert.ok(foe.eliminated);
  assert.ok(hero.relics.includes('thin_veil') && hero.relics.includes('ouroboros'));
  assert.ok(!hero.relics.some((id) => RELIC_BY_ID[id]?.coven), 'a creed stays with its coven');
});

// ------------------------------------------------------------- creeds

test('The Last Word: the Unaligned never begin a hand without a counterspell', () => {
  const { t, hero, ix } = table('unaligned', 1);
  for (let h = 0; h < 30; h++) {
    hero.sigils = hero.sigils.filter((s) => s.defId !== 'nullify' && s.defId !== 'redirect' && s.defId !== 'reflect' && s.defId !== 'toll').slice(0, 2);
    t.phase = 'payout';
    ix.beginHand();
    assert.ok(hero.sigils.some((s) => ['nullify', 'redirect', 'reflect', 'toll'].includes(s.defId)), `hand ${h} began without an answer`);
  }
  // A coven without the creed gets no free Nullify.
  const other = table('twinned', 1);
  other.hero.sigils = [];
  other.t.phase = 'payout';
  other.ix.beginHand();
  assert.ok(!other.t.log.some((l) => l.rule === 'creed_last_word'));
});

test('Many Futures: a card that goes undecided in the Unmoored\'s hand holds three faces', () => {
  const { t, hero, others } = table('unmoored');
  const ctx = ctxOf(t);
  const mine = t.cards.get(hero.hole[1])!;
  mine.faces = [mine.faces[mine.collapsed ?? 0]]; mine.collapsed = 0;
  superposeCard(ctx, mine);
  assert.equal(mine.faces.length, 3);
  const theirs = t.cards.get(others.find((q) => q.coven !== 'unmoored')!.hole[0])!;
  theirs.faces = [theirs.faces[theirs.collapsed ?? 0]]; theirs.collapsed = 0;
  superposeCard(ctx, theirs);
  assert.equal(theirs.faces.length, 2);
});

test('Tells: an opponent\'s first bet shows the Quiet one of their hole cards, once a hand', () => {
  const { t, hero, others, ix } = table('quiet');
  const [foe] = others;
  hero.foreknowledge.seenHole = [];
  ix.tells(foe);
  assert.equal(hero.foreknowledge.seenHole.length, 1);
  assert.ok(foe.hole.includes(hero.foreknowledge.seenHole[0]));
  ix.tells(foe);
  assert.equal(hero.foreknowledge.seenHole.length, 1, 'only the first bet is a tell');
});

test('Foreknown: with the flop down, the Long Now has seen the river', () => {
  const { t, hero, ix } = table('long_now');
  t.board = [];
  hero.foreknowledge.deckPeek = [];
  t.phase = 'flop';
  ix.dealStreet('flop');
  const river = t.deck[1];
  assert.ok(hero.foreknowledge.deckPeek.includes(river));
  ix.dealStreet('turn');
  ix.dealStreet('river');
  assert.equal(t.board[4], river, 'the card it saw is the river that came');
});

test('Salt: a card the Ashen burn takes its rank from every hand', () => {
  const { t, hero } = table('ashen');
  t.phase = 'flop';
  t.stack = null;
  t.mods = {};
  hero.sigils = [];
  hero.mana = 9;
  t.board = [place(t, c(13, 'S')), place(t, c(5, 'H')), place(t, c(8, 'D'))];
  const ctx = ctxOf(t);
  assert.ok(castOnTurn(ctx, hero, give(hero, 'burn'), { cardIds: [t.board[0]] }).ok);
  t.stack!.pending = [];
  resolveStack(ctx);
  assert.deepEqual(t.mods.deadRanks, [13]);
});

test('Signature: a rite the Loom buys is signed, and works for the Loom alone', () => {
  const { t, hero, others } = table('loom');
  const [foe] = others;
  const target = [...t.cards.values()].find((x) => x.marks.length === 0)!;
  t.shop.set(hero.id, {
    items: [{ kind: 'rite', uid: 'r1', price: 1, markId: 'wild', cardId: target.id, label: 'Wild' }],
    sold: [], rerollCost: 3, closesAt: Date.now() + 60_000,
  });
  hero.shards = 20;
  assert.ok(buy(t, hero, 'r1', new Rng('sig')).ok);
  assert.equal(target.markBy?.wild, hero.id);
  const hand = [target, c(13, 'H'), c(13, 'D'), c(2, 'C'), c(9, 'S'), c(5, 'H'), c(11, 'D')];
  const kings = (who: string) => evaluate({ cards: hand.filter((x) => x.faces[0].rank !== target.faces[0].rank || x === target), viewerId: who, mods: {} });
  assert.ok(kings(hero.id).cat >= Cat.Trips);
  assert.ok(kings(foe.id).score < kings(hero.id).score);
});

// ------------------------------------------------------------- the bots read

test('a bot that has seen an opponent\'s cards plays against them, not against a guess', () => {
  const { t, others } = table('twinned', 1);
  const [bot] = others;
  const hero = t.players.find((p) => p.id === 'host')!;
  t.phase = 'preflop';
  t.board = [];
  bot.hole = [place(t, c(7, 'C')), place(t, c(2, 'D'))];
  hero.hole = [place(t, c(14, 'S')), place(t, c(14, 'H'))];
  bot.foreknowledge.seenHole = [];
  const blind = equity(t, bot, new Rng('blind'));
  bot.foreknowledge.seenHole = [...hero.hole];
  const seen = equity(t, bot, new Rng('seen'));
  assert.ok(blind > 0.2, `blind read ${blind.toFixed(2)}`);
  assert.ok(seen < 0.2, `a bot that has seen Aces still reads ${seen.toFixed(2)}`);
});
