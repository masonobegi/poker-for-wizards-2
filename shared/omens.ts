/**
 * Omens — a permanent, table-wide rule that turns on at every ante and never
 * turns off.
 *
 * Relics are personal and bought; omens are imposed on everyone at once, and
 * they stack. By the fourth ante the game you are playing is measurably not the
 * game you sat down to: suits have merged, a rank has been struck out, kings
 * arrive face down, and the deck has started handing out wild cards.
 *
 * This is the escalation curve. A run should end somewhere absurd, and the
 * players should be able to name exactly which decisions got them there.
 */
import type { MarkId, Rank } from './cards';
import type { RuleMods } from './hand';

export interface OmenDef {
  id: string;
  name: string;
  glyph: string;
  /** Rules text, as announced to the table. */
  text: string;
  /** Why a physical table could not run this rule. */
  impossible: string;
  /** Earliest ante this can appear at. Later omens are the strange ones. */
  minAnte: number;
  /** Draw weight. */
  weight: number;
  /** Folded into every player's rule mods. */
  mods?: RuleMods;
  /** Interpreted by the engine at deal time. */
  deal?: {
    /** Set this many community cards in amber each hand. */
    amberBoard?: number;
    extraHole?: number;
    sealRank?: Rank;
    /** Seal whichever rank the omen rolled. */
    sealRolled?: boolean;
    quantumBoard?: number;
    quantumHole?: number;
    extraBoard?: number;
    /** Inscribe this mark onto N random cards in the shared deck, once. */
    inscribe?: { markId: MarkId; count: number };
  };
  mana?: { regen?: number; max?: number };
  /** Strike a rolled rank from every hand. */
  killsRank?: boolean;
  /** Sigil draws per hand, table-wide. */
  sigilDraw?: number;
  /** Added to the mana cost of every sigil, for everyone. */
  sigilCost?: number;
  /** Extra steps the blinds climb at each ante from now on. */
  blindSteps?: number;
}

export const OMENS: OmenDef[] = [
  // ---- ante 2: the rules bend ---------------------------------------------
  {
    id: 'blurred', name: 'Blurred', glyph: '◐', minAnte: 2, weight: 10,
    text: 'Hearts and Diamonds are one suit. Spades and Clubs are one suit.',
    impossible: 'Two suits sharing an identity without reprinting the deck.',
    mods: { mergedColors: true },
  },
  {
    id: 'serpent', name: 'The Serpent', glyph: '∮', minAnte: 2, weight: 10,
    text: 'Aces bridge both ends. Queen-King-Ace-Two-Three is a straight.',
    impossible: 'A rank order with no beginning and no end.',
    mods: { wheelWrap: true },
  },
  {
    id: 'thin_ice', name: 'Thin Ice', glyph: '✥', minAnte: 2, weight: 9,
    text: 'Flushes need only four cards of a suit.',
    impossible: 'A flush that is not five cards, adjudicated for everyone at once.',
    mods: { flushSize: 4 },
  },
  {
    id: 'coronation', name: 'Coronation', glyph: '♛', minAnte: 2, weight: 8,
    text: 'Jacks and Queens may be read as Kings.',
    impossible: 'Three ranks collapsing into one, mid-game, for the whole table.',
    mods: { facesAreKings: true },
  },
  {
    id: 'feast', name: 'Feast', glyph: '◇', minAnte: 2, weight: 8,
    text: 'Everyone gains +2 maximum mana and +1 mana each street.',
    impossible: 'A resource that did not exist an hour ago, becoming abundant.',
    mana: { max: 2, regen: 1 },
  },
  {
    id: 'the_flood', name: 'The Flood', glyph: '⬢', minAnte: 2, weight: 8,
    text: 'Every hand deals a sixth community card.',
    impossible: 'Nothing — but the scoring engine handles a six-card board, and yours does.',
    deal: { extraBoard: 1 },
  },
  {
    id: 'the_watchful', name: 'The Watchful', glyph: '👁', minAnte: 2, weight: 7,
    text: 'Everyone draws an extra sigil each hand.',
    impossible: 'A supply that regenerates from an empty table.',
    sigilDraw: 1,
  },

  // ---- ante 3: the deck starts lying --------------------------------------
  {
    id: 'sealed_court', name: 'The Sealed Court', glyph: '⛊', minAnte: 3, weight: 9,
    text: 'Every King is dealt face down and stays sealed until showdown — hole cards and board alike.',
    impossible: 'The deck reading a card before dealing it, then hiding it from itself.',
    deal: { sealRank: 13 },
  },
  {
    id: 'the_gilded', name: 'The Gilded', glyph: '✶', minAnte: 3, weight: 9,
    text: 'Three cards in the shared deck become permanently Wild. Nobody is told which.',
    impossible: 'Cards that are simultaneously every card in the deck.',
    deal: { inscribe: { markId: 'wild', count: 3 } },
  },
  {
    id: 'entropy_rising', name: 'Entropy Rising', glyph: '⟁', minAnte: 3, weight: 9,
    text: 'One community card arrives undecided every hand, holding two possible faces.',
    impossible: 'Dealing a card that has not chosen what it is.',
    deal: { quantumBoard: 1 },
  },
  {
    id: 'third_card', name: 'The Third Card', glyph: '☗', minAnte: 3, weight: 7,
    text: 'Everyone is dealt three hole cards.',
    impossible: 'Nothing — but it wrecks the maths, and the engine keeps up.',
    deal: { extraHole: 1 },
  },
  {
    id: 'long_memory', name: 'Long Memory', glyph: '⌬', minAnte: 3, weight: 8,
    text: 'Every card scores one rank higher for each pot it has already won. The deck has been counting since the first hand.',
    impossible: 'Cards with a memory of their own career.',
    mods: { memoryBonus: true },
  },
  {
    id: 'the_blooded', name: 'The Blooded', glyph: '✚', minAnte: 3, weight: 8,
    text: 'Five cards in the shared deck are permanently Blooded — they score one rank higher.',
    impossible: 'A deck that carries edits between games.',
    deal: { inscribe: { markId: 'blooded', count: 5 } },
  },
  {
    id: 'famine', name: 'Famine', glyph: '⨯', minAnte: 3, weight: 6,
    text: 'Mana regenerates one slower each street. Spells were always going to get harder.',
    impossible: 'Rationing something with no physical supply.',
    mana: { regen: -1 },
  },

  // ---- ante 4+: the game stops pretending ---------------------------------
  {
    id: 'unmade', name: 'The Unmade', glyph: '∅', minAnte: 4, weight: 8,
    text: 'One rank is struck from every hand at this table, permanently.',
    impossible: 'Removing a rank from hands that are already dealt and already held.',
    killsRank: true,
  },
  {
    id: 'the_veil', name: 'The Veil', glyph: '☾', minAnte: 4, weight: 7,
    text: 'One of your hole cards arrives undecided every hand.',
    impossible: 'Being dealt a card that has not decided what it is.',
    deal: { quantumHole: 1 },
  },
  {
    id: 'the_prism', name: 'The Prism', glyph: '◈', minAnte: 4, weight: 7,
    text: 'Six cards in the shared deck become permanently Prismatic — they count as any suit.',
    impossible: 'A card wearing four suits at once.',
    deal: { inscribe: { markId: 'prism', count: 6 } },
  },

  {
    id: 'sleight', name: 'Sleight of Hand', glyph: '⑃', minAnte: 2, weight: 8,
    text: 'Everyone draws two extra sigils each hand. The table gets loud.',
    impossible: 'A hand that refills faster than a deck can be cut.',
    sigilDraw: 2,
  },
  {
    id: 'the_weight', name: 'The Weight', glyph: '⚖', minAnte: 3, weight: 7,
    text: 'Every sigil costs one more mana. Magic was always going to get expensive.',
    impossible: 'Repricing a thing with no market and no supply.',
    sigilCost: 1,
  },
  {
    id: 'amber_age', name: 'The Amber Age', glyph: '❈', minAnte: 3, weight: 7,
    text: 'One community card is set in amber every hand. Nothing can burn it, collapse it or rewrite it.',
    impossible: 'A card that time stops touching while the game goes on around it.',
    deal: { amberBoard: 1 },
  },
  {
    id: 'court_of_prisms', name: 'The Court of Prisms', glyph: '◈', minAnte: 3, weight: 7,
    text: 'Eight cards in the shared deck become permanently Prismatic — they count as any suit.',
    impossible: 'A card wearing four suits at once.',
    deal: { inscribe: { markId: 'prism', count: 8 } },
  },
  {
    id: 'doubling_down', name: 'Doubling Down', glyph: '⇈', minAnte: 4, weight: 6,
    text: 'The blinds climb an extra step at every ante from here. The clock just got shorter.',
    impossible: 'Nothing — but it is the omen that ends runs, and it should be feared.',
    blindSteps: 1,
  },
  {
    id: 'inversion', name: 'The Inversion', glyph: '⇅', minAnte: 5, weight: 5,
    text: 'The worst hand wins every pot. All of them. From now on.',
    impossible: 'A comparison operator you can be handed mid-game.',
    mods: { lowWins: true },
  },

  // ---- a second pass ------------------------------------------------------
  // Omens are the only content in the game that changes the rules for
  // *everyone*, which makes them the cheapest way to make two runs feel
  // unalike — and, being pure data over fields the engine already reads, the
  // safest. Weights are deliberately lower than the first pass so the
  // originals stay the common case and these stay surprises.
  {
    id: 'the_crowded_board', name: 'The Crowded Board', glyph: '▦', minAnte: 2, weight: 7,
    text: 'Every hand deals a sixth community card.',
    impossible: 'A board longer than the one the game was designed around, permanently.',
    deal: { extraBoard: 1 },
  },
  {
    id: 'the_ladder', name: 'The Ladder', glyph: '☰', minAnte: 2, weight: 7,
    text: 'Straights need only four cards in sequence.',
    impossible: 'A straight that is not five cards, for the whole table at once.',
    mods: { straightSize: 4 },
  },
  {
    id: 'the_tide', name: 'The Tide', glyph: '≈', minAnte: 2, weight: 7,
    text: 'Everyone draws one more sigil each hand. The table gets louder.',
    impossible: 'A hand size the deck cannot supply.',
    sigilDraw: 1,
  },
  {
    id: 'the_drought', name: 'The Drought', glyph: '◌', minAnte: 3, weight: 6,
    text: 'Every sigil costs one more mana. Magic is expensive now.',
    impossible: 'Inflation, in a currency nobody minted.',
    sigilCost: 1,
  },
  {
    id: 'the_court_masked', name: 'The Court Masked', glyph: '☗', minAnte: 3, weight: 6,
    text: 'Jacks and Queens are read as Kings. The court closes ranks.',
    impossible: 'Three ranks collapsing into one for scoring and no other purpose.',
    mods: { facesAreKings: true },
  },
  {
    id: 'the_undertow', name: 'The Undertow', glyph: '⊽', minAnte: 3, weight: 6,
    text: 'Two cards in the shared deck become Leaden. They score a rank lower, forever, for whoever draws them.',
    impossible: 'A card that is worth less than its face, permanently, and nobody is told which.',
    deal: { inscribe: { markId: 'leaden', count: 2 } },
  },
  {
    id: 'the_bindings', name: 'The Bindings', glyph: '∞', minAnte: 3, weight: 6,
    text: 'Two cards in the shared deck are Bound. Whatever happens to one happens to the other.',
    impossible: 'Two pieces of cardboard sharing a fate across separate hands.',
    deal: { inscribe: { markId: 'bound', count: 2 } },
  },
  {
    id: 'the_quickening', name: 'The Quickening', glyph: '⇈', minAnte: 4, weight: 5,
    text: 'The blinds climb an extra step at every ante from here. The run is shorter than you planned.',
    impossible: 'Nothing — it is the only omen a real tournament could run, and it is here to make the others hurt.',
    blindSteps: 1,
  },
  {
    id: 'the_undecided', name: 'The Undecided', glyph: '⟁', minAnte: 4, weight: 5,
    text: 'Two community cards arrive undecided every hand, holding two faces until showdown.',
    impossible: 'A board that has not finished being a board when you bet on it.',
    deal: { quantumBoard: 2 },
  },
  {
    id: 'the_wellspring', name: 'The Wellspring', glyph: '≋', minAnte: 4, weight: 5,
    text: 'Everyone gains an extra mana every street, and holds more of it.',
    impossible: 'A resource that refills because time passed, for everyone, forever.',
    mana: { regen: 1, max: 3 },
  },
];

export const OMEN_BY_ID: Record<string, OmenDef> = Object.fromEntries(
  OMENS.map((o) => [o.id, o]),
);

/** An omen in force, with whatever it rolled when it landed. */
export interface ActiveOmen {
  id: string;
  /** For omens that pick a rank when they arrive. */
  rank?: Rank;
  ante: number;
}

/** Collapse the omens in force into rule mods. */
export function omenMods(active: ActiveOmen[]): RuleMods {
  const out: RuleMods = {};
  for (const a of active) {
    const m = OMEN_BY_ID[a.id]?.mods;
    if (m) {
      if (m.mergedColors) out.mergedColors = true;
      if (m.wheelWrap) out.wheelWrap = true;
      if (m.lowWins) out.lowWins = true;
      if (m.facesAreKings) out.facesAreKings = true;
      if (m.memoryBonus) out.memoryBonus = true;
      if (m.flushSize !== undefined) out.flushSize = Math.min(out.flushSize ?? 5, m.flushSize);
      if (m.categoryShift) out.categoryShift = (out.categoryShift ?? 0) + m.categoryShift;
    }
    if (OMEN_BY_ID[a.id]?.killsRank && a.rank) {
      out.deadRanks = [...new Set([...(out.deadRanks ?? []), a.rank])];
    }
  }
  return out;
}

export function omenNumber(
  active: ActiveOmen[],
  pick: (o: OmenDef) => number | undefined,
): number {
  let total = 0;
  for (const a of active) {
    const v = pick(OMEN_BY_ID[a.id] ?? ({} as OmenDef));
    if (typeof v === 'number') total += v;
  }
  return total;
}

export const omenLabel = (a: ActiveOmen): string => {
  const def = OMEN_BY_ID[a.id];
  if (!def) return a.id;
  return def.name;
};
