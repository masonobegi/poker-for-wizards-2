import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/store/net';
import { installFxBridge } from '@/lib/fxbridge';
import { fxRoot } from '@/lib/visuals';
import { setMusic, unlockAudio } from '@/lib/sound';
import Menu from '@/scenes/Menu';
import Lobby from '@/scenes/Lobby';
import GameTable from '@/scenes/GameTable';
import Toasts from '@/components/Toasts';
import BannerLayer from '@/components/BannerLayer';
import ConnectionBadge from '@/components/ConnectionBadge';
import SystemMenu from '@/components/shell/SystemMenu';
import GamepadLayer from '@/components/shell/GamepadLayer';
import IntroFlow from '@/components/onboarding/IntroFlow';
import RunRecorder from '@/components/profile/RunRecorder';
import AchievementToast from '@/components/AchievementToast';
import { installAchievementWatcher } from '@/lib/achievements';
import { installCloudSync, pullCloudSave } from '@/lib/cloud';
import { ENTER } from '@/styles/motion';

/**
 * The particle layer is decoration — load it after the first paint, and if the
 * chunk fails to arrive, render nothing rather than taking the table down.
 */
const VfxLayer = lazy(async (): Promise<{ default: React.ComponentType }> => {
  try {
    const m = await import('@/vfx/VfxLayer');
    return { default: m.VfxLayer as React.ComponentType };
  } catch {
    return { default: () => null };
  }
});

/* Scene changes are keyboard- and pad-initiated (Leave Table, Take a Seat,
   Practice vs Bots), so this is latency on a control path, not decoration.
   `mode="wait"` used to serialise exit *then* enter — 420ms + 420ms of
   non-interactive screen per change, paid twice on the menu -> lobby -> table
   route. A short crossfade covers the swap without gating input, and the
   scale goes because a scale on a full-screen crossfade reads as drift. */
const sceneMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, pointerEvents: 'auto' as const },
  // Without `mode="wait"` the outgoing scene stays mounted for the length of
  // the crossfade. It must not be clickable while it fades, or a click aimed
  // at the incoming screen can land on the dying one.
  exit: { opacity: 0, pointerEvents: 'none' as const },
  transition: ENTER,
};

export default function App() {
  const screen = useGame((s) => s.screen);
  const connect = useGame((s) => s.connect);
  const shellRef = useRef<HTMLDivElement>(null);
  const [howTo, setHowTo] = useState(false);

  // The system menu can ask for the intro from inside a game, where the menu
  // scene that normally owns it is not mounted.
  useEffect(() => {
    const open = () => setHowTo(true);
    window.addEventListener('hexhold:how-to-play', open);
    return () => window.removeEventListener('hexhold:how-to-play', open);
  }, []);

  useEffect(() => {
    connect();
    const offFx = installFxBridge();
    const offAch = installAchievementWatcher(() => useGame.getState().view);
    const offCloud = installCloudSync();
    // Pull before anything reads a save, so a second machine starts correct.
    void pullCloudSave();
    return () => { offFx(); offAch(); offCloud(); };
  }, [connect]);

  useEffect(() => {
    fxRoot(shellRef.current);
    return () => fxRoot(null);
  }, []);

  // The game is a fixed viewport, but anything that calls scrollIntoView — a
  // focused button near an edge, a browser autoscroll, an automation tool —
  // can still shove the whole table off the top of the screen, and nothing
  // ever scrolls it back. Snap it home whenever that happens.
  useEffect(() => {
    const targets: Array<Element | null> = [
      document.documentElement, document.body, document.getElementById('root'),
    ];
    const snap = () => {
      for (const el of targets) {
        if (!el) continue;
        if (el.scrollTop !== 0) el.scrollTop = 0;
        if (el.scrollLeft !== 0) el.scrollLeft = 0;
      }
      const shell = shellRef.current;
      if (shell) {
        if (shell.scrollTop !== 0) shell.scrollTop = 0;
        if (shell.scrollLeft !== 0) shell.scrollLeft = 0;
      }
    };
    window.addEventListener('scroll', snap, true);
    return () => window.removeEventListener('scroll', snap, true);
  }, []);

  // F11 toggles fullscreen: through the desktop shell when there is one, and
  // through the Fullscreen API in a browser.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'F11') return;
      e.preventDefault();
      const shell = (window as unknown as {
        hexhold?: { toggleFullscreen?: (on?: boolean) => Promise<boolean> };
      }).hexhold;
      if (shell?.toggleFullscreen) { void shell.toggleFullscreen(); return; }
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      else void document.documentElement.requestFullscreen().catch(() => {});
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Browsers will not start audio until the player touches something.
  useEffect(() => {
    const go = () => {
      unlockAudio();
      setMusic(screen === 'game' ? 'table' : 'menu');
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
  }, [screen]);

  return (
    <div className={`app ${screen === 'game' ? 'is-table' : ''}`} ref={shellRef}>
      <AnimatePresence>
        <motion.div key={screen} className="scene" {...sceneMotion}>
          {screen === 'menu' ? <Menu /> : null}
          {screen === 'lobby' ? <Lobby /> : null}
          {screen === 'game' ? <GameTable /> : null}
        </motion.div>
      </AnimatePresence>

      <BannerLayer />
      <Toasts />
      <ConnectionBadge />
      <SystemMenu />
      <GamepadLayer />
      <RunRecorder />
      <AchievementToast />
      <IntroFlow open={howTo} onClose={() => setHowTo(false)} />

      <Suspense fallback={null}>
        <VfxLayer />
      </Suspense>
    </div>
  );
}
