/**
 * Steam integration, and its absence.
 *
 * The game must run identically with no Steam, no App ID, and no native module
 * installed — that is how it is developed, how it is tested, and how anyone
 * playing the DRM-free build will run it. So every call here is optional and
 * every failure is swallowed into a no-op.
 *
 * Where the App ID comes from (see resolveAppId):
 *   - a copy launched by Steam: the SteamAppId / SteamGameId variables the
 *     Steam client sets on every game it starts. This is the shipping path:
 *     the SteamPipe depot scripts exclude steam_appid.txt from the upload;
 *   - a local test of a packaged build outside Steam: STEAM_APP_ID=<id>;
 *   - an unpackaged dev run: steam/dev/steam_appid.txt (480, Spacewar).
 */
const fs = require('node:fs');
const path = require('node:path');

let client = null;
let appId = 0;
let enabled = false;
let reason = 'not initialised';

const SPACEWAR = 480; // Valve's public test app. Development only.

/**
 * A string that is a real 32-bit App ID, or 0.
 *
 * SteamGameId is a 64-bit game ID: equal to the App ID for a Steam game, but
 * with high bits set for a mod or a non-Steam shortcut. Anything above 32 bits
 * is therefore not an App ID and must not be passed to Steam as one.
 */
function parseAppId(value) {
  if (typeof value !== 'string' || !/^\s*\d{1,20}\s*$/.test(value)) return 0;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 && n <= 0xFFFFFFFF ? n : 0;
}

function resolveAppId(resourcesPath, opts = {}, env = process.env) {
  // The Steam client's own variables come first: when Steam launched this
  // process they are the truth, and a customer's copy has nothing else. Before
  // 2026-10-09 they were ignored, so a Steam-launched build found no App ID and
  // switched achievements, rich presence and Cloud off without a word.
  for (const name of ['SteamAppId', 'SteamGameId', 'STEAM_APP_ID']) {
    const n = parseAppId(env[name]);
    if (n) return n;
  }
  const dirs = [process.cwd(), resourcesPath, path.join(resourcesPath ?? '', '..')];
  // In development only, fall back to steam/dev/steam_appid.txt, which holds
  // the placeholder 480. It is never packaged: electron-builder ships
  // electron/** only.
  if (opts.dev && opts.root) dirs.push(path.join(opts.root, 'steam', 'dev'));
  for (const dir of dirs) {
    if (!dir) continue;
    try {
      const n = parseAppId(fs.readFileSync(path.join(dir, 'steam_appid.txt'), 'utf8'));
      if (n) return n;
    } catch { /* not there, which is fine */ }
  }
  return 0;
}

function init(resourcesPath, opts = {}) {
  appId = resolveAppId(resourcesPath, opts);
  if (!appId) { reason = 'no App ID configured'; return false; }
  if (appId === SPACEWAR && !opts.dev) {
    console.warn('[steam] running a packaged build as app 480 (Spacewar). '
      + 'That is for local testing only; ship with the real App ID.');
  }

  let steamworks;
  try {
    // Optional dependency on purpose: absent in every build that is not
    // shipping through Steam.
    steamworks = require('steamworks.js');
  } catch {
    reason = 'steamworks.js is not installed';
    return false;
  }

  try {
    client = steamworks.init(appId);
    enabled = true;
    reason = 'ok';
    const name = safe(() => client.localplayer.getName(), 'player');
    console.log(`[steam] connected as ${name} (app ${appId})`);
    return true;
  } catch (err) {
    reason = `Steam is not running or refused the app: ${err && err.message}`;
    client = null;
    return false;
  }
}

/** Run a Steam call, and never let it matter if it fails. */
function safe(fn, fallback = undefined) {
  if (!enabled || !client) return fallback;
  try { return fn(); } catch { return fallback; }
}

const api = {
  init,
  resolveAppId,
  get enabled() { return enabled; },
  status: () => ({ enabled, appId, reason }),

  playerName: () => safe(() => client.localplayer.getName(), null),
  steamId: () => safe(() => client.localplayer.getSteamId().steamId64.toString(), null),

  unlockAchievement(name) {
    return safe(() => {
      const a = client.achievement;
      if (a.isActivated(name)) return true;
      return a.activate(name);
    }, false);
  },

  clearAchievement(name) {
    return safe(() => client.achievement.clear(name), false);
  },

  achievementUnlocked(name) {
    return safe(() => client.achievement.isActivated(name), false);
  },

  /** Rich presence: what a friend sees next to your name. */
  setRichPresence(key, value) {
    safe(() => client.localplayer.setRichPresence(String(key), String(value)));
  },

  // --- Steam Cloud --------------------------------------------------------
  // The whole save is one small JSON blob, so a single file is enough.

  cloudRead(file) {
    return safe(() => {
      if (!client.cloud.fileExists(file)) return null;
      return client.cloud.readFile(file);
    }, null);
  },

  cloudWrite(file, contents) {
    return safe(() => client.cloud.writeFile(file, contents), false);
  },

  cloudDelete(file) {
    return safe(() => client.cloud.deleteFile(file), false);
  },

  /** Pump callbacks. Harmless when Steam is absent. */
  runCallbacks() {
    safe(() => client.runCallbacks && client.runCallbacks());
  },

  shutdown() {
    enabled = false;
    client = null;
  },
};

module.exports = api;
