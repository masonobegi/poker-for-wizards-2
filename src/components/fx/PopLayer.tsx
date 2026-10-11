/**
 * "+N" over whoever just took a pot.
 *
 * The basketball roguelike pops a "+3" off every made shot (in from nothing
 * through a big overshoot, unwinding a tilt, white on contact) and floats a
 * "+0.25" up off its HYPE meter (18px over 0.7s, fading after a beat). The
 * pot here already flies to the winner as coins; what was missing was the
 * number arriving with them — the seat's stack ticks up somewhere small, and
 * the size of the win was only ever in the showdown panel.
 *
 * Timed to land with the coins (the `potCollect` burst takes ~420ms to reach
 * the seat), so the number and the money arrive as one beat: the basketball
 * game's "points land with the ball, not before".
 *
 * Fixed-position over the table, portalled to <body> like the vfx layer so
 * the camera shake does not drag it. Never takes a click, never holds a turn.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { onFx } from '@/store/net';
import { centerOf, elementForSeat } from '@/lib/visuals';
import { useReducedMotionPref } from './useReducedMotionPref';
import { flashPeak, motionPrefs } from './arcade';
import { EASE_OUT, EASE_SNAP } from '@/styles/motion';
import './arcade.css';

interface Pop { key: number; owner: string; x: number; y: number; text: string; delay: number }

/** Seconds: when the coins from the pot reach the seat. */
export const POP_LAND_S = 0.38;
/** Seconds a pop is on screen, start to gone. */
export const POP_LIFE_S = 1.15;

let seq = 0;

export default function PopLayer() {
  const [pops, setPops] = useState<Pop[]>([]);
  const reduced = useReducedMotionPref();

  useEffect(() => onFx((e) => {
    if (e.t !== 'pot_to' || !(e.amount > 0)) return;
    const at = centerOf(elementForSeat(e.playerId));
    if (!at) return;
    setPops((ps) => {
      // A side pot to the same seat stacks above the first instead of on it.
      const same = ps.filter((p) => p.owner === e.playerId).length;
      const next: Pop = {
        key: ++seq,
        owner: e.playerId,
        x: Math.round(at.x),
        y: Math.round(at.y - 30 - same * 26),
        text: `+${e.amount.toLocaleString()}`,
        delay: POP_LAND_S + same * 0.12,
      };
      return [...ps.slice(-7), next];
    });
  }), []);

  const done = (key: number): void => setPops((ps) => ps.filter((p) => p.key !== key));

  if (typeof document === 'undefined') return null;
  const peak = flashPeak(motionPrefs());

  return createPortal(
    <div className="hx-pops" aria-hidden>
      <AnimatePresence>
        {pops.map((p) => (
          <motion.span
            key={p.key}
            className="hx-pop"
            style={{ left: p.x, top: p.y }}
            initial={reduced
              ? { opacity: 0 }
              : { opacity: 0, transform: 'translateY(0px) scale(0.5) rotate(-12deg)', filter: `brightness(${peak})` }}
            animate={reduced
              ? { opacity: [0, 1, 1, 0] }
              : {
                opacity: [0, 1, 1, 0],
                // In through an overshoot while the tilt unwinds, then up and away.
                transform: [
                  'translateY(0px) scale(0.5) rotate(-12deg)',
                  'translateY(-10px) scale(1) rotate(0deg)',
                  'translateY(-40px) scale(1) rotate(0deg)',
                ],
                filter: [`brightness(${peak})`, 'brightness(1)', 'brightness(1)'],
              }}
            transition={reduced
              ? { duration: POP_LIFE_S, delay: p.delay, times: [0, 0.1, 0.75, 1], ease: 'linear' }
              : {
                delay: p.delay,
                opacity: { duration: POP_LIFE_S, delay: p.delay, times: [0, 0.05, 0.65, 1], ease: 'linear' },
                transform: { duration: POP_LIFE_S, delay: p.delay, times: [0, 0.2, 1], ease: [EASE_SNAP, EASE_OUT] },
                filter: { duration: POP_LIFE_S, delay: p.delay, times: [0, 0.14, 1], ease: 'linear' },
              }}
            onAnimationComplete={() => done(p.key)}
          >
            {p.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
