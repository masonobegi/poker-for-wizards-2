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
import { launch } from './browser.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
const SHOTS = path.resolve('playthrough-pad');
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const fails = [];
const passes = [];
const check = (ok, text) => (ok ? passes : fails).push(text);

const browser = await launch({ headless: true });
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

// Wait for the app to actually be there, rather than for a fixed 2.5s and a
// hope. On a loaded machine — a CI box, or a laptop already running the rest
// of this suite — React had not always finished mounting by then, so the
// first press landed before anything was listening for it and three unrelated
// checks downstream failed with it. The check below still fails for real if
// the app never enters controller mode; it just no longer fails because the
// app was slow to arrive.
await page.waitForSelector('button', { state: 'visible', timeout: 30000 });
await page.waitForTimeout(600);

// --- the pad is noticed ------------------------------------------------------
let padMode;
for (let attempt = 0; attempt < 6; attempt++) {
  await press(BTN.DOWN);
  padMode = await page.evaluate(() => document.documentElement.dataset.gamepad);
  if (padMode === '1') break;
  await page.waitForTimeout(400);
}
check(padMode === '1', 'pressing a button puts the app into controller mode');

// --- navigation moves focus --------------------------------------------------
const first = await focused();
check(!!first, `a direction press focuses something (${first?.text ?? 'nothing'})`);

// --- the intro can be dismissed on a pad ------------------------------------
const introOpen = await page.locator('text=/skip/i').first().isVisible().catch(() => false);
if (introOpen) {
  // Walk to Skip and press A.
  let dismissed = false;
  // Alternating axes, because focus moves geometrically here and Skip sits in
  // the panel's top corner — pressing only DOWN can walk past it forever. And
  // the disappearance is polled rather than checked once, because the panel
  // leaves on an animation.
  for (let i = 0; i < 20 && !dismissed; i++) {
    const f = await focused();
    if (f && /skip/i.test(f.text)) {
      await press(BTN.A);
      for (let w = 0; w < 6 && !dismissed; w++) {
        await page.waitForTimeout(250);
        dismissed = !(await page.locator('text=/skip/i').first().isVisible().catch(() => false));
      }
      break;
    }
    await press(i % 3 === 2 ? BTN.RIGHT : BTN.DOWN);
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

  // --- the UI pass's controls, on the pad (added 2026-10-22) ---------------
  // The rules tab, the deck census, arming and casting a sigil, the Market's
  // shelf: all arrived or changed in the 2026-10-17..19 UI pass, and nothing
  // had pressed them with a pad. Each is reached the way a player would:
  // press toward it until it has focus, then press A.
  const aimAt = async (selector, tries = 40) => {
    let best = Infinity;
    let stale = 0;
    let flip = false;
    for (let i = 0; i < tries; i++) {
      const got = await page.evaluate((sel) => {
        const t = document.querySelector(sel);
        const f = document.activeElement;
        if (!t || !(t instanceof HTMLElement)) return { none: true };
        if (f && (f === t || t.contains(f))) return { done: true };
        const a = t.getBoundingClientRect();
        const b = f && f !== document.body ? f.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
        return { dx: (a.left + a.width / 2) - (b.left + b.width / 2), dy: (a.top + a.height / 2) - (b.top + b.height / 2) };
      }, selector);
      if (got.none) return false;
      if (got.done) return true;
      // The bigger gap first, the way a player aims. When two presses in a
      // row bring it no closer (a control in the way keeps winning, or the
      // row wraps), switch axis for a while, as a player would go round.
      const dist = Math.abs(got.dx) + Math.abs(got.dy);
      if (dist < best - 4) { best = dist; stale = 0; } else if (++stale >= 2) { flip = !flip; stale = 0; }
      const horiz = (Math.abs(got.dx) > Math.abs(got.dy)) !== flip;
      await press(horiz ? (got.dx > 0 ? BTN.RIGHT : BTN.LEFT) : (got.dy > 0 ? BTN.DOWN : BTN.UP));
    }
    return false;
  };
  /** Mark the first button inside `scope` whose text matches, so aimAt can find it. */
  const tagButton = (scope, re) => page.evaluate(([s, src]) => {
    for (const el of document.querySelectorAll('[data-hx-aim]')) el.removeAttribute('data-hx-aim');
    const rx = new RegExp(src, 'i');
    const b = [...document.querySelectorAll(`${s} button`)].find((x) => rx.test(x.textContent || '') && !x.disabled);
    if (b) b.setAttribute('data-hx-aim', '1');
    return !!b;
  }, [scope, re.source]);
  const clearOverlays = async () => {
    for (let w = 0; w < 4; w++) {
      const busy = await page.evaluate(() => !!document.querySelector('[role="dialog"], .scrim, .hh-sysmenu'));
      if (!busy) return;
      await press(BTN.B);
      await page.waitForTimeout(300);
    }
  };

  /* A spell on the stack opens a modal panel and the pad is scoped to it, as
     it should be; the table's own controls are for when nothing is resolving. */
  const waitCalm = async (ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const busy = await page.evaluate(() => !!document.querySelector('.stack-panel, [role="dialog"], .scrim, .showdown'));
      if (!busy) return true;
      await page.waitForTimeout(300);
    }
    return false;
  };

  await clearOverlays();
  await waitCalm();
  const rulesTab = '.tbl-sidetab:nth-of-type(2)';
  if (await page.locator('.tbl-sidetab').count()) {
    const onIt = await aimAt(rulesTab);
    if (onIt) await press(BTN.A);
    const open = await page.evaluate(() => /rules/i.test(document.querySelector('.tbl-sidetab.is-on')?.textContent ?? ''));
    check(onIt && open, 'the rules tab can be reached and opened on the pad');
  }

  // Bots cast often, and a spell landing mid-walk takes the pad's scope (as
  // it should), so try again once it has resolved. B is only pressed on an
  // open census: on the table B is Escape, which opens the system menu and
  // pauses a solo game.
  if (await page.locator('.deck-hit').count()) {
    let deckOk = false;
    for (let attempt = 0; attempt < 5 && !deckOk; attempt++) {
      await clearOverlays();
      await waitCalm();
      if (!(await aimAt('.deck-hit'))) continue;
      await press(BTN.A);
      await page.waitForTimeout(300);
      if (!(await page.locator('.deck.is-open').count())) continue;
      await page.screenshot({ path: path.join(SHOTS, '05-deck.png') });
      await press(BTN.B);
      await page.waitForTimeout(300);
      deckOk = (await page.locator('.deck.is-open').count()) === 0;
    }
    check(deckOk, 'the deck census opens on the pad, and B puts it away');
  }
  await clearOverlays();

  // A castable sigil has tabindex 0. Wait for one on our turn, then A arms it
  // (a targetless sigil asks for a second press) and A again casts it, or a
  // targeted one opens its prompt, which B cancels.
  let castNote = 'no castable sigil came up';
  for (let i = 0; i < 240; i++) {
    const usable = await page.locator('.rail .sigil[tabindex="0"]').count();
    // Most sigils wait for the flop: on our turn with nothing castable, check
    // or call (A) so the hand moves on to a street where one is.
    if (!usable && i % 4 === 3 && await tagButton('.ab-buttons', /^(check|call)/)) {
      if (await aimAt('[data-hx-aim]', 12)) await press(BTN.A);
    }
    // A sigil you can only answer with shows up while a spell resolves; this
    // is about casting on your own turn, so wait for the table to be calm.
    if (usable && await page.locator('.stack-panel').count()) { await page.waitForTimeout(500); continue; }
    if (usable) {
      const onIt = await aimAt('.rail .sigil[tabindex="0"]');
      // A spell landing mid-walk, or the sigil going out of its window, is the
      // table moving on, not the pad failing: look again.
      if (!onIt && (await page.locator('.stack-panel').count() || !(await page.locator('.rail .sigil[tabindex="0"]').count()))) { await page.waitForTimeout(500); continue; }
      if (!onIt) { castNote = 'could not reach a castable sigil'; check(false, `a sigil can be cast on the pad (${castNote})`); break; }
      const before = await page.locator('.rail .sigil').count();
      await press(BTN.A);
      await page.waitForTimeout(250);
      const armed = await page.evaluate(() => /again to cast/i.test(document.querySelector('.rail')?.textContent ?? ''));
      const prompted = await page.locator('.prompt, .tbl-targethint').count() > 0;
      if (armed) await press(BTN.A);
      await page.waitForTimeout(900);
      const cast = (await page.locator('.stack-panel').count()) > 0 || (await page.locator('.rail .sigil').count()) < before;
      if (prompted && !cast) { await press(BTN.B); await page.waitForTimeout(300); }
      castNote = cast ? (armed ? 'armed, then cast' : 'cast') : prompted ? 'its target prompt opened' : 'nothing happened';
      check(cast || prompted, `a sigil can be cast on the pad (${castNote})`);
      break;
    }
    await page.waitForTimeout(500);
  }
  if (castNote === 'no castable sigil came up') console.log('  (skipped: no castable sigil came up)');
  await page.screenshot({ path: path.join(SHOTS, '06-cast.png') });

  // The Market: fold until it opens (LB folds; twice when a check is free),
  // buy something on the shelf, and leave with Done.
  await clearOverlays();
  let shop = false;
  const until = Date.now() + 300000;
  while (Date.now() < until && !shop) {
    shop = await page.locator('.shop-panel, .shop').count() > 0;
    if (shop) break;
    if (await page.locator('.ab-buttons button:has-text("Fold")').first().isVisible().catch(() => false)) {
      await press(BTN.LB); await page.waitForTimeout(150); await press(BTN.LB);
    }
    await page.waitForTimeout(600);
  }
  if (shop) {
    await page.waitForTimeout(1200);
    // A bought ware locks (both relics, for a pick-one), so a purchase shows as
    // fewer buy buttons that still work. A relic or the mana upgrade, because a
    // sigil is refused while the hand is full, which is the game, not the pad.
    const open = () => page.locator('.shopcard button:not([disabled])').count();
    const before = await open();
    const fits = await page.evaluate(() => {
      for (const el of document.querySelectorAll('[data-hx-aim]')) el.removeAttribute('data-hx-aim');
      const card = [...document.querySelectorAll('.shopcard')].find((c) =>
        /relic|attunement|rite/i.test(c.querySelector('.shopcard-kind')?.textContent ?? '')
        && c.querySelector('button:not([disabled])'));
      card?.querySelector('button:not([disabled])')?.setAttribute('data-hx-aim', '1');
      return !!card;
    });
    let bought = false;
    if (fits && await aimAt('[data-hx-aim]', 40)) {
      await press(BTN.A);
      for (let w = 0; w < 8 && !bought; w++) { await page.waitForTimeout(250); bought = (await open()) < before; }
    } else if (!fits) {
      console.log('  (nothing affordable on the shelf but sigils)');
    }
    await page.screenshot({ path: path.join(SHOTS, '07-market.png') });
    const done = (await tagButton('.shop-panel, .shop', /^done$/)) && await aimAt('[data-hx-aim]', 40);
    if (done) await press(BTN.A);
    let left = false;
    for (let w = 0; w < 20 && !left; w++) { await page.waitForTimeout(500); left = (await page.locator('.shop-panel, .shop').count()) === 0; }
    check(bought, 'something on the Market shelf can be bought on the pad');
    check(done && left, 'Done leaves the Market on the pad');
  } else {
    console.log('  (skipped: the Market did not open within 5 minutes)');
  }

  // --- the system menu opens on Start --------------------------------------
  // The hand may have carried the table into the Market or a showdown panel
  // by now, and an overlay that is already up swallows Start. Clear whatever
  // is there first, so this checks what it says it checks rather than
  // occasionally reporting that Start is broken when the screen was busy.
  for (let w = 0; w < 4; w++) {
    const busy = await page.evaluate(() =>
      !!document.querySelector('[role="dialog"], .scrim, .hh-sysmenu, .shop'));
    if (!busy) break;
    await press(BTN.B);
    await page.waitForTimeout(400);
  }

  await press(BTN.START);
  // Polled: the menu arrives on a spring, and a single fixed wait was the
  // difference between this passing and failing on a busy machine.
  let menuOpen = false;
  for (let w = 0; w < 8 && !menuOpen; w++) {
    await page.waitForTimeout(250);
    menuOpen = await page.evaluate(() =>
      !!document.querySelector('[role="dialog"], .scrim, .hh-sysmenu'));
  }
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
