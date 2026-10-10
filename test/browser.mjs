/**
 * One place that knows how to start a browser.
 *
 * Playwright normally downloads a Chromium build pinned to its own version.
 * CI images and sandboxes often ship a different one already, so honour
 * HEXHOLD_CHROMIUM (or PLAYWRIGHT_CHROMIUM_PATH) when it points at a real
 * binary, and otherwise let Playwright do what it always does.
 *
 * When Playwright's pinned build is missing (it was updated and nobody ran
 * `npx playwright install`), fall back to the newest Chromium Playwright has
 * already installed on this machine rather than failing the harness: on
 * 2026-10-10 playwright 1.63 wanted build 1243 and only 1194 and 1248 were
 * on disk.
 */
import { chromium } from 'playwright';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const override = process.env.HEXHOLD_CHROMIUM ?? process.env.PLAYWRIGHT_CHROMIUM_PATH;

function installedChromium(headless) {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH
    ?? (process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'ms-playwright')
      : process.platform === 'darwin'
        ? join(homedir(), 'Library', 'Caches', 'ms-playwright')
        : join(homedir(), '.cache', 'ms-playwright'));
  if (!existsSync(root)) return null;
  const win = process.platform === 'win32';
  const kinds = headless
    ? [['chromium_headless_shell-', win ? 'chrome-headless-shell-win64/chrome-headless-shell.exe' : 'chrome-headless-shell-linux64/chrome-headless-shell']]
    : [];
  kinds.push(['chromium-', win ? 'chrome-win64/chrome.exe' : 'chrome-linux64/chrome']);
  for (const [prefix, exe] of kinds) {
    const builds = readdirSync(root)
      .filter((d) => d.startsWith(prefix) && /^\d+$/.test(d.slice(prefix.length)))
      .sort((a, b) => Number(b.slice(prefix.length)) - Number(a.slice(prefix.length)));
    for (const b of builds) {
      const p = join(root, b, exe);
      if (existsSync(p)) return p;
    }
  }
  return null;
}

export async function launch(opts = {}) {
  // Harnesses run while someone may be using the machine: never make a sound.
  const withMute = { ...opts, args: [...(opts.args ?? []), '--mute-audio'] };
  if (override && existsSync(override)) return chromium.launch({ ...withMute, executablePath: override });
  try {
    return await chromium.launch(withMute);
  } catch (e) {
    if (!/Executable doesn't exist/.test(String(e))) throw e;
    const found = installedChromium(opts.headless !== false);
    if (!found) throw e;
    return chromium.launch({ ...withMute, executablePath: found });
  }
}

export { chromium };
