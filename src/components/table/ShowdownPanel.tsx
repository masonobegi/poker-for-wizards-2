import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { ShowdownEntry, TableView } from '@shared/types';
import type { CardView } from '@shared/cards';
import { CAT_NAME, Cat, type RuleMods } from '@shared/hand';
import { CardRow } from '@/components/card/CardRow';
import { useCardAnchors } from '@/components/fx/useCardAnchors';
import { DecodeText } from '@/components/fx/DecodeText';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
// From the lazy-loading shim, not the `@/vfx` barrel — see SpellFlight.tsx.
import { burstAt } from '@/lib/visuals';
import type { School } from '@/vfx/particles';
import { EASE_OUT, ENTER, SPRING_PLAYFUL, T_REDUCED } from '@/styles/motion';
import { Mark } from '@/art/marks';
import { CountUp } from '@/components/fx/CountUp';

/** The sign belongs to the number: as a separate flex item it sat a gap away. */
const plus = (n: number): string => `+${n.toLocaleString()}`;

/**
 * Why that is the hand it is.
 *
 * "My buddy had four cards to a straight and it never told me when he played
 * it" — and he was right to be confused, because under The Ladder four cards
 * in sequence IS a straight, and nothing on the screen said so. Every one of
 * these rules is public and already listed in the Rules tab; this is the
 * same information said at the moment it decides a pot.
 */
function whyThisHand(cat: number, mods: RuleMods, impossible: boolean): string | null {
  const why: string[] = [];
  const straightish = cat === Cat.Straight || cat === Cat.StraightFlush;
  const flushish = cat === Cat.Flush || cat === Cat.StraightFlush
    || cat === Cat.FlushHouse || cat === Cat.FlushFive;

  if (straightish && mods.straightSize && mods.straightSize < 5) {
    why.push(`a straight is ${mods.straightSize} cards here`);
  }
  if (straightish && mods.straightGap) why.push('straights may skip a rank');
  if (straightish && mods.wheelWrap) why.push('the ace bridges both ends');
  if (flushish && mods.flushSize && mods.flushSize < 5) {
    why.push(`a flush is ${mods.flushSize} cards here`);
  }
  if (flushish && mods.mergedColors) why.push('two suits, not four');
  if (mods.facesAreKings && cat >= Cat.Trips) why.push('jacks and queens read as kings');
  if (mods.memoryBonus) why.push('cards score higher for pots they have won');
  if (mods.lowWins) why.push('the worst hand wins');
  if (impossible && why.length === 0) return null;
  return why.length ? why.join(' · ') : null;
}

const SCHOOL_CYCLE: School[] = ['entropy', 'veil', 'chronos', 'bind', 'ruin', 'weave'];

/** CardRow's own scale per size — kept in step with SCALE in CardRow.tsx. */
const CARD_SCALE = { xs: 0.52, sm: 0.74, md: 1, lg: 1.36 } as const;

/**
 * The biggest hand size whose row still fits the panel.
 *
 * The panel is capped at `100vh - 128px` and spends about 72px of that on its
 * header and padding; each row adds 16px of its own padding and border to the
 * card it holds. `--card-h` is `round(clamp(56px, 8.2vmin, 168px), 4px)` times
 * 112/78, which is cheap enough to recompute here and keeps this in one place
 * rather than in a media query that has to be kept in step with tokens.css.
 */
function pickHandSize(rows: number): 'xs' | 'sm' | 'md' | 'lg' {
  if (typeof window === 'undefined') return 'md';
  const vmin = Math.min(window.innerWidth, window.innerHeight);
  const cardH = Math.min(168, Math.max(56, 0.082 * vmin)) * 112 / 78;
  const per = (window.innerHeight - 128 - 72) / Math.max(rows, 1) - 16;
  if (per >= cardH * CARD_SCALE.lg) return 'lg';
  if (per >= cardH * CARD_SCALE.md) return 'md';
  if (per >= cardH * CARD_SCALE.sm) return 'sm';
  return 'xs';
}

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
  // Every board card that scored for anybody, so the row shows which of the
  // five actually mattered and dims the rest.
  const allWinningIds = payout.entries.filter((e) => e.won > 0).flatMap((e) => e.usedIds);
  const uncontested = shown.every((e) => e.cards.length === 0);
  /*
   * How big the hands are drawn is a measurement, not a table of guesses.
   *
   * It was two thresholds — three-or-more rows, and a window 900px tall — and
   * both of them were tuned against a panel that could only be as tall as the
   * felt. The panel takes the window now (see `.felt.is-showdown` in
   * table.css), so the honest question is the one `pickHandSize` asks: divide
   * the height the panel may use between the rows there are, and take the
   * biggest card size that fits in a row. At 1280x800 that is the difference
   * between a 68px card and a 125px one.
   *
   * Read at render rather than through a resize listener: this panel
   * re-renders on every table update, and a window resized during a showdown
   * is not a case worth a subscription.
   */
  const handSize = pickHandSize(shown.length);

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
              <Mark kind="ui" id="impossible" /> {payout.bestImpossible}
            </motion.span>
          ) : null}
        </header>

        {/*
          No board row any more.

          It was here because the panel covers the real board, and "Flush,
          King high" is unreadable without the cards it was made from. The
          rows below now show the five cards that actually scored — board
          cards and hole cards together, in the order they scored — so the
          board row was saying the same thing twice and taking the space the
          hands wanted: "instead of just the two cards it needs to show the 5
          that created the winning hand, don't bother showing the community
          cards, and make the hands at the end a lot bigger."
        */}
        <ul className="showdown-list">
          {shown.map((e, i) => (
            <ShowdownRow
              key={e.playerId}
              e={e}
              i={i}
              nameOf={nameOf}
              shards={payout.shards[e.playerId]}
              why={whyThisHand(e.cat, view.activeMods ?? {}, !!e.impossible)}
              size={handSize}
              board={view.board}
            />
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
  /** The table rule that made this hand what it is, if one did. */
  why?: string | null;
  /** Set by the panel from how many hands it has to fit — see `handSize`. */
  size: 'xs' | 'sm' | 'md' | 'lg';
  /** The community cards, so a scored board card can be found by its id. */
  board: CardView[];
}

function ShowdownRow({ e, i, nameOf, shards, why, size, board }: ShowdownRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);

  /*
   * The five cards that made the hand, not the two you were dealt.
   *
   * "Instead of just the two cards it needs to show the 5 that created the
   * winning hand." `usedIds` is what the evaluator actually scored, and the
   * cards themselves are split across the board and this player's hole — so
   * they are gathered back together here, in scoring order, which is the
   * order the reveal lights them up in.
   *
   * A hand with nothing scored (a muck, or a pot taken uncontested) falls
   * back to whatever the player showed, so a row never goes empty.
   */
  const hand = useMemo(() => {
    const byId = new Map<string, CardView>();
    for (const c of [...board, ...e.cards]) byId.set(c.id, c);
    const used = e.usedIds.map((id) => byId.get(id)).filter((c): c is CardView => !!c);
    return used.length ? used : e.cards;
  }, [board, e.cards, e.usedIds]);

  useCardAnchors(rowRef, hand.map((c) => c.id));
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
          {/* Only the hand that won decodes. Every row doing it at once is a
              wall of runes, and the point is to draw the eye to the line that
              decided the pot — not to decorate five of them. */}
          {/* The lead covers the panel's own 0.25s entrance delay and spring.
              Without it a third of the decode happens behind an invisible
              panel and the line is half-resolved by the time you can read it. */}
          {isWinner ? <DecodeText text={e.handName} lead={430} step={42} /> : e.handName}
          {e.timelineUsed === 'echo' ? (
            <em className="showdown-echo" title="Scored from the second timeline">
              ⧖ echo
            </em>
          ) : null}
        </span>
        {e.echoName && e.timelineUsed !== 'echo' ? (
          <span className="showdown-alt">echo would have been {e.echoName}</span>
        ) : null}
        {why ? <span className="showdown-why">{why}</span> : null}
      </div>

      {hand.length ? (
        <div ref={rowRef}>
          <CardRow
            views={hand}
            size={size}
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
          {/* Counts up behind its own entrance and lands with a pop (the
              basketball roguelike's reward count-up), short because a
              showdown comes round every hand. */}
          <CountUp value={e.won} format={plus} delay={Math.round((0.3 + Math.min(i * 0.06, 0.3)) * 1000) + 120} duration={550} />
          {shards ? <em className="showdown-shards">◆{shards}</em> : null}
        </motion.span>
      ) : (
        <span className="showdown-lost">{CAT_NAME[e.cat as keyof typeof CAT_NAME] ? '' : ''}</span>
      )}
    </motion.li>
  );
}
