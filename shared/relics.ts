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

  // --------------------------------------------------------------- COMMON II
  // A second pass. Everything below is built from fields the engine already
  // reads, because a relic that needs new engine code is a sigil wearing the
  // wrong hat — and because the thinnest part of this game was never its
  // machinery, it was how many different runs the machinery could produce.
  {
    id: 'split_focus', name: 'Split Focus', glyph: '⑂', rarity: 'common', price: 8,
    text: 'Draw one extra sigil at the start of every hand.',
    impossible: 'Being dealt more of a thing the deck does not contain.',
    sigils: { drawPerHand: 1 },
  },
  {
    id: 'thrift', name: 'Thrift', glyph: '⊖', rarity: 'common', price: 10,
    text: 'Every sigil you cast costs one less mana, to a minimum of one.',
    impossible: 'A discount on a currency that does not exist.',
    sigils: { costDelta: -1 },
  },
  {
    id: 'open_palm', name: 'Open Palm', glyph: '☖', rarity: 'common', price: 7,
    text: 'Start every hand with 2 mana already in hand.',
    impossible: 'Beginning a hand mid-thought.',
    mana: { start: 2 },
  },
  {
    id: 'ladder', name: "The Ladder", glyph: '☰', rarity: 'common', price: 9,
    text: 'Your straights need only four cards in sequence.',
    impossible: 'A straight that is not five cards, and everyone agreeing to it.',
    mods: { straightSize: 4 },
  },
  {
    id: 'gilt_edge', name: 'Gilt Edge', glyph: '▤', rarity: 'common', price: 8,
    text: 'One of your hole cards is Blooded every hand — it scores a rank higher.',
    impossible: 'A card worth more than its face, every time it is dealt.',
    deal: { markOwn: 'blooded' },
  },

  // ----------------------------------------------------------------- RARE II
  {
    id: 'twin_suns', name: 'Twin Suns', glyph: '☀', rarity: 'rare', price: 15,
    text: 'You are dealt three hole cards instead of two.',
    impossible: 'A hand size that is not the hand size everybody else has.',
    deal: { extraHole: 1 },
  },
  {
    id: 'unsettled', name: 'Unsettled', glyph: '⟁', rarity: 'rare', price: 14,
    text: 'One of your hole cards arrives undecided each hand, holding two faces until showdown.',
    impossible: 'Being dealt a card that has not finished being a card.',
    deal: { quantumHole: 1 },
  },
  {
    id: 'the_usurer', name: 'The Usurer', glyph: '⌬', rarity: 'rare', price: 14,
    text: '15% interest on unspent shards between antes.',
    impossible: 'Nothing, which is why it is the only honest thing in the Market.',
    economy: { interestPct: 15 },
  },
  {
    id: 'cold_read', name: 'Cold Read', glyph: '◎', rarity: 'rare', price: 16,
    text: 'You can see one hole card of every player at the table.',
    impossible: 'Seeing through the back of a card, continuously, without anybody being able to stop it.',
    vision: ['one_hole'],
  },
  {
    id: 'the_gambler', name: 'The Gambler', glyph: '✧', rarity: 'rare', price: 15,
    text: 'Win a pot with two pair or better and take 4 shards.',
    impossible: 'Being paid a second time, by nobody, for the same hand.',
    onWin: { shards: 4, requireCat: 2 },
  },
  {
    id: 'low_road', name: 'The Low Road', glyph: '⊼', rarity: 'rare', price: 17,
    text: 'Jacks and Queens may be read as Kings in your hand.',
    impossible: 'Three ranks sharing one identity for one player only.',
    mods: { facesAreKings: true },
  },

  // --------------------------------------------------------------- MYTHIC II
  {
    id: 'the_archive', name: 'The Archive', glyph: '⛁', rarity: 'mythic', price: 28,
    text: 'You see the top of the deck, the mana of every player, and the shape of every undecided card.',
    impossible: 'Knowing everything that is about to happen and still having to bet on it.',
    vision: ['deck_top', 'all_mana', 'quantum_clouds'],
  },
  {
    id: 'the_hoard', name: 'The Hoard', glyph: '⬢', rarity: 'mythic', price: 26,
    text: '+4 maximum mana, +1 regen, and one more sigil in hand.',
    impossible: 'Carrying more of an imaginary substance than the table can hold.',
    mana: { max: 4, regen: 1 },
    sigils: { handSize: 1 },
  },
  {
    id: 'the_long_game', name: 'The Long Game', glyph: '♾', rarity: 'mythic', price: 29,
    text: 'Every card scores one rank higher for each pot it has already won, and your flushes need four.',
    impossible: 'A deck that keeps score of itself between hands.',
    mods: { memoryBonus: true, flushSize: 4 },
  },

  // ------------------------------------------------------- THE SECOND SHELF
  // Two of these (Gilded Thumb, Wild Inheritance) exist to make the game's
  // own name reachable: a measured session produced no impossible hand at
  // all, because every route to one ran through a single uncommon mark.
  {
    id: 'crooked_ladder', name: 'Crooked Ladder', glyph: '↯', rarity: 'common', price: 9,
    text: 'Your straights need only four cards in a row.',
    impossible: 'A sequence that is shorter for you than for the person beside you.',
    mods: { straightSize: 4 },
  },
  {
    id: 'full_purse', name: 'Full Purse', glyph: '◕', rarity: 'common', price: 8,
    text: 'You begin every hand with three mana already in the pool.',
    impossible: 'Starting a hand owed something by the previous one.',
    mana: { start: 3 },
  },
  {
    id: 'pauper_stone', name: 'Pauper’s Stone', glyph: '◧', rarity: 'common', price: 7,
    text: 'Your lowest hole card is dealt sealed. Nobody can target what nobody can name.',
    impossible: 'A card face-down to the table and face-up to its owner.',
    deal: { sealRank: 'low' },
  },
  {
    id: 'heirloom', name: 'Heirloom', glyph: '⌘', rarity: 'common', price: 9,
    text: 'Every card scores one rank higher for each pot it has already won you.',
    impossible: 'Card stock that remembers.',
    mods: { memoryBonus: true },
  },
  {
    id: 'gilded_thumb', name: 'Gilded Thumb', glyph: '◉', rarity: 'rare', price: 13,
    text: 'One of your hole cards is Prism every hand — it counts as any suit you need.',
    impossible: 'A card with four suits printed in the same corner.',
    deal: { markOwn: 'prism' },
  },
  {
    id: 'high_roller', name: 'High Roller', glyph: '△', rarity: 'rare', price: 12,
    text: 'Every pot you win pays you an extra two big blinds from nowhere.',
    impossible: 'A pot larger than what was put into it.',
    onWin: { chipsPerBB: 2 },
  },
  {
    id: 'the_understudy', name: 'The Understudy', glyph: '☷', rarity: 'mythic', price: 18,
    text: 'You draw an extra sigil every hand, and you may hold one more.',
    impossible: 'A second hand behind the one everyone can see.',
    sigils: { drawPerHand: 1, handSize: 1 },
  },
  {
    id: 'wild_inheritance', name: 'Wild Inheritance', glyph: '✹', rarity: 'mythic', price: 20,
    text: 'One of your hole cards is Wild every hand. Any rank, any suit, whatever the hand needs.',
    impossible: 'A card that is every card, dealt to the same person every time.',
    deal: { markOwn: 'wild' },
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
