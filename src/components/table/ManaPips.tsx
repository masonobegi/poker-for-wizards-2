import { memo } from 'react';
import { motion } from 'framer-motion';
import { EASE_OUT } from '@/styles/motion';

/**
 * Mana is public information — an opponent sitting on unspent mana is a threat
 * you are supposed to be able to read across the table, so it is always shown.
 */
function ManaPipsBase({ value, max, compact }: {
  value: number;
  max: number;
  compact?: boolean;
}) {
  const shown = Math.min(max, compact ? 10 : 14);
  const overflow = max - shown;

  return (
    <span
      className={`mana ${compact ? 'is-compact' : ''}`}
      title={`${value} / ${max} mana`}
      aria-label={`${value} of ${max} mana`}
    >
      {Array.from({ length: shown }, (_, i) => (
        <motion.i
          key={i}
          className={`mana-pip ${i < value ? 'is-on' : ''}`}
          animate={i < value ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.3, ease: EASE_OUT, delay: i * 0.02 }}
        />
      ))}
      {overflow > 0 ? <span className="mana-more mono">+{overflow}</span> : null}
      {!compact ? <span className="mana-num mono">{value}</span> : null}
    </span>
  );
}

export default memo(ManaPipsBase);
