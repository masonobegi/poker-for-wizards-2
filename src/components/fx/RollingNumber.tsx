/**
 * A number that rolls up (or down) to a new value with a spring instead of
 * snapping — the pot, a stack size, a bet. The spring's own physics give the
 * "overshoot on a big jump" feel for free: a large delta swings further past
 * the target before settling than a small one does.
 *
 * Renders a plain `<span>` — the animation lives entirely in a MotionValue
 * subscription (`spring.on('change', ...)`), so this never mounts a
 * `motion.*` element or animates layout-affecting CSS; it just changes text.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { useMotionValue, useSpring, type SpringOptions } from 'framer-motion';
import { useReducedMotionPref } from './useReducedMotionPref';

export interface RollingNumberProps {
  value: number;
  className?: string;
  format?: (n: number) => string;
  spring?: SpringOptions;
}

const DEFAULT_SPRING: SpringOptions = { stiffness: 170, damping: 15, mass: 1 };
const CALM_SPRING: SpringOptions = { stiffness: 280, damping: 30, mass: 1 };

const defaultFormat = (n: number): string => n.toLocaleString();

function RollingNumberBase({ value, className, format = defaultFormat, spring: springOpts }: RollingNumberProps) {
  const reduced = useReducedMotionPref();
  const mv = useMotionValue(value);
  const spring = useSpring(mv, reduced ? CALM_SPRING : (springOpts ?? DEFAULT_SPRING));
  const [display, setDisplay] = useState(value);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      mv.jump(value);
      setDisplay(value);
      return;
    }
    if (reduced) {
      mv.jump(value);
      setDisplay(value);
    } else {
      mv.set(value);
    }
  }, [value, reduced, mv]);

  useEffect(() => spring.on('change', (v) => setDisplay(Math.round(v))), [spring]);

  return <span className={className}>{format(display)}</span>;
}

export const RollingNumber = memo(RollingNumberBase);
export default RollingNumber;
