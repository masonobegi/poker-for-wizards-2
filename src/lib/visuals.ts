/**
 * Shim in front of the VFX layer, for the same reason as `sound.ts`: particles
 * are decoration, and decoration must never be able to break a hand of poker.
 */
type Point = { x: number; y: number };

interface VfxApi {
  burst(preset: string, at: Point, opts?: Record<string, unknown>): void;
  burstAtEl(preset: string, el: Element | null, opts?: Record<string, unknown>): void;
  shake(power: number, ms?: number): void;
  flash(color: string, power?: number): void;
  vignette(color: string, ms: number): void;
  chromatic(ms: number): void;
  timeRipple(at: Point): void;
  slowmo(scale: number, ms: number): void;
  confetti(at?: Point): void;
  setRoot(el: HTMLElement | null): void;
}

let api: VfxApi | null = null;
let loading: Promise<void> | null = null;
let rootEl: HTMLElement | null = null;

function load(): void {
  if (api || loading) return;
  loading = import('@/vfx/VfxLayer')
    .then((mod) => {
      const found = (mod as { vfx?: VfxApi }).vfx;
      if (found) {
        api = found;
        if (rootEl) api.setRoot(rootEl);
      }
    })
    .catch((err) => {
      if (import.meta.env?.DEV) console.warn('[vfx] layer unavailable', err);
    });
}

const call = <K extends keyof VfxApi>(fn: K, ...args: Parameters<VfxApi[K]>): void => {
  if (!api) { load(); return; }
  try { (api[fn] as (...a: unknown[]) => void)(...args); } catch { /* decoration only */ }
};

/** Screen position of an element's centre, for aiming a burst. */
export function centerOf(el: Element | null): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function elementForCard(id: string): Element | null {
  return document.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
}

export function elementForSeat(playerId: string): Element | null {
  return document.querySelector(`[data-seat-id="${CSS.escape(playerId)}"]`);
}

export const fxRoot = (el: HTMLElement | null): void => {
  rootEl = el;
  if (api) { try { api.setRoot(el); } catch { /* ignore */ } } else load();
};

export const burst = (preset: string, at: Point, opts?: Record<string, unknown>): void =>
  call('burst', preset, at, opts);
export const burstAt = (preset: string, el: Element | null, opts?: Record<string, unknown>): void =>
  call('burstAtEl', preset, el, opts);
export const shake = (power: number, ms?: number): void => call('shake', power, ms);
export const flash = (color: string, power?: number): void => call('flash', color, power);
export const vignette = (color: string, ms: number): void => call('vignette', color, ms);
export const chromatic = (ms: number): void => call('chromatic', ms);
export const timeRipple = (at: Point): void => call('timeRipple', at);
export const slowmo = (scale: number, ms: number): void => call('slowmo', scale, ms);
export const confetti = (at?: Point): void => call('confetti', at);

export const SCHOOL_COLOR: Record<string, string> = {
  entropy: '#b98cff',
  veil: '#6ec8ff',
  chronos: '#ffc861',
  bind: '#5eead4',
  ruin: '#ff7a8a',
  weave: '#a8e063',
};
