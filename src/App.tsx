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

/**
 * The particle layer is decoration — load it after the first paint, and if the
 * chunk fails to arrive, render nothing rather than taking the table down.
 */
/**
 * The shader backdrop is decoration too, and heavier than the particle layer,
 * so it loads the same way: after first paint, and a failed chunk renders
 * nothing while the CSS gradient underneath carries on being the background.
 */
const Backdrop = lazy(async (): Promise<{ default: React.ComponentType }> => {
  try {
    const m = await import('@/vfx/Backdrop');
    return { default: m.default as React.ComponentType };
  } catch {
    return { default: () => null };
  }
});

const VfxLayer = lazy(async (): Promise<{ default: React.ComponentType }> => {
  try {
    const m = await import('@/vfx/VfxLayer');
    return { default: m.VfxLayer as React.ComponentType };
  } catch {
    return { default: () => null };
  }
});

/**
 * Moving between the menu, the lobby and the table.
 *
 * A straight crossfade is what a web page does when it changes route, and it
 * was reading as exactly that. What this game is doing instead is walking you
 * to a different table in the same room, so the outgoing scene falls *away*
 * from the viewer and the incoming one comes up to meet you — one continuous
 * move through depth rather than two images dissolving into each other.
 *
 * `mode="wait"` means these never overlap, so the asymmetry is the whole
 * effect: you see something leave, then something arrive.
 */
const sceneMotion = {
  initial: { opacity: 0, scale: 1.035, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.955, y: -8 },
  transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] as const },
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

  // The backdrop sits warmer and closer under the table than under the menu.
  // Imported lazily for the same reason the layer itself is: it must never be
  // on the path that renders the game.
  useEffect(() => {
    void import('@/vfx/Backdrop')
      .then((m) => m.backdropScene(screen === 'game'))
      .catch(() => { /* no backdrop; nothing to tell it */ });
  }, [screen]);

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
    <div className="app" ref={shellRef}>
      <AnimatePresence mode="wait">
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
        <Backdrop />
        <VfxLayer />
      </Suspense>
    </div>
  );
}
