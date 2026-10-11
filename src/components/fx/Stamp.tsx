/**
 * A word slammed onto something: BUSTED across a seat, COUNTERED across a
 * spell, BOUGHT across a Market card.
 *
 * Ported from the basketball roguelike's callouts ("REJECTED!!", "BODIED!!",
 * "STOLEN!!"): the word arrives at 2-3x, lands through a slight overshoot,
 * whites out for a couple of frames on contact, and leaves stretched flat.
 * It sits over whatever it labels and never takes a click.
 *
 * Mount it inside an `<AnimatePresence initial={false}>` and render it only
 * while the state holds, so a stamp that was already true when the component
 * mounted (a page reload mid-run) sits there quietly instead of slamming.
 */
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { motionPrefs, slamMotion } from './arcade';
import { useReducedMotionPref } from './useReducedMotionPref';
import './arcade.css';

export type StampTone = 'bad' | 'ice' | 'gold';

export interface StampProps {
  text: string;
  tone?: StampTone;
  /** Starting scale; bigger words on bigger moments. */
  from?: number;
  rotate?: number;
  delay?: number;
  className?: string;
}

export function Stamp({ text, tone = 'bad', from = 2.4, rotate = -8, delay = 0, className }: StampProps) {
  // Subscribed so a settings change re-plans; the plan itself reads both
  // settings (reduced motion and reduce flashing) from the document.
  const reduced = useReducedMotionPref();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const m = useMemo(() => slamMotion(motionPrefs(), { from, rotate, delay }), [reduced, from, rotate, delay]);
  const cls = ['hx-stamp', `is-${tone}`, className ?? ''].filter(Boolean).join(' ');
  return (
    <motion.span
      className={cls}
      initial={m.initial}
      animate={m.animate}
      exit={m.exit}
      transition={m.transition}
      aria-hidden
    >
      {text}
    </motion.span>
  );
}

export default Stamp;
