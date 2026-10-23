/**
 * Forty-five relics, forty-five different things.
 *
 * Found in round 3 of the fun pass (FUN-REVIEW.md, 2026-10-10): eight relics
 * did exactly what another one did under a different name, sometimes at twice
 * the price (Bloodline, rare, 16 shards, was Gilt Edge, common, 8). The store
 * page sold "45 relics"; the Market held 37 effects, and a veteran's first
 * question about a roguelite's shop is whether its choices are real.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { runShowdown } from '../server/game/showdown';
import { viewFor } from '../server/game/table';
import { type CardEntity, makeCard } from '../shared/cards';
import { CREEDS, RELICS } from '../shared/relics';
import { Rng } from '../shared/rng';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

/** What a relic does: every field but its name, art, price and words. */
function effect(r: (typeof RELICS)[number]): string {
  return JSON.stringify({
    mods: r.mods, mana: r.mana, sigils: r.sigils, vision: r.vision,
    onWin: r.onWin, deal: r.deal, economy: r.economy, rule: r.rule,
  });
}

test('no two relics do the same thing (a creed included)', () => {
  const seen = new Map<string, string>();
  for (const r of [...RELICS, ...CREEDS]) {
    const key = effect(r);
    const twin = seen.get(key);
    assert.ok(!twin, `${r.name} does exactly what ${twin} does`);
    seen.set(key, r.name);
  }
});

test('Cold Read shows one hole card of every other player from the deal', () => {
  const e = new Engine('READ', 'host', { ...DEFAULT_CONFIG }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < 3; i++) e.addBot();
  e.start();
  e.dispose();
  const t = e.table;
  const hero = t.players.find((p) => p.id === 'host')!;
  hero.relics.push('cold_read');
  // Deal the next hand with the relic in play.
  t.phase = 'payout';
  (e as unknown as { beginHand(): void }).beginHand();
  e.dispose();
  for (const q of t.players.filter((p) => p.id !== 'host')) {
    assert.ok(hero.foreknowledge.seenHole.some((id) => q.hole.includes(id)), `nothing of ${q.name}'s hand was readable`);
  }
  // The table says so: the hero's view shows a face on each opponent's hand.
  const view = viewFor(t, 'host');
  assert.equal(view.players.filter((p) => !p.isYou).length, 3);
});

test('the store page count is the real count', () => {
  assert.equal(RELICS.length, 45);
  assert.equal(new Set(RELICS.map((r) => r.id)).size, 45);
});

test('most of the shelf changes a rule; a few relics are only a number', () => {
  // Round 4 (FUN-REVIEW.md): 19 of 45 were a number on a passive, and two of
  // them (Open Palm, Full Purse) were never read. Twelve became rules.
  const number = RELICS.filter((r) => !r.mods && !r.deal && !r.rule && !r.vision && !r.onWin?.engrave);
  assert.ok(number.length <= 7, `${number.length} relics are only a number: ${number.map((r) => r.name).join(', ')}`);
});

// ------------------------------------------------- relics that act at the deal

/** A started table, its host and three bots, with every clock stopped. */
function started(seed: string): { e: Engine; t: Table; hero: Player; foe: Player } {
  const e = new Engine('DEAL', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < 3; i++) e.addBot();
  e.start();
  e.dispose();
  const t = e.table;
  const hero = t.players.find((p) => p.id === 'host')!;
  const foe = t.players.find((p) => p.id !== 'host')!;
  return { e, t, hero, foe };
}

/** Hero against one opponent at a showdown, every other seat folded. */
function headsUp(seed: string, heroHole: CardEntity[], foeHole: CardEntity[], board: CardEntity[]) {
  const { t, hero, foe } = started(seed);
  const put = (x: CardEntity): string => { t.cards.set(x.id, x); return x.id; };
  for (const q of t.players) { q.folded = q.id !== hero.id && q.id !== foe.id; q.committed = 0; q.bet = 0; }
  hero.hole = heroHole.map(put);
  foe.hole = foeHole.map(put);
  t.board = board.map(put);
  hero.committed = 400; foe.committed = 400;
  t.relicDeals = [];
  return { t, hero, foe };
}

const credits = (t: Table, relicId: string) => t.log.filter((l) => l.rule === relicId && l.playerId === 'host');

test('two relics that each mark a hole card mark two different cards', () => {
  // Fails on 326034a: only the first `markOwn` relic was ever applied, so
  // Wild Inheritance (a mythic, 20 shards) bought beside Gilt Edge did nothing.
  const { e, t, hero } = started('two-marks');
  hero.relics.push('gilt_edge', 'wild_inheritance');
  t.phase = 'payout';
  (e as unknown as { beginHand(): void }).beginHand();
  e.dispose();
  const marks = hero.hole.map((id) => t.cards.get(id)!.marks);
  const blooded = hero.hole.filter((_, i) => marks[i].includes('blooded'));
  const wild = hero.hole.filter((_, i) => marks[i].includes('wild'));
  assert.equal(blooded.length, 1, 'Gilt Edge marked no card');
  assert.equal(wild.length, 1, 'Wild Inheritance marked no card');
  assert.notEqual(blooded[0], wild[0], 'both marks landed on one card');
  assert.deepEqual(
    (t.relicDeals ?? []).filter((d) => d.playerId === hero.id).map((d) => d.relicId).sort(),
    ['gilt_edge', 'wild_inheritance'],
  );
});

test('a marked hole card is credited at the showdown only when the mark changed the hand', () => {
  // Three Aces on the board: a Wild 2 in the hole makes four of them.
  const wild2 = makeCard(2, 'C', { marks: ['wild'] });
  const played = headsUp('wild-plays', [wild2, makeCard(7, 'D')], [makeCard(13, 'C'), makeCard(12, 'C')],
    [makeCard(14, 'S'), makeCard(14, 'H'), makeCard(14, 'D'), makeCard(9, 'C'), makeCard(4, 'S')]);
  played.hero.relics = ['wild_inheritance'];
  played.t.relicDeals = [{ playerId: 'host', relicId: 'wild_inheritance', cardId: wild2.id }];
  runShowdown(played.t, new Rng('wild-plays'));
  const lines = credits(played.t, 'wild_inheritance');
  assert.equal(lines.length, 1, 'the Wild card made the hand and nothing said so');
  assert.match(lines[0].text, /Hero's Wild Inheritance: 2♣ played as whatever the hand needed, in Four of a Kind/);

  // A full house on the board: the Blooded 2 cannot change it.
  const blooded2 = makeCard(2, 'C', { marks: ['blooded'] });
  const idle = headsUp('blooded-idle', [blooded2, makeCard(7, 'D')], [makeCard(5, 'C'), makeCard(6, 'H')],
    [makeCard(14, 'S'), makeCard(14, 'H'), makeCard(14, 'D'), makeCard(13, 'C'), makeCard(13, 'D')]);
  idle.hero.relics = ['gilt_edge'];
  idle.t.relicDeals = [{ playerId: 'host', relicId: 'gilt_edge', cardId: blooded2.id }];
  runShowdown(idle.t, new Rng('blooded-idle'));
  assert.equal(credits(idle.t, 'gilt_edge').length, 0, 'a mark that changed nothing was credited');
});

test('Third Hand is credited when the hand needs all three hole cards', () => {
  const nines = headsUp('third-plays', [makeCard(9, 'S'), makeCard(9, 'H'), makeCard(9, 'D')],
    [makeCard(13, 'C'), makeCard(12, 'H')],
    [makeCard(2, 'C'), makeCard(5, 'D'), makeCard(11, 'S'), makeCard(13, 'H'), makeCard(3, 'C')]);
  nines.hero.relics = ['third_hand'];
  nines.t.relicDeals = [{ playerId: 'host', relicId: 'third_hand' }];
  runShowdown(nines.t, new Rng('third-plays'));
  assert.equal(credits(nines.t, 'third_hand').length, 1);

  // Four of a kind on the board and an Ace kicker in either pair of hole cards.
  const spare = headsUp('third-idle', [makeCard(14, 'S'), makeCard(14, 'H'), makeCard(3, 'D')],
    [makeCard(5, 'C'), makeCard(6, 'H')],
    [makeCard(10, 'C'), makeCard(10, 'D'), makeCard(10, 'S'), makeCard(10, 'H'), makeCard(2, 'C')]);
  spare.hero.relics = ['third_hand'];
  spare.t.relicDeals = [{ playerId: 'host', relicId: 'third_hand' }];
  runShowdown(spare.t, new Rng('third-idle'));
  assert.equal(credits(spare.t, 'third_hand').length, 0, 'a spare third card was credited');
});

test('Unstable Isotope says what its card landed as, and nothing when it landed as dealt', () => {
  const board = () => [makeCard(14, 'S'), makeCard(14, 'H'), makeCard(9, 'D'), makeCard(5, 'C'), makeCard(3, 'H')];
  const coin = (landed: number): CardEntity =>
    makeCard(2, 'C', { faces: [{ rank: 2, suit: 'C' }, { rank: 14, suit: 'C' }], collapsed: landed });

  const ace = coin(1);
  const up = headsUp('isotope-up', [ace, makeCard(7, 'D')], [makeCard(13, 'C'), makeCard(12, 'H')], board());
  up.hero.relics = ['unstable_isotope'];
  up.t.relicDeals = [{ playerId: 'host', relicId: 'unstable_isotope', cardId: ace.id }];
  runShowdown(up.t, new Rng('isotope-up'));
  const lines = credits(up.t, 'unstable_isotope');
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /the undecided 2♣ landed as A♣, and it played/);

  const two = coin(0);
  const flat = headsUp('isotope-flat', [two, makeCard(7, 'D')], [makeCard(13, 'C'), makeCard(12, 'H')], board());
  flat.hero.relics = ['unstable_isotope'];
  flat.t.relicDeals = [{ playerId: 'host', relicId: 'unstable_isotope', cardId: two.id }];
  runShowdown(flat.t, new Rng('isotope-flat'));
  assert.equal(credits(flat.t, 'unstable_isotope').length, 0, 'a card that landed as dealt was credited');
});
