/* ===========================================================================
   HEXHOLD — VfxLayer
   ---------------------------------------------------------------------------
   One full-screen canvas, one overlay stack, one RAF loop, one module-level
   controller. Any component anywhere can call `vfx.burst(...)` without a
   single prop being drilled.

   The layer is portalled to <body> on purpose: camera shake and the chromatic
   filter are applied to the *app root*, and a CSS `filter` creates a
   containing block for fixed-position descendants. Keeping the fx layer
   outside that root means particles never inherit the shake they caused.
   =========================================================================== */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ParticleSystem,
  prefersReducedMotion,
  resolvePreset,
  type PresetName,
  type PresetOptions,
  type Vec2,
} from './particles';
import './effects.css';

import type { CSSProperties } from 'react';

/** `style` objects that are allowed to carry CSS custom properties. */
export type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

/** Options accepted by `vfx.burst`. Extra keys are tolerated and ignored. */
export interface BurstOptions extends PresetOptions {
  [key: string]: unknown;
}

/* --------------------------------------------------------------------------
   Decaying value noise — the camera shake's motor.
   Deterministic, allocation free, and far more organic than a keyframe.
   -------------------------------------------------------------------------- */

function hash1(n: number): number {
  const v = Math.sin(n * 127.1) * 43758.5453123;
  return v - Math.floor(v);
}

function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1;
}

/* -------------------------------------------------------------------------- */

const SHAKE_SLOTS = 8;
const SHAKE_FREQ = 44;
const SHAKE_CLAMP_PX = 34;
const SHAKE_CLAMP_DEG = 2.2;
const FLASH_DECAY = 0.26;
const QUEUE_LIMIT = 64;

interface ShakeSlot {
  t: number;
  dur: number;
  power: number;
  seed: number;
  active: boolean;
}

interface Attachment {
  layer: HTMLElement;
  system: ParticleSystem;
  flash: HTMLElement;
  vignette: HTMLElement;
  splitA: SVGFEOffsetElement | null;
  splitB: SVGFEOffsetElement | null;
}

/* ==========================================================================
   The engine. One instance per document; `vfx` below is its public face.
   ========================================================================== */

class VfxEngine {
  private att: Attachment | null = null;
  private rootEl: HTMLElement | null = null;
  private rootSet = false;
  private readonly queue: Array<() => void> = [];

  private readonly shakes: ShakeSlot[] = [];
  private shakeActive = false;

  private flashAmp = 0;
  private flashColor = '#ffffff';
  private flashApplied = -1;

  private chromaT = 0;
  private chromaDur = 0;
  private chromaOn = false;

  private vigT = 0;
  private vigOn = false;

  private slowT = 0;
  private slowDur = 0;
  private slowFrom = 1;
  private slowApplied = 1;

  constructor() {
    for (let i = 0; i < SHAKE_SLOTS; i++) {
      this.shakes.push({ t: 0, dur: 0, power: 0, seed: 0, active: false });
    }
  }

  /* ---------------------------------------------------------- lifecycle -- */

  attach(att: Attachment): void {
    this.att = att;
    const pending = this.queue.splice(0, this.queue.length);
    for (let i = 0; i < pending.length; i++) pending[i]();
  }

  detach(): void {
    this.resetRootStyles();
    this.att = null;
  }

  /** True once <VfxLayer /> has mounted and the canvas is live. */
  get ready(): boolean {
    return this.att !== null;
  }

  /** Live particle count — handy for a debug HUD. */
  get particleCount(): number {
    return this.att === null ? 0 : this.att.system.count;
  }

  setRoot(el: HTMLElement | null): void {
    this.resetRootStyles();
    this.rootEl = el;
    this.rootSet = true;
  }

  private root(): HTMLElement | null {
    if (this.rootSet) return this.rootEl;
    if (typeof document === 'undefined') return null;
    return document.getElementById('root') ?? document.body;
  }

  /** Shake/chromatic are skipped when the root would drag the fx layer along. */
  private transformableRoot(): HTMLElement | null {
    const r = this.root();
    if (r === null) return null;
    const layer = this.att?.layer;
    if (layer && r.contains(layer)) return null;
    return r;
  }

  private resetRootStyles(): void {
    const r = this.root();
    if (r === null) return;
    r.classList.remove('vfx-shaking', 'vfx-chromatic');
    r.style.transform = '';
  }

  private defer(fn: () => void): void {
    if (this.queue.length < QUEUE_LIMIT) this.queue.push(fn);
  }

  /* --------------------------------------------------------- particles -- */

  burst(preset: PresetName | (string & {}), at: Vec2, opts?: BurstOptions): void {
    const att = this.att;
    if (att === null) {
      const frozen: Vec2 = { x: at.x, y: at.y };
      this.defer(() => {
        this.burst(preset, frozen, opts);
      });
      return;
    }
    const specs = resolvePreset(preset, at, opts);
    if (specs === null) {
      if (import.meta.env?.DEV) console.warn(`[vfx] unknown preset "${preset}"`);
      return;
    }
    att.system.emitAll(specs);
  }

  burstAtEl(
    preset: PresetName | (string & {}),
    el: Element | null,
    opts?: BurstOptions,
  ): void {
    const at = centerOf(el);
    if (at === null) return;
    this.burst(preset, at, opts);
  }

  /** Remove every live particle immediately. */
  clear(): void {
    this.att?.system.clear();
  }

  /* ------------------------------------------------------------- shake -- */

  shake(power: number, ms = 420): void {
    if (power <= 0 || ms <= 0) return;
    // Camera shake is the one effect with no calm version: it moves the entire
    // viewport, which is precisely the vestibular trigger reduced motion
    // exists for. Suppressed outright rather than attenuated.
    //
    // This check lives here, not in CSS, because the shake transform is now
    // written to `root.style.transform` inline — an inline declaration beats
    // any author rule, so the `.vfx-shaking { transform: none }` that used to
    // do this job could no longer reach it.
    if (prefersReducedMotion()) return;
    const p = power;
    if (p < 0.05) return;
    // Find a free slot, otherwise steal the weakest — repeated calls stack.
    let slot: ShakeSlot | null = null;
    let weakest: ShakeSlot = this.shakes[0];
    for (let i = 0; i < this.shakes.length; i++) {
      const sl = this.shakes[i];
      if (!sl.active) { slot = sl; break; }
      const left = sl.power * (1 - sl.t / sl.dur);
      const wLeft = weakest.power * (1 - weakest.t / weakest.dur);
      if (left < wLeft) weakest = sl;
    }
    const s = slot ?? weakest;
    s.t = 0;
    s.dur = ms / 1000;
    s.power = p;
    s.seed = Math.random() * 500;
    s.active = true;
    this.shakeActive = true;
  }

  private tickShake(dt: number): void {
    if (!this.shakeActive) return;
    let x = 0;
    let y = 0;
    let rot = 0;
    let any = false;

    for (let i = 0; i < this.shakes.length; i++) {
      const s = this.shakes[i];
      if (!s.active) continue;
      s.t += dt;
      if (s.t >= s.dur) { s.active = false; continue; }
      any = true;
      const k = 1 - s.t / s.dur;
      const amp = s.power * k * k; // quadratic decay: punchy, settles clean
      const f = s.t * SHAKE_FREQ;
      x += noise1(f + s.seed) * amp;
      y += noise1(f + s.seed + 31.7) * amp * 0.82;
      rot += noise1(f * 0.62 + s.seed + 71.3) * amp * 0.055;
    }

    const root = this.transformableRoot();
    if (root === null) { this.shakeActive = any; return; }

    if (!any) {
      this.shakeActive = false;
      root.classList.remove('vfx-shaking');
      root.style.transform = '';
      return;
    }

    const cx = clamp(x, -SHAKE_CLAMP_PX, SHAKE_CLAMP_PX);
    const cy = clamp(y, -SHAKE_CLAMP_PX, SHAKE_CLAMP_PX);
    const cr = clamp(rot, -SHAKE_CLAMP_DEG, SHAKE_CLAMP_DEG);
    root.classList.add('vfx-shaking');
    // Written straight onto the element rather than routed through three
    // inherited custom properties. Nothing but this element ever read them,
    // and a custom property on the app root invalidates computed style for
    // every descendant — six seats, ~17 cards, the rail and the action bar —
    // on each of the 60 frames a shake runs for.
    root.style.transform =
      `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0) rotate(${cr.toFixed(3)}deg)`;
  }

  /* ------------------------------------------------------------- flash -- */

  flash(color: string, power = 0.55): void {
    const p = clamp(prefersReducedMotion() ? power * 0.25 : power, 0, 1);
    if (p <= 0) return;
    this.flashColor = color;
    if (p > this.flashAmp) this.flashAmp = p;
    const att = this.att;
    if (att !== null) att.flash.style.setProperty('--vfx-flash-color', color);
    else this.defer(() => { this.att?.flash.style.setProperty('--vfx-flash-color', this.flashColor); });
  }

  private tickFlash(dt: number): void {
    const att = this.att;
    if (att === null) return;
    if (this.flashAmp <= 0) {
      if (this.flashApplied !== 0) {
        att.flash.style.opacity = '0';
        this.flashApplied = 0;
      }
      return;
    }
    this.flashAmp -= dt / FLASH_DECAY;
    if (this.flashAmp < 0) this.flashAmp = 0;
    const o = this.flashAmp * this.flashAmp; // quick decay
    att.flash.style.opacity = o.toFixed(3);
    this.flashApplied = o;
  }

  /* ---------------------------------------------------------- vignette -- */

  vignette(color: string, ms: number): void {
    const att = this.att;
    if (att === null) { this.defer(() => { this.vignette(color, ms); }); return; }
    const el = att.vignette;
    el.style.setProperty('--vfx-vignette-color', color);
    // In, then out over the same window. The fade-in is kept short so a long
    // `ms` reads as a hold rather than a slow ramp, which is what the old
    // three-stop keyframe did.
    el.style.setProperty('--vfx-vignette-ms', `${Math.max(1, Math.min(220, ms * 0.3))}ms`);
    el.classList.add('is-on');
    this.vigT = ms / 1000;
    this.vigOn = true;
  }

  private tickVignette(dt: number): void {
    if (!this.vigOn) return;
    this.vigT -= dt;
    if (this.vigT > 0) return;
    this.vigOn = false;
    this.att?.vignette.classList.remove('is-on');
  }

  /* --------------------------------------------------------- chromatic -- */

  chromatic(ms = 260): void {
    if (prefersReducedMotion()) return;
    const att = this.att;
    if (att === null) { this.defer(() => { this.chromatic(ms); }); return; }
    this.chromaDur = Math.max(0.05, ms / 1000);
    this.chromaT = 0;
    if (!this.chromaOn) {
      this.chromaOn = true;
      this.transformableRoot()?.classList.add('vfx-chromatic');
    }
  }

  private tickChromatic(dt: number): void {
    if (!this.chromaOn) return;
    this.chromaT += dt;
    const p = this.chromaT / this.chromaDur;
    const att = this.att;
    if (p >= 1) {
      this.chromaOn = false;
      this.setSplit(att, 0);
      this.transformableRoot()?.classList.remove('vfx-chromatic');
      return;
    }
    const k = 1 - p;
    this.setSplit(att, k * k * 3.6);
  }

  private setSplit(att: Attachment | null, d: number): void {
    if (att === null) return;
    const v = d.toFixed(2);
    // The SVG filter's own offsets — the only live consumer. There used to be
    // a `--vfx-ab` custom property written to the app root beside this, for a
    // `.vfx-chromatic-cheap` text-shadow fallback; nothing in the codebase
    // ever added that class, so it was a per-frame style invalidation of the
    // entire table for a rule that could not match.
    att.splitA?.setAttribute('dx', v);
    att.splitB?.setAttribute('dx', `-${v}`);
  }

  /* ----------------------------------------------------------- slow-mo -- */

  slowmo(scale: number, ms: number): void {
    const s = clamp(scale, 0.05, 4);
    this.slowFrom = s;
    this.slowDur = Math.max(0.001, ms / 1000);
    this.slowT = 0;
    this.applySlow(s);
  }

  private tickSlowmo(dt: number): void {
    if (this.slowApplied === 1 && this.slowT >= this.slowDur) return;
    this.slowT += dt;
    const p = this.slowT / this.slowDur;
    if (p >= 1) { this.applySlow(1); return; }
    const e = 1 - (1 - p) * (1 - p) * (1 - p); // ease-out cubic back to normal
    this.applySlow(this.slowFrom + (1 - this.slowFrom) * e);
  }

  /**
   * The ramp still runs, so `vfx.slowmo()` keeps its shape and its callers
   * (`fxbridge.ts` fires it on an impossible hand). It no longer publishes
   * `--vfx-time-scale` on <html>: nothing in the app ever read that property —
   * the usage documented in README.md was never written — and writing it per
   * frame on the document root is the broadest style invalidation available.
   *
   * If a consumer is ever added, read it in one place rather than inheriting
   * it to the whole document.
   */
  private applySlow(v: number): void {
    this.slowApplied = Math.round(v * 1000) / 1000;
  }

  /* ------------------------------------------------------- compositions -- */

  timeRipple(at: Vec2): void {
    this.burst('rewindRipple', at);
    this.chromatic(340);
    this.slowmo(0.55, 620);
    this.flash('#6ee7ff', 0.12);
  }

  confetti(at?: Vec2): void {
    const target: Vec2 = at ?? {
      x: typeof window === 'undefined' ? 640 : window.innerWidth * 0.5,
      y: -20,
    };
    this.burst('confetti', target);
  }

  /* --------------------------------------------------------------- loop -- */

  tick(dt: number): void {
    this.tickShake(dt);
    this.tickFlash(dt);
    this.tickVignette(dt);
    this.tickChromatic(dt);
    this.tickSlowmo(dt);
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Viewport-space centre of an element, or null if it has no box. */
export function centerOf(el: Element | null): Vec2 | null {
  if (el === null || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0 && r.left === 0 && r.top === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/* ==========================================================================
   The public controller
   ========================================================================== */

const engine = new VfxEngine();

export interface VfxController {
  /** Fire a named preset at a viewport-space point. */
  burst(preset: PresetName | (string & {}), at: Vec2, opts?: BurstOptions): void;
  /** Fire a named preset at the centre of a DOM element. */
  burstAtEl(preset: PresetName | (string & {}), el: Element | null, opts?: BurstOptions): void;
  /** Camera shake, in pixels of travel. 4 = a tap, 26 = the table is unhappy. */
  shake(power: number, ms?: number): void;
  /** Full-screen colour flash. `power` is peak opacity, 0..1. */
  flash(color: string, power?: number): void;
  /** Pulsing coloured vignette for `ms`. */
  vignette(color: string, ms: number): void;
  /** Brief RGB split across the whole app. */
  chromatic(ms?: number): void;
  /** The full rewind package: rings, split, slow-mo, a cold flash. */
  timeRipple(at: Vec2): void;
  /** Run a slow-mo ramp back to 1 over `ms`. Currently has no consumer — see
   *  the note on `applySlow`. Kept because `fxbridge` composes it into the
   *  impossible-hand sequence. */
  slowmo(scale: number, ms: number): void;
  /** Celebration. Defaults to raining from the top of the viewport. */
  confetti(at?: Vec2): void;
  /** The element shake and chromatic aberration are applied to. */
  setRoot(el: HTMLElement | null): void;
  /** Kill every live particle. */
  clear(): void;
  /** Has <VfxLayer /> mounted yet? Calls made before it does are queued. */
  readonly ready: boolean;
  /** Live particle count. */
  readonly particleCount: number;
}

export const vfx: VfxController = {
  burst: (preset, at, opts) => { engine.burst(preset, at, opts); },
  burstAtEl: (preset, el, opts) => { engine.burstAtEl(preset, el, opts); },
  shake: (power, ms) => { engine.shake(power, ms); },
  flash: (color, power) => { engine.flash(color, power); },
  vignette: (color, ms) => { engine.vignette(color, ms); },
  chromatic: (ms) => { engine.chromatic(ms); },
  timeRipple: (at) => { engine.timeRipple(at); },
  slowmo: (scale, ms) => { engine.slowmo(scale, ms); },
  confetti: (at) => { engine.confetti(at); },
  setRoot: (el) => { engine.setRoot(el); },
  clear: () => { engine.clear(); },
  get ready(): boolean { return engine.ready; },
  get particleCount(): number { return engine.particleCount; },
};

/* ==========================================================================
   Film grain tile — generated once, cached, served as a data URI
   ========================================================================== */

let grainUrl: string | null = null;

function noiseDataUri(size = 128): string {
  if (grainUrl !== null) return grainUrl;
  if (typeof document === 'undefined') return '';
  try {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    if (ctx === null) return '';
    const img = ctx.createImageData(size, size);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const v = 120 + ((Math.random() * 135) | 0);
      d[i] = v;
      d[i + 1] = v;
      d[i + 2] = v;
      d[i + 3] = 10 + ((Math.random() * 46) | 0);
    }
    ctx.putImageData(img, 0, 0);
    grainUrl = c.toDataURL('image/png');
    return grainUrl;
  } catch {
    return '';
  }
}

/* ==========================================================================
   <VfxLayer />
   ========================================================================== */

export interface VfxLayerProps {
  /** Animated film grain over the whole app. Default true. */
  grain?: boolean;
  /** CRT scanlines. Off by default — it is a lot on a poker table. */
  scanlines?: boolean;
  /** Slow ambient motes drifting over the felt. Default true. */
  ambientDust?: boolean;
  /** Shortcut for `vfx.setRoot`. */
  root?: HTMLElement | null;
  /** Grain opacity override, 0..1. */
  grainOpacity?: number;
}

const DUST_INTERVAL = 5.5;

export function VfxLayer({
  grain = true,
  scanlines = false,
  ambientDust = true,
  root,
  grainOpacity,
}: VfxLayerProps = {}): JSX.Element {
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const splitARef = useRef<SVGFEOffsetElement>(null);
  const splitBRef = useRef<SVGFEOffsetElement>(null);
  const dustRef = useRef(ambientDust);

  // The layer always renders into <body>, never inside the shaken app root.
  const [host] = useState<HTMLElement | null>(() =>
    typeof document === 'undefined' ? null : document.body,
  );

  useEffect(() => {
    dustRef.current = ambientDust;
  }, [ambientDust]);

  useEffect(() => {
    if (root !== undefined) vfx.setRoot(root);
  }, [root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const layer = layerRef.current;
    const flash = flashRef.current;
    const vignette = vignetteRef.current;
    if (canvas === null || layer === null || flash === null || vignette === null) return;

    let system: ParticleSystem;
    try {
      system = new ParticleSystem(canvas);
    } catch {
      return; // No 2D context. The game still plays, it is just quieter.
    }

    const grainEl = grainRef.current;
    if (grainEl !== null && grain) {
      const url = noiseDataUri();
      if (url.length > 0) grainEl.style.backgroundImage = `url(${url})`;
    }

    engine.attach({
      layer,
      system,
      flash,
      vignette,
      splitA: splitARef.current,
      splitB: splitBRef.current,
    });

    let raf = 0;
    let last = performance.now();
    let dustClock = 1.2;

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      engine.tick(dt);

      if (dustRef.current) {
        dustClock -= dt;
        if (dustClock <= 0) {
          dustClock = DUST_INTERVAL;
          vfx.burst('dust', { x: window.innerWidth / 2, y: window.innerHeight / 2 });
        }
      }

      system.update(dt);
      system.render();
    };
    raf = requestAnimationFrame(frame);

    const onResize = (): void => { system.resize(); };
    window.addEventListener('resize', onResize, { passive: true });
    window.addEventListener('orientationchange', onResize, { passive: true });

    const onVisibility = (): void => {
      if (!document.hidden) last = performance.now();
    };
    document.addEventListener('visibilitychange', onVisibility);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onResize);
      ro.observe(layer);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      ro?.disconnect();
      engine.detach();
      system.dispose();
    };
  }, [grain, host]);

  const grainStyle: CSSVars = {
    '--vfx-grain-opacity': grainOpacity ?? (prefersReducedMotion() ? 0.025 : 0.045),
  };

  if (host === null) return <></>;

  const tree = (
    <div className="vfx-layer" ref={layerRef} aria-hidden="true">
      <canvas className="vfx-canvas" ref={canvasRef} />
      <div className="vfx-flash" ref={flashRef} />
      <div className="vfx-vignette" ref={vignetteRef} />
      {grain ? <div className="vfx-grain" ref={grainRef} style={grainStyle} /> : null}
      {scanlines ? <div className="vfx-scanlines" /> : null}
      <svg className="vfx-defs" aria-hidden="true" focusable="false">
        <defs>
          <filter
            id="vfx-rgb-split"
            x="-4%"
            y="-4%"
            width="108%"
            height="108%"
            colorInterpolationFilters="sRGB"
          >
            <feOffset in="SourceGraphic" dx="0" dy="0" result="shiftA" ref={splitARef} />
            <feColorMatrix
              in="shiftA"
              type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="chanR"
            />
            <feOffset in="SourceGraphic" dx="0" dy="0" result="shiftB" ref={splitBRef} />
            <feColorMatrix
              in="shiftB"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
              result="chanB"
            />
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
              result="chanG"
            />
            <feBlend in="chanR" in2="chanG" mode="screen" result="chanRG" />
            <feBlend in="chanRG" in2="chanB" mode="screen" />
          </filter>
        </defs>
      </svg>
    </div>
  );

  return createPortal(tree, host);
}

export default VfxLayer;
