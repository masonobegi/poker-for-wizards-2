/**
 * How long Quit takes, on the PACKAGED build, from the press to the last
 * HEXHOLD process gone.
 *
 * One packaged-harness run on 2026-10-09 saw Quit take over 15 seconds. This
 * measures it on its own, in the places a player quits from:
 *   - the main menu's Quit;
 *   - the pause menu's Quit at a practice table, mid-hand;
 *   - the pause menu's Quit while a spell is on the stack (response window).
 * Each is timed in two parts: the press (Playwright's click until it lands)
 * and the shutdown (click landed until the Electron process exits). Then the
 * process table is checked for anything left, the forked game server
 * included.
 *
 * Hidden and muted: HEXHOLD_TEST_OFFSCREEN (off-screen, unfocusable, muted)
 * on Windows; on Linux pass HEXHOLD_EXTRA_ARGS="--no-sandbox
 * --ozone-platform=headless" with no DISPLAY.
 *
 * Each quit is timed by pid, from inside the app (getAppMetrics plus the
 * forked server), so the clock stops when the game's own processes are gone.
 *
 * Run: node test/quit.mjs [rounds]    (default 3 rounds of each place)
 * Fails if any quit leaves a game process alive QUIT_MAX_MS after the press,
 * or anything named HEXHOLD running 3 seconds after that.
 *
 * 2026-10-09, before electron/shutdown.cjs: 0 of 9 under 3s; every process
 * gone 4.3 to 12.5s after the press (the window itself went in ~150ms).
 */
import { _electron as electron } from 'playwright';
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const ROUNDS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 3);
const QUIT_MAX_MS = 3000;
const EXE = process.env.HEXHOLD_EXE
  ?? path.resolve(process.platform === 'win32' ? 'release/win-unpacked/HEXHOLD.exe' : 'release/linux-unpacked/hexhold');
const EXTRA = (process.env.HEXHOLD_EXTRA_ARGS ?? '').split(' ').filter(Boolean);
const HEADLESS = EXTRA.includes('--ozone-platform=headless');
const USER_DATA_ROOT = path.join(os.tmpdir(), `hexhold-quit-${process.pid}`);
let launches = 0;

if (!existsSync(EXE)) { console.error(`No packaged build at ${EXE}`); process.exit(2); }

function processes() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq HEXHOLD.exe" /FO CSV /NH', { encoding: 'utf8' });
      return out.split('\n').filter((l) => l.includes('HEXHOLD.exe')).length;
    }
    return Number(execSync(`pgrep -fc -- ${JSON.stringify(EXE)}`, { encoding: 'utf8' }).trim()) || 0;
  } catch { return 0; }
}

const freePort = () => new Promise((resolve, reject) => {
  const s = net.createServer();
  s.on('error', reject);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

async function launch() {
  // A fresh profile every launch: quitting mid-run leaves a table the next
  // launch would rejoin instead of showing the menu.
  const userData = path.join(USER_DATA_ROOT, String(++launches));
  const env = { ...process.env, HEXHOLD_USER_DATA: userData, HEXHOLD_TEST_OFFSCREEN: '1', HEXHOLD_PORT: String(await freePort()) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: EXE,
    args: ['--mute-audio', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', ...EXTRA],
    env,
    timeout: 60_000,
  });
  const page = await app.firstWindow();
  if (HEADLESS) {
    await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0];
      w.setPosition(0, 0);
      w.setContentSize(1280, 800);
    }).catch(() => {});
  }
  await page.locator('button', { hasText: /practice vs bots/i }).first().waitFor({ state: 'visible', timeout: 45_000 });
  for (let i = 0; i < 8; i++) {
    const skip = page.locator('button:has-text("Skip")').first();
    if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); break; }
    await page.waitForTimeout(250);
  }
  return { app, page };
}

/** Reach a practice table; with `stack`, wait for a spell on the stack. */
async function toTable(page, stack) {
  await page.locator('button', { hasText: /practice vs bots/i }).first().click();
  await page.locator('.ab-buttons, .ab-idle').first().waitFor({ timeout: 30_000 });
  if (!stack) { await page.waitForTimeout(1500); return true; }
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (await page.locator('.stackview').first().isVisible().catch(() => false)) return true;
    const call = page.locator('.ab-buttons button:has-text("Check"), .ab-buttons button:has-text("Call")').first();
    if (await call.isVisible().catch(() => false)) await call.click().catch(() => {});
    await page.waitForTimeout(200);
  }
  return false;
}

/**
 * Every process that is the game: the Electron main process, its Chromium
 * children (renderer, GPU, network, audio) and the forked game server. Taken
 * by pid from inside the app, so the clock stops when the GAME is gone, not
 * when the cmd.exe that Playwright wraps an Electron launch in on Windows
 * gets round to exiting (seconds later on a loaded machine).
 */
async function gamePids(app) {
  const list = await app.evaluate(({ app: a }) => [
    { pid: process.pid, type: 'main' },
    ...a.getAppMetrics().filter((m) => m.pid !== process.pid)
      .map((m) => ({ pid: m.pid, type: (m.serviceName ?? m.type).replace(/\.mojom\.\w+$/, '').toLowerCase() })),
  ]);
  const main = list[0].pid;
  const known = new Set(list.map((q) => q.pid));
  try {
    const out = process.platform === 'win32'
      ? execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ParentProcessId=${main}').ProcessId"`, { encoding: 'utf8' })
      : execSync(`pgrep -P ${main}`, { encoding: 'utf8' });
    for (const tok of out.split(/\s+/)) {
      const pid = Number(tok);
      if (pid && !known.has(pid)) { known.add(pid); list.push({ pid, type: 'server' }); }
    }
  } catch { /* no children found */ }
  return list;
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

async function quitFrom(where) {
  const before = processes();
  const { app, page } = await launch();
  let reached = true;
  if (where !== 'menu') {
    reached = await toTable(page, where === 'stack');
    await page.keyboard.press('Escape');
    await page.locator('.hh-menu-actions').first().waitFor({ timeout: 10_000 });
  }
  const quit = where === 'menu'
    ? page.locator('button', { hasText: /^quit$/i }).first()
    : page.locator('.hh-menu-actions button', { hasText: /^quit$/i }).first();
  const pids = await gamePids(app);
  const gone = {};
  let t0 = 0;
  const poll = setInterval(() => {
    if (!t0) return;
    for (const q of pids) if (!(q.pid in gone) && !alive(q.pid)) gone[q.pid] = Date.now() - t0;
  }, 20);
  t0 = Date.now();
  let pressMs = null;
  let clickError = '';
  await quit.click({ timeout: 20_000 }).then(() => { pressMs = Date.now() - t0; }).catch((e) => { clickError = String(e).split('\n')[0]; });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline && pids.some((q) => !(q.pid in gone))) await new Promise((r) => setTimeout(r, 50));
  clearInterval(poll);
  const allGone = pids.every((q) => q.pid in gone);
  if (!allGone) await app.close().catch(() => {});
  // Anything still running a moment later is a leak (Steam would still show
  // the game as running): wait up to 3s for the count to fall back.
  let left = processes() - before;
  for (let i = 0; i < 30 && left > 0; i++) { await new Promise((r) => setTimeout(r, 100)); left = processes() - before; }
  const byType = pids.map((q) => `${q.type} ${gone[q.pid] ?? '>30000'}`).join(', ');
  return {
    where,
    reached,
    pressMs,
    windowMs: gone[pids.find((q) => q.type === 'tab')?.pid] ?? null,
    exitMs: allGone ? Math.max(...pids.map((q) => gone[q.pid])) : null,
    byType,
    left,
    clickError,
  };
}

rmSync(USER_DATA_ROOT, { recursive: true, force: true });
console.log(`▶ ${EXE}  (${ROUNDS} rounds, limit ${QUIT_MAX_MS}ms)`);
const results = [];
for (let r = 0; r < ROUNDS; r++) {
  for (const where of ['menu', 'table', 'stack']) {
    const res = await quitFrom(where);
    results.push(res);
    console.log(`  ${where.padEnd(6)} press ${res.pressMs ?? '-'}ms, window gone ${res.windowMs ?? '-'}ms, every process gone ${res.exitMs ?? '>30000'}ms, left ${res.left}${res.reached ? '' : ' (no spell reached the stack)'}${res.clickError ? `, click: ${res.clickError}` : ''}`);
    console.log(`         ${res.byType}`);
  }
}
rmSync(USER_DATA_ROOT, { recursive: true, force: true });

const bad = results.filter((r) => r.pressMs === null || r.exitMs === null || r.exitMs > QUIT_MAX_MS || r.left > 0);
const worst = Math.max(...results.map((r) => r.exitMs ?? Infinity));
console.log(`\n${results.length - bad.length} of ${results.length} quits had every game process gone within ${QUIT_MAX_MS}ms of the press; slowest ${worst}ms`);
process.exit(bad.length ? 1 : 0);
