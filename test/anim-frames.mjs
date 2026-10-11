/**
 * Films the arcade moments frame by frame, off-screen, and times the frames.
 *
 * The animations ported from the basketball roguelike (plans/ANIM-PORT.md)
 * are short — a slam lands in 180ms, an impact frame is gone in 130 — so a
 * screenshot every few hundred ms says nothing about them. This records every
 * frame the compositor produces (CDP screencast) for each moment, writes them
 * as numbered JPEGs named by milliseconds since the trigger, and measures the
 * page's own frame pacing while the moment plays.
 *
 * It plays a real hand first (for the pot pop and the showdown count-up), then
 * disconnects and STAGES the rare moments by writing the view the server
 * would have sent — a bust, a counter, a purchase, a relic firing, an
 * impossible hand, the end of a run. Staging needs the page opened with
 * `?harness` (see the bottom of src/store/net.ts); nothing else exposes it.
 *
 * Silent and out of sight either way (FIX_BRIEF rules):
 *  - default: headless Chromium, muted. Software-rendered, and capped near
 *    30fps on this machine even with nothing moving, so its pacing numbers
 *    only compare one moment against the idle table.
 *  - ELECTRON=1: the real desktop shell with the GPU, in the test mode
 *    electron/main.cjs already has (HEXHOLD_TEST_OFFSCREEN: off every display,
 *    never focusable, never in the taskbar, muted, still rendering) and its
 *    own throwaway user-data folder, so the player's save is never touched.
 *    These are the pacing numbers that mean something.
 *  - CPU=4 adds a 4x CPU throttle, as a stand-in for a Steam Deck's slower
 *    cores. There is no GPU throttle; a Deck's GPU is weaker than this PC's.
 *
 * Run:  PORT=3417 npm start           (built client; in another shell)
 *       HEXHOLD_URL=http://localhost:3417/ node test/anim-frames.mjs [out-dir]
 *       RM=1 ...        the same moments under reduced motion
 *       CPU=4 ...       with a 4x CPU throttle
 *       ELECTRON=1 ...  through the desktop shell, off-screen, with the GPU
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron } from 'playwright';
import { launch } from './browser.mjs';

const URL = (process.env.HEXHOLD_URL ?? 'http://localhost:3001/').replace(/\/?$/, '/');
const OUT = resolve(process.argv[2] ?? 'recordings/anim-frames');
const RM = !!process.env.RM;
const CPU = Number(process.env.CPU ?? 1);
const ELECTRON = !!process.env.ELECTRON;
/** ONLY=bust,gameover films just those (the staging still runs in order). */
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;
mkdirSync(OUT, { recursive: true });

const PRESEED = () => {
  try {
    localStorage.setItem('hexhold.seenIntro', '1');
    localStorage.setItem('hexhold.hints.seen', JSON.stringify({ response_window: true, castable_sigil: true, shop_open: true }));
    if (window.__rm) localStorage.setItem('hexhold.reducedMotion', '1');
  } catch { /* */ }
};

let page;
let context;
let closeAll;
if (ELECTRON) {
  const env = {
    ...process.env,
    HEXHOLD_USER_DATA: mkdtempSync(join(tmpdir(), 'hexhold-anim-')),
    HEXHOLD_TEST_OFFSCREEN: '1',
    VITE_DEV_SERVER: `${URL}?harness`,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({
    args: [resolve(import.meta.dirname, '..'), '--mute-audio'],
    env,
    timeout: 60_000,
  });
  page = await app.firstWindow();
  context = app.context();
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    w.setFullScreen(false);
    w.unmaximize();
    w.setContentSize(1280, 800); // a Steam Deck's screen
    w.setPosition(10000, 0);     // and nowhere anyone can see it
  });
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(([fn, rm]) => { window.__rm = rm; new Function(`(${fn})()`)(); }, [PRESEED.toString(), RM]);
  await page.reload();
  closeAll = () => app.close();
} else {
  const browser = await launch({
    headless: true,
    args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
  });
  context = await browser.newContext({
    viewport: { width: 1280, height: 800 }, // a Steam Deck's screen
    reducedMotion: RM ? 'reduce' : 'no-preference',
  });
  page = await context.newPage();
  await page.addInitScript(PRESEED);
  await page.goto(`${URL}?harness`);
  closeAll = () => browser.close();
}
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const practice = page.locator('button', { hasText: /practice vs bots/i }).first();
for (let i = 0; i < 60 && !(await practice.isEnabled().catch(() => false)); i++) await page.waitForTimeout(250);
await practice.click();
await page.waitForFunction(() => window.__hexholdView?.phase && window.__hexholdView.phase !== 'lobby', null, { timeout: 30000 });
await page.waitForTimeout(1500);

const cdp = await context.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

const report = [];

/** Record every frame for `ms` after `stage()` runs, plus the page's frame pacing. */
async function film(name, stage, ms = 1500) {
  if (ONLY && !ONLY.has(name)) { await stage(); await page.waitForTimeout(ms); return; }
  const dir = join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const onFrame = (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 72, everyNthFrame: 1 });
  await page.evaluate(() => {
    const w = window;
    w.__pace = [];
    w.__stalls = [];
    w.__paceOn = true;
    let last = performance.now();
    const loop = (now) => {
      w.__pace.push(now - last);
      // When, relative to the trigger, a frame ran long: so a stall can be
      // pinned on the beat that caused it rather than on the whole moment.
      if (now - last > 40 && w.__t0) w.__stalls.push(`${Math.round(last - w.__t0)}+${Math.round(now - last)}`);
      last = now;
      if (w.__paceOn) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await page.waitForTimeout(150);
  // Main-thread work while the moment plays: layout and style passes, script.
  await cdp.send('Performance.enable').catch(() => {});
  const metrics = async () => Object.fromEntries(((await cdp.send('Performance.getMetrics').catch(() => ({ metrics: [] }))).metrics)
    .map((m) => [m.name, m.value]));
  const m0 = await metrics();
  const t0 = Date.now(); // the screencast stamps frames in wall-clock seconds
  await page.evaluate(() => { window.__t0 = performance.now(); });
  await stage();
  await page.waitForTimeout(ms);
  const m1 = await metrics();
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  const [pace, stalls] = await page.evaluate(() => {
    window.__paceOn = false;
    const out = [window.__pace.slice(2), window.__stalls];
    window.__t0 = 0;
    return out;
  });

  // Named by milliseconds since the trigger.
  frames.forEach((f, i) => {
    const at = Math.round(f.t - t0);
    writeFileSync(join(dir, `f${String(i).padStart(3, '0')}_${at >= 0 ? '+' : ''}${at}ms.jpg`), Buffer.from(f.data, 'base64'));
  });
  const sorted = [...pace].sort((a, b) => a - b);
  const p = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  const long = pace.filter((d) => d > 25).length;
  const row = {
    moment: name, frames: frames.length, rafFrames: pace.length,
    p50: +p(0.5).toFixed(1), p95: +p(0.95).toFixed(1), max: +Math.max(0, ...pace).toFixed(1), over25ms: long,
    stalls,
    layouts: (m1.LayoutCount ?? 0) - (m0.LayoutCount ?? 0),
    layoutMs: Math.round(((m1.LayoutDuration ?? 0) - (m0.LayoutDuration ?? 0)) * 1000),
    styleMs: Math.round(((m1.RecalcStyleDuration ?? 0) - (m0.RecalcStyleDuration ?? 0)) * 1000),
    scriptMs: Math.round(((m1.ScriptDuration ?? 0) - (m0.ScriptDuration ?? 0)) * 1000),
  };
  report.push(row);
  console.log(`  ${name.padEnd(14)} ${String(row.frames).padStart(4)} frames · rAF p50 ${row.p50}ms p95 ${row.p95}ms max ${row.max}ms · >25ms ${long} · layout ${row.layouts}x/${row.layoutMs}ms style ${row.styleMs}ms script ${row.scriptMs}ms${stalls.length ? ` · long frames at ${stalls.join(', ')}ms` : ''}`);
}

const view = () => page.evaluate(() => window.__hexholdView);
const fx = (events) => page.evaluate((e) => window.__hexholdFx(e), events);
/** Write a view the server could have sent: a shallow patch, players by id. */
const patch = (fn, arg) => page.evaluate(([src, a]) => {
  const store = window.__hexholdStore;
  const v = structuredClone(store.getState().view);
  // eslint-disable-next-line no-new-func
  new Function('v', 'a', src)(v, a);
  store.setState({ view: v });
}, [fn, arg]);

console.log(`▶ filming into ${OUT}${RM ? ' (reduced motion)' : ''}${CPU > 1 ? ` (CPU x${CPU})` : ''}`);

// ---- 1. a real hand: call it down, film the payout as it begins -----------
if (!process.env.SKIP_PAYOUT) {
  const deadline = Date.now() + 150000;
  let filmed = false;
  let last = (await view())?.phase;
  const seen = [last];
  while (!filmed && Date.now() < deadline) {
    const phase = (await view())?.phase;
    if (phase !== last) seen.push(phase);
    if (phase === 'payout' && last !== 'payout') {
      // The pot's coins, the +N pop and the count-up all start from here.
      await film('payout', async () => {}, 2400);
      filmed = true;
      break;
    }
    last = phase;
    // Check or call down, so hands reach a showdown with cards on it.
    const go = page.locator('.actionbar button', { hasText: /^\s*(check|call)/i }).first();
    if (await go.isEnabled({ timeout: 50 }).catch(() => false)) await go.click({ timeout: 500 }).catch(() => {});
    const letIt = page.locator('button:has-text("Let it resolve")').first();
    if (await letIt.isVisible().catch(() => false)) await letIt.click({ timeout: 500 }).catch(() => {});
    const done = page.locator('.shop button', { hasText: /^\s*done\s*$/i }).first();
    if (await done.isVisible().catch(() => false)) await done.click({ timeout: 500 }).catch(() => {});
    await page.waitForTimeout(60);
  }
  if (!filmed) console.log(`  payout: none in 150s (phases seen: ${seen.join(' > ')})`);
}

// ---- 2. stop the server talking, then stage the rare moments -------------
await page.evaluate(() => window.__hexholdStore.getState().socket?.disconnect());
// The staged half is played with the socket closed on purpose; the badge
// saying so is true and beside the point.
await page.addStyleTag({ content: '.hh-conn-pill, .hh-conn-overlay { visibility: hidden !important; }' });
await page.waitForTimeout(400);
// A spell card left lingering by the real hand would sit under everything.
await page.locator('.stackview .stack-panel').first().click({ timeout: 1000 }).catch(() => {});
await page.waitForTimeout(300);
const v0 = await view();
const me = v0.players.find((p) => p.isYou);
const bots = v0.players.filter((p) => !p.isYou);
const [a, b, c] = bots;
const myCards = me.hole.map((x) => x.id);
await patch('v.phase = "flop"; v.payout = null; for (const p of v.players) { p.result = null; p.folded = false; }');
await page.waitForTimeout(600);

// What the table costs with nothing staged, for the pacing comparison.
await film('idle', async () => {}, 1200);

await film('impossible', () => fx([
  { t: 'pot_to', playerId: a.id, amount: 4200 },
  { t: 'win', playerId: a.id, handName: 'Flush Five', impossible: true, amount: 4200 },
  { t: 'shake', power: 1 },
  { t: 'banner', text: 'FLUSH FIVE', sub: 'A hand that cannot exist', tone: 'impossible' },
]), 1700);
// Skip by clicking empty header space: Escape would open the pause menu.
await page.mouse.click(640, 30);
await page.waitForTimeout(800);

await film('ante', () => fx([{ t: 'banner', text: 'ANTE 3', sub: 'Blinds 200 / 400', tone: 'magic' }]), 1100);
await film('ante-skip', async () => { await page.waitForTimeout(150); await page.mouse.click(640, 30); }, 700);
await page.waitForTimeout(500);

await film('omen', async () => {
  await fx([{ t: 'banner', text: 'BLURRED', sub: 'A new rule, permanently', tone: 'impossible' }]);
  await patch('v.omens = [...v.omens.filter((o) => o.id !== "blurred"), { id: "blurred", ante: v.ante }]');
  await page.waitForTimeout(900);
  await page.mouse.click(640, 30); // skip: the chip lands as the banner leaves
}, 1300);
await page.waitForTimeout(400);

await patch('for (const p of v.players) p.relics = ["keepsake", "ladder", "smeared_ink"];');
await page.waitForTimeout(300);
const relicIds = await page.evaluate(() => [...document.querySelectorAll('[data-relic-id]')].map((e) => e.getAttribute('data-relic-id')));
const relic = relicIds[0];
await film('relic', () => fx([
  { t: 'relic', playerId: a.id, relicId: relic },
  { t: 'relic', playerId: me.id, relicId: relic },
]), 600);

await film('impact', () => fx([
  { t: 'burn', cardId: myCards[0] },
  { t: 'diverge', cardId: myCards[myCards.length - 1] },
]), 600);

await film('bust', async () => {
  await fx([{ t: 'eliminate', playerId: b.id }]);
  await patch('const p = v.players.find((x) => x.id === a); p.eliminated = true; p.chips = 0;', b.id);
}, 900);

await film('counter', async () => {
  await patch(`
    const e = { id: 'st1', casterId: a.c, sigilId: 'burn', targets: {}, countered: false, costPaid: 1,
      sigilName: 'Burn', casterName: a.n, school: 'ruin' };
    v.stack = { entries: [e], pending: [], closesAt: Date.now() + 8000 };
    v.stackEntries = [e];`, { c: c.id, n: c.name });
  await page.waitForTimeout(500);
  await patch('v.stackEntries = v.stackEntries.map((e) => ({ ...e, countered: true })); v.stack = { ...v.stack, entries: v.stackEntries };');
}, 1000);
await patch('v.stack = null; v.stackEntries = [];');
await page.waitForTimeout(500);

await patch(`
  v.phase = 'shop';
  v.shop = { items: [
    { kind: 'relic', id: 'smeared_ink', uid: 'i1', price: 9 },
    { kind: 'relic', id: 'ouroboros', uid: 'i2', price: 8 },
    { kind: 'relic', id: 'broken_compass', uid: 'i3', price: 8 },
  ], sold: [], rerollCost: 2, closesAt: 0 };
  const me = v.players.find((p) => p.isYou); me.shards = 20; me.shopDone = false;`);
await page.waitForTimeout(1500);
await film('market-buy', () => patch(`
  v.shop = { ...v.shop, sold: ['i2'] };
  const me = v.players.find((p) => p.isYou); me.shards = 12;`), 1000);

await film('gameover', () => patch(`
  v.phase = 'gameover'; v.shop = null; v.winnerId = v.youId;
  const me = v.players.find((p) => p.isYou); me.handsWon = 14; me.biggestPot = 18450; me.chips = 24000;`), 2000);

writeFileSync(join(OUT, 'pace.json'), JSON.stringify({ rm: RM, cpu: CPU, errors, moments: report }, null, 2));
if (errors.length) console.log(`  page errors:\n    ${errors.join('\n    ')}`);
await closeAll();
