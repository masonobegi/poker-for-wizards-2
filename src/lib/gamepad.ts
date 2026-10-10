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

  if (pressed.size) { lastSeen = now; setActive(true); setFamily(padFamily(pad.id)); }

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
  const onConnect = (e: Event) => {
    lastSeen = performance.now();
    const id = (e as GamepadEvent).gamepad?.id;
    if (id) setFamily(padFamily(id));
    setActive(true);
  };
  window.addEventListener('gamepadconnected', onConnect);
  raf = requestAnimationFrame(poll);
  return () => {
    window.removeEventListener('gamepadconnected', onConnect);
    cancelAnimationFrame(raf);
    for (const b of [...down]) release(b);
    setActive(false);
  };
}

/**
 * Which face-button labels the pad in hand carries. The Standard Gamepad
 * mapping numbers buttons by position (0 is the bottom face button), so the
 * same press is A on an Xbox pad or a Deck, Cross on a PlayStation pad and B
 * on a Nintendo one. Prompts must name what is printed on the button.
 */
export type PadFamily = 'xbox' | 'playstation' | 'nintendo';

/**
 * The family, from the Gamepad API's id string. Chromium reports
 * "Name (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)" on Windows and
 * "054c-0ce6-Name" on Linux, so the USB vendor id is the reliable part:
 * 054c Sony, 057e Nintendo. Names cover drivers that hide the vendor.
 * Everything else, including the Steam Deck and Steam Input's virtual pad
 * (28de), is laid out and labelled like an Xbox pad.
 */
export function padFamily(id: string): PadFamily {
  const s = (id ?? '').toLowerCase();
  if (/\b054c\b|vendor: 054c|dualsense|dualshock|playstation|\bps[345]\b/.test(s)) return 'playstation';
  if (/\b057e\b|vendor: 057e|pro controller|joy-con|nintendo|switch/.test(s)) return 'nintendo';
  // Sony's own pads report the bare name "Wireless Controller".
  if (/^(?:[0-9a-f]{4}-[0-9a-f]{4}-)?wireless controller\b/.test(s)) return 'playstation';
  return 'xbox';
}

const DIRECTIONS = { up: '↑', down: '↓', left: '←', right: '→' } as const;

/** Glyphs for on-screen hints, per family, so the prompts match the hardware. */
export const PAD_GLYPHS: Record<PadFamily, Record<Pad, string>> = {
  xbox: {
    a: 'Ⓐ', b: 'Ⓑ', x: 'Ⓧ', y: 'Ⓨ',
    lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT',
    back: '⧉', start: '☰',
    ...DIRECTIONS,
  },
  playstation: {
    a: '✕', b: '○', x: '□', y: '△',
    lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2',
    back: 'Create', start: 'Options',
    ...DIRECTIONS,
  },
  // By position: Nintendo prints B at the bottom and A on the right.
  nintendo: {
    a: 'Ⓑ', b: 'Ⓐ', x: 'Ⓨ', y: 'Ⓧ',
    lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR',
    back: '−', start: '+',
    ...DIRECTIONS,
  },
};

/** The Xbox set, for code that predates families. Prefer `padGlyphs()`. */
export const PAD_GLYPH: Record<Pad, string> = PAD_GLYPHS.xbox;

let family: PadFamily = 'xbox';
const familyListeners = new Set<(f: PadFamily) => void>();

/** The glyph set for the pad in use (Xbox until a pad says otherwise). */
export const padGlyphs = (): Record<Pad, string> => PAD_GLYPHS[family];
export const currentPadFamily = (): PadFamily => family;

export function onPadFamilyChange(fn: (f: PadFamily) => void): () => void {
  familyListeners.add(fn);
  return () => { familyListeners.delete(fn); };
}

function setFamily(next: PadFamily): void {
  if (next === family) return;
  family = next;
  if (typeof document !== 'undefined') document.documentElement.dataset.padFamily = next;
  for (const fn of familyListeners) fn(next);
}
