/**
 * Drives HEXHOLD at every resolution a Steam customer will actually use and
 * fails loudly on anything that would look broken to them: UI hanging off
 * the screen, unreadable text, a felt that is mostly dead space, seats
 * piled on top of each other.
 *
 * Modeled on test/playthrough.mjs (same boot/skip-intro/practice-vs-bots
 * flow) but parameterized over a matrix of viewports instead of a single
 * long session, and geared toward layout assertions rather than a full
 * playthrough narrative.
 *
 * Run: node test/responsive.mjs [--headed]
 */
import { launch } from './browser.mjs';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const HEADED = process.argv.includes('--headed');
const OUT = path.resolve('responsive');
const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
// Generous: a resolution needs three completed hands to reach the market
// (handsPerAnte defaults to 3), and headless rendering at 4K/ultrawide is
// meaningfully slower per frame than at 1280x800.
const BUDGET_MS = 220_000;

const RESOLUTIONS = [
  { name: 'steamdeck', width: 1280, height: 800, note: 'Steam Deck — critical' },
  { name: 'laptop', width: 1366, height: 768, note: 'most common PC resolution' },
  { name: '1080p', width: 1920, height: 1080, note: 'most common desktop' },
  { name: '1440p', width: 2560, height: 1440, note: '' },
  { name: '4k', width: 3840, height: 2160, note: 'must not look marooned' },
  { name: 'ultrawide', width: 3440, height: 1440, note: 'must not letterbox' },
  { name: 'smallwindow', width: 1024, height: 680, note: 'Electron minimum window' },
];

// HEXHOLD_ONLY=4k,ultrawide runs a subset, for chasing one resolution.
const ONLY = (process.env.HEXHOLD_ONLY ?? '').split(',').filter(Boolean);
if (ONLY.length) RESOLUTIONS.splice(0, RESOLUTIONS.length, ...RESOLUTIONS.filter((r) => ONLY.includes(r.name)));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------------------
// In-page check functions (serialized into page.evaluate).
// ---------------------------------------------------------------------------

/**
 * A robust "is this actually visible to a player" check, shared by every
 * scan below. `checkVisibility()` (Chromium) walks the ancestor chain for
 * display/visibility/opacity, unlike a one-element getComputedStyle read —
 * without it, text inside a hover-only tooltip (opacity: 0 on an ancestor,
 * not the text node itself) reads as "visible" and produces false failures.
 * Defined as a source string and re-created inside each page.evaluate
 * callback (Playwright serializes callbacks by their own source, so a
 * closed-over function reference from Node isn't callable in-page).
 */
function isVisible(el) {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true });
  }
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
}
function tagOf(el) {
  const cls = (el.getAttribute('class') || '').toString().split(' ').filter(Boolean).slice(0, 2).join('.');
  let tag = el.tagName.toLowerCase() + (cls ? `.${cls}` : '');
  // An unclassed element (an inline-styled div, an SVG text node) is
  // otherwise impossible to identify from a bare tag name — a short text
  // snippet, or the nearest classed ancestor, makes the report actionable.
  if (!cls) {
    const own = (el.textContent || '').trim().slice(0, 30);
    if (own) tag += ` "${own}"`;
    else {
      let p = el.parentElement;
      let hops = 0;
      while (p && hops < 4 && !p.getAttribute('class')) { p = p.parentElement; hops++; }
      if (p && p.getAttribute('class')) tag += ` (inside .${p.getAttribute('class').split(' ')[0]})`;
    }
  }
  return tag;
}

/**
 * The visible extent of `el` after every clipping ancestor (`overflow` !=
 * visible, on either axis) has cut it down — i.e. what a player would
 * actually see, not the raw laid-out/transformed box. A `scaleX` overshoot
 * on a decorative element sitting inside `overflow: hidden` is real geometry
 * (`getBoundingClientRect` reports it) but never actually paints outside
 * that ancestor, so it must not read as a viewport overflow.
 */
function clippedRect(el) {
  let r = el.getBoundingClientRect();
  let rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  // Stop before <body>: this app sets `body { overflow: hidden }` because it
  // is a full-screen game that does not scroll, and walking into that clips
  // every element on the page to the viewport — which made this function
  // return "nothing overflows" for every element at every resolution. The
  // two clipping bugs this harness was meant to catch (a sigil name reading
  // "Doppelgange", BIND reading "BIN" at 1024x680) both had to be found by
  // looking at screenshots instead.
  let p = el.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
      const pr = p.getBoundingClientRect();
      rect = {
        left: Math.max(rect.left, pr.left),
        right: Math.min(rect.right, pr.right),
        top: Math.max(rect.top, pr.top),
        bottom: Math.min(rect.bottom, pr.bottom),
      };
    }
    p = p.parentElement;
  }
  return rect;
}

/** Nothing wider than the viewport, or drawn off the left edge. */
async function checkOverflowX(page) {
  return page.evaluate(([isVisibleSrc, tagOfSrc, clippedRectSrc]) => {
    // eslint-disable-next-line no-eval
    const isVisible = eval(`(${isVisibleSrc})`);
    // eslint-disable-next-line no-eval
    const tagOf = eval(`(${tagOfSrc})`);
    // eslint-disable-next-line no-eval
    const clippedRect = eval(`(${clippedRectSrc})`);
    const out = [];
    const vw = window.innerWidth;
    for (const el of document.querySelectorAll('body *')) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right <= vw + 2 && r.left >= -2) continue;
      // Raw box looks like it overflows — but if a clipping ancestor cuts
      // that part away entirely, nothing is actually visible out there.
      const c = clippedRect(el);
      if (c.right <= c.left || c.bottom <= c.top) continue;
      if (c.right > vw + 2 || c.left < -2) {
        out.push(`${tagOf(el)} overflows horizontally (${Math.round(c.left)}..${Math.round(c.right)} vs ${vw})`);
      }
    }
    return [...new Set(out)].slice(0, 10);
  }, [isVisible.toString(), tagOf.toString(), clippedRect.toString()]);
}

/** No `position: fixed` element should run off the bottom of the viewport. */
async function checkFixedBottom(page) {
  return page.evaluate(([isVisibleSrc, tagOfSrc]) => {
    // eslint-disable-next-line no-eval
    const isVisible = eval(`(${isVisibleSrc})`);
    // eslint-disable-next-line no-eval
    const tagOf = eval(`(${tagOfSrc})`);
    const out = [];
    const vh = window.innerHeight;
    for (const el of document.querySelectorAll('body *')) {
      if (getComputedStyle(el).position !== 'fixed') continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom > vh + 2) {
        out.push(`${tagOf(el)} fixed element runs off the bottom (${Math.round(r.bottom)} vs ${vh})`);
      }
    }
    return [...new Set(out)].slice(0, 10);
  }, [isVisible.toString(), tagOf.toString()]);
}

/** No visible text smaller than 10px anywhere on screen. */
async function checkTinyText(page) {
  return page.evaluate(([isVisibleSrc, tagOfSrc, clippedRectSrc]) => {
    // eslint-disable-next-line no-eval
    const isVisible = eval(`(${isVisibleSrc})`);
    // eslint-disable-next-line no-eval
    const tagOf = eval(`(${tagOfSrc})`);
    // eslint-disable-next-line no-eval
    const clippedRect = eval(`(${clippedRectSrc})`);
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let el = walker.currentNode;
    while (el) {
      el = walker.nextNode();
      if (!el) break;
      // Only elements with their own direct (non-whitespace) text.
      let hasText = false;
      for (const child of el.childNodes) {
        if (child.nodeType === 3 && child.textContent && child.textContent.trim()) { hasText = true; break; }
      }
      if (!hasText) continue;
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) continue;
      // Clipped away by an ancestor (e.g. scrolled out of a panel) reads as
      // "visible" by opacity/display alone but a player can't see it either.
      const c = clippedRect(el);
      if (c.right <= c.left || c.bottom <= c.top) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px && px < 9.9) {
        out.push(`${tagOf(el)} @ ${px.toFixed(1)}px ("${el.textContent.trim().slice(0, 24)}")`);
      }
    }
    return [...new Set(out)].slice(0, 12);
  }, [isVisible.toString(), tagOf.toString(), clippedRect.toString()]);
}

/**
 * No text cut off by a box too small for it.
 *
 * This is the check this harness was missing, and it is the one that matters
 * for a full-screen app. `checkOverflowX` asks "does anything paint outside
 * the viewport", and the answer here is always no — `.app` and `body` both
 * set `overflow: hidden`, so the window edge physically cannot be crossed.
 * The real failure mode is the opposite one: a box that clips its own
 * contents. Both layout bugs found at 1024x680 were this — a sigil reading
 * "Doppelgange" and BIND reading "BIN" — and both had to be found by looking
 * at screenshots, because nothing here was asking the question.
 *
 * Deliberate truncation is excluded: an ellipsis, a line clamp, a fade mask
 * and a scrollable panel are all cues that say "there is more", which is a
 * design decision rather than a defect.
 */
async function checkClippedText(page) {
  return page.evaluate(([isVisibleSrc, tagOfSrc]) => {
    // eslint-disable-next-line no-eval
    const isVisible = eval(`(${isVisibleSrc})`);
    // eslint-disable-next-line no-eval
    const tagOf = eval(`(${tagOfSrc})`);
    const out = [];

    for (const el of document.querySelectorAll('body *')) {
      let hasText = false;
      for (const child of el.childNodes) {
        if (child.nodeType === 3 && child.textContent && child.textContent.trim()) { hasText = true; break; }
      }
      if (!hasText || !isVisible(el)) continue;

      const cs = getComputedStyle(el);
      // Deliberate "there is more" cues.
      if (cs.textOverflow === 'ellipsis') continue;
      if (cs.webkitLineClamp && cs.webkitLineClamp !== 'none') continue;
      if ((cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')) continue;
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) continue;
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // A visually-hidden copy for screen readers is a 1x1 box with its text
      // clipped away on purpose — which is this check's exact signature, and
      // it fired on every `.sr-only` in the showdown panel. Nothing a sighted
      // player is meant to read is three pixels wide.
      if (el.clientWidth <= 3 || el.clientHeight <= 3) continue;

      // 1px of slack: sub-pixel text metrics round against us constantly.
      const cutX = el.scrollWidth - el.clientWidth;
      const cutY = el.scrollHeight - el.clientHeight;
      if (cutX > 1 || cutY > 1) {
        const what = cutX > 1 ? `${Math.round(cutX)}px wider` : `${Math.round(cutY)}px taller`;
        out.push(`${tagOf(el)} clips its own text (${what} than its box) — "${el.textContent.trim().slice(0, 28)}"`);
      }
    }
    return [...new Set(out)].slice(0, 12);
  }, [isVisible.toString(), tagOf.toString()]);
}

/** The action buttons must all be visible and at least 32px tall. */
async function checkActionButtons(page) {
  return page.evaluate(() => {
    const out = [];
    const btns = document.querySelectorAll('.ab-buttons button');
    if (btns.length === 0) return ['no .ab-buttons button elements found while it was meant to be your turn'];
    for (const b of btns) {
      const cs = getComputedStyle(b);
      const r = b.getBoundingClientRect();
      const visible = cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && r.width > 0 && r.height > 0;
      if (!visible) { out.push(`action button "${b.textContent.trim().slice(0, 20)}" is not visible`); continue; }
      if (r.height < 32) out.push(`action button "${b.textContent.trim().slice(0, 20)}" is only ${r.height.toFixed(1)}px tall`);
      if (r.top < -2 || r.bottom > window.innerHeight + 2 || r.left < -2 || r.right > window.innerWidth + 2) {
        out.push(`action button "${b.textContent.trim().slice(0, 20)}" is partly off-screen`);
      }
    }
    return out;
  });
}

/** The player's own hole cards and sigil hand must be fully on screen. */
async function checkOwnCardsOnScreen(page) {
  return page.evaluate(() => {
    const out = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const within = (r) => r.top >= -2 && r.left >= -2 && r.bottom <= vh + 2 && r.right <= vw + 2;

    const hole = document.querySelectorAll('.rail-hole .hx-card-slot');
    if (hole.length === 0) out.push('no hole cards rendered in .rail-hole');
    for (const c of hole) {
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!within(r)) out.push(`hole card off-screen (${Math.round(r.left)},${Math.round(r.top)})..(${Math.round(r.right)},${Math.round(r.bottom)}) vs ${vw}x${vh}`);
    }

    const sigils = document.querySelectorAll('.rail-sigils .sigil');
    if (sigils.length === 0) out.push('no sigils rendered in .rail-sigils');
    for (const s of sigils) {
      const r = s.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!within(r)) out.push(`sigil card off-screen (${Math.round(r.left)},${Math.round(r.top)})..(${Math.round(r.right)},${Math.round(r.bottom)}) vs ${vw}x${vh}`);
    }
    return [...new Set(out)].slice(0, 12);
  });
}

/** Opponent seats must not overlap each other or the board. */
async function checkSeatOverlap(page) {
  return page.evaluate(() => {
    const out = [];
    const shrink = (r, by) => ({
      left: r.left + by, top: r.top + by, right: r.right - by, bottom: r.bottom - by,
    });
    const intersects = (a, b) =>
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const seats = [...document.querySelectorAll('[data-seat-id]')].map((el) => ({
      id: el.getAttribute('data-seat-id'),
      r: shrink(el.getBoundingClientRect(), 8),
    })).filter((s) => s.r.right > s.r.left && s.r.bottom > s.r.top);

    for (let i = 0; i < seats.length; i++) {
      for (let j = i + 1; j < seats.length; j++) {
        if (intersects(seats[i].r, seats[j].r)) {
          out.push(`seat ${seats[i].id} overlaps seat ${seats[j].id}`);
        }
      }
    }

    const board = document.querySelector('.board-cards');
    if (board) {
      const br = shrink(board.getBoundingClientRect(), 4);
      for (const s of seats) {
        if (intersects(s.r, br)) out.push(`seat ${s.id} overlaps the board`);
      }
    }
    return [...new Set(out)].slice(0, 12);
  });
}

/**
 * The rail packs three things into one row — your chips, your hole cards and
 * your sigil hand — and the hole cards are fanned, so they rotate out of the
 * box their un-rotated size reserved. That is how the outer hole card ended
 * up sitting on top of the first sigil tile, at every resolution, for the
 * whole of one release.
 */
async function checkRailCollision(page) {
  return page.evaluate(() => {
    const right = (sel) => {
      const els = [...document.querySelectorAll(sel)];
      return els.length ? Math.max(...els.map((e) => e.getBoundingClientRect().right)) : null;
    };
    const left = (sel) => {
      const els = [...document.querySelectorAll(sel)];
      return els.length ? Math.min(...els.map((e) => e.getBoundingClientRect().left)) : null;
    };
    const holeRight = right('.rail-hole .hx-card');
    const sigilLeft = left('.rail-sigils .sigil');
    if (holeRight === null || sigilLeft === null) return [];
    const gap = sigilLeft - holeRight;
    return gap < 2 ? [`hole cards overlap the sigil hand by ${Math.round(-gap)}px`] : [];
  });
}

/** The felt should actually be used — not mostly dead air below the pot. */
async function checkFeltUsage(page) {
  return page.evaluate(() => {
    const felt = document.querySelector('.felt');
    const pot = document.querySelector('.board-pot');
    if (!felt || !pot) return { ok: true, note: 'felt or pot not found' };
    const fr = felt.getBoundingClientRect();
    const pr = pot.getBoundingClientRect();
    if (fr.height === 0) return { ok: true, note: 'felt has no height' };
    const emptyBelow = fr.bottom - pr.bottom;
    const pct = (emptyBelow / fr.height) * 100;
    // Tightened from 42% once the board was moved down and grown: the felt
    // used to carry a quarter of its own height as dead air under the pot,
    // and 42% was loose enough to never say so.
    return { ok: pct <= 32, pct: Math.round(pct), feltH: Math.round(fr.height), emptyBelow: Math.round(emptyBelow) };
  });
}

// ---------------------------------------------------------------------------
// Driving the game
// ---------------------------------------------------------------------------

async function shot(dir, name) {
  return path.join(OUT, `${dir}-${name}.png`);
}

async function skipIntro(page) {
  const introVisible = await page.locator('text=/skip/i').first().isVisible().catch(() => false);
  if (introVisible) {
    for (let i = 0; i < 3; i++) {
      const next = page.locator('button:has-text("Next")').first();
      if (await next.isVisible().catch(() => false)) {
        await next.click().catch(() => {});
        await page.waitForTimeout(150);
      }
    }
    const skip = page.locator('button:has-text("Skip")').first();
    if (await skip.isVisible().catch(() => false)) await skip.click().catch(() => {});
    await page.waitForTimeout(300);
  }
}

async function runResolution(browser, res) {
  const dir = `${res.width}x${res.height}`;
  const fails = [];
  const notes = [];
  const seen = { menu: false, table: false, market: false, showdown: false };

  const note = (msg) => { notes.push(msg); };
  const fail = (where, msgs) => {
    for (const m of msgs) fails.push(`[${where}] ${m}`);
  };

  const ctx = await browser.newContext({
    viewport: { width: res.width, height: res.height },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail('page', [`uncaught error: ${String(e).slice(0, 200)}`]));

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1500);
    await skipIntro(page);

    // --- menu -----------------------------------------------------------
    await page.waitForTimeout(300);
    await page.screenshot({ path: await shot(dir, 'menu') }).catch(() => {});
    seen.menu = true;
    fail('menu', await checkOverflowX(page));
    fail('menu', await checkFixedBottom(page));
    fail('menu', await checkTinyText(page));
    fail('menu', await checkClippedText(page));

    // --- connect + practice ----------------------------------------------
    const practice = page.locator('button', { hasText: /practice vs bots/i }).first();
    let connected = false;
    for (let i = 0; i < 60; i++) {
      if (await practice.isEnabled().catch(() => false)) { connected = true; break; }
      await page.waitForTimeout(250);
    }
    if (!connected) {
      fail('menu', ['menu never became usable — practice button stayed disabled']);
      await ctx.close();
      return { res, fails, notes, seen };
    }
    await practice.click().catch(() => {});
    await page.waitForTimeout(2500);

    const felt = await page.locator('.felt').first().isVisible().catch(() => false);
    if (!felt) {
      fail('table', ['the felt never appeared — practice mode did not reach a table']);
      await ctx.close();
      return { res, fails, notes, seen };
    }

    // --- play, capturing table / market / showdown as they occur --------
    const start = Date.now();
    let lastAct = Date.now();
    let capturedTable = false;

    while (Date.now() - start < BUDGET_MS) {
      if (page.isClosed()) break;
      if (seen.table && seen.market && seen.showdown) break;

      try {
        // Stack response window.
        const letResolve = page.locator('button:has-text("Let it resolve")').first();
        if (await letResolve.isVisible().catch(() => false)) {
          await letResolve.click().catch(() => {});
          lastAct = Date.now();
          await page.waitForTimeout(200);
          continue;
        }

        // A target prompt we didn't ask for (from a bot's spell response
        // window not applying to us) shouldn't happen, but a stray targeting
        // hint cancel button keeps us unstuck if one appears.
        const cancelHint = page.locator('.tbl-targethint button').first();
        if (await cancelHint.isVisible().catch(() => false)) {
          await cancelHint.click().catch(() => {});
          await page.waitForTimeout(150);
        }

        // Shop.
        const shopDone = page.locator('.shop button:has-text("Done")').first();
        if (await shopDone.isVisible().catch(() => false)) {
          if (!seen.market) {
            await page.waitForTimeout(400);
            await page.screenshot({ path: await shot(dir, 'market') }).catch(() => {});
            seen.market = true;
            fail('market', await checkOverflowX(page));
            fail('market', await checkFixedBottom(page));
            fail('market', await checkTinyText(page));
            fail('market', await checkClippedText(page));
          }
          const buy = page.locator('.shopcard button:not([disabled])').first();
          if (await buy.isVisible().catch(() => false)) {
            await buy.click().catch(() => {});
            await page.waitForTimeout(300);
          }
          await shopDone.click().catch(() => {});
          lastAct = Date.now();
          await page.waitForTimeout(400);
          continue;
        }

        // Showdown panel.
        const showdownVisible = await page.locator('.showdown').first().isVisible().catch(() => false);
        if (showdownVisible && !seen.showdown) {
          /*
           * The panel springs in from y:30, its rows stagger to a 0.5s delay,
           * and the winning hand decodes on a 430ms lead. At the old 300ms this
           * screenshotted and then ran the layout checks in the middle of all
           * of that: the 1280x800 capture showed the panel still in flight,
           * with its top row sliced by its own overflow, which reads exactly
           * like a layout bug at the one resolution that matters most.
           *
           * These shots are also the starting point for store screenshots, so
           * a mid-animation frame is worth avoiding twice over.
           */
          await page.waitForTimeout(1400);
          await page.screenshot({ path: await shot(dir, 'showdown') }).catch(() => {});
          seen.showdown = true;
          fail('showdown', await checkOverflowX(page));
          fail('showdown', await checkFixedBottom(page));
          fail('showdown', await checkTinyText(page));
          fail('showdown', await checkClippedText(page));
        }

        // Our turn.
        const fold = page.locator('.ab-buttons button:has-text("Fold")').first();
        if (await fold.isVisible().catch(() => false)) {
          lastAct = Date.now();

          if (!capturedTable) {
            capturedTable = true;
            await page.waitForTimeout(200);
            await page.screenshot({ path: await shot(dir, 'table') }).catch(() => {});
            seen.table = true;
            fail('table', await checkOverflowX(page));
            fail('table', await checkFixedBottom(page));
            fail('table', await checkTinyText(page));
            fail('table', await checkClippedText(page));
            fail('table', await checkActionButtons(page));
            fail('table', await checkOwnCardsOnScreen(page));
            fail('table', await checkSeatOverlap(page));
            fail('table', await checkRailCollision(page));
            const felt2 = await checkFeltUsage(page);
            if (!felt2.ok) {
              fail('table', [`felt is ${felt2.pct}% empty below the pot (felt height ${felt2.feltH}px, empty ${felt2.emptyBelow}px) — should be <=42%`]);
            } else {
              note(`felt usage OK (${felt2.pct ?? 0}% empty below pot)`);
            }
          }

          const call = page.locator('.ab-buttons button').filter({ hasText: /^(Check|Call)/ }).first();
          if (await call.isVisible().catch(() => false)) await call.click().catch(() => {});
          else await fold.click().catch(() => {});
          await page.waitForTimeout(250);
          continue;
        }

        if (Date.now() - lastAct > 60_000) {
          note('60s with no turn and no prompt — moving on for this resolution');
          break;
        }
        await page.waitForTimeout(300);
      } catch (err) {
        if (page.isClosed()) break;
        note(`interaction hiccup: ${String(err).slice(0, 140)}`);
        await page.waitForTimeout(300);
      }
    }

    if (!seen.table) fail('table', ['never reached a player turn within the time budget']);
    if (!seen.showdown) note('showdown never reached within the time budget');
    if (!seen.market) note('market never reached within the time budget');
  } catch (err) {
    fail('run', [`unexpected error: ${String(err).slice(0, 200)}`]);
  } finally {
    await ctx.close().catch(() => {});
  }

  return { res, fails, notes, seen };
}

// ---------------------------------------------------------------------------

const browser = await launch({ headless: !HEADED });
const results = [];
for (const res of RESOLUTIONS) {
  console.log(`\n▶ ${res.name} — ${res.width}x${res.height} ${res.note ? `(${res.note})` : ''}`);
  const r = await runResolution(browser, res);
  results.push(r);
  console.log(`  screenshots: menu=${r.seen.menu ? 'y' : 'n'} table=${r.seen.table ? 'y' : 'n'} market=${r.seen.market ? 'y' : 'n'} showdown=${r.seen.showdown ? 'y' : 'n'}`);
  if (r.fails.length) {
    console.log(`  ${r.fails.length} FAILURE(S):`);
    for (const f of r.fails.slice(0, 20)) console.log(`    · ${f}`);
  } else {
    console.log('  ✔ no failures');
  }
}
await browser.close();

// --- final table -------------------------------------------------------
console.log('\n\n══════════════════════════ RESPONSIVE REPORT ══════════════════════════');
console.log(
  ['Resolution', 'Size', 'Menu', 'Table', 'Market', 'Showdown', 'Fails', 'Result']
    .map((h) => h.padEnd(12)).join(' '),
);
let anyFail = false;
for (const r of results) {
  const ok = r.fails.length === 0;
  if (!ok) anyFail = true;
  console.log(
    [
      r.res.name,
      `${r.res.width}x${r.res.height}`,
      r.seen.menu ? 'y' : 'n',
      r.seen.table ? 'y' : 'n',
      r.seen.market ? 'y' : 'n',
      r.seen.showdown ? 'y' : 'n',
      String(r.fails.length),
      ok ? 'PASS' : 'FAIL',
    ].map((c) => String(c).padEnd(12)).join(' '),
  );
}
console.log('═════════════════════════════════════════════════════════════════════\n');

if (anyFail) {
  console.log('FAILURES BY RESOLUTION:\n');
  for (const r of results) {
    if (!r.fails.length) continue;
    console.log(`── ${r.res.name} (${r.res.width}x${r.res.height}) ──`);
    for (const f of r.fails) console.log(`  · ${f}`);
    console.log('');
  }
}

process.exit(anyFail ? 1 : 0);
