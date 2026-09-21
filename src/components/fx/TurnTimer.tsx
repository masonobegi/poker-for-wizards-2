/**
 * The countdown ring for an acting player's clock — shared by `Seat` (every
 * opponent's ring) and `ActionBar` (your own turn, which previously had no
 * visible countdown at all). The last few seconds escalate: the ring pulses,
 * shifts to the danger colour, and — only when `urgent` sound is asked for,
 * i.e. it's *your* turn — ticks with `ui_warn`, growing more insistent as
 * the ring drains further under `urgentAt`.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { playSfx } from '@/lib/sound';

export interface TurnTimerProps {
  /** Wall-clock ms the timer expires, or null while nobody's clock is running. */
  until: number | null;
  /** Total seconds the clock started at. */
  total: number;
  /** Ring diameter, px. */
  size?: number;
  /** Seconds remaining at which the ring turns urgent. */
  urgentAt?: number;
  /** Play `ui_warn` on each tick once urgent. Only the acting player's own bar should. */
  sound?: boolean;
  className?: string;
}

function TurnTimerBase({ until, total, size = 60, urgentAt = 5, sound = false, className }: TurnTimerProps) {
  const [pct, setPct] = useState(1);
  const lastTick = useRef<number | null>(null);

  useEffect(() => {
    lastTick.current = null;
    if (!until || total <= 0) { setPct(1); return; }
    let raf = 0;
    const tick = (): void => {
      const leftMs = Math.max(0, until - Date.now());
      const left = leftMs / 1000;
      setPct(Math.min(1, left / total));

      if (sound && left <= urgentAt && left > 0) {
        const whole = Math.ceil(left);
        if (lastTick.current !== whole) {
          lastTick.current = whole;
          playSfx('ui_warn', { pitch: 1 + (urgentAt - whole) * 0.06, vol: 0.7 });
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [until, total, sound, urgentAt]);

  const r = (size / 2) - 3;
  const c = 2 * Math.PI * r;
  const secondsLeft = pct * total;
  const urgent = until !== null && secondsLeft <= urgentAt;

  return (
    <svg
      className={['fx-turntimer', urgent ? 'is-urgent' : '', className ?? ''].filter(Boolean).join(' ')}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      aria-hidden
    >
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2.5"
      />
      <circle
        className="fx-turntimer-fill"
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={urgent ? 'var(--bad)' : 'var(--gold)'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export const TurnTimer = memo(TurnTimerBase);
export default TurnTimer;
