/**
 * Full-screen announcements: ante breaks, impossible hands, the end of a run.
 * Driven straight off the `banner` fx event so the server decides what deserves
 * the whole screen.
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { onFx } from '@/store/net';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { EASE_OUT, T_REDUCED } from '@/styles/motion';

interface Banner {
  key: number;
  text: string;
  sub?: string;
  tone: 'neutral' | 'magic' | 'impossible' | 'win' | 'danger';
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
  // This layer owns the entire viewport: a full-width horizontal wipe plus a
  // 26px lift on display-size text is the largest single piece of motion in
  // the app.
  const reduced = useReducedMotionPref();

  useEffect(() => onFx((e) => {
    if (e.t !== 'banner') return;
    const tone = e.tone ?? 'neutral';
    // +300 covers the exit fade below.
    markBusyUntil(Date.now() + HOLD_MS[tone] + 300);
    setBanner({ key: ++seq, text: e.text, sub: e.sub, tone });
  }), []);

  useEffect(() => {
    if (!banner) return;
    const id = window.setTimeout(() => setBanner(null), HOLD_MS[banner.tone]);
    return () => window.clearTimeout(id);
  }, [banner]);

  return (
    <AnimatePresence>
      {banner ? (
        <motion.div
          key={banner.key}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--z-overlay)' as unknown as number,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
            // The glow bar's exit scales past 1, so it is briefly wider than
            // the viewport. This container is already exactly viewport-sized,
            // so clipping here is free and invisible.
            overflow: 'hidden',
          }}
          role="status"
          aria-live="assertive"
        >
          <motion.div
            // 0.04 rather than 0: a wipe should start as a sliver of the
            // thing arriving, not as literally nothing. Under reduced motion
            // the bar fades in at full width instead of sweeping.
            initial={reduced ? { scaleX: 1, opacity: 0 } : { scaleX: 0.04, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { scaleX: 1.2, opacity: 0 }}
            transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : { duration: 0.5, ease: EASE_OUT }}
            style={{
              position: 'absolute',
              inset: '0 0 auto',
              top: '50%',
              height: 170,
              // `translate`, not `transform`: this element animates scaleX, and
              // framer-motion owns `transform` outright — a centring transform
              // here is silently discarded. The longhand composes instead.
              translate: '0 -50%',
              background:
                'linear-gradient(90deg, transparent, rgba(5,6,12,.88) 18%, rgba(5,6,12,.92) 82%, transparent)',
              borderTop: '1px solid rgba(240,196,101,.2)',
              borderBottom: '1px solid rgba(240,196,101,.2)',
            }}
          />
          <div
            style={{
              position: 'relative',
              textAlign: 'center',
              padding: '0 24px',
              // Unlike everything else in this layer, the text here is
              // server-authored and unbounded in length (an omen's name, a
              // relic's text) — without a width cap it renders as one
              // unbroken line and can run off both edges of the viewport at
              // narrower resolutions.
              width: 'min(94vw, 1100px)',
              boxSizing: 'border-box',
              overflowWrap: 'break-word',
            }}
          >
            {/* No `letterSpacing` tween. It is a text-layout property: every
                frame re-shaped the run, re-measured the <h1> and re-laid-out
                the width-capped wrapper above — so a long, server-authored
                title could re-wrap between lines mid-animation, at display
                size, full-screen, on exactly the beats where the particle
                system is busiest. Opacity and a transform say the same thing
                on the compositor. */}
            <motion.h1
              initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(26px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-14px)' }}
              transition={reduced
                ? { duration: T_REDUCED, ease: EASE_OUT }
                : { duration: 0.62, ease: EASE_OUT, delay: 0.08 }}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(30px, 7vw, var(--fs-3xl))',
                fontWeight: 900,
                letterSpacing: '0.16em',
                color: TONE_COLOR[banner.tone],
                textShadow: `0 0 40px ${TONE_COLOR[banner.tone]}, 0 6px 30px rgba(0,0,0,.8)`,
                margin: 0,
              }}
            >
              {banner.text}
            </motion.h1>
            {banner.sub ? (
              <motion.p
                initial={reduced ? { opacity: 0 } : { opacity: 0, transform: 'translateY(14px)' }}
                animate={{ opacity: 1, transform: 'translateY(0px)' }}
                exit={{ opacity: 0 }}
                transition={reduced
                  ? { duration: T_REDUCED, ease: EASE_OUT }
                  : { duration: 0.5, ease: EASE_OUT, delay: 0.24 }}
                style={{
                  marginTop: 12,
                  fontSize: 'var(--fs-sm)',
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                }}
              >
                {banner.sub}
              </motion.p>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
