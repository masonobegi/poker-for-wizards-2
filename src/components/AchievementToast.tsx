/**
 * The unlock banner.
 *
 * Deliberately not a Steam-style corner popup: this game already owns the
 * bottom of the screen, and an achievement is worth a beat of its own without
 * covering the cards during a hand.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ACHIEVEMENT_BY_ID, type AchievementId } from '@shared/achievements';
import { onAchievement } from '@/lib/achievements';
import { playSfx } from '@/lib/sound';
import './achievements.css';

interface Shown { key: number; id: AchievementId }
let seq = 0;

export default function AchievementToast() {
  const [queue, setQueue] = useState<Shown[]>([]);

  useEffect(() => onAchievement((id) => {
    setQueue((q) => [...q, { key: ++seq, id }]);
    playSfx('win_normal', { vol: 0.7 });
  }), []);

  useEffect(() => {
    if (queue.length === 0) return;
    const t = window.setTimeout(() => setQueue((q) => q.slice(1)), 4200);
    return () => window.clearTimeout(t);
  }, [queue]);

  const current = queue[0];
  const def = current ? ACHIEVEMENT_BY_ID[current.id] : null;

  return (
    <AnimatePresence>
      {def ? (
        <motion.div
          key={current.key}
          className="ach"
          role="status"
          initial={{ opacity: 0, y: -28, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 340, damping: 26 }}
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
