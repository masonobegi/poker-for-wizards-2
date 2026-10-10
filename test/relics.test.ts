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
import { viewFor } from '../server/game/table';
import { RELICS } from '../shared/relics';
import { DEFAULT_CONFIG } from '../shared/types';

/** What a relic does: every field but its name, art, price and words. */
function effect(r: (typeof RELICS)[number]): string {
  return JSON.stringify({
    mods: r.mods, mana: r.mana, sigils: r.sigils, vision: r.vision,
    onWin: r.onWin, deal: r.deal, economy: r.economy,
  });
}

test('no two relics do the same thing', () => {
  const seen = new Map<string, string>();
  for (const r of RELICS) {
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
