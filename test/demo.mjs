/**
 * The Next Fest demo, seen in a real browser: headless, muted, off-screen.
 *
 * `test/demo.test.ts` proves the server enforces the demo. This proves what a
 * Next Fest player sees: the menu (three covens open and four locked while
 * the picker exists, COVEN_CHOICE; no covens with it off), a
 * run that ends after DEMO_ANTES antes on the wishlist screen, and a bust
 * that says who did it. It serves the built demo (`npm run build:demo`) from
 * its own server on a free port, so it never touches dist/ or a dev server.
 *
 * Two runs, at a quick pace (HEXHOLD_PACE): one that folds everything it
 * cannot check (it should survive to the wishlist screen), and one that goes
 * all in every hand (it should bust and be told by whom). Screenshots go to
 * --out (default demo-shots/). Fails on a console error, a missing control,
 * an unlocked coven that should be locked, or a run that never ends.
 *
 * Run: npm run build:demo && node test/demo.mjs [--out dir] [--size 1280x800]
 */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { launch } from './browser.mjs';
import { covenChoice, freePort } from './ports.mjs';

const args = process.argv.slice(2);
const arg = (name, d) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(arg('--out', 'demo-shots'));
const [W, H] = arg('--size', '1280x800').split('x').map(Number);
const RUN_LIMIT_MS = Number(arg('--limit', 420000));
mkdirSync(OUT, { recursive: true });

if (!existsSync('dist-server-demo/index.mjs') || !existsSync('dist-demo/index.html')) {
  console.error('no demo build: run `npm run build:demo` first');
  process.exit(2);
}

// HEXHOLD_PORT_RANGE keeps the server inside a range on a shared machine.
const port = await freePort();
// The picker can be off (COVEN_CHOICE): then the menu shows no covens at all.
const PICKER = covenChoice();
const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', CLIENT_DIR: path.resolve('dist-demo'), HEXHOLD_PACE: '30' };
delete env.ELECTRON_RUN_AS_NODE;
const server = spawn(process.execPath, ['dist-server-demo/index.mjs'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
// Never leave the server behind, however this script ends.
process.on('exit', () => { try { server.kill(); } catch { /* gone */ } });
process.on('uncaughtException', (e) => { console.error(e); process.exit(1); });
const URL = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${URL}ready`)).ok) break; } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 100));
}

const problems = [];
const notes = [];
const fail = (s) => { if (!problems.includes(s)) problems.push(s); };

const browser = await launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => {});
}

async function visible(page, sel) {
  return page.locator(sel).first().isVisible().catch(() => false);
}

async function clickIf(page, sel) {
  const el = page.locator(sel).first();
  if (await el.isVisible().catch(() => false) && await el.isEnabled().catch(() => false)) {
    await el.click({ timeout: 800 }).catch(() => {});
    return true;
  }
  return false;
}

/** The end screen's wishlist button has to be on screen without scrolling. */
async function wishlistAboveFold(page, tag) {
  const box = await page.locator('.gameover-actions button:has-text("Wishlist on Steam")').first().boundingBox().catch(() => null);
  if (!box) fail(`${tag}: no wishlist button on the end screen`);
  else if (box.y + box.height > H) fail(`${tag}: the end screen's wishlist button is below the fold (${Math.round(box.y + box.height)} of ${H})`);
}

/** Play one run to its end. `style` is 'fold' (survive) or 'shove' (bust). */
async function playRun(page, style, tag) {
  const t0 = Date.now();
  let marketShot = false;
  let tableShot = false;
  while (Date.now() - t0 < RUN_LIMIT_MS) {
    if (await visible(page, '.gameover-panel')) break;
    await clickIf(page, '.hint-mark__dismiss');

    if (await visible(page, 'button:has-text("Done")')) {
      if (!marketShot) { await page.waitForTimeout(600); await shot(page, `${tag}-market`); marketShot = true; }
      await clickIf(page, 'button:has-text("Done")');
      await page.waitForTimeout(300);
      continue;
    }
    if (await visible(page, '.stackview button:has-text("Pass")')) {
      await clickIf(page, '.stackview button:has-text("Pass")');
      continue;
    }
    if (await visible(page, '.ab-buttons')) {
      if (!tableShot) { await shot(page, `${tag}-table`); tableShot = true; }
      const bar = '.ab-buttons button';
      if (style === 'shove') {
        if (!(await clickIf(page, `${bar}:has-text("All In")`))
          && !(await clickIf(page, `${bar}:has-text("Call")`))) await clickIf(page, `${bar}:has-text("Check")`);
        // All in asks for a second press.
        await page.waitForTimeout(150);
        if (await visible(page, '.ab-confirm')) await clickIf(page, `${bar}:has-text("All In")`);
      } else if (!(await clickIf(page, `${bar}:has-text("Check")`))) {
        await clickIf(page, `${bar}:has-text("Fold")`);
        await page.waitForTimeout(150);
        if (await visible(page, '.ab-confirm')) await clickIf(page, `${bar}:has-text("Fold")`);
      }
      await page.waitForTimeout(250);
      continue;
    }
    await page.waitForTimeout(250);
  }
  const over = await visible(page, '.gameover-panel');
  if (!over) { fail(`${tag}: no game-over panel after ${RUN_LIMIT_MS / 1000}s`); await shot(page, `${tag}-stuck`); return null; }
  // Let the panel's entrance finish before reading or capturing it.
  await page.waitForTimeout(2200);
  await shot(page, `${tag}-end`);
  const text = await page.locator('.gameover-panel').innerText().catch(() => '');
  notes.push(`${tag}: ended after ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  return text;
}

const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error' && !/favicon/i.test(m.text())) fail(`console: ${m.text().slice(0, 200)}`);
});
page.on('pageerror', (e) => fail(`page error: ${String(e).slice(0, 200)}`));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await shot(page, '01-boot');
await clickIf(page, 'button:has-text("Skip intro")');
await page.waitForTimeout(1200);
await shot(page, '02-menu');

// ---- the menu --------------------------------------------------------------
const covens = await page.locator('.menu-coven').count();
const locked = await page.locator('.menu-coven.is-locked').count();
if (PICKER) {
  if (covens !== 7) fail(`menu shows ${covens} covens, expected 7`);
  if (locked !== 4) fail(`menu locks ${locked} covens, expected 4`);
} else if (covens !== 0) {
  fail(`the coven picker is off (COVEN_CHOICE) but the menu shows ${covens} covens`);
}
for (const gone of ['Daily Rite', 'Host a Table', 'Join with a Code']) {
  if (await visible(page, `button:has-text("${gone}")`)) fail(`the demo menu still offers "${gone}"`);
}
if (!(await visible(page, 'button:has-text("Play the Demo")'))) fail('no "Play the Demo" button');
if (!(await visible(page, '.menu-actions button:has-text("Wishlist on Steam")'))) fail('no wishlist button on the menu');
// The two buttons the demo exists for are on screen without scrolling.
for (const label of ['Play the Demo', 'Wishlist on Steam']) {
  const box = await page.locator(`.menu-actions button:has-text("${label}")`).first().boundingBox().catch(() => null);
  if (!box || box.y + box.height > H) fail(`"${label}" is below the fold at ${W}x${H}`);
}
// Everything else on the menu can be scrolled to (it could not, at 1280x800,
// until 2026-10-10: the menu clipped instead of scrolling).
await page.mouse.move(W / 2, H / 2);
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(80); }
await page.waitForTimeout(300);
await shot(page, '02b-menu-scrolled');
const settings = await page.locator('.menu button:has-text("Settings")').first().boundingBox().catch(() => null);
if (!settings || settings.y + settings.height > H || settings.y < 0) fail('Settings cannot be scrolled onto the screen');
for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, -400); await page.waitForTimeout(80); }
await page.waitForTimeout(300);

// A locked coven is marked, says what it is when pointed at, and cannot be picked.
if (PICKER) {
  const lockedName = (await page.locator('.menu-coven.is-locked .menu-coven__name').first().innerText().catch(() => '')).trim();
  if (await page.locator('.menu-coven.is-locked .menu-coven__lock').count() !== 4) fail('the locked covens carry no lock');
  await page.locator('.menu-coven.is-locked').first().hover().catch(() => {});
  await page.waitForTimeout(200);
  const peek = await page.locator('.menu-covenpeek').first().innerText().catch(() => '');
  if (!/full game/i.test(peek)) fail('pointing at a locked coven does not say it is in the full game');
  else notes.push(`locked coven hover: ${peek}`);
  await page.locator('.menu-coven.is-locked').first().click().catch(() => {});
  if (await page.locator('.menu-coven.is-locked[aria-checked="true"]').count()) fail(`locked coven ${lockedName} could be picked`);
  await page.locator('.menu-coven', { hasText: 'The Twinned' }).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await shot(page, '03-menu-twinned');
}

// The wishlist button opens the store, in a new tab, and leaves the game alone.
const [popup] = await Promise.all([
  ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null),
  page.locator('.menu-actions button:has-text("Wishlist on Steam")').first().click().catch(() => {}),
]);
if (!popup) fail('the menu wishlist button opened nothing');
else {
  await popup.waitForLoadState('commit', { timeout: 4000 }).catch(() => {});
  const u = popup.url();
  notes.push(`menu wishlist opens ${u}`);
  if (!/store\.steampowered\.com/.test(u)) fail(`wishlist opened ${u}`);
  await popup.close().catch(() => {});
}
if (!(await visible(page, 'button:has-text("Play the Demo")'))) fail('the menu was lost after pressing Wishlist');

// ---- run 1: fold to the end, which should survive ---------------------------
await clickIf(page, 'button:has-text("Play the Demo")');
await page.waitForTimeout(1500);
const survived = await playRun(page, 'fold', '10-survive');
if (survived !== null) {
  if (!/demo ends here/i.test(survived)) fail('a survived demo run does not say the demo ends there');
  if (!/In the full game/i.test(survived)) fail('no "In the full game" block on the demo end screen');
  // The pitch may only promise what the full game holds.
  if (!PICKER && /covens/i.test(survived)) fail('the demo end screen promises covens the full game does not offer');
  if (!(await visible(page, '.gameover-actions button:has-text("Wishlist on Steam")'))) fail('no wishlist button on the end screen');
  await wishlistAboveFold(page, 'survive');
  if (!(await visible(page, 'button:has-text("Play the demo again")'))) fail('no "Play the demo again" button');
}

// ---- run 2: shove every hand, which should bust ----------------------------
await clickIf(page, 'button:has-text("Play the demo again")');
await page.waitForTimeout(1500);
const busted = await playRun(page, 'shove', '20-bust');
if (busted !== null) {
  if (/demo ends here/i.test(busted)) notes.push('the shove run survived all three antes (no bust line to check)');
  else if (!(await visible(page, '.gameover-bust'))) fail('a bust says nothing about who did it');
  // A run the phylactery caught shows two lines (the bust that ended it and
  // the one the phylactery broke on), so read them all, not one.
  else notes.push(`bust line: ${(await page.locator('.gameover-bust').allInnerTexts()).join(' | ').replace(/\s+/g, ' ')}`);
  await wishlistAboveFold(page, 'bust');
}

await browser.close();
server.kill();

console.log(`\nDemo at ${W}x${H}, screenshots in ${OUT}`);
for (const n of notes) console.log(`  · ${n}`);
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`);
  for (const p of problems) console.log(`  ✗ ${p}`);
  if (/error/i.test(serverLog)) console.log(`\nserver log tail:\n${serverLog.slice(-1500)}`);
  process.exit(1);
}
console.log('\nall demo checks passed');
