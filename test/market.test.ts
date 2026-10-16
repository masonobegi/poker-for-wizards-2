/**
 * The solo Market, played the way a player reaches it.
 *
 * Playtest fix P3 took the 45s clock off solo Markets. The second review found
 * that this let a Market hang for up to 30 minutes after the player pressed
 * Done: a bot with a full sigil hand kept choosing a sigil it could not hold,
 * the refused purchase was ignored, and the bot was never done. 5782781
 * repaired it, and test/solo.test.ts pins each part of the repair with a
 * built-up fixture.
 *
 * This file pins the outcome instead, with nothing staged: whole seeded solo
 * games under a simulated clock, the real 120ms engine tick, bots thinking,
 * casting, writing and buying on their own schedules, the player checking or
 * folding, until the first Market. The player presses Done the moment it
 * opens, and the Market must close within seconds of simulated time.
 *
 * On the code before 5782781 this fails (three of the eight Markets close only
 * at the 30-minute cap); on the repair it passes.
 */
import { strict as assert } from 'node:assert';
import { mock, test } from 'node:test';

import { Engine } from '../server/game/engine';
import { DEFAULT_CONFIG } from '../shared/types';
import { RELIC_OFFERS, buy, reroll, rollShop } from '../server/game/shop';
import { decideShop } from '../server/game/bots';
import { Rng } from '../shared/rng';

const STEP_MS = 120;
/** Generous for "seconds": the repair closes within BOTS_AFTER_DONE_MS (4s). */
const DONE_TO_CLOSED_MAX_MS = 6_000;
/** Long enough to reach the first Market (3 hands) at the default pace. */
const TO_MARKET_MAX_MS = 15 * 60_000;
/**
 * Measured 2026-10-09 over seeds 0-15: on the code before 5782781, seeds 1, 2,
 * 7, 13 and 14 held the Market open the full 30 minutes after Done (the rest
 * closed in 3.8 to 5.8s); on the repair all 16 closed in 0.8 to 1.4s. The
 * first eight keep three of those hangs and the run near 25 seconds.
 */
const SEEDS = 8;

type Outcome =
  | { kind: 'closed'; afterDoneMs: number }
  | { kind: 'open'; afterDoneMs: number }
  | { kind: 'no-market'; phase: string };

function playToFirstMarket(seed: string): Outcome {
  const e = new Engine('MKT1', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  try {
    e.addPlayer('host', 'host');
    for (let i = 0; i < 3; i++) e.addBot();
    assert.ok(e.start().ok);
    const t = e.table;

    // Play hands until the Market opens. The player checks when it is free and
    // folds otherwise, so a stack of 100 big blinds cannot bust in 3 hands.
    let waited = 0;
    while (t.phase !== 'shop' && t.phase !== 'gameover' && waited < TO_MARKET_MAX_MS) {
      if (t.actingId === 'host' && !e.act('host', { kind: 'check' }).ok) e.act('host', { kind: 'fold' });
      mock.timers.tick(STEP_MS);
      waited += STEP_MS;
    }
    if (t.phase !== 'shop') return { kind: 'no-market', phase: t.phase };

    // Done at once: the common case for a player who has nothing to buy.
    e.shopDone('host');
    let after = 0;
    while (t.phase === 'shop' && after < 35 * 60_000) {
      mock.timers.tick(STEP_MS);
      after += STEP_MS;
    }
    return t.phase === 'shop' ? { kind: 'open', afterDoneMs: after } : { kind: 'closed', afterDoneMs: after };
  } finally {
    e.dispose();
  }
}

test('a solo Market closes within seconds of Done, in natural games', () => {
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.UTC(2026, 9, 9, 12) });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const results: Array<[string, Outcome]> = [];
    for (let n = 0; n < SEEDS; n++) {
      const seed = `market-probe-${n}`;
      results.push([seed, playToFirstMarket(seed)]);
    }
    const reached = results.filter(([, o]) => o.kind !== 'no-market');
    if (process.env.MARKET_PROBE_LOG) for (const [seed, o] of results) console.log(seed, JSON.stringify(o));
    // Most seeds reach the Market; a bust before it (the run ends) is fine,
    // but a probe that never reaches a Market proves nothing.
    assert.ok(reached.length >= SEEDS - 2, `only ${reached.length} of ${SEEDS} seeded games reached a Market`);
    const slow = reached.filter(([, o]) => o.kind === 'open' || ('afterDoneMs' in o && o.afterDoneMs > DONE_TO_CLOSED_MAX_MS));
    assert.deepEqual(
      slow.map(([seed, o]) => `${seed}: ${o.kind} ${'afterDoneMs' in o ? Math.round(o.afterDoneMs / 1000) : '?'}s after Done`),
      [],
      'the player pressed Done and the Market stayed open',
    );
  } finally {
    console.warn = warn;
    mock.timers.reset();
  }
});

// ---------------------------------------------------------------------------
// The relic shelf (fun round 5): two relics, and buying one takes the other.
// ---------------------------------------------------------------------------


function shelfTable(seed: string) {
  const e = new Engine('SHLF', 'host', { ...DEFAULT_CONFIG, seed }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < 3; i++) e.addBot();
  e.start();
  e.dispose();
  const t = e.table;
  const hero = t.players.find((p) => !p.isBot)!;
  return { t, hero };
}

test('the Market shelves RELIC_OFFERS different relics, none owned, and still five wares', () => {
  assert.ok(RELIC_OFFERS >= 1);
  for (let n = 0; n < 40; n++) {
    const { t, hero } = shelfTable(`shelf-${n}`);
    const shop = rollShop(t, hero, new Rng(`shelf-${n}`));
    const relics = shop.items.filter((i) => i.kind === 'relic');
    assert.equal(relics.length, RELIC_OFFERS, `seed ${n}`);
    const ids = relics.map((i) => (i.kind === 'relic' ? i.id : ''));
    assert.equal(new Set(ids).size, ids.length, `seed ${n}: the same relic twice`);
    for (const id of ids) assert.ok(!hero.relics.includes(id), `seed ${n}: offered a relic already owned`);
    assert.equal(shop.items.filter((i) => i.kind !== 'scribe').length, 5, `seed ${n}: the grid is five wide`);
  }
});

test('buying one relic takes the other off the shelf, and charges for one', () => {
  if (RELIC_OFFERS < 2) return;
  const { t, hero } = shelfTable('shelf-buy');
  const shop = rollShop(t, hero, new Rng('shelf-buy'));
  t.shop.set(hero.id, shop);
  hero.shards = 999;
  const [a, b] = shop.items.filter((i) => i.kind === 'relic');
  assert.ok(a && b && a.kind === 'relic' && b.kind === 'relic');
  const before = hero.relics.length;
  assert.ok(buy(t, hero, a.uid, new Rng('x')).ok);
  assert.deepEqual(shop.gone, [b.uid]);
  assert.equal(hero.shards, 999 - a.price);
  const second = buy(t, hero, b.uid, new Rng('x'));
  assert.equal(second.ok, false);
  assert.match(second.error ?? '', /other relic/);
  assert.equal(hero.relics.length, before + 1);
  assert.ok(hero.relics.includes(a.id) && !hero.relics.includes(b.id));
  // Everything else on the shelf is still for sale.
  const sigil = shop.items.find((i) => i.kind === 'sigil');
  if (sigil) assert.ok(!shop.gone?.includes(sigil.uid));
});

test('a bot never reaches for the relic it left, and writes once the relic is bought', () => {
  if (RELIC_OFFERS < 2) return;
  for (let n = 0; n < 20; n++) {
    const { t } = shelfTable(`shelf-bot-${n}`);
    const bot = t.players.find((p) => p.isBot)!;
    const shop = rollShop(t, bot, new Rng(`shelf-bot-${n}`));
    t.shop.set(bot.id, shop);
    bot.shards = 999;
    const first = decideShop(t, bot, new Rng('b'));
    const firstItem = shop.items.find((i) => i.uid === first);
    assert.equal(firstItem?.kind, 'relic', `seed ${n}: a rich bot takes a relic first`);
    assert.ok(buy(t, bot, first!, new Rng('b')).ok);
    for (let k = 0; k < 6; k++) {
      const next = decideShop(t, bot, new Rng(`b${k}`));
      if (!next) break;
      assert.ok(!shop.gone?.includes(next), `seed ${n}: chose a withdrawn relic`);
      if (!buy(t, bot, next, new Rng('b')).ok) break;
    }
  }
});

test('a reroll puts a fresh choice on the shelf', () => {
  if (RELIC_OFFERS < 2) return;
  const { t, hero } = shelfTable('shelf-reroll');
  const shop = rollShop(t, hero, new Rng('shelf-reroll'));
  t.shop.set(hero.id, shop);
  hero.shards = 999;
  const a = shop.items.find((i) => i.kind === 'relic')!;
  assert.ok(buy(t, hero, a.uid, new Rng('r')).ok);
  assert.ok(reroll(t, hero, new Rng('r')).ok);
  const next = t.shop.get(hero.id)!;
  assert.equal(next.gone, undefined);
  assert.equal(next.items.filter((i) => i.kind === 'relic').length, RELIC_OFFERS);
});
