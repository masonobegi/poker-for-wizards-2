/**
 * Proves the game is playable on a controller.
 *
 * Steam Deck Verified is largely a question of "can you do everything without
 * a mouse", and that is not something to take on faith. Playwright cannot
 * attach a real pad, so this installs a fake `navigator.getGamepads` whose
 * button states the test drives directly — the app cannot tell the difference,
 * because the Gamepad API is a polled snapshot either way.
 *
 * Run: node test/gamepad.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
const SHOTS = path.resolve('playthrough-pad');
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const fails = [];
const passes = [];
const check = (ok, text) => (ok ? passes : fails).push(text);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); // Steam Deck
const page = await ctx.newPage();

page.on('pageerror', (e) => fails.push(`uncaught: ${String(e).slice(0, 160)}`));

// A fake pad the test can drive. Installed before any app code runs.
await page.addInitScript(() => {
  const state = {
    connected: true, id: 'Test Pad (STANDARD GAMEPAD)', index: 0, mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: 0,
  };
  window.__pad = state;
  navigator.getGamepads = () => [state, null, null, null];
});

const press = async (index, ms = 90) => {
  await page.evaluate((i) => {
    window.__pad.buttons[i] = { pressed: true, touched: true, value: 1 };
    window.__pad.timestamp = performance.now();
  }, index);
  await page.waitForTimeout(ms);
  await page.evaluate((i) => {
    window.__pad.buttons[i] = { pressed: false, touched: false, value: 0 };
    window.__pad.timestamp = performance.now();
  }, index);
  await page.waitForTimeout(90);
};

const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

const focused = () => page.evaluate(() => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.textContent || '').trim().slice(0, 32),
    cls: (el.className || '').toString().split(' ')[0],
  };
});

console.log(`\n▶ ${URL} at 1280x800 (Steam Deck), driving a synthetic pad\n`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// --- the pad is noticed ------------------------------------------------------
await press(BTN.DOWN);
const padMode = await page.evaluate(() => document.documentElement.dataset.gamepad);
check(padMode === '1', 'pressing a button puts the app into controller mode');

// --- navigation moves focus --------------------------------------------------
const first = await focused();
check(!!first, `a direction press focuses something (${first?.text ?? 'nothing'})`);

// --- the intro can be dismissed on a pad ------------------------------------
const introOpen = await page.locator('text=/skip/i').first().isVisible().catch(() => false);
if (introOpen) {
  // Walk to Skip and press A.
  let dismissed = false;
  for (let i = 0; i < 14 && !dismissed; i++) {
    const f = await focused();
    if (f && /skip/i.test(f.text)) {
      await press(BTN.A);
      await page.waitForTimeout(500);
      dismissed = !(await page.locator('text=/skip/i').first().isVisible().catch(() => false));
      break;
    }
    await press(BTN.DOWN);
  }
  check(dismissed, 'the first-run intro can be dismissed without a mouse');
  if (!dismissed) {
    await page.locator('button:has-text("Skip")').first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

// --- navigation breadth, now that the menu is the scope ---------------------
const seen = new Set();
for (let i = 0; i < 8; i++) {
  await press(i % 3 === 2 ? BTN.RIGHT : BTN.DOWN);
  const f = await focused();
  if (f) seen.add(`${f.tag}:${f.text}`);
}
check(seen.size >= 3, `navigation reaches several menu controls (${seen.size} distinct)`);
await page.screenshot({ path: path.join(SHOTS, '01-menu-focus.png') });

// --- starting a game on the pad ---------------------------------------------
let started = false;
for (let i = 0; i < 20 && !started; i++) {
  const f = await focused();
  if (f && /practice/i.test(f.text)) {
    await press(BTN.A);
    await page.waitForTimeout(4000);
    started = await page.locator('.felt').first().isVisible().catch(() => false);
    break;
  }
  await press(i % 3 === 2 ? BTN.RIGHT : BTN.DOWN);
}
check(started, 'a game can be started entirely on the controller');
await page.screenshot({ path: path.join(SHOTS, '02-table.png') });

if (started) {
  // --- the legend and the swapped hints ------------------------------------
  const legend = await page.locator('.pad-legend').first().isVisible().catch(() => false);
  check(legend, 'the button legend is visible in controller mode');

  const hint = await page.evaluate(() => {
    const kbd = document.querySelector('.ab-buttons kbd');
    if (!kbd) return null;
    return {
      pad: kbd.getAttribute('data-pad'),
      transparent: getComputedStyle(kbd).color.includes('rgba(0, 0, 0, 0)'),
      after: getComputedStyle(kbd, '::after').content,
    };
  });
  check(!!hint?.pad, `key hints carry a controller equivalent (${hint?.pad ?? 'none'})`);

  // --- taking a turn on the pad --------------------------------------------
  let acted = false;
  for (let i = 0; i < 80 && !acted; i++) {
    const myTurn = await page.locator('.ab-buttons button:has-text("Fold")').first()
      .isVisible().catch(() => false);
    if (myTurn) {
      await page.screenshot({ path: path.join(SHOTS, '03-turn.png') });
      const before = await page.evaluate(() =>
        document.querySelector('.rail-chips')?.textContent ?? '');
      // LB is fold; A is check/call. Use A so the hand continues.
      await press(BTN.A);
      await page.waitForTimeout(900);
      const stillMyTurn = await page.locator('.ab-buttons button:has-text("Fold")').first()
        .isVisible().catch(() => false);
      acted = !stillMyTurn;
      void before;
    }
    await page.waitForTimeout(500);
  }
  check(acted, 'a betting action can be taken with the face buttons');

  // --- the system menu opens on Start --------------------------------------
  await press(BTN.START);
  await page.waitForTimeout(700);
  const menuOpen = await page.evaluate(() =>
    !!document.querySelector('[role="dialog"], .scrim, .hh-sysmenu'));
  check(menuOpen, 'Start opens the system menu');
  await page.screenshot({ path: path.join(SHOTS, '04-menu.png') });
  await press(BTN.B);
  await page.waitForTimeout(500);
}

await browser.close();

console.log('  PASS');
for (const p of passes) console.log(`    ✔ ${p}`);
if (fails.length) {
  console.log('\n  FAIL');
  for (const f of fails) console.log(`    ✖ ${f}`);
}
console.log(`\n  ${passes.length} passed, ${fails.length} failed — shots in playthrough-pad/\n`);
process.exit(fails.length ? 1 : 0);
