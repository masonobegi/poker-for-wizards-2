/**
 * The spell you are asked to answer is on screen when you are asked.
 *
 * Found 2026-10-23: the stack panel stacked the spell being cast above a
 * sticky "Answer it?" plate inside a height-capped box, and the two did not
 * fit it. With one counter in hand, preflop, the plate opened on top of the
 * spell it was asking about: 66px of it hidden at 1920x1080, 151px at
 * 1280x800 (the Steam Deck: "AMBER" cut in half, its rule gone) and 221px at
 * 1024x680. Every browser harness passed, because nothing measured the
 * panel's own contents against each other.
 *
 * This plays until a spell is on the stack and the player is offered an
 * answer, then fails on any size where the plate covers the spell, or where
 * the spell or the plate is not inside the panel's visible box.
 *
 * Run against a running build: node test/stackfit.mjs (HEXHOLD_URL to point
 * elsewhere; HEXHOLD_LATER_RUN=1 to play it as a later run).
 */
import { launch } from './browser.mjs';
import { asLaterRun } from './ports.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
const OUT = path.resolve('responsive', 'stackfit');
mkdirSync(OUT, { recursive: true });
const NUDGE = { timeout: 1500 };
const SIZES = [[1920, 1080], [1280, 800], [1024, 680], [960, 600]];

const browser = await launch({ headless: true, args: ['--mute-audio'] });
let failures = 0;
for (const [w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await asLaterRun(ctx);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const skip = page.locator('button:has-text("Skip")').first();
  if (await skip.isVisible().catch(() => false)) await skip.click(NUDGE).catch(() => {});
  await page.locator('button', { hasText: /practice/i }).first().click(NUDGE).catch(() => {});

  // Stay in every hand (check or call) until a bot casts and we may answer.
  let got = null;
  for (let i = 0; i < 1200 && !got; i++) {
    got = await page.evaluate(() => {
      const panel = document.querySelector('.stack-panel');
      const plate = panel?.querySelector('.stack-respond');
      const feature = panel?.querySelector('.stack-feature');
      if (!panel || !plate || !feature) return null;
      const r = panel.getBoundingClientRect();
      const f = feature.getBoundingClientRect();
      const p = plate.getBoundingClientRect();
      const sideways = Math.min(f.right, p.right) > Math.max(f.left, p.left);
      return {
        covered: sideways ? Math.max(0, Math.round(Math.min(f.bottom, p.bottom) - Math.max(f.top, p.top))) : 0,
        spellInside: f.top >= r.top - 1 && f.bottom <= r.bottom + 1,
        plateInside: p.top >= r.top - 1 && p.bottom <= r.bottom + 1,
        spell: feature.querySelector('.stack-feature__name')?.textContent ?? '',
      };
    }).catch(() => null);
    if (got) break;
    for (const re of [/^check$/i, /^call/i]) {
      const b = page.locator('.actionbar button', { hasText: re }).first();
      if (await b.isEnabled({ timeout: 80 }).catch(() => false)) { await b.click(NUDGE).catch(() => {}); break; }
    }
    await page.waitForTimeout(150);
  }
  if (!got) {
    console.log(`${w}x${h}: FAIL, no answerable stack within the time budget`);
    failures++;
  } else {
    await page.screenshot({ path: path.join(OUT, `stack-${w}x${h}.png`) });
    const problems = [];
    if (got.covered > 0) problems.push(`"Answer it?" covers ${got.covered}px of ${got.spell}`);
    if (!got.spellInside) problems.push(`${got.spell} runs past the panel`);
    if (!got.plateInside) problems.push('"Answer it?" runs past the panel');
    console.log(`${w}x${h}: ${got.spell}, ${problems.length ? `FAIL ${problems.join('; ')}` : 'ok'}`);
    if (problems.length) failures++;
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} size(s) failed` : 'the spell and its answer fit at every size');
process.exit(failures ? 1 : 0);
