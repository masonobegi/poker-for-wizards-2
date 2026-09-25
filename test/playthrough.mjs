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

/**
 * Anything wider than the viewport, or drawn off the left/top edge.
 *
 * Settles first. Every overlay here enters on a spring, and framer-motion's
 * `layout` animations work by applying a transform between a measured before
 * and after — so an element sampled mid-flight reports a box it never paints
 * at and never had. Measuring the shop the instant it appeared produced
 * exactly that: a board card behind an opaque backdrop, briefly claiming to
 * be 1724px wide. test/responsive.mjs already waits before the same checks,
 * which is why it sees the same screens clean at all seven resolutions.
 *
 * An element is allowed to extend past the viewport when an ancestor clips
 * it — that is what `overflow: hidden` is FOR, and several things here rely
 * on it deliberately: the omen banner's glow bar scales past 1 on the way
 * out, inside a fixed, viewport-sized, clipped container. Reporting those
 * gave a LAYOUT failure on any run where an omen happened to fire, for a
 * band that is physically incapable of reaching the edge of the screen. A
 * harness that cries wolf is a harness whose output gets skimmed.
 *
 * The document's own scroll width is checked separately, because that is the
 * ground truth for "the page actually overflows" and no per-element
 * heuristic can stand in for it.
 */
const SETTLE_MS = 600;

async function checkLayout(page, where) {
  await page.waitForTimeout(SETTLE_MS).catch(() => {});
  const bad = await page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // The visible extent of `el` after every clipping ancestor has cut it
    // down — what a player actually sees, not the raw transformed box. Same
    // helper `npm run responsive` has used since it was written; this harness
    // simply never got it.
    const clippedRect = (el) => {
      const r = el.getBoundingClientRect();
      let rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      // Stop before <body>. This app sets `body { overflow: hidden }` because
      // it is a full-screen game that does not scroll — walking into that
      // clips EVERY element to the viewport and the whole check silently
      // passes on anything. An element pushed outside the page root is the
      // defect; an element clipped by a panel inside it is not.
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
        const pr = p.getBoundingClientRect();
        rect = {
          left: Math.max(rect.left, pr.left),
          right: Math.min(rect.right, pr.right),
          top: Math.max(rect.top, pr.top),
          bottom: Math.min(rect.bottom, pr.bottom),
        };
      }
      return rect;
    };

    const doc = document.documentElement;
    if (doc.scrollWidth > doc.clientWidth + 2) {
      out.push(`the page scrolls sideways (${doc.scrollWidth} vs ${doc.clientWidth})`);
    }

    // A camera shake writes an inline transform to #root, which makes it the
    // containing block for every `position: fixed` layer in the app — so the
    // whole viewport moves, which is the entire point of a shake, and each
    // fixed layer measures a few pixels past the window while it runs. That
    // is the effect working, not a layout defect, and sampling mid-shake
    // reported `.stackview` and `.hints-layer` as running off the bottom by
    // four pixels. Geometry is only meaningful once the camera is still.
    const shakeRoot = document.getElementById('root');
    if (shakeRoot && getComputedStyle(shakeRoot).transform !== 'none') {
      return ['__shaking__'];
    }

    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // A bare "div." names nothing and cost a debugging session once
      // already. Where an element has no class of its own, walk up for the
      // nearest ancestor that does, so the report points somewhere.
      const own = (el.className || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.');
      let where = '';
      if (!own) {
        for (let p = el.parentElement, up = 1; p && up <= 3; p = p.parentElement, up++) {
          const c = (p.className || '').toString().split(' ').filter(Boolean)[0];
          if (c) { where = ` inside .${c}`; break; }
        }
      }
      const tag = `${el.tagName.toLowerCase()}${own ? `.${own}` : ''}${where}`;

      if (r.right > vw + 2 || r.left < -2 || (r.bottom > vh + 2 && cs.position === 'fixed')) {
        const c = clippedRect(el);
        // Clipped away to nothing: it paints nowhere, so it overflows nothing.
        if (c.right <= c.left || c.bottom <= c.top) continue;
        if (c.right > vw + 2 || c.left < -2) {
          out.push(`${tag} overflows horizontally (${Math.round(c.left)}..${Math.round(c.right)} vs ${vw})`);
        }
        if (c.bottom > vh + 2 && cs.position === 'fixed') {
          out.push(`${tag} fixed element runs off the bottom (${Math.round(c.bottom)} vs ${vh})`);
        }
      }
    }
    return [...new Set(out)].slice(0, 8);
  });
  // The sample landed inside a camera shake; nothing measured then is real.
  if (bad.length === 1 && bad[0] === '__shaking__') return;
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
// Wait for it rather than sampling once: the intro mounts after the first
// paint, so a single immediate check races it and reported "no intro" on a
// build where the intro was working fine.
let introVisible = false;
for (let i = 0; i < 20 && !introVisible; i++) {
  introVisible = await page.locator('text=/skip/i').first().isVisible().catch(() => false);
  if (!introVisible) await page.waitForTimeout(250);
}
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

// Wait for a real table rather than a fixed sleep, and say plainly when one
// never arrives. The most likely reason is not a bug: the server refuses room
// creation past `roomsPerIpPerHour` (40 by default), which a long session of
// repeated runs will hit. Without this check the run reports a deadlock 70
// seconds later and sends the next reader hunting a game bug that is not there.
let joined = false;
for (let i = 0; i < 40; i++) {
  joined = await page.evaluate(() => !!window.__hexholdView).catch(() => false);
  if (joined) break;
  await page.waitForTimeout(250);
}
if (!joined) {
  const refused = await page.evaluate(() => {
    const t = document.body.innerText || '';
    return /too many|rate|limit|refused|could not open/i.test(t) ? t.slice(0, 160) : null;
  }).catch(() => null);
  problem('ERROR', refused
    ? `Never reached a table — the server refused it: ${refused.replace(/\s+/g, ' ')}`
    : 'Never reached a table after clicking Practice vs Bots, and the server gave no reason.');
  await shot(page, 'never-joined');
  await finish();
}
await page.waitForTimeout(2500);
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
let sawOmenBanner = false;
let castsMade = 0;
let lastMem = 0;
const heap = [];

// Whether you ever actually won a pot. Latched page-side on its own interval:
// the payout phase can be shorter than one turn of the loop below, so polling
// it from here missed wins that the game itself saw. Without this the
// achievement check cannot tell "the watcher is broken" from "the bots had
// better cards", and it used to warn on both.
await page.evaluate(() => {
  window.__wonAPot = false;
  window.setInterval(() => {
    if (window.__wonAPot) return;
    const v = window.__hexholdView;
    if (!v?.payout) return;
    const me = v.players.find((p) => p.isYou);
    if (!me) return;
    if (v.payout.entries.some((e) => e.playerId === me.id && e.won > 0)) window.__wonAPot = true;
  }, 150);
}).catch(() => {});

// The ante break is a sequence: showdown, then the omen banner alone, then
// the Market, then its hint. It used to be all four at once, with the omen —
// the high point of a run — buried under the other three. Sampled page-side
// every 100ms, because the banner lasts three seconds and one turn of the
// loop below can take longer than that.
await page.evaluate(() => {
  window.__omenSeen = false;
  window.__omenCovered = [];
  window.setInterval(() => {
    const banner = [...document.querySelectorAll('[role="status"][aria-live="assertive"]')]
      .find((el) => /a new rule/i.test(el.textContent ?? ''));
    if (!banner || Number(getComputedStyle(banner).opacity) < 0.9) return;
    window.__omenSeen = true;
    const covering = ['.shop', '.showdown', '.hint-mark']
      .filter((sel) => document.querySelector(sel));
    for (const sel of covering) if (!window.__omenCovered.includes(sel)) window.__omenCovered.push(sel);
  }, 100);
}).catch(() => {});

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
    // Not the instant `.shop` mounts: that frame is the Market at the start
    // of its entrance, and a screenshot of a half-faded panel is how a
    // capture ends up reviewed as a colour bug.
    if (phase === 'shop' && !sawShop) { sawShop = true; await page.waitForTimeout(900); await shot(page, 'shop'); await checkLayout(page, 'shop'); }
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

  if (!sawOmenBanner && await page.evaluate(() => window.__omenSeen === true).catch(() => false)) {
    sawOmenBanner = true;
    await shot(page, 'omen-banner');
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

      // Targeted sigils ask for a target. Satisfy as many picks as the sigil
      // actually wants — `two_cards` needs two, and preflop there are no
      // community cards to click at all, so a card target has to fall back to
      // our own hand rather than to a seat.
      const hint = page.locator('.tbl-targethint').first();
      if (await hint.isVisible().catch(() => false)) {
        await shot(page, `targeting-${castsMade}`);
        const wants = /choose two cards/i.test(await hint.innerText().catch(() => '')) ? 2 : 1;
        const wantsPlayer = /choose an opponent/i.test(await hint.innerText().catch(() => ''));
        for (let pick = 0; pick < wants; pick++) {
          const candidates = wantsPlayer
            ? [page.locator('[data-seat-id]').first()]
            : [
              page.locator('.board-cards [data-card-id]').nth(pick),
              page.locator('.rail [data-card-id]').nth(pick),
              page.locator('[data-card-id]').nth(pick),
            ];
          let picked = false;
          for (const c of candidates) {
            if (await c.isVisible().catch(() => false)) {
              await c.click().catch(() => {});
              picked = true;
              break;
            }
          }
          if (!picked) break;
          await page.waitForTimeout(400);
        }
      }

      // A prompt for a rank/suit/mark.
      const promptBtn = page.locator('.prompt-rank, .prompt-suit, .prompt-mark').first();
      if (await promptBtn.isVisible().catch(() => false)) {
        await shot(page, `prompt-${castsMade}`);
        await promptBtn.click().catch(() => {});
        await page.waitForTimeout(500);
      }

      // Whatever happened above, do not leave the table in a targeting state:
      // the action bar is replaced while targeting is armed, so a half-
      // finished cast means this run never acts again and times out looking
      // like a deadlock. This was the flake, not the game.
      for (let i = 0; i < 3; i++) {
        const stillTargeting = page.locator('.tbl-targethint').first();
        if (!await stillTargeting.isVisible().catch(() => false)) break;
        const cancel = stillTargeting.locator('button').filter({ hasText: /cancel/i }).first();
        if (await cancel.isVisible().catch(() => false)) await cancel.click().catch(() => {});
        await page.waitForTimeout(350);
      }
      const strandedPrompt = page.locator('.prompt').first();
      if (await strandedPrompt.isVisible().catch(() => false)) {
        const anyOption = page.locator('.prompt-rank, .prompt-suit, .prompt-mark').first();
        if (await anyOption.isVisible().catch(() => false)) await anyOption.click().catch(() => {});
        await page.waitForTimeout(350);
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
  //
  // Being eliminated is not being stuck. Once you are out you correctly get no
  // turns and no prompts for the rest of the run, and reporting that as a
  // stuck table turned an ordinary loss into a release-blocking ERROR.
  if (Date.now() - lastAct > 70_000) {
    const now = await readState(page).catch(() => null);
    if (now?.me?.out) {
      notes.push('Knocked out — stopped acting because there was nothing left to do.');
      await shot(page, 'eliminated');
      break;
    }
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

const omenCovered = await page.evaluate(() => window.__omenCovered ?? []).catch(() => []);
if (omenCovered.length) {
  problem('ERROR', `the omen banner was covered by ${omenCovered.join(', ')} — it should have the stage to itself`);
}

async function finish() {
  finishing = true;
  // Achievements are the visible half of progression; prove they fire.
  let unlocked = [];
  let wonAPot = false;
  try {
    if (!page.isClosed()) {
      unlocked = await page.evaluate(() => {
        try { return JSON.parse(localStorage.getItem('hexhold.achievements') ?? '[]'); }
        catch { return []; }
      });
      wonAPot = await page.evaluate(() => window.__wonAPot === true).catch(() => false);
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
  console.log(`  won a pot      ${wonAPot ? 'yes' : 'no'}`);
  if (wonAPot && unlocked.length === 0) {
    problem('WARN', 'Won a pot and unlocked nothing — check the achievement watcher.');
  } else if (!wonAPot && turnsSeen > 3) {
    problem('NOTE', 'Won no pot this session, so no achievement was due — `npm test` checks the watcher deterministically.');
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
