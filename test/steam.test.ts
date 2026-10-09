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
const steam = require('../electron/steam.cjs') as {
  resolveAppId(resourcesPath: string | undefined, opts?: { dev?: boolean; root?: string }, env?: Record<string, string | undefined>): number;
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
