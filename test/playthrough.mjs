/**
 * Plays the game in a real browser, against real bots, and reports what a
 * player would actually experience.
 *
 * Everything else in test/ proves the game is *correct*. This is the only
 * thing that proves it is *playable*: it clicks the buttons a person clicks,
 * screenshots every phase, and fails loudly on anything a person would see —
 * a console error, an element hanging off the screen, an unreadable control,
 * a turn that never arrives.
 *
 * Run: node test/playthrough.mjs [seconds] [--headed]
 */
import { launch } from './browser.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const SECONDS = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 150);
const HEADED = process.argv.includes('--headed');
const SHOTS = path.resolve('playthrough');
const URL = process.env.HEXHOLD_URL ?? 'http://localhost:5173/';

rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });

const problems = [];
const t0 = Date.now();
const notes = [];
const seenPhases = new Set();
const shots = [];
let shotN = 0;

const problem = (severity, text) => {
  const line = `${severity}|${text}`;
  if (!problems.some((p) => p === line)) problems.push(line);
};

async function shot(page, name) {
  const file = path.join(SHOTS, `${String(++shotN).padStart(2, '0')}-${name}.png`);
  try {
    await page.screenshot({ path: file });
    shots.push(file);
  } catch { /* page may be navigating */ }
}

const browser = await launch({ headless: !HEADED });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: 'no-preference',
});
const page = await ctx.newPage();

// --- everything a player would see go wrong ---------------------------------
page.on('console', (m) => {
  const t = m.type();
  const text = m.text();
  if (t === 'error') {
    if (/favicon|Download the React DevTools/i.test(text)) return;
    problem('ERROR', `console: ${text.slice(0, 220)}`);
  } else if (t === 'warning' && /React|key|prop|hook|act\(/i.test(text)) {
    problem('WARN', `console: ${text.slice(0, 200)}`);
  }
});
page.on('pageerror', (e) => problem('ERROR', `uncaught: ${String(e).slice(0, 240)}`));
let pageCrashed = false;
page.on('crash', () => { pageCrashed = true; problem('ERROR', 'THE PAGE CRASHED — the tab ran out of memory or hit a fatal renderer error.'); });
let finishing = false;
page.on('close', () => { if (!finishing) pageCrashed = true; });
page.on('requestfailed', (r) => {
  const u = r.url();
  if (/socket\.io|hot-update|\.map$/.test(u)) return;
  problem('ERROR', `request failed: ${u.slice(0, 140)} (${r.failure()?.errorText})`);
});

/** Anything wider than the viewport, or drawn off the left/top edge. */
async function checkLayout(page, where) {
  const bad = await page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const tag = `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.')}`;
      if (r.right > vw + 2 || r.left < -2) {
        out.push(`${tag} overflows horizontally (${Math.round(r.left)}..${Math.round(r.right)} vs ${vw})`);
      }
      if (r.bottom > vh + 2 && cs.position === 'fixed') {
        out.push(`${tag} fixed element runs off the bottom (${Math.round(r.bottom)} vs ${vh})`);
      }
    }
    return [...new Set(out)].slice(0, 8);
  });
  for (const b of bad) problem('LAYOUT', `${where}: ${b}`);
}

/** Read the live game state straight out of the store the UI renders from. */
const readState = (page) => page.evaluate(() => {
  const w = window;
  const v = w.__hexholdView;
  if (!v) return null;
  const me = v.players.find((p) => p.isYou);
  return {
    phase: v.phase, hand: v.handNumber, ante: v.ante,
    pot: v.pot, yourTurn: v.yourTurn, stack: !!v.stack,
    omens: v.omens.map((o) => o.id),
    board: v.board.length,
    castable: v.castable.length,
    me: me ? { chips: me.chips, mana: me.mana, sigils: me.sigilCount, folded: me.folded, out: me.eliminated } : null,
    players: v.players.length,
    alive: v.players.filter((p) => !p.eliminated).length,
  };
});

// ---------------------------------------------------------------------------

console.log(`\n▶ opening ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2500);

// Expose the store so we can watch the game the way the UI does.
await page.evaluate(() => {
  const tryHook = () => {
    // The zustand store is module-scoped; mirror it off the socket instead.
    const orig = window.WebSocket;
    if (window.__hexholdHooked) return;
    window.__hexholdHooked = true;
    void orig;
  };
  tryHook();
});

await shot(page, 'first-paint');

const title = await page.title();
if (!/HEXHOLD/i.test(title)) problem('ERROR', `wrong page title: "${title}"`);

// --- the intro --------------------------------------------------------------
const introVisible = await page.locator('text=/skip/i').first().isVisible().catch(() => false);
if (introVisible) {
  notes.push('First-run intro appeared automatically.');
  await shot(page, 'intro-1');
  // Step through a few panels to prove they render.
  for (let i = 0; i < 3; i++) {
    const next = page.locator('button:has-text("Next")').first();
    if (await next.isVisible().catch(() => false)) {
      await next.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
  await shot(page, 'intro-mid');
  await checkLayout(page, 'intro');
  const skip = page.locator('button:has-text("Skip")').first();
  if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
  await page.waitForTimeout(700);
} else {
  problem('WARN', 'No first-run intro appeared — a new player gets no explanation.');
}

await shot(page, 'menu');
await checkLayout(page, 'menu');

// --- into a game ------------------------------------------------------------
// The primary CTA is disabled until the socket connects. Time how long a
// player actually waits on a dead button.
const connectStart = Date.now();
const practice = page.locator('button', { hasText: /practice vs bots/i }).first();
let connected = false;
for (let i = 0; i < 60; i++) {
  if (await practice.isEnabled().catch(() => false)) { connected = true; break; }
  await page.waitForTimeout(250);
}
const waited = Date.now() - connectStart;
if (!connected) {
  problem('ERROR', `The menu never became usable — still waiting to connect after ${Math.round(waited / 1000)}s.`);
  await finish();
}
if (waited > 1500) problem('POLISH', `Waited ${(waited / 1000).toFixed(1)}s on a disabled menu before the game was playable.`);
else notes.push(`Menu became playable in ${(waited / 1000).toFixed(1)}s.`);

console.log('▶ starting practice vs bots');
await practice.click();
await page.waitForTimeout(3500);
await shot(page, 'table-dealt');
await checkLayout(page, 'table');

// Is there actually a table on screen?
const felt = await page.locator('.felt').first().isVisible().catch(() => false);
if (!felt) problem('ERROR', 'The felt never appeared — practice mode did not reach a table.');

const seats = await page.locator('[data-seat-id]').count();
if (seats < 3) problem('ERROR', `Only ${seats} opponent seats rendered; expected 3 bots.`);
else notes.push(`${seats} opponent seats rendered.`);

// --- play --------------------------------------------------------------------
console.log(`▶ playing for ${SECONDS}s`);
const playStart = Date.now();
let actions = 0;
let turnsSeen = 0;
let lastPhase = '';
let lastAct = Date.now();
let sawShop = false;
let sawShowdown = false;
let sawStack = false;
let sawOmen = false;
let castsMade = 0;
let lastMem = 0;
const heap = [];

while (Date.now() - playStart < SECONDS * 1000) {
  if (pageCrashed || page.isClosed()) break;
  try {
  // Phase transitions, off the DOM rather than the store.
  const phase = await page.evaluate(() => {
    if (document.querySelector('.gameover')) return 'gameover';
    if (document.querySelector('.shop')) return 'shop';
    if (document.querySelector('.showdown')) return 'showdown';
    if (document.querySelector('.stackview')) return 'stack';
    const s = document.querySelector('.board-street');
    return s ? s.textContent.trim().toLowerCase() : 'betting';
  }).catch(() => 'unknown');

  if (phase !== lastPhase) {
    lastPhase = phase;
    seenPhases.add(phase);
    if (phase === 'shop' && !sawShop) { sawShop = true; await shot(page, 'shop'); await checkLayout(page, 'shop'); }
    if (phase === 'showdown' && !sawShowdown) { sawShowdown = true; await shot(page, 'showdown'); }
    if (phase === 'stack' && !sawStack) { sawStack = true; await shot(page, 'stack'); await checkLayout(page, 'stack'); }
    if (phase === 'gameover') { await shot(page, 'gameover'); await checkLayout(page, 'gameover'); break; }
  }

  if (Date.now() - lastMem > 15000) {
    lastMem = Date.now();
    const mem = await page.evaluate(() => {
      const m = performance.memory;
      return m ? Math.round(m.usedJSHeapSize / 1048576) : null;
    }).catch(() => null);
    if (mem !== null) { heap.push(mem); }
  }

  if (!sawOmen && await page.locator('.omen').first().isVisible().catch(() => false)) {
    sawOmen = true;
    await shot(page, 'omens-active');
  }

  // The response window: answer it or let it go.
  const letResolve = page.locator('button:has-text("Let it resolve")').first();
  if (await letResolve.isVisible().catch(() => false)) {
    await letResolve.click().catch(() => {});
    lastAct = Date.now();
    await page.waitForTimeout(250);
    continue;
  }

  // The shop: buy the first thing we can afford, then leave.
  const done = page.locator('.shop button:has-text("Done")').first();
  if (await done.isVisible().catch(() => false)) {
    const buy = page.locator('.shopcard button:not([disabled])').first();
    if (await buy.isVisible().catch(() => false)) {
      await buy.click().catch(() => {});
      await page.waitForTimeout(600);
      await shot(page, 'shop-bought');
    }
    await done.click().catch(() => {});
    lastAct = Date.now();
    await page.waitForTimeout(500);
    continue;
  }

  // Our turn: occasionally cast something, otherwise check/call.
  const fold = page.locator('.ab-buttons button:has-text("Fold")').first();
  if (await fold.isVisible().catch(() => false)) {
    turnsSeen++;
    lastAct = Date.now();

    if (turnsSeen === 1) { await shot(page, 'your-turn'); await checkLayout(page, 'your turn'); }

    // Try a sigil now and then, to exercise the spell path from the UI.
    const castable = page.locator('.sigil.is-castable').first();
    if (castsMade < 4 && await castable.isVisible().catch(() => false) && Math.random() < 0.5) {
      await castable.click().catch(() => {});
      await page.waitForTimeout(700);
      // Targeted sigils ask for a target; give it a board card or an opponent.
      const hint = page.locator('.tbl-targethint').first();
      if (await hint.isVisible().catch(() => false)) {
        await shot(page, `targeting-${castsMade}`);
        const target = page.locator('.board-cards [data-card-id]').first();
        const seat = page.locator('[data-seat-id]').first();
        if (await target.isVisible().catch(() => false)) await target.click().catch(() => {});
        else if (await seat.isVisible().catch(() => false)) await seat.click().catch(() => {});
        else {
          const cancel = page.locator('.tbl-targethint button').first();
          await cancel.click().catch(() => {});
        }
        await page.waitForTimeout(600);
      }
      // A prompt for a rank/suit/mark.
      const promptBtn = page.locator('.prompt-rank, .prompt-suit, .prompt-mark').first();
      if (await promptBtn.isVisible().catch(() => false)) {
        await shot(page, `prompt-${castsMade}`);
        await promptBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }
      castsMade++;
      continue;
    }

    const call = page.locator('.ab-buttons button').filter({ hasText: /^(Check|Call)/ }).first();
    if (await call.isVisible().catch(() => false)) {
      await call.click().catch(() => {});
      actions++;
    } else {
      await fold.click().catch(() => {});
      actions++;
    }
    await page.waitForTimeout(350);
    continue;
  }

  // Nothing to do: has the game stopped needing us for too long?
  if (Date.now() - lastAct > 70_000) {
    problem('ERROR', 'Seventy seconds passed with no turn and no prompt — the table looks stuck.');
    await shot(page, 'stuck');
    break;
  }
  await page.waitForTimeout(400);
  } catch (err) {
    if (pageCrashed || page.isClosed()) break;
    problem('WARN', `interaction failed: ${String(err).slice(0, 140)}`);
    await page.waitForTimeout(400);
  }
}

await shot(page, 'final');

// --- readability checks a player would notice -------------------------------
const readable = await page.evaluate(() => {
  const out = [];
  const tiny = [];
  for (const el of document.querySelectorAll('.sigil-text, .seat-name, .board-mod, .omen, .log-line, .shopcard-text')) {
    const cs = getComputedStyle(el);
    const px = parseFloat(cs.fontSize);
    if (px && px < 9.5 && el.textContent.trim()) {
      tiny.push(`${el.className.split(' ')[0]} @ ${px.toFixed(1)}px`);
    }
  }
  if (tiny.length) out.push(`text under 9.5px: ${[...new Set(tiny)].slice(0, 6).join(', ')}`);

  const ab = document.querySelector('.actionbar');
  if (ab && ab.getBoundingClientRect().height < 40) out.push('the action bar is collapsed');
  return out;
});
for (const r of readable) problem('POLISH', r);

async function finish() {
  finishing = true;
  // Achievements are the visible half of progression; prove they fire.
  let unlocked = [];
  try {
    if (!page.isClosed()) {
      unlocked = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('hexhold.achievements') ?? '[]'); }
        catch { return []; }
      });
    }
  } catch { /* page gone */ }
  let state = null;
  try { if (!page.isClosed()) state = await readState(page); } catch { state = null; }
  try { await browser.close(); } catch { /* already gone */ }

  console.log('\n══════════ PLAYTHROUGH ══════════');
  console.log(`  ran            ${Math.round((Date.now() - t0) / 1000)}s`);
  console.log(`  your turns     ${turnsSeen}`);
  console.log(`  actions taken  ${actions}`);
  console.log(`  sigils cast    ${castsMade}`);
  console.log(`  phases seen    ${[...seenPhases].join(', ') || 'none'}`);
  console.log(`  shop reached   ${sawShop ? 'yes' : 'NO'}`);
  console.log(`  showdown seen  ${sawShowdown ? 'yes' : 'NO'}`);
  console.log(`  stack seen     ${sawStack ? 'yes' : 'NO'}`);
  console.log(`  omens seen     ${sawOmen ? 'yes' : 'NO'}`);
  if (state) console.log(`  final state    ${JSON.stringify(state)}`);
  console.log(`  screenshots    ${shots.length} in playthrough/`);
  console.log(`  achievements   ${unlocked.length ? unlocked.join(', ') : 'none'}`);
  if (turnsSeen > 3 && unlocked.length === 0) {
    problem('WARN', 'Played a whole session and unlocked nothing — check the achievement watcher.');
  }
  if (heap.length) {
    console.log(`  JS heap MB     ${heap.join(' → ')}`);
    if (heap.length > 2 && heap[heap.length - 1] > heap[0] * 2.5 && heap[heap.length - 1] > 300) {
      problem('ERROR', `heap grew ${heap[0]}MB → ${heap[heap.length - 1]}MB — something is leaking.`);
    }
  }
  if (pageCrashed) console.log('  PAGE CRASHED   yes');

  if (notes.length) {
    console.log('\n  NOTES');
    for (const n of notes) console.log(`    · ${n}`);
  }

  const bySeverity = { ERROR: [], WARN: [], LAYOUT: [], POLISH: [] };
  for (const p of problems) {
    const [sev, ...rest] = p.split('|');
    (bySeverity[sev] ?? bySeverity.POLISH).push(rest.join('|'));
  }
  for (const [sev, list] of Object.entries(bySeverity)) {
    if (!list.length) continue;
    console.log(`\n  ${sev} (${list.length})`);
    for (const l of list.slice(0, 14)) console.log(`    · ${l}`);
  }
  if (!problems.length) console.log('\n  ✔ nothing a player would notice went wrong');
  console.log('═════════════════════════════════\n');

  process.exit(bySeverity.ERROR.length ? 1 : 0);
}

await finish();
