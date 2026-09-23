import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/store/net';
import { ENTER_PANEL } from '@/styles/motion';

export default function Toasts() {
  const toasts = useGame((s) => s.toasts);

  return (
    <div className="toasts" aria-live="polite" aria-atomic="false">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            className={`toast toast-${t.tone}`}
            initial={{ opacity: 0, y: -16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={ENTER_PANEL}
            layout
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
