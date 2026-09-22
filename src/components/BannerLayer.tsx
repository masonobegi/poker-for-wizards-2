/**
 * Full-screen announcements: ante breaks, impossible hands, the end of a run.
 * Driven straight off the `banner` fx event so the server decides what deserves
 * the whole screen.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { onFx } from '@/store/net';

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

export default function BannerLayer() {
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => onFx((e) => {
    if (e.t !== 'banner') return;
    setBanner({ key: ++seq, text: e.text, sub: e.sub, tone: e.tone ?? 'neutral' });
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
          transition={{ duration: 0.3 }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 'var(--z-overlay)' as unknown as number,
            display: 'grid',
            placeItems: 'center',
            pointerEvents: 'none',
          }}
          role="status"
          aria-live="assertive"
        >
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            exit={{ scaleX: 1.2, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: 'absolute',
              inset: '0 0 auto',
              top: '50%',
              height: 170,
              transform: 'translateY(-50%)',
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
            <motion.h1
              initial={{ y: 26, opacity: 0, letterSpacing: '0.5em' }}
              animate={{ y: 0, opacity: 1, letterSpacing: '0.16em' }}
              exit={{ y: -14, opacity: 0 }}
              transition={{ duration: 0.62, ease: [0.16, 1, 0.3, 1], delay: 0.08 }}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(30px, 7vw, var(--fs-3xl))',
                fontWeight: 900,
                color: TONE_COLOR[banner.tone],
                textShadow: `0 0 40px ${TONE_COLOR[banner.tone]}, 0 6px 30px rgba(0,0,0,.8)`,
                margin: 0,
              }}
            >
              {banner.text}
            </motion.h1>
            {banner.sub ? (
              <motion.p
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, delay: 0.24 }}
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
