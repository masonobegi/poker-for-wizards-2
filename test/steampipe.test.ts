/**
 * The three Steam apps HEXHOLD uploads (the full game, the Next Fest demo, the
 * Steam Playtest) and the folders their builds land in.
 *
 * A SteamPipe script that points at the wrong folder uploads the wrong game,
 * and nothing says so until a player launches it. So: every app build points
 * at the folder its packaging script writes, every depot it names exists and
 * keeps the dev-only steam_appid.txt out, and every ID is still a placeholder,
 * because this repository is public and the real numbers belong in Mason's
 * copy only when Steamworks issues them.
 */
import { strict as assert } from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

import { feedbackUrl, PLAYTEST_ASKS } from '../shared/playtest';

const ROOT = resolve(import.meta.dirname, '..');
const SP = join(ROOT, 'steam', 'steampipe');

const field = (vdf: string, key: string): string[] =>
  [...vdf.matchAll(new RegExp(`"${key}"\\s+"([^"]*)"`, 'g'))].map((m) => m[1]);

const APPS = [
  { file: join(SP, 'app_build.vdf'), out: 'release', script: 'package.json' },
  { file: join(SP, 'demo', 'app_build_demo.vdf'), out: 'release-demo', script: 'scripts/build-demo.mjs' },
  { file: join(SP, 'playtest', 'app_build_playtest.vdf'), out: 'release-playtest', script: 'scripts/build-playtest.mjs' },
];

for (const app of APPS) {
  test(`${app.out}: the app build uploads what its packaging writes, with placeholder IDs`, () => {
    const vdf = readFileSync(app.file, 'utf8');
    const [appId] = field(vdf, 'AppID');
    assert.ok(appId && !/\d/.test(appId), `a real App ID (${appId}) in a public repository`);

    // ContentRoot is relative to the .vdf's own folder.
    const [root] = field(vdf, 'ContentRoot');
    const target = resolve(dirname(app.file), root.replace(/\\/g, '/'));
    assert.equal(target, join(ROOT, app.out), `${app.file} uploads ${target}`);
    assert.ok(readFileSync(join(ROOT, app.script), 'utf8').includes(app.out),
      `${app.script} does not write ${app.out}`);

    // Every depot it names exists, has a placeholder ID and keeps the dev App ID out.
    const depots = [...vdf.matchAll(/"([A-Z_]*DEPOT_ID_[A-Z]+)"\s+"([^"]+\.vdf)"/g)];
    assert.equal(depots.length, 2, 'expected a Windows and a Linux depot');
    for (const [, id, f] of depots) {
      const path = join(dirname(app.file), f);
      assert.ok(existsSync(path), `${f} is missing`);
      const depot = readFileSync(path, 'utf8');
      assert.equal(field(depot, 'DepotID')[0], id);
      assert.ok(!/\d/.test(id), `a real depot ID (${id})`);
      assert.ok(field(depot, 'FileExclusion').includes('steam_appid.txt'), `${f} would ship steam_appid.txt`);
      assert.match(field(depot, 'ContentRoot')[0], /^(win|linux)-unpacked\\$/);
    }
  });
}

test('every rich presence token the game sets has text for Steam to show', () => {
  // Steam shows nothing for a token its localization file lacks, so a typo
  // here is a friends list that never says what you are playing.
  const vdf = readFileSync(join(ROOT, 'steam', 'rich_presence.vdf'), 'utf8');
  const defined = new Set([...vdf.matchAll(/"(#[A-Za-z_]+)"\s+"[^"]+"/g)].map((m) => m[1]));
  const code = ['electron/main.cjs', 'electron/steam.cjs', 'electron/preload.cjs']
    .map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
  const used = [...code.matchAll(/setRichPresence\(\s*'steam_display'\s*,\s*'(#[A-Za-z_]+)'/g)].map((m) => m[1]);
  assert.ok(used.length > 0, 'the game sets no steam_display token at all');
  for (const t of used) assert.ok(defined.has(t), `${t} is set by the game but not defined in steam/rich_presence.vdf`);
});

test('the playtest feedback link: the set one, else the game\'s discussions, else none', () => {
  assert.equal(feedbackUrl('https://example.com/form', 0), 'https://example.com/form');
  assert.equal(feedbackUrl('', 123), 'https://steamcommunity.com/app/123/discussions/');
  assert.equal(feedbackUrl('', 0), null, 'a feedback button that opens nothing');
  assert.equal(feedbackUrl('not a url', 0), null);
  assert.equal(feedbackUrl('http://plain.example', 0), null, 'only https links leave the game');
  assert.ok(PLAYTEST_ASKS.length >= 3 && PLAYTEST_ASKS.every((q) => q.endsWith('?')));
});
