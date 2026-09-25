/* ===========================================================================
   HEXHOLD — particle system
   ---------------------------------------------------------------------------
   A dependency-free 2D canvas particle engine sized for a game, not a demo.

   Design rules, in order of importance:
     1. Never allocate inside update() or render(). Everything is pooled.
     2. Fast attack, quick decay. A burst reads in ~300ms and is gone.
     3. Never obscure the cards. Low counts, small shapes, additive glow only.
     4. Degrade under prefers-reduced-motion instead of disappearing.
   =========================================================================== */

/** The six schools of HEXHOLD. Mirrors `School` in `@shared/sigils` on purpose:
 *  the vfx layer stays importable with zero project coupling. */
export type School = 'entropy' | 'veil' | 'chronos' | 'bind' | 'ruin' | 'weave';

export type ParticleShape = 'dot' | 'spark' | 'glyph' | 'ring' | 'shard' | 'coin';
export type FadeMode = 'linear' | 'ease' | 'flicker';

export interface Vec2 {
  x: number;
  y: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: ParticleShape;
  rot: number;
  vrot: number;
  gravity: number;
  drag: number;
  glow: number;
  glyph?: string;
  fade: FadeMode;
}

/**
 * A burst descriptor. Everything except `origin`, `count`, `speed`, `life`,
 * `size`, `colors` and `shape` is optional and has a sane default.
 */
export interface EmitSpec {
  /** Screen-space pixel origin of the burst. */
  origin: Vec2;
  /** How many particles to attempt. Clamped by the global cap. */
  count: number;
  /** Initial speed range, px/s. Negative speeds travel *inward*. */
  speed: [number, number];
  /** Emission direction range in radians. Defaults to a full circle. */
  angle?: [number, number];
  /** Extra random angular jitter, radians, added on top of `angle`. */
  spread?: number;
  /** Distribute particles evenly across `angle` instead of randomly. */
  even?: boolean;
  /** Spawn on a ring of this radius around the origin (min, max). */
  radius?: [number, number];
  /** Spawn inside a box of these half-extents around the origin. */
  area?: [number, number];
  /** Lifetime range, seconds. */
  life: [number, number];
  /** Size range, px (radius for dots/rings, half-height for shards). */
  size: [number, number];
  /** Colours, picked at random per particle. Hex, rgb() or rgba(). */
  colors: string[];
  shape: ParticleShape;
  /** Downward acceleration, px/s². Negative rises. */
  gravity?: number;
  /** Velocity damping per second. ~0 floats, ~3 stops hard. */
  drag?: number;
  /** 0 = flat (drawn normally), > 0 = additive with a soft halo. */
  glow?: number;
  /** Glyph pool for `shape: 'glyph'`. */
  glyphs?: string[];
  fade?: FadeMode;
  /** Initial rotation range, radians. */
  rot?: [number, number];
  /** Angular velocity range, rad/s. */
  spin?: [number, number];
  /** Size multiplier gained across the particle's life. Rings need this. */
  grow?: number;
  /** An attractor the particles accelerate toward. */
  target?: Vec2;
  /** Attraction strength toward `target`, px/s². */
  attraction?: number;
  /** Overall alpha multiplier, 0..1. Ghostly things live here. */
  alpha?: number;
  /** Fire this burst `delay` seconds from now. */
  delay?: number;
}

/** Internal fields the public `Particle` shape does not expose. */
interface Pooled extends Particle {
  amp: number;
  grow: number;
  seed: number;
  tx: number;
  ty: number;
  attract: number;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
/** Hard ceiling. Past this the oldest bursts simply do not spawn. */
export const MAX_PARTICLES = 1400;
const MAX_DPR = 2;
const CULL_MARGIN = 340;
const MAX_PENDING = 48;
const SPRITE_SIZE = 64;

/** Arcane characters used by glyph particles and the <Runes> component. */
export const RUNE_GLYPHS: string[] = [
  '✶', '◈', '⟁', '✥', '∮', '≋', '⚚', '⌖', '⧉', '◐', '⟡', '✦', '☽', '⚯', '⍟', '⌬',
];

/* --------------------------------------------------------------------------
   Reduced motion
   -------------------------------------------------------------------------- */

let reduced = false;
let reducedForced: boolean | null = null;

if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = mq.matches;
  const onChange = (e: MediaQueryListEvent): void => {
    reduced = e.matches;
  };
  if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange);
}

/** The in-game accessibility toggle in Settings sets this on <html>, as a
 *  belt-and-braces alternative to the OS-level media query. */
function reducedByAttribute(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset.reducedMotion === '1';
}

/** The particle-density setting, published on <html> by videoPrefs.ts. An
 *  unset attribute means 'full', so a build without the settings module still
 *  renders every particle. */
function densityScale(): number {
  if (typeof document === 'undefined') return 1;
  const v = document.documentElement.dataset.particles;
  if (v === 'off') return 0;
  if (v === 'low') return 0.35;
  return 1;
}

/** True when the user asked for less motion (OS setting or the in-game
 *  toggle), or it was forced in code via `setReducedMotion`. */
export function prefersReducedMotion(): boolean {
  if (reducedForced !== null) return reducedForced;
  return reduced || reducedByAttribute();
}

/** Override the media query. Pass `null` to go back to following the OS. */
export function setReducedMotion(value: boolean | null): void {
  reducedForced = value;
}

/* --------------------------------------------------------------------------
   Small maths helpers — all allocation free
   -------------------------------------------------------------------------- */

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pick(list: string[]): string {
  return list.length === 0 ? '#ffffff' : list[(Math.random() * list.length) | 0];
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Re-express a colour with a new alpha. Only called when building sprites. */
export function withAlpha(color: string, a: number): string {
  if (color.charCodeAt(0) === 35 /* # */) {
    let r = 255;
    let g = 255;
    let b = 255;
    if (color.length === 4 || color.length === 5) {
      r = parseInt(color[1] + color[1], 16);
      g = parseInt(color[2] + color[2], 16);
      b = parseInt(color[3] + color[3], 16);
    } else if (color.length >= 7) {
      r = parseInt(color.slice(1, 3), 16);
      g = parseInt(color.slice(3, 5), 16);
      b = parseInt(color.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
  }
  if (color.startsWith('rgba(')) {
    const parts = color.slice(5, -1).split(',');
    const base = parts.length > 3 ? parseFloat(parts[3]) : 1;
    return `rgba(${parts[0]},${parts[1]},${parts[2]},${a * (Number.isFinite(base) ? base : 1)})`;
  }
  if (color.startsWith('rgb(')) {
    return `rgba(${color.slice(4, -1)},${a})`;
  }
  return color;
}

/* --------------------------------------------------------------------------
   Design tokens
   Colours come from `src/styles/tokens.css` when the document is available so
   a theme change is picked up for free, with the shipped values as fallbacks.
   -------------------------------------------------------------------------- */

let tokenCache: Map<string, string> | null = null;

/** Read a CSS custom property off `:root`, with a hard-coded fallback. */
export function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  if (tokenCache === null) tokenCache = new Map<string, string>();
  const hit = tokenCache.get(name);
  if (hit !== undefined) return hit;
  let value = fallback;
  try {
    const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (raw.length > 0) value = raw;
  } catch {
    value = fallback;
  }
  tokenCache.set(name, value);
  return value;
}

let paletteCache: Map<School, string[]> | null = null;

/** Drop cached token lookups. Call after swapping themes at runtime. */
export function refreshPalette(): void {
  tokenCache = null;
  paletteCache = null;
}

const SCHOOL_FALLBACK: Record<School, [string, string, string]> = {
  entropy: ['#b98cff', '#5b21b6', '#e9dcff'],
  veil: ['#6ec8ff', '#0369a1', '#d8f1ff'],
  chronos: ['#ffc861', '#b45309', '#ffeec4'],
  bind: ['#5eead4', '#0f766e', '#d4fff6'],
  ruin: ['#ff7a8a', '#9f1239', '#ffdbe0'],
  weave: ['#a8e063', '#4d7c0f', '#e8ffc4'],
};

/** Accent, deep and highlight for a school, read from tokens where possible. */
export function schoolColors(school: School): string[] {
  if (paletteCache === null) paletteCache = new Map<School, string[]>();
  const hit = paletteCache.get(school);
  if (hit !== undefined) return hit;
  const fb = SCHOOL_FALLBACK[school];
  const out = [
    token(`--${school}`, fb[0]),
    token(`--${school}-deep`, fb[1]),
    fb[2],
  ];
  paletteCache.set(school, out);
  return out;
}

const gold = (): string => token('--gold', '#f0c465');
/**
 * The colours a chip is, as opposed to the colour money is.
 *
 * Every chip particle in the game used to be drawn from the brass palette,
 * which made a pot being pushed read as a shower of sparks rather than as a
 * stack of clay being moved. `PotChips` moulds its pile in slate, oxblood and
 * brass; these are the same three, so a chip in the air and a chip on the
 * felt are recognisably the same object.
 */
const chipClay = (): string[] => ['#6e828c', '#3d4a52', '#bd6a6c', '#7d3438', '#f0c465', '#a67c2a'];
const goldHi = (): string => token('--gold-hi', '#ffe6a8');
const goldDeep = (): string => token('--gold-deep', '#a67c2a');

/* ==========================================================================
   ParticleSystem
   ========================================================================== */

interface PendingBurst {
  spec: EmitSpec;
  t: number;
}

export class ParticleSystem {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  /** Pre-allocated pool. Live particles occupy `[0, n)`. */
  private readonly pool: Pooled[] = [];
  private n = 0;

  private w = 0;
  private h = 0;
  private dpr = 1;

  private readonly pending: PendingBurst[] = [];
  private readonly sprites = new Map<string, HTMLCanvasElement>();
  private readonly fonts = new Map<number, string>();
  private font = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (ctx === null) throw new Error('[vfx] 2D canvas context unavailable');
    this.ctx = ctx;
    for (let i = 0; i < MAX_PARTICLES; i++) this.pool.push(ParticleSystem.blank());
    this.resize();
  }

  private static blank(): Pooled {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1,
      size: 1, color: '#ffffff', shape: 'dot',
      rot: 0, vrot: 0,
      gravity: 0, drag: 0, glow: 0,
      glyph: undefined, fade: 'linear',
      amp: 1, grow: 0, seed: 0, tx: 0, ty: 0, attract: 0,
    };
  }

  /** Number of live particles. */
  get count(): number {
    return this.n;
  }

  /** Viewport width in CSS pixels. */
  get width(): number {
    return this.w;
  }

  /** Viewport height in CSS pixels. */
  get height(): number {
    return this.h;
  }

  /** Match the backing store to the element box and devicePixelRatio. */
  resize(): void {
    const rectW = this.canvas.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1280);
    const rectH = this.canvas.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 720);
    const dpr = Math.min(MAX_DPR, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const pw = Math.max(1, Math.round(rectW * dpr));
    const ph = Math.max(1, Math.round(rectH * dpr));
    this.w = rectW;
    this.h = rectH;
    this.dpr = dpr;
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Queue (or immediately spawn) a burst. */
  emit(spec: EmitSpec): void {
    const delay = spec.delay ?? 0;
    if (delay > 0) {
      if (this.pending.length < MAX_PENDING) this.pending.push({ spec, t: delay });
      return;
    }
    this.spawn(spec);
  }

  /** Convenience: fire several bursts at once. */
  emitAll(specs: EmitSpec[]): void {
    for (let i = 0; i < specs.length; i++) this.emit(specs[i]);
  }

  private spawn(spec: EmitSpec): void {
    const scale = densityScale();
    if (scale === 0) return;                 // 'off' means off.
    const lite = prefersReducedMotion();
    let count = spec.count;
    if (scale !== 1) count = Math.max(1, Math.round(count * scale));
    if (lite) count = Math.max(1, Math.round(count * 0.2));
    const room = MAX_PARTICLES - this.n;
    if (room <= 0) return;
    if (count > room) count = room;

    const a0 = spec.angle ? spec.angle[0] : 0;
    const a1 = spec.angle ? spec.angle[1] : TAU;
    const spread = spec.spread ?? 0;
    const glyphs = spec.glyphs;
    const target = spec.target;

    for (let i = 0; i < count; i++) {
      const p = this.pool[this.n++];
      const t = count > 1 ? i / count : 0;
      let ang = spec.even ? a0 + (a1 - a0) * t : rand(a0, a1);
      if (spread !== 0) ang += rand(-spread, spread);

      const cos = Math.cos(ang);
      const sin = Math.sin(ang);

      let px = spec.origin.x;
      let py = spec.origin.y;
      if (spec.radius) {
        const r = rand(spec.radius[0], spec.radius[1]);
        px += cos * r;
        py += sin * r;
      }
      if (spec.area) {
        px += rand(-spec.area[0], spec.area[0]);
        py += rand(-spec.area[1], spec.area[1]);
      }

      const sp = rand(spec.speed[0], spec.speed[1]);
      const life = rand(spec.life[0], spec.life[1]);

      p.x = px;
      p.y = py;
      p.vx = cos * sp;
      p.vy = sin * sp;
      p.life = life;
      p.maxLife = life;
      p.size = rand(spec.size[0], spec.size[1]);
      p.color = pick(spec.colors);
      p.shape = spec.shape;
      p.rot = spec.rot ? rand(spec.rot[0], spec.rot[1]) : rand(0, TAU);
      p.vrot = spec.spin ? rand(spec.spin[0], spec.spin[1]) : 0;
      p.gravity = spec.gravity ?? 0;
      p.drag = spec.drag ?? 0;
      p.glow = lite ? 0 : spec.glow ?? 0;
      p.glyph = glyphs && glyphs.length > 0 ? pick(glyphs) : undefined;
      p.fade = spec.fade ?? 'linear';
      p.amp = clamp(spec.alpha ?? 1, 0, 1);
      p.grow = spec.grow ?? 0;
      p.seed = Math.random() * 1000;
      p.attract = target ? spec.attraction ?? 0 : 0;
      p.tx = target ? target.x : px;
      p.ty = target ? target.y : py;
    }
  }

  /** Advance the simulation. `dt` is seconds; clamp it before calling. */
  update(dt: number): void {
    if (dt <= 0) return;
    const step = dt > 0.05 ? 0.05 : dt;

    for (let i = this.pending.length - 1; i >= 0; i--) {
      const q = this.pending[i];
      q.t -= step;
      if (q.t <= 0) {
        this.pending[i] = this.pending[this.pending.length - 1];
        this.pending.pop();
        this.spawn(q.spec);
      }
    }

    const minX = -CULL_MARGIN;
    const maxX = this.w + CULL_MARGIN;
    const minY = -CULL_MARGIN;
    const maxY = this.h + CULL_MARGIN;

    let i = 0;
    while (i < this.n) {
      const p = this.pool[i];
      p.life -= step;

      if (p.attract !== 0) {
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > 4) {
          const inv = p.attract / Math.sqrt(d2);
          p.vx += dx * inv * step;
          p.vy += dy * inv * step;
        } else {
          p.life -= step * 3;
        }
      }

      if (p.gravity !== 0) p.vy += p.gravity * step;

      if (p.drag !== 0) {
        const f = 1 - p.drag * step;
        const k = f < 0 ? 0 : f;
        p.vx *= k;
        p.vy *= k;
      }

      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rot += p.vrot * step;

      const dead =
        p.life <= 0 ||
        p.x < minX || p.x > maxX ||
        p.y < minY || p.y > maxY;

      if (dead) {
        this.n--;
        if (i !== this.n) {
          const last = this.pool[this.n];
          this.pool[this.n] = p;
          this.pool[i] = last;
        }
        continue;
      }
      i++;
    }
  }

  /** Draw the current frame. No-op while the document is hidden. */
  render(): void {
    if (typeof document !== 'undefined' && document.hidden) return;
    const ctx = this.ctx;
    const dpr = this.dpr;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.n === 0) return;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Pass 1 — flat shapes (smoke, ash, dust) composite normally.
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < this.n; i++) {
      const p = this.pool[i];
      if (p.glow <= 0) this.draw(p);
    }

    // Pass 2 — everything that should read as light.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const p = this.pool[i];
      if (p.glow > 0) this.draw(p);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Remove every live and pending particle. */
  clear(): void {
    this.n = 0;
    this.pending.length = 0;
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
  }

  /** Free cached sprites. Safe to call on unmount. */
  dispose(): void {
    this.clear();
    this.sprites.clear();
    this.fonts.clear();
  }

  /* --------------------------------------------------------------- drawing */

  private alphaOf(p: Pooled): number {
    const t = p.life / p.maxLife;
    const age = 1 - t;
    // Fast attack: a 6% ramp-in stops particles popping into existence.
    const attack = age < 0.06 ? age * 16.6667 : 1;
    let curve: number;
    switch (p.fade) {
      case 'ease':
        curve = t * t;
        break;
      case 'flicker':
        curve = t * (0.55 + 0.45 * Math.sin(p.seed + age * p.maxLife * 34));
        break;
      default:
        curve = t;
    }
    const a = p.amp * attack * (curve < 0 ? 0 : curve);
    return a > 1 ? 1 : a;
  }

  private draw(p: Pooled): void {
    const ctx = this.ctx;
    const alpha = this.alphaOf(p);
    if (alpha <= 0.004) return;

    const dpr = this.dpr;
    const t = p.life / p.maxLife;
    const age = 1 - t;
    const grown = p.grow === 0 ? 1 : 1 + p.grow * age;

    ctx.globalAlpha = alpha;

    switch (p.shape) {
      case 'dot': {
        const r = p.size * grown;
        if (p.glow > 0) this.halo(p, r * 3.1, alpha * 0.55 * p.glow);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r < 0.3 ? 0.3 : r, 0, TAU);
        ctx.fill();
        break;
      }

      case 'spark': {
        const tail = clamp(Math.hypot(p.vx, p.vy) * 0.022, 2, 26);
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const nx = p.vx / sp;
        const ny = p.vy / sp;
        if (p.glow > 0) this.halo(p, p.size * 5, alpha * 0.4 * p.glow);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size < 0.6 ? 0.6 : p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - nx * tail, p.y - ny * tail);
        ctx.stroke();
        break;
      }

      case 'ring': {
        const r = p.size * grown;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(0.7, p.size * 0.22 * (0.25 + t));
        ctx.beginPath();
        ctx.arc(p.x, p.y, r < 0.5 ? 0.5 : r, 0, TAU);
        ctx.stroke();
        break;
      }

      case 'shard': {
        this.rotate(p.x, p.y, p.rot);
        const hh = p.size * grown;
        const hw = hh * 0.3;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -hh);
        ctx.lineTo(hw, 0);
        ctx.lineTo(0, hh);
        ctx.lineTo(-hw, 0);
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'coin': {
        this.rotate(p.x, p.y, p.rot * 0.35);
        const r = p.size * grown;
        // |cos| of the spin angle squashes the disc — a tumbling coin.
        const rx = Math.max(0.6, r * Math.abs(Math.cos(p.rot)));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, r, 0, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = alpha * 0.85;
        ctx.strokeStyle = goldHi();
        ctx.lineWidth = Math.max(0.5, r * 0.16);
        ctx.beginPath();
        ctx.ellipse(0, 0, rx * 0.62, r * 0.62, 0, 0, TAU);
        ctx.stroke();
        break;
      }

      case 'glyph': {
        this.rotate(p.x, p.y, p.rot * 0.25);
        const size = Math.max(6, Math.round(p.size * grown));
        const f = this.fontFor(size);
        if (f !== this.font) {
          ctx.font = f;
          this.font = f;
        }
        ctx.fillStyle = p.color;
        ctx.fillText(p.glyph ?? '✦', 0, 0);
        break;
      }
    }
  }

  /** Soft additive halo, drawn from a per-colour cached sprite. */
  private halo(p: Pooled, radius: number, alpha: number): void {
    if (alpha <= 0.01) return;
    const ctx = this.ctx;
    const dpr = this.dpr;
    const sprite = this.spriteFor(p.color);
    if (sprite === null) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = alpha > 1 ? 1 : alpha;
    ctx.drawImage(sprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
  }

  private rotate(x: number, y: number, angle: number): void {
    const d = this.dpr;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    this.ctx.setTransform(d * c, d * s, -d * s, d * c, x * d, y * d);
  }

  private fontFor(size: number): string {
    const hit = this.fonts.get(size);
    if (hit !== undefined) return hit;
    const f = `${size}px "Cinzel", "Segoe UI Symbol", "Apple Symbols", serif`;
    this.fonts.set(size, f);
    return f;
  }

  private spriteFor(color: string): HTMLCanvasElement | null {
    const hit = this.sprites.get(color);
    if (hit !== undefined) return hit;
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = SPRITE_SIZE;
    c.height = SPRITE_SIZE;
    const g = c.getContext('2d');
    if (g === null) return null;
    const half = SPRITE_SIZE / 2;
    const grad = g.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, withAlpha(color, 1));
    grad.addColorStop(0.25, withAlpha(color, 0.5));
    grad.addColorStop(0.6, withAlpha(color, 0.12));
    grad.addColorStop(1, withAlpha(color, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
    this.sprites.set(color, c);
    return c;
  }
}

/* ==========================================================================
   Presets
   Each one returns the bursts that make up a single named effect. They read
   tokens lazily, so they must be called at fire time, not at module load.
   ========================================================================== */

export interface PresetOptions {
  /** `cast` — which school's colours to use. */
  school?: School;
  /** `chips` — the pot/bet size; scales the coin count. */
  amount?: number;
  /** `potCollect`, `collapse` — the point particles are pulled toward. */
  target?: Vec2;
  /** Override the palette entirely. */
  colors?: string[];
  /** Single-colour override, merged into the palette. */
  color?: string;
  /** Overall size/energy multiplier. 1 is the tuned default. */
  scale?: number;
  /** Hard override for the headline burst's particle count. */
  count?: number;
  /** Primary direction in radians, where a preset has one. */
  angle?: number;
}

export type PresetFn = (at: Vec2, opts?: PresetOptions) => EmitSpec[];

const WHITE = '#ffffff';

function paletteFor(opts: PresetOptions | undefined, fallback: string[]): string[] {
  if (opts?.colors && opts.colors.length > 0) return opts.colors;
  if (opts?.color) return [opts.color, ...fallback];
  return fallback;
}

const s = (opts: PresetOptions | undefined): number => opts?.scale ?? 1;

export const PRESETS = {
  /* ---- cast: a school-coloured ring of sparks plus a slow shock ring ---- */
  cast: (at, opts) => {
    const school = opts?.school ?? 'entropy';
    const col = paletteFor(opts, schoolColors(school));
    const k = s(opts);
    return [
      {
        origin: at,
        count: opts?.count ?? 28,
        even: true,
        speed: [210 * k, 460 * k],
        spread: 0.14,
        life: [0.3, 0.62],
        size: [1.4, 3.2],
        colors: col,
        shape: 'spark',
        drag: 3.2,
        glow: 1,
        fade: 'ease',
      },
      {
        origin: at,
        count: 10,
        speed: [40 * k, 130 * k],
        life: [0.55, 1],
        size: [11, 18],
        colors: [col[0], col[2] ?? WHITE],
        shape: 'glyph',
        glyphs: RUNE_GLYPHS,
        drag: 2.2,
        glow: 0.7,
        spin: [-2.4, 2.4],
        alpha: 0.9,
        fade: 'ease',
      },
      {
        origin: at,
        count: 1,
        speed: [0, 0],
        life: [0.52, 0.52],
        size: [13 * k, 13 * k],
        colors: [col[0]],
        shape: 'ring',
        grow: 7.5,
        glow: 0.9,
        fade: 'ease',
      },
      {
        origin: at,
        count: 1,
        speed: [0, 0],
        life: [0.8, 0.8],
        size: [10 * k, 10 * k],
        colors: [col[1] ?? col[0]],
        shape: 'ring',
        grow: 12,
        glow: 0.6,
        alpha: 0.55,
        delay: 0.07,
        fade: 'ease',
      },
    ];
  },

  /* ---- collapse: shards fall inward, then one white flash ---- */
  collapse: (at, opts) => {
    const col = paletteFor(opts, [schoolColors('veil')[0], '#d8f1ff', WHITE]);
    const k = s(opts);
    const focus = opts?.target ?? at;
    return [
      {
        origin: at,
        count: opts?.count ?? 34,
        radius: [95 * k, 165 * k],
        speed: [-330, -220],
        life: [0.34, 0.44],
        size: [5, 13],
        colors: col,
        shape: 'shard',
        target: focus,
        attraction: 900,
        drag: 0.3,
        spin: [-7, 7],
        glow: 0.9,
        fade: 'linear',
      },
      {
        origin: at,
        count: 14,
        radius: [60 * k, 130 * k],
        speed: [-260, -150],
        life: [0.3, 0.42],
        size: [1.2, 2.4],
        colors: [WHITE, col[0]],
        shape: 'spark',
        target: focus,
        attraction: 700,
        glow: 1,
      },
      // The implosion lands here.
      {
        origin: focus,
        count: 1,
        speed: [0, 0],
        life: [0.26, 0.26],
        size: [26 * k, 26 * k],
        colors: [WHITE],
        shape: 'dot',
        glow: 1.6,
        grow: 0.45,
        fade: 'ease',
        delay: 0.34,
      },
      {
        origin: focus,
        count: 1,
        speed: [0, 0],
        life: [0.42, 0.42],
        size: [8 * k, 8 * k],
        colors: [WHITE],
        shape: 'ring',
        grow: 16,
        glow: 1.2,
        fade: 'ease',
        delay: 0.34,
      },
    ];
  },

  /* ---- superpose: two mirrored ghost plumes drifting apart ---- */
  superpose: (at, opts) => {
    const col = paletteFor(opts, schoolColors('entropy'));
    const k = s(opts);
    const base = opts?.angle ?? 0;
    const common = {
      count: 20,
      speed: [42 * k, 120 * k] as [number, number],
      spread: 0.3,
      life: [1.3, 2.3] as [number, number],
      size: [2.5, 7] as [number, number],
      colors: col,
      shape: 'dot' as const,
      drag: 0.85,
      gravity: -12,
      glow: 0.55,
      alpha: 0.32,
      fade: 'ease' as const,
      grow: 1.4,
    };
    return [
      { ...common, origin: at, angle: [base - 0.26, base + 0.26] },
      { ...common, origin: at, angle: [base + Math.PI - 0.26, base + Math.PI + 0.26] },
      {
        origin: at,
        count: 6,
        angle: [base - 0.2, base + 0.2],
        speed: [30 * k, 80 * k],
        life: [1.1, 1.8],
        size: [12, 17],
        colors: [col[0]],
        shape: 'glyph',
        glyphs: RUNE_GLYPHS,
        alpha: 0.26,
        glow: 0.4,
        drag: 0.9,
        fade: 'ease',
      },
      {
        origin: at,
        count: 6,
        angle: [base + Math.PI - 0.2, base + Math.PI + 0.2],
        speed: [30 * k, 80 * k],
        life: [1.1, 1.8],
        size: [12, 17],
        colors: [col[0]],
        shape: 'glyph',
        glyphs: RUNE_GLYPHS,
        alpha: 0.26,
        glow: 0.4,
        drag: 0.9,
        fade: 'ease',
      },
    ];
  },

  /* ---- burn: flickering embers over dark smoke ---- */
  burn: (at, opts) => {
    const col = paletteFor(opts, [
      schoolColors('ruin')[0], '#ff9a3c', gold(), '#ffd76e',
    ]);
    const k = s(opts);
    const up = -Math.PI / 2;
    return [
      {
        origin: at,
        count: opts?.count ?? 24,
        angle: [up - 0.62, up + 0.62],
        speed: [55 * k, 175 * k],
        area: [10, 6],
        life: [0.55, 1.15],
        size: [1.3, 3.4],
        colors: col,
        shape: 'dot',
        gravity: -55,
        drag: 1.15,
        glow: 1.25,
        fade: 'flicker',
      },
      {
        origin: at,
        count: 9,
        angle: [up - 0.5, up + 0.5],
        speed: [22 * k, 66 * k],
        area: [12, 8],
        life: [0.9, 1.6],
        size: [9, 20],
        colors: ['#1a1526', '#241b33', '#120e1c'],
        shape: 'dot',
        gravity: -26,
        drag: 1.7,
        glow: 0,
        alpha: 0.34,
        grow: 1.5,
        fade: 'ease',
      },
      {
        origin: at,
        count: 8,
        angle: [up - 1.1, up + 1.1],
        speed: [120 * k, 250 * k],
        life: [0.22, 0.4],
        size: [1, 2],
        colors: ['#ffd76e', WHITE],
        shape: 'spark',
        drag: 3.4,
        glow: 1,
      },
    ];
  },

  /* ---- chips: gold tumbling into the pot ---- */
  chips: (at, opts) => {
    const amount = opts?.amount ?? 100;
    const count = opts?.count ?? Math.round(clamp(6 + amount / 22, 6, 26));
    const col = paletteFor(opts, chipClay());
    const k = s(opts);
    const up = -Math.PI / 2;
    return [
      {
        origin: at,
        count,
        angle: [up - 0.95, up + 0.95],
        speed: [140 * k, 350 * k],
        area: [8, 4],
        life: [0.6, 1.05],
        size: [8, 14],
        colors: col,
        shape: 'coin',
        gravity: 980,
        drag: 1.15,
        spin: [-11, 11],
        glow: 0.16,
        fade: 'ease',
      },
      {
        origin: at,
        count: 10,
        angle: [up - 1.2, up + 1.2],
        speed: [90 * k, 240 * k],
        life: [0.22, 0.45],
        size: [1, 2.2],
        colors: [goldHi(), WHITE],
        shape: 'spark',
        drag: 3.6,
        gravity: 260,
        glow: 1,
      },
    ];
  },

  /* ---- chipsToPot: coins tossed from a seat, arcing over to a target ---- */
  chipsToPot: (at, opts) => {
    const amount = opts?.amount ?? 100;
    const target = opts?.target ?? at;
    const n = Math.round(clamp(4 + amount / 45, 4, 13));
    const col = paletteFor(opts, chipClay());
    const k = s(opts);
    const dx = target.x - at.x;
    const dy = target.y - at.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const toward = Math.atan2(dy, dx);
    const out: EmitSpec[] = [];
    const STEP = 0.032;
    for (let i = 0; i < n; i++) {
      out.push({
        origin: at,
        count: 1,
        // Launched up and slightly toward the target; gravity + the target's
        // pull bend the rest of the path into an arc rather than a straight line.
        angle: [toward - 1.35, toward - 0.85],
        spread: 0.12,
        speed: [dist * 0.9, dist * 1.3],
        life: [0.46, 0.62],
        // Big enough to be a chip. At four pixels these were sparks that
        // happened to be gold, and a bet crossing the felt looked like a
        // spell going off rather than like money being pushed in.
        size: [8.5, 14],
        colors: col,
        shape: 'coin',
        gravity: 620 * k,
        target,
        attraction: 1500,
        drag: 0.35,
        spin: [-11, 11],
        // Clay does not glow. What little there is here is the lamp on the
        // rim, not the chip lighting itself.
        glow: 0.14,
        fade: 'ease',
        delay: i * STEP,
      });
    }
    out.push({
      origin: target,
      count: 12,
      even: true,
      speed: [50, 160],
      life: [0.22, 0.42],
      size: [1.1, 2.4],
      colors: [goldHi(), WHITE],
      shape: 'spark',
      drag: 4,
      glow: 1,
      delay: n * STEP + 0.32,
    });
    return out;
  },

  /* ---- potCollect: a dense gold stream pulled to a target ---- */
  potCollect: (at, opts) => {
    const target = opts?.target ?? at;
    const col = paletteFor(opts, chipClay());
    const k = s(opts);
    return [
      {
        origin: at,
        // Fewer and larger. Forty small coins is a texture; twenty-six big
        // ones is a pot being raked, and a pot being raked is the single most
        // satisfying thing that happens in poker.
        count: opts?.count ?? 26,
        area: [46 * k, 26 * k],
        speed: [30, 120],
        life: [0.5, 0.9],
        size: [8, 15],
        colors: col,
        shape: 'coin',
        target,
        attraction: 2600,
        drag: 1.1,
        spin: [-9, 9],
        glow: 0.16,
        fade: 'ease',
      },
      {
        origin: at,
        count: 26,
        area: [56 * k, 30 * k],
        speed: [10, 70],
        life: [0.4, 0.7],
        size: [1.2, 2.6],
        colors: [goldHi(), WHITE, gold()],
        shape: 'spark',
        target,
        attraction: 3200,
        glow: 1,
      },
      {
        origin: target,
        count: 12,
        even: true,
        speed: [60, 170],
        life: [0.25, 0.45],
        size: [1.2, 2.4],
        colors: [goldHi(), WHITE],
        shape: 'spark',
        drag: 4,
        glow: 1,
        delay: 0.42,
      },
    ];
  },

  /* ---- impossible: the one the whole engine exists for ---- */
  impossible: (at, opts) => {
    const k = s(opts);
    const prism = paletteFor(opts, [
      schoolColors('entropy')[0],
      schoolColors('veil')[0],
      schoolColors('chronos')[0],
      schoolColors('bind')[0],
      schoolColors('ruin')[0],
      schoolColors('weave')[0],
      WHITE,
    ]);
    return [
      {
        origin: at,
        count: 46,
        even: true,
        spread: 0.25,
        speed: [260 * k, 720 * k],
        life: [0.8, 2.5],
        size: [5, 15],
        colors: prism,
        shape: 'shard',
        gravity: 340,
        drag: 1.1,
        spin: [-9, 9],
        glow: 1,
        fade: 'ease',
      },
      {
        origin: at,
        count: 26,
        even: true,
        speed: [320 * k, 780 * k],
        life: [0.3, 0.7],
        size: [1.4, 3.4],
        colors: prism,
        shape: 'spark',
        drag: 2.6,
        glow: 1.2,
      },
      {
        origin: at,
        count: 28,
        angle: [-Math.PI * 0.86, -Math.PI * 0.14],
        speed: [220 * k, 560 * k],
        life: [1.1, 2.1],
        size: [4.5, 9],
        colors: [gold(), goldHi(), goldDeep()],
        shape: 'coin',
        gravity: 820,
        drag: 0.85,
        spin: [-13, 13],
        glow: 0.6,
        fade: 'ease',
        delay: 0.06,
      },
      {
        origin: at,
        count: 12,
        speed: [60 * k, 190 * k],
        life: [1.2, 2.2],
        size: [14, 24],
        colors: prism,
        shape: 'glyph',
        glyphs: RUNE_GLYPHS,
        drag: 1.6,
        gravity: -30,
        spin: [-2, 2],
        glow: 0.8,
        alpha: 0.9,
        fade: 'ease',
      },
      {
        origin: at,
        count: 1,
        speed: [0, 0],
        life: [0.7, 0.7],
        size: [16 * k, 16 * k],
        colors: [WHITE],
        shape: 'ring',
        grow: 20,
        glow: 1.4,
        fade: 'ease',
      },
      {
        origin: at,
        count: 1,
        speed: [0, 0],
        life: [0.9, 0.9],
        size: [14 * k, 14 * k],
        colors: [prism[0]],
        shape: 'ring',
        grow: 24,
        glow: 1,
        alpha: 0.8,
        fade: 'ease',
        delay: 0.16,
      },
      {
        origin: at,
        count: 1,
        speed: [0, 0],
        life: [1.1, 1.1],
        size: [12 * k, 12 * k],
        colors: [prism[1] ?? WHITE],
        shape: 'ring',
        grow: 28,
        glow: 0.9,
        alpha: 0.6,
        fade: 'ease',
        delay: 0.34,
      },
      {
        origin: at,
        count: 6,
        even: true,
        speed: [80, 220],
        life: [1.6, 2.5],
        size: [2, 4],
        colors: prism,
        shape: 'dot',
        drag: 1.4,
        gravity: -18,
        glow: 1,
        alpha: 0.75,
        fade: 'flicker',
        delay: 0.5,
      },
    ];
  },

  /* ---- sparkleTrail: tiny, called repeatedly behind a moving card ---- */
  sparkleTrail: (at, opts) => {
    const col = paletteFor(opts, [goldHi(), gold(), WHITE]);
    return [
      {
        origin: at,
        count: opts?.count ?? 3,
        speed: [8, 52],
        area: [5, 5],
        life: [0.22, 0.46],
        size: [0.9, 2.3],
        colors: col,
        shape: 'dot',
        drag: 3,
        gravity: 24,
        glow: 1,
        fade: 'ease',
      },
    ];
  },

  /* ---- cardLand: the felt a card kicks up when it arrives ---- */
  /*
   * A dealt card used to emit `sparkleTrail` — gold dots with full glow. That
   * is the sound a magic item makes, not the sound a piece of card makes
   * hitting cloth, and it fired on every single card of every single deal,
   * which made the most ordinary event in the game the most decorated one.
   *
   * What a card actually does is push a little dust out sideways. So: felt
   * and bone coloured, no glow, almost no upward speed, heavy drag, gone in a
   * third of a second. It is meant to be felt rather than seen, and on the
   * cards that *are* special the mark's own foil is still there to carry it.
   */
  cardLand: (at, opts) => {
    const k = s(opts);
    return [
      {
        origin: at,
        count: opts?.count ?? 7,
        // Sideways and slightly down: dust squeezed out from under an edge.
        angle: [0, Math.PI * 2],
        speed: [18 * k, 74 * k],
        area: [16, 5],
        life: [0.18, 0.36],
        size: [1.4, 3.6],
        colors: paletteFor(opts, ['#2b4a3e', '#1b3229', '#6d6552', '#8d8471']),
        shape: 'dot',
        drag: 5.2,
        gravity: 40,
        glow: 0,
        fade: 'ease',
      },
    ];
  },

  /* ---- rewindRipple: concentric rings with a chromatic split ---- */
  rewindRipple: (at, opts) => {
    const k = s(opts);
    const cyan = '#6ee7ff';
    const rose = schoolColors('ruin')[0];
    const out: EmitSpec[] = [];
    for (let w = 0; w < 3; w++) {
      const delay = w * 0.13;
      const life = 0.62 + w * 0.08;
      const grow = 9 + w * 3;
      out.push(
        {
          origin: { x: at.x - 4, y: at.y },
          count: 1,
          speed: [0, 0],
          life: [life, life],
          size: [14 * k, 14 * k],
          colors: [cyan],
          shape: 'ring',
          grow,
          glow: 0.9,
          alpha: 0.7,
          fade: 'ease',
          delay,
        },
        {
          origin: { x: at.x + 4, y: at.y },
          count: 1,
          speed: [0, 0],
          life: [life, life],
          size: [14 * k, 14 * k],
          colors: [rose],
          shape: 'ring',
          grow,
          glow: 0.9,
          alpha: 0.7,
          fade: 'ease',
          delay,
        },
        {
          origin: at,
          count: 1,
          speed: [0, 0],
          life: [life, life],
          size: [14 * k, 14 * k],
          colors: [token('--chronos', '#ffc861')],
          shape: 'ring',
          grow,
          glow: 1,
          fade: 'ease',
          delay,
        },
      );
    }
    out.push({
      origin: at,
      count: 14,
      even: true,
      speed: [-190, -110],
      radius: [70 * k, 140 * k],
      life: [0.45, 0.7],
      size: [1.2, 2.6],
      colors: [token('--chronos', '#ffc861'), cyan, WHITE],
      shape: 'spark',
      target: at,
      attraction: 420,
      glow: 1,
      fade: 'ease',
    });
    return out;
  },

  /* ---- dust: ambient motes over the felt. Fire every few seconds. ---- */
  dust: (at, opts) => {
    const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
    const vh = typeof window === 'undefined' ? 720 : window.innerHeight;
    const col = paletteFor(opts, [
      token('--silver', '#cfd8ee'),
      gold(),
      schoolColors('veil')[0],
    ]);
    return [
      {
        origin: at,
        count: opts?.count ?? 30,
        area: [vw * 0.52, vh * 0.52],
        speed: [3, 16],
        life: [6, 12],
        size: [0.8, 2.4],
        colors: col,
        shape: 'dot',
        gravity: -2.5,
        drag: 0.03,
        glow: 0.45,
        alpha: 0.14,
        fade: 'ease',
      },
    ];
  },

  /* ---- eliminate: dark ash falling off the table ---- */
  eliminate: (at, opts) => {
    const k = s(opts);
    const col = paletteFor(opts, ['#20182e', '#2c2340', '#3a2b44', schoolColors('ruin')[1]]);
    return [
      {
        origin: at,
        count: opts?.count ?? 42,
        angle: [Math.PI * 0.12, Math.PI * 0.88],
        speed: [25 * k, 110 * k],
        area: [34 * k, 14 * k],
        life: [1.1, 2.1],
        size: [2, 6.5],
        colors: col,
        shape: 'shard',
        gravity: 110,
        drag: 0.55,
        spin: [-3.4, 3.4],
        glow: 0,
        alpha: 0.7,
        fade: 'ease',
      },
      {
        origin: at,
        count: 10,
        speed: [20 * k, 90 * k],
        area: [30 * k, 12 * k],
        life: [0.7, 1.3],
        size: [1, 2.4],
        colors: [schoolColors('ruin')[0]],
        shape: 'dot',
        gravity: 140,
        drag: 1,
        glow: 0.8,
        alpha: 0.55,
        fade: 'flicker',
      },
    ];
  },

  /* ---- confetti: pure celebration, rains from above the point ---- */
  confetti: (at, opts) => {
    const k = s(opts);
    const col = paletteFor(opts, [
      gold(), goldHi(),
      schoolColors('entropy')[0],
      schoolColors('veil')[0],
      schoolColors('bind')[0],
      schoolColors('weave')[0],
      schoolColors('ruin')[0],
    ]);
    const vw = typeof window === 'undefined' ? 1280 : window.innerWidth;
    return [
      {
        origin: at,
        count: opts?.count ?? 60,
        area: [vw * 0.45, 20],
        angle: [Math.PI * 0.3, Math.PI * 0.7],
        speed: [40 * k, 190 * k],
        life: [1.4, 2.4],
        size: [3.5, 8],
        colors: col,
        shape: 'shard',
        gravity: 420,
        drag: 0.9,
        spin: [-10, 10],
        glow: 0,
        alpha: 0.95,
        fade: 'ease',
      },
      {
        origin: at,
        count: 18,
        area: [vw * 0.4, 16],
        angle: [Math.PI * 0.35, Math.PI * 0.65],
        speed: [60 * k, 180 * k],
        life: [1, 1.8],
        size: [3, 6],
        colors: [gold(), goldHi()],
        shape: 'coin',
        gravity: 520,
        drag: 0.8,
        spin: [-12, 12],
        glow: 0.5,
        fade: 'ease',
      },
    ];
  },
} satisfies Record<string, PresetFn>;

export type PresetName = keyof typeof PRESETS;

/** Look a preset up by name and build its bursts. Returns null if unknown. */
export function resolvePreset(
  name: string,
  at: Vec2,
  opts?: PresetOptions,
): EmitSpec[] | null {
  const table = PRESETS as Record<string, PresetFn | undefined>;
  const fn = table[name];
  if (fn === undefined) return null;
  return fn(at, opts);
}

/** Every preset name, handy for debug menus. */
export const PRESET_NAMES: PresetName[] = Object.keys(PRESETS) as PresetName[];
