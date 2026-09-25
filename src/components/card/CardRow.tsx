/**
 * CardRow — a set of cards laid out as a straight overlapping row or as a
 * fanned arc (what the player's own hole cards use).
 *
 * The row owns spacing and the fan geometry only; every card still owns its own
 * flip, tilt and effects. Entrance stagger is passed down as `index`, and exits
 * run through AnimatePresence so a burned or mucked card leaves rather than
 * vanishing.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
import { originFor, type DealOrigin } from '@/lib/dealOrigin';
import type { CardView } from '@shared/cards';
import { Card, type CardHighlight, type CardSize, type StyleVars } from './Card';
import './card.css';

const SCALE: Record<CardSize, number> = { xs: 0.52, sm: 0.74, md: 1, lg: 1.36 };

export interface CardRowProps {
  views: readonly CardView[];
  size?: CardSize;
  /** How much of its neighbour each card covers, 0..0.85 of a card width. */
  overlap?: number;
  /** Ids that get `highlight`; everything else gets `restHighlight`. */
  highlightIds?: readonly string[];
  highlight?: CardHighlight;
  restHighlight?: CardHighlight;
  onCardClick?: (id: string) => void;
  onCardHover?: (id: string | null) => void;
  /** Curve the row into a held hand. */
  fan?: boolean;
  /** Total sweep of the fan in degrees (default 16). */
  fanSpread?: number;
  selectable?: boolean;
  selectedIds?: readonly string[];
  faceDown?: boolean;
  tiltOnHover?: boolean;
  /** Deal the row face-down and turn it over. See `Card`'s `dealFlip`. */
  dealFlip?: boolean;
  /** When set, each card gets `${layoutIdPrefix}${view.id}` for shared-element flight. */
  layoutIdPrefix?: string;
  /** Index offset for the deal stagger, so a second row can continue the first. */
  staggerFrom?: number;
  /**
   * Fly cards in from the deck rather than from a fixed offset. Only the
   * table opts in — the codex, the market and the gallery have no deck on
   * screen for cards to come from.
   */
  dealFromDeck?: boolean;
  className?: string;
  label?: string;
}

function CardRowBase({
  views,
  size = 'md',
  overlap,
  highlightIds,
  highlight = 'winning',
  restHighlight = 'none',
  onCardClick,
  onCardHover,
  fan = false,
  fanSpread = 16,
  selectable = false,
  selectedIds,
  faceDown = false,
  tiltOnHover,
  dealFlip = false,
  layoutIdPrefix,
  staggerFrom = 0,
  dealFromDeck = false,
  className,
  label,
}: CardRowProps) {
  const hot = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);
  const picked = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  /*
   * The deal vector is measured from the *row*, never from a card, because a
   * card does not exist until the moment it needs the answer. The row does:
   * it mounts empty with the table and outlives every deal, so by the time
   * the first card arrives the measurement is already sitting here.
   *
   * It is kept in a ref rather than in state on purpose. It is read during
   * render and only ever consumed by a mounting card's `initial`, so writing
   * it through state would re-render the whole row on every resize to change
   * a value that nothing already on screen can observe.
   */
  const rowRef = useRef<HTMLDivElement>(null);
  const origin = useRef<DealOrigin | null>(null);
  const [, bump] = useState(0);

  useLayoutEffect(() => {
    if (!dealFromDeck) return;
    const measure = (): void => { origin.current = originFor(rowRef.current); };
    measure();
    // One re-render after the first measurement, so a row that mounted with
    // cards already in it (a reconnect, a hot reload) is not stuck on the
    // fallback arc for the rest of the session.
    bump((n) => n + 1);
    // jsdom has no ResizeObserver. The one measurement above is what
    // matters; only the re-measure on resize is lost, and nothing
    // resizes in a unit test.
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [dealFromDeck]);

  // Re-measure between streets: the board row grows as cards land on it, and
  // a vector measured against a three-card row is wrong for the fourth.
  useEffect(() => {
    if (dealFromDeck) origin.current = originFor(rowRef.current);
  });

  const n = views.length;
  const gap = overlap ?? (fan ? 0.34 : 0.16);
  const step = n > 1 ? fanSpread / (n - 1) : 0;
  const mid = (n - 1) / 2;

  const rowVars: StyleVars = {
    '--csr': SCALE[size],
    '--hx-overlap': gap,
  };

  const classes = ['hx-row', fan ? 'hx-row--fan' : 'hx-row--straight', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={rowVars} role="group" aria-label={label} ref={rowRef}>
      <AnimatePresence initial={false}>
        {views.map((view, i) => {
          const angle = fan ? (i - mid) * step : 0;
          const seat: CSSProperties = {
            zIndex: i + 1,
            transform: fan ? `rotate(${angle.toFixed(2)}deg)` : undefined,
          };
          return (
            <div className="hx-row__seat" key={view.id} style={seat}>
              <Card
                view={view}
                size={size}
                faceDown={faceDown}
                highlight={hot.size > 0 ? (hot.has(view.id) ? highlight : restHighlight) : restHighlight}
                selectable={selectable}
                selected={picked.has(view.id)}
                onClick={onCardClick}
                onHoverChange={onCardHover}
                layoutId={layoutIdPrefix ? `${layoutIdPrefix}${view.id}` : undefined}
                index={staggerFrom + i}
                dealFrom={dealFromDeck ? origin.current : null}
                tiltOnHover={tiltOnHover}
                dealFlip={dealFlip}
              />
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export const CardRow = memo(CardRowBase);
CardRow.displayName = 'CardRow';

export default CardRow;
