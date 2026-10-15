import { memo } from 'react';

/**
 * The inlay on the cloth. Two hairlines, and nothing else.
 *
 * Four versions of this file were wrong in two different directions, and both
 * directions are worth writing down because they are the two ways a table like
 * this goes bad.
 *
 * The first three drew MORE: rings of ticks, scattered glyphs, crescents and
 * stars, six schools' mottos inscribed around the rim. The last of them went
 * furthest and made the whole table top a leaded rose window — twelve lights
 * in the six schools' colours, a second order of twenty-four, a border course
 * of forty, black came around every piece. It was committed, it was certainly
 * not a gradient, and it read as clip art: a flat vector illustration with a
 * card game happening on top of it.
 *
 * That is the lesson. A card table is not a surface to decorate. It is the
 * quietest object in the room, and everything good about how one looks comes
 * from the material — the depth of the dye, the nap of the wool, one lamp
 * above it — rather than from anything drawn on it. The five cards in the
 * middle are the picture. The table's whole job is to be a dark, well-made
 * thing they sit on, and to stay out of the way.
 *
 * So: two gold hairlines, struck concentric and thin, the way a real table
 * carries a betting line. They are at low opacity because they are inlay in
 * cloth, not paint. There is nothing in the middle, because that is where the
 * board lands. There are no words on it, because a table does not talk.
 */
function FeltArcanaBase() {
  return (
    <svg
      className="felt-arcana"
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden
      focusable="false"
    >
      {/* `non-scaling-stroke` so the line stays a hairline however wide the
          table is stretched — a scaled stroke comes out thin at the sides and
          fat at the top, which is how a drawn-on line gives itself away. */}
      <g fill="none" stroke="#e8b064" vectorEffect="non-scaling-stroke">
        <ellipse cx="500" cy="300" rx="408" ry="232" strokeWidth="1.6" opacity="0.26" />
        <ellipse cx="500" cy="300" rx="398" ry="225" strokeWidth="0.8" opacity="0.14" />
      </g>
    </svg>
  );
}

export const FeltArcana = memo(FeltArcanaBase);
