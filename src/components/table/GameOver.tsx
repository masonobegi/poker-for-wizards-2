import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { TableView } from '@shared/types';
import { Button } from '@/components/ui/kit';
import { useGame, useIsHost } from '@/store/net';
import Avatar from '@/components/Avatar';
import { RELIC_BY_ID } from '@shared/relics';
import { OMEN_BY_ID } from '@shared/omens';
import { RANK_NAME } from '@shared/cards';
import { bannerBusyMs } from '@/components/BannerLayer';

/** However long a banner claims, the panel is never held back further. */
const MAX_WAIT_MS = 4500;

export default function GameOver({ view }: { view: TableView }) {
  const isHost = useIsHost();
  const { startGame, leave } = useGame();

  // Let the end-of-run banner have the screen first, then take it. Polled
  // rather than read once, because the banner's fx event and this phase change
  // arrive together and either can land first.
  const [bannerDone, setBannerDone] = useState(false);
  useEffect(() => {
    if (bannerDone) return;
    const giveUpAt = Date.now() + MAX_WAIT_MS;
    const id = window.setInterval(() => {
      if (bannerBusyMs() === 0 || Date.now() > giveUpAt) {
        window.clearInterval(id);
        setBannerDone(true);
      }
    }, 150);
    return () => window.clearInterval(id);
  }, [bannerDone]);

  const winner = view.players.find((p) => p.id === view.winnerId);
  const board = [...view.players].sort((a, b) => b.chips - a.chips || b.handsWon - a.handsWon);

  // The run you just played, from the table you just played it at. A roguelike
  // ends by showing you the thing you built, and this one's version of that is
  // the rulebook: by ante six nobody sat down to the game you finished, and
  // naming it back is most of what makes a player start another.
  const me = view.players.find((p) => p.isYou);
  const myRelics = (me?.relics ?? []).map((id) => RELIC_BY_ID[id]).filter(Boolean);

  if (!bannerDone) return null;

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

        {me ? (
          <motion.div
            className="gameover-run"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.38 }}
          >
            <span className="eyebrow">Your run</span>

            <div className="gameover-runstats">
              <span><strong>{view.ante}</strong> antes</span>
              <span><strong>{me.handsWon}</strong> hands won</span>
              {me.biggestPot > 0 ? (
                <span>biggest pot <strong>{me.biggestPot.toLocaleString()}</strong></span>
              ) : null}
            </div>

            {view.omens.length ? (
              <>
                <p className="gameover-runlabel">The rules you finished under</p>
                <ul className="gameover-omens">
                  {view.omens.map((o) => {
                    const def = OMEN_BY_ID[o.id];
                    if (!def) return null;
                    return (
                      <li key={o.id} title={def.text}>
                        <span className="gameover-omenglyph">{def.glyph}</span>
                        {def.name}
                        {o.rank ? ` — ${RANK_NAME[o.rank]}` : ''}
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : null}

            {myRelics.length ? (
              <>
                <p className="gameover-runlabel">What you were carrying</p>
                <ul className="gameover-relicrow">
                  {myRelics.map((r) => (
                    <li key={r.id} title={r.text}>
                      <span className="gameover-omenglyph">{r.glyph}</span>
                      {r.name}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </motion.div>
        ) : null}

        <ul className="gameover-board">
          {board.map((p, i) => (
            <motion.li
              key={p.id}
              className={p.id === view.winnerId ? 'is-first' : ''}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.62 + i * 0.07 }}
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
