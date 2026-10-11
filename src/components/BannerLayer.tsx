/**
 * Full-screen announcements: ante breaks, impossible hands, new omens, the end
 * of a run. Driven straight off the `banner` fx event so the server decides
 * what deserves the whole screen.
 *
 * Since 2026-10-11 these play as the basketball roguelike's arcade cut-ins
 * rather than as a fade (catalogue: plans/ANIM-PORT.md):
 *
 *  - the band OPENS from a sliver and overshoots (scaleY, easeOutBack) — or,
 *    for an impossible hand or an omen, slides in tilted along its own axis;
 *  - speed lines run along it while it holds;
 *  - the title SLAMS from ~3x to 1x through an overshoot, whites out for a
 *    couple of frames on contact, and the table takes a small hit (except
 *    where the server's own fx already shook it);
 *  - the subtitle decodes in after the slam;
 *  - it leaves by a wipe, the title stretching flat on the way out;
 *  - and any click or key skips it, after a 120ms guard so the input that
 *    caused it cannot. A skipped banner frees the screen at once, so the
 *    Market and the game-over panel that wait on it come sooner.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { onFx, useGame } from '@/store/net';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { DecodeText } from '@/components/fx/DecodeText';
import { flashPeak, motionPrefs, SLAM_EXIT } from '@/components/fx/arcade';
import { shake } from '@/lib/visuals';
import { EASE_OUT, EASE_SNAP, T_REDUCED } from '@/styles/motion';
import '@/components/fx/arcade.css';

interface Banner {
  key: number;
  text: string;
  sub?: string;
  tone: 'neutral' | 'magic' | 'impossible' | 'win' | 'danger';
  /** Who made the impossible hand, and what it took: the name strip. */
  strip?: string;
}

const TONE_COLOR: Record<Banner['tone'], string> = {
  neutral: 'var(--text)',
  magic: 'var(--entropy)',
  impossible: 'var(--gold)',
  win: 'var(--gold-hi)',
  danger: 'var(--bad)',
};

const HOLD_MS: Record<Banner['tone'], number> = {
  neutral: 1800, magic: 2200, impossible: 3200, win: 3600, danger: 2200,
};

/**
 * How big the title starts before it slams down. The basketball callouts run
 * 3-3.4x; an ante tick-over is routine and gets the smallest hit, and a
 * neutral notice does not slam at all.
 */
export const SLAM_FROM: Record<Banner['tone'], number> = {
  neutral: 1, magic: 2.2, impossible: 3, win: 2.6, danger: 2.4,
};

/**
 * The hit the table takes as the title lands, in vfx px / ms. Zero for an
 * impossible-tone banner: the server already shakes for both of those (the
 * hand and the omen) and a second shake on top reads as a stutter.
 */
export const SLAM_SHAKE: Record<Banner['tone'], [number, number]> = {
  neutral: [0, 0], magic: [6, 180], impossible: [0, 0], win: [10, 240], danger: [8, 200],
};

/** The click that raised a banner must not also be the one that skips it. */
export const SKIP_GUARD_MS = 120;
/** The exit (wipe + squash): what a skipped banner still holds the screen for. */
const EXIT_MS = 260;
/** Tilt of the impossible band, in degrees (the basketball cut-ins run -12). */
const TILT_DEG = -6;

let seq = 0;

/**
 * When the screen is next free of announcements.
 *
 * The end-of-run banner and the game-over panel are both triggered by the
 * same phase change, so they used to share the screen: "KESTREL WINS" drawn
 * straight through the middle of the leaderboard it was announcing. They are
 * a sequence, not a layer stack — the banner is the moment, the panel is the
 * thing you read afterwards — and this is how the panel knows to wait.
 */
let bannerUntil = 0;

/** Milliseconds until the screen is clear, 0 if it already is. */
export function bannerBusyMs(): number {
  return Math.max(0, bannerUntil - Date.now());
}

/*
 * The same fact, as something React can subscribe to.
 *
 * At an ante break four layers used to share the screen at once: the last
 * showdown, the new omen's banner, the Market, and the Market's first-run
 * hint on top of all three. The omen is the high point of a run and it was
 * the thing buried. The server already staggers the beats, but its market
 * opens 2.4s after the omen while the omen banner holds for 3.5s — so the
 * client has to be the one that waits. Anything that must not cover a banner
 * reads `useBannerIdle()` and holds itself back until it flips.
 */
let busy = false;
let idleTimer: number | undefined;
const listeners = new Set<() => void>();

function setBusy(next: boolean): void {
  if (busy === next) return;
  busy = next;
  for (const l of listeners) l();
}

function markBusyUntil(until: number): void {
  bannerUntil = until;
  setBusy(true);
  window.clearTimeout(idleTimer);
  const settle = (): void => {
    const left = bannerUntil - Date.now();
    if (left > 0) { idleTimer = window.setTimeout(settle, left); return; }
    setBusy(false);
  };
  idleTimer = window.setTimeout(settle, Math.max(0, until - Date.now()));
}

const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** True while no full-screen announcement is on screen or fading out. */
export function useBannerIdle(): boolean {
  return !useSyncExternalStore(subscribe, () => busy, () => false);
}

export default function BannerLayer() {
  const [banner, setBanner] = useState<Banner | null>(null);
  // This layer owns the entire viewport: the largest single piece of motion
  // in the app, so it is also the one reduced motion calms the most.
  const reduced = useReducedMotionPref();

  useEffect(() => {
    // The `win` for an impossible hand arrives in the same fx batch, just
    // ahead of its banner, and carries what the banner does not: who.
    let lastWin: { playerId: string; amount: number; at: number } | null = null;
    return onFx((e) => {
      if (e.t === 'win' && e.impossible) {
        lastWin = { playerId: e.playerId, amount: e.amount, at: Date.now() };
        return;
      }
      if (e.t !== 'banner') return;
      const tone = e.tone ?? 'neutral';
      let strip: string | undefined;
      const won = lastWin;
      if (tone === 'impossible' && won && Date.now() - won.at < 500) {
        const who = useGame.getState().view?.players.find((p) => p.id === won.playerId);
        if (who) strip = `${who.isYou ? 'You' : who.name}  ·  +${won.amount.toLocaleString()}`;
      }
      lastWin = null;
      // +EXIT_MS covers the exit below.
      markBusyUntil(Date.now() + HOLD_MS[tone] + EXIT_MS);
      // Mounted two frames late, on purpose. An impossible hand fires its
      // whole screen at once — the biggest particle preset, confetti, the
      // chromatic split over the app root — and the frame that paints all
      // that ran 200-600ms in the off-screen captures (test/anim-frames.mjs),
      // on main as well as here. A slam that starts inside that frame has
      // finished by the time the next one is drawn: the band and the title
      // simply appeared. Two rAFs put the mount after the heavy frame has
      // painted, so the 180ms slam is actually seen; normally it costs 33ms.
      const banner: Banner = { key: ++seq, text: e.text, sub: e.sub, tone, strip };
      const raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (fn: FrameRequestCallback) => window.setTimeout(() => fn(Date.now()), 16);
      raf(() => raf(() => setBanner(banner)));
    });
  }, []);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), HOLD_MS[banner.tone]);
    return () => window.clearTimeout(id);
  }, [banner]);

  // Any click or key skips it. Listening on window in the capture phase, and
  // never consuming the event: the click that skips a banner still lands on
  // whatever it was aimed at, so skipping costs the player nothing.
  const skip = useCallback(() => {
    setBanner(null);
    markBusyUntil(Date.now() + EXIT_MS);
  }, []);
  useEffect(() => {
    if (!banner) return;
    const shownAt = Date.now();
    const onInput = (ev: Event): void => {
      if (Date.now() - shownAt < SKIP_GUARD_MS) return;
      if (ev instanceof KeyboardEvent && (ev.repeat || MODIFIERS.has(ev.key))) return;
      skip();
    };
    window.addEventListener('pointerdown', onInput, true);
    window.addEventListener('keydown', onInput, true);
    return () => {
      window.removeEventListener('pointerdown', onInput, true);
      window.removeEventListener('keydown', onInput, true);
    };
  }, [banner, skip]);

  // The hit, timed to the title landing rather than to the banner arriving.
  useEffect(() => {
    if (!banner || reduced) return;
    const [px, ms] = SLAM_SHAKE[banner.tone];
    if (!px) return;
    const id = window.setTimeout(() => shake(px, ms), 140);
    return () => window.clearTimeout(id);
  }, [banner, reduced]);

  return (
    <AnimatePresence>
      {banner ? <BannerView key={banner.key} banner={banner} reduced={reduced} /> : null}
    </AnimatePresence>
  );
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta']);

function BannerView({ banner, reduced }: { banner: Banner; reduced: boolean }) {
  const tilted = banner.tone === 'impossible';
  const color = TONE_COLOR[banner.tone];
  const from = SLAM_FROM[banner.tone];
  const slams = !reduced && from > 1;
  const peak = useMemo(() => flashPeak(motionPrefs()), []);

  // Band. Tilted bands slide in along their own axis (the basketball score
  // cut-in); level ones open from a sliver (its announcements). Both leave
  // by a wipe. `rotate` is a CSS longhand on the element (arcade.css), which
  // composes with the transform framer writes instead of being discarded.
  const band = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: T_REDUCED, ease: EASE_OUT } }
    : tilted
      ? {
        initial: { transform: 'translateX(-115%)', clipPath: 'inset(0% 0% 0% 0%)' },
        animate: { transform: 'translateX(0%)', clipPath: 'inset(0% 0% 0% 0%)' },
        exit: { clipPath: 'inset(0% 0% 0% 100%)', transition: { duration: 0.24, ease: EASE_OUT } },
        transition: { duration: 0.26, ease: EASE_SNAP },
      }
      : {
        // 0.04 rather than 0: a band opening should start as a sliver of
        // the thing arriving, not as literally nothing.
        initial: { transform: 'scaleY(0.04)', clipPath: 'inset(0% 0% 0% 0%)' },
        animate: { transform: 'scaleY(1)', clipPath: 'inset(0% 0% 0% 0%)' },
        exit: { clipPath: 'inset(0% 0% 0% 100%)', transition: { duration: 0.24, ease: EASE_OUT } },
        transition: { duration: 0.18, ease: EASE_SNAP },
      };

  const tilt = tilted ? -2 : 0;
  const title = !slams
    ? {
      initial: reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(26px)' },
      animate: { opacity: 1, transform: 'translateY(0px)' },
      exit: { opacity: 0 },
      transition: reduced ? { duration: T_REDUCED, ease: EASE_OUT } : { duration: 0.5, ease: EASE_OUT, delay: 0.08 },
    }
    : {
      initial: { opacity: 0, transform: `scale(${from}) rotate(${tilt}deg) skewX(-6deg)`, filter: `brightness(${peak})` },
      animate: {
        opacity: 1,
        transform: `scale(1) rotate(${tilt}deg) skewX(-6deg)`,
        filter: [`brightness(${peak})`, `brightness(${peak})`, 'brightness(1)'],
      },
      // Out stretched wide and flat, the way the basketball callouts leave.
      exit: {
        opacity: 0,
        transform: `scale(${SLAM_EXIT.x}, ${SLAM_EXIT.y}) rotate(${tilt}deg) skewX(-6deg)`,
        transition: { duration: 0.2, ease: EASE_OUT },
      },
      transition: {
        transform: { duration: 0.18, ease: EASE_SNAP, delay: 0.06 },
        opacity: { duration: 0.05, delay: 0.06 },
        filter: { duration: 0.26, times: [0, 0.4, 1], ease: 'linear', delay: 0.06 },
      },
    };

  return (
    <motion.div
      className="hx-banner"
      data-tone={banner.tone}
      style={{ ['--banner-color' as string]: color, ['--banner-tilt' as string]: `${tilted ? TILT_DEG : 0}deg` }}
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      // Holds while the children run their own exits, then goes.
      exit={{ opacity: 0, transition: { duration: 0.1, delay: (EXIT_MS - 100) / 1000 } }}
      role="status"
      aria-live="assertive"
    >
      <motion.div className="hx-banner__band" {...band}>
        <span className="hx-banner__lines" aria-hidden />
      </motion.div>
      <div className="hx-banner__words">
        {/* No `letterSpacing` tween. It is a text-layout property: every
            frame re-shaped the run, re-measured the <h1> and re-laid-out the
            width-capped wrapper — so a long, server-authored title could
            re-wrap between lines mid-animation. Transform, opacity and a
            filter say the same thing on the compositor. */}
        <motion.h1 className="hx-banner__title" {...title}>
          {banner.text}
        </motion.h1>
        {banner.sub ? (
          <motion.p
            className="hx-banner__sub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            // Its own exit timing: inheriting the entrance's 0.22s delay left
            // the line hanging in mid-air after the band had wiped away.
            exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_OUT } }}
            transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : { duration: 0.12, ease: EASE_OUT, delay: 0.22 }}
          >
            {reduced ? banner.sub : <DecodeText text={banner.sub} lead={260} step={22} />}
          </motion.p>
        ) : null}
      </div>
      {banner.strip ? (
        <motion.div
          className="hx-banner__strip"
          initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateX(60vw)' }}
          animate={{ opacity: 1, transform: 'translateX(0vw)' }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateX(-60vw)', transition: { duration: 0.2, ease: EASE_OUT } }}
          transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : { duration: 0.22, ease: EASE_OUT, delay: 0.3 }}
        >
          {banner.strip}
        </motion.div>
      ) : null}
    </motion.div>
  );
}
