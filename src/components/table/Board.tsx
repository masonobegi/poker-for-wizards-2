import { memo, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TableView } from '@shared/types';
import { RANK_NAME } from '@shared/cards';
import { Card } from '@/components/card/Card';
import { Tooltip } from '@/components/ui/kit';
import { RollingNumber } from '@/components/fx/RollingNumber';
import { spellFlight } from '@/components/fx/SpellFlight';

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
  // "Which five cards won?" is the question the showdown has to answer, and a
  // gold ring on an already-bright card face is not loud enough to answer it.
  // Once a winning hand is known, the board cards that are *not* part of it
  // drop back, so the ones that are read as the only lit thing on the felt.
  const dimLosers = view.phase === 'payout' && winningIds.size > 0;

  // A board card being picked as a target releases the armed spell flight
  // (see Rail.tsx) toward it, then does the actual target-pick as before.
  const handlePickCard = (id: string): void => {
    spellFlight.release(document.querySelector(`[data-card-id="${CSS.escape(id)}"]`));
    onPickCard?.(id);
  };

  // A brief flash on the pot number for a "that was a real jump" cue,
  // separate from the RollingNumber's own count-up so the roll never restarts.
  const [jumping, setJumping] = useState(false);
  const prevPot = useRef(view.pot);
  useEffect(() => {
    if (view.pot === prevPot.current) return;
    prevPot.current = view.pot;
    setJumping(true);
    const t = window.setTimeout(() => setJumping(false), 460);
    return () => window.clearTimeout(t);
  }, [view.pot]);

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
                size="lg"
                index={i}
                highlight={
                  winningIds.has(c.id) ? 'winning' : dimLosers ? 'dimmed' : 'none'
                }
                selectable={targetable}
                selected={pickedIds.includes(c.id)}
                onClick={targetable ? handlePickCard : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Slots that were never dealt, or were burned out of the board. */}
        {Array.from({ length: Math.max(0, 5 - view.board.length) }, (_, i) => (
          <div key={`slot-${i}`} className="board-slot" aria-hidden />
        ))}
      </div>

      <div className="board-pot" data-fx-pot>
        <AnimatePresence mode="wait">
          {view.pot > 0 ? (
            <motion.div
              key="pot"
              className="pot"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 380, damping: 25 }}
            >
              <span className="pot-label">Pot</span>
              <span className={`pot-amount mono ${jumping ? 'is-jumping' : ''}`}>
                <RollingNumber value={view.pot} spring={{ stiffness: 150, damping: 14, mass: 1 }} />
              </span>
              {view.pots.length > 1 ? (
                <Tooltip
                  body={view.pots.map((p) => `${p.label}: ${p.amount.toLocaleString()}`).join(' · ')}
                >
                  <span className="pot-side">{view.pots.length} pots</span>
                </Tooltip>
              ) : null}
            </motion.div>
          ) : (
            <motion.span
              key="street"
              className="board-street"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {streetLabel}
            </motion.span>
          )}
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
