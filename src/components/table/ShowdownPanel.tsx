import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { ShowdownEntry, TableView } from '@shared/types';
import { CAT_NAME } from '@shared/hand';
import { CardRow } from '@/components/card/CardRow';
import { useCardAnchors } from '@/components/fx/useCardAnchors';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
// From the lazy-loading shim, not the `@/vfx` barrel — see SpellFlight.tsx.
import { burstAt } from '@/lib/visuals';
import type { School } from '@/vfx/particles';
import { EASE_OUT, ENTER, SPRING_PLAYFUL, T_REDUCED } from '@/styles/motion';

const SCHOOL_CYCLE: School[] = ['entropy', 'veil', 'chronos', 'bind', 'ruin', 'weave'];

export default function ShowdownPanel({ view }: { view: TableView }) {
  // Before any early return: a hook behind a conditional is one refactor away
  // from "Rendered fewer hooks than expected".
  const reduced = useReducedMotionPref();

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
      // Centring lives in the stylesheet as `translate: -50% 0`, which framer
      // does not write, so it no longer has to be carried through every state.
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, y: 20 }}
      transition={reduced
        ? { duration: T_REDUCED, ease: EASE_OUT, delay: 0.25 }
        : { ...SPRING_PLAYFUL, delay: 0.25 }}
    >
      <div className="showdown-inner">
        <header className="showdown-head">
          <span className="eyebrow">{uncontested ? 'Uncontested' : 'Showdown'}</span>
          {payout.bestImpossible ? (
            <motion.span
              className="showdown-impossible"
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ ...SPRING_PLAYFUL, delay: 0.5 }}
            >
              ⧉ {payout.bestImpossible}
            </motion.span>
          ) : null}
        </header>

        <ul className="showdown-list">
          {shown.map((e, i) => (
            <ShowdownRow key={e.playerId} e={e} i={i} nameOf={nameOf} shards={payout.shards[e.playerId]} />
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

/**
 * One player's revealed hand. Winning cards light up one at a time, in rank
 * order, rather than all at once — a staggered gold sweep down the row. An
 * impossible hand gets a slower, more deliberate version of the same reveal
 * plus a small school-coloured burst per card; the big screen-wide moment
 * (shake/chromatic/slowmo/confetti) is fxbridge's job on the `win` event, so
 * this stays a quieter, localized "here's why" that follows it rather than
 * repeating it.
 */
interface ShowdownRowProps {
  e: ShowdownEntry;
  i: number;
  nameOf: (id: string) => string;
  shards?: number;
}

function ShowdownRow({ e, i, nameOf, shards }: ShowdownRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  useCardAnchors(rowRef, e.cards.map((c) => c.id));
  const reduced = useReducedMotionPref();

  const isWinner = e.won > 0 && e.usedIds.length > 0;
  const stepMs = e.impossible ? 300 : 90;

  const [revealed, setRevealed] = useState<string[]>(() => (reduced || !isWinner ? e.usedIds : []));

  useEffect(() => {
    if (reduced || !isWinner) { setRevealed(e.usedIds); return; }
    setRevealed([]);
    const timers: number[] = [];
    e.usedIds.forEach((id, idx) => {
      const t = window.setTimeout(() => {
        setRevealed((prev) => (prev.includes(id) ? prev : [...prev, id]));
        const el = rowRef.current?.querySelector(`[data-card-id="${CSS.escape(id)}"]`);
        if (!el) return;
        if (e.impossible) burstAt('cast', el, { school: SCHOOL_CYCLE[idx % SCHOOL_CYCLE.length], scale: 1.1 });
        else burstAt('sparkleTrail', el, { count: 5 });
      }, 320 + idx * stepMs);
      timers.push(t);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
    // Re-run only when the hand itself changes, not on every parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [e.playerId, e.usedIds.join('|'), e.impossible, isWinner, reduced]);

  return (
    <motion.li
      className={[
        'showdown-row',
        e.won > 0 ? 'is-winner' : '',
        e.impossible ? 'is-impossible' : '',
      ].filter(Boolean).join(' ')}
      initial={{ opacity: 0, x: -18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...ENTER, delay: 0.2 + Math.min(i * 0.06, 0.3) }}
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
        <div ref={rowRef}>
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
        <span className="showdown-muck">mucked</span>
      )}

      {e.won > 0 ? (
        <motion.span
          className="showdown-won mono"
          initial={{ scale: 0.94, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...SPRING_PLAYFUL, delay: 0.3 + Math.min(i * 0.06, 0.3) }}
        >
          +{e.won.toLocaleString()}
          {shards ? <em className="showdown-shards">◆{shards}</em> : null}
        </motion.span>
      ) : (
        <span className="showdown-lost">{CAT_NAME[e.cat as keyof typeof CAT_NAME] ? '' : ''}</span>
      )}
    </motion.li>
  );
}
