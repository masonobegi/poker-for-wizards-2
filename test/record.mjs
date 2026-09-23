/**
 * Record a game you can actually watch.
 *
 * `npm run play` drives the table as fast as it will go, which is the right
 * speed for catching regressions and the wrong speed for seeing what the bots
 * are doing. This plays the same game slowly and saves a video.
 *
 * The slowing is server-side, via `HEXHOLD_PACE` (percent; 100 is normal).
 * That multiplies every scheduled beat — bot deliberation, the deal, street
 * changes, the payout hold — so the whole table stays in proportion instead of
 * one part crawling while another snaps. The default here is 300, which puts
 * roughly half a second to a second between actions.
 *
 * IMPORTANT: the pace is read by the SERVER, so it has to be set on the server
 * process, not on this one. Either:
 *
 *     HEXHOLD_PACE=300 npm run dev        (then, in another shell)
 *     npm run record
 *
 * or let this script tell you it is running at normal speed and re-run.
 *
 * Your own seat is played for you — check or call, and cast a sigil when one
 * is castable — because somebody has to act for the hand to move. Everything
 * you are watching for (bot betting, spells, counterspells, showdowns, the
 * market) is the bots.
 *
 * Run: npm run record [seconds] [width] [height]
 * Out: recordings/<timestamp>/hexhold-<timestamp>.mp4
 *
 * To review it as stills rather than by scrubbing — which is how the showdown
 * panel was found sitting on top of the board — pull a frame every few
 * seconds:
 *
 *     ffmpeg -i recordings/<stamp>/hexhold-<stamp>.mp4 -vf fps=1/3 frames/f%03d.png
 *
 * At `fps=1/3` a three-minute game is about 60 images, which is roughly one
 * per action at HEXHOLD_PACE=300 and small enough to flick through.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:5173/';
const SECONDS = Number(process.argv[2] ?? 180);
const WIDTH = Number(process.argv[3] ?? 1280);
const HEIGHT = Number(process.argv[4] ?? 800);

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = path.join('recordings', stamp);
fs.mkdirSync(OUT, { recursive: true });

const log = (m) => console.log(`  ${m}`);

// --- is the server actually slowed down? ------------------------------------
let pace = null;
try {
  const health = await fetch(URL.replace(/:\d+\/?$/, ':3001') + '/health').then((r) => r.json());
  pace = health.pace ?? null;
} catch { /* health is optional */ }

console.log(`\n▶ recording ${SECONDS}s at ${WIDTH}x${HEIGHT} → ${OUT}`);
if (pace === null) log('server pace unknown — if this looks fast, see the header of this file');
else if (pace === 100) log('NOTE: the server is at normal speed. Restart it with HEXHOLD_PACE=300 to slow the game down.');
else log(`server pace ${pace}% of normal`);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
});
const page = await ctx.newPage();

page.on('pageerror', (e) => log(`page error: ${String(e).slice(0, 120)}`));

await page.goto(URL, { waitUntil: 'domcontentloaded' });

// Skip the first-run intro if it appears.
for (let i = 0; i < 24; i++) {
  const skip = page.locator('button:has-text("Skip")').first();
  if (await skip.isVisible().catch(() => false)) { await skip.click().catch(() => {}); break; }
  await page.waitForTimeout(250);
}
await page.waitForTimeout(600);

const practice = page.locator('button', { hasText: /practice vs bots/i }).first();
for (let i = 0; i < 60 && !(await practice.isEnabled().catch(() => false)); i++) {
  await page.waitForTimeout(250);
}
await practice.click().catch(() => {});

// Wait for a real table rather than a fixed sleep — the server refuses room
// creation past its per-IP hourly limit, and that should say so plainly.
let joined = false;
for (let i = 0; i < 40; i++) {
  joined = await page.evaluate(() => !!window.__hexholdView).catch(() => false);
  if (joined) break;
  await page.waitForTimeout(250);
}
if (!joined) {
  log('never reached a table — the server may have refused the room (per-IP hourly limit)');
  await ctx.close();
  await browser.close();
  process.exit(1);
}

log('at the table — playing your seat, watching the bots');

const t0 = Date.now();
let hands = 0;
let lastHand = -1;

while (Date.now() - t0 < SECONDS * 1000) {
  try {
    const state = await page.evaluate(() => {
      const v = window.__hexholdView;
      if (!v) return null;
      const me = v.players.find((p) => p.isYou);
      return { phase: v.phase, hand: v.handNumber, yourTurn: v.yourTurn, out: !!me?.eliminated };
    }).catch(() => null);

    if (state && state.hand !== lastHand) {
      lastHand = state.hand;
      hands++;
      log(`hand ${state.hand}`);
    }
    if (state?.out) { log('knocked out — stopping'); break; }
    if (state?.phase === 'gameover') { log('game over'); await page.waitForTimeout(4000); break; }

    // The market: buy nothing, just move on so the run continues.
    const done = page.locator('button', { hasText: /^(done|leave the market|continue)/i }).first();
    if (await done.isVisible().catch(() => false)) {
      await page.waitForTimeout(1200);
      await done.click().catch(() => {});
      await page.waitForTimeout(600);
      continue;
    }

    if (state?.yourTurn) {
      // Cast when something is castable, so spells appear in the recording.
      const castable = page.locator('.sigil.is-castable').first();
      if (await castable.isVisible().catch(() => false) && Math.random() < 0.45) {
        await castable.click().catch(() => {});
        await page.waitForTimeout(900);

        const hint = page.locator('.tbl-targethint').first();
        if (await hint.isVisible().catch(() => false)) {
          const text = await hint.innerText().catch(() => '');
          const wants = /choose two cards/i.test(text) ? 2 : 1;
          const player = /choose an opponent/i.test(text);
          for (let pick = 0; pick < wants; pick++) {
            const tries = player
              ? [page.locator('[data-seat-id]').first()]
              : [
                page.locator('.board-cards [data-card-id]').nth(pick),
                page.locator('.rail [data-card-id]').nth(pick),
                page.locator('[data-card-id]').nth(pick),
              ];
            let picked = false;
            for (const c of tries) {
              if (await c.isVisible().catch(() => false)) { await c.click().catch(() => {}); picked = true; break; }
            }
            if (!picked) break;
            await page.waitForTimeout(600);
          }
        }
        const prompt = page.locator('.prompt-rank, .prompt-suit, .prompt-mark').first();
        if (await prompt.isVisible().catch(() => false)) {
          await page.waitForTimeout(700);
          await prompt.click().catch(() => {});
          await page.waitForTimeout(600);
        }
        // Never leave targeting armed: the action bar is hidden while it is.
        for (let i = 0; i < 3; i++) {
          const still = page.locator('.tbl-targethint').first();
          if (!await still.isVisible().catch(() => false)) break;
          await still.locator('button').filter({ hasText: /cancel/i }).first().click().catch(() => {});
          await page.waitForTimeout(400);
        }
        continue;
      }

      // A beat before acting, so your own turn is readable too.
      await page.waitForTimeout(500);
      const call = page.locator('.ab-buttons button').filter({ hasText: /^(Check|Call)/ }).first();
      const fold = page.locator('.ab-buttons button').filter({ hasText: /^Fold/ }).first();
      if (await call.isVisible().catch(() => false)) await call.click().catch(() => {});
      else if (await fold.isVisible().catch(() => false)) await fold.click().catch(() => {});
      await page.waitForTimeout(400);
      continue;
    }

    await page.waitForTimeout(300);
  } catch {
    await page.waitForTimeout(400);
  }
}

log(`${hands} hands in ${Math.round((Date.now() - t0) / 1000)}s`);

// The video is only finalised on close.
await ctx.close();
await browser.close();

const files = fs.readdirSync(OUT).filter((f) => f.endsWith('.webm'));
if (files.length === 0) {
  console.log('\n  no video was written — check that the run reached the table\n');
  process.exit(1);
}

// Playwright names the file after an internal page hash. Give it a name that
// says what it is, and hand over an mp4 when ffmpeg is around, because that
// is what opens on a double-click.
const webm = path.join(OUT, `hexhold-${stamp}.webm`);
fs.renameSync(path.join(OUT, files[0]), webm);
let final = webm;

try {
  const mp4 = webm.replace(/[.]webm$/, '.mp4');
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-i', webm,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-pix_fmt', 'yuv420p',
    mp4,
  ], { stdio: 'inherit' });
  fs.unlinkSync(webm);
  final = mp4;
} catch {
  log('ffmpeg not found — leaving the webm (Chrome, Edge and VLC all play it)');
}

const mb = (fs.statSync(final).size / 1048576).toFixed(1);
console.log(`\n  ${final}  (${mb} MB)\n`);
