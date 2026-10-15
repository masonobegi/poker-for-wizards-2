/**
 * The alignment audit.
 *
 * `responsive.mjs` asks whether the game FITS at a given size. This asks
 * whether it is SQUARE — whether the pieces line up with each other and with
 * the pixel grid — which is a different class of defect and one that no amount
 * of looking at screenshots reliably catches, because a thing that is two
 * pixels out looks fine in isolation and wrong next to its neighbour.
 *
 * It exists because "shit is not lined up" was a correct review of a build
 * that passed every other harness. The findings behind it were:
 *
 *   - the board rendered its cards at `md` while its empty slots were sized
 *     at `lg`, so a dealt card sat 17px higher than the socket beside it;
 *   - past five community cards the strip's children shrank below their
 *     content and the cards overlapped each other by 26px;
 *   - the action bar changed height between your turn and everyone else's, so
 *     the entire table moved fifty pixels up and down as the turn came round;
 *   - nineteen pieces of chrome sat on fractional pixels, which does not
 *     matter until you put a scanline overlay on the integer grid over the top
 *     of it, and then it is the whole screen disagreeing with itself;
 *   - and the felt's three tone bands were centred on the lamp at 44%/33%
 *     while the gold inlay, the dither ring and the rail were all concentric
 *     on 50/50 — two near-concentric ellipses with different centres, which is
 *     the most legible misalignment there is.
 *
 * Six questions, all answered from measured boxes:
 *
 *   1. does anything overlap something it must never touch?
 *   2. do the items in a row share a top, a bottom and a gap?
 *   3. is what should be centred, centred?
 *   4. do the layers stacked in one box share a centre — their boxes, the
 *      radials painted on them, and the ellipses inside their SVGs?
 *   5. does anything with a visible edge land on a fractional pixel?
 *   6. does any band of the layout change height between game states?
 *
 * Run: node test/align.mjs [width] [height]      (needs the client served)
 */
import { launch } from './browser.mjs';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
const SIZES = process.argv[2]
  ? [[Number(process.argv[2]), Number(process.argv[3] ?? 800)]]
  : [[1280, 800], [1366, 768], [1920, 1080], [1024, 680]];

/** How far off a thing may be before it counts. Half a pixel is rounding. */
const TOL = 1.5;

// ---------------------------------------------------------------------------
// In-page measurement
// ---------------------------------------------------------------------------

/** One sweep of every check. Returns findings; the driver dedupes across ticks. */
function sweep(tol) {
  const out = [];
  const R = (el) => el.getBoundingClientRect();
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight;
  };
  /** Mid-animation boxes are not defects. A transformed element is excused. */
  const still = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const t = getComputedStyle(n).transform;
      if (t && t !== 'none' && !/^matrix\(1, 0, 0, 1, (-?\d+), (-?\d+)\)$/.test(t)) return false;
    }
    return true;
  };
  const frac = (n) => Math.abs(n - Math.round(n)) > 0.02;
  const add = (kind, key, detail) => out.push({ kind, key, detail });

  // --- 1. things that must never touch --------------------------------------
  const NEVER = [
    ['.deck', '.board-cards, .board-slot'],
    ['.board-cards', '[data-seat-id], .pot, .deck'],
    ['.pot', '[data-seat-id], .board-cards'],
    ['.rail-hole', '.rail-sigils, .rail-me'],
    ['.rail-me', '.rail-sigils'],
  ];
  const hits = (a, b, pad) =>
    a.left + pad < b.right && a.right - pad > b.left && a.top + pad < b.bottom && a.bottom - pad > b.top;
  for (const [aSel, bSel] of NEVER) {
    for (const a of document.querySelectorAll(aSel)) {
      if (!vis(a) || !still(a)) continue;
      for (const b of document.querySelectorAll(bSel)) {
        if (!vis(b) || !still(b) || a === b || a.contains(b) || b.contains(a)) continue;
        const ra = R(a), rb = R(b);
        if (hits(ra, rb, 2)) {
          add('overlap', `${aSel}|${bSel}`,
            `${aSel} overlaps ${bSel} by ` +
            `${Math.round(Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left))}x` +
            `${Math.round(Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top))}`);
        }
      }
    }
  }

  // --- 2. rows ---------------------------------------------------------------
  for (const sel of ['.rail-sigils', '.board-cards', '.tbl-sidetabs', '.ab-buttons']) {
    for (const row of document.querySelectorAll(sel)) {
      if (!vis(row)) continue;
      // LAYOUT boxes, not painted ones. `getBoundingClientRect` includes every
      // transform on the element and inside it, so a sigil whose frame is
      // mid-pop reports a box 5px taller than its neighbours and the row looks
      // crooked when the layout is square. `offsetTop/Height` ignore transforms
      // entirely, which is the right question here: do these line up, not are
      // they animating.
      // Out-of-flow children are not in the row. `AnimatePresence` with
      // `popLayout` absolutely positions a child while it exits, so a card
      // being burned off the board sits wherever its exit arc has reached —
      // which reported a gap of -479px between two community cards that were
      // in fact eleven pixels apart like all the others.
      const shown = [...row.children]
        .filter(vis)
        .filter((k) => getComputedStyle(k).position !== 'absolute' && getComputedStyle(k).position !== 'fixed');
      const kids = shown.map((k) => ({
        top: k.offsetTop, bottom: k.offsetTop + k.offsetHeight,
        left: k.offsetLeft, right: k.offsetLeft + k.offsetWidth,
      }));
      if (kids.length < 2) continue;
      // (An exiting card under `AnimatePresence popLayout` is pulled out of
      // flow, so it is not in `children` and leaves no hole to mis-measure —
      // which is what reported a 314px gap between two sigils when this read
      // painted boxes and filtered the transformed ones out.)
      const whole = true;
      const dt = Math.max(...kids.map((k) => k.top)) - Math.min(...kids.map((k) => k.top));
      const db = Math.max(...kids.map((k) => k.bottom)) - Math.min(...kids.map((k) => k.bottom));
      if (dt > tol || db > tol) {
        add('row', `row${sel}`, `${sel} children differ: top by ${dt.toFixed(1)}px, bottom by ${db.toFixed(1)}px`);
      }
      const gaps = [];
      for (let i = 1; i < kids.length; i++) gaps.push(kids[i].left - kids[i - 1].right);
      const g = Math.max(...gaps) - Math.min(...gaps);
      if (whole && g > tol) add('gap', `gap${sel}`, `${sel} gaps vary by ${g.toFixed(1)}px (${gaps.map((x) => x.toFixed(1)).join(', ')})`);
    }
  }

  // --- 3. centred in something ----------------------------------------------
  for (const [aSel, bSel] of [['.pot', '.board-cards'], ['.board', '.felt-surface'], ['.showdown', '.felt']]) {
    const a = document.querySelector(aSel), b = document.querySelector(bSel);
    if (!a || !b || !vis(a) || !vis(b) || !still(a)) continue;
    const ra = R(a), rb = R(b);
    const d = (ra.left + ra.right) / 2 - (rb.left + rb.right) / 2;
    if (Math.abs(d) > tol) add('centre', `c${aSel}`, `${aSel} is ${d.toFixed(1)}px off centre in ${bSel}`);
  }

  // --- 4. concentricity ------------------------------------------------------
  // Layers stacked in one box and read as one object have to share a centre.
  for (const [refSel, layers] of [
    ['.felt', ['.felt-surface', '.felt-dither', '.felt-arcana', '.felt-rail']],
    ['.felt-surface', ['.felt-dither', '.felt-arcana']],
  ]) {
    const ref = document.querySelector(refSel);
    if (!ref || !vis(ref)) continue;
    const rr = R(ref);
    for (const sel of layers) {
      for (const el of document.querySelectorAll(sel)) {
        if (!vis(el) || !still(el)) continue;
        const r = R(el);
        const dx = (r.left + r.right) / 2 - (rr.left + rr.right) / 2;
        const dy = (r.top + r.bottom) / 2 - (rr.top + rr.bottom) / 2;
        if (Math.abs(dx) > tol || Math.abs(dy) > tol) {
          add('concentric', `b${sel}${refSel}`, `${sel} box is ${dx.toFixed(1)},${dy.toFixed(1)} off the centre of ${refSel}`);
        }
        const cs = getComputedStyle(el);
        for (const prop of ['backgroundImage', 'maskImage', 'webkitMaskImage']) {
          const v = cs[prop];
          if (!v || v === 'none') continue;
          for (const m of v.matchAll(/radial-gradient\([^)]*?\bat\s+([\d.]+)%\s+([\d.]+)%/g)) {
            if (Math.abs(Number(m[1]) - 50) > 1 || Math.abs(Number(m[2]) - 50) > 1) {
              add('concentric', `p${sel}${prop}`, `${sel} paints a radial at ${m[1]}% ${m[2]}%, not at its own centre`);
            }
          }
        }
      }
    }
  }
  // Structural SVGs only: a suit glyph is a drawing, and a club is three
  // circles that are all off-axis on purpose.
  for (const svg of document.querySelectorAll('svg[viewBox]')) {
    if (!vis(svg) || !/felt|arcana|rose|table|rail/.test(svg.getAttribute('class') ?? '')) continue;
    const [, , vw, vh] = svg.getAttribute('viewBox').split(/[\s,]+/).map(Number);
    for (const e of svg.querySelectorAll('ellipse, circle')) {
      const rx = Number(e.getAttribute('rx') ?? e.getAttribute('r') ?? 0);
      if (rx < vw * 0.2) continue;
      const cx = Number(e.getAttribute('cx') ?? 0), cy = Number(e.getAttribute('cy') ?? 0);
      if (Math.abs(cx - vw / 2) > 1 || Math.abs(cy - vh / 2) > 1) {
        add('concentric', `s${svg.getAttribute('class')}${cx}${cy}`,
          `${svg.getAttribute('class')} ellipse at ${cx},${cy} is off its viewBox centre ${vw / 2},${vh / 2}`);
      }
    }
  }

  // --- 5. the pixel grid -----------------------------------------------------
  const EDGED = '.seat-pod, .sigil-frame, .board-slot, .pot, .hx-plate, .rail, .actionbar, .tbl-top, .tbl-side, .log, .btn';
  for (const el of document.querySelectorAll(EDGED)) {
    if (!vis(el) || !still(el)) continue;
    const r = R(el);
    // A width that follows a label is correct; a HEIGHT or a POSITION that
    // lands between pixels is not.
    if (frac(r.top) || frac(r.height)) {
      add('subpixel', `sp${el.className.toString().slice(0, 30)}`,
        `${el.className.toString().slice(0, 34)} top ${r.top.toFixed(2)} height ${r.height.toFixed(2)}`);
    }
  }

  // --- 6. bands that move ----------------------------------------------------
  // Only while nothing is mid-transform: a page-transition scale of 1.003
  // rounds a 72px header to 73 and is not the band moving.
  const bands = {};
  for (const sel of ['.tbl-top', '.tbl-main', '.rail', '.actionbar']) {
    const el = document.querySelector(sel);
    if (el && vis(el) && still(el)) bands[sel] = Math.round(R(el).height);
  }
  return { out, bands };
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

/*
 * Every click in this file is bounded.
 *
 * Playwright's `click()` waits up to THIRTY SECONDS for an element to become
 * actionable, and `.catch(() => {})` swallows the timeout rather than the
 * wait. A play loop that clicks a hundred times past a button which is
 * visible but covered — a toast over the action bar, a modal mid-transition —
 * therefore takes fifty minutes and looks exactly like a hang. Three runs of
 * this harness were killed as "stuck" before anyone looked at its CPU time:
 * two seconds of it, after five minutes of waiting.
 *
 * A click in a play loop is a nudge. If it does not land in a second and a
 * half, the next iteration will try again anyway.
 */
const NUDGE = { timeout: 1500 };

const browser = await launch();
let total = 0;
let soft = 0;

for (const [W, H] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1600);
  if (await page.locator('text=/skip/i').first().isVisible().catch(() => false)) {
    const s = page.locator('button:has-text("Skip")').first();
    if (await s.isVisible().catch(() => false)) await s.click(NUDGE).catch(() => {});
    await page.waitForTimeout(400);
  }
  const practice = page.locator('button', { hasText: /practice vs bots/i }).first();
  for (let i = 0; i < 60; i++) { if (await practice.isEnabled().catch(() => false)) break; await page.waitForTimeout(250); }
  await practice.click(NUDGE).catch(() => {});
  await page.waitForTimeout(3200);

  const seen = new Map();
  /** Every height each band has ever had, so a band that moves is caught. */
  const heights = {};
  for (let r = 0; r < 26; r++) {
    const { out, bands } = await page.evaluate(sweep, TOL);
    for (const f of out) if (!seen.has(f.key)) seen.set(f.key, f);
    for (const [k, v] of Object.entries(bands)) (heights[k] ??= new Set()).add(v);

    const done = page.locator('button', { hasText: /^done$/i }).first();
    if (await done.isVisible().catch(() => false)) { await done.click(NUDGE).catch(() => {}); await page.waitForTimeout(250); continue; }
    const call = page.locator('.ab-buttons button').filter({ hasText: /^(Check|Call)/ }).first();
    if (await call.isVisible().catch(() => false)) await call.click(NUDGE).catch(() => {});
    await page.waitForTimeout(380);
  }
  for (const [band, hs] of Object.entries(heights)) {
    if (hs.size > 1) {
      seen.set(`move${band}`, {
        kind: 'moves',
        detail: `${band} is ${[...hs].sort((a, b) => a - b).join('px and ')}px in different states — everything below it moves`,
      });
    }
  }

  const all = [...seen.values()];
  // `subpixel` is advisory. A half pixel on a transient overlay's
  // content-driven height is a different severity from the table jumping fifty
  // pixels every turn, and a harness that always exits 1 is a harness nobody
  // reads. Everything else fails the run.
  const hard = all.filter((f) => f.kind !== 'subpixel');
  total += hard.length;
  soft += all.length - hard.length;
  console.log(`\n▶ ${W}x${H} — ${hard.length} finding(s)` +
    (all.length > hard.length ? `, ${all.length - hard.length} advisory` : ''));
  for (const kind of ['overlap', 'moves', 'row', 'gap', 'centre', 'concentric', 'subpixel']) {
    const list = all.filter((f) => f.kind === kind);
    if (!list.length) continue;
    console.log(`  -- ${kind} (${list.length})`);
    for (const f of list.slice(0, 14)) console.log(`     ${f.detail}`);
    if (list.length > 14) console.log(`     ...and ${list.length - 14} more`);
  }
  if (!hard.length) console.log('  ✔ square');
  await ctx.close();
}

await browser.close();
console.log(
  `\n${total === 0 ? '✔ nothing out of line' : `${total} finding(s) across ${SIZES.length} resolution(s)`}` +
  (soft ? ` (${soft} advisory sub-pixel, not failing)` : ''));
process.exit(total === 0 ? 0 : 1);
