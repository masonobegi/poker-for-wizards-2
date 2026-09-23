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

export const DEFAULT_PARTICLE_DENSITY: ParticleDensity = 'full';
export const DEFAULT_UI_SCALE = 1;
export const UI_SCALE_MIN = 0.8;
export const UI_SCALE_MAX = 1.25;

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

function applyUiScale(v: number): void {
  if (!hasDom()) return;
  try { document.documentElement.style.setProperty('--ui-scale', String(v)); } catch { /* ignore */ }
}

let uiScale = hasDom() ? readUiScale() : DEFAULT_UI_SCALE;
applyUiScale(uiScale);
const uiScaleListeners = new Set<() => void>();

export function getUiScale(): number { return uiScale; }

export function setUiScale(v: number): void {
  uiScale = clampScale(v);
  applyUiScale(uiScale);
  try { localStorage.setItem(UI_SCALE_KEY, String(uiScale)); } catch { /* ignore */ }
  for (const l of uiScaleListeners) l();
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
        for (const l of reducedListeners) l();
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
