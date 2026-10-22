/**
 * Covens as unlock (shared/unlock.ts, decided 2026-10-22).
 *
 * The first run is the game the 2026-10-17 cut made: the Unaligned, 13
 * sigils, 9 omens, 12 relics, nobody asked to choose. After one finished run
 * the coven picker opens and a few cut cards come back. These pin the three
 * things that could go quietly wrong:
 *
 *   1. The first run changes in any way at all. A table opened without the
 *      flag must deal from the same bags, in the same order, as before.
 *   2. The later run does not get what it was promised (a coven honoured, the
 *      larger pools actually dealt and sold, the Daily Rite's coven back).
 *   3. The unlock is lost: on a save that cannot be written, across Steam
 *      Cloud, or to a client that sends nothing.
 */
import { strict as assert } from 'node:assert';
import { before, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

import { Engine } from '../server/game/engine';
import { draftPool, randomSigil } from '../server/game/magic';
import { rollShop } from '../server/game/shop';
import { UNLOCK_AFTER_RUNS, unlockedAfter } from '../shared/unlock';
import { COVENS, COVEN_BY_ID, COVEN_CHOICE, COVENS_UNLOCK, DEFAULT_COVEN, covensOpen } from '../shared/covens';
import { POOL, POOL_IDS, SIGIL_BY_ID, UNLOCKED_SIGIL_IDS, sigilPool } from '../shared/sigils';
import { OMEN_BY_ID, OMEN_POOL, UNLOCKED_OMEN_IDS, omenPool } from '../shared/omens';
import { RELIC_BY_ID, RELIC_POOL, UNLOCKED_RELIC_IDS, relicPool } from '../shared/relics';
import { dailyCoven } from '../shared/hexes';
import { DEMO_COVENS } from '../shared/demo';
import { Rng } from '../shared/rng';
import { DEFAULT_CONFIG, type RoomConfig, type Table } from '../shared/types';

function quiet<T>(fn: () => T): T {
  const warn = console.warn; const err = console.error;
  console.warn = () => {}; console.error = () => {};
  try { return fn(); } finally { console.warn = warn; console.error = err; }
}

/** A started solo table: the player as `coven`, three bots, one hand dealt. */
function table(seed: string, cfg: Partial<RoomConfig> = {}, coven = DEFAULT_COVEN): { e: Engine; t: Table } {
  return quiet(() => {
    const e = new Engine('UNLK', 'host', { ...DEFAULT_CONFIG, seed, ...cfg }, () => {}, () => {});
    const me = e.addPlayer('host', 'Hero')!;
    me.coven = coven;
    for (let i = 0; i < 3; i++) e.addBot();
    assert.ok(e.start().ok);
    e.dispose();
    return { e, t: e.table };
  });
}

type RollOmen = { rollOmen: (asAnte?: number) => void };

// ------------------------------------------------------------------ the switch

test('one finished run opens the later game, and none does not', () => {
  assert.equal(UNLOCK_AFTER_RUNS, 1);
  assert.equal(unlockedAfter(0), false);
  assert.equal(unlockedAfter(1), true);
  assert.equal(unlockedAfter(30), true);
  assert.equal(unlockedAfter(Number.NaN), false);
  assert.equal(covensOpen(false), COVEN_CHOICE, 'a first run has no picker (unless the old picker is back)');
  assert.equal(covensOpen(true), COVEN_CHOICE || COVENS_UNLOCK);
});

// ------------------------------------------------------------------ 1. the first run is unchanged

test('a first-run table draws from the first run\'s pools, the very same lists', () => {
  // Identity, not just equality: `sigilPool(false)` is POOL, so every bag a
  // first-run table builds is the bag it always built.
  assert.equal(sigilPool(false), POOL);
  assert.equal(omenPool(false), OMEN_POOL);
  assert.equal(relicPool(false), RELIC_POOL);
  assert.equal(draftPool({ config: { ...DEFAULT_CONFIG } }), POOL);
  assert.equal(draftPool({ config: { ...DEFAULT_CONFIG, unlocked: false } }), POOL);
  assert.deepEqual(POOL.map((s) => s.id), [...POOL_IDS]);
});

test('a first-run table deals the same sigils, draw for draw, as before the unlock existed', () => {
  // randomSigil's old signature had no pool: the default must be the old bag.
  for (let n = 0; n < 20; n++) {
    const a = new Rng(`same-${n}`);
    const b = new Rng(`same-${n}`);
    for (let i = 0; i < 12; i++) {
      assert.equal(
        randomSigil(a, true).defId,
        randomSigil(b, true, undefined, undefined, draftPool({ config: { ...DEFAULT_CONFIG } })).defId,
      );
    }
  }
});

test('a first-run table: every seat Unaligned, whatever the player asked for, and only first-run content', () => {
  for (let n = 0; n < 6; n++) {
    const { e, t } = table(`first-${n}`, {}, 'ashen');
    // The engine is handed 'ashen' directly here; the socket layer (covenFor,
    // below) is what turns a first-run request into the Unaligned. Bots never
    // get a coven of their own.
    for (const p of t.players.filter((q) => q.isBot)) assert.equal(p.coven, DEFAULT_COVEN);
    for (const p of t.players) {
      for (const s of p.sigils) {
        const opening = COVEN_BY_ID[p.coven]?.sigils.includes(s.defId);
        assert.ok(opening || POOL_IDS.includes(s.defId), `seed ${n}: ${p.name} was dealt ${s.defId} on a first run`);
      }
    }
    for (let k = 0; k < 30; k++) {
      const shop = rollShop(t, t.players[0], new Rng(`first-shop-${n}-${k}`));
      for (const item of shop.items) {
        if (item.kind === 'relic') assert.ok(RELIC_POOL.some((r) => r.id === item.id), `a first-run Market sold ${item.id}`);
        if (item.kind === 'sigil') assert.ok(POOL_IDS.includes(item.id), `a first-run Market sold ${item.id}`);
      }
    }
    const roll = (e as unknown as RollOmen).rollOmen.bind(e);
    for (let ante = 2; ante <= 9; ante++) { t.ante = ante; roll(); }
    for (const o of t.omens) assert.ok(OMEN_POOL.some((d) => d.id === o.id), `a first-run table rolled ${o.id}`);
  }
});

test('the socket layer seats a first-run player as the Unaligned, whatever the page sent', async () => {
  const { covenFor, sanitizeConfig } = await import('../server/net/io');
  const prev = process.env.HEXHOLD_DEMO;
  try {
    for (const demo of [false, true]) {
      if (demo) process.env.HEXHOLD_DEMO = '1'; else delete process.env.HEXHOLD_DEMO;
      for (const asked of ['unaligned', 'ashen', 'loom', 'nonsense', undefined, 42]) {
        if (!COVEN_CHOICE) assert.equal(covenFor(asked), DEFAULT_COVEN, `${demo ? 'demo' : 'full game'} asked ${String(asked)}`);
        assert.equal(covenFor(asked, false), covenFor(asked));
      }
      // Only `true` opens it: no truthy string, no number.
      for (const v of [undefined, false, 'true', 1, {}, null]) {
        assert.equal(sanitizeConfig({ unlocked: v }).unlocked, undefined, `unlocked: ${JSON.stringify(v)}`);
      }
      assert.equal(sanitizeConfig({ unlocked: true }).unlocked, true, demo ? 'the demo unlocks too' : 'full game');
    }
  } finally {
    if (prev === undefined) delete process.env.HEXHOLD_DEMO; else process.env.HEXHOLD_DEMO = prev;
  }
});

// ------------------------------------------------------------------ 2. the later run

test('the later pools are the first run\'s, in order, plus the unlocked lists, at the cut\'s ceilings', () => {
  for (const [what, first, later, extra, ceiling] of [
    ['sigil', POOL.map((d) => d.id), sigilPool(true).map((d) => d.id), UNLOCKED_SIGIL_IDS, 16],
    ['omen', OMEN_POOL.map((d) => d.id), omenPool(true).map((d) => d.id), UNLOCKED_OMEN_IDS, 12],
    ['relic', RELIC_POOL.map((d) => d.id), relicPool(true).map((d) => d.id), UNLOCKED_RELIC_IDS, 16],
  ] as const) {
    assert.deepEqual(later.slice(0, first.length), first, `the later ${what} pool reorders the first run's`);
    assert.deepEqual(later.slice(first.length), [...extra]);
    assert.equal(new Set(later).size, later.length, `a ${what} is in the later pool twice`);
    for (const id of extra) assert.ok(!first.includes(id), `${id} is already in the first run's ${what} pool`);
    assert.ok(later.length <= ceiling, `${later.length} ${what}s is past the cut's ceiling of ${ceiling}`);
  }
});

test('a later-run table deals, sells and rolls every unlocked card', () => {
  const sigils = new Set<string>();
  const relics = new Set<string>();
  const omens = new Set<string>();
  for (let n = 0; n < 12; n++) {
    const { e, t } = table(`later-${n}`, { unlocked: true });
    assert.equal(draftPool(t), sigilPool(true));
    const rng = new Rng(`later-draw-${n}`);
    for (let i = 0; i < 60; i++) sigils.add(randomSigil(rng, true, undefined, undefined, draftPool(t)).defId);
    for (let k = 0; k < 20; k++) {
      for (const item of rollShop(t, t.players[0], new Rng(`later-shop-${n}-${k}`)).items) {
        if (item.kind === 'relic') relics.add(item.id);
        if (item.kind === 'sigil') sigils.add(item.id);
      }
    }
    const roll = (e as unknown as RollOmen).rollOmen.bind(e);
    for (let ante = 2; ante <= 13; ante++) { t.ante = ante; roll(); }
    for (const o of t.omens) omens.add(o.id);
  }
  for (const id of UNLOCKED_SIGIL_IDS) assert.ok(sigils.has(id), `a later run never dealt or sold ${id}`);
  for (const id of UNLOCKED_RELIC_IDS) assert.ok(relics.has(id), `a later run's Market never offered ${id}`);
  for (const id of UNLOCKED_OMEN_IDS) assert.ok(omens.has(id), `a later run never rolled ${id}`);
});

test('a later run honours the coven the player picked, and the bots stay Unaligned', () => {
  for (const c of COVENS) {
    const { t } = table(`coven-${c.id}`, { unlocked: true }, c.id);
    const me = t.players.find((p) => !p.isBot)!;
    assert.equal(me.coven, c.id);
    if (c.relic) assert.ok(me.relics.includes(c.relic), `${c.name} opened without ${c.relic}`);
    assert.ok(me.relics.includes(c.creed), `${c.name} opened without its creed`);
    const held = me.sigils.map((s) => s.defId);
    for (const id of c.sigils) {
      // The Unaligned's Nullify may already be spent by the first hand's draw
      // logic; every other opening card is dealt before anything else.
      if (SIGIL_BY_ID[id]) assert.ok(held.includes(id), `${c.name} opened without ${id}: ${held.join(', ')}`);
    }
    for (const bot of t.players.filter((p) => p.isBot)) {
      assert.equal(bot.coven, COVEN_CHOICE ? bot.coven : DEFAULT_COVEN, 'a bot sat down with a coven of its own');
    }
  }
});

test('the socket layer honours a later run\'s coven, and the demo opens the Unaligned and its three', async () => {
  const { covenFor } = await import('../server/net/io');
  const prev = process.env.HEXHOLD_DEMO;
  try {
    delete process.env.HEXHOLD_DEMO;
    for (const c of COVENS) assert.equal(covenFor(c.id, true), c.id);
    assert.equal(covenFor('nonsense', true), DEFAULT_COVEN);
    process.env.HEXHOLD_DEMO = '1';
    if (!COVEN_CHOICE) {
      assert.equal(covenFor('unaligned', true), 'unaligned');
      for (const id of DEMO_COVENS) assert.equal(covenFor(id, true), id);
      for (const c of COVENS.filter((x) => x.id !== 'unaligned' && !DEMO_COVENS.includes(x.id))) {
        assert.equal(covenFor(c.id, true), 'unaligned', `the demo opened ${c.id}`);
      }
    }
  } finally {
    if (prev === undefined) delete process.env.HEXHOLD_DEMO; else process.env.HEXHOLD_DEMO = prev;
  }
});

test('"Deal again" after the run that unlocked it makes the next run a later run, and nothing else', () => {
  const { e, t } = table('deal-again');
  assert.ok(!t.config.unlocked);
  // Mid-run it does nothing: a run's content is fixed when it is dealt.
  e.openLaterRuns();
  assert.ok(!t.config.unlocked, 'a run in progress was switched to the later pools');
  t.phase = 'gameover';
  const { hex, seed } = t.config;
  e.openLaterRuns();
  assert.equal(t.config.unlocked, true);
  assert.equal(t.config.hex, hex);
  assert.equal(t.config.seed, seed);
  e.dispose();
});

test('the Daily Rite: Unaligned on a first run, the day\'s coven for everyone past it', () => {
  const days = ['2026-10-22', '2026-10-23', '2026-11-01', '2027-02-22'];
  for (const d of days) {
    assert.equal(dailyCoven(d, false), COVEN_CHOICE ? dailyCoven(d, true) : DEFAULT_COVEN);
    const later = dailyCoven(d, true);
    assert.equal(later, dailyCoven(d, true), 'the same day must be the same run');
    if (COVENS_UNLOCK || COVEN_CHOICE) assert.notEqual(later, DEFAULT_COVEN, `${d}: the day has no shape`);
  }
  // And the engine plays it: a daily seed at a later table seats the day's coven.
  const { t } = table('ignored', { seed: 'daily:2026-10-22', unlocked: true }, 'loom');
  assert.equal(t.players.find((p) => !p.isBot)!.coven, dailyCoven('2026-10-22', true));
});

test('every achievement has a way to happen in a later run', () => {
  // "Nobody Saw It Coming" needs a sealed card (src/lib/achievements.ts reads
  // a "sealed" note). From cc8f6ea nothing dealt one: only a blank page could.
  const sealing = omenPool(true).some((o) => o.deal?.sealRank)
    || sigilPool(true).some((s) => s.id === 'sealed_rank')
    || relicPool(true).some((r) => r.deal?.sealRank);
  assert.ok(sealing, 'nothing a later run deals can seal a card');
  // The rest are reachable on a first run already; the later pools only add.
  assert.ok(omenPool(true).some((o) => o.mods?.lowWins), 'The Inversion (Upside Down)');
  assert.ok(sigilPool(true).some((s) => s.id === 'divergence'), 'Divergence (Your Own Private Truth)');
  assert.ok(sigilPool(true).some((s) => s.id === 'superpose'), 'Superpose (Collapsed In Your Favour)');
  assert.ok(sigilPool(true).some((s) => s.target === 'stack'), 'a counterspell (Nullified, The Last Word)');
});

test('the restored cards still resolve by id, and the unlocked relics are sold, not creeds', () => {
  for (const id of UNLOCKED_SIGIL_IDS) assert.ok(SIGIL_BY_ID[id], id);
  for (const id of UNLOCKED_OMEN_IDS) assert.ok(OMEN_BY_ID[id], id);
  for (const id of UNLOCKED_RELIC_IDS) {
    assert.ok(RELIC_BY_ID[id], id);
    assert.ok(!RELIC_BY_ID[id].coven, `${id} is a creed`);
    assert.ok(RELIC_BY_ID[id].price > 0, `${id} is free`);
  }
});

// ------------------------------------------------------------------ 3. persistence

let dom: JSDOM;
function define(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, { value, writable: true, configurable: true, enumerable: true });
}

before(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/' });
  define('window', dom.window);
  define('localStorage', dom.window.localStorage);
  define('Event', dom.window.Event);
});
beforeEach(() => { dom.window.localStorage.clear(); });

const run = (over: Record<string, unknown> = {}) => ({
  at: 1, placement: 2, players: 4, handsWon: 1, antesSurvived: 2, bestHand: 'Pair', bestCat: 1,
  impossible: 0, omens: [], relics: [], coven: 'unaligned', won: false, hex: 1, ...over,
});

test('a finished run, won or lost, is what unlocks the next one, and it is in the synced save', async () => {
  const profile = await import('../src/components/profile/profile');
  profile.clearProfile();
  assert.equal(profile.runsFinished(), 0);
  assert.equal(profile.isUnlocked(), false, 'a new player starts on the first run');
  profile.recordRun(run({ won: false }));
  assert.equal(profile.isUnlocked(), true, 'a lost run did not unlock the next');
  // In the profile key, which src/lib/cloud.ts carries to Steam Cloud.
  const saved = JSON.parse(dom.window.localStorage.getItem('hexhold.profile')!);
  assert.equal(saved.totals.runs, 1);
  profile.clearProfile();
  assert.equal(profile.isUnlocked(), false, 'clearing the record locks it again');
});

test('a profile from before the unlock existed is read as the runs it holds', async () => {
  const profile = await import('../src/components/profile/profile');
  profile.clearProfile();
  // Round 6's shape: no field this change added. Mason and the playtesters
  // already have runs, so they open on the picker, with no reveal to sit through.
  dom.window.localStorage.setItem('hexhold.profile', JSON.stringify({
    runs: [run()], totals: { runs: 4, wins: 1, handsWon: 9, impossible: 0, bestCat: 1, bestHand: 'Pair', deepestAnte: 3, omensSeen: [], relicsOwned: [] },
    covens: { unaligned: { runs: 4, wins: 1, deepestAnte: 3, impossible: 0 } }, daily: {},
  }));
  assert.equal(profile.runsFinished(), 4);
  assert.equal(profile.isUnlocked(), true);
  // And a save nothing can read is a first run, not a crash.
  dom.window.localStorage.setItem('hexhold.profile', '{not json');
  assert.equal(profile.runsFinished(), 0);
});

test('a save that cannot be written still opens the next run of this session', async () => {
  const profile = await import('../src/components/profile/profile');
  profile.clearProfile();
  const store = dom.window.localStorage;
  // A private window, or a full quota: every write throws.
  define('localStorage', {
    getItem: (k: string) => store.getItem(k),
    setItem: () => { throw new Error('QuotaExceededError'); },
    removeItem: (k: string) => store.removeItem(k),
  });
  try {
    profile.recordRun(run());
    assert.equal(store.getItem('hexhold.profile'), null, 'the write was meant to fail');
    assert.equal(profile.isUnlocked(), true, 'the reveal promised a coven the next run never offered');
  } finally {
    define('localStorage', store);
    profile.clearProfile();
  }
});

test('Steam Cloud never takes the later game away, and brings it to a second machine', async () => {
  const { cloudWins } = await import('../src/lib/cloud');
  // A second machine that played half a run and earned two achievements has
  // more weight than this one's single finished run; it must not win.
  assert.equal(cloudWins({ rev: 9, weight: 15, runs: 0 }, { rev: 3, weight: 12, runs: 1 }), false);
  // The other way round: the cloud has the finished run, this machine has not.
  assert.equal(cloudWins({ rev: 1, weight: 11, runs: 1 }, { rev: 5, weight: 15, runs: 0 }), true);
  // Both past it, or neither: the old rule, unchanged.
  assert.equal(cloudWins({ rev: 4, weight: 50, runs: 5 }, { rev: 3, weight: 40, runs: 4 }), true);
  assert.equal(cloudWins({ rev: 2, weight: 50, runs: 5 }, { rev: 3, weight: 50, runs: 5 }), false);
  assert.equal(cloudWins({ rev: 4, weight: 50, runs: 5 }, { rev: 3, weight: 60, runs: 6 }), false);
  assert.equal(cloudWins({ rev: 4, weight: 5, runs: 0 }, { rev: 3, weight: 5, runs: 0 }), true);
});
