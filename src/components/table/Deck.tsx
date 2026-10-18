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
  /** How much room the panel has, and which way it has it. */
  const [room, setRoom] = useState<{ px: number; above: boolean }>({ px: 0, above: false });
  const rules = deckRules(view.omens);

  // Measured on open rather than guessed in vh: the deck sits at a fixed
  // fraction of the felt, but the felt is not the viewport, and a census of
  // nine marks is a lot taller than the empty one this was first seen with.
  useEffect(() => {
    if (!open) return;
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 24;
    const above = r.top - 24;
    setRoom(below < 240 && above > below ? { px: above, above: true } : { px: below, above: false });
  }, [open]);

  /*
   * Closing it used to be the button's own `onBlur`, which is wrong for a
   * panel you are meant to read: the ask was to "click the deck and scroll
   * through what's actually in there", and reaching for the scrollbar takes
   * focus off the button and shuts the panel in your hand. So it closes on
   * the two gestures that mean "done" — a click somewhere else, or Escape —
   * and anything inside the deck is left alone.
   */
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

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
            className={`deck-panel ${room.above ? 'is-above' : ''}`}
            style={{ '--deck-room': `${Math.round(room.px)}px` } as React.CSSProperties}
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
            {/* The census: what is still in there, counted by what has been
                done to it. Scrolls, because a long run marks a lot of cards. */}
            <div className="deck-scroll">
              {view.deckMarks.length ? (
                <ul className="deck-census">
                  {view.deckMarks.map(({ mark, count }) => {
                    const def = MARKS[mark];
                    return (
                      <li key={mark}>
                        <b className="mono">{count}</b> {def?.name ?? mark}
                        <em>{def?.blurb ?? ''}</em>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {rules.length ? (
                <ul className="deck-rules">
                  {rules.map((r) => <li key={r.key}>{r.text}</li>)}
                </ul>
              ) : null}

              {!rules.length && !view.deckMarks.length ? (
                <p className="deck-plain">Nothing has been done to it yet: fifty-two cards, four suits, no duplicates.</p>
              ) : null}

              {view.destroyedFaces.length ? (
                <>
                  <strong className="deck-sub">Burned out of the run</strong>
                  <p className="deck-gone">{view.destroyedFaces.join('  ')}</p>
                </>
              ) : null}
            </div>
            <p className="deck-note">
              Which card is which stays secret — that part is still poker. What has been
              done to the deck does not: every mark here was announced when it landed,
              and a burned card was face up when it burned.
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default memo(DeckBase);
