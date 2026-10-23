/**
 * The Market holds the longest relic it can offer.
 *
 * Round 8 (2026-10-23) put The Second River, The Lodestone and The Engraver on
 * the later shelf, and their rules are the longest any shelf relic has had
 * (106-113 characters; the longest before was The Blood Price at 99). A
 * Market card wraps its text and grows, so a long one could push "Done" out
 * of reach or run text past the card. The responsive harness reaches a Market
 * but sells whatever the seed rolls, so it may never see the long ones.
 *
 * So this plays to the first Market at each size, writes the longest name,
 * rule and italic line on the later shelf onto every card on it (a card worse
 * than any real one), and checks what the responsive
 * harness checks there: nothing clipped, nothing hanging off the screen,
 * and "Done" on screen or one scroll away.
 *
 * Run against a running build: node --import tsx test/shoptext.mjs
 * (HEXHOLD_URL to point elsewhere; HEXHOLD_LATER_RUN=1 to play it as a later
 * run). tsx is there to read the relic list from shared/relics.ts.
 */
import { launch } from './browser.mjs';
import { asLaterRun } from './ports.mjs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { RELIC_BY_ID, relicPool } from '../shared/relics.ts';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
const OUT = path.resolve('responsive', 'shoptext');
mkdirSync(OUT, { recursive: true });
const NUDGE = { timeout: 1500 };
const SIZES = [[1024, 680], [1280, 800], [1920, 1080]];

// The worst card the shelf could print: its longest name, longest rule and
// longest italic line, which no single relic has all at once.
const pool = [...relicPool(true)].map((r) => RELIC_BY_ID[r.id]);
const longestOf = (key) => pool.reduce((a, b) => (b[key].length > a[key].length ? b : a));
const relic = {
  name: longestOf('name').name,
  text: longestOf('text').text,
  impossible: longestOf('impossible').impossible,
};
console.log(`worst case: name from ${longestOf('name').name}, rule from ${longestOf('text').name} (${relic.text.length}), line from ${longestOf('impossible').name} (${relic.impossible.length})`);

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

  // Fold every hand until the Market opens: the shortest way to a shop.
  const done = page.locator('.shop button:has-text("Done")').first();
  let reached = false;
  for (let i = 0; i < 900 && !reached; i++) {
    if (await done.count().catch(() => 0)) { reached = true; break; }
    for (const re of [/^check$/i, /^fold$/i]) {
      const b = page.locator('.actionbar button', { hasText: re }).first();
      if (await b.isEnabled({ timeout: 100 }).catch(() => false)) { await b.click(NUDGE).catch(() => {}); break; }
    }
    const x = page.locator('.hint-mark button, button[aria-label="Dismiss"]').first();
    if (await x.isVisible().catch(() => false)) await x.click(NUDGE).catch(() => {});
    await page.waitForTimeout(250);
  }
  if (!reached) { console.log(`${w}x${h}: FAIL, no Market within the time budget`); failures++; await ctx.close(); continue; }
  await page.waitForTimeout(900);

  const found = await page.evaluate((r) => {
    for (const card of document.querySelectorAll('.shopcard')) {
      const name = card.querySelector('.shopcard-name');
      const text = card.querySelector('.shopcard-text');
      const imp = card.querySelector('.shopcard-impossible');
      if (name) name.textContent = r.name;
      if (text) text.textContent = r.text;
      if (imp) imp.lastChild.textContent = ` ${r.impossible}`;
    }
    return document.querySelectorAll('.shopcard').length;
  }, { name: relic.name, text: relic.text, impossible: relic.impossible });
  await page.waitForTimeout(300);

  const problems = await page.evaluate(() => {
    const out = [];
    const vw = innerWidth;
    for (const el of document.querySelectorAll('.shopcard-name, .shopcard-text, .shopcard-impossible')) {
      if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1) out.push(`clipped: ${el.className}`);
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) out.push(`off-screen sideways: ${el.className}`);
    }
    if (document.documentElement.scrollWidth > vw + 1) out.push('the page scrolls sideways');
    for (const card of document.querySelectorAll('.shopcard')) {
      const c = card.getBoundingClientRect();
      for (const el of card.querySelectorAll('.shopcard-text, .shopcard-impossible')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > c.bottom + 1 || r.right > c.right + 1) out.push(`text runs past its card: ${el.className}`);
      }
    }
    return [...new Set(out)];
  });
  await done.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => {});
  const doneBox = await done.boundingBox().catch(() => null);
  if (!doneBox || doneBox.y + doneBox.height > h + 1 || doneBox.y < 0) problems.push('"Done" cannot be brought on screen');
  await page.screenshot({ path: path.join(OUT, `market-${w}x${h}.png`) });
  console.log(`${w}x${h}: ${found} cards rewritten, ${problems.length ? `FAIL ${problems.join('; ')}` : 'ok'}`);
  failures += problems.length ? 1 : 0;
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} size(s) failed` : 'every size holds the longest relic');
process.exit(failures ? 1 : 0);
