/* ===========================================================================
   HEXHOLD — Aura, Shimmer, Runes, Pulse
   ---------------------------------------------------------------------------
   Small reusable presentational components layered on top of the styles in
   `effects.css`. Every one of them is CSS-driven: props only ever set CSS
   custom properties and a couple of data attributes, so React never holds
   per-frame state and never re-renders on a timer. That keeps them cheap
   enough to drop dozens of at once (a table full of active enchantments)
   without touching the RAF loop `VfxLayer` owns.

   Reduced motion is handled once, centrally, in `effects.css` — the
   `:root[data-reduced-motion='1']` rules there disable every animation these
   components produce and substitute a static equivalent (a still halo, a
   paused sweep, rings frozen mid-breath), and release the compositing layer
   with it. That attribute is set from both the OS preference and the in-game
   toggle by `videoPrefs.ts`. Nothing here needs to duplicate that logic.
   =========================================================================== */

import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { RUNE_GLYPHS, schoolColors, token, type School } from './particles';
import type { CSSVars } from './VfxLayer';
import './effects.css';

/** A school name, or any literal CSS colour (hex/rgb/rgba/var()). */
export type VfxColor = School | (string & {});

const SCHOOLS: ReadonlySet<string> = new Set<School>([
  'entropy', 'veil', 'chronos', 'bind', 'ruin', 'weave',
]);

/** Resolve a `VfxColor` to a real CSS colour — a school name reads its token. */
function resolveColor(color: VfxColor | undefined, fallback: string): string {
  if (color === undefined) return fallback;
  if (SCHOOLS.has(color)) return schoolColors(color as School)[0];
  return color;
}

function cx(...parts: Array<string | false | undefined>): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}

/* ==========================================================================
   <Aura /> — a soft glow halo behind an element
   ========================================================================== */

export type AuraShape = 'circle' | 'pill' | 'rounded';

export interface AuraProps {
  /** A school name (`'entropy'`, `'veil'`, ...) or any CSS colour. Defaults to gold. */
  color?: VfxColor;
  /** How far the halo reaches past the child's edge, in px. */
  glow?: number;
  /** Peak opacity of the halo, 0..1. */
  intensity?: number;
  /** Breathe in and out. Set false for a flat, static glow. Default true. */
  pulse?: boolean;
  /** Seconds per breath, when `pulse` is on. */
  speed?: number;
  /** Corner treatment of the glow. `'circle'` for avatars/tokens, `'pill'` for
   *  buttons/badges, `'rounded'` (default) for cards and panels. */
  shape?: AuraShape;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Wraps `children` in a relatively-positioned box and drops a blurred radial
 * glow behind it via `::before` (see `.vfx-aura` in effects.css). Use it
 * behind an active pot leader, a school-coloured button, or a card that just
 * became legendary. It does not change layout — the halo lives at `z-index: -1`
 * inside its own stacking context, so it never eats clicks or pushes siblings.
 */
export function Aura({
  color,
  glow = 18,
  intensity = 0.55,
  pulse = true,
  speed = 2.6,
  shape = 'rounded',
  className,
  style,
  children,
}: AuraProps): JSX.Element {
  const resolved = resolveColor(color, token('--gold', '#f0c465'));
  const vars: CSSVars = {
    ...style,
    '--aura-color': resolved,
    '--aura-glow': `${glow}px`,
    '--aura-intensity': intensity,
    '--aura-speed': `${speed}s`,
  };
  return (
    <span className={cx('vfx-aura', className)} data-shape={shape} data-pulse={pulse ? 'true' : 'false'} style={vars}>
      {children}
    </span>
  );
}

/* ==========================================================================
   <Shimmer /> — a moving specular sweep across a child
   ========================================================================== */

export interface ShimmerProps {
  /** Play the sweep. Default true; set false to pause it (e.g. off-screen). */
  active?: boolean;
  /** Tint of the sweep band. Defaults to a soft white. */
  color?: VfxColor;
  /** Tint of the sweep's hot centre line. Defaults to near-white. */
  hot?: VfxColor;
  /** Seconds per pass. */
  speed?: number;
  /** Seconds to delay the first pass — stagger several shimmering items. */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Wraps `children` and overlays a diagonal light band that sweeps across on
 * a loop, `mix-blend-mode: screen` so it only ever brightens what is under
 * it. Built for foil/rare card frames and premium shop items; anything with
 * a defined border-radius will clip the sweep to match (`.vfx-shimmer` sets
 * `border-radius: inherit`).
 */
export function Shimmer({
  active = true,
  color,
  hot,
  speed = 2.8,
  delay = 0,
  className,
  style,
  children,
}: ShimmerProps): JSX.Element {
  const vars: CSSVars = {
    ...style,
    '--shimmer-speed': `${speed}s`,
    '--shimmer-delay': `${delay}s`,
  };
  if (color !== undefined) vars['--shimmer-color'] = resolveColor(color, '');
  if (hot !== undefined) vars['--shimmer-hot'] = resolveColor(hot, '');
  return (
    <span className={cx('vfx-shimmer', className)} data-active={active ? 'true' : 'false'} style={vars}>
      {children}
      <span className="vfx-shimmer-sweep" aria-hidden="true" />
    </span>
  );
}

/* ==========================================================================
   <Runes /> — slowly orbiting arcane glyphs around a point
   ========================================================================== */

export interface RunesProps {
  /** A school name or any CSS colour. Defaults to the entropy token. */
  color?: VfxColor;
  /** How many glyphs orbit. */
  count?: number;
  /** Orbit radius, in px. */
  radius?: number;
  /** Seconds per full revolution. Glyphs counter-rotate to stay upright. */
  speed?: number;
  /** Glyph font size, in px. */
  size?: number;
  /** Peak opacity of each glyph; they twinkle between this and ~40% of it. */
  opacity?: number;
  /** Orbit direction. */
  dir?: 'cw' | 'ccw';
  /** Override the glyph pool. Defaults to `RUNE_GLYPHS` from `particles.ts`. */
  glyphs?: string[];
  className?: string;
  style?: CSSProperties;
  /** When given, Runes wraps them and supplies its own centred anchor.
   *  Omit it to drop Runes as an absolutely-positioned overlay inside a
   *  parent you have already set `position: relative` on (e.g. a card). */
  children?: ReactNode;
}

/**
 * Orbiting glyphs centred on a point — used behind quantum (superposed)
 * cards and to mark an actively-enchanted seat or pot. Each glyph is placed
 * with `transform: rotate() translate()` and counter-rotates on its own
 * animation so it never appears upside-down mid-orbit. The glyph set and
 * each glyph's stagger are chosen once per mount, not re-rolled on every
 * render.
 */
export function Runes({
  color,
  count = 6,
  radius = 52,
  speed = 14,
  size = 13,
  opacity = 0.82,
  dir = 'cw',
  glyphs,
  className,
  style,
  children,
}: RunesProps): JSX.Element {
  const n = Math.max(1, Math.round(count));
  const pool = glyphs ?? RUNE_GLYPHS;
  const picked = useMemo(() => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(pool[Math.floor(Math.random() * pool.length)] ?? '✦');
    return out;
  }, [n, pool]);
  const resolved = resolveColor(color, token('--entropy', '#b98cff'));

  const ringVars: CSSVars = {
    '--runes-speed': `${speed}s`,
    '--runes-radius': `${radius}px`,
    '--runes-color': resolved,
    '--runes-opacity': opacity,
  };

  const items = picked.map((glyph, i) => {
    const runeVars: CSSVars = { '--rune-a': `${(360 / n) * i}deg` };
    const glyphVars: CSSVars = {
      '--rune-size': `${size}px`,
      '--rune-delay': `${(-(i / n) * speed).toFixed(3)}s`,
    };
    return (
      <div className="vfx-rune" style={runeVars} key={i}>
        <span className="vfx-rune-g" style={glyphVars}>{glyph}</span>
      </div>
    );
  });

  if (children === undefined) {
    return (
      <div className={cx('vfx-runes', className)} data-dir={dir} style={{ ...style, ...ringVars }} aria-hidden="true">
        {items}
      </div>
    );
  }

  return (
    <span className={cx('vfx-anchor', className)} style={style}>
      {children}
      <div className="vfx-runes" data-dir={dir} style={ringVars} aria-hidden="true">
        {items}
      </div>
    </span>
  );
}

/* ==========================================================================
   <Pulse /> — a breathing ring
   ========================================================================== */

export interface PulseProps {
  /** A school name or any CSS colour. Defaults to the bind token. */
  color?: VfxColor;
  /** Ring diameter at rest, in px. */
  size?: number;
  /** Ring stroke width, in px. */
  width?: number;
  /** Seconds per pulse. Three staggered rings share this period. */
  speed?: number;
  /** Peak opacity a ring reaches partway through its expansion. */
  intensity?: number;
  className?: string;
  style?: CSSProperties;
  /** When given, Pulse wraps them and supplies its own centred anchor.
   *  Omit it to drop Pulse as an overlay inside an already-positioned parent. */
  children?: ReactNode;
}

/**
 * Three concentric rings, expanding and fading on a shared, staggered loop —
 * a heartbeat for "this seat is active" or "this ward is up". Cheap: it is
 * three `<i>` elements animated entirely by the `vfx-pulse-ring` keyframe,
 * staggered with plain `nth-child` delays in `effects.css`.
 */
export function Pulse({
  color,
  size = 46,
  width = 2,
  speed = 2.2,
  intensity = 0.75,
  className,
  style,
  children,
}: PulseProps): JSX.Element {
  const resolved = resolveColor(color, token('--bind', '#5eead4'));
  const vars: CSSVars = {
    '--pulse-color': resolved,
    '--pulse-size': `${size}px`,
    '--pulse-width': `${width}px`,
    '--pulse-speed': `${speed}s`,
    '--pulse-intensity': intensity,
  };

  if (children === undefined) {
    return (
      <div className={cx('vfx-pulse', className)} style={{ ...style, ...vars }} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    );
  }

  return (
    <span className={cx('vfx-anchor', className)} style={style}>
      {children}
      <div className="vfx-pulse" style={vars} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
    </span>
  );
}
