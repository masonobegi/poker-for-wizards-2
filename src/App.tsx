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
import IntroFlow from '@/components/onboarding/IntroFlow';

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

const sceneMotion = {
  initial: { opacity: 0, scale: 0.985 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 1.01 },
  transition: { duration: 0.42, ease: [0.16, 1, 0.3, 1] as const },
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
    const teardown = installFxBridge();
    return teardown;
  }, [connect]);

  useEffect(() => {
    fxRoot(shellRef.current);
    return () => fxRoot(null);
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
      <IntroFlow open={howTo} onClose={() => setHowTo(false)} />

      <Suspense fallback={null}>
        <VfxLayer />
      </Suspense>
    </div>
  );
}
