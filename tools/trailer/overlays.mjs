/**
 * The trailer's own layer over the game: text cards, gold rings that point at
 * a card, the title and end cards. Injected into the page by the recorder;
 * nothing in the game knows about it.
 *
 * Two containers, both outside <body> so nothing in the game can cover them:
 *  - SCREEN (#tr-screen) is laid out in 1920x1080 video space and re-placed
 *    every frame over the camera's clip, so a caption is the same size on
 *    screen however far the camera has pushed in.
 *  - WORLD (#tr-world) is in page space, so a ring around a card zooms with
 *    the card.
 */
export const OVERLAY_CSS = `
  .ach, .hh-conn-pill, .hh-conn-overlay { display: none !important; }
  #tr-screen { position: fixed; left: 0; top: 0; width: 1920px; height: 1080px; transform-origin: 0 0;
    pointer-events: none; z-index: 2147483000; overflow: hidden; }
  #tr-world { position: fixed; left: 0; top: 0; width: 0; height: 0; pointer-events: none; z-index: 2147482000; }

  /* --- captions --------------------------------------------------------
     The director's own type, set the way the game sets type: Bungee through
     three hard bands of gold, orange and red, with an ink outline doing the
     drawing. This was Cinzel with a four-stop metal ramp and a 26px black
     bloom, which was right when the game was leaded glass and reads as a
     different product now that it is pixel art. */
  .tr-cap { position: absolute; left: 0; right: 0; text-align: center; padding: 0 120px; }
  .tr-cap.top { top: 64px; } .tr-cap.bottom { bottom: 78px; } .tr-cap.center { top: 50%; transform: translateY(-50%); }
  .tr-cap.low { top: 66%; }
  /* A slab behind the words, not a cloud. Hard-edged, so it reads as a card
     laid on the table rather than as a smudge over it. */
  .tr-cap::before { content: ''; position: absolute; left: 50%; top: 50%; width: 1500px; height: 260px;
    transform: translate(-50%, -50%);
    background: radial-gradient(closest-side,
      rgba(13, 10, 20, .82) 0 52%, rgba(13, 10, 20, .58) 52% 78%, rgba(13, 10, 20, 0) 78%);
    z-index: -1; animation: tr-in .25s both; }
  .tr-cap h1 { margin: 0; display: inline-block;
    font: 400 78px/1.08 Bungee, Cinzel, Georgia, serif; letter-spacing: .06em;
    text-transform: uppercase; padding: 0 .1em;
    background: linear-gradient(180deg,
      var(--arc-gold, #ffd23f) 0 40%,
      var(--arc-orange, #ff8c1a) 40% 70%,
      var(--arc-red, #e5261e) 70% 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(4px 0 0 var(--ink, #0d0a14)) drop-shadow(-4px 0 0 var(--ink, #0d0a14))
      drop-shadow(0 4px 0 var(--ink, #0d0a14)) drop-shadow(0 -4px 0 var(--ink, #0d0a14))
      drop-shadow(4px 4px 0 var(--ink, #0d0a14)) drop-shadow(-4px 4px 0 var(--ink, #0d0a14))
      drop-shadow(4px -4px 0 var(--ink, #0d0a14)) drop-shadow(-4px -4px 0 var(--ink, #0d0a14))
      drop-shadow(0 8px 0 var(--ink, #0d0a14));
    transform: skewX(-4deg);
    animation: tr-slam .32s cubic-bezier(.34, 1.56, .64, 1) both; }
  .tr-cap.small h1 { font-size: 58px; }
  .tr-cap.huge h1 { font-size: 136px; letter-spacing: .1em; }
  .tr-cap p { margin: 18px 0 0; font: 400 26px/1.3 'Press Start 2P', 'Pixelify Sans', system-ui, sans-serif;
    letter-spacing: .1em; text-transform: uppercase;
    color: var(--bone, #f4f1e8);
    text-shadow: 2px 0 0 var(--ink, #0d0a14), -2px 0 0 var(--ink, #0d0a14),
                 0 2px 0 var(--ink, #0d0a14), 0 -2px 0 var(--ink, #0d0a14), 0 4px 0 var(--ink, #0d0a14);
    animation: tr-in .4s .12s both; }
  .tr-cap.out { animation: tr-out .22s both; }
  /* Lands, with the overshoot the game's own slams use (EASE_SNAP). */
  @keyframes tr-slam { 0% { transform: scale(1.9) skewX(-4deg); opacity: 0; }
    55% { transform: scale(.96) skewX(-4deg); opacity: 1; } 100% { transform: scale(1) skewX(-4deg); } }
  @keyframes tr-in { from { opacity: 0 } }
  @keyframes tr-out { to { opacity: 0; transform: translateY(-8px) } }

  /* --- the ring that points at a card ----------------------------------
     Concentric hard rings, like every other halo in the game — this was a
     34px bloom with a 22px inner glow and a 14px radius. */
  .tr-ring { position: fixed; border-radius: 4px; pointer-events: none;
    box-shadow:
      0 0 0 4px var(--arc-gold, #ffd23f),
      0 0 0 8px var(--ink, #0d0a14),
      0 0 0 12px color-mix(in srgb, var(--arc-gold, #ffd23f) 45%, transparent),
      0 0 0 16px color-mix(in srgb, var(--arc-gold, #ffd23f) 18%, transparent);
    animation: tr-ring .45s cubic-bezier(.34, 1.56, .64, 1) both; }
  .tr-ring.out { animation: tr-out .25s both; }
  @keyframes tr-ring { 0% { transform: scale(1.6); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }

  /* --- the title and end cards ----------------------------------------- */
  .tr-full { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
    /* Three tones of night, hard-stepped. The backdrop-filter blur that used
       to sit on top of this was the only blur left anywhere in the product. */
    background: radial-gradient(ellipse at 50% 46%,
      rgba(43, 34, 102, .94) 0 34%,
      rgba(20, 16, 43, .97) 34% 66%,
      rgba(13, 10, 20, .99) 66% 100%);
    animation: tr-in .18s both; }
  .tr-full svg { width: 210px; height: 210px; animation: tr-emblem .6s cubic-bezier(.34, 1.56, .64, 1) both;
    filter: drop-shadow(4px 4px 0 var(--ink, #0d0a14)); }
  @keyframes tr-emblem { 0% { transform: scale(.4) rotate(-30deg); opacity: 0 } 100% { transform: none; opacity: 1 } }
  .tr-full .word { margin-top: 18px; font: 400 150px/1 Bungee, Cinzel, Georgia, serif; letter-spacing: .2em; margin-right: -.2em;
    background: linear-gradient(180deg,
      var(--arc-gold, #ffd23f) 0 40%,
      var(--arc-orange, #ff8c1a) 40% 70%,
      var(--arc-red, #e5261e) 70% 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;
    filter:
      drop-shadow(6px 0 0 var(--ink, #0d0a14)) drop-shadow(-6px 0 0 var(--ink, #0d0a14))
      drop-shadow(0 6px 0 var(--ink, #0d0a14)) drop-shadow(0 -6px 0 var(--ink, #0d0a14))
      drop-shadow(4px 4px 0 var(--ink, #0d0a14)) drop-shadow(-4px 4px 0 var(--ink, #0d0a14))
      drop-shadow(0 12px 0 var(--ink, #0d0a14));
    transform: skewX(-4deg);
    animation: tr-word .42s .08s cubic-bezier(.34, 1.56, .64, 1) both; }
  @keyframes tr-word { 0% { transform: scale(2.6) skewX(-4deg); opacity: 0 }
    60% { transform: scale(.97) skewX(-4deg); opacity: 1 } 100% { transform: scale(1) skewX(-4deg) } }
  .tr-full .rule { width: 760px; height: 0; border-top: 4px solid var(--arc-gold, #ffd23f); margin: 34px 0 30px; animation: tr-grow .5s .35s both; }
  @keyframes tr-grow { from { transform: scaleX(0) } }
  .tr-full .line { font: 400 44px/1.3 'Pixelify Sans', Inter, system-ui, sans-serif; letter-spacing: .04em;
    color: var(--bone, #f4f1e8); text-align: center;
    text-shadow: 0 4px 0 var(--ink, #0d0a14); animation: tr-in .45s both; }
  .tr-full .cta { margin-top: 46px; padding: 22px 54px;
    font: 400 38px/1 Bungee, Inter, system-ui, sans-serif; letter-spacing: .14em;
    color: var(--ink, #0d0a14); background: var(--arc-gold, #ffd23f); border-radius: 0;
    box-shadow: 0 0 0 4px var(--ink, #0d0a14), 8px 8px 0 var(--ink, #0d0a14);
    animation: tr-cta .5s cubic-bezier(.34, 1.56, .64, 1) both; }
  @keyframes tr-cta { 0% { transform: scale(.6); opacity: 0 } 100% { transform: scale(1); opacity: 1 } }
  .tr-full .fine { margin-top: 36px; font: 400 24px/1 'Press Start 2P', 'Pixelify Sans', system-ui, sans-serif; letter-spacing: .12em;
    color: var(--bone-2, #c2bedb); text-shadow: 0 2px 0 var(--ink, #0d0a14); animation: tr-in .5s both; }
  /* The impact frame, in the palette's own white. */
  .tr-flash { position: absolute; inset: 0; background: var(--bone, #f4f1e8); animation: tr-flash .22s both; }
  @keyframes tr-flash { from { opacity: .85 } to { opacity: 0 } }
  .tr-dim { position: absolute; inset: 0;
    background: radial-gradient(ellipse at 50% 50%,
      rgba(13, 10, 20, 0) 0 34%, rgba(13, 10, 20, .3) 34% 64%, rgba(13, 10, 20, .6) 64% 100%);
    animation: tr-in .3s both; }
`;


/** Runs in the page (page.evaluate serialises it): builds both layers and window.__tr. */
export function installOverlays(cssText) {
  const css = document.createElement('style');
  css.textContent = cssText;
  document.head.appendChild(css);
  const screen = document.createElement('div'); screen.id = 'tr-screen';
  const world = document.createElement('div'); world.id = 'tr-world';
  document.documentElement.appendChild(world);
  document.documentElement.appendChild(screen);
  const add = (parent, cls, html) => { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; parent.appendChild(d); return d; };
  const EMBLEM = '<svg viewBox="0 0 120 120"><defs><linearGradient id="trgold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--arc-gold, #ffd23f)"/><stop offset="100%" stop-color="var(--arc-red, #e5261e)"/></linearGradient></defs>'
    + '<circle cx="60" cy="60" r="54" fill="none" stroke="url(#trgold)" stroke-width="1.2" opacity=".55"/>'
    + '<circle cx="60" cy="60" r="44" fill="none" stroke="url(#trgold)" stroke-width=".7" opacity=".35"/>'
    + '<path d="M60 14 L99 37 L99 83 L60 106 L21 83 L21 37 Z" fill="none" stroke="url(#trgold)" stroke-width="1.6"/>'
    + '<path d="M42 40 V80 M78 40 V80 M42 60 H78" fill="none" stroke="url(#trgold)" stroke-width="4" stroke-linecap="square"/></svg>';
  let cap = null;
  const rings = new Map();
  let ringSeq = 0;
  window.__tr = {
    caption(text, opts) {
      const o = opts || {};
      if (cap) { const c = cap; c.classList.add('out'); setTimeout(() => c.remove(), 230); }
      cap = add(screen, 'tr-cap ' + (o.pos || 'bottom') + (o.size ? ' ' + o.size : ''), '<h1></h1>' + (o.sub ? '<p></p>' : ''));
      cap.querySelector('h1').textContent = text;
      if (o.sub) cap.querySelector('p').textContent = o.sub;
    },
    hush() { if (!cap) return; const c = cap; cap = null; c.classList.add('out'); setTimeout(() => c.remove(), 230); },
    /** A cut: nothing of the last shot's layer survives into the next one. */
    cut() {
      cap = null;
      screen.querySelectorAll('.tr-cap').forEach((e) => e.remove());
      for (const r of rings.values()) r.el.remove();
      rings.clear();
    },
    /** A gold ring that follows an element (by selector) until it is cleared. */
    ring(selector, pad) {
      const id = ++ringSeq;
      const el = add(world, 'tr-ring');
      rings.set(id, { el, selector, pad: pad ?? 8 });
      this.placeRings();
      return id;
    },
    unring(id) {
      const ids = id === undefined ? [...rings.keys()] : [id];
      for (const k of ids) { const r = rings.get(k); if (!r) continue; rings.delete(k); r.el.classList.add('out'); setTimeout(() => r.el.remove(), 260); }
    },
    placeRings() {
      for (const r of rings.values()) {
        const t = document.querySelector(r.selector);
        if (!t) { r.el.style.opacity = '0'; continue; }
        const b = t.getBoundingClientRect();
        if (!b.width) { r.el.style.opacity = '0'; continue; }
        r.el.style.opacity = '';
        Object.assign(r.el.style, { left: (b.left - r.pad) + 'px', top: (b.top - r.pad) + 'px', width: (b.width + 2 * r.pad) + 'px', height: (b.height + 2 * r.pad) + 'px' });
      }
    },
    title(line) {
      return add(screen, 'tr-full', EMBLEM + '<div class="word">HEXHOLD</div><div class="rule"></div><div class="line"></div>')
        .querySelector('.line').textContent = line;
    },
    endCard(line, cta, fine) {
      const e = add(screen, 'tr-full', EMBLEM + '<div class="word">HEXHOLD</div><div class="rule"></div>');
      const l = add(e, 'line'); l.textContent = line; l.style.animationDelay = '.5s';
      setTimeout(() => { const c = add(e, 'cta'); c.textContent = cta; }, 1000);
      setTimeout(() => { const f = add(e, 'fine'); f.textContent = fine; }, 1500);
    },
    clearFull() { screen.querySelectorAll('.tr-full').forEach((e) => e.remove()); },
    flash() { const f = add(screen, 'tr-flash'); setTimeout(() => f.remove(), 260); },
    dim(on) { if (on) add(screen, 'tr-dim'); else screen.querySelectorAll('.tr-dim').forEach((e) => e.remove()); },
    /** One video frame: advance the game clock, place the layers over the camera, hand back the sounds. */
    async frame(dt, cam, want) {
      // Everything the server sent this step arrives before the clock moves,
      // and React has rendered it before the picture is taken.
      for (let i = 0; i < 500 && (window.__rx || 0) < want; i++) await window.__vt.sleep(2);
      await window.__vt.sleep(0);
      window.__vt.advance(dt);
      this.placeRings();
      screen.style.left = cam.x + 'px';
      screen.style.top = cam.y + 'px';
      screen.style.transform = 'scale(' + (cam.w / 1920) + ')';
      const s = window.__sounds; window.__sounds = [];
      return { sounds: s, text: this.readable() };
    },
    /**
     * Every piece of text a viewer is meant to read, as it stands this frame:
     * the text card, the game's cut-in banner and its line, the showdown's
     * winning row, the words typed on the Blank Page, the end card. The
     * recorder times how long each one is on screen (legibility.json).
     */
    readable() {
      const out = {};
      // What a reader sees once it has settled: decoding letters and other
      // aria-hidden decoration are left out, so a line is one line.
      const txt = (el) => {
        if (!el) return '';
        const c = el.cloneNode(true);
        c.querySelectorAll('[aria-hidden="true"]').forEach((e) => e.remove());
        const words = (c.textContent || '').replace(/\s+/g, ' ').trim();
        // The game decodes some lines letter by letter (DecodeText): until
        // every letter has settled the line is not yet readable.
        const live = [...el.querySelectorAll('.hx-decode__live')];
        const settled = live.every((b) => b.textContent === b.getAttribute('data-decode-live'));
        return settled ? words : words + ' [decoding]';
      };
      if (cap && !cap.classList.contains('out')) out.card = txt(cap.querySelector('h1'));
      const bt = document.querySelector('.hx-banner__title');
      if (bt) out.banner = txt(bt) + (document.querySelector('.hx-banner__sub') ? ' / ' + txt(document.querySelector('.hx-banner__sub')) : '');
      const row = document.querySelector('.showdown-list > li');
      if (row) out.showdown = txt(row).slice(0, 80);
      const typed = document.querySelector('.scribe-input');
      if (typed && typed.value) out.typed = typed.value;
      const read = document.querySelectorAll('.scribe-chip');
      if (read.length) out.reading = [...read].map(txt).join(' + ');
      for (const k of ['line', 'cta', 'fine']) {
        const e = screen.querySelector('.tr-full .' + k);
        if (e) out['end_' + k] = txt(e);
      }
      const w = screen.querySelector('.tr-full .word');
      if (w) out.title = txt(w) + (screen.querySelector('.tr-full .line') ? ' / ' + txt(screen.querySelector('.tr-full .line')) : '');
      return out;
    },
  };
}
