/**
 * The menu pauses a solo table and nothing else.
 *
 * Practice against bots is the offline game, and a single-player game whose
 * menu does not pause is a review complaint waiting to happen. But a table
 * with two humans must never pause: one player cannot stop another's game.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { Engine } from '../server/game/engine';
import { DEFAULT_CONFIG } from '../shared/types';

type Internals = { tick(): void; pausedAt: number; deadline: number };
const internals = (e: Engine) => e as unknown as Internals;

function solo(): Engine {
  const e = new Engine('HEXP', 'host', { ...DEFAULT_CONFIG }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  for (let i = 0; i < 3; i++) e.addBot();
  e.start();
  e.dispose();
  return e;
}

test('a solo table pauses, and a paused table does nothing on its tick', () => {
  const e = solo();
  assert.equal(e.setPaused('host', true), true);
  assert.equal(e.paused, true);
  const before = JSON.stringify({ ...e.table, lastActivity: 0 });
  for (let i = 0; i < 50; i++) internals(e).tick();
  assert.equal(JSON.stringify({ ...e.table, lastActivity: 0 }), before, 'nothing moved while paused');
});

test('resuming pushes every clock back by the length of the pause', () => {
  const e = solo();
  e.setPaused('host', true);
  internals(e).pausedAt = Date.now() - 5_000;
  const deadline = internals(e).deadline;
  const acting = e.table.actingUntil;
  e.setPaused('host', false);
  assert.equal(e.paused, false);
  if (deadline) assert.ok(internals(e).deadline >= deadline + 5_000, 'scheduled work waited out the pause');
  if (acting) assert.ok((e.table.actingUntil ?? 0) >= acting + 5_000, 'the turn timer waited out the pause');
});

test('a table with two humans never pauses, and a bot cannot pause anything', () => {
  const e = new Engine('HEXQ', 'host', { ...DEFAULT_CONFIG }, () => {}, () => {});
  e.addPlayer('host', 'Hero');
  e.addPlayer('guest', 'Guest');
  e.addBot();
  e.start();
  e.dispose();
  assert.equal(e.setPaused('host', true), false);
  assert.equal(e.paused, false);

  const s = solo();
  const bot = s.table.players.find((p) => p.isBot)!;
  assert.equal(s.setPaused(bot.id, true), false);
  assert.equal(s.paused, false);
});

test('an abandoned pause lets go on its own', () => {
  const e = solo();
  e.setPaused('host', true);
  internals(e).pausedAt = Date.now() - 31 * 60_000;
  internals(e).tick();
  assert.equal(e.paused, false);
});
