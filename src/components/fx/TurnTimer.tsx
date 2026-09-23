/**
 * The countdown ring for an acting player's clock — shared by `Seat` (every
 * opponent's ring) and `ActionBar` (your own turn, which previously had no
 * visible countdown at all). The last few seconds escalate: the ring pulses,
 * shifts to the danger colour, and — only when `urgent` sound is asked for,
 * i.e. it's *your* turn — ticks with `ui_warn`, growing more insistent as
 * the ring drains further under `urgentAt`.
 *
 * The sweep itself is a CSS animation, not a render loop. It used to be a
 * `requestAnimationFrame` calling `setState` sixty times a second, with one
 * of these mounted per acting seat plus another for the hero — a React
 * re-render storm driving what is, in the end, a linear interpolation the
 * compositor can do on its own. Everything React still tracks here changes at
 * most once per turn.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
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

interface Ring {
  /** Dash offset the sweep starts from — non-zero after a mid-turn reconnect. */
  from: number;
  /** How long is actually left, which is what the animation runs for. */
  ms: number;
}

function TurnTimerBase({ until, total, size = 60, urgentAt = 5, sound = false, className }: TurnTimerProps) {
  const r = (size / 2) - 3;
  const c = 2 * Math.PI * r;

  const lastTick = useRef<number | null>(null);

  // Geometry and duration are read once per turn, DURING RENDER rather than in
  // an effect. The circle below is keyed on `until`, so the remount happens on
  // the render where `until` changes — if these values were still catching up
  // in an effect, that first frame would start the CSS animation with the
  // previous turn's offset and duration, and the effect would then rewrite the
  // custom properties mid-flight without a remount. Key and values have to
  // come from the same pass.
  //
  // A reconnect part-way through someone's clock lands at the right point
  // because `from` is derived from the time genuinely remaining, not from zero.
  const ring = useMemo<Ring | null>(() => {
    if (!until || total <= 0) return null;
    const leftMs = Math.max(0, until - Date.now());
    const pct = Math.min(1, (leftMs / 1000) / total);
    return { from: c * (1 - pct), ms: leftMs };
  }, [until, total, c]);

  // One timer for the urgent flip, rather than deriving it from a value that
  // only existed because of the per-frame render.
  const [urgent, setUrgent] = useState(false);
  useEffect(() => {
    if (!until || total <= 0) { setUrgent(false); return undefined; }
    const leftMs = Math.max(0, until - Date.now());
    setUrgent(leftMs <= urgentAt * 1000);
    const toUrgent = leftMs - urgentAt * 1000;
    if (toUrgent <= 0) return undefined;
    const t = window.setTimeout(() => setUrgent(true), toUrgent);
    return () => window.clearTimeout(t);
  }, [until, total, urgentAt]);

  // The warning ticks need a timer, but one per second — not one per frame.
  // 250ms so a whole-second boundary is never missed by more than a quarter.
  useEffect(() => {
    lastTick.current = null;
    if (!sound || !until) return undefined;
    const id = window.setInterval(() => {
      const left = Math.max(0, until - Date.now()) / 1000;
      if (left <= 0 || left > urgentAt) return;
      const whole = Math.ceil(left);
      if (lastTick.current === whole) return;
      lastTick.current = whole;
      playSfx('ui_warn', { pitch: 1 + (urgentAt - whole) * 0.06, vol: 0.7 });
    }, 250);
    return () => window.clearInterval(id);
  }, [until, sound, urgentAt]);

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
        // Keyed on the turn so a new clock restarts the CSS animation. This is
        // the one case where a remount is the correct restart mechanism: it
        // genuinely is a different animation each turn.
        key={until ?? 'idle'}
        className={`fx-turntimer-fill ${ring ? 'is-running' : ''}`}
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke={urgent ? 'var(--bad)' : 'var(--gold)'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={ring ? ring.from : 0}
        style={ring ? {
          ['--turn-from' as string]: String(ring.from),
          ['--turn-to' as string]: String(c),
          ['--turn-ms' as string]: `${ring.ms}ms`,
        } : undefined}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export const TurnTimer = memo(TurnTimerBase);
export default TurnTimer;
