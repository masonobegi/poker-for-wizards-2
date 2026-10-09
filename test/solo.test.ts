/**
 * A solo table waits for its one player, and stops when that player is out.
 *
 * From the 2026-10-09 playtest, both before Steam launch:
 *   - Busting used to leave the player watching three bots finish the table,
 *     with no skip. Every new player busts in their first run, inside Steam's
 *     two-hour refund window. Now the run ends the hand they go out.
 *   - The Market ran a 45s clock even with nobody else to wait for, on the
 *     screen where players read relics and write sigils. A solo Market now has
 *     no clock and closes on Done. Tables with two humans keep the clock.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { DEFAULT_CONFIG } from '../shared/types';

type Internals = {
  endHand(): void;
  openMarket(): void;
  tick(): void;
  deadline: number;
  onDeadline: (() => void) | null;
};
const internals = (e: Engine) => e as unknown as Internals;

function table(humans: string[], bots: number): Engine {
  const e = new Engine('HEXS', humans[0], { ...DEFAULT_CONFIG }, () => {}, () => {});
  for (const h of humans) e.addPlayer(h, h);
  for (let i = 0; i < bots; i++) e.addBot();
  e.start();
  e.dispose();
  return e;
}

test('a solo player who busts ends the run at once, and the chip leader takes the table', () => {
  const e = table(['host'], 3);
  const t = e.table;
  const hero = t.players.find((p) => p.id === 'host')!;
  const bots = t.players.filter((p) => p.isBot);
  // The hero's chips went to the bots; the second bot is the clear leader.
  const spare = hero.chips + hero.bet;
  hero.chips = 0;
  hero.bet = 0;
  bots[1].chips += spare;
  internals(e).endHand();
  assert.equal(t.phase, 'gameover', 'the bots kept playing a table nobody was at');
  assert.equal(t.winnerId, bots[1].id, 'the winner is the bot with the most chips, not the first seat');
  assert.ok(hero.eliminated);
});

test('at a table with two humans, one bust does not end it', () => {
  const e = table(['host', 'guest'], 2);
  const t = e.table;
  const hero = t.players.find((p) => p.id === 'host')!;
  hero.chips = 0;
  hero.bet = 0;
  internals(e).endHand();
  assert.notEqual(t.phase, 'gameover', 'the other human was still playing');
  assert.ok(hero.eliminated);
});

test('when every human at the table is out, it ends', () => {
  const e = table(['host', 'guest'], 2);
  const t = e.table;
  for (const id of ['host', 'guest']) {
    const p = t.players.find((q) => q.id === id)!;
    p.chips = 0;
    p.bet = 0;
  }
  internals(e).endHand();
  assert.equal(t.phase, 'gameover');
  assert.ok(t.players.find((p) => p.id === t.winnerId)?.isBot);
});

test('a solo Market has no clock and closes when the player is done', () => {
  const e = table(['host'], 3);
  const t = e.table;
  internals(e).openMarket();
  assert.equal(t.phase, 'shop');
  assert.equal(t.shop.get('host')?.closesAt, 0, 'a clock was shown at a solo Market');
  // Only the abandoned-window cap is scheduled, nowhere near 45 seconds.
  assert.ok(internals(e).deadline - Date.now() > 20 * 60_000, 'the solo Market still closes on a short clock');
  for (const p of t.players) if (p.isBot) p.shopDone = true;
  e.shopDone('host');
  assert.equal(t.phase, 'deal', 'Done did not close the Market');
});

test('a Market with two humans keeps its clock', () => {
  const e = table(['host', 'guest'], 1);
  const t = e.table;
  internals(e).openMarket();
  const shop = t.shop.get('host')!;
  assert.ok(shop.closesAt > Date.now(), 'the shared Market lost its clock');
  const ms = internals(e).deadline - Date.now();
  assert.ok(ms <= DEFAULT_CONFIG.shopSeconds * 1000 + 50, `deadline ${ms}ms`);
});
