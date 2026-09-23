/**
 * Whether the player is driving a real pointer rather than a touchscreen.
 *
 * Touch fires a hover on tap that sticks until the next tap somewhere else, so
 * any hover state that *moves* an element leaves it visibly displaced with no
 * way to clear it. HEXHOLD ships on a Steam Deck, which has a touchscreen, so
 * that is not a hypothetical.
 *
 * In CSS the same gate is `@media (hover: hover) and (pointer: fine)`. This is
 * the equivalent for framer-motion's `whileHover`, which fires on touch too.
 * Defaults to `true` where `matchMedia` is unavailable (jsdom, old embeds) so
 * the desktop experience is the fallback, not the degraded one.
 */
import { useEffect, useState } from 'react';

const QUERY = '(hover: hover) and (pointer: fine)';

export function useFinePointer(): boolean {
  const [fine, setFine] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const sync = (): void => setFine(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return fine;
}

export default useFinePointer;
