/**
 * Drives the PACKAGED desktop build — the exe a Steam player runs — not the
 * dev server.
 *
 * Every other harness here opens the client in a browser. This one launches
 * release/win-unpacked/HEXHOLD.exe through Playwright's Electron driver and
 * checks the things only the shipped build can get wrong:
 *
 *   - it reaches the menu with NO network: every request that is not to the
 *     game's own 127.0.0.1 server is blocked by a dead proxy, and any attempt
 *     to make one is a failure (fonts, CDNs, analytics, anything);
 *   - the display face really is Cinzel, not a fallback serif;
 *   - the version is the real one, not `dev`;
 *   - the dev-only Sounds tab is absent and the Display settings are present;
 *   - DevTools cannot be opened;
 *   - a practice run starts against bots and plays hands;
 *   - Quit closes every HEXHOLD process, the child game server included;
 *   - saved state survives a relaunch, although the server port changes.
 *
 * With --shots it also captures 1920x1080 store screenshots into
 * steam/screenshots/raw/.
 *
 * Run: npm run package:win && node test/packaged.mjs [seconds] [--shots]
 */
import { _electron as electron } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SECONDS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 90);
const SHOTS = process.argv.includes('--shots');
const EXE = process.env.HEXHOLD_EXE
  ?? path.resolve(process.platform === 'win32'
    ? 'release/win-unpacked/HEXHOLD.exe'
    : 'release/linux-unpacked/hexhold');
const SHOT_DIR = path.resolve('steam/screenshots/raw');
// A throwaway profile, so a test run never touches a real player's save.
const USER_DATA = path.join(os.tmpdir(), `hexhold-packaged-${process.pid}`);

if (!existsSync(EXE)) {
  console.error(`No packaged build at ${EXE}. Run npm run package:win first.`);
  process.exit(2);
}
if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
rmSync(USER_DATA, { recursive: true, force: true });

const failures = [];
const notes = [];
const fail = (t) => { failures.push(t); console.log(`  ✗ ${t}`); };
const pass = (t) => { notes.push(t); console.log(`  ✓ ${t}`); };

async function start() {
  const app = await electron.launch({
    executablePath: EXE,
    // A proxy that goes nowhere: anything that is not loopback fails, which is
    // what a machine with no network looks like to the game.
    args: ['--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>'],
    env: { ...process.env, HEXHOLD_USER_DATA: USER_DATA },
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  const external = [];
  const errors = [];
  page.on('request', (r) => {
    const u = r.url();
    if (/^(https?|wss?):\/\/(127\.0\.0\.1|localhost)[:/]/.test(u)) return;
    if (/^(data|blob|chrome-extension|devtools):/.test(u)) return;
    external.push(u);
  });
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 240)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 240)); });
  return { app, page, external, errors };
}

async function skipIntro(page) {
  for (let i = 0; i < 12; i++) {
    const skip = page.locator('button:has-text("Skip")').first();
    if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); await page.waitForTimeout(600); return true; }
    await page.waitForTimeout(400);
  }
  return false;
}

async function shot(page, name) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) }).catch(() => {});
}

function hexholdProcesses() {
  if (process.platform !== 'win32') return 0;
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq HEXHOLD.exe" /FO CSV /NH', { encoding: 'utf8' });
    return out.split('\n').filter((l) => l.includes('HEXHOLD.exe')).length;
  } catch { return 0; }
}

console.log(`▶ ${EXE}`);
const before = hexholdProcesses();

// --- launch 1 ----------------------------------------------------------------
let { app, page, external, errors } = await start();

if (SHOTS) {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setFullScreen(false);
    w.unmaximize();
    w.setContentSize(1920, 1080);
    w.center();
  });
}

const menuUp = await page.locator('button', { hasText: /practice vs bots/i }).first()
  .waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
if (menuUp) pass('reached the main menu'); else fail('never reached the main menu');
await skipIntro(page);
await page.waitForTimeout(1500);

const size = await page.evaluate(() => [innerWidth, innerHeight]);
notes.push(`viewport ${size[0]}x${size[1]}`);

const font = await page.evaluate(async () => {
  await document.fonts.ready;
  return {
    cinzel: document.fonts.check('700 48px Cinzel'),
    loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')),
  };
});
if (font.cinzel && font.loaded.some((f) => /cinzel/i.test(f))) pass(`Cinzel loaded offline (${[...new Set(font.loaded)].join(', ')})`);
else fail(`display face did not load: ${JSON.stringify(font)}`);

const version = await page.locator('.menu-version').first().innerText().catch(() => '');
if (/^v\d+\.\d+\.\d+/.test(version.trim())) pass(`menu shows ${version.trim()}`);
else fail(`menu version reads "${version}"`);

const quitShown = await page.locator('button:has-text("Quit")').first().isVisible().catch(() => false);
if (quitShown) pass('Quit button is on the menu'); else fail('no Quit button on the desktop menu');
await shot(page, '01-menu');

// Settings: Sounds tab must be gone, Display settings must be there.
const settingsBtn = page.locator('button', { hasText: /^settings$/i }).first();
if (await settingsBtn.isVisible().catch(() => false)) {
  await settingsBtn.click();
  await page.waitForTimeout(600);
  const sounds = await page.locator('[role="tab"]:has-text("Sounds")').count();
  if (sounds === 0) pass('dev-only Sounds tab is absent'); else fail('Sounds tab ships in the packaged build');
  await page.locator('[role="tab"]:has-text("Video")').first().click().catch(() => {});
  await page.waitForTimeout(500);
  const modes = await page.locator('[aria-label="Display mode"] button').count();
  const vsync = await page.locator('text=VSync').count();
  if (modes === 3 && vsync > 0) pass('Video tab has display mode, window size and VSync');
  else fail(`Video tab: ${modes} display modes, vsync ${vsync}`);
  await shot(page, '00-settings-video');
  await page.locator('[role="tab"]:has-text("Controls")').first().click().catch(() => {});
  await page.waitForTimeout(400);
  const padRows = await page.locator('.hh-shortcut-row').count();
  if (padRows >= 14) pass(`Controls tab lists keyboard and controller (${padRows} rows)`);
  else fail(`Controls tab has ${padRows} rows`);
  await page.keyboard.press('Escape');
  await page.locator('button:has-text("Close")').first().click().catch(() => {});
  await page.waitForTimeout(500);
} else {
  fail('no Settings button on the menu');
}

// DevTools must not open in a shipped build, by shortcut or by API.
await page.keyboard.press('Control+Shift+I');
await page.waitForTimeout(800);
const devtools = await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  w.webContents.openDevTools();
  return new Promise((r) => setTimeout(() => r(w.webContents.isDevToolsOpened()), 800));
});
if (!devtools) pass('DevTools cannot be opened'); else fail('DevTools opened in the packaged build');

// A marker in storage, to look for after the relaunch.
await page.evaluate(() => localStorage.setItem('hexhold.packagedProbe', String(Date.now())));
const probe = await page.evaluate(() => localStorage.getItem('hexhold.packagedProbe'));
const port1 = await page.evaluate(() => location.port);

// --- play --------------------------------------------------------------------
await page.locator('button', { hasText: /practice vs bots/i }).first().click().catch(() => {});
await skipIntro(page);
const atTable = await page.locator('.felt').first().waitFor({ state: 'visible', timeout: 30_000 })
  .then(() => true).catch(() => false);
if (atTable) pass('a practice run started at the table'); else fail('practice run never reached a table');

const t0 = Date.now();
let turns = 0;
const seen = new Set();
const taken = new Set();
while (atTable && Date.now() - t0 < SECONDS * 1000) {
  const phase = await page.evaluate(() => {
    if (document.querySelector('.gameover')) return 'gameover';
    if (document.querySelector('.shop')) return 'shop';
    if (document.querySelector('.showdown')) return 'showdown';
    if (document.querySelector('.stackview')) return 'stack';
    const s = document.querySelector('.board-street');
    return s ? s.textContent.trim().toLowerCase() : 'betting';
  }).catch(() => 'unknown');
  seen.add(phase);
  const want = { flop: '03-flop', turn: '04-turn', river: '05-river', showdown: '06-showdown', stack: '07-spell-stack', shop: '08-market', gameover: '09-gameover' }[phase];
  if (want && !taken.has(want)) {
    taken.add(want);
    await page.waitForTimeout(phase === 'shop' ? 1200 : 700);
    await shot(page, want);
  }
  if (phase === 'gameover') break;

  const letResolve = page.locator('button:has-text("Let it resolve")').first();
  if (await letResolve.isVisible().catch(() => false)) { await letResolve.click().catch(() => {}); continue; }

  const done = page.locator('.shop button:has-text("Done")').first();
  if (await done.isVisible().catch(() => false)) {
    const buy = page.locator('.shopcard button:not([disabled])').first();
    if (await buy.isVisible().catch(() => false)) { await buy.click().catch(() => {}); await page.waitForTimeout(600); }
    await done.click().catch(() => {});
    await page.waitForTimeout(500);
    continue;
  }

  const fold = page.locator('.ab-buttons button:has-text("Fold")').first();
  if (await fold.isVisible().catch(() => false)) {
    turns += 1;
    if (turns === 1) await shot(page, '02-your-turn');
    const castable = page.locator('.sigil.is-castable').first();
    if (turns % 3 === 0 && await castable.isVisible().catch(() => false)) {
      await castable.click().catch(() => {});
      await page.waitForTimeout(700);
      const hint = page.locator('.tbl-targethint').first();
      if (await hint.isVisible().catch(() => false)) {
        if (!taken.has('10-targeting')) { taken.add('10-targeting'); await shot(page, '10-targeting'); }
        const c = page.locator('.board-cards [data-card-id], .rail [data-card-id], [data-seat-id]').first();
        await c.click().catch(() => {});
        await page.waitForTimeout(400);
        const cancel = page.locator('.tbl-targethint button').filter({ hasText: /cancel/i }).first();
        if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
      }
      const opt = page.locator('.prompt-rank, .prompt-suit, .prompt-mark').first();
      if (await opt.isVisible().catch(() => false)) await opt.click().catch(() => {});
      continue;
    }
    const call = page.locator('.ab-buttons button').filter({ hasText: /^(Check|Call)/ }).first();
    if (await call.isVisible().catch(() => false)) await call.click().catch(() => {});
    else await fold.click().catch(() => {});
    await page.waitForTimeout(350);
    continue;
  }
  await page.waitForTimeout(250);
}
if (turns > 0) pass(`played ${turns} turns; phases seen: ${[...seen].join(', ')}`);
else if (atTable) fail('never got a turn at the table');

// The pause menu, by Escape, as a player reaches it.
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
await shot(page, '11-menu-overlay');

if (external.length) fail(`made ${external.length} non-local request(s): ${[...new Set(external)].slice(0, 5).join(', ')}`);
else pass('no request left the machine');
const realErrors = errors.filter((e) => !/favicon|DevTools/i.test(e));
if (realErrors.length) fail(`console/page errors: ${realErrors.slice(0, 4).join(' | ')}`);
else pass('no console or page errors');

// --- quit through the game's own button ---------------------------------------
const quit = page.locator('button:has-text("Quit")').first();
const closed = app.waitForEvent('close', { timeout: 15_000 }).then(() => true).catch(() => false);
if (await quit.isVisible().catch(() => false)) await quit.click().catch(() => {});
else await app.evaluate(({ app: a }) => a.quit()).catch(() => {});
if (await closed) pass('Quit closed the app'); else { fail('app did not close on Quit'); await app.close().catch(() => {}); }
await new Promise((r) => setTimeout(r, 2500));
const after = hexholdProcesses();
if (after <= before) pass('no HEXHOLD process left running (game server child included)');
else fail(`${after - before} HEXHOLD process(es) still running after Quit`);

// --- launch 2: does the save survive a new port? -------------------------------
({ app, page, external, errors } = await start());
await page.locator('button', { hasText: /practice vs bots/i }).first()
  .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(800);
const port2 = await page.evaluate(() => location.port);
const probe2 = await page.evaluate(() => localStorage.getItem('hexhold.packagedProbe'));
const introAgain = await page.locator('button:has-text("Skip")').first().isVisible().catch(() => false);
if (probe2 === probe) pass(`saved state survived a relaunch (port ${port1} -> ${port2})`);
else fail(`saved state lost on relaunch (port ${port1} -> ${port2}): ${probe2} != ${probe}`);
if (!introAgain) pass('intro not shown again on the second launch'); else fail('intro shown again on relaunch');
await app.close().catch(() => {});

rmSync(USER_DATA, { recursive: true, force: true });
console.log(`\n${notes.length} passed, ${failures.length} failed`);
for (const n of notes.filter((x) => x.startsWith('viewport'))) console.log(`  ${n}`);
process.exit(failures.length ? 1 : 0);
