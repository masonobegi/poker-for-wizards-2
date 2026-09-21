/**
 * CardBack — the deck's own face.
 *
 * Deep violet stock, a gold-leaf border inset, and a sacred-geometry rosette:
 * guilloché ellipses swept around the centre, three concentric rings, a
 * hexagram, and the HEXHOLD "H" monogram sealed inside the innermost ring.
 * A very slow specular sheen crosses it so the gold reads as metal, not paint.
 *
 * Everything is deterministic and memoized — a table of forty backs costs one
 * render each and animates entirely on the compositor.
 */
import { memo } from 'react';

const W = 78;
const H = 112;
const CX = W / 2; // 39
const CY = H / 2; // 56

/** Guilloché: a fan of ellipses swept about the centre. */
const GUILLOCHE = Array.from({ length: 18 }, (_, i) => i * 10);

/** Rosette teeth: fine radial ticks between the outer two rings. */
const TEETH = Array.from({ length: 36 }, (_, i) => i * 10);

const R_OUTER = 26.5;
const R_MID = 19.5;
const R_INNER = 12.5;

/** Hexagram inscribed in R_MID. */
function starPoints(up: boolean): string {
  const base = up ? -90 : 90;
  return [0, 120, 240]
    .map((d) => {
      const a = ((base + d) * Math.PI) / 180;
      return `${(CX + R_MID * Math.cos(a)).toFixed(2)},${(CY + R_MID * Math.sin(a)).toFixed(2)}`;
    })
    .join(' ');
}

const STAR_UP = starPoints(true);
const STAR_DOWN = starPoints(false);

/** Four corner filigree curls, one path mirrored into each corner. */
const CORNER_CURL = 'M9 20 C9 13 13 9 20 9 M12.5 20 C12.5 15 15 12.5 20 12.5 M15 9.5 A2 2 0 0 1 15 9.5';

export interface CardBackProps {
  /** Dim the engraving so an overlay (a veil plaque, a probability field) reads on top. */
  muted?: boolean;
  /** Turn the travelling specular highlight off — e.g. for a deep stack of backs. */
  sheen?: boolean;
  className?: string;
}

export const CardBack = memo(function CardBack({ muted, sheen = true, className }: CardBackProps) {
  const cls = [
    'hx-back',
    muted ? 'hx-back--muted' : '',
    sheen ? 'hx-back--sheen' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} aria-hidden="true">
      <svg
        className="hx-back__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        focusable="false"
        aria-hidden="true"
      >
        {/* border inset, two weights */}
        <rect className="hx-back__rule" x={3.5} y={3.5} width={W - 7} height={H - 7} rx={5.5} />
        <rect className="hx-back__rule-fine" x={6} y={6} width={W - 12} height={H - 12} rx={4} />

        {/* corner filigree */}
        <g className="hx-back__rule-fine">
          <path d={CORNER_CURL} />
          <path d={CORNER_CURL} transform={`translate(${W} 0) scale(-1 1)`} />
          <path d={CORNER_CURL} transform={`translate(0 ${H}) scale(1 -1)`} />
          <path d={CORNER_CURL} transform={`translate(${W} ${H}) scale(-1 -1)`} />
        </g>

        {/* guilloché sweep */}
        <g className="hx-back__guilloche">
          {GUILLOCHE.map((a) => (
            <ellipse
              key={a}
              cx={CX}
              cy={CY}
              rx={R_OUTER}
              ry={R_OUTER * 0.36}
              transform={`rotate(${a} ${CX} ${CY})`}
            />
          ))}
        </g>

        {/* rosette teeth */}
        <g className="hx-back__teeth">
          {TEETH.map((a) => (
            <path
              key={a}
              d={`M${CX} ${CY - R_OUTER - 3.6} V${CY - R_OUTER - 0.6}`}
              transform={`rotate(${a} ${CX} ${CY})`}
            />
          ))}
        </g>

        {/* concentric rings */}
        <circle className="hx-back__ring" cx={CX} cy={CY} r={R_OUTER + 4.6} />
        <circle className="hx-back__ring" cx={CX} cy={CY} r={R_OUTER} />
        <circle className="hx-back__ring-fine" cx={CX} cy={CY} r={R_MID} />

        {/* hexagram */}
        <g className="hx-back__star">
          <polygon points={STAR_UP} />
          <polygon points={STAR_DOWN} />
        </g>

        {/* sealed centre */}
        <circle className="hx-back__seal" cx={CX} cy={CY} r={R_INNER} />
        <circle className="hx-back__ring-fine" cx={CX} cy={CY} r={R_INNER} />

        {/* H monogram, with serif flares and a lozenge at the joint */}
        <g className="hx-back__mono">
          <path d={`M${CX - 6.5} ${CY - 7.5} V${CY + 7.5}`} />
          <path d={`M${CX + 6.5} ${CY - 7.5} V${CY + 7.5}`} />
          <path d={`M${CX - 6.5} ${CY} H${CX + 6.5}`} />
          <path
            className="hx-back__mono-fine"
            d={
              `M${CX - 9.2} ${CY - 7.5} H${CX - 3.8} M${CX - 9.2} ${CY + 7.5} H${CX - 3.8} ` +
              `M${CX + 3.8} ${CY - 7.5} H${CX + 9.2} M${CX + 3.8} ${CY + 7.5} H${CX + 9.2}`
            }
          />
        </g>
        <polygon
          className="hx-back__lozenge"
          points={`${CX},${CY - 3.1} ${CX + 2.6},${CY} ${CX},${CY + 3.1} ${CX - 2.6},${CY}`}
        />

        {/* top & bottom arcane ticks */}
        <g className="hx-back__rule-fine">
          <path d={`M${CX - 10} 15 H${CX + 10}`} />
          <path d={`M${CX - 10} ${H - 15} H${CX + 10}`} />
          <path d={`M${CX} 12 L${CX + 2.2} 15 L${CX} 18 L${CX - 2.2} 15 Z`} />
          <path d={`M${CX} ${H - 18} L${CX + 2.2} ${H - 15} L${CX} ${H - 12} L${CX - 2.2} ${H - 15} Z`} />
        </g>
      </svg>
      <span className="hx-back__grain" />
      {sheen && <span className="hx-back__gleam" />}
    </div>
  );
});

export default CardBack;
