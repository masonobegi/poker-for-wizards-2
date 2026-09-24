import { useEffect } from 'react';
import { motion } from 'framer-motion';
import type { TableView } from '@shared/types';
import { Button } from '@/components/ui/kit';
import { useGame, useIsHost } from '@/store/net';
import Avatar from '@/components/Avatar';
import { RELIC_BY_ID } from '@shared/relics';
import { EASE_OUT, ENTER, ENTER_PANEL, SPRING_PLAYFUL, T_REDUCED } from '@/styles/motion';
// From the lazy-loading shim, not the `@/vfx` barrel — see SpellFlight.tsx.
import { centerOf, confetti, elementForSeat, flash, slowmo, vignette } from '@/lib/visuals';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import { Mark } from '@/art/marks';

export default function GameOver({ view }: { view: TableView }) {
  const isHost = useIsHost();
  const { startGame, leave } = useGame();
  const reduced = useReducedMotionPref();

  const winner = view.players.find((p) => p.id === view.winnerId);
  const board = [...view.players].sort((a, b) => b.chips - a.chips || b.handsWon - a.handsWon);

  /*
   * The end of a whole run is the rarest moment the game has, and it used to
   * get a panel spring and a list fade while a single mid-run impossible hand
   * got shake + flash + chromatic + slow-mo + confetti. The delight budget was
   * spent on the frequent moment and withheld from the rare one.
   *
   * There is no `gameover` event on the wire, so this fires from the component
   * rather than from fxbridge. Deliberately a *different shape* from the
   * impossible-hand hit: no shake and no chromatic split. That one is a shock —
   * instant, loud, over in under a second. This is a settle: the vignette
   * closes in and holds while the panel arrives, then the celebration lands on
   * top of it rather than into the same frame.
   */
  const winnerId = view.winnerId;
  useEffect(() => {
    if (reduced) return undefined;
    vignette('var(--gold)', 1600);
    slowmo(0.55, 1200);
    const t = window.setTimeout(() => {
      const at = centerOf(elementForSeat(winnerId ?? '')) ?? undefined;
      confetti(at);
      flash('#f0c465', 0.35);
    }, 420);
    return () => window.clearTimeout(t);
  }, [winnerId, reduced]);

  return (
    <motion.div
      className="gameover"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={ENTER_PANEL}
    >
      <motion.div
        className="gameover-panel"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={reduced ? { duration: T_REDUCED, ease: EASE_OUT } : SPRING_PLAYFUL}
      >
        <span className="eyebrow">The table is closed</span>

        {winner ? (
          <motion.div
            className="gameover-winner"
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...SPRING_PLAYFUL, delay: 0.25 }}
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
              transition={{ ...ENTER, delay: 0.5 + Math.min(i * 0.06, 0.3) }}
            >
              <span className="gameover-rank mono">{i + 1}</span>
              <Avatar seed={p.avatar} size={28} bot={p.isBot} dim={p.eliminated} />
              <span className="gameover-name">{p.name}</span>
              <span className="gameover-relics">
                {p.relics.map((id) => {
                  const r = RELIC_BY_ID[id];
                  return r ? <Mark key={id} kind="relic" id={id} fallback={r.glyph} title={r.name} /> : null;
                })}
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
