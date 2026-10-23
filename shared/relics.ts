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

/**
 * Rules the engine runs for a relic or a coven's creed, at a named point in
 * the hand. Each one is read in exactly one place, named beside it:
 *
 *   keepsake      engine.ts   fold before the flop; the deal gives the card back
 *   second_river  engine.ts   dealStreet, the river
 *   sanctum       table.ts    castBlock; magic.ts validateTargets
 *   magpie        magic.ts    a counter (Nullify, a Toll that fizzles)
 *   blood_price   table.ts    castBlock; magic.ts castSigil
 *   vow           table.ts    castBlock; magic.ts castSigil
 *   lodestone     engine.ts   dealHoleCards; table.ts modsFor
 *   twice_told    magic.ts    castSigil, resolveStack
 *   usurper       engine.ts   endHand, an elimination
 *   last_word     engine.ts   beginHand, before the draws
 *   many_futures  magic.ts    superposeCard
 *   tells         engine.ts   applyAction, a bet or raise
 *   foreknown     engine.ts   dealStreet, the flop
 *   salt          magic.ts    burn
 *   signature     magic.ts    inscribe, first_draft; shop.ts a rite
 */
export type RuleId =
  | 'keepsake' | 'second_river' | 'sanctum' | 'magpie' | 'blood_price' | 'vow'
  | 'lodestone' | 'twice_told' | 'usurper'
  | 'last_word' | 'many_futures' | 'tells' | 'foreknown' | 'salt' | 'signature';

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
  /**
   * one_hole: The Informant's peek at one opponent card at a showdown-bound
   * river. every_hole: one hole card of every opponent, from the deal.
   */
  vision?: Array<'deck_top' | 'one_hole' | 'every_hole' | 'quantum_clouds' | 'all_mana'>;
  /**
   * Paid out at showdown. `engrave` writes that mark, for good, onto one
   * unmarked card of the winning hand (The Engraver).
   */
  onWin?: { shards?: number; chipsPerBB?: number; requireCat?: Cat; requireImpossible?: boolean; engrave?: MarkId };
  /** Applied while dealing. */
  deal?: { quantumHole?: number; extraHole?: number; markOwn?: MarkId; sealRank?: 'high' | 'low' };
  economy?: { interestPct?: number; perFold?: number; onEliminate?: number };
  /** A rule the engine runs at one named point (see RuleId). */
  rule?: RuleId;
  /** Set on a coven's creed: never sold, never inherited, owned from the first hand. */
  coven?: string;
}

const KEPT: RelicDef[] = [
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
    text: 'One of your hole cards is dealt undecided every hand — two faces until showdown.',
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
    id: 'cheap_tricks', name: 'Cheap Tricks', glyph: '⨭', rarity: 'rare', price: 13,
    text: 'Sigils cost 2 less mana, minimum 1, but your mana ceiling is 3 lower.',
    impossible: 'Discounting a cost that is not made of anything.',
    sigils: { costDelta: -2 },
    mana: { max: -3 },
  },
  {
    id: 'the_collector', name: 'The Collector', glyph: '✦', rarity: 'rare', price: 13,
    text: 'Draw two extra sigils at the start of each hand, but every sigil costs 1 more mana.',
    impossible: 'A supply that regenerates from an empty table.',
    sigils: { drawPerHand: 2, costDelta: 1 },
  },
  {
    id: 'bloodline', name: 'Bloodline', glyph: '✚', rarity: 'rare', price: 12,
    text: 'One of your hole cards is Echo each hand — it scores one rank higher for every pot it has ever won.',
    impossible: 'A card that remembers its wins, and only in your hands.',
    deal: { markOwn: 'echo' },
  },
  {
    id: 'mirror_shard', name: 'Mirror Shard', glyph: '⧉', rarity: 'rare', price: 15,
    text: 'You can read both faces of every undecided card on the table.',
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
    id: 'moneylender', name: 'Moneylender', glyph: '⚜', rarity: 'mythic', price: 20,
    text: '25% interest on your shards between antes, rounded up.',
    impossible: 'Compound interest arriving between two hands of cards.',
    economy: { interestPct: 25 },
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
    id: 'twin_suns', name: 'Twin Suns', glyph: '☀', rarity: 'rare', price: 12,
    text: 'You are dealt three hole cards instead of two, but draw one sigil fewer each hand.',
    impossible: 'A hand size that is not the hand size everybody else has.',
    deal: { extraHole: 1 },
    sigils: { drawPerHand: -1 },
  },
  {
    id: 'unsettled', name: 'Unsettled', glyph: '⟁', rarity: 'rare', price: 16,
    text: 'Both of your hole cards arrive undecided each hand, each holding two faces until showdown.',
    impossible: 'Being dealt a hand that has not finished being a hand.',
    deal: { quantumHole: 2 },
  },
  {
    id: 'cold_read', name: 'Cold Read', glyph: '◎', rarity: 'rare', price: 16,
    text: 'You can see one hole card of every player at the table.',
    impossible: 'Seeing through the back of a card, continuously, without anybody being able to stop it.',
    // It said this and did The Informant's river peek instead (found
    // 2026-10-10, test/relics.test.ts): now it does what it says.
    vision: ['every_hole'],
  },

  // --------------------------------------------------------------- MYTHIC II
  {
    id: 'the_archive', name: 'The Archive', glyph: '⛁', rarity: 'mythic', price: 28,
    text: 'You see the top of the deck, the mana of every player, and the shape of every undecided card.',
    impossible: 'Knowing everything that is about to happen and still having to bet on it.',
    vision: ['deck_top', 'all_mana', 'quantum_clouds'],
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
    id: 'crooked_ladder', name: 'Crooked Ladder', glyph: '↯', rarity: 'rare', price: 14,
    text: 'Your straights need only four cards in a row, and Aces bridge both ends.',
    impossible: 'A sequence that is shorter for you than for the person beside you, and bends.',
    mods: { straightSize: 4, wheelWrap: true },
  },
  {
    id: 'pauper_stone', name: 'Pauper’s Stone', glyph: '◧', rarity: 'common', price: 7,
    text: 'Your lowest hole card is dealt sealed. Nobody can target what nobody can name.',
    impossible: 'A card face-down to the table and face-up to its owner.',
    deal: { sealRank: 'low' },
  },
  {
    id: 'heirloom', name: 'Heirloom', glyph: '⌘', rarity: 'common', price: 9,
    text: 'Every card scores one rank higher for each pot it has already won, whoever won it.',
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
    id: 'wild_inheritance', name: 'Wild Inheritance', glyph: '✹', rarity: 'mythic', price: 20,
    text: 'One of your hole cards is Wild every hand. Any rank, any suit, whatever the hand needs.',
    impossible: 'A card that is every card, dealt to the same person every time.',
    deal: { markOwn: 'wild' },
  },
];

// ------------------------------------------------------------ THE RULE SHELF
// Round 4 of the fun pass (FUN-REVIEW.md, 2026-10-10). The review's veteran
// said "relics are mostly +1s", and the rubric scored it: of 45 relics, 19
// were a number on a passive (more mana, more draws, a cheaper sigil, shards
// for folding), and two of those (Open Palm, Full Purse) were never read by
// the engine at all. What the genre remembers are the relics that change
// what a hand is or how a street plays: Balatro's Shortcut, Four Fingers and
// Ancient Joker, Slay the Spire's Necronomicon and Runic Pyramid, MTG's
// hexproof, Phyrexian mana and "can't be countered".
//
// These twelve take the places of the twelve flattest numbers, one rarity
// for one rarity, so the shelf stays 45 and its mix of commons, rares and
// mythics is unchanged. Each line above a relic is why a player of the genre
// wants it. RULE_RELICS = false puts the twelve numbers back.
const RULES: RelicDef[] = [
  // Balatro's Shortcut: the hand-definition joker veterans build around. It
  // changes which draws are worth a call.
  {
    id: 'stepping_stones', name: 'Stepping Stones', glyph: '⋯', rarity: 'common', price: 8,
    text: 'Your straights may skip one rank: Five, Six, Eight, Nine, Ten is a straight.',
    impossible: 'A sequence with a hole in it that still counts as unbroken.',
    mods: { straightGap: true },
  },
  // Slay the Spire's Runic Pyramid (keep what you would discard): folding
  // before the flop stops being only a loss and becomes a plan.
  {
    id: 'keepsake', name: 'The Keepsake', glyph: '⚘', rarity: 'common', price: 7,
    text: 'Fold before the flop and you keep your higher hole card: it is dealt back to you next hand.',
    impossible: 'A card leaving the deck between hands and finding its way back to the same pair of hands.',
    rule: 'keepsake',
  },
  // A reroll on a miss, paid for with a tell: the whole table watches the
  // river run again and knows you had nothing. Power with an information cost.
  {
    id: 'second_river', name: 'The Second River', glyph: '⥮', rarity: 'common', price: 8,
    text: 'Once a hand, if the river leaves you with nothing better than High Card, it is dealt again, in front of everyone.',
    impossible: 'A river that runs twice because one player did not like it.',
    rule: 'second_river',
  },
  // MTG's hexproof, with the cost Slay the Spire's boss relics teach: you
  // cannot be touched, and you cannot touch anyone.
  {
    id: 'sanctum', name: 'The Sanctum', glyph: '⛫', rarity: 'common', price: 9,
    text: 'No opponent’s sigil can target you or your hole cards. None of yours can target an opponent.',
    impossible: 'A pair of hands the rest of the table’s magic cannot find.',
    rule: 'sanctum',
  },
  // Balatro's synergy jokers: one piece that turns a common thing (a Prism
  // from a rite, an omen, Gild or The Engraver) into the best thing.
  {
    id: 'prism_lens', name: 'The Prism Lens', glyph: '⟡', rarity: 'common', price: 9,
    text: 'Every Prism card is fully Wild for you: any rank, any suit.',
    impossible: 'Seeing four suits in a card and deciding it could be anything at all.',
    mods: { prismIsWild: true },
  },
  // MTG's Commandeer and Spelljack: on a stack, stealing the spell you just
  // answered is the best feeling the format has. Holding Nullify becomes a bet.
  {
    id: 'magpie', name: 'The Magpie', glyph: '⚲', rarity: 'rare', price: 14,
    text: 'When you counter a sigil, it comes to your hand instead of vanishing.',
    impossible: 'Catching a spell in mid-air and keeping it.',
    rule: 'magpie',
  },
  // Balatro's Midas Mask and Hiker: jokers that rewrite the deck as you play.
  // The deck is shared, so the Market's tension comes with it.
  {
    id: 'the_engraver', name: 'The Engraver', glyph: '⌖', rarity: 'rare', price: 14,
    text: 'Win a showdown and one unmarked card of your winning hand is engraved Prism, for good. The deck is shared.',
    impossible: 'Leaving your mark on a card nobody owns.',
    onWin: { engrave: 'prism' },
  },
  // MTG's Phyrexian mana and the Ironclad's life-for-power: in poker your
  // chips are your life, and now they are also your mana.
  {
    id: 'blood_price', name: 'The Blood Price', glyph: '⚕', rarity: 'rare', price: 12,
    text: 'Short of mana for a sigil on your turn? Pay the rest in chips: one big blind for each missing mana.',
    impossible: 'Spending money on something that is not for sale.',
    rule: 'blood_price',
  },
  // MTG's "can't be countered", with a boss relic's price: nobody answers
  // your spells, and you never answer theirs.
  {
    id: 'vow_of_silence', name: 'Vow of Silence', glyph: '⊝', rarity: 'rare', price: 13,
    text: 'Your sigils cannot be countered. You can never cast a response.',
    impossible: 'A spell nobody can answer, from someone who never answers anything.',
    rule: 'vow',
  },
  // Balatro's Ancient Joker and The Idol: a target that moves every hand
  // makes every hand a new puzzle, and wild cards are the genre's best toy.
  {
    id: 'lodestone', name: 'The Lodestone', glyph: '⊛', rarity: 'mythic', price: 24,
    text: 'Each hand a rank is drawn for you, in front of the table. Every card of that rank is Wild for you, that hand.',
    impossible: 'Thirteen ranks taking turns being every card.',
    rule: 'lodestone',
  },
  // Slay the Spire's Necronomicon and Balatro's retriggers: doubling your
  // best spell makes the order you cast in the decision.
  {
    id: 'twice_told', name: 'Twice-Told', glyph: '⁂', rarity: 'mythic', price: 26,
    text: 'The first sigil you cast each hand resolves twice.',
    impossible: 'Saying a thing once and having it happen twice.',
    rule: 'twice_told',
  },
  // Kingmaker paid shards for a knockout. This pays in what the genre's
  // players actually covet: the other player's build.
  {
    id: 'the_usurper', name: 'The Usurper', glyph: '♚', rarity: 'mythic', price: 22,
    text: 'Knock a player out of the run and every relic they held is yours.',
    impossible: 'Inheriting another player’s impossibilities.',
    rule: 'usurper',
  },
];

/** The twelve numbers RULES replaced, kept so the change is one constant. */
const RETIRED: RelicDef[] = [
  {
    id: 'deep_well', name: 'Deep Well', glyph: '◇', rarity: 'common', price: 7,
    text: '+3 maximum mana.',
    impossible: 'Mana. There is no mana at a card table.',
    mana: { max: 3 },
  },
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
    id: 'full_purse', name: 'Full Purse', glyph: '◕', rarity: 'common', price: 8,
    text: 'You begin every hand with three mana already in the pool.',
    impossible: 'Starting a hand owed something by the previous one.',
    mana: { start: 3 },
  },
  {
    id: 'the_usurer', name: 'The Usurer', glyph: '⌬', rarity: 'rare', price: 14,
    text: '15% interest on unspent shards between antes.',
    impossible: 'Nothing, which is why it is the only honest thing in the Market.',
    economy: { interestPct: 15 },
  },
  {
    id: 'low_road', name: 'The Low Road', glyph: '⊼', rarity: 'rare', price: 12,
    text: 'Earn 2 shards every time you fold before the flop.',
    impossible: 'Being paid twice for a hand you refused to play.',
    economy: { perFold: 2 },
  },
  {
    id: 'the_gambler', name: 'The Gambler', glyph: '✧', rarity: 'rare', price: 15,
    text: 'Win a pot with two pair or better and take 4 shards.',
    impossible: 'Being paid a second time, by nobody, for the same hand.',
    onWin: { shards: 4, requireCat: 2 },
  },
  {
    id: 'high_roller', name: 'High Roller', glyph: '△', rarity: 'rare', price: 12,
    text: 'Every pot you win pays you an extra two big blinds from nowhere.',
    impossible: 'A pot larger than what was put into it.',
    onWin: { chipsPerBB: 2 },
  },
  {
    id: 'the_hoard', name: 'The Hoard', glyph: '⬢', rarity: 'mythic', price: 26,
    text: '+4 maximum mana, +1 regen, and one more sigil in hand.',
    impossible: 'Carrying more of an imaginary substance than the table can hold.',
    mana: { max: 4, regen: 1 },
    sigils: { handSize: 1 },
  },
  {
    id: 'the_understudy', name: 'The Understudy', glyph: '☷', rarity: 'mythic', price: 18,
    text: 'You draw an extra sigil every hand, and you may hold one more.',
    impossible: 'A second hand behind the one everyone can see.',
    sigils: { drawPerHand: 1, handSize: 1 },
  },
  {
    id: 'kingmaker', name: 'Kingmaker', glyph: '☠', rarity: 'mythic', price: 25,
    text: 'When a player is eliminated, take 10 shards and half of what they were holding.',
    impossible: 'Inheriting something that was never on the table.',
    economy: { onEliminate: 10 },
  },
];

/** The rule shelf (true) or the twelve numbers it replaced (false). */
export const RULE_RELICS = true;

/** The Market's shelf: 45 relics, the store page's count. */
export const RELICS: RelicDef[] = [...KEPT, ...(RULE_RELICS ? RULES : RETIRED)];

// ------------------------------------------------------------------ CREEDS
// One whole-run rule per coven (round 4, FUN-REVIEW.md). A coven used to be
// two opening sigils, a relic and a lean, and the rubric's verdict was that a
// lean is not a deck: Balatro's decks and Slay the Spire's characters each
// change a rule for the whole run. A creed is a relic the coven owns from the
// first hand; the Market never sells one and the Usurper cannot take one.
// The coven that owns each is in shared/covens.ts (COVEN_CREEDS switches all
// seven off).
export const CREEDS: RelicDef[] = [
  // The Unaligned's first creed was Providence (draws ignore rarity, "whatever
  // the deck feels like giving you"). Measured on 70 Unaligned runs each way
  // it cost them: an impossible hand of their own in 17% of runs against 31%
  // without it, and a first-ante bust in 23% against 14%, because a flat
  // draw is mostly rares and mythics and few of the cheap commons (Wild Rite,
  // Mirror, Nullify) a hand is built from. It was cut. The Unaligned's kit is
  // a counterspell, so their creed is that they always hold one. Its first
  // version took a draw's place in a full hand; the Nullify now comes on top
  // (FUN-REVIEW.md, round 4, has the measurements).
  {
    id: 'creed_last_word', name: 'The Last Word', glyph: '⊘', rarity: 'mythic', price: 0, coven: 'unaligned',
    text: 'Begin a hand without a counterspell and a Nullify comes to you, even into a full hand.',
    impossible: 'A spare answer that turns up in your hand every time you run out of them.',
    rule: 'last_word',
  },
  {
    id: 'creed_many_futures', name: 'Many Futures', glyph: '⟁', rarity: 'mythic', price: 0, coven: 'unmoored',
    text: 'A card in your hand that goes undecided holds three faces, not two.',
    impossible: 'Three futures folded into one piece of card.',
    rule: 'many_futures',
  },
  {
    id: 'creed_tells', name: 'Tells', glyph: '☾', rarity: 'mythic', price: 0, coven: 'quiet',
    text: 'The first time each opponent bets or raises in a hand, you see one of their hole cards.',
    impossible: 'Reading a card through the back of a bet.',
    rule: 'tells',
  },
  {
    id: 'creed_foreknown', name: 'Foreknown', glyph: '⧖', rarity: 'mythic', price: 0, coven: 'long_now',
    text: 'When the flop is dealt, you see the river.',
    impossible: 'A card you have seen before it exists.',
    rule: 'foreknown',
  },
  {
    id: 'creed_kin', name: 'Kin', glyph: '∞', rarity: 'mythic', price: 0, coven: 'twinned',
    text: 'When two community cards share a face (a Mirror, a mirrored card), the copy is Wild for you.',
    impossible: 'A copy that knows it is a copy, and stops pretending.',
    mods: { copiesWild: true },
  },
  {
    id: 'creed_salt', name: 'Salt', glyph: '🜂', rarity: 'mythic', price: 0, coven: 'ashen',
    text: 'A community card you burn takes its rank with it: that rank is struck from every hand for the rest of the hand.',
    impossible: 'Burning a card and the idea of it.',
    rule: 'salt',
  },
  {
    id: 'creed_signature', name: 'Signature', glyph: '⊞', rarity: 'mythic', price: 0, coven: 'loom',
    text: 'A Wild, Prism, Blooded or Echo you write works only for you. In anyone else’s hand the card is plain.',
    impossible: 'Ink that only shows for the hand that wrote it.',
    rule: 'signature',
  },
];

/**
 * The relics actually sold.
 *
 * Forty-five, and four of them were "your straights need only four cards"
 * with different names. Twelve stay: five commons, five rares and two
 * mythics, which is the shop's own weighting, and no two of them do the
 * same thing. The rest are still defined — a run saved under an older
 * version still reads its relics — but the Market never offers them.
 */
export const RELIC_POOL_IDS: readonly string[] = [
  // Common — a small, legible edge.
  'leyline',           // +1 mana a street: where mana comes from
  'deep_pockets',      // one more sigil in hand
  'thin_veil',         // you always see the top of the deck
  'ladder',            // your straights need four
  'gilt_edge',         // a hole card scores a rank higher
  // Rare — a rule of your own.
  'third_hand',        // three hole cards
  'cold_read',         // one hole card of every player
  'blood_price',       // pay for a sigil in chips when the mana is short
  'unstable_isotope',  // a hole card undecided, every hand
  'vow_of_silence',    // uncounterable, and you may never answer
  // Mythic — the run bends around it.
  'wild_inheritance',  // a hole card is any card
  'twice_told',        // your first sigil each hand resolves twice
];

export const RELIC_BY_ID: Record<string, RelicDef> = Object.fromEntries(
  [...RELICS, ...RETIRED, ...CREEDS].map((r) => [r.id, r]),
);

/** What the Market can offer. `RELICS` stays the registry of everything. */
export const RELIC_POOL: RelicDef[] = RELIC_POOL_IDS.map((id) => {
  const def = RELIC_BY_ID[id];
  if (!def) throw new Error(`RELIC_POOL_IDS names a relic that does not exist: ${id}`);
  return def;
});

/**
 * Relics back on the shelf from the second run (shared/unlock.ts).
 *
 * Round 7 (2026-10-22) brought back four, picked for what they do to a
 * decision, from round 5's measurements of all
 * 45 (plans/fun-round5-data): each was bought often enough to be seen, and
 * each fires where the player can see it (a ledger line or the hand it makes
 * at showdown), because round 6 found five shelf relics that act silently and
 * a sixth would make that worse. None repeats a relic on the shelf.
 *
 * - The Keepsake: folding before the flop becomes a plan (9.2 lines a run in
 *   round 5, the most visible relic in the game). The Ashen, paid to fold,
 *   now have something to build.
 * - Broken Compass: your flushes need four. The Ladder's partner, for the
 *   other drawing hand; 1.9 visible firings a run.
 * - The Magpie: counter a spell and keep it. Every seat holds a Nullify (the
 *   Unaligned's creed), so this turns the one spell everybody has into a bet.
 * - Crown of Thieves: Jacks and Queens read as Kings for you. A hand-reading
 *   rule nothing else on the shelf touches; 1.6 firings a run.
 *
 * Left out: Stepping Stones and Crooked Ladder (more straights of four, the
 * duplicate the cut named), Smeared Ink (the Blurred omen's rule), the
 * one-of-your-hole-cards family beyond the three already on the shelf, The
 * Sanctum (it never shows when it works), and every relic that is a number.
 *
 * Round 8 (2026-10-23, FUN-REVIEW.md) raised the later shelf past the cut's
 * sixteen, for runs 2+ only. Sixteen could not get two runs' relics apart
 * (overlap 0.17, against round 5's 0.09), and relics are the one kind of
 * content a player meets by choice: two at a time in the Market, four or
 * five owned in a run, each in the rules tab. Sigils and omens are played
 * against you whether you chose them or not, so their ceilings stay. Seven
 * more, by the same bar (a rule or a sight you can see work, not a number,
 * not a rule the shelf, a creed or a live omen already has):
 *
 * - The Prism Lens: every Prism is Wild for you. The later run's own combo:
 *   Gild, The Prism omen and The Engraver all make Prism cards.
 * - Heirloom: a card scores a rank higher for every pot it has won. The
 *   Twinned's relic, sold to everyone else; 3.9 visible firings a run in
 *   round 5.
 * - The Second River: a High Card river runs again, in front of the table.
 * - The Engraver: win a showdown and a card of your hand is Prism for good,
 *   on the shared deck. 2.1 ledger lines a run in round 5.
 * - Mirror Shard: you read both faces of every undecided card. Superpose is
 *   the signature sigil, Entropy Rising deals one a hand, the Unmoored's creed
 *   makes more, and Unstable Isotope is on this shelf.
 * - The Lodestone: a rank drawn in front of the table, Wild for you that
 *   hand. 7.3 firings a run in round 5, second only to The Keepsake.
 * - The Usurper: knock a player out and take their relics. The mythic a
 *   table remembers.
 *
 * Still left out: Smeared Ink, Ouroboros, Reversal and Crowned (live omens
 * already run their rules: Blurred, Serpent, Inversion, The Sealed Court),
 * The Ledger (every seat's mana is on the table already, so it does
 * nothing), The Informant (Cold Read's job), Bloodline, Gilded Thumb, Twin
 * Suns and Unsettled (the hole-card family again), The Archive and The Long
 * Game (two shelf relics glued together), and the numbers.
 *
 * Twenty-three at the shop's 6/3/1 weighting: ten commons, nine rares, four
 * mythics. Empty this list and later runs see the first run's twelve.
 */
export const UNLOCKED_RELIC_IDS: readonly string[] = [
  'keepsake',          // common: fold before the flop, keep your higher card
  'broken_compass',    // common: your flushes need four
  'magpie',            // rare: counter a sigil and it comes to your hand
  'crown_of_thieves',  // rare: Jacks and Queens read as Kings for you
  // Round 8.
  'prism_lens',        // common: every Prism is Wild for you
  'heirloom',          // common: a card remembers every pot it has won
  'second_river',      // common: a High Card river runs again, once
  'the_engraver',      // rare: your winning hand engraves a card Prism
  'mirror_shard',      // rare: both faces of every undecided card
  'lodestone',         // mythic: a rank Wild for you, drawn each hand
  'the_usurper',       // mythic: a knockout takes the loser's relics
];

/** The later shelf's ceiling: relics only, and only past the first run. */
export const LATER_RELIC_CEILING = 24;

const UNLOCKED_RELIC_POOL: RelicDef[] = [...RELIC_POOL, ...UNLOCKED_RELIC_IDS.map((id) => {
  const def = RELIC_BY_ID[id];
  if (!def) throw new Error(`UNLOCKED_RELIC_IDS names a relic that does not exist: ${id}`);
  return def;
})];

/** What a table's Market can offer: the first run's twelve, or those and the unlocked ones. */
export const relicPool = (unlocked: boolean): readonly RelicDef[] =>
  (unlocked ? UNLOCKED_RELIC_POOL : RELIC_POOL);

/** Whether any of these relics (or a creed among them) runs this rule. */
export const hasRule = (relicIds: string[], rule: RuleId): boolean =>
  relicIds.some((id) => RELIC_BY_ID[id]?.rule === rule);

/** Whether a relic id is a coven's creed. */
export const isCreed = (id: string): boolean => !!RELIC_BY_ID[id]?.coven;

export const RELIC_RARITY_COLOR: Record<RelicRarity, string> = {
  common: '#9f9ac4',
  rare: '#00e5ff',
  mythic: '#ff8c1a',
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
    if (m.memoryBonus) out.memoryBonus = true;
    if (m.straightGap) out.straightGap = true;
    if (m.prismIsWild) out.prismIsWild = true;
    if (m.copiesWild) out.copiesWild = true;
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
