import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/store/net';

/** Only visible when something is wrong — silence is the healthy state. */
export default function ConnectionBadge() {
  const connected = useGame((s) => s.connected);

  return (
    <AnimatePresence>
      {!connected ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          style={{
            position: 'fixed',
            bottom: 14,
            left: 14,
            zIndex: 'var(--z-toast)' as unknown as number,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            borderRadius: 'var(--r-pill)',
            background: 'rgba(8,10,20,.92)',
            border: '1px solid rgba(244,87,111,.45)',
            color: 'var(--bad)',
            fontSize: 'var(--fs-xs)',
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            backdropFilter: 'blur(8px)',
          }}
          role="status"
        >
          <span className="pulse-dot off" />
          Reconnecting
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
