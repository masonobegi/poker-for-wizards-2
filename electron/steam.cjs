/**
 * Steam integration, and its absence.
 *
 * The game must run identically with no Steam, no App ID, and no native module
 * installed — that is how it is developed, how it is tested, and how anyone
 * playing the DRM-free build will run it. So every call here is optional and
 * every failure is swallowed into a no-op.
 *
 * To turn it on: publish an App ID, `npm i steamworks.js`, and either set
 * STEAM_APP_ID or write the number into `steam_appid.txt` beside the binary.
 */
const fs = require('node:fs');
const path = require('node:path');

let client = null;
let appId = 0;
let enabled = false;
let reason = 'not initialised';

function resolveAppId(resourcesPath) {
  const fromEnv = Number.parseInt(process.env.STEAM_APP_ID ?? '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  for (const dir of [process.cwd(), resourcesPath, path.join(resourcesPath ?? '', '..')]) {
    if (!dir) continue;
    try {
      const text = fs.readFileSync(path.join(dir, 'steam_appid.txt'), 'utf8');
      const n = Number.parseInt(text.trim(), 10);
      if (Number.isFinite(n) && n > 0) return n;
    } catch { /* not there, which is fine */ }
  }
  return 0;
}

function init(resourcesPath) {
  appId = resolveAppId(resourcesPath);
  if (!appId) { reason = 'no App ID configured'; return false; }

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
