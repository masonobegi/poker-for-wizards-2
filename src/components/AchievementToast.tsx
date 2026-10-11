/**
 * The unlock banner.
 *
 * Deliberately not a Steam-style corner popup: this game already owns the
 * bottom of the screen, and an achievement is worth a beat of its own without
 * covering the cards during a hand.
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ACHIEVEMENT_BY_ID, type AchievementId } from '@shared/achievements';
import { onAchievement } from '@/lib/achievements';
import { playSfx } from '@/lib/sound';
import './achievements.css';
import { EASE_OUT, SPRING_PLAYFUL, T_REDUCED } from '@/styles/motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { useBannerIdle } from '@/components/BannerLayer';

interface Shown { key: number; id: AchievementId }
let seq = 0;

export default function AchievementToast() {
  const reduced = useReducedMotionPref();
  const [queue, setQueue] = useState<Shown[]>([]);
  // Held while a full-screen announcement plays, and its clock does not run
  // until it is on screen (the basketball roguelike's toasts wait out a
  // cut-in the same way). The achievement an impossible hand unlocks used to
  // drop on top of that hand's own banner, and both lost.
  const idle = useBannerIdle();

  useEffect(() => onAchievement((id) => {
    setQueue((q) => [...q, { key: ++seq, id }]);
  }), []);

  const head = queue[0]?.key;
  const chimed = useRef(0);
  useEffect(() => {
    if (head === undefined || !idle) return;
    if (chimed.current !== head) { chimed.current = head; playSfx('win_normal', { vol: 0.7 }); }
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), 4200);
    return () => window.clearTimeout(t);
  }, [head, idle]);

  const current = idle ? queue[0] : undefined;
  const def = current ? ACHIEVEMENT_BY_ID[current.id] : null;

  return (
    <AnimatePresence>
      {current && def ? (
        <motion.div
          key={current.key}
          className="ach"
          role="status"
          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.97 }}
          transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : SPRING_PLAYFUL}
        >
          <span className="ach-mark" aria-hidden>✦</span>
          <span className="ach-body">
            <span className="ach-eyebrow">Achievement unlocked</span>
            <strong className="ach-name">{def.name}</strong>
            <span className="ach-text">{def.text}</span>
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
