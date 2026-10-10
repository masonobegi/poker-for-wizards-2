/**
 * The phylactery: one buy-back before ante 3, at a solo Hex I table.
 *
 * Measured from the player's chair (FUN-REVIEW.md, 2026-10-10), an aggressive
 * player's solo run was over before the first Market in 12% of runs, about
 * ninety seconds in. A poker tournament's rebuy period, Slay the Spire's
 * Lizard Tail and Balatro's Mr. Bones all answer that the same way: the first
 * early loss teaches, it does not end the run. These tests hold the rule to
 * exactly that size: once, early, solo, Hex I.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { viewFor } from '../server/game/table';
import { HEXES, PHYLACTERY_BEFORE_ANTE, PHYLACTERY_STACK, hasPhylactery } from '../shared/hexes';
import { DEFAULT_CONFIG, type RoomConfig } from '../shared/types';
import type { FxEvent } from '../shared/protocol';

type Internals = { endHand(): void };
const internals = (e: Engine) => e as unknown as Internals;

function table(humans: string[], bots: number, config: Partial<RoomConfig> = {}, fx: FxEvent[] = []): Engine {
  const e = new Engine('PHYL', humans[0], { ...DEFAULT_CONFIG, ...config }, (f) => { fx.push(...f); }, () => {});
  for (const h of humans) e.addPlayer(h, h);
  for (let i = 0; i < bots; i++) e.addBot();
  e.start();
  e.dispose();
  return e;
}

/** The hero loses every chip to the first bot, and the hand ends. */
function bust(e: Engine, id = 'host'): void {
  const t = e.table;
  const hero = t.players.find((p) => p.id === id)!;
  const taker = t.players.find((p) => p.isBot)!;
  taker.chips += hero.chips + hero.bet;
  hero.chips = 0;
  hero.bet = 0;
  internals(e).endHand();
}

test('the rule is what the constants say: Hex I only, a full rebuy, before ante 3', () => {
  assert.equal(PHYLACTERY_BEFORE_ANTE, 3);
  assert.equal(PHYLACTERY_STACK, 1);
  assert.ok(hasPhylactery(1));
  for (const hex of [2, 3, 4, 5]) assert.ok(!hasPhylactery(hex), `Hex ${hex} kept the phylactery`);
  // The menu says so: Hex II is where it goes.
  assert.match(HEXES[0].text, /phylactery/);
  assert.match(HEXES[1].text, /phylactery is gone/);
});

test('a solo bust at ante 1 buys the player back in once, with a starting stack', () => {
  const fx: FxEvent[] = [];
  const e = table(['host'], 3, {}, fx);
  const t = e.table;
  const hero = t.players.find((p) => p.id === 'host')!;
  assert.equal(hero.phylactery, true);
  assert.ok(t.players.filter((p) => p.isBot).every((p) => !p.phylactery), 'a bot was given a phylactery');

  bust(e);
  assert.notEqual(t.phase, 'gameover', 'the run ended on the bust the phylactery should catch');
  assert.ok(!hero.eliminated);
  assert.equal(hero.chips, DEFAULT_CONFIG.startingChips * PHYLACTERY_STACK);
  assert.equal(hero.phylactery, false, 'the phylactery was not spent');
  assert.ok(hero.revived, 'the caught bust was not recorded for the end screen');
  assert.ok(fx.some((f) => f.t === 'banner' && /PHYLACTERY/.test(f.text)), 'the player was not told');
  assert.ok(!fx.some((f) => f.t === 'eliminate'), 'an elimination played for a bust that was caught');
  // Public on the table, so the header can say it is spent.
  assert.equal(viewFor(t, 'host').players.find((p) => p.isYou)!.phylactery, false);

  // The second bust is the real one.
  bust(e);
  assert.equal(t.phase, 'gameover');
  assert.ok(hero.eliminated);
});

test('a bust at ante 3 is the end of the run, phylactery or not', () => {
  const e = table(['host'], 3);
  const t = e.table;
  t.ante = PHYLACTERY_BEFORE_ANTE;
  bust(e);
  assert.equal(t.phase, 'gameover');
  assert.equal(t.players.find((p) => p.id === 'host')!.phylactery, true, 'it was spent where it does not apply');
});

test('Hex II and the Daily Rite never have one', () => {
  const e = table(['host'], 3, { hex: 2 });
  assert.equal(e.table.players.find((p) => p.id === 'host')!.phylactery, false);
  bust(e);
  assert.equal(e.table.phase, 'gameover');

  const d = table(['host'], 3, { seed: 'daily:2026-10-10', hex: 2 });
  assert.equal(d.table.players.find((p) => p.id === 'host')!.phylactery, false);
});

test('at a table with two humans a bust is not caught: the run does not end there anyway', () => {
  const e = table(['host', 'guest'], 2);
  const t = e.table;
  const hero = t.players.find((p) => p.id === 'host')!;
  assert.ok(!hero.phylactery, 'a shared table showed a phylactery it will never spend');
  bust(e);
  assert.ok(hero.eliminated);
  assert.notEqual(t.phase, 'gameover');
});

test('a new run gets a fresh phylactery', () => {
  const e = table(['host'], 3);
  bust(e);
  const hero = e.table.players.find((p) => p.id === 'host')!;
  assert.equal(hero.phylactery, false);
  e.table.phase = 'gameover';
  e.start();
  e.dispose();
  assert.equal(hero.phylactery, true);
  assert.equal(hero.revived, undefined);
});

/*
 * Found while measuring the phylactery: "Deal again" restarts the same table,
 * and Engine.start only stripped marks. Graft and Mirror rewrite a card's face
 * for the rest of a run and Unprint deletes one, so the next run was dealt
 * from the last run's broken deck: two Kings of Spades and no Seven of
 * Diamonds, for good.
 */
test('Deal again starts the next run on a clean 52-card deck', () => {
  const e = table(['host'], 3);
  const t = e.table;
  const [a, b] = [...t.cards.values()];
  b.faces = a.faces.map((f) => ({ ...f }));
  b.marks.push('mirrored');
  const gone = [...t.cards.keys()][10];
  t.cards.delete(gone);
  t.phase = 'gameover';
  assert.ok(e.start().ok);
  e.dispose();
  assert.equal(t.cards.size, 52);
  const faces = new Set([...t.cards.values()].map((c) => `${c.faces[0].rank}${c.faces[0].suit}`));
  assert.equal(faces.size, 52, 'a duplicate face survived into the new run');
  // The first hand is already dealt, and a bot of the Unmoored holds a card in
  // superposition: its printed face is still faces[0].
  assert.ok([...t.cards.values()].every((c) => c.marks.length === 0), 'a mark survived into the new run');
});
