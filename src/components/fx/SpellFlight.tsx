/**
 * The sigil card that leaves your hand and travels to its target before a
 * spell lands — the visual `vfx`'s particle bursts alone can't give, because
 * a burst has no notion of "this specific card, right now, going there."
 *
 * Two ways to fire a flight:
 *  - `fireNow(originEl, targetElOrPoint, school, sigilId)` — the target is
 *    already known (an untargeted sigil, or a response cast off the stack).
 *  - `arm(originEl, school, sigilId)` then, once the player actually picks a
 *    target, `release(targetEl)` — for sigils that ask for a card or player.
 *    `cancel()` clears an armed cast that never got a target (the prompt was
 *    dismissed); armed state also self-expires so a missed `cancel()` can
 *    never wedge it open.
 *
 * Everything here is `position: fixed` + `transform`/`opacity`, portalled to
 * `<body>` like `VfxLayer`, and is pure decoration: a flight that never gets
 * released just never appears, and nothing here can block a real game
 * action. Skipped entirely under reduced motion — a card teleporting under
 * reduced motion is a static jump-cut already; animating that would only be
 * noise.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
// `centerOf` and `SCHOOL_COLOR` come from the lazy-loading shim, and the
// types/pure-function come from the dependency-free particle module — never
// from the `@/vfx` barrel, which statically re-exports `VfxLayer` and would
// pull the whole (deliberately code-split) particle engine into this chunk.
import { centerOf, SCHOOL_COLOR } from '@/lib/visuals';
import { prefersReducedMotion, type School, type Vec2 } from '@/vfx/particles';
import './SpellFlight.css';
import { Mark } from '@/art/marks';

interface Flight {
  id: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  school: School;
  /** The sigil's id: the flight draws its real mark, not a character. */
  sigilId: string;
}

interface Armed {
  x: number;
  y: number;
  school: School;
  sigilId: string;
  timeout: number;
}

const ARM_TIMEOUT_MS = 15000;
let nextId = 1;
let armed: Armed | null = null;
let flights: Flight[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function resolveTarget(target: Element | null | Vec2): Vec2 | null {
  if (target === null) return null;
  if ('x' in target && 'y' in target) return target;
  return centerOf(target);
}

function clearArmed(): void {
  if (armed) {
    window.clearTimeout(armed.timeout);
    armed = null;
  }
}

function spawn(from: Vec2, to: Vec2, school: School, sigilId: string): void {
  if (prefersReducedMotion()) return;
  const id = nextId++;
  flights = [...flights, { id, fromX: from.x, fromY: from.y, toX: to.x, toY: to.y, school, sigilId }];
  notify();
}

function despawn(id: number): void {
  flights = flights.filter((f) => f.id !== id);
  notify();
}

export const spellFlight = {
  /** Arm a cast whose target isn't known yet — the player is about to pick one. */
  arm(originEl: Element | null, school: School, sigilId: string): void {
    clearArmed();
    const at = centerOf(originEl);
    if (at === null) return;
    const timeout = window.setTimeout(clearArmed, ARM_TIMEOUT_MS);
    armed = { x: at.x, y: at.y, school, sigilId, timeout };
  },
  /** The target was just picked — fire the flight from the armed origin. */
  release(target: Element | null | Vec2): void {
    if (armed === null) return;
    const to = resolveTarget(target);
    const { x, y, school, sigilId } = armed;
    clearArmed();
    if (to === null) return;
    spawn({ x, y }, to, school, sigilId);
  },
  /** An armed cast was abandoned — the target prompt closed without a pick. */
  cancel(): void {
    clearArmed();
  },
  /** Origin and target are both already known — fire immediately. */
  fireNow(originEl: Element | null, target: Element | null | Vec2, school: School, sigilId: string): void {
    const from = centerOf(originEl);
    const to = resolveTarget(target);
    if (from === null || to === null) return;
    spawn(from, to, school, sigilId);
  },
};

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Flight[] {
  return flights;
}

/** Mount exactly once, anywhere in the table scene — it portals to `<body>`. */
export function SpellFlightLayer(): JSX.Element | null {
  const live = useSyncExternalStore(subscribe, getSnapshot);
  if (typeof document === 'undefined' || live.length === 0) return null;

  return createPortal(
    <div className="fx-spellflight-layer" aria-hidden="true">
      {live.map((f) => (
        <FlightOrb key={f.id} flight={f} />
      ))}
    </div>,
    document.body,
  );
}

function FlightOrb({ flight }: { flight: Flight }) {
  const dx = flight.toX - flight.fromX;
  const dy = flight.toY - flight.fromY;
  const arc = -Math.min(140, Math.hypot(dx, dy) * 0.3 + 40);
  const color = SCHOOL_COLOR[flight.school] ?? '#f0c465';

  useEffect(() => {
    const t = window.setTimeout(() => despawn(flight.id), 520);
    return () => window.clearTimeout(t);
  }, [flight.id]);

  return (
    <motion.div
      className="fx-spellflight"
      style={{
        left: flight.fromX,
        top: flight.fromY,
        ['--fx-school' as string]: color,
      }}
      initial={{ transform: 'translate3d(-50%,-50%,0) scale(0.5)', opacity: 0 }}
      animate={{
        transform: [
          'translate3d(-50%,-50%,0) scale(0.5)',
          `translate3d(calc(-50% + ${(dx * 0.5).toFixed(1)}px), calc(-50% + ${(dy * 0.5 + arc).toFixed(1)}px), 0) scale(1.15)`,
          `translate3d(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px), 0) scale(0.4)`,
        ],
        opacity: [0, 1, 0.9],
      }}
      transition={{ duration: 0.46, times: [0, 0.55, 1], ease: ['easeOut', 'easeIn'] }}
    >
      <span className="fx-spellflight-glyph"><Mark kind="sigil" id={flight.sigilId} /></span>
      <span className="fx-spellflight-tail" />
    </motion.div>
  );
}

export default SpellFlightLayer;
