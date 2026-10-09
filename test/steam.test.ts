/**
 * Where a shipped copy finds its Steam App ID.
 *
 * A customer's copy has no steam_appid.txt: the SteamPipe depot scripts
 * exclude it. The only place its ID exists is the SteamAppId / SteamGameId
 * variables the Steam client sets when it launches a game. Before 2026-10-09
 * the shell ignored those, so every Steam-launched copy started with Steam
 * switched off: no achievements, no rich presence, no Cloud, and no error.
 */
import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
type KeyboardReq = { x?: number; y?: number; width?: number; height?: number; multiline?: boolean };
const steam = require('../electron/steam.cjs') as {
  resolveAppId(resourcesPath: string | undefined, opts?: { dev?: boolean; root?: string }, env?: Record<string, string | undefined>): number;
  init(resourcesPath: string | undefined, opts?: { dev?: boolean; env?: Record<string, string | undefined>; steamworks?: unknown }): boolean;
  showKeyboard(req?: KeyboardReq): Promise<boolean>;
  onSteamDeck(): boolean;
  shutdown(): void;
};

/** A packaged-looking resources folder with nothing in it. */
function emptyResources(): { dir: string; done(): void } {
  const dir = mkdtempSync(path.join(tmpdir(), 'hexhold-steam-'));
  return { dir: path.join(dir, 'resources'), done: () => rmSync(dir, { recursive: true, force: true }) };
}

test('a copy Steam launched reads the App ID Steam put in SteamAppId', () => {
  const r = emptyResources();
  try {
    assert.equal(steam.resolveAppId(r.dir, {}, { SteamAppId: '3456780' }), 3456780);
    assert.equal(steam.resolveAppId(r.dir, {}, { SteamGameId: '3456780' }), 3456780);
  } finally { r.done(); }
});

test('Steam\'s variables win over the developer override', () => {
  const r = emptyResources();
  try {
    assert.equal(steam.resolveAppId(r.dir, {}, { SteamAppId: '3456780', STEAM_APP_ID: '480' }), 3456780);
    assert.equal(steam.resolveAppId(r.dir, {}, { STEAM_APP_ID: '480' }), 480);
  } finally { r.done(); }
});

test('a non-Steam shortcut\'s 64-bit game ID is not taken for an App ID', () => {
  const r = emptyResources();
  try {
    // What Steam sets when the exe is added as a non-Steam game.
    assert.equal(steam.resolveAppId(r.dir, {}, { SteamAppId: '0', SteamGameId: '12884902297487507456' }), 0);
    assert.equal(steam.resolveAppId(r.dir, {}, { SteamAppId: 'abc', SteamGameId: '-5' }), 0);
  } finally { r.done(); }
});

test('with no variables, steam_appid.txt beside the binary still works', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'hexhold-steam-'));
  try {
    const resources = path.join(root, 'resources');
    writeFileSync(path.join(root, 'steam_appid.txt'), '480\r\n');
    assert.equal(steam.resolveAppId(resources, {}, {}), 480);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('nothing configured means 0, and Steam stays off', () => {
  const r = emptyResources();
  try {
    assert.equal(steam.resolveAppId(r.dir, {}, {}), 0);
  } finally { r.done(); }
});

/*
 * Steam's on-screen keyboard (playtest P8). A pad cannot type, and on a Deck
 * in Game Mode no keyboard appears unless the game asks Steam for one.
 */
type FloatingCall = [mode: number, x: number, y: number, w: number, h: number];

/** A stand-in for steamworks.js that records the keyboard calls. */
function fakeSteamworks(answer: () => unknown) {
  const calls: FloatingCall[] = [];
  const module = {
    init: () => ({
      localplayer: { getName: () => 'tester' },
      utils: {
        showFloatingGamepadTextInput: (...a: FloatingCall) => { calls.push(a); return answer(); },
        isSteamRunningOnSteamDeck: () => true,
      },
    }),
  };
  return { module, calls };
}

function withSteam(answer: () => unknown, fn: (calls: FloatingCall[]) => Promise<void>) {
  const fake = fakeSteamworks(answer);
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal(steam.init(undefined, { dev: true, env: { SteamAppId: '3456780' }, steamworks: fake.module }), true);
  } finally { console.log = log; }
  return fn(fake.calls).finally(() => steam.shutdown());
}

test('a text field asks Steam for its floating keyboard beside the field', async () => {
  await withSteam(() => Promise.resolve(true), async (calls) => {
    assert.equal(await steam.showKeyboard({ x: 400.4, y: 300, width: 320, height: 40 }), true);
    assert.equal(await steam.showKeyboard({ x: 10, y: 500, width: 600, height: 120, multiline: true }), true);
    // Single-line mode for an input, multi-line for the Scribe's textarea, and
    // whole pixels, as the Steamworks call takes ints.
    assert.deepEqual(calls, [[0, 400, 300, 320, 40], [1, 10, 500, 600, 120]]);
    assert.equal(steam.onSteamDeck(), true);
  });
});

test('a keyboard Steam declines, or a call that throws, is false and nothing else', async () => {
  await withSteam(() => Promise.resolve(false), async () => {
    assert.equal(await steam.showKeyboard({ x: 0, y: 0, width: 10, height: 10 }), false);
  });
  await withSteam(() => { throw new Error('old Steam client'); }, async () => {
    assert.equal(await steam.showKeyboard({ x: 0, y: 0, width: 10, height: 10 }), false);
  });
  await withSteam(() => Promise.reject(new Error('refused')), async () => {
    assert.equal(await steam.showKeyboard({ x: 0, y: 0, width: 10, height: 10 }), false);
  });
});

test('without Steam the keyboard is a quiet no-op', async () => {
  steam.shutdown();
  assert.equal(await steam.showKeyboard({ x: 0, y: 0, width: 10, height: 10 }), false);
  assert.equal(steam.onSteamDeck(), false);
});
