/**
 * Playing HEXHOLD on a controller.
 *
 * Renders nothing. It gives the whole app a focus model driven by the d-pad or
 * left stick, maps the face buttons onto the actions the keyboard already has,
 * and swaps every on-screen key hint to controller glyphs while a pad is in
 * use. Without this the game is unplayable on a Steam Deck, which is most of
 * what "Steam Deck Verified" is asking about.
 */
import { useEffect } from 'react';
import { PAD_GLYPH, onGamepad, startGamepad, type Pad } from '@/lib/gamepad';
import { playSfx } from '@/lib/sound';
import './gamepad.css';

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[data-pad-focus]',
].join(',');

interface Target {
  el: HTMLElement;
  x: number;
  y: number;
  rect: DOMRect;
}

/**
 * The region the player is actually in.
 *
 * Listing overlay class names by hand was wrong within a day — the intro uses
 * its own scrim and the pad could not reach its Skip button. Find the topmost
 * thing that behaves like a modal instead: a dialog, or a fixed layer covering
 * most of the screen that contains something focusable, whichever sits highest.
 */
function scopeElement(): Element {
  const dialog = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')]
    .filter((el) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed');
  if (dialog.length) return dialog[dialog.length - 1];

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let best: { el: Element; z: number } | null = null;

  for (const el of document.querySelectorAll<HTMLElement>('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (Number(cs.opacity) < 0.2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < vw * 0.6 || r.height < vh * 0.6) continue;
    if (!el.querySelector(FOCUSABLE)) continue;
    const z = Number.parseInt(cs.zIndex, 10);
    const zi = Number.isFinite(z) ? z : 0;
    if (!best || zi >= best.z) best = { el, z: zi };
  }
  return best?.el ?? document.body;
}

/** Everything the player could plausibly move to right now. */
function candidates(): Target[] {
  const out: Target[] = [];
  const scope = scopeElement();

  for (const node of scope.querySelectorAll<HTMLElement>(FOCUSABLE)) {
    if (node.hasAttribute('data-pad-skip')) continue;
    const rect = node.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const cs = getComputedStyle(node);
    if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
    // Deliberately no opacity test. An element that is mounted and
    // hit-testable is reachable, even mid-fade — gating on opacity turned
    // every `initial={{ opacity: 0 }}` in the app into a window where the
    // d-pad silently skipped the control that was arriving.
    // `visibility`/`display`/`pointer-events` already exclude the things that
    // are genuinely not there.
    out.push({ el: node, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect });
  }
  return out;
}

/**
 * The nearest thing in the direction pushed, preferring candidates that are
 * well aligned with the current one over ones that merely happen to be closer.
 */
function pick(from: Target | null, dir: Pad, all: Target[]): HTMLElement | null {
  if (all.length === 0) return null;
  if (!from) {
    // Nothing focused: start from whatever is nearest the bottom centre, which
    // is where the controls live.
    return all.reduce((best, t) => {
      const score = (x: Target) => Math.abs(x.x - window.innerWidth / 2) + (window.innerHeight - x.y) * 0.5;
      return score(t) < score(best) ? t : best;
    }).el;
  }

  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'left' || dir === 'up' ? -1 : 1;

  let best: { el: HTMLElement; cost: number } | null = null;
  for (const t of all) {
    if (t.el === from.el) continue;
    const dx = t.x - from.x;
    const dy = t.y - from.y;
    const along = horizontal ? dx * sign : dy * sign;
    const across = horizontal ? Math.abs(dy) : Math.abs(dx);
    if (along <= 6) continue;              // not actually in that direction
    if (across > along * 2.6 + 120) continue; // too far off-axis to be meant
    const cost = along + across * 1.8;
    if (!best || cost < best.cost) best = { el: t.el, cost };
  }
  if (best) return best.el;

  // Nothing that way: wrap to the far side, so a pad can never dead-end in a
  // corner with controls it cannot reach.
  const far = all
    .filter((t) => t.el !== from.el)
    .sort((p, q) => (horizontal ? (p.x - q.x) : (p.y - q.y)) * sign);
  return far.length ? far[0].el : null;
}

/** Fire the keyboard shortcut the rest of the app already listens for. */
function sendKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

export default function GamepadLayer() {
  useEffect(() => {
    const stop = startGamepad();

    const off = onGamepad((button) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const typing = activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement;

      switch (button) {
        case 'up': case 'down': case 'left': case 'right': {
          if (typing && (button === 'left' || button === 'right')) return;
          const all = candidates();
          // If focus is outside the current scope — an overlay just opened over
          // it — take the first press to step into the new scope rather than
          // moving within one the player can no longer see.
          const current = all.find((t) => t.el === activeEl) ?? null;
          const next = current || !activeEl || activeEl === document.body
            ? pick(current, button, all)
            : pick(null, button, all);
          if (next) {
            next.focus({ preventScroll: true });
            next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            playSfx('ui_hover', { vol: 0.3 });
          }
          break;
        }

        case 'a': {
          if (activeEl && activeEl !== document.body && typeof activeEl.click === 'function' && !typing) {
            activeEl.click();
            playSfx('ui_click');
          } else {
            // Nothing focused: the common case at a table is check or call.
            sendKey('c');
          }
          break;
        }

        case 'b':
          sendKey('Escape');
          playSfx('ui_back');
          break;

        case 'x':
          sendKey('r');
          break;

        case 'y':
          sendKey('a');
          break;

        case 'lb':
          sendKey('f');
          break;

        case 'rb':
          sendKey('Enter');
          break;

        case 'start':
          sendKey('Escape');
          break;

        default:
          break;
      }
    });

    return () => { off(); stop(); };
  }, []);

  // Only visible while a pad is in use (see gamepad.css).
  return (
    <div className="pad-legend" aria-hidden>
      <span><b>{PAD_GLYPH.a}</b>Select</span>
      <span><b>{PAD_GLYPH.b}</b>Back</span>
      <span><b>{PAD_GLYPH.lb}</b>Fold</span>
      <span><b>{PAD_GLYPH.x}</b>Raise</span>
      <span><b>{PAD_GLYPH.y}</b>All In</span>
      <span><b>{PAD_GLYPH.start}</b>Menu</span>
    </div>
  );
}

export { PAD_GLYPH };
