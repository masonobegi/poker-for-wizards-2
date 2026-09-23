import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';

/**
 * The pot, as money.
 *
 * It used to be a text pill on bare felt: the largest number on the table,
 * rendered smaller than a player's name, with nothing physical anywhere on the
 * screen. Poker is a game about a pile of money in the middle, and there was
 * no pile.
 *
 * The count is derived from the pot in big blinds rather than from the raw
 * chip total, because the blinds climb every few hands and a raw total would
 * mean every pot late in a run looked identical — pinned at the cap from ante
 * three onward. In blinds, "this is a big pot" means the same thing at ante
 * one and ante six.
 *
 * Denominations are the point. A pot that has grown past twenty-five blinds
 * starts showing gold, so the colour of the pile tells you the size of the
 * decision before you have read a digit.
 */

/** Beyond this the stacks stop being countable and start being clutter. */
const MAX_CHIPS = 15;
const PER_STACK = 5;

/**
 * How many chips, and in what colours, for a pot of this size.
 *
 * The count grows with the square root of the pot in big blinds, not with a
 * greedy denomination decomposition. Decomposing the way a real dealer would
 * is authentic and visually backwards: four big blinds comes out as four
 * one-blind chips and twenty-five comes out as a single twenty-five chip, so
 * a pot six times larger renders as a smaller pile. The pile has one job —
 * to say "this is a big pot" before the number is read — and it cannot do
 * that unless it only ever grows.
 *
 * Colour still carries denomination. A pot past five blinds starts showing
 * violet and past twenty-five starts showing gold, so the pile shifts hue as
 * the decision gets more expensive.
 */
export function chipsFor(pot: number, bb: number): string[] {
  if (pot <= 0 || bb <= 0) return [];
  const potBB = pot / bb;

  const count = Math.max(1, Math.min(MAX_CHIPS, Math.round(Math.sqrt(potBB) * 1.2)));

  const highs = potBB >= 25 ? Math.min(count, Math.max(1, Math.round(count * 0.55))) : 0;
  const mids = potBB >= 5 ? Math.min(count - highs, Math.max(1, Math.round(count * 0.3))) : 0;
  const lows = count - highs - mids;

  // Bottom of the pile first, so the brightest chips end up on top.
  return [
    ...Array<string>(lows).fill('is-low'),
    ...Array<string>(mids).fill('is-mid'),
    ...Array<string>(highs).fill('is-high'),
  ];
}

export default memo(function PotChips({ pot, bb }: { pot: number; bb: number }) {
  const stacks = useMemo(() => {
    const chips = chipsFor(pot, bb);
    const cols: string[][] = [];
    // Highest denominations go to the middle stack, so the pile reads tallest
    // and brightest at its centre the way a real one does.
    for (let i = 0; i < chips.length; i++) {
      const col = i % Math.max(1, Math.ceil(chips.length / PER_STACK));
      (cols[col] ??= []).push(chips[i]);
    }
    return cols;
  }, [pot, bb]);

  if (stacks.length === 0) return null;

  return (
    <div className="potchips" aria-hidden>
      {stacks.map((stack, si) => (
        <div className="potchips-stack" key={si}>
          {stack.map((cls, ci) => (
            <motion.span
              key={`${si}-${ci}`}
              className={`potchip ${cls}`}
              initial={{ opacity: 0, y: -14, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                type: 'spring',
                stiffness: 460,
                damping: 26,
                // Chips land one after another rather than all at once, so a
                // pot growing reads as chips being pushed in.
                delay: Math.min(0.24, ci * 0.035 + si * 0.015),
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
});
