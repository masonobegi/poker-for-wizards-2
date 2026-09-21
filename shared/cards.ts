/**
 * The Impossible Deck.
 *
 * A card here is not a (rank, suit) pair — it is an *entity* that may hold more
 * than one identity at once, show a different identity to different players,
 * carry permanent inscriptions, and remember the hands it has been part of.
 * None of that survives contact with cardboard, which is the whole point.
 */
import type { Rng } from './rng';

export type Suit = 'S' | 'H' | 'D' | 'C';
export const SUITS: readonly Suit[] = ['S', 'H', 'D', 'C'] as const;

/** 2..10 = pip value, 11 = J, 12 = Q, 13 = K, 14 = A. */
export type Rank = number;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

export const RANK_LABEL: Record<Rank, string> = {
  2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
  11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export const RANK_NAME: Record<Rank, string> = {
  2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight',
  9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace',
};

export const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME: Record<Suit, string> = {
  S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs',
};

/** A single concrete identity a card may be wearing. */
export interface Face {
  rank: Rank;
  suit: Suit;
}

export const faceKey = (f: Face): string => `${f.rank}${f.suit}`;
export const faceLabel = (f: Face): string => `${RANK_LABEL[f.rank]}${SUIT_GLYPH[f.suit]}`;
export const faceName = (f: Face): string => `${RANK_NAME[f.rank]} of ${SUIT_NAME[f.suit]}`;
export const isRed = (s: Suit): boolean => s === 'H' || s === 'D';

// ---------------------------------------------------------------------------
// Inscriptions — permanent marks bound to one card entity, not to a rank.
// ---------------------------------------------------------------------------

export type MarkId =
  | 'wild'       // counts as any rank and suit
  | 'prism'      // counts as any suit
  | 'blooded'    // +1 rank when it scores
  | 'leaden'     // -1 rank when it scores
  | 'mirrored'   // copies the card to its left on the board
  | 'cursed'     // its owner's hand loses one category step
  | 'burning'    // discarded after the street it appears on
  | 'bound'      // entangled with another card
  | 'echo';      // remembers: +1 rank per pot it has already won

export interface MarkDef {
  id: MarkId;
  name: string;
  glyph: string;
  color: string;
  blurb: string;
}

export const MARKS: Record<MarkId, MarkDef> = {
  wild:     { id: 'wild',     name: 'Wild',     glyph: '✶', color: '#ffd76e', blurb: 'Counts as any rank and any suit.' },
  prism:    { id: 'prism',    name: 'Prism',    glyph: '◈', color: '#7ee8fa', blurb: 'Counts as any suit.' },
  blooded:  { id: 'blooded',  name: 'Blooded',  glyph: '✚', color: '#ff6b81', blurb: 'Scores one rank higher.' },
  leaden:   { id: 'leaden',   name: 'Leaden',   glyph: '▼', color: '#9aa4b2', blurb: 'Scores one rank lower.' },
  mirrored: { id: 'mirrored', name: 'Mirrored', glyph: '⧉', color: '#c4a7ff', blurb: 'Copies the board card to its left.' },
  cursed:   { id: 'cursed',   name: 'Cursed',   glyph: '☠', color: '#8b5cf6', blurb: 'Its holder ranks one category lower.' },
  burning:  { id: 'burning',  name: 'Burning',  glyph: '🜂', color: '#ff9a3c', blurb: 'Burns away at the end of the street.' },
  bound:    { id: 'bound',    name: 'Bound',    glyph: '∞', color: '#5eead4', blurb: 'Entangled — changing one changes both.' },
  echo:     { id: 'echo',     name: 'Echo',     glyph: '◉', color: '#a3e635', blurb: 'Scores +1 rank for every pot it has won.' },
};

// ---------------------------------------------------------------------------
// Card entity
// ---------------------------------------------------------------------------

/** How much of a card the table is allowed to know. */
export type Veil =
  | 'open'      // fully visible to everyone who can see the card at all
  | 'rank'      // rank public, suit concealed
  | 'suit'      // suit public, rank concealed
  | 'sealed';   // nothing public — face down even to its owner

export interface CardEntity {
  id: string;
  /** One identity normally. Two or more means the card is in superposition. */
  faces: Face[];
  /** Index into `faces` once observed; null while the card is still undecided. */
  collapsed: number | null;
  marks: MarkId[];
  /** Per-player identity overrides — the same object, two different truths. */
  divergent?: Record<string, Face>;
  /** Id of the card entity this one is entangled with. */
  entangledWith?: string;
  veil: Veil;
  /** Pots this card has been part of a winning hand for. */
  memory: number;
  /** Set while the card is mid-flight so the client can animate its arrival. */
  origin?: 'deck' | 'weave' | 'conjured' | 'stolen';
}

let cardCounter = 0;
export const nextCardId = (): string => `c${(++cardCounter).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export function makeCard(rank: Rank, suit: Suit, patch: Partial<CardEntity> = {}): CardEntity {
  return {
    id: nextCardId(),
    faces: [{ rank, suit }],
    collapsed: 0,
    marks: [],
    veil: 'open',
    memory: 0,
    ...patch,
  };
}

/** A 52-card deck of ordinary entities. Impossibility is added later, by play. */
export function standardDeck(): CardEntity[] {
  const deck: CardEntity[] = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(makeCard(rank, suit));
  return deck;
}

export const isQuantum = (c: CardEntity): boolean => c.faces.length > 1 && c.collapsed === null;

/**
 * The identity a given observer sees. Divergence is checked first: a card can
 * genuinely be the King of Spades to you and the Four of Diamonds to the player
 * across the table, and both readings score.
 */
export function faceFor(card: CardEntity, viewerId: string | null): Face | null {
  if (viewerId && card.divergent?.[viewerId]) return card.divergent[viewerId];
  if (card.collapsed !== null) return card.faces[card.collapsed] ?? null;
  return null;
}

/** Every identity a card could still resolve to, for a given observer. */
export function possibleFaces(card: CardEntity, viewerId: string | null): Face[] {
  if (viewerId && card.divergent?.[viewerId]) return [card.divergent[viewerId]];
  if (card.collapsed !== null) return [card.faces[card.collapsed]];
  return card.faces;
}

/** Force a superposed card into one identity. Returns the face it landed on. */
export function collapse(card: CardEntity, rng: Rng, prefer?: number): Face {
  if (card.collapsed !== null) return card.faces[card.collapsed];
  const idx = prefer !== undefined && prefer >= 0 && prefer < card.faces.length ? prefer : rng.int(card.faces.length);
  card.collapsed = idx;
  return card.faces[idx];
}

// ---------------------------------------------------------------------------
// Card view — what one specific player is permitted to know. The server sends
// a different view of the same entity to every seat.
// ---------------------------------------------------------------------------

export type CardViewState = 'facedown' | 'faceup' | 'quantum' | 'veiled';

export interface CardView {
  id: string;
  state: CardViewState;
  /** Full identity, when the viewer is allowed all of it. */
  face: Face | null;
  /** Superposition cloud, when the viewer may see the possibilities. */
  possible?: Face[];
  /** Partial leaks, for 'veiled' cards. */
  rank?: Rank;
  suit?: Suit;
  marks: MarkId[];
  memory: number;
  /** True when this viewer's reading differs from the table's reading. */
  diverged?: boolean;
  entangled?: boolean;
  origin?: CardEntity['origin'];
}

export interface ViewOptions {
  /** Viewer may see the true identity regardless of veil (their own cards, showdown). */
  reveal: boolean;
  viewerId: string | null;
  /** Showdown lifts even a sealed veil — this is the only thing that does. */
  showdown?: boolean;
}

/**
 * Project one card for one viewer.
 *
 * `reveal` is the gate: it answers "is this viewer entitled to this card's
 * identity at all?" and the caller decides it from whose cards these are.
 * `veil` only ever *narrows* what an entitled viewer gets to read. Getting that
 * order the wrong way round sends every hole card at the table to every client,
 * so the gate is checked first and there is exactly one way past it.
 */
export function viewCard(card: CardEntity, opts: ViewOptions): CardView {
  const { reveal, viewerId } = opts;
  const base: CardView = {
    id: card.id,
    state: 'facedown',
    face: null,
    marks: card.marks,
    memory: card.memory,
    entangled: card.entangledWith ? true : undefined,
    origin: card.origin,
  };

  const diverged = !!(viewerId && card.divergent?.[viewerId]);
  if (diverged) base.diverged = true;

  // A sealed card is hidden from its own holder too. Only showdown opens it.
  if (card.veil === 'sealed' && !opts.showdown) return base;

  if (!reveal) {
    // Superposition is visible from across the table — the card plainly has not
    // decided — but which identities it is choosing between is not.
    return isQuantum(card) ? { ...base, state: 'quantum' } : base;
  }

  if (isQuantum(card) && !diverged) {
    return { ...base, state: 'quantum', face: null, possible: card.faces };
  }

  const f = faceFor(card, viewerId);
  if (!f) return base;

  if (card.veil === 'rank') return { ...base, state: 'veiled', rank: f.rank };
  if (card.veil === 'suit') return { ...base, state: 'veiled', suit: f.suit };
  return { ...base, state: 'faceup', face: f };
}

/** Short human label used in the game log. */
export function cardLabel(card: CardEntity, viewerId: string | null = null): string {
  if (isQuantum(card)) return card.faces.map(faceLabel).join('|');
  const f = faceFor(card, viewerId);
  return f ? faceLabel(f) : '??';
}
