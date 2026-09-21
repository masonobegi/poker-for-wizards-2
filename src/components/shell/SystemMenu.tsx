/**
 * The Escape-key system menu. This is a *menu*, not a pause: HEXHOLD is
 * real-time multiplayer and nothing about opening it stops the table, the
 * clock, or the other players — it only stops blocking pointer input to the
 * felt underneath while it's open.
 *
 * Self-contained: mount it once as a sibling of the scene tree (it renders
 * nothing until Escape is pressed while `screen === 'game'`) and it handles
 * the rest itself — see src/App.tsx for where this project mounts its peers
 * (ConnectionBadge, Toasts, BannerLayer).
 */
import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/store/net';
import { Button } from '@/components/ui/kit';
import SettingsPanel from '@/components/SettingsPanel';
import { useFocusTrap } from './useFocusTrap';
import { useMotionReduced, motionDuration } from './reducedMotion';
import { getHexholdApi } from './desktop';
import './shell.css';

type MenuView = 'menu' | 'settings';

/** Something else that Escape (or the click it's standing in for) already
 * belongs to — a kit.tsx Modal, the sigil target prompt, or an in-progress
 * card/player target pick — is already on screen. Let that consume this
 * Escape instead of stacking the system menu on top of a half-finished cast. */
function anotherOverlayIsOpen(): boolean {
  return !!document.querySelector('.scrim')
    || !!document.querySelector('.prompt')
    || !!document.querySelector('.tbl-targethint');
}

function isTypingTarget(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

export default function SystemMenu() {
  const screen = useGame((s) => s.screen);
  const leave = useGame((s) => s.leave);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<MenuView>('menu');
  const headingId = useId();
  const subId = useId();
  const reduceMotion = useMotionReduced();
  const trapRef = useFocusTrap<HTMLDivElement>(open);

  // Leaving the game scene (e.g. the table itself sent us back to the menu)
  // closes any menu we had open over it.
  useEffect(() => {
    if (screen !== 'game') setOpen(false);
  }, [screen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      if (open) {
        e.preventDefault();
        e.stopPropagation();
        if (view === 'settings') setView('menu');
        else setOpen(false);
        return;
      }

      if (screen !== 'game') return;
      if (isTypingTarget(e.target)) { e.target.blur(); return; }
      if (anotherOverlayIsOpen()) return;

      e.preventDefault();
      setView('menu');
      setOpen(true);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, view, screen]);

  const desktop = !!getHexholdApi()?.desktop;

  const close = () => setOpen(false);

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="hh-menu-overlay"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionDuration(0.18, reduceMotion) }}
          onPointerDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <motion.div
            ref={trapRef}
            className="hh-menu-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            aria-describedby={view === 'menu' ? subId : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: motionDuration(0.22, reduceMotion) }}
          >
            {view === 'menu' ? (
              <>
                <header className="hh-menu-head">
                  <h2 id={headingId} className="hh-menu-title display">Menu</h2>
                  <p id={subId} className="hh-menu-sub">
                    The table keeps running — this doesn&apos;t pause the hand. Your
                    seat is still yours; you&apos;ll just miss your turn if it comes
                    up while you&apos;re in here.
                  </p>
                </header>

                <div className="hh-menu-actions">
                  <Button block tone="primary" onClick={close} sound="ui_confirm">
                    Resume
                  </Button>
                  <Button block tone="ghost" onClick={() => setView('settings')}>
                    Settings
                  </Button>
                  <Button
                    block
                    tone="ghost"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('hexhold:how-to-play'));
                      close();
                    }}
                  >
                    How to Play
                  </Button>
                  <Button
                    block
                    tone="danger"
                    onClick={() => { close(); leave(); }}
                  >
                    Leave Table
                  </Button>
                  {desktop ? (
                    <Button block tone="danger" onClick={() => window.close()}>
                      Quit
                    </Button>
                  ) : null}
                </div>
              </>
            ) : (
              <SettingsPanel onClose={() => setView('menu')} />
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
