import { memo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { setDeckAnchor } from '@/lib/dealOrigin';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';

/**
 * The deck, sitting on the felt where the dealer left it.
 *
 * It is here for two reasons and both of them matter more than decoration.
 *
 * The first is that cards now fly *from* somewhere (see `lib/dealOrigin`), and
 * a shared origin that has nothing at it reads as a bug — five cards
 * converging on an empty patch of cloth looks like a layout error, not a
 * deal. Put the deck there and the same motion reads as dealing.
 *
 * The second is that a poker table with no deck on it is a poker table with
 * the single most recognisable object in the game missing. Nobody would have
 * filed that as a bug, and everybody would have felt it.
 *
 * The stack is drawn as edges rather than as a pile of card backs: five
 * hairlines of decreasing light, which is what the side of a real stack
 * actually looks like from a seated player's angle, and which stays legible
 * at the ~40px it occupies.
 */

const EDGES = 5;

function DeckBase({ cut }: { cut: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = (): void => setDeckAnchor(el.getBoundingClientRect());
    publish();
    // The felt reflows on window resize and when the side rail opens; both
    // move the deck, and a stale anchor throws every card off its path.
    if (typeof ResizeObserver === 'undefined') return () => setDeckAnchor(null);
    const ro = new ResizeObserver(publish);
    ro.observe(document.documentElement);
    window.addEventListener('scroll', publish, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', publish, true);
      setDeckAnchor(null);
    };
  }, []);

  return (
    <div className="deck" ref={ref} aria-hidden>
      <div className="deck-shadow" />
      <div className="deck-stack">
        {Array.from({ length: EDGES }, (_, i) => (
          <span className="deck-edge" key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
        {/* The top card lifts a few pixels each time a street is dealt. It is
            the cheapest possible way to say "that came from here", and it is
            keyed on the street so it replays without any event plumbing. */}
        <motion.span
          className="deck-top"
          key={cut}
          initial={reduced ? false : { y: 0, rotate: 0 }}
          animate={reduced ? {} : { y: [0, -7, 0], rotate: [0, -3.5, 0] }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <span className="deck-label">deck</span>
    </div>
  );
}

export default memo(DeckBase);
