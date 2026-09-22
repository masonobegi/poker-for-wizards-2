/**
 * Gamepad input.
 *
 * Steam Deck ships without a mouse pointer in the foreground, and Steam Deck
 * Verified requires the whole game to be playable on the pad. That means more
 * than binding four buttons: every screen needs a focus model, and the button
 * hints on screen have to say what the player is actually holding.
 *
 * This module is the input half — polling, deadzones, edge detection, repeat.
 * `GamepadLayer` turns it into navigation.
 */

export type Pad =
  | 'a' | 'b' | 'x' | 'y'
  | 'lb' | 'rb' | 'lt' | 'rt'
  | 'back' | 'start'
  | 'up' | 'down' | 'left' | 'right';

/** Standard Gamepad mapping indices. */
const BUTTON_INDEX: Partial<Record<Pad, number>> = {
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  back: 8, start: 9,
  up: 12, down: 13, left: 14, right: 15,
};

const AXIS_DEADZONE = 0.55;
/** Held-direction repeat, so a stick scrolls a list at a usable speed. */
const REPEAT_FIRST_MS = 420;
const REPEAT_NEXT_MS = 110;

type Handler = (button: Pad) => void;

const down = new Set<Pad>();
const repeatAt = new Map<Pad, number>();
const handlers = new Set<Handler>();
const releaseHandlers = new Set<Handler>();

let raf = 0;
let active = false;
let lastSeen = 0;

/** True while a pad has been touched recently enough to drive the UI. */
export const gamepadActive = (): boolean => active;

let activeListeners = new Set<(on: boolean) => void>();
export function onGamepadActiveChange(fn: (on: boolean) => void): () => void {
  activeListeners.add(fn);
  return () => { activeListeners.delete(fn); };
}

function setActive(on: boolean): void {
  if (active === on) return;
  active = on;
  document.documentElement.dataset.gamepad = on ? '1' : '';
  for (const fn of activeListeners) fn(on);
}

export function onGamepad(fn: Handler): () => void {
  handlers.add(fn);
  return () => { handlers.delete(fn); };
}

export function onGamepadRelease(fn: Handler): () => void {
  releaseHandlers.add(fn);
  return () => { releaseHandlers.delete(fn); };
}

function press(b: Pad): void {
  for (const fn of [...handlers]) {
    try { fn(b); } catch { /* a bad listener must not stop input */ }
  }
}

/** Which direction the sticks are pushed, as if they were the d-pad. */
function axisDirections(g: Gamepad): Pad[] {
  const out: Pad[] = [];
  const [lx = 0, ly = 0] = g.axes;
  if (lx <= -AXIS_DEADZONE) out.push('left');
  if (lx >= AXIS_DEADZONE) out.push('right');
  if (ly <= -AXIS_DEADZONE) out.push('up');
  if (ly >= AXIS_DEADZONE) out.push('down');
  return out;
}

function poll(): void {
  raf = requestAnimationFrame(poll);

  const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
  const pad = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
  const now = performance.now();

  if (!pad) {
    if (down.size) { for (const b of down) release(b); }
    // Do not flip back to keyboard hints the instant a pad sleeps.
    if (active && now - lastSeen > 30_000) setActive(false);
    return;
  }

  const pressed = new Set<Pad>();
  for (const [name, idx] of Object.entries(BUTTON_INDEX) as Array<[Pad, number]>) {
    const btn = pad.buttons[idx];
    if (btn && (btn.pressed || btn.value > 0.5)) pressed.add(name);
  }
  for (const dir of axisDirections(pad)) pressed.add(dir);

  if (pressed.size) { lastSeen = now; setActive(true); }

  for (const b of pressed) {
    if (!down.has(b)) {
      down.add(b);
      repeatAt.set(b, now + REPEAT_FIRST_MS);
      press(b);
    } else if (isRepeatable(b)) {
      const next = repeatAt.get(b) ?? Infinity;
      if (now >= next) {
        repeatAt.set(b, now + REPEAT_NEXT_MS);
        press(b);
      }
    }
  }
  for (const b of [...down]) if (!pressed.has(b)) release(b);
}

function release(b: Pad): void {
  down.delete(b);
  repeatAt.delete(b);
  for (const fn of [...releaseHandlers]) {
    try { fn(b); } catch { /* ignore */ }
  }
}

/** Only directions auto-repeat; a held A must not fire twice. */
const isRepeatable = (b: Pad): boolean =>
  b === 'up' || b === 'down' || b === 'left' || b === 'right' || b === 'lt' || b === 'rt';

export function startGamepad(): () => void {
  if (typeof window === 'undefined' || typeof navigator.getGamepads !== 'function') {
    return () => {};
  }
  const onConnect = () => { lastSeen = performance.now(); setActive(true); };
  window.addEventListener('gamepadconnected', onConnect);
  raf = requestAnimationFrame(poll);
  return () => {
    window.removeEventListener('gamepadconnected', onConnect);
    cancelAnimationFrame(raf);
    for (const b of [...down]) release(b);
    setActive(false);
  };
}

/** Glyphs for on-screen hints, so the prompts match the hardware. */
export const PAD_GLYPH: Record<Pad, string> = {
  a: 'Ⓐ', b: 'Ⓑ', x: 'Ⓧ', y: 'Ⓨ',
  lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT',
  back: '⧉', start: '☰',
  up: '↑', down: '↓', left: '←', right: '→',
};
