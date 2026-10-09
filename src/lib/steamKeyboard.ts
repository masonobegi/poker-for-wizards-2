/**
 * Steam's on-screen keyboard for text fields, when a pad is in use.
 *
 * A controller cannot type. On a Steam Deck in Game Mode, and in Big Picture,
 * nothing brings up a keyboard unless the game asks Steam for one
 * (ShowFloatingGamepadTextInput). Without this a pad player was stuck on the
 * table code in Join, a name, or a sigil in the Scribe (playtest P8).
 *
 * When it opens, with a pad in use:
 *   - pressing A on a focused text field (see GamepadLayer);
 *   - a text field taking focus any other way: a panel that opens with its
 *     field focused;
 *   - a tap on a text field with a finger (the Deck's touchscreen), pad or not.
 * Not when the d-pad merely moves focus onto a field on the way past it
 * (GamepadLayer focuses through `focusQuietly`), and never with a mouse and
 * keyboard.
 *
 * The keyboard types into the focused field as ordinary key events, so Enter
 * on it submits a form like a real Enter. Without Steam (a browser, the
 * DRM-free build, the desktop outside Big Picture) the call resolves false and
 * nothing happens.
 */
import { gamepadActive } from '@/lib/gamepad';

type KeyboardBridge = {
  showKeyboard?: (req: { x: number; y: number; width: number; height: number; multiline: boolean }) => Promise<boolean>;
};

const bridge = (): KeyboardBridge | undefined =>
  (window as unknown as { hexhold?: { steam?: KeyboardBridge } }).hexhold?.steam;

const TEXT_TYPES = new Set(['', 'text', 'search', 'email', 'url', 'tel', 'password', 'number']);

/** A field a person types into: a textarea, or an input that takes text. */
export function isTextField(el: unknown): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  if (el instanceof HTMLInputElement) {
    return TEXT_TYPES.has((el.getAttribute('type') ?? '').toLowerCase()) && !el.disabled && !el.readOnly;
  }
  return false;
}

/** Ask Steam for its keyboard beside this field. Resolves true if it showed. */
export async function openSteamKeyboard(el: Element | null): Promise<boolean> {
  const show = bridge()?.showKeyboard;
  if (!show || !isTextField(el)) return false;
  const r = el.getBoundingClientRect();
  try {
    return (await show({
      x: r.left, y: r.top, width: r.width, height: r.height,
      multiline: el instanceof HTMLTextAreaElement,
    })) === true;
  } catch {
    return false;
  }
}

let quiet = false;

/** Move focus without opening the keyboard: d-pad navigation passing by. */
export function focusQuietly(el: HTMLElement, opts?: FocusOptions): void {
  quiet = true;
  try { el.focus(opts); } finally { quiet = false; }
}

/** A tap this recent counts as the reason a field took focus. */
const TOUCH_MS = 800;

/**
 * Open the keyboard whenever a text field takes focus while a pad is in use,
 * or because a finger tapped it (a Deck's touchscreen, before any button).
 */
export function startSteamKeyboard(isPad: () => boolean = gamepadActive): () => void {
  let touchedAt = -Infinity;
  const onPointer = (e: PointerEvent) => { if (e.pointerType === 'touch') touchedAt = performance.now(); };
  const onFocus = (e: FocusEvent) => {
    if (quiet || !isTextField(e.target)) return;
    if (!isPad() && performance.now() - touchedAt > TOUCH_MS) return;
    void openSteamKeyboard(e.target);
  };
  document.addEventListener('pointerdown', onPointer, true);
  document.addEventListener('focusin', onFocus);
  return () => {
    document.removeEventListener('pointerdown', onPointer, true);
    document.removeEventListener('focusin', onFocus);
  };
}
