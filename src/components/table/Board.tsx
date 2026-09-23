import { memo, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import type { TableView } from '@shared/types';
import { RANK_NAME } from '@shared/cards';
import { Card } from '@/components/card/Card';
import { Tooltip } from '@/components/ui/kit';
import { RollingNumber } from '@/components/fx/RollingNumber';
import { spellFlight } from '@/components/fx/SpellFlight';
import { EASE_OUT, ENTER, ENTER_PANEL, SPRING_SOFT } from '@/styles/motion';

export interface BoardProps {
  view: TableView;
  targetable?: boolean;
  pickedIds?: string[];
  onPickCard?: (id: string) => void;
}

function BoardBase({ view, targetable, pickedIds = [], onPickCard }: BoardProps) {
  const winningIds = new Set(
    (view.payout?.entries ?? []).filter((e) => e.won > 0).flatMap((e) => e.usedIds),
  );

  // A board card being picked as a target releases the armed spell flight
  // (see Rail.tsx) toward it, then does the actual target-pick as before.
  const handlePickCard = (id: string): void => {
    spellFlight.release(document.querySelector(`[data-card-id="${CSS.escape(id)}"]`));
    onPickCard?.(id);
  };

  // A brief pop on the pot number for a "that was a real jump" cue, separate
  // from the RollingNumber's own count-up so the roll never restarts.
  //
  // This used to be a boolean driving a CSS keyframe, which silently fired at
  // most once per 460ms: a second bet inside that window found `jumping`
  // already true, so React never re-rendered, the class never toggled off and
  // on, and the keyframe never restarted. Three raises in one street produced
  // one pop. Imperative controls restart on every call and retarget from
  // wherever the previous pop had reached, and — unlike a `key` bump — they do
  // not remount the RollingNumber underneath.
  const potPop = useAnimationControls();
  const reduced = useReducedMotionPref();
  const prevPot = useRef(view.pot);
  useEffect(() => {
    if (view.pot === prevPot.current) return;
    prevPot.current = view.pot;
    if (reduced) return;
    void potPop.start({
      scale: [1, 1.22, 1],
      transition: { duration: 0.46, ease: EASE_OUT, times: [0, 0.35, 1] },
    });
  }, [view.pot, reduced, potPop]);

  const streetLabel = view.phase === 'preflop' ? 'Pre-flop'
    : view.phase === 'flop' ? 'Flop'
      : view.phase === 'turn' ? 'Turn'
        : view.phase === 'river' ? 'River'
          : view.phase === 'showdown' || view.phase === 'payout' ? 'Showdown'
            : '';

  return (
    <div className="board">
      <div className="board-mods">
        <AnimatePresence>
          {view.modNotes.map((n) => (
            <motion.span
              key={n}
              className="board-mod"
              initial={{ opacity: 0, y: -8, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              layout
            >
              {n}
            </motion.span>
          ))}
          {view.activeMods.deadRanks?.map((r) => (
            <motion.span
              key={`dead${r}`}
              className="board-mod is-bad"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              layout
            >
              {RANK_NAME[r]}s unmade
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <div className="board-cards">
        <AnimatePresence mode="popLayout">
          {view.board.map((c, i) => (
            // `Card` already owns its full deck-to-slot arc, rotation, stagger
            // and exit (see `hx-card-enter` in card.css) — this wrapper only
            // needs `layout` so the remaining cards reflow smoothly when one
            // is removed (a board card burned by a sigil). Giving it its own
            // initial/animate transform on top of Card's would fight Card's
            // carefully-tuned per-axis springs and blur the arc.
            <motion.div key={c.id} layout data-card-id={c.id}>
              <Card
                view={c}
                size="md"
                dealFlip
                index={i}
                highlight={winningIds.has(c.id) ? 'winning' : 'none'}
                selectable={targetable}
                selected={pickedIds.includes(c.id)}
                onClick={targetable ? handlePickCard : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Slots that were never dealt, or were burned out of the board. They
            get their own AnimatePresence rather than joining the cards' —
            that one is `mode="popLayout"`, which pulls exiting children out of
            flow, and a socket should hold its place in the row while it
            closes. When a sigil burns a community card the card exits on its
            arc and the survivors slide; the socket arriving at the end of the
            row was the one part of that change not explained by motion.
            `clip-path` percentages mean no hardcoded offsets, so it reads the
            same at every --card-w. */}
        <AnimatePresence>
          {Array.from({ length: Math.max(0, 5 - view.board.length) }, (_, i) => (
            <motion.div
              key={`slot-${i}`}
              className="board-slot"
              aria-hidden
              layout
              initial={{ opacity: 0, clipPath: 'inset(0 50% 0 50%)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0%)' }}
              exit={{ opacity: 0, clipPath: 'inset(0 50% 0 50%)' }}
              transition={ENTER_PANEL}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="board-pot" data-fx-pot>
        <AnimatePresence mode="wait">
          {view.pot > 0 ? (
            <motion.div
              key="pot"
              className="pot"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={SPRING_SOFT}
            >
              <span className="pot-label">Pot</span>
              <motion.span className="pot-amount mono" animate={potPop}>
                <RollingNumber value={view.pot} spring={{ stiffness: 150, damping: 14, mass: 1 }} />
              </motion.span>
              {view.pots.length > 1 ? (
                <Tooltip
                  body={view.pots.map((p) => `${p.label}: ${p.amount.toLocaleString()}`).join(' · ')}
                >
                  <span className="pot-side">{view.pots.length} pots</span>
                </Tooltip>
              ) : null}
            </motion.div>
          ) : streetLabel ? (
            /* `streetLabel` is empty during deal, ante_intro, shop and
               gameover. Rendering the span anyway left an empty, letter-spaced
               element sitting in the pot slot for the length of each deal. */
            <motion.span
              key="street"
              className="board-street"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={ENTER}
            >
              {streetLabel}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </div>

      {view.deckTop ? (
        <div className="board-peek">
          <span className="eyebrow">Top of deck</span>
          <Card view={view.deckTop} size="xs" tiltOnHover={false} />
        </div>
      ) : null}

      {view.peeked.length ? (
        <div className="board-foresight">
          <span className="eyebrow">Foreseen</span>
          <div className="row" style={{ gap: 4 }}>
            {view.peeked.map((c) => (
              <Card key={c.id} view={c} size="xs" tiltOnHover={false} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default memo(BoardBase);
