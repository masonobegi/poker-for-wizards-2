#!/usr/bin/env node
/**
 * Records the HEXHOLD trailer from the real game, frame by frame.
 *
 *   tools/trailer/record_trailer.sh                      (everything: music, record, mux)
 *   node tools/trailer/record_trailer.mjs --out DIR      (just the pictures + cue lists)
 *     --only hook_cast,finale   record only these shots (the rest still play, unfilmed)
 *     --stills 10               also write every 10th frame as a JPEG, for review
 *     --until hook_cast         stop after that shot
 *
 * The approach is Bootleggers' (lords-of-vegas/tools/trailer/record_trailer.js),
 * adapted to a game that is DOM and a Node server rather than a canvas:
 *
 *  - ONE CLOCK FOR BOTH SIDES. tools/trailer/server.ts runs the real HEXHOLD
 *    server with Date.now() and the table scheduler on a virtual clock; the
 *    page runs on one too (stage.mjs). Every video frame turns both by the
 *    same 1/60 s, so countdowns, bot think times, card flights and banners
 *    keep their real relationship however slowly the frames are captured.
 *    Slow motion is the same thing with a smaller step.
 *  - STACKED DECKS, REAL HANDS. Each shot's hand is dealt from a deck the
 *    director stacked (Engine.stream, the named random stream every deal is
 *    drawn from) and seats are given the sigils, relics and mana the shot
 *    needs. Then the engine plays it: casts go through Engine.cast, answers
 *    through the stack, the showdown through the evaluator. The written
 *    spells are typed into the real Blank Page textarea and read by the real
 *    parser. Nothing on screen is drawn by this script except the text cards,
 *    the gold rings that point at a card, and the title and end cards.
 *  - A CAMERA. Close-ups are Chromium rendering a clipped region at a higher
 *    scale (Page.captureScreenshot clip.scale), so text is re-rasterised sharp
 *    and the game's own layout never knows the camera moved.
 *  - SHOTS, THEN AN EDIT. Shots are recorded in the order the game plays them
 *    and named; mux_trailer.py cuts them into EDIT order. Only one moves: the
 *    spell for the opening is written in the Market before the hand it wins.
 *  - SOUND AS DATA. The page reports every sound the game asks for
 *    (window.__hexholdSoundTap, src/lib/sound.ts) on the frame it asked;
 *    render_sfx.mjs renders those synths offline and the mux places them.
 *    Nothing is ever played aloud.
 *
 * Writes <out>/frames.mp4 (silent, 60 fps), <out>/shots.json (each shot's
 * frame range and its place in the edit), <out>/sfx.json (game sounds and the
 * director's own cues, in edit time).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startServer, openPage, ROOT } from './stage.mjs';
import { OVERLAY_CSS, installOverlays } from './overlays.mjs';

const argv = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => {
  if (v.startsWith('--')) a.push([v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']);
  return a;
}, []));
const OUT = resolve(argv.out ?? join(ROOT, 'tools', 'trailer', 'out', 'rec'));
const ONLY = argv.only ? new Set(argv.only.split(',')) : null;
const STILLS = Number(argv.stills ?? 0);
const FPS = 60;
const STEP = 1000 / FPS;
mkdirSync(OUT, { recursive: true });
if (STILLS) mkdirSync(join(OUT, 'stills'), { recursive: true });

/** The cut, in order, with each shot's length in seconds. Music is written to these. */
export const EDIT = [
  ['hook_kings', 1.3], ['hook_type', 1.4], ['hook_cast', 3.3], ['title', 3.0],
  ['undo', 5.0], ['counter', 4.0], ['write', 4.5], ['write_cast', 4.5],
  ['omen', 3.0], ['buy', 2.5], ['deal3', 2.0], ['worst_wins', 4.5],
  ['finale', 11.0], ['end', 8.0],
];
const LEN = Object.fromEntries(EDIT);
const EDIT_AT = {};
{ let t = 0; for (const [n, l] of EDIT) { EDIT_AT[n] = t; t += l; } }

// ── Stage ────────────────────────────────────────────────────────────────────
const srv = await startServer({ port: Number(argv.port ?? 3419) });
const { browser, page, cdp, errors } = await openPage(`http://127.0.0.1:${srv.port}/?harness`);
await page.waitForFunction(() => window.__hexholdStore?.getState().connected, null, { timeout: 60000 });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => {
  const s = window.__hexholdStore.getState().socket;
  window.__rx = 0;
  s.onAny(() => { window.__rx++; });
});
await page.evaluate(installOverlays, OVERLAY_CSS);
await page.evaluate((e) => window.__vt.enable(e), await srv.now());

const S = (src, arg) => srv.run(src, arg);
const tr = (fn, arg) => page.evaluate(fn, arg);

// ── Camera ───────────────────────────────────────────────────────────────────
const FULL = { x: 0, y: 0, w: 1920 };
/**
 * The game mounts a cut-in banner a beat after the showdown that raises it
 * (the street closes, the showdown deals its reveal, BannerLayer waits two
 * frames, then the title slams). Measured on a recording at 60 fps: 0.37 s
 * to the showdown panel, 0.40 s to the slam. Called this much before a music
 * hit, a showdown lands its banner on it.
 */
const BANNER_LEAD = Number(argv.lead ?? 0.4);
const BANNER_LEAD_AT = (hit) => hit - BANNER_LEAD;
/** Where the game's cut-in banners slam: across the middle of the felt. */
const BANNER = { x: 120, y: 70, w: 1680 };
let camFrom = FULL;
let camTo = FULL;
let camT0 = 0;
let camT1 = 0;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
/** The union of what these selectors match, padded, as a 16:9 window inside the page. */
async function frameOf(selectors, { pad = 40, minW = 720, dy = 0 } = {}) {
  const r = await page.evaluate((sels) => {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const sel of sels) {
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect();
        if (!b.width || !b.height) continue;
        x0 = Math.min(x0, b.left); y0 = Math.min(y0, b.top); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom);
      }
    }
    return Number.isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }, selectors);
  if (!r) { console.log('  (camera: nothing matched', selectors.join(', '), ')'); return FULL; }
  let w = Math.max(minW, r.x1 - r.x0 + pad * 2, (r.y1 - r.y0 + pad * 2) * 16 / 9);
  w = Math.min(1920, w);
  const h = w * 9 / 16;
  const cx = (r.x0 + r.x1) / 2;
  const cy = (r.y0 + r.y1) / 2 + dy;
  return {
    x: Math.round(Math.max(0, Math.min(1920 - w, cx - w / 2))),
    y: Math.round(Math.max(0, Math.min(1080 - h, cy - h / 2))),
    w: Math.round(w),
  };
}
const camCut = (c) => { camFrom = c; camTo = c; camT0 = 0; camT1 = 0; };
const camMove = (c, sec) => { camFrom = camNow(); camTo = c; camT0 = frame; camT1 = frame + Math.max(1, Math.round(sec * FPS)); };
function camNow() {
  if (frame >= camT1) return camTo;
  const k = ease((frame - camT0) / (camT1 - camT0));
  return { x: camFrom.x + (camTo.x - camFrom.x) * k, y: camFrom.y + (camTo.y - camFrom.y) * k, w: camFrom.w + (camTo.w - camFrom.w) * k };
}

// ── Frames ───────────────────────────────────────────────────────────────────
const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), join(OUT, 'frames.mp4')]);
ff.stderr.on('data', (d) => process.stderr.write(d));

let frame = 0;          // frames stepped since the stage opened
let recorded = 0;       // frames written to frames.mp4
let speed = 1;          // game milliseconds per video millisecond
let shot = null;        // { name, f0, rec0 }
const shots = [];
const sfx = [];         // { name, t (edit seconds), vol, pan, pitch }
const capturing = () => !!shot && (!ONLY || ONLY.has(shot.name));
const SILENT = new Set(['title', 'end']);
/** Seconds since the current shot began. */
const st = () => (shot ? (frame - shot.f0) / FPS : 0);

const cost = { server: 0, page: 0, shot: 0 };
async function step() {
  const dt = STEP * speed;
  let t0 = performance.now();
  const want = await srv.advance(dt);
  cost.server += performance.now() - t0;
  const c = camNow();
  t0 = performance.now();
  const sounds = await page.evaluate(([d, cc, w]) => window.__tr.frame(d, cc, w), [dt, c, want]);
  cost.page += performance.now() - t0;
  t0 = performance.now();
  if (capturing()) {
    const w = Math.max(16, c.w);
    const { data } = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg', quality: 93, optimizeForSpeed: true,
      clip: { x: c.x, y: c.y, width: w, height: w * 9 / 16, scale: 1920 / w },
    });
    const buf = Buffer.from(data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (STILLS && (frame - shot.f0) % STILLS === 0) {
      writeFileSync(join(OUT, 'stills', `${shot.name}-${st().toFixed(2).padStart(5, '0')}.jpg`), buf);
    }
    const editT = EDIT_AT[shot.name] + st();
    // The title and end cards cover the table; what the game is doing behind
    // them is not heard.
    for (const s of SILENT.has(shot.name) ? [] : sounds) {
      if (s.kind !== 'sfx') continue;
      const delay = (s.opts?.delay ?? 0) / 1000 / speed;
      sfx.push({ name: s.name, t: +(editT + delay).toFixed(4), vol: s.opts?.vol ?? 1, pan: s.opts?.pan ?? 0, pitch: s.opts?.pitch ?? 1 });
    }
    recorded++;
  }
  cost.shot += performance.now() - t0;
  frame++;
}
/** Film (or, outside a shot, just play) until the shot clock reads `sec`. */
const at = async (sec) => { while (st() < sec - 1e-6) await step(); };
/** Off camera: run the table forward `sec` seconds of game time, cheaply. */
async function skip(sec) {
  let left = sec * 1000;
  while (left > 0) {
    const dt = Math.min(100, left);
    const want = await srv.advance(dt);
    await page.evaluate(([d, w]) => window.__tr.frame(d, { x: 0, y: 0, w: 1920 }, w), [dt, want]);
    left -= dt;
  }
}
/** Off camera until the server says `cond` (JS over ctx), up to `max` seconds. */
async function skipUntil(cond, max = 60) {
  for (let i = 0; i < max * 10; i++) {
    if (await S(`return !!(${cond})`)) return true;
    await skip(0.1);
  }
  throw new Error(`timed out waiting for: ${cond}`);
}
async function begin(name) {
  if (shot) throw new Error(`shot ${shot.name} still open`);
  cost.server = 0; cost.page = 0; cost.shot = 0;
  await tr(() => window.__tr.cut());
  shot = { name, f0: frame, rec0: recorded };
  process.stdout.write(`▶ ${name.padEnd(12)} edit ${EDIT_AT[name].toFixed(2)}s  `);
}
async function end() {
  await at(LEN[shot.name]);
  if (capturing()) shots.push({ name: shot.name, start: shot.rec0, frames: recorded - shot.rec0, edit: EDIT_AT[shot.name] });
  const nF = Math.max(1, frame - shot.f0);
  console.log(`${capturing() ? `${recorded - shot.rec0} frames` : '(not filmed)'}  ms/frame: server ${(cost.server / nF).toFixed(0)} page ${(cost.page / nF).toFixed(0)} shot ${(cost.shot / nF).toFixed(0)}`);
  cost.server = 0; cost.page = 0; cost.shot = 0;
  const done = shot.name;
  shot = null;
  speed = 1;
  if (argv.until === done) throw STOP;
}
const STOP = new Error('stop');
/** A director's sound (rendered by render_music.py), at this moment of the shot. */
const cue = (name, gain = 1, dt = 0) => { if (capturing()) sfx.push({ name: `tr_${name}`, t: +(EDIT_AT[shot.name] + st() + dt).toFixed(4), vol: gain, pan: 0, pitch: 1 }); };
const caption = (text, opts = {}) => { cue('slam', opts.quiet ? 0.35 : 0.6); return tr(([a, b]) => window.__tr.caption(a, b), [text, opts]); };
const hush = () => tr(() => window.__tr.hush());
const ring = (selector, pad) => tr(([s, p]) => window.__tr.ring(s, p), [selector, pad]);
const unring = (id) => tr((i) => window.__tr.unring(i ?? undefined), id ?? null);
const cardSel = (id) => `[data-card-id="${id}"]`;

// ── Server-side shorthands ───────────────────────────────────────────────────
const heroCast = (match, targets = {}) => S(`
  const h = ctx.hero;
  const g = h.sigils.find((s) => ${match});
  if (!g) throw new Error('hero holds no sigil matching ${match.replace(/'/g, '')}: ' + h.sigils.map((s) => s.defId).join());
  const r = ctx.engine.cast(h.id, g.uid, arg);
  if (!r.ok) throw new Error('cast failed: ' + r.error);
  return r;`, targets);
const ids = () => S(`const t = ctx.table; return {
  hero: ctx.hero.id, hole: ctx.hero.hole, board: t.board,
  bots: ctx.bots.map((b) => ({ id: b.id, name: b.name, hole: b.hole })) };`);
/** Arm the next deal, then play off camera until the hand after it is dealt. */
async function nextHand(plan, setup = '') {
  const n = await S('return ctx.table.handNumber');
  await S('ctx.rigNextDeal(arg)', plan);
  await skipUntil(`ctx.table.handNumber > ${n} && ctx.table.phase === 'preflop'`, 90);
  await S(`ctx.setHand(1, { sigils: [] }); ctx.setHand(2, { sigils: [] }); ${setup}`);
}
const openShopAfterThisHand = (omen) => S(`ctx.rigNextOmen(arg); ctx.table.config.handsPerAnte = ctx.table.handNumber;`, omen);
async function inShop() {
  await skipUntil(`ctx.table.phase === 'shop'`, 90);
  await S('ctx.table.config.handsPerAnte = 99');
}
const setPrefs = (p) => tr((x) => window.__hexholdPrefs.set(x), p);
/** Type into the focused field a character every `per` seconds of the shot. */
async function typeOut(text, per) {
  for (const ch of text) {
    await page.keyboard.type(ch);
    cue('key', 0.55);
    await at(st() + per);
  }
}

async function scenes() {
// ═════════════════════════════════════════════════════════════════════════════
// The shots. `--until <shot>` stops after that one, for quick iterations.
// The table: you and two bots, Hex I, a practice table that never ends an ante
// on its own; the director opens each Market.
// ═════════════════════════════════════════════════════════════════════════════
await tr(async () => {
  const st = window.__hexholdStore.getState();
  await st.createRoom('You', { maxPlayers: 3, private: true, botSkill: 'adept', speed: 'standard', hex: 1, handsPerAnte: 1 }, 'unaligned');
  st.addBot(true); st.addBot(true);
});
await skip(0.3);
await S('ctx.direct(); ctx.auto.hero = true;');
// Omens that change nothing these hands use, so the deck stays a plain deck.
await S(`ctx.rigNextOmen('feast'); ctx.rigNextDeal(arg)`, { hole: [['4C', '9D'], ['QC', '5S'], ['8D', '3S']], board: ['KH', '4H', '2C', '7S', 'JD'] });
await tr(() => window.__hexholdStore.getState().startGame());
await skip(0.2);
await S(`ctx.setHand(1, { sigils: [] }); ctx.setHand(2, { sigils: [] });`);

// ── Market 1: write the opening's spell ──────────────────────────────────────
await inShop();
await S(`const h = ctx.hero; h.sigils = []; h.shards = 40; ctx.engine.flush();`);
await skip(1.4);
await page.locator('.scribe-strip button').first().click();
await skip(0.7);
await page.locator('.scribe-input').click();
await skip(0.2);
camCut(await frameOf(['.scribe-input', '.scribe-reading'], { pad: 70, minW: 860, dy: 20 }));

await begin('hook_type');
await caption('Type a spell.', { pos: 'top' });
await at(0.12);
await typeOut('copy my king', 0.06);
await end();
await page.locator('.scribe-foot button').last().click();
await skip(0.6);
await S('ctx.engine.shopDone(ctx.hero.id)');
await tr(() => { window.__tr.hush(); });

// ── Hand 1: four Kings, and the written spell makes five ─────────────────────
await nextHand(
  { hole: [['KS', '7D'], ['9C', '4H'], ['QD', 'JC']], board: ['KH', 'KD', '3C', 'KC', '8S'] },
  `ctx.setHand(0, { mana: 8, maxMana: 8 }); ctx.auto.holdHero = ['river'];`,
);
await skipUntil(`ctx.table.phase === 'river' && ctx.table.actingId === ctx.hero.id`);
await skip(1.2);
let I = await ids();
const kings = [I.hole[0], ...I.board.filter((_, i) => [0, 1, 3].includes(i))];
const tableWide = await frameOf(['.board', '.rail [data-card-id]', '[data-seat-id]'], { pad: 30 });
const handClose = await frameOf(['.board [data-card-id]', '.rail [data-card-id]'], { pad: 46, minW: 900 });

camCut(tableWide);
await begin('hook_kings');
camMove(handClose, 1.0);
await caption('Four Kings.', { pos: 'top' });
await at(0.25);
for (const id of kings) { await ring(cardSel(id), 7); await at(st() + 0.08); }
await end();

await begin('hook_cast');
await unring();
await caption('Make it five.', { pos: 'top' });
await heroCast('!!s.scribed');
speed = 0.4;
await at(0.3);
const sevenRing = await ring(cardSel(I.hole[1]), 8);
await at(0.85);
speed = 1;
await unring(sevenRing);
await at(BANNER_LEAD_AT(1.3));
await S('ctx.checkAround()');
await hush();
// The game's own banner takes the frame from here.
camMove(BANNER, 0.35);
await at(1.3);
await nextHandArm();
await end();

async function nextHandArm() {
  // Hand 2 is dealt while the title card is up.
  await S('ctx.rigNextDeal(arg)', { hole: [['AH', '9H'], ['QC', 'QS'], ['8D', '3S']], board: ['KH', '4H', '2C', '7S', 'JD'], extra: ['QH'] });
}

// ── Title ────────────────────────────────────────────────────────────────────
await begin('title');
await tr(() => window.__tr.title('Cheat at poker. With magic.'));
cue('boom', 1);
await end();
await tr(() => window.__tr.clearFull());

// ── Hand 2: undo the last card ───────────────────────────────────────────────
await skipUntil(`ctx.table.handNumber >= 3 && ctx.table.phase === 'preflop'`, 30);
await S(`ctx.setHand(1, { sigils: [] }); ctx.setHand(2, { sigils: [] }); ctx.setHand(0, { sigils: ['rewind'], mana: 6, maxMana: 8 });`);
await skipUntil(`ctx.table.phase === 'river' && ctx.table.actingId === ctx.hero.id`);
await skip(1.0);
I = await ids();
camCut(await frameOf(['.board [data-card-id]', '.rail [data-card-id]'], { pad: 46, minW: 900 }));
await begin('undo');
await caption('Hate the last card?', { pos: 'top' });
const lastRing = await ring(cardSel(I.board[4]), 8);
await at(1.5);
await unring(lastRing);
await heroCast(`s.defId === 'rewind'`);
await caption('Undo it.', { pos: 'top' });
await at(2.3);
I = await ids();
await ring(cardSel(I.board[4]), 8);
await at(3.0);
await S('ctx.checkAround()');
await at(3.42);
await unring();
camMove(await frameOf(['.showdown'], { pad: 50, minW: 1100 }), 0.5);
await caption('Now you win.', { pos: 'bottom' });
await end();

// ── Hand 3: they cast, you cancel ────────────────────────────────────────────
await nextHand(
  { hole: [['AS', 'AD'], ['TC', '9C'], ['6D', '5S']], board: ['AC', '8H', '2D', 'JS', '4C'] },
  `ctx.setHand(0, { sigils: ['nullify'], mana: 6, maxMana: 8 }); ctx.setHand(1, { sigils: ['burn'], mana: 6 }); ctx.auto.holdHero = ['turn'];`,
);
await skipUntil(`ctx.table.phase === 'turn' && ctx.table.actingId === ctx.hero.id`);
await skip(0.8);
await setPrefs({ spellCards: 'full' });
I = await ids();
camCut(await frameOf(['.board [data-card-id]', '[data-seat-id]'], { pad: 10 }));
await begin('counter');
await S(`const b = ctx.bots[0]; const r = ctx.engine.cast(b.id, b.sigils[0].uid, { cardIds: [ctx.table.board[0]] }); if (!r.ok) throw new Error(r.error);`);
await at(0.15);
await caption('They cast spells too.', { pos: 'top' });
camMove(await frameOf(['.stack-panel'], { pad: 60, minW: 1000 }), 0.5);
await at(2.0);
await heroCast(`s.defId === 'nullify'`);
await caption('Cancel it.', { pos: 'top' });
await end();
await setPrefs({ spellCards: 'off' });
await S('ctx.auto.holdHero = []');
await openShopAfterThisHand('the_watchful');

// ── Market 2: write a longer one ─────────────────────────────────────────────
await inShop();
await S(`const h = ctx.hero; h.sigils = []; h.shards = 40; ctx.engine.flush();`);
await skip(1.4);
await page.locator('.scribe-strip button').first().click();
await skip(0.7);
await page.locator('.scribe-input').click();
await skip(0.2);
camCut(await frameOf(['.scribe-input', '.scribe-reading', '.scribe-foot'], { pad: 60, minW: 1000 }));
await begin('write');
await caption('Write anything.', { pos: 'top' });
await at(0.2);
await typeOut("make my worst card wild and see everyone's cards", 0.05);
// Hold on the whole reading (two effects, a price), then press Write.
await at(4.3);
await page.locator('.scribe-foot button').last().click();
cue('slam', 0.4);
await end();
await skip(0.6);
await S('ctx.engine.shopDone(ctx.hero.id)');
await hush();

// ── Hand 4: the written spell, cast ──────────────────────────────────────────
await nextHand(
  { hole: [['2C', '9S'], ['AC', 'AS'], ['QD', 'JS']], board: ['KH', '9H', '5D', '7S', '4C'] },
  `ctx.setHand(0, { mana: 10, maxMana: 10 }); ctx.auto.holdHero = ['flop'];`,
);
await skipUntil(`ctx.table.phase === 'flop' && ctx.table.actingId === ctx.hero.id`);
await skip(0.8);
I = await ids();
camCut(await frameOf(['.board [data-card-id]', '.rail [data-card-id]', '[data-seat-id]'], { pad: 24 }));
await begin('write_cast');
await heroCast('!!s.scribed');
await at(0.45);
await caption("See everyone's cards: done.", { pos: 'top', size: 'small' });
for (const b of I.bots) for (const c of b.hole) await ring(cardSel(c), 6);
await at(2.25);
await unring();
camMove(await frameOf(['.rail [data-card-id]'], { pad: 90, minW: 900, dy: -40 }), 0.5);
await caption('Make my worst card wild: done.', { pos: 'top', size: 'small' });
await at(2.5);
await ring(cardSel(I.hole[0]), 8);
await end();
await unring();
await S('ctx.auto.holdHero = []');
await hush();
await openShopAfterThisHand('inversion');

// ── The new rule, then Market 3 ──────────────────────────────────────────────
// openShop shows ANTE n, and two seconds later the omen lands (Engine.rollOmen).
await skipUntil(`ctx.table.ante >= 4`, 60);
// The omen's banner replaces the ante's at 2.0 s; the shot opens on it.
await skip(2.02);
camCut(BANNER);
await begin('omen');
await at(0.5);
await caption('Every round, a new rule. Forever.', { pos: 'bottom', size: 'small' });
await end();
await hush();
await inShop();
await S(`const t = ctx.table; const h = ctx.hero; h.shards = 40;
  const s = t.shop.get(h.id);
  s.items = [{ kind: 'relic', id: 'third_hand', uid: 'tr1', price: 18 }, { kind: 'relic', id: 'apotheosis', uid: 'tr2', price: 30 },
    { kind: 'relic', id: 'wild_inheritance', uid: 'tr3', price: 20 }, ...s.items.filter((i) => i.kind === 'scribe')];
  ctx.engine.flush();`);
// The page holds the Market back until the omen's banner has gone.
await skip(2.6);
camCut(await frameOf(['.shop-grid'], { pad: 70, minW: 900 }));
await begin('buy');
await caption('Or buy your own.', { pos: 'bottom' });
await ring('.shop-grid > *:first-child', 6);
await at(1.0);
await S(`const r = ctx.engine.shopBuy(ctx.hero.id, 'tr1'); if (!r.ok) throw new Error(r.error);`);
await end();
await unring();
await hush();

// ── Hand 5: three cards, and the worst hand wins ────────────────────────────
await S('ctx.rigNextDeal(arg); ctx.setHand(0, { sigils: [] }); ctx.auto.holdHero = ["river"];',
  { hole: [['7C', '2D', '4S'], ['AC', 'AH'], ['KS', 'QS']], board: ['9H', '5S', '3D', 'JC', '8H'] });
await S('ctx.engine.shopDone(ctx.hero.id)');
await skip(0.25);
// The hand area, before there are cards in it to measure: the three land here.
camCut({ x: 0, y: 1080 - Math.round(1100 * 9 / 16), w: 1100 });
await begin('deal3');
await at(0.3);
await caption('Three cards. Every hand.', { pos: 'top' });
await end();
await hush();
await S(`ctx.setHand(1, { sigils: [] }); ctx.setHand(2, { sigils: [] });`);
await skipUntil(`ctx.table.phase === 'river' && ctx.table.actingId === ctx.hero.id`);
await skip(0.8);
camCut(FULL);
await begin('worst_wins');
await S('ctx.checkAround()');
await at(0.45);
camMove(await frameOf(['.showdown'], { pad: 40, minW: 1000 }), 0.45);
await caption('The worst hand wins.', { pos: 'bottom' });
await at(2.2);
await caption('You had nothing. You won.', { pos: 'bottom' });
await end();
await hush();

// ── Hand 6: one King of Spades, five times ───────────────────────────────────
await S(`const t = ctx.table; t.omens = t.omens.filter((o) => o.id !== 'inversion'); ctx.hero.relics = ctx.hero.relics.filter((r) => r !== 'third_hand'); ctx.engine.flush();`);
await nextHand(
  { hole: [['KS', '3D'], ['AC', '9D'], ['QH', '8C']], board: ['JH', '6C', '2S', 'TD', '4H'] },
  `ctx.setHand(0, { sigils: ['graft', 'twin', 'mirror', 'mirror'], mana: 12, maxMana: 12 }); ctx.auto.holdHero = ['river'];`,
);
await skipUntil(`ctx.table.phase === 'river' && ctx.table.actingId === ctx.hero.id`);
await skip(1.0);
I = await ids();
const finaleCam = await frameOf(['.board', '.rail [data-card-id]'], { pad: 60, minW: 1100 });
camCut(finaleCam);
await begin('finale');
await caption('There is one King of Spades.', { pos: 'top', size: 'small' });
await ring(cardSel(I.hole[0]), 8);
await at(2.0);
await heroCast(`s.defId === 'graft'`);
await caption('Two.', { pos: 'top', size: 'huge' });
await at(2.25);
await ring(cardSel(I.hole[1]), 8);
await at(3.0);
await heroCast(`s.defId === 'twin'`, { cardIds: [I.hole[0]] });
await caption('Three.', { pos: 'top', size: 'huge' });
await at(3.35);
const twin = (await ids()).board.at(-1);
await ring(cardSel(twin), 8);
await at(4.0);
await heroCast(`s.defId === 'mirror'`, { cardIds: [twin, I.board[0]] });
await caption('Four.', { pos: 'top', size: 'huge' });
await at(4.25);
await ring(cardSel(I.board[0]), 8);
await at(5.0);
await heroCast(`s.defId === 'mirror'`, { cardIds: [twin, I.board[1]] });
await caption('Five.', { pos: 'top', size: 'huge' });
await at(5.25);
await ring(cardSel(I.board[1]), 8);
await at(6.4);
await unring();
await hush();
// The banner should slam at 7.0 (edit 46.0), seen at a third of real speed:
// 0.35 s of the 0.40 s lead at full speed, the last 0.05 s slowed to 0.15.
await at(6.5);
await S('ctx.checkAround()');
camMove(BANNER, 0.5);
await at(6.85);
speed = 0.34;
await at(8.4);
speed = 1;
await caption('Five of the same card.', { pos: 'low' });
await end();
await hush();

// ── End card ─────────────────────────────────────────────────────────────────
await begin('end');
await tr(() => window.__tr.flash());
await tr(() => window.__tr.endCard("Texas Hold'em with a deck that breaks physics.", 'Wishlist on Steam', 'Solo against bots  ·  Or host friends on your network'));
cue('boom', 1);
await end();

}

try { await scenes(); } catch (e) { if (e !== STOP) throw e; }

// ── Done ─────────────────────────────────────────────────────────────────────
ff.stdin.end();
await new Promise((r) => ff.on('exit', r));
const editOrder = EDIT.map(([n]) => n).filter((n) => shots.some((s) => s.name === n));
writeFileSync(join(OUT, 'shots.json'), JSON.stringify({ fps: FPS, edit: editOrder, edit_all: EDIT.map(([n]) => n), shots, length: EDIT.reduce((a, [, l]) => a + l, 0) }, null, 1));
writeFileSync(join(OUT, 'sfx.json'), JSON.stringify(sfx.sort((a, b) => a.t - b.t), null, 1));
console.log(`wrote ${recorded} frames, ${sfx.length} sound cues → ${OUT}`);
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
srv.close();
