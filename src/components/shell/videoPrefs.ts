/**
 * Display preferences: particle density, UI scale and the manual "reduce
 * motion" override. All three are applied to the document as soon as this
 * module is evaluated (not only once the settings panel happens to mount),
 * so a reload looks right immediately instead of flashing defaults until the
 * player opens Settings.
 */
import { useSyncExternalStore } from 'react';

export type ParticleDensity = 'off' | 'low' | 'full';

const PARTICLES_KEY = 'hexhold.particles';
const UI_SCALE_KEY = 'hexhold.uiScale';
const REDUCED_KEY = 'hexhold.reducedMotion';
const FLASHING_KEY = 'hexhold.reduceFlashing';

export const DEFAULT_PARTICLE_DENSITY: ParticleDensity = 'full';
export const DEFAULT_UI_SCALE = 1;
export const UI_SCALE_MIN = 0.8;
/**
 * The most a player can ask for. What is applied is also capped by the
 * window (see appliedUiScale): `.app` uses CSS zoom, so a scale of z lays the
 * game out in (window / z) CSS pixels, and below LAYOUT_MIN things clip.
 */
export const UI_SCALE_MAX = 2;
/** Outside the desktop shell, where only CSS zoom is available. */
export const BROWSER_UI_SCALE_MAX = 1.25;
/** The smallest layout the game is built and tested for (the Electron minimum window). */
export const LAYOUT_MIN = { width: 1024, height: 680 } as const;

/**
 * The scale actually applied for a chosen scale in a window of w x h CSS px.
 * Shrinking is always honoured. Growing stops where the layout would drop
 * under LAYOUT_MIN: a Steam Deck (1280x800) fits 117%, 1080p 158%, 1440p
 * 200%. Before 2026-10-09 the cap was a flat 125%, which on a Deck already
 * laid the game out at 1024x640, under its minimum height.
 */
export function appliedUiScale(chosen: number, w: number, h: number): number {
  const c = clampScale(chosen);
  if (c <= 1) return c;
  if (!(w > 0) || !(h > 0)) return 1;
  const fit = Math.floor(Math.min(w / LAYOUT_MIN.width, h / LAYOUT_MIN.height) * 100) / 100;
  return Math.max(1, Math.min(c, fit));
}

function hasDom(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function clampScale(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_UI_SCALE;
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, v));
}

// ---------------------------------------------------------------------------
// Particle density
// ---------------------------------------------------------------------------

function readParticleDensity(): ParticleDensity {
  try {
    const raw = localStorage.getItem(PARTICLES_KEY);
    if (raw === 'off' || raw === 'low' || raw === 'full') return raw;
  } catch { /* ignore */ }
  return DEFAULT_PARTICLE_DENSITY;
}

/** Published as an attribute so `src/vfx/` can read it without importing from
 *  the component tree — the same mechanism as data-reduced-motion. */
function applyParticleDensity(v: ParticleDensity): void {
  if (!hasDom()) return;
  try { document.documentElement.dataset.particles = v; } catch { /* ignore */ }
}

let particleDensity: ParticleDensity = hasDom() ? readParticleDensity() : DEFAULT_PARTICLE_DENSITY;
applyParticleDensity(particleDensity);
const particleListeners = new Set<() => void>();

export function getParticleDensity(): ParticleDensity { return particleDensity; }

export function setParticleDensity(v: ParticleDensity): void {
  particleDensity = v;
  applyParticleDensity(v);
  try { localStorage.setItem(PARTICLES_KEY, v); } catch { /* ignore */ }
  for (const l of particleListeners) l();
}

function subscribeParticles(fn: () => void): () => void {
  particleListeners.add(fn);
  return () => { particleListeners.delete(fn); };
}

export function useParticleDensity(): [ParticleDensity, (v: ParticleDensity) => void] {
  const v = useSyncExternalStore(subscribeParticles, getParticleDensity, () => DEFAULT_PARTICLE_DENSITY);
  return [v, setParticleDensity];
}

// ---------------------------------------------------------------------------
// UI scale
// ---------------------------------------------------------------------------

function readUiScale(): number {
  try {
    const raw = localStorage.getItem(UI_SCALE_KEY);
    if (raw !== null) return clampScale(Number(raw));
  } catch { /* ignore */ }
  return DEFAULT_UI_SCALE;
}

let appliedScale = DEFAULT_UI_SCALE;

type ZoomBridge = { getZoom?: () => number; setZoom?: (f: number) => number };
const zoomBridge = (): ZoomBridge | undefined => {
  try { return (window as unknown as { hexhold?: ZoomBridge }).hexhold; } catch { return undefined; }
};

/**
 * How the scale is applied.
 *
 * In the desktop build, as the page's zoom factor (Electron's webFrame): the
 * whole page is laid out at (window / scale) CSS pixels, so every media query
 * and every measurement sees the size the game really has. CSS `zoom` on
 * `.app` (the browser fallback) scales the content but not the viewport the
 * media queries read: at 117% on a Deck the short-screen rules for a 684px
 * layout never fired, because the viewport still said 800, and the seats
 * slid over the board (the responsive harness at 200%, 2026-10-09).
 */
function applyUiScale(v: number): void {
  if (!hasDom()) return;
  const bridge = zoomBridge();
  if (bridge?.setZoom && bridge.getZoom) {
    // innerWidth is already divided by the current zoom; undo it to get the
    // window's size, which is what the cap is measured against.
    const z = bridge.getZoom() || 1;
    appliedScale = appliedUiScale(v, window.innerWidth * z, window.innerHeight * z);
    try { document.documentElement.style.setProperty('--ui-scale', '1'); } catch { /* ignore */ }
    if (Math.abs(z - appliedScale) > 0.001) bridge.setZoom(appliedScale);
    return;
  }
  // A plain browser (the web build) keeps the old 125% ceiling: CSS zoom
  // cannot move the viewport its media queries read.
  appliedScale = appliedUiScale(Math.min(v, BROWSER_UI_SCALE_MAX), window.innerWidth, window.innerHeight);
  try { document.documentElement.style.setProperty('--ui-scale', String(appliedScale)); } catch { /* ignore */ }
}

let uiScale = hasDom() ? readUiScale() : DEFAULT_UI_SCALE;
applyUiScale(uiScale);
const uiScaleListeners = new Set<() => void>();

// The cap depends on the window, so a resize (or a display-mode change)
// re-applies the chosen scale.
if (hasDom()) {
  try {
    window.addEventListener('resize', () => {
      const before = appliedScale;
      applyUiScale(uiScale);
      if (appliedScale !== before) for (const l of uiScaleListeners) l();
    });
  } catch { /* ignore */ }
}

export function getUiScale(): number { return uiScale; }
/** The scale in effect right now, after the window's cap. */
export function getAppliedUiScale(): number { return appliedScale; }

export function setUiScale(v: number): void {
  uiScale = clampScale(v);
  applyUiScale(uiScale);
  try { localStorage.setItem(UI_SCALE_KEY, String(uiScale)); } catch { /* ignore */ }
  for (const l of uiScaleListeners) l();
}

export function useAppliedUiScale(): number {
  return useSyncExternalStore(subscribeUiScale, getAppliedUiScale, () => DEFAULT_UI_SCALE);
}

function subscribeUiScale(fn: () => void): () => void {
  uiScaleListeners.add(fn);
  return () => { uiScaleListeners.delete(fn); };
}

export function useUiScale(): [number, (v: number) => void] {
  const v = useSyncExternalStore(subscribeUiScale, getUiScale, () => DEFAULT_UI_SCALE);
  return [v, setUiScale];
}

// ---------------------------------------------------------------------------
// Reduce motion. This is the manual override, but `applyReducedMotion` below
// folds the OS preference into the same `data-reduced-motion` attribute, so
// stylesheets key off one condition rather than a media query that the
// in-game toggle could not reach.
// ---------------------------------------------------------------------------

function readReducedMotion(): boolean {
  try { return localStorage.getItem(REDUCED_KEY) === '1'; } catch { return false; }
}

function systemPrefersReduced(): boolean {
  if (!hasDom()) return false;
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

/** The OS preference and the in-game toggle resolve to one attribute, so every
 *  stylesheet has a single condition to key off instead of two that reach
 *  different sets of rules. The toggle wins when it is on; otherwise we follow
 *  the OS. */
function applyReducedMotion(v: boolean): void {
  if (!hasDom()) return;
  const on = v || systemPrefersReduced();
  try { document.documentElement.dataset.reducedMotion = on ? '1' : ''; } catch { /* ignore */ }
}

let reducedMotion = hasDom() ? readReducedMotion() : false;
applyReducedMotion(reducedMotion);
const reducedListeners = new Set<() => void>();

// An OS-level change mid-session has to re-resolve the attribute, or the
// stylesheets keep whatever was true at load.
if (hasDom()) {
  try {
    window.matchMedia('(prefers-reduced-motion: reduce)')
      .addEventListener('change', () => {
        applyReducedMotion(reducedMotion);
        applyReducedFlashing(reducedFlashing);
        for (const l of reducedListeners) l();
        for (const l of flashingListeners) l();
      });
  } catch { /* ignore */ }
}

export function getReducedMotion(): boolean { return reducedMotion; }

export function setReducedMotion(v: boolean): void {
  reducedMotion = v;
  applyReducedMotion(v);
  try { localStorage.setItem(REDUCED_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  for (const l of reducedListeners) l();
}

function subscribeReducedMotion(fn: () => void): () => void {
  reducedListeners.add(fn);
  return () => { reducedListeners.delete(fn); };
}

/** Whether the OS asks for reduced motion, regardless of the in-game toggle.
 *  The settings UI needs this to show the effective state rather than just the
 *  manual override. */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => systemPrefersReduced(),
    () => false,
  );
}

export function useReducedMotionSetting(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(subscribeReducedMotion, getReducedMotion, () => false);
  return [v, setReducedMotion];
}

// ---------------------------------------------------------------------------
// Reduce flashing. Screen flashes, colour splits and screen shake, and
// nothing else: a player sensitive to flashing light can keep every other
// animation. Reduced motion already covers all three, and the OS reduced-motion
// preference turns this on as well. Published as `data-reduced-flashing`
// for src/vfx/ (see prefersReducedFlashing in particles.ts).
// ---------------------------------------------------------------------------

function readReducedFlashing(): boolean {
  try { return localStorage.getItem(FLASHING_KEY) === '1'; } catch { return false; }
}

function applyReducedFlashing(v: boolean): void {
  if (!hasDom()) return;
  const on = v || systemPrefersReduced();
  try { document.documentElement.dataset.reducedFlashing = on ? '1' : ''; } catch { /* ignore */ }
}

let reducedFlashing = hasDom() ? readReducedFlashing() : false;
applyReducedFlashing(reducedFlashing);
const flashingListeners = new Set<() => void>();

export function getReducedFlashing(): boolean { return reducedFlashing; }

export function setReducedFlashing(v: boolean): void {
  reducedFlashing = v;
  applyReducedFlashing(v);
  try { localStorage.setItem(FLASHING_KEY, v ? '1' : '0'); } catch { /* ignore */ }
  for (const l of flashingListeners) l();
}

function subscribeReducedFlashing(fn: () => void): () => void {
  flashingListeners.add(fn);
  return () => { flashingListeners.delete(fn); };
}

export function useReducedFlashingSetting(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore(subscribeReducedFlashing, getReducedFlashing, () => false);
  return [v, setReducedFlashing];
}
