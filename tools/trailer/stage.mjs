/**
 * The recorder's stage: the trailer server (tools/trailer/server.ts) in a
 * child process, one headless muted Chromium page on the built client, and a
 * virtual clock both of them turn together.
 *
 * Nothing here knows about the trailer's shots; record_trailer.mjs does.
 * Silent and invisible by construction: headless, `--mute-audio`, no window,
 * no focus. Sound is never played; the page reports what it would have played
 * (`window.__hexholdSoundTap`, src/lib/sound.ts) and the mux renders it.
 */
import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { launch } from '../../test/browser.mjs';

export const ROOT = resolve(import.meta.dirname, '..', '..');

// ── The page's virtual clock, installed before any page script runs ──────────
// requestAnimationFrame, timers, performance.now, Date.now and every CSS / Web
// Animation are driven from here. `enable(epoch)` pins Date.now to the
// server's virtual epoch so countdowns agree on both sides.
const VIRTUAL_CLOCK = `(() => {
  const rPerf = performance.now.bind(performance), rDate = Date.now;
  const rST = window.setTimeout.bind(window), rCT = window.clearTimeout.bind(window);
  const rSI = window.setInterval.bind(window), rCI = window.clearInterval.bind(window);
  const rRaf = window.requestAnimationFrame.bind(window), rCaf = window.cancelAnimationFrame.bind(window);
  let on = false, vNow = 0, dateOff = 0, nextId = 5e6, rafNext = 9e6, lastReal = 0;
  const timers = new Map(), rafs = new Map(), born = new WeakMap();
  const syncAnimations = (prev) => {
    const gap = rPerf() - lastReal;
    for (const a of document.getAnimations()) {
      let b = born.get(a);
      if (b === undefined) {
        // First sight: it began at the last frame boundary, plus whatever
        // offset it was created with on purpose (a negative delay, a resync).
        const ct = typeof a.currentTime === 'number' ? a.currentTime : 0;
        b = prev - Math.max(0, ct - gap);
        born.set(a, b);
      }
      const at = vNow - b;
      try {
        const end = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().endTime : Infinity;
        if (Number.isFinite(end) && at >= end) { if (a.playState !== 'finished') a.finish(); continue; }
      } catch {}
      try { a.pause(); a.currentTime = at; } catch {}
    }
  };
  window.__vt = {
    enable(epoch) { vNow = rPerf(); dateOff = (epoch ?? rDate()) - vNow; lastReal = rPerf(); on = true; },
    now() { return vNow; },
    /** A real pause, for waiting on the socket: the virtual timers do not move. */
    sleep(ms) { return new Promise((r) => rST(r, ms)); },
    advance(ms) {
      const prev = vNow;
      const target = vNow + ms;
      for (let guard = 0; guard < 20000; guard++) {
        let best = null;
        for (const [id, t] of timers) if (t.at <= target && (!best || t.at < best[1].at || (t.at === best[1].at && id < best[0]))) best = [id, t];
        if (!best) break;
        const [id, t] = best;
        vNow = Math.max(vNow, t.at);
        if (t.every > 0) t.at = vNow + t.every; else timers.delete(id);
        try { typeof t.fn === 'function' ? t.fn(...t.args) : 0; } catch (e) { console.error(e); }
      }
      vNow = target;
      const cbs = [...rafs.values()]; rafs.clear();
      for (const cb of cbs) { try { cb(vNow); } catch (e) { console.error(e); } }
      syncAnimations(prev);
      lastReal = rPerf();
    },
  };
  performance.now = () => on ? vNow : rPerf();
  Date.now = () => on ? Math.round(vNow + dateOff) : rDate();
  window.setTimeout = (fn, ms, ...args) => { if (!on) return rST(fn, ms, ...args); const id = nextId++; timers.set(id, { at: vNow + Math.max(0, +ms || 0), every: 0, fn, args }); return id; };
  window.setInterval = (fn, ms, ...args) => { if (!on) return rSI(fn, ms, ...args); const id = nextId++; const e = Math.max(1, +ms || 1); timers.set(id, { at: vNow + e, every: e, fn, args }); return id; };
  window.clearTimeout = id => { if (timers.has(id)) timers.delete(id); else rCT(id); };
  window.clearInterval = id => { if (timers.has(id)) timers.delete(id); else rCI(id); };
  window.requestAnimationFrame = cb => { if (!on) return rRaf(cb); const id = rafNext++; rafs.set(id, cb); return id; };
  window.cancelAnimationFrame = id => { if (rafs.has(id)) rafs.delete(id); else rCaf(id); };
})();`;

/** What a returning player has already dismissed, so no first-run panel covers a shot. */
const PRESEED = `(() => {
  try {
    localStorage.setItem('hexhold.seenIntro', '1');
    localStorage.setItem('hexhold.hints.seen', JSON.stringify({ response_window: true, castable_sigil: true, shop_open: true }));
    localStorage.setItem('hexhold.name', 'You');
    // Spell cards Off: a resolved spell does not sit over the cards it just
    // changed. A spell you can answer still shows (the game's own rule).
    localStorage.setItem('hexhold.prefs', JSON.stringify({ spellCards: 'off' }));
    localStorage.setItem('hexhold.audio', JSON.stringify({ master: 0.8, sfx: 0.9, music: 0.5, muted: false }));
  } catch {}
  // Every sound the game asks for, stamped on the virtual clock.
  window.__sounds = [];
  window.__hexholdSoundTap = (kind, name, opts) => {
    window.__sounds.push({ kind, name, opts: opts || null, t: performance.now() - (window.__t0 || 0) });
  };
})();`;

/** Fork the trailer server and resolve once it is listening. */
export async function startServer({ port = 3419 } = {}) {
  const env = { ...process.env, PORT: String(port), CLIENT_DIR: resolve(ROOT, 'dist') };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = fork(resolve(import.meta.dirname, 'server.ts'), [], {
    cwd: ROOT, env, execArgv: ['--import', 'tsx'], stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  let seq = 0;
  const pending = new Map();
  const ready = new Promise((res, rej) => {
    child.once('exit', (c) => rej(new Error(`trailer server exited (${c})`)));
    child.on('message', (m) => {
      if (m?.type === 'listening') { res(m); return; }
      const p = pending.get(m?.id);
      if (!p) return;
      pending.delete(m.id);
      if (m.ok) p.res(m.value); else p.rej(new Error(m.error));
    });
  });
  const call = (msg) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    child.send({ ...msg, id });
  });
  const info = await ready;
  return {
    port: info.port,
    epoch: info.now,
    /** Run `src` in the server with `ctx` (engine, rooms, shared modules) and `arg`. */
    run: (src, arg) => call({ op: 'eval', src, arg }),
    advance: (ms) => call({ op: 'advance', ms }),
    sent: () => call({ op: 'sent' }),
    now: () => call({ op: 'now' }),
    close: () => { try { child.disconnect(); } catch {} try { child.kill(); } catch {} },
  };
}

/** A muted, headless 1920x1080 page on the trailer server, clock not yet frozen. */
export async function openPage(url, { width = 1920, height = 1080 } = {}) {
  const browser = await launch({
    headless: true,
    args: ['--mute-audio', '--hide-scrollbars', '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'],
  });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { errors.push(String(e)); console.log('[page error]', e.message); });
  await page.addInitScript(VIRTUAL_CLOCK);
  await page.addInitScript(PRESEED);
  await page.goto(url);
  const cdp = await context.newCDPSession(page);
  return { browser, context, page, cdp, errors };
}
