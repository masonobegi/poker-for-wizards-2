/**
 * Relics — permanent passives bought between antes. Where sigils are a verb,
 * relics are an adjective: they change what kind of poker you are playing for
 * the rest of the run.
 *
 * Every relic is a plain data record. The engine reads the fields it cares
 * about at fixed points, so no relic can smuggle in behaviour nobody can find.
 */
import type { MarkId } from './cards';
import type { RuleMods } from './hand';
import { Cat } from './hand';

export type RelicRarity = 'common' | 'rare' | 'mythic';

export interface RelicDef {
  id: string;
  name: string;
  glyph: string;
  rarity: RelicRarity;
  price: number;
  text: string;
  impossible: string;
  /** Folded into this owner's rule mods when their hand is scored. */
  mods?: RuleMods;
  mana?: { max?: number; regen?: number; start?: number };
  sigils?: { handSize?: number; drawPerHand?: number; costDelta?: number };
  /** Standing information advantages. */
  vision?: Array<'deck_top' | 'one_hole' | 'quantum_clouds' | 'all_mana'>;
  /** Paid out at showdown. */
  onWin?: { shards?: number; chipsPerBB?: number; requireCat?: Cat; requireImpossible?: boolean };
  /** Applied while dealing. */
  deal?: { quantumHole?: number; extraHole?: number; markOwn?: MarkId; sealRank?: 'high' | 'low' };
  economy?: { interestPct?: number; perFold?: number; onEliminate?: number };
}

export const RELICS: RelicDef[] = [
  // ------------------------------------------------------------------ COMMON
  {
    id: 'broken_compass', name: 'Broken Compass', glyph: '✥', rarity: 'common', price: 8,
    text: 'Your flushes need only four cards of a suit.',
    impossible: 'A flush that is not five cards, adjudicated consistently, forever.',
    mods: { flushSize: 4 },
  },
  {
    id: 'ouroboros', name: 'Ouroboros', glyph: '∮', rarity: 'common', price: 8,
    text: 'Aces bridge both ends. Queen-King-Ace-Two-Three is a straight.',
    impossible: 'A rank order with no beginning and no end.',
    mods: { wheelWrap: true },
  },
  {
    id: 'smeared_ink', name: 'Smeared Ink', glyph: '◐', rarity: 'common', price: 9,
    text: 'Hearts and Diamonds count as one suit. Spades and Clubs count as one suit.',
    impossible: 'Two suits occupying the same identity without reprinting the deck.',
    mods: { mergedColors: true },
  },
  {
    id: 'deep_well', name: 'Deep Well', glyph: '◇', rarity: 'common', price: 7,
    text: '+3 maximum mana.',
    impossible: 'Mana. There is no mana at a card table.',
    mana: { max: 3 },
  },
  {
    id: 'leyline', name: 'Leyline', glyph: '≋', rarity: 'common', price: 8,
    text: '+1 mana at the start of every street.',
    impossible: 'A resource that refills because time passed.',
    mana: { regen: 1 },
  },
  {
    id: 'deep_pockets', name: 'Deep Pockets', glyph: '⬒', rarity: 'common', price: 7,
    text: 'Hold one more sigil in hand.',
    impossible: 'Nothing — but it is the cheapest way to hold more impossibility at once.',
    sigils: { handSize: 1 },
  },
  {
    id: 'grave_interest', name: 'Grave Interest', glyph: '⚱', rarity: 'common', price: 8,
    text: 'Earn 1 shard every time you fold before the flop. Cowardice compounds.',
    impossible: 'Being paid for a hand you refused to play.',
    economy: { perFold: 1 },
  },
  {
    id: 'thin_veil', name: 'Thin Veil', glyph: '👁', rarity: 'common', price: 9,
    text: 'You always see the top card of the deck.',
    impossible: 'Standing knowledge of a card nobody has dealt.',
    vision: ['deck_top'],
  },

  // -------------------------------------------------------------------- RARE
  {
    id: 'crown_of_thieves', name: 'Crown of Thieves', glyph: '♛', rarity: 'rare', price: 14,
    text: 'Jacks and Queens may be read as Kings in your hands.',
    impossible: 'Three ranks collapsing into one, for one player only.',
    mods: { facesAreKings: true },
  },
  {
    id: 'unstable_isotope', name: 'Unstable Isotope', glyph: '⟁', rarity: 'rare', price: 15,
    text: 'One of your hole cards is dealt in superposition every hand.',
    impossible: 'Being dealt a card that has not decided what it is.',
    deal: { quantumHole: 1 },
  },
  {
    id: 'third_hand', name: 'Third Hand', glyph: '☗', rarity: 'rare', price: 18,
    text: 'You are dealt three hole cards instead of two.',
    impossible: 'Nothing — but it wrecks the maths, and the engine keeps up.',
    deal: { extraHole: 1 },
  },
  {
    id: 'the_informant', name: 'The Informant', glyph: '⚉', rarity: 'rare', price: 16,
    text: 'At every showdown-bound river, one random opponent hole card is revealed to you alone.',
    impossible: 'A leak with no leaker.',
    vision: ['one_hole'],
  },
  {
    id: 'cheap_tricks', name: 'Cheap Tricks', glyph: '⨭', rarity: 'rare', price: 15,
    text: 'All sigils cost 1 less mana, minimum 1.',
    impossible: 'Discounting a cost that is not made of anything.',
    sigils: { costDelta: -1 },
  },
  {
    id: 'the_collector', name: 'The Collector', glyph: '✦', rarity: 'rare', price: 14,
    text: 'Draw an extra sigil at the start of each hand.',
    impossible: 'A supply that regenerates from an empty table.',
    sigils: { drawPerHand: 1 },
  },
  {
    id: 'bloodline', name: 'Bloodline', glyph: '✚', rarity: 'rare', price: 16,
    text: 'One of your hole cards is Blooded each hand — it scores one rank higher.',
    impossible: 'A card worth more than its printed rank, and only in your hands.',
    deal: { markOwn: 'blooded' },
  },
  {
    id: 'mirror_shard', name: 'Mirror Shard', glyph: '⧉', rarity: 'rare', price: 15,
    text: 'You can read the possible faces of every superposed card on the table.',
    impossible: 'Seeing the shape of an uncertainty instead of its outcome.',
    vision: ['quantum_clouds'],
  },
  {
    id: 'the_ledger', name: 'The Ledger', glyph: '⌸', rarity: 'rare', price: 13,
    text: 'You see every opponent’s exact mana. Bluffs about sigils stop working on you.',
    impossible: 'Auditing a resource that is not physically present.',
    vision: ['all_mana'],
  },

  // ------------------------------------------------------------------ MYTHIC
  {
    id: 'the_impossible', name: 'The Impossible', glyph: '⬡', rarity: 'mythic', price: 26,
    text: 'Win with Five of a Kind, Flush House or Flush Five: take 8 shards and 2 big blinds from the bank.',
    impossible: 'The hands it pays out on do not exist in a physical deck at all.',
    onWin: { shards: 8, chipsPerBB: 2, requireImpossible: true },
  },
  {
    id: 'crowned', name: 'Crowned', glyph: '♔', rarity: 'mythic', price: 24,
    text: 'Every King in play is dealt face down and stays that way until showdown — for everyone.',
    impossible: 'The deck reading a card before dealing it, then hiding it from itself.',
    deal: { sealRank: 'high' },
  },
  {
    id: 'reversal', name: 'Reversal', glyph: '⇅', rarity: 'mythic', price: 28,
    text: 'The worst hand wins every pot you are contesting.',
    impossible: 'A comparison operator you can buy.',
    mods: { lowWins: true },
  },
  {
    id: 'moneylender', name: 'Moneylender', glyph: '⚜', rarity: 'mythic', price: 22,
    text: '15% interest on your shards between antes, rounded up.',
    impossible: 'Compound interest arriving between two hands of cards.',
    economy: { interestPct: 15 },
  },
  {
    id: 'kingmaker', name: 'Kingmaker', glyph: '☠', rarity: 'mythic', price: 25,
    text: 'When a player is eliminated, take 10 shards and half of what they were holding.',
    impossible: 'Inheriting something that was never on the table.',
    economy: { onEliminate: 10 },
  },
  {
    id: 'apotheosis', name: 'Apotheosis', glyph: '✺', rarity: 'mythic', price: 30,
    text: 'Your hand is scored one category higher. Always.',
    impossible: 'Being handed a better hand than the one you were dealt.',
    mods: { categoryShift: 1 },
  },
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(
  RELICS.map((r) => [r.id, r]),
);

export const RELIC_RARITY_COLOR: Record<RelicRarity, string> = {
  common: '#93a3b8',
  rare: '#6ec8ff',
  mythic: '#ffb347',
};

/** Collapse a player's relics into one set of rule mods. */
export function mergeRelicMods(relicIds: string[]): RuleMods {
  const out: RuleMods = {};
  for (const id of relicIds) {
    const m = RELIC_BY_ID[id]?.mods;
    if (!m) continue;
    if (m.mergedColors) out.mergedColors = true;
    if (m.wheelWrap) out.wheelWrap = true;
    if (m.lowWins) out.lowWins = true;
    if (m.facesAreKings) out.facesAreKings = true;
    if (m.flushSize !== undefined) out.flushSize = Math.min(out.flushSize ?? 5, m.flushSize);
    if (m.straightSize !== undefined) out.straightSize = Math.min(out.straightSize ?? 5, m.straightSize);
    if (m.categoryShift) out.categoryShift = (out.categoryShift ?? 0) + m.categoryShift;
  }
  return out;
}

export function relicNumber(relicIds: string[], pick: (r: RelicDef) => number | undefined): number {
  let total = 0;
  for (const id of relicIds) {
    const v = pick(RELIC_BY_ID[id] ?? ({} as RelicDef));
    if (typeof v === 'number') total += v;
  }
  return total;
}

export function hasVision(relicIds: string[], v: NonNullable<RelicDef['vision']>[number]): boolean {
  return relicIds.some((id) => RELIC_BY_ID[id]?.vision?.includes(v));
}
