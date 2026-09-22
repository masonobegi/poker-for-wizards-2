/** Focused layout diagnostic: measures the things the playthrough screenshots suggested. */
import { launch } from './browser.mjs';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:5173/';
const browser = await launch({ headless: true });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200);
const skip = page.locator('button:has-text("Skip")').first();
if (await skip.isVisible().catch(() => false)) await skip.click();
await page.waitForTimeout(500);
await page.locator('button', { hasText: /practice/i }).first().click();
await page.waitForTimeout(4000);

const report = async (label) => {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const scene = document.querySelector('.table-scene');
    const app = document.querySelector('.app');
    const sd = document.querySelector('.showdown');
    const rail = document.querySelector('.rail');
    const ab = document.querySelector('.actionbar');
    const top = document.querySelector('.tbl-top');
    const felt = document.querySelector('.felt');
    const box = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const seats = [...document.querySelectorAll('.tbl-seatslot')].map((s) => box(s));
    return {
      scrollTop: { doc: doc.scrollTop, body: document.body.scrollTop, root: document.getElementById('root')?.scrollTop, app: app?.scrollTop },
      scrollHeight: { doc: doc.scrollHeight, app: app?.scrollHeight, scene: scene?.scrollHeight },
      viewport: { w: window.innerWidth, h: window.innerHeight },
      uiScale: getComputedStyle(doc).getPropertyValue('--ui-scale').trim(),
      appTransform: app ? getComputedStyle(app).transform : null,
      boxes: { top: box(top), felt: box(felt), rail: box(rail), actionbar: box(ab), showdown: box(sd) },
      showdownTransform: sd ? getComputedStyle(sd).transform : null,
      seats,
      seatCardsClipped: seats.filter((s) => s && s.y < 40).length,
    };
  });
  console.log(`\n── ${label} ──`);
  console.log(JSON.stringify(r, null, 1));
  return r;
};

await report('fresh table');

// Click something low to see whether the page can be scrolled by focus.
const sig = page.locator('.sigil').last();
if (await sig.isVisible().catch(() => false)) {
  await sig.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(300);
}
await report('after scrollIntoView on a sigil');

// Wait for a showdown to measure the panel.
for (let i = 0; i < 120; i++) {
  const fold = page.locator('.ab-buttons button:has-text("Fold")').first();
  if (await fold.isVisible().catch(() => false)) {
    const call = page.locator('.ab-buttons button').filter({ hasText: /^(Check|Call)/ }).first();
    if (await call.isVisible().catch(() => false)) await call.click().catch(() => {});
    else await fold.click().catch(() => {});
  }
  const letr = page.locator('button:has-text("Let it resolve")').first();
  if (await letr.isVisible().catch(() => false)) await letr.click().catch(() => {});
  if (await page.locator('.showdown').first().isVisible().catch(() => false)) break;
  await page.waitForTimeout(500);
}
await report('at showdown');

// Sigil text overflow
const sigilInfo = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('.sigil')) {
    const name = el.querySelector('.sigil-name');
    const text = el.querySelector('.sigil-text');
    const foot = el.querySelector('.sigil-foot');
    if (!name) continue;
    out.push({
      name: name.textContent.trim(),
      nameOverflow: name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1,
      textPx: text ? parseFloat(getComputedStyle(text).fontSize) : null,
      textClipped: text ? text.scrollHeight > text.clientHeight + 1 : null,
      footText: foot ? foot.textContent.trim() : null,
      footPx: foot ? parseFloat(getComputedStyle(foot).fontSize) : null,
    });
  }
  return out;
});
console.log('\n── sigil cards ──');
console.log(JSON.stringify(sigilInfo, null, 1));

await browser.close();
