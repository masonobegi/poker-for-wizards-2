/**
 * Words for why a sigil cannot be cast.
 *
 * A rail of greyed-out spells with no reason reads as a broken game: at
 * pre-flop with five mana, a 2-cost counterspell and a 4-cost flop spell
 * were both grey, indistinguishable from each other and from "you cannot
 * afford this". The server says which rule is in the way (`CastBlock`); this
 * turns it into a label short enough for the card at Steam Deck width, and a
 * sentence for the tooltip.
 */
import type { CastBlock, Phase } from '@shared/types';
import type { Timing } from '@shared/sigils';

export interface BlockLabel {
  /** Fits across a sigil tile at 1280x800 — keep it under ~16 characters. */
  short: string;
  /** The full sentence, for the tooltip and the accessible name. */
  long: string;
  /**
   * `mana` is the one reason that fixes itself as the hand goes on, so it is
   * drawn differently from a rule that is in the way.
   */
  kind: 'mana' | 'rule';
}

const STREET_ORDER = ['preflop', 'flop', 'turn', 'river'] as const;
type Street = (typeof STREET_ORDER)[number];
const STREET_NAME: Record<Street, string> = {
  preflop: 'pre-flop', flop: 'flop', turn: 'turn', river: 'river',
};
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The window a sigil's timing allows, in the fewest words. `deal` counts as
 * pre-flop and `showdown` as the river — to a player those are the edges of
 * the same street.
 */
export function windowLabel(timing: Timing[]): { short: string; long: string } {
  const idx = new Set<number>();
  for (const t of timing) {
    if (t === 'deal') idx.add(0);
    else if (t === 'showdown') idx.add(3);
    else if (t === 'any') { idx.add(0); idx.add(1); idx.add(2); idx.add(3); }
    else {
      const i = STREET_ORDER.indexOf(t as Street);
      if (i >= 0) idx.add(i);
    }
  }
  const sorted = [...idx].sort((a, b) => a - b);
  if (sorted.length === 0) return { short: 'Not now', long: 'It cannot be cast at this point in the hand.' };
  const first = STREET_ORDER[sorted[0]];
  const last = STREET_ORDER[sorted[sorted.length - 1]];
  const contiguous = sorted[sorted.length - 1] - sorted[0] === sorted.length - 1;

  if (sorted.length === 4) return { short: 'During a street', long: 'It can only be cast while a street is being played.' };
  if (sorted.length === 1) {
    return { short: `${cap(STREET_NAME[first])} only`, long: `It can only be cast on the ${STREET_NAME[first]}.` };
  }
  if (contiguous && last === 'river') {
    return { short: `From the ${STREET_NAME[first]}`, long: `It can be cast from the ${STREET_NAME[first]} onward.` };
  }
  if (contiguous && first === 'preflop') {
    return { short: `Until the ${STREET_NAME[last]}`, long: `It can be cast from pre-flop up to the ${STREET_NAME[last]}.` };
  }
  const names = sorted.map((i) => STREET_NAME[STREET_ORDER[i]]);
  const list = names.length === 2 ? names.join(' & ') : `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
  return { short: cap(list), long: `It can only be cast on the ${list}.` };
}

export function blockLabel(block: CastBlock, timing: Timing[], phase: Phase): BlockLabel {
  switch (block.why) {
    case 'mana':
      return { short: `Needs ${block.need} mana`, long: `Needs ${block.need} mana — it arrives each street.`, kind: 'mana' };
    case 'response':
      return { short: 'Responses only', long: 'A response: it can only be cast while another sigil is on the stack.', kind: 'rule' };
    case 'stack':
      return { short: 'Stack is open', long: 'A spell is on the stack — only a response can be cast until it resolves.', kind: 'rule' };
    case 'responded':
      return { short: 'Answered', long: 'You have already answered this spell.', kind: 'rule' };
    case 'out':
      return { short: 'Out of the hand', long: 'You are out of this hand.', kind: 'rule' };
    case 'off':
      return { short: 'Magic is off', long: 'Magic is disabled at this table.', kind: 'rule' };
    case 'timing': {
      const w = windowLabel(timing);
      // An "any street" sigil blocked on timing is only waiting for play to
      // resume (the deal, the payout); naming the streets would be true and
      // no help.
      if (timing.includes('any')) {
        return { short: 'Between streets', long: `Not during ${phase === 'deal' ? 'the deal' : 'this break'}. ${w.long}`, kind: 'rule' };
      }
      return { short: w.short, long: w.long, kind: 'rule' };
    }
  }
}
