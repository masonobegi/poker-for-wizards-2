/**
 * The style audit.
 *
 * `align.mjs` asks whether the pieces line up. This asks whether they are
 * DRAWN IN THE STYLE, which is a question you can only ask of a style that
 * has rules — and a pixel-art style is unusually well suited to it, because
 * every one of its rules is a number:
 *
 *   - fourteen colours, and nothing between two of them (`tokens.css`);
 *   - one art pixel is 4 CSS px, so a radius is 0, 4 or 8 and never 4.44;
 *   - no blur, anywhere, for any reason;
 *   - a shadow is a hard offset silhouette, never a soft falloff;
 *   - three faces: Bungee, Press Start 2P, Pixelify Sans;
 *   - and text still has to pass WCAG AA, because a 12px pixel font at
 *     2:1 on a dark plate is unreadable whatever its hue.
 *
 * It exists because the review of the first arcade build was "really heavily
 * audit the graphics, be tough as fuck until they're perfect", and the thing
 * eyes do not catch is a palette drifting: the fourteen were pasted at the top
 * of `tokens.css` and the fifty semantic tokens underneath them were left on
 * the palette before it, so two art directions were live at once and 84
 * painted colours were off the list. Nobody sees that in a screenshot. A
 * machine sees it in four seconds.
 *
 * Two things it deliberately does NOT flag, both of which it used to:
 *
 *   1. **A percentage radius is a shape, not a rounded corner.** `.felt` is
 *      `border-radius: 50% 28%`, which is how you get an ellipse out of a
 *      div — the table. Reading `parseFloat('50%')` as 50px turned the single
 *      most intentional curve in the game into three defects.
 *   2. **Contrast is measured against what is actually behind the glyph**,
 *      which starts at the element itself. A sigil card is bone paper; its
 *      name is ink on that paper at 13:1. Walking straight past the card to
 *      the first dark ancestor reported 1.16:1 and would have had me
 *      "fixing" the most readable text in the game.
 *
 * Run: node test/style.mjs [width] [height]      (needs the client served)
 */
import { launch } from './browser.mjs';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
const W = Number(process.argv[2] ?? 1280);
const H = Number(process.argv[3] ?? 800);

const probe = () => {
  /** The fourteen. Anything painted opaque should be one of them. */
  const PALETTE = {
    '13,10,20': 'ink', '20,16,43': 'night', '43,34,102': 'indigo', '91,42,134': 'purple',
    '194,24,91': 'magenta', '255,79,163': 'hotpink', '0,229,255': 'cyan', '31,163,163': 'teal',
    '255,210,63': 'gold', '255,140,26': 'orange', '229,38,30': 'red',
    '201,138,62': 'wood', '168,106,42': 'wood-dark', '232,176,100': 'wood-light',
    '244,241,232': 'bone',
  };
  /* The ladder in tokens.css mixes two of the fourteen to get a rung between
     them (a dithered surface needs a flat stand-in when it is 3px tall). Those
     are declared, not drifted, so they are on the list too. */
  /* The four additions (see tokens.css) and the interpolated ladder rungs,
     which are a palette colour's own second tone rather than a new colour. */
  const LADDER = {
    '194,190,219': 'bone-2', '159,154,196': 'bone-3',
    '78,224,138': 'jade', '194,30,24': 'card-red',
    '16,12,32': 'abyss', '29,23,68': 'bg-2', '58,45,133': 'surface-2', '92,58,22': 'brass-deep',
  };
  const ALL = { ...PALETTE, ...LADDER };

  const near = (r, g, b) => {
    let best = null; let bd = 1e9;
    for (const k of Object.keys(ALL)) {
      const [pr, pg, pb] = k.split(',').map(Number);
      const d = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
      if (d < bd) { bd = d; best = ALL[k]; }
    }
    return { name: best, dist: Math.sqrt(bd) };
  };
  const parse = (c) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(c || '');
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
    /* Chrome serialises color-mix() as color(srgb r g b / a), channels 0-1.
       Reading only rgb() skipped every color-mix fill, so text was scored
       against whatever opaque layer lay further out: the unmake button's
       near-black disc was passed over and its bone glyph scored 1.59:1
       against the bone card behind the disc (8:1 really). legibility.mjs
       learned this on 2026-10-19; this audit learned it on 2026-10-22. */
    const k = /color\(\s*srgb\s+([\d.e+-]+)\s+([\d.e+-]+)\s+([\d.e+-]+)(?:\s*\/\s*([\d.e+-]+%?))?\s*\)/.exec(c || '');
    if (!k) return null;
    const alpha = k[4] === undefined ? 1 : k[4].endsWith('%') ? parseFloat(k[4]) / 100 : +k[4];
    return { r: +k[1] * 255, g: +k[2] * 255, b: +k[3] * 255, a: alpha };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.08) return false;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };

  /**
   * What is behind this glyph.
   *
   * Starts at the element itself and walks out, compositing every translucent
   * fill it passes over the first opaque one — so ink on a bone card reads
   * against the card, and a 30%-white hover plate over indigo reads against
   * the blend rather than against either.
   */
  const backdrop = (el) => {
    const stack = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      const c = parse(s.backgroundColor);
      if (!c || c.a <= 0.01) continue;
      /* A background-image (a stripe plate, a card illustration) sits over the
         background-colour and we cannot sample it, so stop here and take the
         colour as the best available answer. */
      stack.push(c);
      if (c.a > 0.99) break;
    }
    let base = { r: 20, g: 16, b: 43 };
    for (let i = stack.length - 1; i >= 0; i--) {
      const c = stack[i];
      base = {
        r: c.r * c.a + base.r * (1 - c.a),
        g: c.g * c.a + base.g * (1 - c.a),
        b: c.b * c.a + base.b * (1 - c.a),
      };
    }
    return base;
  };

  const out = [];
  const seen = new Set();
  const add = (kind, key, detail) => { if (seen.has(key)) return; seen.add(key); out.push({ kind, key, detail }); };
  const tag = (el) => {
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
  };

  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue;
    if (el.closest('.crt')) continue;               // the tube is not a prop
    const s = getComputedStyle(el);
    const t = tag(el);

    // --- corners -----------------------------------------------------------
    // One art pixel is 4px, so a corner is 0, 4 or 8. A percentage radius is
    // not a corner at all: it is how a div becomes an ellipse.
    const radRaw = s.borderTopLeftRadius || '0px';
    if (!/%/.test(radRaw)) {
      const rad = parseFloat(radRaw) || 0;
      if (rad > 8.5) add('radius', `rad${t}${rad}`, `${t} has a ${radRaw} corner (max 8px)`);
      else if (rad > 0 && Math.abs(rad - Math.round(rad / 4) * 4) > 0.26) {
        add('radius', `grid${t}${rad}`, `${t} has a ${radRaw} corner — off the 4px art-pixel grid`);
      }
    }

    // --- blur: there is none in this style ---------------------------------
    if (/blur\(/.test(s.filter) || /blur\(/.test(s.backdropFilter)) {
      add('blur', `bl${t}`, `${t} is blurred (${s.filter !== 'none' ? s.filter : s.backdropFilter})`);
    }

    // --- shadows: a flat offset silhouette, never a falloff ----------------
    for (const sh of (s.boxShadow || '').split(/,(?![^(]*\))/)) {
      const m = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(sh);
      if (m && Number(m[3]) > 0 && !/inset/.test(sh)) {
        add('softshadow', `ss${t}`, `${t} casts a ${m[3]}px-blurred shadow`);
        break;
      }
    }
    if (/\d+px/.test(s.textShadow || '') && !/0px 0px|0 0/.test(s.textShadow)) {
      const m = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px/.exec(s.textShadow);
      if (m && Number(m[3]) > 0) add('softshadow', `ts${t}`, `${t} has a ${m[3]}px-blurred text shadow`);
    }

    // --- three faces -------------------------------------------------------
    const fam = s.fontFamily.split(',')[0].replace(/["']/g, '');
    const leaf = el.childElementCount === 0 && (el.textContent || '').trim();
    if (leaf && !['Bungee', 'Press Start 2P', 'Pixelify Sans'].includes(fam)) {
      add('font', `f${fam}${t}`, `${t} is set in ${fam}`);
    }
    /*
     * The face has a pixel grid of its own.
     *
     * Press Start 2P is an 8-pixel bitmap face drawn as outlines. At 16px each
     * of its source pixels is exactly two CSS pixels and the glyph is sharp;
     * at 12px each is one and a half, so every stem lands on a half pixel and
     * the renderer anti-aliases it into greys that are not in the palette.
     * It is the one typographic defect you cannot see in a mock-up and cannot
     * un-see once it is pointed out. Multiples of eight only.
     */
    if (leaf && fam === 'Press Start 2P') {
      const size = parseFloat(s.fontSize);
      if (Math.abs(size - Math.round(size / 8) * 8) > 0.4) {
        add('fontgrid', `fg${t}${size}`, `${t} sets Press Start 2P at ${size}px — not a multiple of 8`);
      }
    }

    // --- palette -----------------------------------------------------------
    for (const prop of ['backgroundColor', 'color', 'borderTopColor']) {
      const c = parse(s[prop]);
      if (!c || c.a < 0.9) continue;
      if (prop === 'borderTopColor' && parseFloat(s.borderTopWidth) < 1) continue;
      if (prop === 'color' && !(el.textContent || '').trim() && !el.querySelector('svg, path, circle, rect')) continue;
      const n = near(c.r, c.g, c.b);
      if (n.dist > 30) {
        add('palette', `p${prop}${s[prop]}${t}`,
          `${t} ${prop} ${s[prop]} is ${Math.round(n.dist)} from ${n.name}`);
      }
    }

    // --- contrast on real text ---------------------------------------------
    if (el.childElementCount === 0) {
      const txt = (el.textContent || '').trim();
      const fg = parse(s.color);
      if (txt && fg && fg.a > 0.5) {
        const bg = backdrop(el);
        const cr = ratio(fg, bg);
        const size = parseFloat(s.fontSize);
        const big = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
        const need = big ? 3 : 4.5;
        if (cr < need) {
          add('contrast', `c${s.color}${t}`,
            `${t} "${txt.slice(0, 18)}" ${cr.toFixed(2)}:1 at ${size}px (needs ${need})`);
        }
      }
    }
  }
  return out;
};

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
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(1800);

const seen = new Map();
const screens = [];
const sweep = async (name) => {
  await page.waitForTimeout(500);
  const found = await page.evaluate(probe);
  for (const f of found) if (!seen.has(f.key)) seen.set(f.key, { ...f, where: name });
  screens.push({ name, n: found.length });
};

if (await page.locator('text=/skip/i').first().isVisible().catch(() => false)) {
  await sweep('intro');
  const s = page.locator('button:has-text("Skip")').first();
  if (await s.isVisible().catch(() => false)) await s.click(NUDGE).catch(() => {});
  await page.waitForTimeout(600);
}
await sweep('menu');

const practice = page.locator('button', { hasText: /practice vs bots/i }).first();
for (let i = 0; i < 60; i++) { if (await practice.isEnabled().catch(() => false)) break; await page.waitForTimeout(250); }
await practice.click(NUDGE).catch(() => {});
await page.waitForTimeout(3600);
await sweep('table');

for (const [label, sel] of [['codex', 'button:has-text("Codex")'], ['settings', 'button:has-text("Settings")'], ['log', 'button:has-text("Log")']]) {
  const b = page.locator(sel).first();
  if (await b.isVisible().catch(() => false)) {
    await b.click(NUDGE).catch(() => {});
    await sweep(label);
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
  }
}

/* Play on. The market and the showdown are the two screens the first pass of
   this probe never reached, and the market is a whole screen of chrome that
   has never had a style pass at all. */
let market = false;
let showdown = false;
/* 260, not 110. The market opens between antes — "MARKET IN 2 HANDS" on the
   header — and two hands of four-handed poker is more clicks than a hundred
   and ten at this cadence. The screen with the least style attention in the
   game was the one the audit kept not reaching. */
for (let i = 0; i < 260 && !(market && showdown); i++) {
  if (!market && await page.locator('.market, .shop').first().isVisible().catch(() => false)) {
    await sweep('market'); market = true;
  }
  if (!showdown && await page.locator('.showdown').first().isVisible().catch(() => false)) {
    await sweep('showdown'); showdown = true;
  }
  const done = page.locator('button', { hasText: /^(done|next hand|continue)$/i }).first();
  if (await done.isVisible().catch(() => false)) { await done.click(NUDGE).catch(() => {}); await page.waitForTimeout(250); continue; }
  const call = page.locator('.ab-buttons button').filter({ hasText: /^(Check|Call)/ }).first();
  if (await call.isVisible().catch(() => false)) await call.click(NUDGE).catch(() => {});
  await page.waitForTimeout(340);
}

await ctx.close();
await browser.close();

const all = [...seen.values()];
console.log(`\n▶ ${W}x${H} — ${screens.map((s) => s.name).join(', ')}${market ? '' : '  (market never reached)'}`);
const KINDS = ['palette', 'softshadow', 'blur', 'radius', 'font', 'fontgrid', 'contrast'];
for (const kind of KINDS) {
  const list = all.filter((f) => f.kind === kind);
  if (!list.length) continue;
  console.log(`  -- ${kind} (${list.length})`);
  for (const f of list.slice(0, 40)) console.log(`     ${f.detail}  [${f.where}]`);
  if (list.length > 40) console.log(`     ...and ${list.length - 40} more`);
}
console.log(`\n${all.length === 0 ? '✔ in style' : `${all.length} finding(s)`}`);
process.exit(all.length === 0 ? 0 : 1);
