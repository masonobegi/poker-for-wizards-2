import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { setDeckAnchor } from '@/lib/dealOrigin';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { OMEN_BY_ID, type ActiveOmen } from '@shared/omens';
import { MARKS, RANK_NAME, faceName, rankPlural } from '@shared/cards';
import { ENTER } from '@/styles/motion';
import type { TableView } from '@shared/types';

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

/**
 * What has been done to the deck, in public.
 *
 * A player asked to be able to click the deck and see what is in it, which is
 * a fair thing to want from a game whose whole pitch is that the deck is not
 * the deck any more. The identities of the cards left in it are the one thing
 * that must stay secret — that is the game — but everything that has been
 * done TO it was announced to the table when it happened: an omen that marks
 * five cards Wild says so in the middle of the screen, and a struck rank is
 * struck for everybody. All of this is already on screen somewhere; it has
 * never been in one place, at the object it is about.
 */
function deckRules(omens: ActiveOmen[]): Array<{ key: string; text: string }> {
  const out: Array<{ key: string; text: string }> = [];
  for (const a of omens) {
    const def = OMEN_BY_ID[a.id];
    if (!def) continue;
    const ins = def.deal?.inscribe;
    if (ins) {
      const mark = MARKS[ins.markId];
      out.push({
        key: `${a.id}:mark`,
        text: `${ins.count} card${ins.count === 1 ? '' : 's'} in here ${ins.count === 1 ? 'is' : 'are'} ${mark?.name ?? ins.markId}`
          + (mark ? ` — ${mark.blurb.toLowerCase()}` : ''),
      });
    }
    if (def.killsRank && a.rank) {
      out.push({ key: `${a.id}:rank`, text: `No ${rankPlural(a.rank)}. ${RANK_NAME[a.rank]}s are struck from every hand.` });
    }
    if (def.deal?.sealRank || def.deal?.sealRolled) {
      out.push({ key: `${a.id}:seal`, text: `${def.name}: some cards are dealt face down and stay that way until showdown.` });
    }
  }
  return out;
}

function DeckBase({ cut, view }: { cut: number; view: TableView }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionPref();
  const [open, setOpen] = useState(false);
  const rules = deckRules(view.omens);

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
    <div className={`deck ${open ? 'is-open' : ''}`} ref={ref}>
      <button
        className="deck-hit"
        aria-label={`The deck — ${view.deckCount} cards left. What is in it?`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setOpen(false)}
      />
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
      <span className="deck-label">deck · {view.deckCount}</span>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="deck-panel"
            role="dialog"
            aria-label="The deck"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={ENTER}
          >
            <strong>The deck</strong>
            <p className="deck-count">
              <b className="mono">{view.deckCount}</b> cards left to deal.
            </p>
            {view.deckTop ? (
              <p className="deck-peek">
                You can see the top card: <b>{view.deckTop.face ? faceName(view.deckTop.face) : 'not yet decided'}</b>
              </p>
            ) : null}
            {rules.length ? (
              <ul className="deck-rules">
                {rules.map((r) => <li key={r.key}>{r.text}</li>)}
              </ul>
            ) : (
              <p className="deck-plain">Nothing has been done to it yet: fifty-two cards, four suits, no duplicates.</p>
            )}
            <p className="deck-note">
              What each remaining card IS stays secret — that part is still poker.
              Cards burned off the board do not come back this hand.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default memo(DeckBase);
