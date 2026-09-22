/**
 * One place that knows how to start a browser.
 *
 * Playwright normally downloads a Chromium build pinned to its own version.
 * CI images and sandboxes often ship a different one already, so honour
 * HEXHOLD_CHROMIUM (or PLAYWRIGHT_CHROMIUM_PATH) when it points at a real
 * binary, and otherwise let Playwright do what it always does.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const override = process.env.HEXHOLD_CHROMIUM ?? process.env.PLAYWRIGHT_CHROMIUM_PATH;

export function launch(opts = {}) {
  if (override && existsSync(override)) return chromium.launch({ ...opts, executablePath: override });
  return chromium.launch(opts);
}

export { chromium };
