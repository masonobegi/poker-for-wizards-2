import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/store/net';
import { Button } from '@/components/ui/kit';
import { useFocusTrap } from './shell/useFocusTrap';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { EASE_OUT, ENTER, T_REDUCED } from '@/styles/motion';
import './shell/shell.css';

/** A blip — a dropped packet, a laptop waking up — should not flash anything.
 * Only a disconnect that outlasts this gets a pill at all. */
const PILL_AFTER_MS = 1200;
/** A disconnect that outlasts this gets the full "we're on it" overlay. */
const OVERLAY_AFTER_MS = 6000;

/** Only visible when something is wrong — silence is the healthy state. */
export default function ConnectionBadge() {
  const connected = useGame((s) => s.connected);
  const screen = useGame((s) => s.screen);
  const socket = useGame((s) => s.socket);
  const leave = useGame((s) => s.leave);

  const [showPill, setShowPill] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const reduceMotion = useReducedMotionPref();
  const trapRef = useFocusTrap<HTMLDivElement>(showOverlay);

  useEffect(() => {
    // No seat to hold on the menu screen — the socket still auto-reconnects
    // in the background, it just isn't worth interrupting anyone over.
    if (connected || screen === 'menu') {
      setShowPill(false);
      setShowOverlay(false);
      setRetrying(false);
      return undefined;
    }

    const pillTimer = window.setTimeout(() => setShowPill(true), PILL_AFTER_MS);
    const overlayTimer = window.setTimeout(() => setShowOverlay(true), OVERLAY_AFTER_MS);
    return () => {
      window.clearTimeout(pillTimer);
      window.clearTimeout(overlayTimer);
    };
  }, [connected, screen]);

  const retry = () => {
    setRetrying(true);
    try { socket?.connect(); } catch { /* the socket will keep retrying on its own */ }
    window.setTimeout(() => setRetrying(false), 1500);
  };

  return (
    <>
      <AnimatePresence>
        {showPill && !showOverlay ? (
          <motion.div
            className="hh-conn-pill"
            role="status"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={reduceMotion ? { duration: T_REDUCED, ease: EASE_OUT } : ENTER}
          >
            <span className="pulse-dot off" aria-hidden />
            Reconnecting
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {showOverlay ? (
          <motion.div
            className="hh-conn-overlay"
            role="presentation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={reduceMotion ? { duration: T_REDUCED, ease: EASE_OUT } : ENTER}
          >
            <motion.div
              ref={trapRef}
              className="hh-conn-panel"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="hh-conn-title"
              aria-describedby="hh-conn-body"
              tabIndex={-1}
              initial={{ opacity: 0, y: 16, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={reduceMotion ? { duration: T_REDUCED, ease: EASE_OUT } : ENTER}
            >
              <h2 id="hh-conn-title" className="hh-conn-title display">
                <span className="pulse-dot off" aria-hidden />
                Connection Lost
              </h2>
              <p id="hh-conn-body" className="hh-conn-body">
                HEXHOLD lost its connection and is trying to reconnect you
                automatically. Your seat is held — you won&apos;t be replaced
                while this is showing.
              </p>
              <div className="hh-conn-actions">
                <Button block tone="primary" loading={retrying} onClick={retry}>
                  Retry Now
                </Button>
                <Button block tone="danger" onClick={leave}>
                  Leave Table
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
