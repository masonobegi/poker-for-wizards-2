import { Suspense, lazy, useEffect, useRef } from 'react';
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

  useEffect(() => {
    connect();
    const teardown = installFxBridge();
    return teardown;
  }, [connect]);

  useEffect(() => {
    fxRoot(shellRef.current);
    return () => fxRoot(null);
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

      <Suspense fallback={null}>
        <VfxLayer />
      </Suspense>
    </div>
  );
}
