/**
 * Fun round 5: once the player at a solo table has folded, the rest of the
 * hand belongs to the bots, and it plays at the quick pace (FAST_AFTER_FOLD in
 * server/game/engine.ts).
 *
 * Measured from the player's chair before the change: about 22 seconds a run
 * went on watching bots finish hands the player had already folded, plus the
 * full reading time on every showdown it had no stake in.
 */
import { strict as assert } from 'node:assert';
import { mock, test } from 'node:test';

import { Engine, FAST_AFTER_FOLD } from '../server/game/engine';
import type { CardView } from '../shared/cards';
import { DEFAULT_CONFIG, type PayoutInfo, type ShowdownEntry } from '../shared/types';

type Internals = {
  botClock: Map<string, number>;
  payoutHold(payout: PayoutInfo): number;
};
const internals = (e: Engine) => e as unknown as Internals;

/** The quick band in bots.ts thinkTime: 140ms plus up to 199, at standard speed and pace. */
const QUICK_MAX_MS = 340;
const STEP_MS = 120;

test('after the player folds, every bot acts at the quick pace; before, they deliberate', () => {
  if (!FAST_AFTER_FOLD) return;
  mock.timers.enable({ apis: ['setInterval', 'setTimeout', 'Date'], now: Date.UTC(2026, 9, 16, 12) });
  const warn = console.warn;
  console.warn = () => {};
  const before: number[] = [];
  const after: number[] = [];
  try {
    for (let n = 0; n < 6; n++) {
      const e = new Engine('FOLD', 'host', { ...DEFAULT_CONFIG, seed: `fastfold-${n}` }, () => {}, () => {});
      try {
        e.addPlayer('host', 'Hero');
        for (let i = 0; i < 3; i++) e.addBot();
        assert.ok(e.start().ok);
        const t = e.table;
        const hero = t.players.find((p) => p.id === 'host')!;
        const seen = new Set<string>();
        for (let ms = 0; ms < 4 * 60_000 && t.phase !== 'gameover' && t.phase !== 'shop'; ms += STEP_MS) {
          // The player folds the moment it is their turn (or checks when free,
          // so a hand where checking is free still reaches the bots unfolded).
          if (t.actingId === 'host' && !t.stack && !e.act('host', { kind: 'fold' }).ok) e.act('host', { kind: 'check' });
          const id = t.actingId;
          const at = id ? internals(e).botClock.get(id) : undefined;
          const key = `${id}:${at}`;
          // A clock set on the last tick (anything older was set for some
          // other wait and is not a fresh deliberation).
          if (id && id !== 'host' && at && !seen.has(key) && !t.stack && at > Date.now() - STEP_MS) {
            seen.add(key);
            // Sampled on the tick after the clock was set: up to one tick late.
            (hero.folded ? after : before).push(at - Date.now());
          }
          mock.timers.tick(STEP_MS);
        }
      } finally {
        e.dispose();
      }
    }
  } finally {
    console.warn = warn;
    mock.timers.reset();
  }
  assert.ok(after.length >= 10, `only ${after.length} bot turns after a fold were sampled`);
  assert.ok(before.length >= 10, `only ${before.length} bot turns before a fold were sampled`);
  assert.ok(Math.max(...after) <= QUICK_MAX_MS, `a bot took ${Math.max(...after)}ms after the player had folded`);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (process.env.FASTFOLD_LOG) console.log(`before n=${before.length} mean ${mean(before).toFixed(0)}ms · after n=${after.length} mean ${mean(after).toFixed(0)}ms max ${Math.max(...after)}ms`);
  assert.ok(mean(before) > mean(after) + 150, `before ${mean(before).toFixed(0)}ms, after ${mean(after).toFixed(0)}ms`);
});

function payout(hero: string, others: string[], impossible: boolean): PayoutInfo {
  const card = { id: 'x' } as unknown as CardView;
  const entry = (playerId: string, won: number): ShowdownEntry => ({
    playerId, cards: playerId === hero ? [] : [card, card], handName: impossible ? 'Five of a Kind, Aces' : 'Two Pair, Queens and Jacks',
    cat: 0, score: 0, usedIds: playerId === hero ? [] : ['a', 'b', 'c', 'd', 'e'], impossible: impossible && won > 0, won,
  });
  return {
    pots: [{ amount: 1000, winners: [others[0]] }],
    entries: [entry(hero, 0), entry(others[0], 1000), entry(others[1], 0)],
    shards: {},
  };
}

test('a folded player sits through half the reading, and an impossible hand keeps its ceremony', () => {
  if (!FAST_AFTER_FOLD) return;
  const e = new Engine('HOLD', 'host', { ...DEFAULT_CONFIG }, () => {}, () => {});
  try {
    e.addPlayer('host', 'Hero');
    for (let i = 0; i < 3; i++) e.addBot();
    assert.ok(e.start().ok);
    const t = e.table;
    const hero = t.players.find((p) => p.id === 'host')!;
    const bots = t.players.filter((p) => p.isBot).map((p) => p.id);
    for (const impossible of [false, true]) {
      const pay = payout('host', bots, impossible);
      hero.folded = false;
      const inIt = internals(e).payoutHold(pay);
      hero.folded = true;
      const out = internals(e).payoutHold(pay);
      // Two hands revealed: reading is 1500 + 2 x 450 = 2400ms, half is 1200
      // (less when the floor for the winner's decoding name holds it up).
      const saved = inIt - out;
      assert.ok(saved > 1000 && saved <= 1200, `impossible=${impossible}: in ${inIt}ms, folded ${out}ms`);
      if (impossible) assert.ok(out >= 1800 + 320 + 5 * 300, 'the ceremony and the slow reveal survive a fold');
    }
  } finally {
    e.dispose();
  }
});
