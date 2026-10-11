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
 *   - saved state survives a relaunch, although the server port changes;
 *   - a key deleted in one session does not come back when a later launch
 *     lands on a port an earlier one used (the shell clears stale storage).
 *
 * The game runs muted, off-screen and unfocusable (HEXHOLD_TEST_OFFSCREEN), so
 * the harness can run while someone is using the machine.
 *
 * With --shots it also captures 1920x1080 store screenshots into
 * steam/screenshots/raw/.
 *
 * Run: npm run package:win && node test/packaged.mjs [seconds] [--shots]
 *
 * Linux, headless (no display at all, so nothing can appear): run
 * scripts/linux-smoke.sh in WSL or on any x64 Linux. It copies
 * release/linux-unpacked and runs this harness with HEXHOLD_EXE pointing at
 * it and HEXHOLD_EXTRA_ARGS="--no-sandbox --ozone-platform=headless" plus
 * SwiftShader GL (the script says why). HEXHOLD_BUILD=release-demo/linux-unpacked
 * runs it against the Next Fest demo instead.
 */
import { _electron as electron } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import os from 'node:os';

const SECONDS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 90);
const SHOTS = process.argv.includes('--shots');
const EXE = process.env.HEXHOLD_EXE
  ?? path.resolve(process.platform === 'win32'
    ? 'release/win-unpacked/HEXHOLD.exe'
    : 'release/linux-unpacked/hexhold');
const SHOT_DIR = path.resolve('steam/screenshots/raw');
const HEADLESS = /--ozone-platform=headless/.test(process.env.HEXHOLD_EXTRA_ARGS ?? '');
// Window content size for a headless run, e.g. HEXHOLD_TEST_SIZE=1920x1080.
const HEADLESS_SIZE = (process.env.HEXHOLD_TEST_SIZE ?? '1280x800').split('x').map(Number);
// The solo button: "Practice vs Bots" in the full game, "Play the Demo" in the
// Next Fest demo (release-demo/). HEXHOLD_EXPECT_DEMO=1 says which build this
// run is meant to be testing, so the wrong one is a failure, not a pass.
const PLAY = /practice vs bots|play the demo/i;
const EXPECT_DEMO = process.env.HEXHOLD_EXPECT_DEMO === '1';
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

/**
 * The environment for the game. ELECTRON_RUN_AS_NODE must not leak through:
 * anything launched from inside VS Code (an extension host, a terminal agent)
 * inherits it as 1, which makes HEXHOLD.exe run as plain Node and die with
 * "bad option: --remote-debugging-port".
 */
function launchEnv(port) {
  const env = {
    ...process.env,
    HEXHOLD_USER_DATA: USER_DATA,
    HEXHOLD_TEST_OFFSCREEN: '1',
    HEXHOLD_PORT: String(port),
  };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

/**
 * Two ports the OS says are free, held together so they cannot be the same.
 * The harness picks the game's port itself so the relaunch checks are
 * deterministic: a new port when it tests that the save survives one, and an
 * old port when it tests that stale storage cannot return.
 */
function freePorts(n) {
  return new Promise((resolve, reject) => {
    const probes = [];
    const ports = [];
    const next = () => {
      if (ports.length === n) {
        let open = probes.length;
        for (const p of probes) p.close(() => { if (--open === 0) resolve(ports); });
        return;
      }
      const p = net.createServer();
      p.on('error', reject);
      p.listen(0, '127.0.0.1', () => { ports.push(p.address().port); probes.push(p); next(); });
    };
    next();
  });
}

async function start(port) {
  const app = await electron.launch({
    executablePath: EXE,
    // A proxy that goes nowhere: anything that is not loopback fails, which is
    // what a machine with no network looks like to the game. Chromium bypasses
    // proxies for loopback by default, so the game's own server still answers.
    // (Do NOT add --proxy-bypass-list=<-loopback>: that rule *removes* the
    // loopback bypass and the game cannot reach its own server.)
    args: [
      '--proxy-server=http://127.0.0.1:9',
      '--mute-audio',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      // Extra switches for the platform, space-separated. The Linux smoke run
      // in WSL uses "--no-sandbox --ozone-platform=headless": no setuid
      // sandbox helper on a copied folder, and no display at all, so nothing
      // can appear on the desktop.
      ...(process.env.HEXHOLD_EXTRA_ARGS ?? '').split(' ').filter(Boolean),
    ],
    env: launchEnv(port),
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:\d+\//, { timeout: 30_000 }).catch(() => {});
  if (HEADLESS) {
    // Headless Ozone has a small virtual screen, and the off-screen x:10000
    // the shell uses for tests puts the window outside it, where nothing can
    // be clicked. With no display there is nobody to hide from: put the
    // window on the virtual screen, at a Steam Deck's 1280x800 by default.
    // (page.setViewportSize is not used: it would pin the layout and hide
    // the page zoom that UI scale applies.)
    await app.evaluate(({ BrowserWindow }, [sw, sh]) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setPosition(0, 0);
      w.setContentSize(sw, sh);
    }, HEADLESS_SIZE).catch(() => {});
  }
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
  if (process.platform !== 'win32') {
    // Every process of the build runs the build's own binary: the shell, its
    // renderers and helpers, and the game server it forks.
    try {
      return Number(execSync(`pgrep -fc -- ${JSON.stringify(EXE)}`, { encoding: 'utf8' }).trim()) || 0;
    } catch { return 0; } // pgrep exits 1 when nothing matches
  }
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq HEXHOLD.exe" /FO CSV /NH', { encoding: 'utf8' });
    return out.split('\n').filter((l) => l.includes('HEXHOLD.exe')).length;
  } catch { return 0; }
}

console.log(`▶ ${EXE}`);
const before = hexholdProcesses();
const [PORT_A, PORT_B] = await freePorts(2);

// --- launch 1 ----------------------------------------------------------------
let { app, page, external, errors } = await start(PORT_A);

if (SHOTS) {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setFullScreen(false);
    w.unmaximize();
    w.setContentSize(1920, 1080);
    w.setPosition(10000, 0); // stay off-screen
  });
}

const menuUp = await page.locator('button', { hasText: PLAY }).first()
  .waitFor({ state: 'visible', timeout: 30_000 }).then(() => true).catch(() => false);
if (menuUp) pass('reached the main menu'); else fail('never reached the main menu');

// Before any click or key: the shell's autoplay policy lets audio start, so
// the title screen has music (the game itself is muted by --mute-audio).
const audioState = await page.evaluate(async () => {
  const c = new AudioContext();
  await new Promise((r) => setTimeout(r, 200));
  const s = c.state;
  await c.close();
  return s;
}).catch((e) => String(e));
if (audioState === 'running') pass('audio may start before any input (title music plays at launch)');
else fail(`audio is held until a gesture: AudioContext is "${audioState}"`);
await skipIntro(page);
await page.waitForTimeout(1500);

const isDemo = await page.locator('button', { hasText: /play the demo/i }).first().isVisible().catch(() => false);
if (isDemo !== EXPECT_DEMO) {
  fail(`meant to test the ${EXPECT_DEMO ? 'demo' : 'full game'} but launched the ${isDemo ? 'demo' : 'full game'}`);
} else if (isDemo) {
  // The demo's own menu (test/demo.mjs checks it in depth in a browser). The
  // Wishlist button is only looked at: pressing it opens the real browser.
  const covens = await page.locator('.menu-coven').count();
  const locked = await page.locator('.menu-coven.is-locked').count();
  const wish = await page.locator('.menu-actions button:has-text("Wishlist on Steam")').first().isVisible().catch(() => false);
  if (covens === 7 && locked === 4 && wish) pass('demo menu: 3 covens open, 4 locked, Wishlist on Steam shown');
  else fail(`demo menu: ${covens} covens, ${locked} locked, wishlist button ${wish ? 'shown' : 'missing'}`);
}

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
if (/^v\d+\.\d+\.\d+/i.test(version.trim())) pass(`menu shows ${version.trim()}`);
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

// Store screenshots read better without first-run hint toasts on them.
if (SHOTS) {
  await page.evaluate(() => localStorage.setItem('hexhold.hints.seen', JSON.stringify(Object.fromEntries(
    ['response_window', 'castable_sigil', 'shop_open', 'holdem', 'mana', 'sigils', 'stack', 'deck', 'hands', 'shop', 'coven']
      .map((k) => [k, true]),
  ))));
}

// A marker in storage, to look for after the relaunch.
await page.evaluate(() => localStorage.setItem('hexhold.packagedProbe', String(Date.now())));
const probe = await page.evaluate(() => localStorage.getItem('hexhold.packagedProbe'));
const port1 = await page.evaluate(() => location.port);

// --- play --------------------------------------------------------------------
await page.locator('button', { hasText: PLAY }).first().click().catch(() => {});
await skipIntro(page);
const atTable = await page.locator('.felt').first().waitFor({ state: 'visible', timeout: 30_000 })
  .then(() => true).catch(() => false);
if (atTable) pass('a practice run started at the table'); else fail('practice run never reached a table');

const t0 = Date.now();
let turns = 0;
const seen = new Set();
const taken = new Set();
let lastFrame = Date.now();
let frame = 0;
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
  // Extra frames to choose store screenshots from.
  if (SHOTS && Date.now() - lastFrame > 12_000) {
    lastFrame = Date.now();
    await shot(page, `t${String(++frame).padStart(2, '0')}-${phase.replace(/[^a-z]/g, '') || 'table'}`);
  }

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

// The pause menu, by Escape, as a player reaches it. Solo practice pauses.
await page.keyboard.press('Escape');
await page.waitForTimeout(700);
const pausedText = await page.locator('.hh-menu-sub').first().innerText().catch(() => '');
const ledger1 = await page.locator('.log, [class*="ledger"]').first().innerText().catch(() => '');
await page.waitForTimeout(6000);
const ledger2 = await page.locator('.log, [class*="ledger"]').first().innerText().catch(() => '');
if (/paused/i.test(pausedText) && ledger1 === ledger2) pass('the menu pauses a solo table (nothing moved for 6s)');
else fail(`menu did not pause: "${pausedText.slice(0, 60)}", ledger ${ledger1 === ledger2 ? 'still' : 'moved'}`);
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
({ app, page, external, errors } = await start(PORT_B));
await page.locator('button', { hasText: PLAY }).first()
  .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(800);
const port2 = await page.evaluate(() => location.port);
const probe2 = await page.evaluate(() => localStorage.getItem('hexhold.packagedProbe'));
const introAgain = await page.locator('button:has-text("Skip")').first().isVisible().catch(() => false);
// On the same port this would only prove Chromium's per-origin storage, not
// the save file, so equal ports are a failure rather than a pass.
if (port1 === port2) fail(`relaunch reused port ${port1}, so it did not test the save file`);
else if (probe2 === probe) pass(`saved state survived a relaunch (port ${port1} -> ${port2})`);
else fail(`saved state lost on relaunch (port ${port1} -> ${port2}): ${probe2} != ${probe}`);
if (!introAgain) pass('intro not shown again on the second launch'); else fail('intro shown again on relaunch');

// UI scale above 125% (Settings > Video): the shell applies it as the page
// zoom, capped so the layout never drops under its 1024x680 minimum.
{
  await page.evaluate(() => localStorage.setItem('hexhold.uiScale', '2'));
  await page.waitForTimeout(2200); // the preload's flush writes the save file
  await page.reload();
  await page.locator('button', { hasText: PLAY }).first()
    .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(600);
  const z = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor());
  const [cw, ch] = await page.evaluate(() => [innerWidth, innerHeight]);
  const win = { w: Math.round(cw * z), h: Math.round(ch * z) };
  const want = Math.max(1, Math.min(2, Math.floor(Math.min(win.w / 1024, win.h / 680) * 100) / 100));
  if (Math.abs(z - want) < 0.011 && cw >= 1023 && ch >= 679) {
    pass(`UI scale 200% applied as page zoom ${z.toFixed(2)} on a ${win.w}x${win.h} window: laid out at ${cw}x${ch}`);
  } else {
    fail(`UI scale: zoom ${z} (wanted ${want}) on ${win.w}x${win.h}, layout ${cw}x${ch}`);
  }
  await page.evaluate(() => localStorage.setItem('hexhold.uiScale', '1'));
  await page.waitForTimeout(2200);
}

// Delete the marker in this session, the way a profile reset deletes keys,
// and give the preload's 1.5 s flush time to write the save file.
await page.evaluate(() => localStorage.removeItem('hexhold.packagedProbe'));
await page.waitForTimeout(2500);
await app.close().catch(() => {});

// --- launch 3: the first launch's port comes back --------------------------------
// Chromium still holds launch 1's storage for 127.0.0.1:PORT_A, marker
// included. Before 2026-10-09 the preload seeded on top of it, the marker came
// back and the next flush wrote it into the save for good.
({ app, page, external, errors } = await start(PORT_A));
await page.locator('button', { hasText: PLAY }).first()
  .waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});
await page.waitForTimeout(800);
const port3 = await page.evaluate(() => location.port);
const probe3 = await page.evaluate(() => localStorage.getItem('hexhold.packagedProbe'));
if (port3 !== port1) fail(`launch 3 was meant to reuse port ${port1} but got ${port3}`);
else if (probe3 === null) pass(`a key deleted on port ${port2} stayed deleted when port ${port1} came back`);
else fail(`a deleted key came back from port ${port1}'s old storage: ${probe3}`);
await app.close().catch(() => {});

rmSync(USER_DATA, { recursive: true, force: true });
console.log(`\n${notes.length} passed, ${failures.length} failed`);
for (const n of notes.filter((x) => x.startsWith('viewport'))) console.log(`  ${n}`);
process.exit(failures.length ? 1 : 0);
