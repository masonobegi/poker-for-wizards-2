import { useSyncExternalStore } from 'react';
import { currentPadFamily, onPadFamilyChange, padGlyphs, type Pad } from '@/lib/gamepad';

/** The button glyphs for the pad in hand, re-rendering when it changes. */
export function usePadGlyphs(): Record<Pad, string> {
  useSyncExternalStore(onPadFamilyChange, currentPadFamily, currentPadFamily);
  return padGlyphs();
}
