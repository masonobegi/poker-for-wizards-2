#!/usr/bin/env node
/**
 * Can you actually read it, and can you actually click it?
 *
 * Every round of feedback on this game has had the same shape: something is
 * built, it is reported broken, it is fixed, and the fix ships in a state
 * nobody can read. "Even when things are fixed sometimes they are just
 * incredibly hard to read or see." That is not a taste problem, it is a
 * measurement problem — contrast and size are numbers, and nothing was
 * measuring them.
 *
 * So this walks the real game in a real browser and reports, for every
 * screen:
 *
 *   contrast   text whose colour against what is actually behind it falls
 *              under the WCAG ratio for its size. The background is resolved
 *              by walking up for the first opaque ancestor, so a label on a
 *              translucent plate is judged against the plate's real result.
 *   size       text under the floor the project already holds itself to.
 *   clipped    a box whose content is wider or taller than itself with no
 *              scrollbar, i.e. a sentence cut off mid-word.
 *   offscreen  anything outside the viewport.
 *   dead       something drawn as interactive that cannot take a click.
 *
 * It is a report, not a gate: some findings are decoration and some are the
 * arcade look doing its job. Run it, read it, fix what is real.
 *
 *   node test/legibility.mjs                 # every screen, 1600x1000
 *   node test/legibility.mjs 1280 800        # at a size
 */
import { launch } from './browser.mjs';

// BASE, or HEXHOLD_URL as the other browser harnesses take it.
const BASE = (process.env.BASE ?? process.env.HEXHOLD_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '');
const W = Number(process.argv[2] ?? 1600);
const H = Number(process.argv[3] ?? 1000);
const NUDGE = { timeout: 2000 };

/* The floors this project already holds itself to: 12px of body text, and the
   display face only at multiples of 8 (test/arcade.style.test.ts). */
const MIN_PX = 12;
/* WCAG AA: 4.5 for body, 3.0 for large text (>=24px, or >=19px bold). */
const AA_BODY = 4.5;
const AA_LARGE = 3.0;

const AUDIT = `
(() => {
  const srgb = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  const nums = (s) => s.split(/[\\s,/]+/).filter(Boolean)
    .map((t) => (t.indexOf('%') >= 0 ? parseFloat(t) / 100 : parseFloat(t)));
  const parse = (s) => {
    const str = s || '';
    const m = /rgba?\\(([^)]+)\\)/.exec(str);
    if (m) {
      const p = nums(m[1]);
      return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    }
    /* Chrome serialises color-mix() as color(srgb r g b / a) on 0-1 channels. */
    const k = /color\\(\\s*srgb\\s+([^)]+)\\)/.exec(str);
    if (k) {
      const p = nums(k[1]);
      return { rgb: [p[0] * 255, p[1] * 255, p[2] * 255], a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a));
  /** The colour actually behind this element, compositing translucent layers. */
  const behind = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (!c || c.a === 0) continue;
      stack.push(c);
      if (c.a === 1) break;
    }
    let out = [10, 8, 20]; // the app's own backdrop, if nothing opaque was found
    for (let i = stack.length - 1; i >= 0; i--) out = over(stack[i], out);
    return out;
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  const out = { contrast: [], size: [], clipped: [], offscreen: [], dead: [] };
  const seen = new Set();
  const label = (el) => {
    const cls = String(el.className || '').trim().split(/\\s+/).slice(0, 2).join('.');
    return (el.tagName.toLowerCase() + (cls ? '.' + cls : '')).slice(0, 44);
  };

  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.05) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;

    /* Does this element own a text node, rather than merely containing one?
       Only then is it the thing responsible for that text — a wrapper is not
       to blame for its children, and a card face that clips two stacked art
       layers on purpose is not cutting off a sentence. */
    const ownsText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());

    // --- clipped ---------------------------------------------------------
    const scrollsX = /auto|scroll/.test(cs.overflowX);
    const scrollsY = /auto|scroll/.test(cs.overflowY);
    const clipX = !scrollsX && cs.overflowX === 'hidden' && el.scrollWidth - el.clientWidth > 2;
    const clipY = !scrollsY && cs.overflowY === 'hidden' && el.scrollHeight - el.clientHeight > 2;
    const ell = cs.textOverflow === 'ellipsis' && el.scrollWidth - el.clientWidth > 2;
    if ((clipX || clipY || ell) && ownsText) {
      out.clipped.push({ el: label(el), by: clipX ? 'width' : clipY ? 'height' : 'ellipsis',
        over: Math.round(Math.max(el.scrollWidth - el.clientWidth, el.scrollHeight - el.clientHeight)),
        text: (el.textContent || '').trim().slice(0, 48) });
    }

    // --- offscreen -------------------------------------------------------
    if (cs.position === 'fixed' || cs.position === 'absolute' || el.closest('.app')) {
      const outBy = Math.round(Math.max(0, -r.left) + Math.max(0, r.right - innerWidth)
        + Math.max(0, -r.top) + Math.max(0, r.bottom - innerHeight));
      /* Not offscreen if something above it scrolls: the menu column is
         taller than the window on purpose and scrolls to reach the rest, so
         everything below the fold was being reported as lost. Only report
         what no amount of scrolling can bring into view. */
      let scrollable = false;
      for (let n = el.parentElement; n && !scrollable; n = n.parentElement) {
        const s2 = getComputedStyle(n);
        if (/auto|scroll/.test(s2.overflowY) && n.scrollHeight > n.clientHeight + 2) scrollable = true;
        if (/auto|scroll/.test(s2.overflowX) && n.scrollWidth > n.clientWidth + 2) scrollable = true;
      }
      if (outBy > 8 && !scrollable && (el.textContent || '').trim()) {
        out.offscreen.push({ el: label(el), by: outBy, text: (el.textContent || '').trim().slice(0, 40) });
      }
    }

    // --- dead ------------------------------------------------------------
    /* cursor inherits, so every decorative layer inside a clickable card
       reports pointer-events none and looks dead. What is actually broken is
       a thing that is ITSELF the control -- a button, or something with a
       click role -- and cannot be clicked; a child of one is fine, because
       the parent takes the click for it. */
    const isControl = el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'
      || el.tagName === 'A' || el.tagName === 'INPUT';
    const insideControl = !!el.parentElement?.closest('button,[role=button],a,input,[class*=sigil],[class*=card]');
    if (isControl && !insideControl && cs.pointerEvents === 'none') {
      out.dead.push({ el: label(el), text: (el.textContent || '').trim().slice(0, 40) });
    }

    // --- text: size and contrast ----------------------------------------
    if (!ownsText) continue;
    const text = (el.textContent || '').trim();
    if (!text) continue;
    const key = label(el) + '|' + text.slice(0, 24);
    if (seen.has(key)) continue;
    seen.add(key);

    const px = parseFloat(cs.fontSize);
    if (px < ${MIN_PX} - 0.01) out.size.push({ el: label(el), px: Math.round(px * 10) / 10, text: text.slice(0, 40) });

    const fg = parse(cs.color);
    if (!fg) continue;
    /* Gilt type paints itself: a transparent colour with the glyphs filled by
       a clipped background, or a shadow-built outline. The computed colour is
       meaningless for those, and a ratio of exactly 1 is the tell. */
    if (fg.a === 0) continue;
    if (/text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '')) continue;
    if (cs.webkitTextFillColor && parse(cs.webkitTextFillColor)?.a === 0) continue;
    const bg = behind(el);
    const c = ratio(over(fg, bg), bg);
    const bold = Number(cs.fontWeight) >= 700;
    const large = px >= 24 || (px >= 19 && bold);
    const need = large ? ${AA_LARGE} : ${AA_BODY};
    /* A ratio of exactly 1 means the resolved foreground equals the resolved
       background, which in practice means the element is painting its text
       some way this cannot see (a gradient fill, a stroke, a shadow). Those
       are reported separately rather than mixed in with the real ones. */
    if (c < need && c > 1.02) {
      out.contrast.push({ el: label(el), px: Math.round(px), ratio: Math.round(c * 100) / 100,
        need, text: text.slice(0, 40) });
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.ratio ?? a.px ?? -a.by ?? 0) - (b.ratio ?? b.px ?? -b.by ?? 0));
  return out;
})()
`;

const browser = await launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

async function audit(name) {
  await page.waitForTimeout(600);
  const r = await page.evaluate(AUDIT);
  const n = Object.values(r).reduce((a, b) => a + b.length, 0);
  console.log(`\n▶ ${name}  —  ${n} finding(s)`);
  for (const [kind, list] of Object.entries(r)) {
    if (!list.length) continue;
    console.log(`  ${kind} (${list.length})`);
    for (const f of list.slice(0, 10)) {
      if (kind === 'contrast') console.log(`    ${String(f.ratio).padStart(5)}:1 (needs ${f.need}) ${String(f.px).padStart(3)}px  ${f.el.padEnd(30)} ${JSON.stringify(f.text)}`);
      else if (kind === 'size') console.log(`    ${String(f.px).padStart(5)}px  ${f.el.padEnd(30)} ${JSON.stringify(f.text)}`);
      else if (kind === 'clipped') console.log(`    ${String(f.over).padStart(4)}px by ${f.by.padEnd(9)} ${f.el.padEnd(30)} ${JSON.stringify(f.text)}`);
      else if (kind === 'offscreen') console.log(`    ${String(f.by).padStart(4)}px out  ${f.el.padEnd(30)} ${JSON.stringify(f.text)}`);
      else console.log(`    ${f.el.padEnd(30)} ${JSON.stringify(f.text)}`);
    }
    if (list.length > 10) console.log(`    … and ${list.length - 10} more`);
  }
  return r;
}

await page.goto(`${BASE}/?harness`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1800);

// Intro, if it is showing.
for (let i = 0; i < 3; i++) {
  const n = page.locator('button:has-text("Next")').first();
  if (await n.isVisible().catch(() => false)) { await audit(`intro ${i + 1}`); await n.click(NUDGE).catch(() => {}); await page.waitForTimeout(250); }
}
const skip = page.locator('button:has-text("Skip")').first();
if (await skip.isVisible().catch(() => false)) await skip.click(NUDGE).catch(() => {});
await page.waitForTimeout(700);

await audit('menu');

for (const [btn, name] of [[/^Codex/i, 'codex'], [/^Settings$/i, 'settings'], [/How this works/i, 'how-it-works']]) {
  const b = page.locator('button', { hasText: btn }).first();
  if (!(await b.isVisible().catch(() => false))) continue;
  await b.click(NUDGE).catch(() => {});
  await page.waitForTimeout(800);
  await audit(name);
  for (const back of [/^Back$/i, /^Close$/i, /^Done$/i]) {
    const x = page.locator('button', { hasText: back }).first();
    if (await x.isVisible().catch(() => false)) { await x.click(NUDGE).catch(() => {}); break; }
  }
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);
}

// The table.
await page.evaluate(async () => {
  const s = window.__hexholdStore;
  await s.getState().createRoom('Hero', { maxPlayers: 4, private: true, botSkill: 'adept', speed: 'standard', handsPerAnte: 2 });
  s.getState().addBot(true); s.getState().addBot(true); s.getState().addBot(true);
  await new Promise((r) => setTimeout(r, 900));
  s.getState().startGame();
});
for (let i = 0; i < 160; i++) { if (await page.locator('.felt').first().isVisible().catch(() => false)) break; await page.waitForTimeout(150); }
await page.waitForTimeout(2500);
await audit('table');

// Rules tab, which is its own wall of text.
const rules = page.locator('button', { hasText: /^RULES/i }).first();
if (await rules.isVisible().catch(() => false)) { await rules.click(NUDGE).catch(() => {}); await page.waitForTimeout(700); await audit('table · rules'); }

// Play on for a spell panel, the Market and a showdown.
const want = { stack: false, shop: false, showdown: false };
const until = Date.now() + 240000;
while (Date.now() < until && !(want.stack && want.shop && want.showdown)) {
  if (!want.stack && await page.locator('.stack-panel').count()) { want.stack = true; await audit('table · spell panel'); }
  if (!want.shop && await page.locator('.shop-panel').count()) { want.shop = true; await audit('market'); }
  if (!want.showdown && await page.locator('.showdown-inner').count()) { want.showdown = true; await audit('showdown'); }
  const act = page.locator('.action-bar button', { hasText: /^(Call|Check)/ }).first();
  if (await act.isEnabled({ timeout: 200 }).catch(() => false)) await act.click({ timeout: 700 }).catch(() => {});
  for (const re of [/Skip the Market|Leave the Market/i, /Continue|Next hand|Deal|Done/i]) {
    const b = page.locator('button', { hasText: re }).first();
    if (await b.isEnabled({ timeout: 120 }).catch(() => false)) { await b.click({ timeout: 600 }).catch(() => {}); break; }
  }
  await page.waitForTimeout(180);
}
for (const [k, v] of Object.entries(want)) if (!v) console.log(`\n▶ ${k}: never reached in the time allowed`);

await browser.close();
