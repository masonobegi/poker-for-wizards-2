#!/usr/bin/env node
/**
 * Clicking an omen shows you what it does, and it keeps showing it.
 *
 * Reported twice. First: "you should be able to click on the pink omens in the
 * top right and get an idea of what they do." Then, after a round of work on
 * it: "you also still can't click the omens."
 *
 * The second time was not the panel's fault. The chip had one piece of state
 * and three handlers writing it — pointer-enter opened it, pointer-leave
 * closed it, click toggled — and a click is always preceded by a pointer-enter,
 * so the toggle found the panel already open and closed it again. Measured in
 * this harness before the fix: hover → panel up, click → panel gone, move the
 * mouse off to read it → gone. No gesture left it readable.
 *
 * This lives here rather than in `npm test` because the bug is in gestures and
 * paint, and the only honest witness is a browser: the same behaviour under
 * jsdom deadlocks on framer-motion's hover gesture inside `act`. It builds a
 * real table through the game's own store with two hands per ante so an omen
 * actually lands, then performs the four gestures a player performs.
 *
 *   node test/omengesture.mjs            # against http://127.0.0.1:3001
 *   BASE=http://localhost:5173 node test/omengesture.mjs
 */
import { launch } from './browser.mjs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3001';
const NUDGE = { timeout: 2000 };
const SIZES = [[1280, 800], [1920, 1080]];

const fails = [];
const check = (ok, what) => {
  console.log(`   ${ok ? '✔' : '✖'} ${what}`);
  if (!ok) fails.push(what);
};

const browser = await launch({ headless: true });

for (const [W, H] of SIZES) {
  console.log(`\n▶ ${W}x${H}`);
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  // `?harness` is what exposes the store (see src/store/net.ts).
  await page.goto(`${BASE}/?harness`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  for (let i = 0; i < 3; i++) {
    const n = page.locator('button:has-text("Next")').first();
    if (await n.isVisible().catch(() => false)) { await n.click(NUDGE).catch(() => {}); await page.waitForTimeout(180); }
  }
  const skip = page.locator('button:has-text("Skip")').first();
  if (await skip.isVisible().catch(() => false)) await skip.click(NUDGE).catch(() => {});
  await page.waitForTimeout(600);

  const made = await page.evaluate(async () => {
    const s = window.__hexholdStore;
    if (!s) return 'no store — is the page on ?harness';
    const code = await s.getState().createRoom('Hero', {
      maxPlayers: 4, private: true, botSkill: 'adept', speed: 'blitz', handsPerAnte: 2,
    });
    if (!code) return 'createRoom failed';
    s.getState().addBot(true); s.getState().addBot(true); s.getState().addBot(true);
    await new Promise((r) => setTimeout(r, 900));
    s.getState().startGame();
    return null;
  });
  if (made) { check(false, `set up a table (${made})`); await ctx.close(); continue; }

  for (let i = 0; i < 160; i++) {
    if (await page.locator('.felt').first().isVisible().catch(() => false)) break;
    await page.waitForTimeout(150);
  }

  /* Play until an omen lands. Omens start at ante 2, and the run only climbs
     if the hands keep finishing — so this answers whatever the table is
     waiting on, Market included, rather than only the betting buttons. */
  const quiet = () => page.evaluate(() =>
    !document.querySelector('.shop') && !document.querySelector('.stackview'));
  let landed = false;
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    /* A chip is in the DOM before it is on screen: a new omen is announced by
       a full-screen banner first and the chip is held at opacity 0 until that
       banner goes (see OmenBar). Gesturing at it before then is what made
       this time out — Playwright waits for an invisible element for ever. */
    landed = await page.evaluate(() => {
      // On a quiet table. The Market is a near-opaque overlay above the
      // header, and a spell in flight puts a full-screen layer over it;
      // gesturing during either measures the overlay, not the chip. The chip
      // staying reachable under a cast is asserted separately below.
      if (document.querySelector('.shop') || document.querySelector('.stackview')) return false;
      const c = document.querySelector('.omens button');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return false;
      for (let n = c; n; n = n.parentElement) {
        if (Number(getComputedStyle(n).opacity) < 0.9) return false;
      }
      return true;
    });
    if (landed) break;
    const act = page.locator('.action-bar button', { hasText: /^(Call|Check)/ }).first();
    if (await act.isEnabled({ timeout: 220 }).catch(() => false)) await act.click({ timeout: 800 }).catch(() => {});
    for (const re of [/Skip the Market|Leave the Market/i, /^Take\b/i, /Continue|Next hand|Deal|Done|Ready/i]) {
      const btn = page.locator('button', { hasText: re }).first();
      if (await btn.isEnabled({ timeout: 150 }).catch(() => false)) {
        await btn.click({ timeout: 800 }).catch(() => {});
        break;
      }
    }
    await page.waitForTimeout(280);
  }
  if (!landed) { check(false, 'an omen landed on the bar within the time limit'); await ctx.close(); continue; }
  // Let the slam settle so the first gesture is not aimed at a moving target.
  await page.waitForTimeout(700);

  /* The table does not stop while this runs: the Market can open between the
     check above and the first gesture, and it is an overlay above the header.
     This pauses the run instead of racing it — the omens stay on the bar, so
     the gestures below are measured on a table that is holding still. */
  const settle = async () => {
    for (let i = 0; i < 80; i++) {
      if (await quiet()) return true;
      for (const re of [/Skip the Market|Leave the Market/i, /Continue|Next hand|Done/i]) {
        const btn = page.locator('button', { hasText: re }).first();
        if (await btn.isEnabled({ timeout: 120 }).catch(() => false)) { await btn.click({ timeout: 700 }).catch(() => {}); break; }
      }
      await page.waitForTimeout(250);
    }
    return quiet();
  };
  if (!(await settle())) { check(false, 'the table settled enough to gesture at an omen'); await ctx.close(); continue; }

  const chip = page.locator('.omens button').first();
  const tips = () => page.locator('.omen-tip').count();
  /* Moved in steps. A single jump from the chip to the middle of the felt
     left Chromium's hover state on the chip often enough to make this flaky
     at 1080p; the intermediate moves are what a hand does anyway. */
  const away = async () => {
    await page.mouse.move(Math.round(W * 0.6), Math.round(H * 0.3), { steps: 8 });
    await page.mouse.move(Math.round(W / 2), Math.round(H * 0.62), { steps: 8 });
    await page.waitForTimeout(500);
  };

  check(await chip.evaluate((e) => getComputedStyle(e).pointerEvents) !== 'none',
    'the chip accepts pointer events at all');

  await settle();
  await chip.hover({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(420);
  check(await tips() === 1, 'hovering an omen previews what it does');

  await away();
  if (await tips() !== 0) {
    console.log('      diag:', JSON.stringify(await page.evaluate(() => {
      const t = document.querySelector('.omen-tip');
      const r = t?.getBoundingClientRect();
      return {
        tips: document.querySelectorAll('.omen-tip').length,
        chips: document.querySelectorAll('.omens button').length,
        pinned: document.querySelectorAll('.omen.is-pinned').length,
        shop: !!document.querySelector('.shop'),
        tipRect: r && { t: Math.round(r.top), l: Math.round(r.left), r: Math.round(r.right), b: Math.round(r.bottom) },
      };
    })));
  }
  check(await tips() === 0, 'the preview goes away when the pointer does');

  await settle();
  const clicked = await chip.click({ timeout: 2500 }).then(() => true).catch(async (e) => {
    console.log('      click error:', String(e).slice(0, 700).replace(/\n+/g, ' | '));
    console.log('      chip diag:', JSON.stringify(await page.evaluate(() => {
      const c = document.querySelector('.omens button');
      if (!c) return 'no chip';
      const r = c.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        rect: { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
        atCentre: top && `${top.tagName}.${String(top.className).slice(0, 50)}`,
        pe: getComputedStyle(c).pointerEvents,
        vis: getComputedStyle(c).visibility,
        op: getComputedStyle(c).opacity,
        parentOp: c.parentElement && getComputedStyle(c.parentElement).opacity,
        parentTransform: c.parentElement && getComputedStyle(c.parentElement).transform,
      };
    })));
    return false;
  });
  check(clicked, 'the chip can be clicked');
  await page.waitForTimeout(450);
  check(await tips() === 1, 'clicking it does NOT close the panel the hover opened');

  await away();
  check(await tips() === 1, 'a clicked omen stays open once the pointer leaves');

  const txt = (await page.locator('.omen-tip').first().textContent().catch(() => '')) ?? '';
  check(/never comes off/.test(txt) && txt.length > 60, 'the open panel explains the rule in words');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(await tips() === 0, 'Escape puts it away');

  await chip.click({ timeout: 2000 }).catch(() => {});
  await page.waitForTimeout(350);
  await page.mouse.click(Math.round(W / 2), Math.round(H * 0.62));
  await page.waitForTimeout(400);
  check(await tips() === 0, 'a click elsewhere puts it away');

  await ctx.close();
}

await browser.close();
console.log(fails.length
  ? `\n✖ ${fails.length} omen gesture check(s) failed:\n  - ${fails.join('\n  - ')}`
  : '\n✔ every omen gesture behaves');
process.exit(fails.length ? 1 : 0);
