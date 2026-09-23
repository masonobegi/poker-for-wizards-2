import { useEffect, useRef } from 'react';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';

/**
 * Dust in the lamp light.
 *
 * A poker table between actions is a still image, and a still image is how a
 * screen tells you nothing is running. Every other idle cue considered here
 * was worse: a breathing glow reads as a loading state, a drifting gradient
 * reads as a screensaver, and moving the cards themselves would lie about
 * whether anything had happened. Motes are the one thing that can move
 * continuously without ever implying a game event, because in a real room
 * they are moving whether or not anyone is playing.
 *
 * They are lit rather than drawn: brightness is a function of how close a
 * mote is to the lamp, so the same particle fades out crossing the dark side
 * of the table and catches the light coming back. That single rule is what
 * keeps them from reading as snow.
 *
 * Costs about 0.2 ms a frame at 24 fps on a half-resolution buffer, allocates
 * nothing after mount, and stops entirely when the tab is hidden or the
 * player has asked for reduced motion.
 */

const COUNT = 46;
const FPS = 24;
/** The buffer is deliberately coarse — a blurred mote has no detail to lose. */
const RES = 0.5;

/** Where the lamp hangs, in normalised felt space. Mirrors `--lamp-x/y`. */
const LAMP_X = 0.44;
const LAMP_Y = 0.33;

interface Mote {
  x: number; y: number;
  vx: number; vy: number;
  r: number;
  /** Phase of this mote's own slow sway, so they never move as a block. */
  ph: number;
  sp: number;
}

export default function FeltDust() {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    if (reduced) return;
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d', { alpha: true });
    if (!ctx) return;

    const motes: Mote[] = [];
    for (let i = 0; i < COUNT; i++) {
      motes.push({
        x: Math.random(),
        y: Math.random(),
        // Drifting up and slightly with the room, the way warm air moves.
        vx: (Math.random() - 0.5) * 0.010,
        vy: -0.004 - Math.random() * 0.010,
        r: 0.5 + Math.random() * 1.5,
        ph: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 0.9,
      });
    }

    let w = 0, h = 0;
    const resize = (): void => {
      const b = cv.getBoundingClientRect();
      w = Math.max(1, Math.round(b.width * RES));
      h = Math.max(1, Math.round(b.height * RES));
      if (cv.width !== w) cv.width = w;
      if (cv.height !== h) cv.height = h;
    };
    resize();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    ro?.observe(cv);

    let raf = 0;
    let last = 0;
    const frame = (t: number): void => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      if (t - last < 1000 / FPS) return;
      const dt = Math.min(0.1, (t - last) / 1000);
      last = t;
      if (w < 2 || h < 2) return;

      ctx.clearRect(0, 0, w, h);
      const time = t / 1000;

      for (let i = 0; i < motes.length; i++) {
        const m = motes[i];
        m.x += (m.vx + Math.sin(time * m.sp + m.ph) * 0.006) * dt;
        m.y += m.vy * dt;
        // Off the top, back on at the bottom — the column of air is a loop.
        if (m.y < -0.04) { m.y = 1.04; m.x = Math.random(); }
        if (m.x < -0.04) m.x = 1.04;
        else if (m.x > 1.04) m.x = -0.04;

        // Lit, not drawn. Distance from the lamp is the only thing setting
        // brightness, so a mote crossing the dark side genuinely disappears.
        const dx = (m.x - LAMP_X) * 1.25;
        const dy = m.y - LAMP_Y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const lit = Math.max(0, 1 - d / 0.62);
        if (lit <= 0.01) continue;
        const a = lit * lit * 0.34 * (0.6 + 0.4 * Math.sin(time * m.sp * 1.7 + m.ph));
        if (a <= 0.004) continue;

        ctx.globalAlpha = a;
        ctx.fillStyle = '#e8d6ae';
        ctx.beginPath();
        ctx.arc(m.x * w, m.y * h, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [reduced]);

  if (reduced) return null;
  return <canvas ref={ref} className="felt-dust" aria-hidden />;
}
