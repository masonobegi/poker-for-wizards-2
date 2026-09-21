/**
 * CardRow — a set of cards laid out as a straight overlapping row or as a
 * fanned arc (what the player's own hole cards use).
 *
 * The row owns spacing and the fan geometry only; every card still owns its own
 * flip, tilt and effects. Entrance stagger is passed down as `index`, and exits
 * run through AnimatePresence so a burned or mucked card leaves rather than
 * vanishing.
 */
import { memo, useMemo, type CSSProperties } from 'react';
import { AnimatePresence } from 'framer-motion';
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
  /** When set, each card gets `${layoutIdPrefix}${view.id}` for shared-element flight. */
  layoutIdPrefix?: string;
  /** Index offset for the deal stagger, so a second row can continue the first. */
  staggerFrom?: number;
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
  layoutIdPrefix,
  staggerFrom = 0,
  className,
  label,
}: CardRowProps) {
  const hot = useMemo(() => new Set(highlightIds ?? []), [highlightIds]);
  const picked = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

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
    <div className={classes} style={rowVars} role="group" aria-label={label}>
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
                tiltOnHover={tiltOnHover}
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
