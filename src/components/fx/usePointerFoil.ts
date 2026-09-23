/**
 * Pointer foil — the 3D tilt and the specular highlight that follows the
 * cursor across a card.
 *
 * This lived inline in `Card.tsx` and nowhere else, so the sigils — the
 * things the game is actually named after — were flat while the playing
 * cards had depth. Lifting it out is what lets both use it, and keeps the
 * two from drifting apart the next time one of them is tuned.
 *
 * Three things are deliberate:
 *
 *  - The springs run on the POINTER POSITION, not on the resulting angle.
 *    Spring a position once and every consumer of it (angle, highlight
 *    centre) stays in step; spring each output separately and the highlight
 *    lags the tilt by however much their spring constants differ.
 *  - `strength` is a motion value, not a constant, so a caller can raise the
 *    sheen per element (a legendary sigil glints harder than a common one)
 *    without a second hook instance.
 *  - `on` is false under reduced motion or a coarse pointer, and the caller
 *    is expected to skip the elements entirely rather than render them at
 *    zero — an always-mounted `mix-blend-mode: overlay` layer costs a
 *    composite layer per card for nothing.
 *
 * The returned transform values are meant for `style`, not `animate`. They
 * are MotionValues, so writing them never re-renders React.
 */
import { useCallback, useMemo } from 'react';
import {
  useMotionTemplate,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
  type SpringOptions,
} from 'framer-motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { useFinePointer } from '@/components/fx/useFinePointer';

const TILT_SPRING: SpringOptions = { stiffness: 260, damping: 26, mass: 0.5 };
const GLARE_SPRING: SpringOptions = { stiffness: 190, damping: 30, mass: 0.4 };

export interface PointerFoilOptions {
  /** Degrees of rotation at the element's edge. */
  tilt?: number;
  /** Peak alpha of the specular highlight, 0..1. */
  strength?: number;
  /** How far across the element the highlight falls off, as a percentage. */
  spread?: number;
  /**
   * An extra condition — `false` keeps the hook mounted (hooks cannot be
   * conditional) but reports `on: false`.
   */
  enabled?: boolean;
}

export interface PointerFoil {
  /** Render the tilt and sheen only when this is true. */
  on: boolean;
  rotateX: MotionValue<number>;
  rotateY: MotionValue<number>;
  /** A `radial-gradient(...)` centred on the pointer, for `backgroundImage`. */
  sheen: MotionValue<string>;
  /** 0 when the pointer is away, `strength` when it is over the element. */
  sheenOpacity: MotionValue<number>;
  /** Attach to the element whose bounding box the pointer is measured against. */
  onPointerMove: (e: { currentTarget: Element; clientX: number; clientY: number }) => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
}

export function usePointerFoil({
  tilt = 10,
  strength = 0.5,
  spread = 58,
  enabled = true,
}: PointerFoilOptions = {}): PointerFoil {
  const reduced = useReducedMotionPref();
  const finePointer = useFinePointer();
  const on = enabled && finePointer && !reduced;

  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const hot = useMotionValue(0);

  const sx = useSpring(px, TILT_SPRING);
  const sy = useSpring(py, TILT_SPRING);
  const sHot = useSpring(hot, GLARE_SPRING);

  const rotateX = useTransform(sy, [0, 1], [tilt, -tilt]);
  const rotateY = useTransform(sx, [0, 1], [-tilt, tilt]);
  const sheenOpacity = useTransform(sHot, (v: number) => v * strength);

  const gx = useTransform(sx, (v: number) => `${(v * 100).toFixed(2)}%`);
  const gy = useTransform(sy, (v: number) => `${(v * 100).toFixed(2)}%`);
  const sheen = useMotionTemplate`radial-gradient(circle at ${gx} ${gy}, rgba(255,255,255,1), rgba(255,255,255,0) ${spread}%)`;

  const onPointerMove = useCallback(
    (e: { currentTarget: Element; clientX: number; clientY: number }) => {
      if (!on) return;
      const r = e.currentTarget.getBoundingClientRect();
      // A zero box happens while the element is still animating in; dividing
      // by it puts the highlight at Infinity and the tilt at NaN, which
      // framer then writes into the transform and the card vanishes.
      if (r.width === 0 || r.height === 0) return;
      px.set((e.clientX - r.left) / r.width);
      py.set((e.clientY - r.top) / r.height);
    },
    [on, px, py],
  );

  const onPointerEnter = useCallback(() => {
    if (on) hot.set(1);
  }, [on, hot]);

  // Always recentres, even when `on` is false: the setting can be turned off
  // while the pointer is over a card, and the springs would otherwise hold
  // their last angle forever.
  const onPointerLeave = useCallback(() => {
    px.set(0.5);
    py.set(0.5);
    hot.set(0);
  }, [px, py, hot]);

  return useMemo(
    () => ({ on, rotateX, rotateY, sheen, sheenOpacity, onPointerMove, onPointerEnter, onPointerLeave }),
    [on, rotateX, rotateY, sheen, sheenOpacity, onPointerMove, onPointerEnter, onPointerLeave],
  );
}

export default usePointerFoil;
