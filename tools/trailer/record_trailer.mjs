#!/usr/bin/env node
/**
 * Records the HEXHOLD trailer from the real game, frame by frame.
 *
 *   tools/trailer/record_trailer.sh                      (everything: music, record, mux)
 *   node tools/trailer/record_trailer.mjs --out DIR      (just the pictures + cue lists)
 *     --only hook_cast,finale   record only these shots (the rest still play, unfilmed)
 *     --stills 10               also write every 10th frame as a JPEG, for review
 *     --until hook_cast         stop after that shot
 *     --measure                 time every text on screen (legibility.json), no pictures
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
 *    Undo hand is played before the Market where the sentence is written, and
 *    is cut in after it.
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
/** --measure: play every shot and time its text (legibility.json), take no pictures. */
const MEASURE = !!argv.measure;
const FPS = 60;
const STEP = 1000 / FPS;
mkdirSync(OUT, { recursive: true });
if (STILLS) mkdirSync(join(OUT, 'stills'), { recursive: true });

/** The cut, in order, with each shot's length in seconds. Music is written to these. */
export const EDIT = [
  ['hook_kings', 2.5], ['hook_cast', 9.0], ['title', 4.5], ['write', 8.0], ['write_cast', 7.5],
  ['undo', 9.5], ['omen', 4.5], ['worst_wins', 7.5], ['finale', 20.5], ['end', 7.5],
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
const BANNER = { x: 200, y: 110, w: 1520 };
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
const ff = MEASURE ? { stdin: { write: () => true, end: () => {} }, on: (e, f) => f(), stderr: { on: () => {} } } : spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), join(OUT, 'frames.mp4')]);
ff.stderr.on('data', (d) => process.stderr.write(d));

let frame = 0;          // frames stepped since the stage opened
let recorded = 0;       // frames written to frames.mp4
let speed = 1;          // game milliseconds per video millisecond
let shot = null;        // { name, f0, rec0 }
const shots = [];
const sfx = [];         // { name, t (edit seconds), vol, pan, pitch }
const seen = new Map(); // readable text -> when it was first and last on screen
const filming = () => !!shot && (!ONLY || ONLY.has(shot.name));
const capturing = () => filming() && !MEASURE;
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
  const { sounds, text } = await page.evaluate(([d, cc, w]) => window.__tr.frame(d, cc, w), [dt, c, want]);
  cost.page += performance.now() - t0;
  t0 = performance.now();
  if (shot && filming()) {
    const editT = EDIT_AT[shot.name] + st();
    // How long each readable thing is on screen, in the cut (legibility.json).
    for (const [kind, words] of Object.entries(text)) {
      const key = `${shot.name}|${kind}|${words}`;
      const v = seen.get(key);
      if (v && v.last >= editT - 2.5 / FPS) v.last = editT;
      else seen.set(key + (v ? `|${editT}` : ''), { shot: shot.name, kind, text: words, first: editT, last: editT });
    }
  }
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
/**
 * Film on until `selector` is on the page and has stopped moving (its box the
 * same for a tenth of a second), or `limit` seconds into the shot: a panel
 * measured while it is still flying in frames the wrong part of the table.
 */
async function whenOnScreen(selector, limit) {
  let last = '';
  let still = 0;
  while (st() < limit && still < 6) {
    await step();
    const box = await page.evaluate((sel) => {
      const e = document.querySelector(sel);
      if (!e) return '';
      const b = e.getBoundingClientRect();
      return b.width ? [b.x, b.y, b.width, b.height].map(Math.round).join() : '';
    }, selector);
    still = box && box === last ? still + 1 : 0;
    last = box;
  }
}
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
  const t0 = st();
  for (const [i, ch] of [...text].entries()) {
    await at(t0 + i * per);
    await page.keyboard.type(ch);
    cue('key', 0.55);
  }
}

async function scenes() {
// ═════════════════════════════════════════════════════════════════════════════
// The shots. `--until <shot>` stops after that one, for quick iterations.
// The table: you and two bots, Hex I, a practice table that never ends an ante
// on its own; the director opens each Market.
//
// Pacing (Mason, 2026-10-11: "a little too quick to read anything"): every
// text card is held at least 1.5 s plus 0.3 s a word from the moment its slam
// has landed (0.32 s after it is called), every payoff is held to be read,
// cause and effect runs in slow motion with a still beat before the payoff.
// legibility.json measures each one in the finished cut.
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

// ── Market 1, off camera: the opening's spell is written in plain words ──────
await inShop();
await S(`const h = ctx.hero; h.sigils = []; h.shards = 40; ctx.engine.flush();`);
await skip(1.4);
await page.locator('.scribe-strip button').first().click();
await skip(0.7);
await page.locator('.scribe-input').click();
await page.keyboard.type('copy my king');
await skip(0.6);
await page.locator('.scribe-foot button').last().click();
await skip(0.6);
await S('ctx.engine.shopDone(ctx.hero.id)');

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
await begin('hook_kings');                       // 2.5 s
camMove(handClose, 1.2);
await caption('Four Kings.', { pos: 'top' });   // on 0.32, read to 2.42
await at(0.3);
for (const id of kings) { await ring(cardSel(id), 7); await at(st() + 0.1); }
await end();

await begin('hook_cast');                        // 9.0 s; the banner lands at 3.0 (edit 5.5)
await caption('Make it five.', { pos: 'top' }); // on 0.32, read to 2.72
const sevenRing = await ring(cardSel(I.hole[1]), 8);
await at(0.3);
await heroCast('!!s.scribed');
// The spell flies and the 7 turns, at a third of real speed.
speed = 0.35;
await at(1.9);
speed = 1;
// A still beat on two Kings of Spades before the showdown.
await at(BANNER_LEAD_AT(3.0));
await unring(sevenRing);
await S('ctx.checkAround()');
camMove(BANNER, 0.4);
await at(2.75);
await hush();
await at(3.05);
// Held long enough to read FIVE OF A KIND, KINGS and its line (the game's own
// banner holds 3.2 s; at half speed it stays the whole shot).
speed = 0.5;
await at(3.5);
await nextHandArm();
await end();

async function nextHandArm() {
  // Hand 2 is dealt while the title card is up.
  await S('ctx.rigNextDeal(arg)', { hole: [['AH', '9H'], ['QC', 'QS'], ['8D', '3S']], board: ['KH', '4H', '2C', '7S', 'JD'], extra: ['QH'] });
}

// ── Title ────────────────────────────────────────────────────────────────────
await begin('title');                            // 4.5 s; the line is read to ~3.8
await tr(() => window.__tr.title('Cheat at poker. With magic.'));
cue('boom', 1);
await end();
await tr(() => window.__tr.clearFull());

// ── Hand 2: undo the last card (cut in after the written spell) ─────────────
await skipUntil(`ctx.table.handNumber >= 3 && ctx.table.phase === 'preflop'`, 30);
await S(`ctx.setHand(1, { sigils: [] }); ctx.setHand(2, { sigils: [] }); ctx.setHand(0, { sigils: ['rewind'], mana: 6, maxMana: 8 });`);
await skipUntil(`ctx.table.phase === 'river' && ctx.table.actingId === ctx.hero.id`);
await skip(1.0);
I = await ids();
camCut(await frameOf(['.board [data-card-id]', '.rail [data-card-id]'], { pad: 46, minW: 900 }));
await begin('undo');                             // 9.5 s
await caption('Hate the last card?', { pos: 'top' });   // read to 3.02
const lastRing = await ring(cardSel(I.board[4]), 8);
await at(3.1);
await unring(lastRing);
await heroCast(`s.defId === 'rewind'`);
await caption('Undo it.', { pos: 'top' });      // read to 5.52
// The card goes back and a new one is dealt, at half speed.
speed = 0.5;
await at(4.5);
speed = 1;
I = await ids();
await ring(cardSel(I.board[4]), 8);
await at(5.3);
await S('ctx.checkAround()');
await at(5.75);
await unring();
camMove(await frameOf(['.showdown'], { pad: 50, minW: 1100 }), 0.5);
await at(6.0);
await caption('Now you win.', { pos: 'bottom' });   // on 6.32, read to 8.72; the row settles ~6.6
await end();
await S('ctx.auto.holdHero = []');
await openShopAfterThisHand('the_watchful');

// ── Market 2: write a sentence ───────────────────────────────────────────────
await inShop();
await S(`const h = ctx.hero; h.sigils = []; h.shards = 40; ctx.engine.flush();`);
await skip(1.4);
await page.locator('.scribe-strip button').first().click();
await skip(0.7);
await page.locator('.scribe-input').click();
await skip(0.2);
// Close on the words and the game's reading of them; the page's right half
// (its presets and the Write button) can go out of frame.
{
  // Measured before a word is typed, so from the page's title and its input box.
  const r = await page.evaluate(() => {
    const t = document.querySelector('.scribe-title').getBoundingClientRect();
    const i = document.querySelector('.scribe-input').getBoundingClientRect();
    return { x: i.left, y: t.top };
  });
  camCut({ x: Math.round(r.x - 25), y: Math.round(r.y - 58), w: 660 });
}
await begin('write');                            // 8.0 s
await caption('Write your own spells.', { pos: 'top' });
await at(0.4);
// About fourteen letters a second, so the words can be read as they arrive.
await typeOut("make my worst card wild and see everyone's cards", 0.065);
// Nine words and the reading under them, held 4.3 s once the last letter is in.
await at(7.8);
await page.locator('.scribe-foot button').last().click();
cue('slam', 0.4);
await end();
await skip(0.6);
await S('ctx.engine.shopDone(ctx.hero.id)');
await hush();

// ── Hand 3: the written spell, cast ──────────────────────────────────────────
await nextHand(
  { hole: [['2C', '9S'], ['AC', 'AS'], ['QD', 'JS']], board: ['KH', '9H', '5D', '7S', '4C'] },
  `ctx.setHand(0, { mana: 10, maxMana: 10 }); ctx.auto.holdHero = ['flop'];`,
);
await skipUntil(`ctx.table.phase === 'flop' && ctx.table.actingId === ctx.hero.id`);
await skip(0.8);
I = await ids();
camCut(await frameOf(['.board [data-card-id]', '.rail [data-card-id]', '[data-seat-id]'], { pad: 24 }));
await begin('write_cast');                       // 7.5 s
await heroCast('!!s.scribed');
await at(0.45);
await caption("See everyone's cards: done.", { pos: 'top', size: 'small' });   // read to 3.47
for (const b of I.bots) for (const c of b.hole) await ring(cardSel(c), 6);
await at(3.5);
await unring();
camMove(await frameOf(['.rail [data-card-id]'], { pad: 90, minW: 900, dy: -40 }), 0.5);
await caption('Make my worst card wild: done.', { pos: 'top', size: 'small' }); // read to 7.22
await at(3.9);
await ring(cardSel(I.hole[0]), 8);
await end();
await unring();
await S('ctx.auto.holdHero = []');
await hush();
await openShopAfterThisHand('inversion');

// ── The new rule ─────────────────────────────────────────────────────────────
// openShop shows ANTE n, and two seconds later the omen lands (Engine.rollOmen).
await skipUntil(`ctx.table.ante >= 4`, 60);
// The omen's banner replaces the ante's at 2.0 s; the shot opens on it.
await skip(2.02);
camCut(BANNER);
await begin('omen');                             // 4.5 s, the banner held at 0.7x
speed = 0.7;
await at(0.35);
await caption('Every round, a new rule. Forever.', { pos: 'top', size: 'small' }); // read to 3.97 (4.5)
await end();
await hush();
await inShop();
await S('ctx.engine.shopDone(ctx.hero.id)');

// ── Hand 4: the worst hand wins ──────────────────────────────────────────────
await nextHand(
  { hole: [['7C', '2D'], ['AC', 'AH'], ['KS', 'QS']], board: ['9H', '5S', '3D', 'JC', '8H'] },
  `ctx.setHand(0, { sigils: [] }); ctx.auto.holdHero = ['river'];`,
);
await skipUntil(`ctx.table.phase === 'river' && ctx.table.actingId === ctx.hero.id`);
await skip(0.8);
camCut(FULL);
await begin('worst_wins');                       // 7.5 s; the table holds the result while it is read
await S('ctx.checkAround()');
await at(0.7);
await caption('The worst hand wins.', { pos: 'bottom' });        // read to 3.72
// The camera goes to the results once their panel is on the table (the board
// also carries a small SHOWDOWN label, so the panel is found by its list).
await whenOnScreen('.showdown', 3.2);
// The engine would deal the next hand after its payout hold; the director
// keeps the result on the table for the length of the shot instead.
await S(`if (ctx.table.phase === 'payout') ctx.engine.deadline = Date.now() + 30000;`);
// Framed with room under the rows, so the line below covers none of them.
camMove(await frameOf(['.showdown'], { pad: 40, minW: 1180, dy: 85 }), 0.5);
await at(3.75);
await caption('You had nothing. You won.', { pos: 'bottom' });   // read to 7.07
await end();
await S('ctx.engine.deadline = Date.now() + 300;');
await hush();

// ── Hand 5: one King of Spades, five times ───────────────────────────────────
await S(`const t = ctx.table; t.omens = t.omens.filter((o) => o.id !== 'inversion'); ctx.engine.flush();`);
await nextHand(
  { hole: [['KS', '3D'], ['AC', '9D'], ['QH', '8C']], board: ['JH', '6C', '2S', 'TD', '4H'] },
  `ctx.setHand(0, { sigils: ['graft', 'twin', 'mirror', 'mirror'], mana: 12, maxMana: 12 }); ctx.auto.holdHero = ['river'];`,
);
await skipUntil(`ctx.table.phase === 'river' && ctx.table.actingId === ctx.hero.id`);
await skip(1.0);
I = await ids();
camCut(await frameOf(['.board', '.rail [data-card-id]'], { pad: 60, minW: 1100 }));
await begin('finale');                           // 20.5 s; copies at 4.0, 6.5, 9.0, 11.5; banner at 14.5
await caption('There is one King of Spades.', { pos: 'top', size: 'small' });   // read to 3.62
await ring(cardSel(I.hole[0]), 8);
await at(4.0);
await heroCast(`s.defId === 'graft'`);
await caption('Two.', { pos: 'top', size: 'huge' });
await at(4.3);
await ring(cardSel(I.hole[1]), 8);
await at(6.5);
await heroCast(`s.defId === 'twin'`, { cardIds: [I.hole[0]] });
await caption('Three.', { pos: 'top', size: 'huge' });
await at(6.9);
const twin = (await ids()).board.at(-1);
await ring(cardSel(twin), 8);
await at(9.0);
await heroCast(`s.defId === 'mirror'`, { cardIds: [twin, I.board[0]] });
await caption('Four.', { pos: 'top', size: 'huge' });
await at(9.3);
await ring(cardSel(I.board[0]), 8);
await at(11.5);
await heroCast(`s.defId === 'mirror'`, { cardIds: [twin, I.board[1]] });
await caption('Five.', { pos: 'top', size: 'huge' });   // read to 13.62
await at(11.8);
await ring(cardSel(I.board[1]), 8);
await at(13.65);
await hush();
// A still beat on five Kings of Spades; then the showdown, and the banner
// slams at 14.5 (edit 66.0) seen at a third of real speed.
await at(BANNER_LEAD_AT(14.5));
await unring();
await S('ctx.checkAround()');
camMove(BANNER, 0.5);
await at(14.47);
speed = 0.34;
await at(15.6);
// Slowed still, so the game's banner (3.2 s) stays up while it is read.
speed = 0.55;
await caption('Five of the same card.', { pos: 'low' });   // read to 20.5
await end();
await hush();

// ── End card ─────────────────────────────────────────────────────────────────
await begin('end');                              // 7.5 s
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
writeFileSync(join(OUT, 'legibility.json'), JSON.stringify([...seen.values()]
  .map((v) => ({ ...v, first: +v.first.toFixed(3), last: +(v.last + 1 / FPS).toFixed(3) }))
  .sort((a, b) => a.first - b.first), null, 1));
console.log(`wrote ${recorded} frames, ${sfx.length} sound cues → ${OUT}`);
if (errors.length) console.log(`page errors:\n  ${errors.join('\n  ')}`);
await browser.close();
srv.close();
