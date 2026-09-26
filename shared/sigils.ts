/**
 * Sigils — the castable half of HEXHOLD.
 *
 * House rule for this file: a sigil earns its slot only if it could not be
 * reproduced at a real table with real cardboard. Anything a dealer could do
 * with a binder clip and a good memory has been cut.
 */

export type School = 'entropy' | 'veil' | 'chronos' | 'bind' | 'ruin' | 'weave';

export interface SchoolDef {
  id: School;
  name: string;
  hue: number;
  accent: string;
  glow: string;
  motto: string;
}

export const SCHOOLS: Record<School, SchoolDef> = {
  entropy: { id: 'entropy', name: 'Entropy', hue: 280, accent: '#b98cff', glow: '#7c3aed', motto: 'Nothing is decided until it is seen.' },
  veil:    { id: 'veil',    name: 'Veil',    hue: 205, accent: '#6ec8ff', glow: '#0ea5e9', motto: 'Truth is a per-observer quantity.' },
  chronos: { id: 'chronos', name: 'Chronos', hue: 38,  accent: '#ffc861', glow: '#f59e0b', motto: 'The river has run before.' },
  bind:    { id: 'bind',    name: 'Bind',    hue: 168, accent: '#5eead4', glow: '#14b8a6', motto: 'Two cards, one fate.' },
  ruin:    { id: 'ruin',    name: 'Ruin',    hue: 352, accent: '#ff7a8a', glow: '#e11d48', motto: 'Some cards should not have existed.' },
  weave:   { id: 'weave',   name: 'Weave',   hue: 96,  accent: '#a8e063', glow: '#65a30d', motto: 'The deck remembers what you write on it.' },
};

/** When a sigil may legally be cast. */
export type Timing =
  | 'deal'       // between hands, before hole cards
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'any'        // any street, during your window
  | 'response'   // only while another sigil is on the stack
  | 'showdown';

/** What the caster must choose before the sigil goes on the stack. */
export type TargetKind =
  | 'none'
  | 'player'        // an opponent
  | 'own_card'      // one of your hole cards
  | 'board_card'    // one community card
  | 'any_card'      // any card you can see
  | 'two_cards'     // two cards you can see
  | 'rank'
  | 'suit'
  | 'stack';        // the sigil currently on the stack

export type Rarity = 'common' | 'rare' | 'mythic';

export interface SigilDef {
  id: string;
  name: string;
  school: School;
  glyph: string;
  cost: number;           // mana
  timing: Timing[];
  target: TargetKind;
  rarity: Rarity;
  /** Rules text, as printed on the card. */
  text: string;
  /** One line on why this cannot exist at a physical table. Shown on inspect. */
  impossible: string;
  /** Shop price in shards. */
  price: number;
  /** Cannot be countered. */
  unstoppable?: boolean;
  /** Bot willingness to fire it, 0..1 — crude but keeps bots from misplaying. */
  botBias?: number;
}

export const SIGILS: SigilDef[] = [
  // ------------------------------------------------------------------ ENTROPY
  {
    id: 'superpose', name: 'Superpose', school: 'entropy', glyph: '⟁', cost: 2,
    timing: ['any'], target: 'any_card', rarity: 'common', price: 4, botBias: 0.6,
    text: 'The target card becomes two cards at once. It stays undecided until showdown, then settles on whichever face helps its holder most.',
    impossible: 'One object, two identities, resolved retroactively. Cardboard has to pick a side at print time.',
  },
  {
    id: 'collapse', name: 'Collapse', school: 'entropy', glyph: '◍', cost: 1,
    timing: ['any'], target: 'any_card', rarity: 'common', price: 3, botBias: 0.5,
    text: 'Force an undecided card to settle right now, at random, in front of everyone.',
    impossible: 'You can only force a decision out of something that had not made one.',
  },
  {
    id: 'schrodinger', name: "Schrödinger's Flop", school: 'entropy', glyph: '⧗', cost: 3,
    timing: ['deal', 'preflop'], target: 'none', rarity: 'rare', price: 7, botBias: 0.5,
    text: 'The entire flop arrives undecided — three cards, each holding two possible faces.',
    impossible: 'A dealer cannot deal a card that has not chosen what it is.',
  },
  {
    id: 'decohere', name: 'Decohere', school: 'entropy', glyph: '⬖', cost: 3,
    timing: ['river', 'showdown'], target: 'none', rarity: 'rare', price: 8, botBias: 0.55,
    text: 'Every undecided card settles on its worst face — for everyone except you.',
    impossible: 'The same card resolving kindly for one player and cruelly for the rest.',
  },
  {
    id: 'probability_storm', name: 'Probability Storm', school: 'entropy', glyph: '✦', cost: 5,
    timing: ['flop', 'turn', 'river'], target: 'none', rarity: 'mythic', price: 14, botBias: 0.4,
    text: 'Every community card splits into a superposition with a random alternate face.',
    impossible: 'The board becoming a probability distribution instead of five objects.',
  },

  // --------------------------------------------------------------------- VEIL
  {
    id: 'sealed_rank', name: 'Sealed Rank', school: 'veil', glyph: '⛊', cost: 2,
    timing: ['deal', 'preflop'], target: 'rank', rarity: 'common', price: 5, botBias: 0.6,
    text: 'Name a rank. For the rest of this hand every card of that rank is dealt face down — hole cards and community cards alike. The table knows one is hiding there. Nobody knows where.',
    impossible: 'The deck would have to read a card before anyone sees it, then hide it from itself.',
  },
  {
    id: 'divergence', name: 'Divergence', school: 'veil', glyph: '⋔', cost: 3,
    timing: ['flop', 'turn', 'river'], target: 'board_card', rarity: 'rare', price: 9, botBias: 0.7,
    text: 'A community card shows you one face and shows the rest of the table another. Both readings score.',
    impossible: 'One card, one face up, two contradictory truths — both valid at showdown.',
  },
  {
    id: 'second_sight', name: 'Second Sight', school: 'veil', glyph: '👁', cost: 1,
    timing: ['any'], target: 'none', rarity: 'common', price: 3, botBias: 0.75,
    text: 'Look at the next three cards of the deck. Tell no one, or lie about them.',
    impossible: 'Peeking without touching, without a tell, and without the deck ever knowing.',
  },
  {
    id: 'gloaming', name: 'Gloaming', school: 'veil', glyph: '☾', cost: 2,
    timing: ['any'], target: 'none', rarity: 'common', price: 5, botBias: 0.5,
    text: 'Your hole cards leave the world for this hand. No sigil may target them, steal them, or read them.',
    impossible: 'Cards that are still in play but have no location anyone can point at.',
  },
  {
    id: 'false_face', name: 'False Face', school: 'veil', glyph: '⚉', cost: 3,
    timing: ['any'], target: 'player', rarity: 'rare', price: 9, botBias: 0.6,
    text: "You see one of the target's hole cards truly. They see a lie in its place until showdown.",
    impossible: 'Lying to a player about a card they are physically holding.',
  },
  {
    id: 'veiled_wager', name: 'Veiled Wager', school: 'veil', glyph: '◐', cost: 2,
    timing: ['any'], target: 'none', rarity: 'rare', price: 8, botBias: 0.45,
    text: 'Your next bet is concealed. The table sees only that you bet, not how much, until the hand ends. Callers commit blind.',
    impossible: 'Chips you can stake without anyone being able to count the stack.',
  },

  // ------------------------------------------------------------------ CHRONOS
  {
    id: 'rewind', name: 'Rewind', school: 'chronos', glyph: '↺', cost: 3,
    timing: ['flop', 'turn', 'river'], target: 'none', rarity: 'common', price: 6, botBias: 0.65,
    text: 'Unmake the most recent community card and deal a different one. The discarded card is remembered and may return.',
    impossible: 'Taking a card back out of a board everybody already saw.',
  },
  {
    id: 'echo_hand', name: 'Echo of a Hand', school: 'chronos', glyph: '⧖', cost: 5,
    timing: ['river'], target: 'none', rarity: 'mythic', price: 15, botBias: 0.7,
    text: 'The river runs a second time in a parallel timeline. At showdown you score from whichever timeline is kinder to you.',
    impossible: 'Two rivers existing at once, and a player standing in both.',
  },
  {
    id: 'foresight', name: 'Foresight', school: 'chronos', glyph: '◉', cost: 2,
    timing: ['preflop', 'flop'], target: 'none', rarity: 'common', price: 5, botBias: 0.8,
    text: 'Look at the river before the flop is dealt. It is already written.',
    impossible: 'Reading a card the deck has not decided to deal yet.',
  },
  {
    id: 'stutter', name: 'Stutter', school: 'chronos', glyph: '⟳', cost: 2,
    timing: ['flop', 'turn'], target: 'none', rarity: 'common', price: 5, botBias: 0.5,
    text: 'This street happens twice. Everyone keeps only the second one. Bets from the first are returned.',
    impossible: 'Un-betting. Chips do not travel backwards across a felt table.',
  },
  {
    id: 'long_memory', name: 'Long Memory', school: 'chronos', glyph: '⌬', cost: 3,
    timing: ['any'], target: 'none', rarity: 'rare', price: 9, botBias: 0.5,
    text: 'Every card in play scores one rank higher for each pot it has previously won. The deck has been keeping count since the first hand.',
    impossible: 'Cards with a memory of their own career.',
  },

  // --------------------------------------------------------------------- BIND
  {
    id: 'entangle', name: 'Entangle', school: 'bind', glyph: '∞', cost: 3,
    timing: ['any'], target: 'two_cards', rarity: 'rare', price: 9, botBias: 0.5,
    text: 'Bind two cards. From now on, whatever happens to one happens to the other — including being replaced, collapsed, or destroyed.',
    impossible: 'Action at a distance between two pieces of card stock.',
  },
  {
    id: 'mirror', name: 'Mirror', school: 'bind', glyph: '⧉', cost: 2,
    timing: ['flop', 'turn', 'river'], target: 'two_cards', rarity: 'common', price: 5, botBias: 0.6,
    text: 'Pick two community cards. The second becomes an exact duplicate of the first. The deck now holds two of the same card, legally.',
    impossible: 'Two identical cards in one fifty-two card deck.',
  },
  {
    id: 'twin', name: 'Twin', school: 'bind', glyph: '⁑', cost: 4,
    timing: ['turn', 'river'], target: 'own_card', rarity: 'rare', price: 10, botBias: 0.7,
    text: 'One of your hole cards is copied onto the board as an extra community card. Everyone may use it. It is still yours.',
    impossible: 'A card being in your hand and on the board simultaneously.',
  },
  {
    id: 'chain', name: 'Chain', school: 'bind', glyph: '⛓', cost: 2,
    timing: ['preflop', 'flop'], target: 'none', rarity: 'common', price: 5, botBias: 0.4,
    text: 'Every player passes one hole card to the left, simultaneously, with no one seeing the exchange happen.',
    impossible: 'A simultaneous swap with no window in which a card is in transit.',
  },
  {
    id: 'sympathy', name: 'Sympathy', school: 'bind', glyph: '☍', cost: 4,
    timing: ['preflop', 'flop', 'turn'], target: 'player', rarity: 'mythic', price: 13, botBias: 0.45,
    text: 'You and the target share one set of hole cards for this hand. You both score from all four.',
    impossible: 'Four cards held by two people at once, without either giving any up.',
  },

  // --------------------------------------------------------------------- RUIN
  {
    id: 'burn', name: 'Burn', school: 'ruin', glyph: '🜂', cost: 2,
    timing: ['flop', 'turn', 'river'], target: 'board_card', rarity: 'common', price: 5, botBias: 0.6,
    text: 'Destroy a community card. The board is shorter now. It is not replaced.',
    impossible: 'A four-card board that the game still knows how to score.',
  },
  {
    id: 'unmake', name: 'Unmake', school: 'ruin', glyph: '∅', cost: 3,
    timing: ['any'], target: 'rank', rarity: 'rare', price: 8, botBias: 0.55,
    text: 'Name a rank. It is struck from every hand at the table for the rest of this round, wherever it is hiding.',
    impossible: 'Removing a rank from hands that are already dealt and already held.',
  },
  {
    id: 'larceny', name: 'Larceny', school: 'ruin', glyph: '✂', cost: 2,
    timing: ['any'], target: 'player', rarity: 'common', price: 6, botBias: 0.65,
    text: 'Steal a random sigil from the target. They find out only when you cast it.',
    impossible: 'Taking a card out of a hand the owner never stops watching.',
  },
  {
    id: 'sever', name: 'Sever', school: 'ruin', glyph: '⨯', cost: 3,
    timing: ['any'], target: 'player', rarity: 'rare', price: 8, botBias: 0.6,
    text: 'The target loses all unspent mana and gains none until the next hand.',
    impossible: 'There is nothing to drain at a table made of wood.',
  },
  {
    id: 'hex', name: 'Hex', school: 'ruin', glyph: '☠', cost: 3,
    timing: ['turn', 'river'], target: 'player', rarity: 'rare', price: 9, botBias: 0.7,
    text: "The target's final hand scores one category lower. Their flush is a straight. Their straight is nothing much.",
    impossible: 'Rewriting what a hand *is* after the cards have stopped moving.',
  },
  {
    id: 'conflagration', name: 'Conflagration', school: 'ruin', glyph: '☄', cost: 4,
    timing: ['flop', 'turn'], target: 'none', rarity: 'mythic', price: 12, botBias: 0.4,
    text: 'Every player at the table burns one hole card and draws a replacement. Including you. Especially you.',
    impossible: 'A redraw that everyone performs at the same instant with no dealer.',
  },

  // -------------------------------------------------------------------- WEAVE
  {
    id: 'inscribe', name: 'Inscribe', school: 'weave', glyph: '✒', cost: 3,
    timing: ['any'], target: 'any_card', rarity: 'rare', price: 10, botBias: 0.4,
    text: 'Write a permanent mark on this exact card. It keeps that mark forever — in this hand, and in every hand after, for whoever draws it.',
    impossible: 'A deck that carries edits between games without anyone re-printing it.',
  },
  {
    id: 'wild_rite', name: 'Wild Rite', school: 'weave', glyph: '✶', cost: 3,
    timing: ['any'], target: 'own_card', rarity: 'common', price: 7, botBias: 0.8,
    text: 'One of your hole cards becomes Wild for this hand — any rank, any suit, whichever wins.',
    impossible: 'A card that is simultaneously every card in the deck.',
  },
  {
    id: 'conjure', name: 'Conjure', school: 'weave', glyph: '✧', cost: 4,
    timing: ['preflop', 'flop', 'turn'], target: 'none', rarity: 'rare', price: 11, botBias: 0.75,
    text: 'Create a card that was never in the deck and take it as a third hole card. The deck is now fifty-three.',
    impossible: 'Minting a card from nothing, mid-hand, with no sleight of hand.',
  },
  {
    id: 'sixth_card', name: 'Sixth Card', school: 'weave', glyph: '⬢', cost: 2,
    timing: ['river'], target: 'none', rarity: 'common', price: 5, botBias: 0.55,
    text: 'Deal a sixth community card. Everyone plays it. Nobody asked for it.',
    impossible: 'Nothing, physically — but the scoring engine needs to handle a six-card board, and yours does.',
  },
  {
    id: 'reweave', name: 'Reweave', school: 'weave', glyph: '⟲', cost: 4,
    timing: ['flop', 'turn'], target: 'none', rarity: 'rare', price: 10, botBias: 0.45,
    text: 'The board dissolves back into the deck and a fresh one is dealt in its place, same length.',
    impossible: 'Unshuffling and reshuffling between two bets.',
  },


  // ------------------------------------------------- second wave: entropy
  {
    id: 'fracture', name: 'Fracture', school: 'entropy', glyph: '⟒', cost: 4,
    timing: ['any'], target: 'any_card', rarity: 'rare', price: 9, botBias: 0.55,
    text: 'The target card splits into three possible faces instead of settling on one.',
    impossible: 'A single object holding three mutually exclusive identities at once.',
  },
  {
    id: 'cascade', name: 'Cascade', school: 'entropy', glyph: '⋰', cost: 3,
    timing: ['river', 'showdown'], target: 'none', rarity: 'rare', price: 8, botBias: 0.5,
    text: 'Every undecided card on the table settles at once, each one landing on its highest face.',
    impossible: 'Forcing a whole table of uncertainties to resolve in the same instant.',
  },

  // ---------------------------------------------------- second wave: veil
  {
    id: 'blind_spot', name: 'Blind Spot', school: 'veil', glyph: '◌', cost: 3,
    timing: ['flop', 'turn'], target: 'player', rarity: 'rare', price: 9, botBias: 0.6,
    text: 'The target cannot see the community cards for the rest of the hand. They still play them.',
    impossible: 'Taking the board away from one player and leaving it for everyone else.',
  },
  {
    id: 'the_ledger_sigil', name: 'Read the Room', school: 'veil', glyph: '⌸', cost: 2,
    timing: ['any'], target: 'player', rarity: 'common', price: 6, botBias: 0.6,
    text: 'See every sigil in the target’s hand until the hand ends.',
    impossible: 'Reading cards somebody is holding against their chest.',
  },

  // ------------------------------------------------- second wave: chronos
  {
    id: 'amber', name: 'Amber', school: 'chronos', glyph: '❈', cost: 2,
    timing: ['any'], target: 'any_card', rarity: 'common', price: 6, botBias: 0.5,
    text: 'Set a card in amber. Nothing can burn it, collapse it, steal it, replace it or rewrite it for the rest of the hand.',
    impossible: 'A card that time stops touching while the game goes on around it.',
  },

  // ---------------------------------------------------- second wave: bind
  {
    id: 'tessellate', name: 'Tessellate', school: 'bind', glyph: '⧖', cost: 2,
    timing: ['any'], target: 'none', rarity: 'common', price: 5, botBias: 0.5,
    text: 'Your hole cards trade ranks with each other, keeping their suits.',
    impossible: 'Two cards exchanging half of what they are and staying themselves.',
  },
  {
    id: 'doppelganger', name: 'Doppelgänger', school: 'bind', glyph: '⧅', cost: 4,
    timing: ['turn', 'river'], target: 'player', rarity: 'rare', price: 11, botBias: 0.7,
    text: 'Copy one of the target’s hole cards into your own hand. They keep theirs.',
    impossible: 'Taking a card without the person holding it losing anything.',
  },

  // ---------------------------------------------------- second wave: ruin
  {
    id: 'tithe', name: 'Tithe', school: 'ruin', glyph: '⑃', cost: 1,
    timing: ['any'], target: 'none', rarity: 'common', price: 6, botBias: 0.65,
    text: 'Every other player pays you one mana. Those who cannot, pay a big blind instead.',
    impossible: 'Levying a tax on a substance that does not exist.',
  },

  // --------------------------------------------------- second wave: weave
  {
    id: 'transmute', name: 'Transmute', school: 'weave', glyph: '⚗', cost: 3,
    timing: ['any'], target: 'any_card', rarity: 'common', price: 7, botBias: 0.6,
    text: 'Change a card’s suit. Permanently — it keeps the new suit in every hand after this one.',
    impossible: 'Re-inking a card that is already in play, forever.',
  },

  // ----------------------------------------------------------------- RESPONSE
  {
    id: 'nullify', name: 'Nullify', school: 'veil', glyph: '⊘', cost: 2,
    timing: ['response'], target: 'stack', rarity: 'common', price: 6, botBias: 0.85,
    text: 'Counter the sigil being cast. It never happened. Its mana is still spent.',
    impossible: 'Undoing an action during the instant it is taken.',
  },
  {
    id: 'redirect', name: 'Redirect', school: 'bind', glyph: '↯', cost: 2,
    timing: ['response'], target: 'stack', rarity: 'rare', price: 8, botBias: 0.7,
    text: 'Choose new targets for the sigil being cast. It resolves normally — somewhere else.',
    impossible: 'Steering an effect that is already in flight.',
  },
  {
    id: 'reflect', name: 'Reflect', school: 'entropy', glyph: '⟆', cost: 3,
    timing: ['response'], target: 'stack', rarity: 'rare', price: 10, botBias: 0.7,
    text: 'Copy the sigil being cast. Your copy resolves first, and you pick its targets.',
    impossible: 'Two castings of one card, from two hands, in one moment.',
  },
  {
    id: 'toll', name: 'Toll', school: 'ruin', glyph: '⚖', cost: 1,
    timing: ['response'], target: 'stack', rarity: 'common', price: 4, botBias: 0.6,
    text: 'The sigil being cast costs double. If its caster cannot pay the difference, it fizzles.',
    impossible: 'Retroactively repricing something already paid for.',
  },

  // =========================================================================
  // A second pass.
  //
  // Same house rule as everything above it: if a dealer could do it with a
  // binder clip and a good memory, it is not here. The schools that were
  // thinnest — Chronos and Weave, six apiece — get the most, and several of
  // these exist specifically to answer something that was previously
  // unanswerable. Salt the Earth is the first thing in the game that can undo
  // a Rite; Unweave is the first that can undo one card's worth.
  // =========================================================================

  // ------------------------------------------------------------------ ENTROPY
  {
    id: 'unsettle', name: 'Unsettle', school: 'entropy', glyph: '◌', cost: 2,
    timing: ['any'], target: 'any_card', rarity: 'common', price: 5, botBias: 0.5,
    text: 'A card that had already decided becomes undecided again, holding a second face nobody has seen.',
    impossible: 'Taking back a decision that everybody already watched being made.',
  },
  {
    id: 'decay', name: 'Decay', school: 'entropy', glyph: '⋰', cost: 3,
    timing: ['any'], target: 'none', rarity: 'rare', price: 8, botBias: 0.45,
    text: 'Every undecided card on the table loses one of its possible faces. Fewer futures, all round.',
    impossible: 'Deleting a possibility while leaving the object that had it.',
  },
  {
    id: 'unkind_eye', name: 'The Unkind Eye', school: 'entropy', glyph: '⊙', cost: 3,
    timing: ['any'], target: 'player', rarity: 'rare', price: 9, botBias: 0.55,
    text: 'Every undecided card the target holds settles right now, on its worst face. Looking is not free.',
    impossible: 'An observation that is both compulsory and unkind.',
  },

  // --------------------------------------------------------------------- VEIL
  {
    id: 'mirror_mask', name: 'Mirror Mask', school: 'veil', glyph: '☻', cost: 3,
    timing: ['any'], target: 'player', rarity: 'rare', price: 9, botBias: 0.5,
    text: 'One of your hole cards shows the target a card that is not there. They will bet against it.',
    impossible: 'One card, two truths, and only one of you knows which is which.',
  },
  {
    id: 'nightfall', name: 'Nightfall', school: 'veil', glyph: '☾', cost: 4,
    timing: ['flop', 'turn', 'river'], target: 'none', rarity: 'rare', price: 10, botBias: 0.4,
    text: 'The table goes dark. Nobody sees the community cards for the rest of the hand — you included.',
    impossible: 'A board that is in play and unreadable at the same time, for everyone at once.',
  },

  // ------------------------------------------------------------------ CHRONOS
  {
    id: 'stall', name: 'Stall', school: 'chronos', glyph: '⏸', cost: 2,
    timing: ['flop', 'turn', 'river'], target: 'none', rarity: 'common', price: 5, botBias: 0.4,
    text: 'This street does not end. One more full round of betting before the next card.',
    impossible: 'A round of betting that has already finished, happening again.',
  },
  {
    id: 'premonition', name: 'Premonition', school: 'chronos', glyph: '◈', cost: 2,
    timing: ['any'], target: 'rank', rarity: 'common', price: 5, botBias: 0.5,
    text: 'Name a rank. If anyone is holding it, draw two sigils. If nobody is, everyone else draws one.',
    impossible: 'Being paid for a guess about cards nobody has shown.',
  },
  {
    id: 'borrowed_time', name: 'Borrowed Time', school: 'chronos', glyph: '⧖', cost: 1,
    timing: ['any'], target: 'none', rarity: 'common', price: 5, botBias: 0.45,
    text: 'Take four mana now, from a street that has not happened. You gain none for the rest of this hand.',
    impossible: 'Spending a resource before the moment that would have produced it.',
  },

  // --------------------------------------------------------------------- BIND
  {
    id: 'weld', name: 'Weld', school: 'bind', glyph: '⊕', cost: 4,
    timing: ['any'], target: 'two_cards', rarity: 'rare', price: 10, botBias: 0.45,
    text: 'Two cards become one card holding both their faces. The second leaves the table entirely.',
    impossible: 'Two objects occupying one slot, and the slot counting as either.',
  },
  {
    id: 'yoke', name: 'Yoke', school: 'bind', glyph: '⋈', cost: 3,
    timing: ['preflop', 'flop', 'turn'], target: 'player', rarity: 'rare', price: 9, botBias: 0.5,
    text: 'You and the target trade one hole card, at random. Neither of you is told which one went.',
    impossible: 'An exchange with no hands, no shuffle and no way to audit it.',
  },

  // --------------------------------------------------------------------- RUIN
  {
    id: 'erase', name: 'Erase', school: 'ruin', glyph: '⌫', cost: 4,
    timing: ['any'], target: 'any_card', rarity: 'rare', price: 11, botBias: 0.45,
    text: 'The card is removed from the game. Not burned — it will not come back, because it was never printed.',
    impossible: 'Unprinting one card from a deck everybody has already seen.',
  },
  {
    id: 'salt_the_earth', name: 'Salt the Earth', school: 'ruin', glyph: '⁂', cost: 4,
    timing: ['any'], target: 'none', rarity: 'mythic', price: 13, botBias: 0.35,
    text: 'Every mark anywhere in the shared deck is scoured off. Whatever anyone paid to write, it is gone.',
    impossible: 'Erasing permanent ink from cards that are not on the table.',
  },

  // -------------------------------------------------------------------- WEAVE
  {
    id: 'counterfeit', name: 'Counterfeit', school: 'weave', glyph: '⎘', cost: 3,
    timing: ['flop', 'turn', 'river'], target: 'board_card', rarity: 'rare', price: 9, botBias: 0.6,
    text: 'Copy a community card into your hand as a third hole card. The original stays where it is.',
    impossible: 'One card in two places, both of them real.',
  },
  {
    id: 'unweave', name: 'Unweave', school: 'weave', glyph: '✂', cost: 2,
    timing: ['any'], target: 'any_card', rarity: 'common', price: 6, botBias: 0.4,
    text: 'Strip every mark from one card. Whatever was written on it is no longer written on it.',
    impossible: 'Removing something permanent, which is a contradiction the deck honours anyway.',
  },
  {
    id: 'first_draft', name: 'First Draft', school: 'weave', glyph: '⌗', cost: 3,
    timing: ['any'], target: 'none', rarity: 'rare', price: 9, botBias: 0.5,
    text: 'Write a Wild mark onto the next card the deck will deal, whoever ends up with it.',
    impossible: 'Editing a card before it exists to anyone but the deck.',
  },

  // ---------------------------------------------------- THE SECOND PRINTING
  // A later set. Four of these (Resonance, Graft, Gild, Loom) exist because
  // the game is named after hands a deck cannot make and a measured session
  // produced none at all: the only routes to Five of a Kind ran through one
  // uncommon mark. These are more doors to the same room.
  {
    id: 'quantum_leap', name: 'Quantum Leap', school: 'entropy', glyph: '⤨', cost: 3,
    timing: ['preflop', 'flop', 'turn'], target: 'own_card', rarity: 'common', price: 5, botBias: 0.55,
    text: 'Trade one of your hole cards with the top of the deck, sight unseen. You find out at the same time everyone else does.',
    impossible: 'A card returning to a deck it has already left, and the deck accepting it.',
  },
  {
    id: 'observer_effect', name: 'Observer Effect', school: 'entropy', glyph: '⊚', cost: 3,
    timing: ['flop', 'turn', 'river'], target: 'none', rarity: 'rare', price: 8, botBias: 0.5,
    text: 'Every undecided card in play settles at once, and each one lands on its kindest face. Including theirs.',
    impossible: 'Looking at a thing deciding what the thing is.',
  },
  {
    // Two, not one. At one mana it was the cheapest sigil in the game for an
    // effect that reads a whole hand, and a recorded session had three
    // different bots cast it in a single hand — which is both a tell that the
    // price was wrong and a lot of the same log line.
    id: 'cold_read', name: 'Cold Read', school: 'veil', glyph: '⌕', cost: 2,
    timing: ['any'], target: 'player', rarity: 'common', price: 5, botBias: 0.5,
    text: 'You see the target’s hole cards, truly and completely, for the rest of the hand. They are never told.',
    impossible: 'Reading a card face through its back.',
  },
  {
    id: 'palimpsest', name: 'Palimpsest', school: 'chronos', glyph: '⌗', cost: 4,
    timing: ['flop', 'turn', 'river'], target: 'board_card', rarity: 'rare', price: 9, botBias: 0.55,
    text: 'The target community card is sent back to the deck and replaced — and then the replacement is sent back and replaced again. The board has been written over twice.',
    impossible: 'A card that was dealt, twice, in the same place.',
  },
  {
    id: 'second_wind', name: 'Second Wind', school: 'chronos', glyph: '⤒', cost: 2,
    timing: ['any'], target: 'none', rarity: 'common', price: 5, botBias: 0.7,
    text: 'Draw two sigils.',
    impossible: 'Drawing from a deck of spells that was never shuffled into anything.',
  },
  {
    id: 'resonance', name: 'Resonance', school: 'bind', glyph: '≣', cost: 3,
    timing: ['flop', 'turn', 'river'], target: 'none', rarity: 'rare', price: 9, botBias: 0.6,
    text: 'Both of your hole cards take the suit of the first community card. Their ranks do not change.',
    impossible: 'Two cards changing suit because a third one is nearby.',
  },
  {
    id: 'graft', name: 'Graft', school: 'bind', glyph: '⊷', cost: 4,
    timing: ['any'], target: 'none', rarity: 'rare', price: 10, botBias: 0.6,
    text: 'One of your hole cards becomes an exact copy of the other. You are now holding the same card twice.',
    impossible: 'A pair made of one card.',
  },
  {
    id: 'ashes', name: 'Ashes', school: 'ruin', glyph: '⌆', cost: 2,
    timing: ['flop', 'turn', 'river'], target: 'none', rarity: 'common', price: 5, botBias: 0.5,
    text: 'The last card destroyed this hand returns to the board. The board is longer than it was.',
    impossible: 'Unburning something.',
  },
  {
    id: 'blight', name: 'Blight', school: 'ruin', glyph: '⌁', cost: 3,
    timing: ['any'], target: 'player', rarity: 'rare', price: 8, botBias: 0.5,
    text: 'A sigil rots out of the target’s hand at random. Neither of you learns which one it was.',
    impossible: 'A spell dying before anybody casts it.',
  },
  {
    id: 'gild', name: 'Gild', school: 'weave', glyph: '⬙', cost: 3,
    timing: ['flop', 'turn', 'river'], target: 'board_card', rarity: 'rare', price: 9, botBias: 0.6,
    text: 'A community card is gilded. It counts as every suit at once, for everyone.',
    impossible: 'One card being four suits.',
  },
  {
    id: 'loom', name: 'Loom', school: 'weave', glyph: '⊞', cost: 5,
    timing: ['preflop', 'flop', 'turn'], target: 'rank', rarity: 'mythic', price: 13, botBias: 0.5,
    text: 'Name a rank. The next community card is woven to order in that rank, in the suit you are already holding.',
    impossible: 'A card being made rather than drawn.',
  },
];

export const SIGIL_BY_ID: Record<string, SigilDef> = Object.fromEntries(
  SIGILS.map((s) => [s.id, s]),
);

export const RESPONSE_SIGILS = new Set(
  SIGILS.filter((s) => s.timing.includes('response')).map((s) => s.id),
);

/**
 * The sigils that answer another sigil on the stack rather than the table —
 * this game's counterspells. Derived from the target, so a new one joins the
 * set by being written, and "counter a counterspell" cannot drift away from
 * what the sigils actually do.
 */
export const STACK_SIGILS = new Set(
  SIGILS.filter((s) => s.target === 'stack').map((s) => s.id),
);

export const RARITY_WEIGHT: Record<Rarity, number> = { common: 10, rare: 4, mythic: 1 };

export const RARITY_COLOR: Record<Rarity, string> = {
  common: '#93a3b8',
  rare: '#6ec8ff',
  mythic: '#ffb347',
};

/** An instance of a sigil sitting in someone's hand. */
export interface SigilInstance {
  uid: string;
  defId: string;
}

export const defOf = (s: SigilInstance): SigilDef => SIGIL_BY_ID[s.defId];
