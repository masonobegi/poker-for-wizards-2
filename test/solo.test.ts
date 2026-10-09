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

import { decideShop } from '../server/game/bots';
import { Engine } from '../server/game/engine';
import { SCRIBE_FLOOR } from '../server/game/shop';
import { sigilHandSize } from '../server/game/table';
import { Rng } from '../shared/rng';
import { SIGILS } from '../shared/sigils';
import { DEFAULT_CONFIG } from '../shared/types';

type Internals = {
  endHand(): void;
  openMarket(): void;
  tick(): void;
  deadline: number;
  onDeadline: (() => void) | null;
  botClock: Map<string, number>;
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

/*
 * The Market a solo player actually reaches. A bot's sigil hand is nearly
 * always full by then (see decideScribe), and the earlier test above set every
 * bot's shopDone by hand, which hid this: a bot with a full hand and shards
 * for a sigil kept choosing that sigil, the buy failed with "Your hand is
 * full" every time, and the bot was never done. With the 45s clock gone the
 * player pressed Done and waited up to thirty minutes.
 */
function fullHandsAtMarket(): Engine {
  const e = table(['host'], 3);
  const t = e.table;
  internals(e).openMarket();
  for (const p of t.players.filter((q) => q.isBot)) {
    while (p.sigils.length < sigilHandSize(p)) p.sigils.push({ uid: `fill${p.sigils.length}`, defId: SIGILS[0].id });
    const shop = t.shop.get(p.id)!;
    // Only sigils within reach, and too few shards for the blank page.
    shop.items = shop.items.filter((i) => i.kind === 'sigil' || i.kind === 'scribe');
    for (const i of shop.items) if (i.kind === 'sigil') i.price = SCRIBE_FLOOR - 1;
    p.shards = SCRIBE_FLOOR - 1;
  }
  return e;
}

/** Let every bot take its next Market turn, as many times as `turns`. */
function botTurns(e: Engine, turns: number): void {
  for (let i = 0; i < turns && e.table.phase === 'shop'; i++) {
    for (const k of internals(e).botClock.keys()) internals(e).botClock.set(k, 0);
    internals(e).tick();
  }
}

test('bots on full hands finish a solo Market on their own once the player is Done', () => {
  const e = fullHandsAtMarket();
  const t = e.table;
  assert.ok(t.players.filter((p) => p.isBot).every((p) => !p.shopDone));
  e.shopDone('host');
  botTurns(e, 60);
  assert.notEqual(t.phase, 'shop', 'a bot with a full hand kept trying to buy a sigil it could not hold');
});

test('a bot never chooses a sigil it has no room for', () => {
  const e = fullHandsAtMarket();
  const t = e.table;
  const rng = new Rng('full-hand');
  for (const p of t.players.filter((q) => q.isBot)) {
    assert.equal(decideShop(t, p, rng), null, `${p.name} chose a sigil with a full hand`);
  }
});

test('a bot whose purchase is refused is done, not stuck retrying it', () => {
  // A rite on a card that has since left the deck: the bot wants it, and the
  // Market refuses it. Twelve tables, so a bot that merely declined the rite
  // on its first look cannot pass this by luck.
  for (let n = 0; n < 12; n++) {
    const e = table(['host'], 1);
    const t = e.table;
    internals(e).openMarket();
    const bot = t.players.find((p) => p.isBot)!;
    const shop = t.shop.get(bot.id)!;
    shop.items = [{ kind: 'rite', uid: `gone${n}`, price: 1, markId: 'wild', cardId: 'no-such-card', label: 'Wild the Ghost' }];
    bot.shards = 1;
    e.shopDone('host');
    botTurns(e, 1);
    assert.ok(bot.shopDone || t.phase !== 'shop', 'a refused buy left the bot shopping');
  }
});

test('once the solo player is Done, the Market closes in seconds, not half an hour', () => {
  const e = fullHandsAtMarket();
  e.shopDone('host');
  assert.equal(e.table.phase, 'shop');
  const ms = internals(e).deadline - Date.now();
  assert.ok(ms <= 5_000, `the Market waits ${Math.round(ms / 1000)}s for the bots after the player is Done`);
});
