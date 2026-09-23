/** Grab table screenshots, playing along so states are live rather than folded. */
import { launch } from './browser.mjs';
const URL = process.env.HEXHOLD_URL ?? 'http://localhost:5173/';
const OUT = process.env.SHOT_DIR ?? '/tmp/claude-0/shots';
const browser = await launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/01-menu.png` });
const skip = page.locator('button:has-text("Skip")').first();
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(400);
await page.locator('button', { hasText: /practice/i }).first().click();
await page.waitForTimeout(3000);

/** Keep the hero in the hand: check when free, call when cheap, never fold. */
async function act() {
  for (const re of [/^check$/i, /^call/i]) {
    const b = page.locator('.actionbar button', { hasText: re }).first();
    if (await b.isEnabled({ timeout: 120 }).catch(() => false)) { await b.click().catch(() => {}); return true; }
  }
  return false;
}

// Play until a flop is on the board with us still live.
for (let i = 0; i < 160; i++) {
  await act();
  const n = await page.locator('.board .hx-card').count().catch(() => 0);
  const folded = await page.locator('text=You folded this hand').isVisible().catch(() => false);
  if (n >= 3 && !folded) break;
  await page.waitForTimeout(320);
}
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/03-flop.png` });

for (let i = 0; i < 200; i++) {
  await act();
  if (await page.locator('.showdown').first().isVisible().catch(() => false)) break;
  await page.waitForTimeout(300);
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/04-showdown.png` });
await browser.close();
console.log('shots done');
