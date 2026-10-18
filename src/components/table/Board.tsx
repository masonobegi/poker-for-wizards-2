import { memo, useEffect, useLayoutEffect, useRef } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { useReducedMotionPref } from '@/components/fx/useReducedMotionPref';
import type { TableView } from '@shared/types';
import { RANK_NAME, type CardView } from '@shared/cards';
import { Card } from '@/components/card/Card';
import { Tooltip } from '@/components/ui/kit';
import { RollingNumber } from '@/components/fx/RollingNumber';
import { spellFlight } from '@/components/fx/SpellFlight';
import PotChips from '@/components/table/PotChips';
import { originFor, type DealOrigin } from '@/lib/dealOrigin';
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
  /* What the sigil on the stack is pointing at.
     The caster could see their own pick highlighted; nobody else could see
     anything at all, so a spell arriving at the board was a panel of text and
     a card that changed afterwards. Everyone sees the aim now, while there is
     still time to answer it. */
  const aimed = new Set(
    (view.stack?.entries ?? []).flatMap((e) => e.targets?.cardIds ?? []),
  );

  /* The row, with its holes.
     `view.board` holds only the cards still on the table and `burnedSlots`
     holds the places the burned ones occupied (server/game/table.ts
     `displaySlot`), so the row is rebuilt here rather than closed up: a card
     that burns leaves a gap exactly where it was dealt and nothing else
     moves. "An X in the spot it was burned and no cards moved." */
  const holes = new Set(view.burnedSlots);
  const slots: Array<{ card: CardView | null; i: number }> = [];
  {
    let next = 0;
    const width = view.board.length + holes.size;
    for (let i = 0; i < width; i++) {
      if (holes.has(i)) slots.push({ card: null, i });
      else slots.push({ card: view.board[next++] ?? null, i });
    }
  }
  // Five is the ordinary board; an omen can deal more, and a burn does not
  // buy anybody a replacement.
  const toCome = Math.max(0, 5 - slots.length);
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

  // Where the board's cards fly in from. The board lays its cards out itself
  // rather than through `CardRow`, so it measures its own strip against the
  // deck the same way a row does — see `lib/dealOrigin` for why this is taken
  // from the container and not from the cards.
  const stripRef = useRef<HTMLDivElement>(null);
  const dealFrom = useRef<DealOrigin | null>(null);
  useLayoutEffect(() => {
    const measure = (): void => { dealFrom.current = originFor(stripRef.current); };
    measure();
    // jsdom has no ResizeObserver. The one measurement above is what matters;
    // only the re-measure on resize is lost, and nothing resizes in a unit test.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, []);
  // The strip widens with every street, so a vector measured against three
  // cards is already wrong for the fourth.
  useEffect(() => { dealFrom.current = originFor(stripRef.current); });

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

      <div className="board-cards" ref={stripRef}>
        <AnimatePresence mode="popLayout">
          {slots.map(({ card: c, i }) => c === null ? (
            /* A hole, where a card burned. It keeps the place the card was
               dealt into — the row does not close up, because at a real
               table nothing slides when a card is taken away. */
            <motion.div
              key={`hole-${i}`}
              className="board-slot is-burned"
              layout
              title="A community card was burned out of the board here. It is not replaced, and it is out of the deck for good."
              aria-label="A burned community card"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
            >
              <span className="board-slot__x" aria-hidden>✕</span>
              <span className="board-slot__burnedlabel" aria-hidden>burned</span>
            </motion.div>
          ) : (
            // `Card` already owns its full deck-to-slot arc, rotation, stagger
            // and exit (see `hx-card-enter` in card.css) — this wrapper only
            // needs `layout` so the remaining cards reflow smoothly when one
            // is removed (a board card burned by a sigil). Giving it its own
            // initial/animate transform on top of Card's would fight Card's
            // carefully-tuned per-axis springs and blur the arc.
            <motion.div key={c.id} layout data-card-id={c.id}>
              {/* `lg` matches `--board-scale` in table.css, which is documented
                  as tracking exactly this and had drifted: a dealt card came
                  out at 1.0 while the empty slot beside it was at 1.36, so the
                  flop was 17px shorter than the sockets it landed in and sat
                  17px higher than them in the same row. */}
              <Card
                view={c}
                size="lg"
                dealFlip
                index={i}
                dealFrom={dealFrom.current}
                highlight={
                  aimed.has(c.id) ? 'target'
                    : winningIds.has(c.id) ? 'winning'
                      : dimLosers ? 'dimmed' : 'none'
                }
                selectable={targetable}
                selected={pickedIds.includes(c.id)}
                onClick={targetable ? handlePickCard : undefined}
              />
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Sockets for the cards still to come. Their own AnimatePresence
            rather than the cards' — that one is `mode="popLayout"`, which
            pulls exiting children out of flow, and a socket should hold its
            place in the row while it closes. */}
        <AnimatePresence>
          {Array.from({ length: toCome }, (_, i) => (
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
        {/* The pile sits on the felt above its own label rather than inside
            the pill, which had no room to make it read as money. */}
        <PotChips pot={view.pot} bb={view.bb} />
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
