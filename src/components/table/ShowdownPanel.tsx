import { motion } from 'framer-motion';
import type { TableView } from '@shared/types';
import { CAT_NAME } from '@shared/hand';
import { CardRow } from '@/components/card/CardRow';

export default function ShowdownPanel({ view }: { view: TableView }) {
  const payout = view.payout;
  if (!payout) return null;

  const shown = payout.entries
    .filter((e) => e.cards.length > 0 || e.won > 0)
    .sort((a, b) => b.won - a.won || b.score - a.score);

  if (shown.length === 0) return null;

  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '???';
  const uncontested = shown.every((e) => e.cards.length === 0);

  return (
    <motion.div
      className="showdown"
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.25 }}
    >
      <div className="showdown-inner">
        <header className="showdown-head">
          <span className="eyebrow">{uncontested ? 'Uncontested' : 'Showdown'}</span>
          {payout.bestImpossible ? (
            <motion.span
              className="showdown-impossible"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 380, damping: 18 }}
            >
              ⧉ {payout.bestImpossible}
            </motion.span>
          ) : null}
        </header>

        <ul className="showdown-list">
          {shown.map((e, i) => (
            <motion.li
              key={e.playerId}
              className={[
                'showdown-row',
                e.won > 0 ? 'is-winner' : '',
                e.impossible ? 'is-impossible' : '',
              ].filter(Boolean).join(' ')}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + i * 0.1 }}
            >
              <div className="showdown-who">
                <strong>{nameOf(e.playerId)}</strong>
                <span className="showdown-hand">
                  {e.handName}
                  {e.timelineUsed === 'echo' ? (
                    <em className="showdown-echo" title="Scored from the second timeline">
                      ⧖ echo
                    </em>
                  ) : null}
                </span>
                {e.echoName && e.timelineUsed !== 'echo' ? (
                  <span className="showdown-alt">echo would have been {e.echoName}</span>
                ) : null}
              </div>

              {e.cards.length ? (
                <CardRow
                  views={e.cards}
                  size="sm"
                  overlap={0.34}
                  highlightIds={e.usedIds}
                  highlight="used"
                  tiltOnHover={false}
                />
              ) : (
                <span className="showdown-muck">mucked</span>
              )}

              {e.won > 0 ? (
                <motion.span
                  className="showdown-won mono"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 420, damping: 20 }}
                >
                  +{e.won.toLocaleString()}
                  {payout.shards[e.playerId] ? (
                    <em className="showdown-shards">◆{payout.shards[e.playerId]}</em>
                  ) : null}
                </motion.span>
              ) : (
                <span className="showdown-lost">{CAT_NAME[e.cat as keyof typeof CAT_NAME] ? '' : ''}</span>
              )}
            </motion.li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}
