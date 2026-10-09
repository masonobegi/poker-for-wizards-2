/**
 * Do achievements actually fire?
 *
 * `npm run play` reports what unlocked during a real browser session, but it
 * only ever proves the happy path when the bots happen to lose a pot to it —
 * a session where you win nothing is indistinguishable from a watcher that is
 * silently broken. These drive the watcher directly against a synthetic view,
 * so the detection logic is checked every run rather than when the dice fall
 * the right way.
 */
import assert from 'node:assert/strict';
import { before, beforeEach, test } from 'node:test';
import { JSDOM } from 'jsdom';

let dom: JSDOM;

function define(key: string, value: unknown): void {
  Object.defineProperty(globalThis, key, {
    value, writable: true, configurable: true, enumerable: true,
  });
}

/** A minimal table view in the payout phase, with you winning `won`. */
function payoutView(over: Record<string, unknown> = {}): unknown {
  return {
    code: 'TEST',
    handNumber: 1,
    ante: 1,
    omens: [],
    winnerId: null,
    phase: 'payout',
    bb: 50,
    board: [],
    modNotes: [],
    activeMods: {},
    youId: 'p1',
    players: [{ id: 'p1', isYou: true }],
    payout: {
      entries: [{ playerId: 'p1', won: 300, cards: [], usedIds: [], cat: 'pair' }],
    },
    ...over,
  };
}

before(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost:5173/',
    pretendToBeVisual: true,
  });
  define('window', dom.window);
  define('document', dom.window.document);
  define('localStorage', dom.window.localStorage);
  define('Event', dom.window.Event);
  define('CustomEvent', dom.window.CustomEvent);
});

beforeEach(() => {
  dom.window.localStorage.clear();
});

test('winning a pot unlocks First Blood', async () => {
  const ach = await import('../src/lib/achievements');
  const view = payoutView();
  const off = ach.installAchievementWatcher(() => view as never);
  await new Promise((r) => setTimeout(r, 700)); // the watcher polls at 500ms
  off();
  assert.ok(
    ach.earned().has('first_blood'),
    `expected first_blood; got ${[...ach.earned()].join(', ') || 'nothing'}`,
  );
});

test('a pot worth 100 big blinds unlocks Whale', async () => {
  const ach = await import('../src/lib/achievements');
  const view = payoutView({
    payout: { entries: [{ playerId: 'p1', won: 5000, cards: [], usedIds: [], cat: 'pair' }] },
  });
  const off = ach.installAchievementWatcher(() => view as never);
  await new Promise((r) => setTimeout(r, 700));
  off();
  assert.ok(ach.earned().has('whale'), 'expected whale on a 100bb pot');
});

test('reaching ante 5 and ante 8 unlocks both depth achievements', async () => {
  const ach = await import('../src/lib/achievements');
  const view = payoutView({ ante: 8, payout: null });
  const off = ach.installAchievementWatcher(() => view as never);
  await new Promise((r) => setTimeout(r, 700));
  off();
  assert.ok(ach.earned().has('ante_five'), 'expected ante_five');
  assert.ok(ach.earned().has('ante_eight'), 'expected ante_eight');
});

test('losing the hand unlocks nothing', async () => {
  const ach = await import('../src/lib/achievements');
  const view = payoutView({
    payout: { entries: [{ playerId: 'p2', won: 300, cards: [], usedIds: [], cat: 'pair' }] },
  });
  const off = ach.installAchievementWatcher(() => view as never);
  await new Promise((r) => setTimeout(r, 700));
  off();
  assert.equal(ach.earned().size, 0, `expected nothing; got ${[...ach.earned()].join(', ')}`);
});

test('an unlock is written to storage so it survives a reload', async () => {
  const ach = await import('../src/lib/achievements');
  const view = payoutView();
  const off = ach.installAchievementWatcher(() => view as never);
  await new Promise((r) => setTimeout(r, 700));
  off();
  const raw = dom.window.localStorage.getItem('hexhold.achievements');
  assert.ok(raw, 'nothing was persisted');
  assert.ok((JSON.parse(raw) as string[]).includes('first_blood'));
});

/*
 * The store side. Steamworks takes an achieved and an unachieved icon per
 * achievement, 256x256. The manifest names them, and they must exist at that
 * size, so an achievement added to the game without its icons (or a stale
 * text-only set left beside the real one) fails here instead of in the
 * partner site's upload form.
 */
test('every achievement in the Steam manifest has both icons, 256x256 PNG', async () => {
  const { readFileSync, existsSync, readdirSync } = await import('node:fs');
  const path = await import('node:path');
  const { steamManifest } = await import('../shared/achievements.ts');
  const steamDir = path.resolve('steam');
  const pngSize = (file: string): [number, number] => {
    const b = readFileSync(file);
    assert.equal(b.toString('latin1', 1, 4), 'PNG', `${file} is not a PNG`);
    return [b.readUInt32BE(16), b.readUInt32BE(20)];
  };
  const manifest = steamManifest();
  assert.equal(manifest.length, 20);
  const named = new Set<string>();
  for (const a of manifest) {
    for (const rel of [a.icon, a.iconLocked]) {
      const file = path.join(steamDir, rel);
      assert.ok(existsSync(file), `${a.name}: ${rel} is missing`);
      assert.deepEqual(pngSize(file), [256, 256], `${rel} is not 256x256`);
      named.add(path.basename(rel));
    }
  }
  // The committed manifest is the generated one, icons included.
  const committed = JSON.parse(readFileSync(path.join(steamDir, 'achievements.json'), 'utf8'));
  assert.deepEqual(committed, manifest, 'steam/achievements.json is stale: run npm run steam:manifest');
  // Nothing in the folder that the manifest does not name (an old set).
  const extra = readdirSync(path.join(steamDir, 'achievements'))
    .filter((f) => f.endsWith('.png') && f !== 'contact-sheet.png' && !named.has(f));
  assert.deepEqual(extra, [], 'icons in steam/achievements/ that no achievement uses');
});
