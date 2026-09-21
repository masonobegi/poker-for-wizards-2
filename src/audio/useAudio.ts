/**
 * HEXHOLD — React bindings for the audio engine.
 *
 * These hooks are thin wrappers around `audio` (see `engine.ts`); none of
 * them own audio state themselves, so components can mount and unmount
 * freely without worrying about leaking players or listeners.
 */

import { useCallback, useEffect, useRef } from 'react';
import { audio } from './engine';
import type { SfxName } from './sfx';

// ---------------------------------------------------------------------------
// useAudioUnlock
// ---------------------------------------------------------------------------

/**
 * Wires a one-time `pointerdown`/`keydown` listener pair on `window` that
 * unlocks the audio context on the player's first interaction with the
 * page — the standard workaround for browser autoplay policies. Mount this
 * once, near the root of the app. Safe to call from multiple components;
 * each just adds (and cleanly removes) its own pair of listeners.
 */
export function useAudioUnlock(): void {
  useEffect(() => {
    const handleUnlock = (): void => {
      audio.unlock();
    };
    window.addEventListener('pointerdown', handleUnlock, { once: true });
    window.addEventListener('keydown', handleUnlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
    };
  }, []);
}

// ---------------------------------------------------------------------------
// useSfx
// ---------------------------------------------------------------------------

interface PlayOptions {
  vol?: number;
  pitch?: number;
  pan?: number;
  delay?: number;
}

/** Returns a stable `play(name, opts?)` function for triggering one-shot sfx. */
export function useSfx(): (name: SfxName, opts?: PlayOptions) => void {
  return useCallback((name: SfxName, opts?: PlayOptions) => {
    audio.play(name, opts);
  }, []);
}

// ---------------------------------------------------------------------------
// useHoverSound
// ---------------------------------------------------------------------------

export interface HoverSoundOptions {
  /** Sound played on pointer enter. Defaults to `ui_hover`; pass `null` to disable. */
  hover?: SfxName | null;
  /** Sound played on pointer down. Defaults to `ui_click`; pass `null` to disable. */
  press?: SfxName | null;
  /** Pitch multiplier applied to both sounds. */
  pitch?: number;
}

export interface HoverSoundProps {
  onPointerEnter: () => void;
  onPointerDown: () => void;
}

/**
 * Returns `{ onPointerEnter, onPointerDown }` to spread onto a button or any
 * other interactive element for standard hover/press feedback. The handlers
 * are stable across re-renders; per-call overrides (e.g. a quieter hover for
 * a dense list) are read from a ref so they never force a new function
 * identity.
 */
export function useHoverSound(opts: HoverSoundOptions = {}): HoverSoundProps {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const onPointerEnter = useCallback(() => {
    const current = optsRef.current;
    const name = current.hover === undefined ? 'ui_hover' : current.hover;
    if (name) audio.play(name, { pitch: current.pitch });
  }, []);

  const onPointerDown = useCallback(() => {
    const current = optsRef.current;
    const name = current.press === undefined ? 'ui_click' : current.press;
    if (name) audio.play(name, { pitch: current.pitch });
  }, []);

  return { onPointerEnter, onPointerDown };
}
