import { motion } from 'framer-motion';
import type { TableView } from '@shared/types';
import { Button } from '@/components/ui/kit';
import { useGame, useIsHost } from '@/store/net';
import Avatar from '@/components/Avatar';
import { RELIC_BY_ID } from '@shared/relics';

export default function GameOver({ view }: { view: TableView }) {
  const isHost = useIsHost();
  const { startGame, leave } = useGame();

  const winner = view.players.find((p) => p.id === view.winnerId);
  const board = [...view.players].sort((a, b) => b.chips - a.chips || b.handsWon - a.handsWon);

  return (
    <motion.div
      className="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="gameover-panel"
        initial={{ y: 40, scale: 0.94 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 28 }}
      >
        <span className="eyebrow">The table is closed</span>

        {winner ? (
          <motion.div
            className="gameover-winner"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Avatar seed={winner.avatar} size={82} bot={winner.isBot} />
            <h2>{winner.name}</h2>
            <p>took every chip on the table</p>
          </motion.div>
        ) : null}

        <ul className="gameover-board">
          {board.map((p, i) => (
            <motion.li
              key={p.id}
              className={p.id === view.winnerId ? 'is-first' : ''}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.07 }}
            >
              <span className="gameover-rank mono">{i + 1}</span>
              <Avatar seed={p.avatar} size={28} bot={p.isBot} dim={p.eliminated} />
              <span className="gameover-name">{p.name}</span>
              <span className="gameover-relics">
                {p.relics.map((id) => RELIC_BY_ID[id]?.glyph).filter(Boolean).join(' ')}
              </span>
              <span className="gameover-stat mono">{p.handsWon} won</span>
              <span className="gameover-chips mono">{p.chips.toLocaleString()}</span>
            </motion.li>
          ))}
        </ul>

        <div className="gameover-actions">
          {isHost ? (
            <Button tone="primary" size="lg" display block onClick={startGame}>
              Deal again
            </Button>
          ) : (
            <p className="dim" style={{ textAlign: 'center', fontSize: 'var(--fs-sm)' }}>
              Waiting on the host to deal again…
            </p>
          )}
          <Button tone="ghost" block onClick={leave}>Leave table</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
