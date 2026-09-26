/**
 * Each hex does what its line on the menu says, and a daily seed is the same
 * table for everyone.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { anteLength } from '../server/game/table';
import { rollShop } from '../server/game/shop';
import { COVEN_BY_ID } from '../shared/covens';
import { DEFAULT_CONFIG, type RoomConfig } from '../shared/types';
import { Rng } from '../shared/rng';
import { dailyCoven, dailySeed, hexPrice, isDailySeed } from '../shared/hexes';

function table(config: Partial<RoomConfig>, bots = 3): Engine {
  const e = new Engine('HEXT', 'host', { ...DEFAULT_CONFIG, ...config }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < bots; i++) e.addBot();
  e.start();
  e.dispose();
  return e;
}

const covenRelics = (coven: string): number => (COVEN_BY_ID[coven]?.relic ? 1 : 0);

test('Hex I changes nothing', () => {
  const t = table({ hex: 1 }).table;
  assert.equal(t.omens.length, 0);
  for (const p of t.players) assert.equal(p.relics.length, covenRelics(p.coven));
  assert.equal(anteLength(t), t.config.handsPerAnte);
});

test('Hex II gives every bot a relic and the player none', () => {
  const t = table({ hex: 2 }).table;
  for (const p of t.players) {
    assert.equal(p.relics.length, covenRelics(p.coven) + (p.isBot ? 1 : 0), p.name);
  }
});

test('Hex III opens the table under an omen', () => {
  assert.equal(table({ hex: 3 }).table.omens.length, 1);
});

test('Hex IV raises the prices a human pays, not a bot', () => {
  assert.equal(hexPrice(8, 4, false), 10);
  assert.equal(hexPrice(8, 4, true), 8);
  assert.equal(hexPrice(8, 3, false), 8);
  const t = table({ hex: 4 }).table;
  const hero = t.players.find((p) => !p.isBot)!;
  const plain = rollShop({ ...t, config: { ...t.config, hex: 1 } }, hero, new Rng('s'));
  const hexed = rollShop(t, hero, new Rng('s'));
  assert.deepEqual(hexed.items.map((i) => i.price), plain.items.map((i) => hexPrice(i.price, 4, false)));
});

test('Hex V shortens the ante, never below two hands', () => {
  assert.equal(anteLength(table({ hex: 5, handsPerAnte: 3 }).table), 2);
  assert.equal(anteLength(table({ hex: 5, handsPerAnte: 2 }).table), 2);
});

test('a daily seed deals the same table twice', () => {
  const seed = dailySeed('2026-09-25');
  const a = table({ seed, hex: 2 }).table;
  const b = table({ seed, hex: 2 }).table;
  assert.deepEqual(a.players.map((p) => [p.name, p.coven, p.relics]), b.players.map((p) => [p.name, p.coven, p.relics]));
  // Card ids are minted per table, so compare what the cards are.
  const faces = (t: typeof a, ids: string[]) => ids.map((id) => JSON.stringify(t.cards.get(id)?.faces));
  assert.deepEqual(a.players.map((p) => faces(a, p.hole)), b.players.map((p) => faces(b, p.hole)));
  assert.deepEqual(faces(a, a.deck), faces(b, b.deck));
  const hero = a.players.find((p) => !p.isBot)!;
  assert.equal(hero.coven, dailyCoven('2026-09-25'), 'the daily is played as the day coven');
});

test('a daily table seats one human', () => {
  const e = new Engine('HEXD', 'host', { ...DEFAULT_CONFIG, seed: dailySeed('2026-09-25') }, () => {}, () => {});
  assert.ok(e.addPlayer('host', 'Hero'));
  assert.equal(e.addPlayer('guest', 'Guest'), null);
  assert.ok(e.addBot());
  e.dispose();
});

test('only a daily seed is accepted as one, and each day has a coven', () => {
  assert.ok(isDailySeed('daily:2026-09-25'));
  assert.ok(!isDailySeed('anything-else'));
  assert.ok(!isDailySeed('daily:2026-09-25; x'));
  assert.notEqual(dailyCoven('2026-09-25'), 'unaligned');
  assert.equal(dailyCoven('2026-09-25'), dailyCoven('2026-09-25'));
});
