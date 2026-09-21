import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { TableView } from '@shared/types';
import { RANK_NAME } from '@shared/cards';
import { Card } from '@/components/card/Card';
import { Tooltip } from '@/components/ui/kit';

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
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: -40, rotateZ: -8, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, rotateZ: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.7, filter: 'blur(6px)' }}
              transition={{
                type: 'spring', stiffness: 260, damping: 24,
                delay: Math.min(i * 0.07, 0.35),
              }}
            >
              <Card
                view={c}
                size="md"
                index={i}
                highlight={winningIds.has(c.id) ? 'winning' : 'none'}
                selectable={targetable}
                selected={pickedIds.includes(c.id)}
                onClick={targetable ? onPickCard : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Slots that were never dealt, or were burned out of the board. */}
        {Array.from({ length: Math.max(0, 5 - view.board.length) }, (_, i) => (
          <div key={`slot-${i}`} className="board-slot" aria-hidden />
        ))}
      </div>

      <div className="board-pot">
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
              <motion.span
                key={view.pot}
                className="pot-amount mono"
                initial={{ scale: 1.22, color: 'var(--gold-hi)' }}
                animate={{ scale: 1, color: 'var(--chip)' }}
                transition={{ duration: 0.4 }}
              >
                {view.pot.toLocaleString()}
              </motion.span>
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
