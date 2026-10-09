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
    const slow = reached.filter(([, o]) => o.kind === 'open' || o.afterDoneMs > DONE_TO_CLOSED_MAX_MS);
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
