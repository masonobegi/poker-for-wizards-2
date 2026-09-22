import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { ShowdownEntry, TableView } from '@shared/types';
import { CardRow } from '@/components/card/CardRow';
import { useCardAnchors } from '@/components/fx/useCardAnchors';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
// From the lazy-loading shim, not the `@/vfx` barrel — see SpellFlight.tsx.
import { burstAt } from '@/lib/visuals';
import type { School } from '@/vfx/particles';

const SCHOOL_CYCLE: School[] = ['entropy', 'veil', 'chronos', 'bind', 'ruin', 'weave'];

/**
 * The payoff.
 *
 * This is the moment the entire deck exists for, and it is the one screen in
 * the game where being tidy is the wrong instinct. A player who just made a
 * Flush House out of a deck that cannot produce one should be told so in the
 * largest type on screen, not in an 11px grey subtitle under their name.
 *
 * Two things shape the layout:
 *
 * **The hand name is the hero.** Not the player, not the chip count — the
 * name of the thing they made. It sits alone, in the display face, and it is
 * what your eye lands on first.
 *
 * **Losers do not get cards here.** An earlier version gave every player at
 * showdown an equal row with their full hand, which read as a results table,
 * overflowed a fixed-height panel the moment a fourth player stayed in, and
 * silently clipped the bottom row. Every hand is already face-up at its own
 * seat by this point, so repeating them costs the space the winner needed.
 * The others get one line naming what they had, which is the only part
 * anybody reads.
 */
export default function ShowdownPanel({ view }: { view: TableView }) {
  const payout = view.payout;
  if (!payout) return null;

  const nameOf = (id: string) => view.players.find((p) => p.id === id)?.name ?? '???';

  const winners = payout.entries.filter((e) => e.won > 0).sort((a, b) => b.won - a.won);
  const others = payout.entries
    .filter((e) => e.won <= 0 && e.cards.length > 0)
    .sort((a, b) => b.score - a.score);

  if (winners.length === 0) return null;

  // Everyone folded: there is no hand to show off, so say what happened and
  // get out of the way rather than staging a reveal for a pot nobody contested.
  const uncontested = payout.entries.every((e) => e.cards.length === 0);
  const hero = winners[0];
  const split = winners.length > 1;

  return (
    <motion.div
      className={['showdown', hero.impossible ? 'is-impossible' : ''].filter(Boolean).join(' ')}
      // The CSS centres this with translateX(-50%); framer-motion writes the
      // whole transform, so the centring has to travel with the animation or
      // the panel lands half a width to the right.
      initial={{ opacity: 0, y: 24, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 14, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: 0.2 }}
    >
      <div className="showdown-inner">
        <header className="showdown-head">
          <span className="eyebrow">{uncontested ? 'Uncontested' : split ? 'Split pot' : 'Showdown'}</span>
          {payout.bestImpossible ? (
            <motion.span
              className="showdown-impossible"
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.55, type: 'spring', stiffness: 380, damping: 18 }}
            >
              ⧉ impossible
            </motion.span>
          ) : null}
        </header>

        <ul className="showdown-list">
          {winners.map((e, i) => (
            <WinnerRow
              key={e.playerId}
              e={e}
              i={i}
              name={nameOf(e.playerId)}
              handLabel={uncontested ? 'Takes it uncalled' : e.handName}
              shards={payout.shards[e.playerId]}
            />
          ))}
        </ul>

        {others.length ? (
          <motion.div
            className="showdown-others"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.75 }}
          >
            {others.map((e) => (
              <span key={e.playerId} className="showdown-other">
                <strong>{nameOf(e.playerId)}</strong>
                {e.handName}
              </span>
            ))}
          </motion.div>
        ) : null}
      </div>
    </motion.div>
  );
}

/**
 * One winner: their five cards lighting up one at a time in rank order, a
 * staggered gold sweep down the row. An impossible hand gets a slower, more
 * deliberate version of the same reveal plus a school-coloured burst per
 * card; the screen-wide moment (shake/chromatic/slowmo/confetti) is
 * fxbridge's job on the `win` event, so this stays the quieter "here's why"
 * that follows it rather than repeating it.
 *
 * The server's payout hold is computed from the same two constants below, so
 * the hand is never cut off mid-reveal by the next deal — see
 * `Engine.payoutHold`.
 */
const REVEAL_LEAD_MS = 320;
const REVEAL_STEP_MS = 90;
const REVEAL_STEP_IMPOSSIBLE_MS = 300;

interface WinnerRowProps {
  e: ShowdownEntry;
  i: number;
  name: string;
  /** Usually the hand name; replaced when nobody was called. */
  handLabel: string;
  shards?: number;
}

function WinnerRow({ e, i, name, handLabel, shards }: WinnerRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  useCardAnchors(rowRef, e.cards.map((c) => c.id));
  const reduced = useReducedMotionPref();

  const canReveal = e.usedIds.length > 0 && e.cards.length > 0;
  const stepMs = e.impossible ? REVEAL_STEP_IMPOSSIBLE_MS : REVEAL_STEP_MS;

  const [revealed, setRevealed] = useState<string[]>(() => (reduced || !canReveal ? e.usedIds : []));

  useEffect(() => {
    if (reduced || !canReveal) { setRevealed(e.usedIds); return; }
    setRevealed([]);
    const timers: number[] = [];
    e.usedIds.forEach((id, idx) => {
      const t = window.setTimeout(() => {
        setRevealed((prev) => (prev.includes(id) ? prev : [...prev, id]));
        const el = rowRef.current?.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
        if (!el) return;
        if (e.impossible) burstAt('cast', el, { school: SCHOOL_CYCLE[idx % SCHOOL_CYCLE.length], scale: 1.1 });
        else burstAt('sparkleTrail', el, { count: 5 });
      }, REVEAL_LEAD_MS + idx * stepMs);
      timers.push(t);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Re-run only when the hand itself changes, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.playerId, e.usedIds.join('|'), e.impossible, canReveal, reduced]);

  return (
    <motion.li
      className={['showdown-row', e.impossible ? 'is-impossible' : ''].filter(Boolean).join(' ')}
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.32 + i * 0.1 }}
    >
      {e.cards.length ? (
        <div ref={rowRef} className="showdown-cards">
          <CardRow
            views={e.cards}
            size="sm"
            overlap={0.34}
            highlightIds={revealed}
            highlight="winning"
            restHighlight="none"
            tiltOnHover={false}
          />
        </div>
      ) : (
        <span className="showdown-muck">no cards shown</span>
      )}

      {/* The name of the hand is the hero of this screen; the player who made
          it is the caption under it, not the other way round. */}
      <div className="showdown-who">
        <motion.span
          className="showdown-title"
          initial={{ opacity: 0, y: 8, letterSpacing: '0.28em' }}
          animate={{ opacity: 1, y: 0, letterSpacing: '0.06em' }}
          transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {handLabel}
        </motion.span>
        <span className="showdown-name">
          <strong>{name}</strong>
          {e.timelineUsed === 'echo' ? (
            <em className="showdown-echo" title="Scored from the second timeline">⧖ echo</em>
          ) : null}
          {e.echoName && e.timelineUsed !== 'echo' ? (
            <span className="showdown-alt">echo would have been {e.echoName}</span>
          ) : null}
        </span>
      </div>

      <motion.span
        className="showdown-won mono"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.5 + i * 0.1, type: 'spring', stiffness: 420, damping: 20 }}
      >
        +{e.won.toLocaleString()}
        {shards ? <em className="showdown-shards">◆{shards}</em> : null}
      </motion.span>
    </motion.li>
  );
}
