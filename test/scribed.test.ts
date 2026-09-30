/**
 * Written sigils on the server: the Market charges what the words cost, the
 * descriptions find their targets when the spell resolves, and words cannot
 * reach anything a printed sigil could not.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { castSigil, resolveStack } from '../server/game/magic';
import { createTable } from '../server/game/table';
import { rosterFor, scribe } from '../server/game/shop';
import { readSpell } from '../shared/scribe';
import { SCRIBED_ID } from '../shared/sigils';
import { Rng } from '../shared/rng';
import { DEFAULT_CONFIG, type Player, type Table } from '../shared/types';

function seat(t: Table, id: string, chips: number): Player {
  const p = {
    id, name: id, isBot: id !== 'hero', seat: t.players.length, connected: true, ready: true,
    chips, bet: 0, committed: 0, folded: false, allIn: false, eliminated: false,
    hole: [], sigils: [], relics: [], mana: 10, maxMana: 10, shards: 40, coven: 'unaligned',
    warded: false, severed: false, hexed: 0, blinded: false, sittingOut: false,
    lastAction: null, avatar: 0, shopDone: false, handsWon: 0, biggestPot: 0,
    foreknowledge: { deckPeek: [], seenHole: [], divergedFrom: {}, lies: {}, seenSigils: [] },
  } as unknown as Player;
  t.players.push(p);
  return p;
}

function river(): { t: Table; hero: Player; rich: Player; poor: Player } {
  const t = createTable('SCRB', 'hero', { ...DEFAULT_CONFIG });
  const hero = seat(t, 'hero', 20000);
  const rich = seat(t, 'Wren', 50000);
  const poor = seat(t, 'Sable', 3000);
  const deck = new Rng('scribed').shuffle([...t.cards.keys()]);
  hero.hole = deck.slice(0, 2);
  rich.hole = deck.slice(2, 4);
  poor.hole = deck.slice(4, 6);
  t.board = deck.slice(6, 11);
  t.deck = deck.slice(11);
  t.phase = 'river';
  return { t, hero, rich, poor };
}

function castWords(t: Table, hero: Player, words: string): void {
  const r = readSpell(words, rosterFor(t, hero));
  assert.ok(r.ok, r.error);
  hero.sigils.push({ uid: 'w', defId: SCRIBED_ID, scribed: r.spell });
  const ctx = { t, rng: new Rng('cast'), fx: [] };
  const cast = castSigil(ctx, hero, 'w', {});
  assert.ok(cast.ok, cast.error);
  assert.equal(hero.mana, 10 - r.spell!.cost, 'the written cost is what is paid');
  resolveStack(ctx);
}

test('a bundle resolves every clause, and "the chip leader" finds the chip leader', () => {
  const { t, hero, rich } = river();
  const river5 = t.board[4];
  castWords(t, hero, "burn the river and see the chip leader's cards");
  assert.ok(!t.board.includes(river5), 'the river should be burned');
  for (const id of rich.hole) assert.ok(hero.foreknowledge.seenHole.includes(id), 'the leader\'s cards should be read');
});

test('"everyone" hits every opponent, once each', () => {
  const { t, hero, rich, poor } = river();
  castWords(t, hero, 'hex everyone');
  assert.equal(rich.hexed, 1);
  assert.equal(poor.hexed, 1);
  assert.equal(hero.hexed, 0);
});

test('a described target that has folded finds nothing, and says so', () => {
  const { t, hero, rich } = river();
  rich.folded = true;
  castWords(t, hero, 'hex wren');
  assert.equal(rich.hexed, 0);
  assert.ok(t.log.some((l) => /finds nothing/.test(l.text)));
});

test('words cannot reach a warded hand', () => {
  const { t, hero, rich } = river();
  rich.warded = true;
  castWords(t, hero, "fracture wren's best card");
  for (const id of rich.hole) assert.equal(t.cards.get(id)!.faces.length, 1, 'a warded card was changed');
  assert.ok(t.log.some((l) => /cannot land/.test(l.text)));
});

test('the Market charges the server\'s own reading, and refuses what it cannot read', () => {
  const { t, hero } = river();
  t.phase = 'shop';
  t.shop.set(hero.id, { items: [{ kind: 'scribe', uid: 'pg', price: 5 }], sold: [], rerollCost: 3, closesAt: 0 });
  const before = hero.shards;

  const bad = scribe(t, hero, 'pg', 'i win the pot');
  assert.equal(bad.ok, false);
  assert.equal(hero.shards, before, 'a refused page costs nothing');

  const good = scribe(t, hero, 'pg', 'burn the river and draw two sigils');
  assert.ok(good.ok, good.error);
  const price = readSpell('burn the river and draw two sigils', rosterFor(t, hero)).spell!.price;
  assert.equal(hero.shards, before - price);
  assert.equal(hero.sigils.at(-1)?.defId, SCRIBED_ID);

  assert.equal(scribe(t, hero, 'pg', 'burn the river').ok, false, 'one page, one sigil');
});

test('a full hand can make room, and gives nothing up if the page is refused', () => {
  const { t, hero } = river();
  t.phase = 'shop';
  t.shop.set(hero.id, { items: [{ kind: 'scribe', uid: 'pg', price: 5 }], sold: [], rerollCost: 3, closesAt: 0 });
  hero.sigils = ['nullify', 'burn', 'foresight', 'hex'].map((defId, i) => ({ uid: `s${i}`, defId }));

  assert.match(scribe(t, hero, 'pg', 'burn the river').error ?? '', /hand is full/);
  assert.equal(scribe(t, hero, 'pg', 'dance a jig', 's1').ok, false);
  assert.equal(hero.sigils.length, 4, 'a refused page must not cost a sigil');

  assert.ok(scribe(t, hero, 'pg', 'burn the river', 's1').ok);
  assert.deepEqual(hero.sigils.map((s) => s.defId), ['nullify', 'foresight', 'hex', SCRIBED_ID]);
});

test('bought max mana survives the next hand, and a relic keeps an omen\'s bonus', async () => {
  const { Engine } = await import('../server/game/engine');
  const { buy } = await import('../server/game/shop');
  const e = new Engine('MANA', 'host', { ...DEFAULT_CONFIG }, () => {}, () => {});
  const hero = e.addPlayer('host', 'Hero')!;
  e.addBot();
  e.start();
  e.dispose();
  const t = e.table;
  t.omens.push({ id: 'feast', ante: 2 });
  hero.shards = 50;
  const base = hero.maxMana;

  t.shop.set(hero.id, {
    items: [
      { kind: 'mana', uid: 'm', price: 6, amount: 1 },
      { kind: 'relic', uid: 'r', id: 'leyline', price: 6 },
    ],
    sold: [], rerollCost: 3, closesAt: 0,
  });
  assert.ok(buy(t, hero, 'm', new Rng('b')).ok);
  const bought = hero.maxMana;
  assert.ok(bought > base, 'the purchase should raise the ceiling');

  hero.mana = hero.maxMana;
  assert.ok(buy(t, hero, 'r', new Rng('b')).ok);
  assert.ok(hero.maxMana >= bought, 'buying a relic dropped the ceiling');
  assert.ok(hero.mana <= hero.maxMana, 'mana over its own cap');

  (e as unknown as { beginHand(): void }).beginHand();
  assert.ok(hero.maxMana >= bought, 'the next hand took the bought mana back');
});

test('"my <rank>" finds the hole card of that rank, and "my cards" means both', () => {
  const { t, hero } = river();
  const [a, b] = hero.hole.map((id) => t.cards.get(id)!);
  const name = ({ 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
    10: 'ten', 11: 'jack', 12: 'queen', 13: 'king', 14: 'ace' } as Record<number, string>)[b.faces[0].rank];
  castWords(t, hero, `make my ${name} wild`);
  assert.ok(b.marks.includes('wild'), 'the named card should be wild');
  if (a.faces[0].rank !== b.faces[0].rank) assert.ok(!a.marks.includes('wild'), 'the other card was touched');

  const r2 = river();
  r2.hero.mana = 10;
  castWords(r2.t, r2.hero, 'make my cards wild');
  for (const id of r2.hero.hole) assert.ok(r2.t.cards.get(id)!.marks.includes('wild'));
});
