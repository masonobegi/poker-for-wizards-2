import type { CardEntity, CardView, Face, MarkId, Rank, Suit } from './cards';
import type { RuleMods } from './hand';
import type { SigilInstance } from './sigils';
import type { ActiveOmen } from './omens';

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type Phase =
  | 'lobby'
  | 'ante_intro'
  | 'deal'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'payout'
  | 'shop'
  | 'gameover';

export const STREETS: Phase[] = ['preflop', 'flop', 'turn', 'river'];
export const isStreet = (p: Phase): boolean => STREETS.includes(p);

export type ActionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface BetAction {
  kind: ActionKind;
  amount?: number;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface Player {
  id: string;
  name: string;
  seat: number;
  avatar: number;
  isBot: boolean;
  connected: boolean;

  chips: number;
  /** Committed on the current street. */
  bet: number;
  /** Committed across the whole hand. */
  committed: number;
  /** Concealed by Veiled Wager — the table sees a bet but not its size. */
  betVeiled: boolean;

  folded: boolean;
  allIn: boolean;
  eliminated: boolean;
  sittingOut: boolean;

  mana: number;
  maxMana: number;
  sigils: SigilInstance[];
  relics: string[];
  shards: number;

  /** Card entity ids of this player's hole cards. */
  hole: string[];
  /** Hole cards untargetable this hand (Gloaming). */
  warded: boolean;
  /** Shares hole cards with this player id (Sympathy). */
  sharedWith?: string;
  /** Mana drained by Sever — no regeneration until the next hand. */
  severed: boolean;
  /** Net category shift on this player's hand, from Hex and friends. */
  hexed: number;
  /** Blind Spot: they cannot see the community cards, but still play them. */
  blinded: boolean;

  lastAction?: { kind: ActionKind; amount: number; at: number };
  /** Private knowledge granted by sigils — never sent to anyone else. */
  foreknowledge: Foreknowledge;
  shopDone: boolean;
  ready: boolean;
  handsWon: number;
  biggestPot: number;
}

export interface Foreknowledge {
  /** Peeked upcoming deck cards, by entity id. */
  deckPeek: string[];
  /** Opponent hole cards this player has learned, entity id -> true. */
  seenHole: string[];
  /** Board cards showing this player a different face than the table. */
  divergedFrom: Record<string, Face>;
  /** Cards this player has been lied to about (False Face) — they see the lie. */
  lies: Record<string, Face>;
  /** Opponents whose sigil hands this player can read. */
  seenSigils: string[];
}

export const emptyForeknowledge = (): Foreknowledge => ({
  deckPeek: [], seenHole: [], divergedFrom: {}, lies: {}, seenSigils: [],
});

/** A named reading of the hand a player is currently holding. */
export interface HandRead {
  /** e.g. "Pair of Kings", "Flush House". */
  name: string;
  cat: number;
  /** The five card entity ids this reading uses, for highlighting them. */
  usedIds: string[];
  /** True when this reading needs the deck to have broken a physical law. */
  impossible: boolean;
}

export interface PlayerView {
  id: string;
  name: string;
  seat: number;
  avatar: number;
  isBot: boolean;
  connected: boolean;
  chips: number;
  bet: number;
  committed: number;
  betVeiled: boolean;
  folded: boolean;
  allIn: boolean;
  eliminated: boolean;
  mana: number;
  maxMana: number;
  /** Real sigils for yourself; only a count for everyone else. */
  sigils: SigilInstance[] | null;
  sigilCount: number;
  relics: string[];
  shards: number;
  hole: CardView[];
  warded: boolean;
  severed: boolean;
  hexed: number;
  blinded: boolean;
  lastAction?: Player['lastAction'];
  isYou: boolean;
  ready: boolean;
  shopDone: boolean;
  handsWon: number;
  /** Public — every pot is won in the open. Shown in the end-of-run recap. */
  biggestPot: number;
  /**
   * What this player currently holds, named. Only ever set on your own seat —
   * it is derived from your hole cards and your reading of the board, so it is
   * exactly the kind of thing `viewFor` exists to keep off the wire.
   * Undefined before the flop, once you have folded, and on the rare board too
   * expensive to read (see `handReadFor`).
   */
  handRead?: HandRead;
  /** Set at showdown. */
  result?: ShowdownEntry;
}

// ---------------------------------------------------------------------------
// Sigil stack
// ---------------------------------------------------------------------------

export interface SigilTargets {
  playerId?: string;
  cardIds?: string[];
  rank?: Rank;
  suit?: Suit;
  markId?: MarkId;
  faceIndex?: number;
  face?: Face;
}

export interface StackEntry {
  id: string;
  casterId: string;
  sigilId: string;
  targets: SigilTargets;
  /** Countered entries resolve to nothing but still show on the stack. */
  countered: boolean;
  costPaid: number;
}

export interface StackState {
  entries: StackEntry[];
  /** Players who still have the option to respond. */
  pending: string[];
  /** Wall-clock ms at which the response window shuts. */
  closesAt: number;
}

// ---------------------------------------------------------------------------
// Pots
// ---------------------------------------------------------------------------

export interface Pot {
  amount: number;
  /** Player ids eligible to win this pot. */
  eligible: string[];
  label?: string;
}

// ---------------------------------------------------------------------------
// Showdown
// ---------------------------------------------------------------------------

export interface ShowdownEntry {
  playerId: string;
  /** Empty when the player folded. */
  cards: CardView[];
  handName: string;
  cat: number;
  score: number;
  usedIds: string[];
  impossible: boolean;
  won: number;
  /** Second timeline result, when Echo of a Hand was cast. */
  echoName?: string;
  timelineUsed?: 'primary' | 'echo';
}

export interface PayoutInfo {
  pots: Array<{ amount: number; winners: string[]; label?: string }>;
  entries: ShowdownEntry[];
  shards: Record<string, number>;
  bestImpossible?: string;
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------

export type ShopItem =
  | { kind: 'sigil'; id: string; uid: string; price: number }
  | { kind: 'relic'; id: string; uid: string; price: number }
  | { kind: 'rite'; uid: string; price: number; markId: MarkId; cardId: string; label: string }
  | { kind: 'mana'; uid: string; price: number; amount: number };

export interface ShopState {
  items: ShopItem[];
  /** Items already bought this visit, by uid. */
  sold: string[];
  rerollCost: number;
  closesAt: number;
}

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

export type LogTone = 'plain' | 'bet' | 'magic' | 'impossible' | 'win' | 'warn';

export interface LogEntry {
  id: string;
  at: number;
  tone: LogTone;
  text: string;
  /** School id when the entry came from a sigil, for colouring. */
  school?: string;
  playerId?: string;
}

// ---------------------------------------------------------------------------
// Room / table
// ---------------------------------------------------------------------------

export interface RoomConfig {
  name: string;
  maxPlayers: number;
  startingChips: number;
  startingShards: number;
  baseBlind: number;
  /** Hands per ante before blinds escalate and the shop opens. */
  handsPerAnte: number;
  actionSeconds: number;
  responseSeconds: number;
  shopSeconds: number;
  magicEnabled: boolean;
  botFill: number;
  private: boolean;
}

export const DEFAULT_CONFIG: RoomConfig = {
  name: 'Table',
  maxPlayers: 6,
  startingChips: 20000,
  startingShards: 12,
  baseBlind: 200,
  handsPerAnte: 3,
  actionSeconds: 30,
  responseSeconds: 5,
  shopSeconds: 45,
  magicEnabled: true,
  botFill: 0,
  private: false,
};

/** Everything a single client is allowed to know, projected for that client. */
export interface TableView {
  code: string;
  config: RoomConfig;
  phase: Phase;
  handNumber: number;
  ante: number;
  bb: number;
  sb: number;
  handsUntilAnte: number;

  players: PlayerView[];
  youId: string;
  dealerSeat: number;
  actingId: string | null;
  /** Wall-clock ms the acting player's timer expires. */
  actingUntil: number | null;

  board: CardView[];
  /** Board slots destroyed by Burn, for the gap animation. */
  burnedSlots: number[];
  deckCount: number;
  /** Visible only with Thin Veil. */
  deckTop: CardView | null;
  /** Cards peeked with Second Sight / Foresight, for your eyes only. */
  peeked: CardView[];

  pot: number;
  pots: Pot[];
  currentBet: number;
  minRaise: number;
  toCall: number;
  canCheck: boolean;

  stack: StackState | null;
  stackEntries: Array<StackEntry & { sigilName: string; casterName: string; school: string }>;

  /** Table-wide rules in force this hand, from sigils. */
  activeMods: RuleMods;
  modNotes: string[];
  /** Permanent rules imposed at each ante. */
  omens: ActiveOmen[];
  /** The omen that landed this ante, for the announcement. */
  newOmen: ActiveOmen | null;

  shop: ShopState | null;
  payout: PayoutInfo | null;
  log: LogEntry[];

  /** True when this client may act on the betting. */
  yourTurn: boolean;
  /** Sigil uids this client may legally cast right now. */
  castable: string[];
  hostId: string;
  winnerId: string | null;
}

// ---------------------------------------------------------------------------
// Server-side table (not sent over the wire)
// ---------------------------------------------------------------------------

export interface Timeline {
  boardIds: string[];
  label: string;
  /** Only this player may score from the second timeline. */
  ownerId: string;
}

export interface Table {
  code: string;
  config: RoomConfig;
  hostId: string;
  phase: Phase;
  handNumber: number;
  ante: number;
  bb: number;
  sb: number;

  players: Player[];
  /** Entity store — every card that exists, by id. */
  cards: Map<string, CardEntity>;
  /** Draw pile, as entity ids. */
  deck: string[];
  /** Cards removed from play this hand. */
  discard: string[];
  board: string[];
  burnedSlots: number[];
  /** Parallel board for Echo of a Hand. */
  echoTimeline: Timeline | null;

  dealerSeat: number;
  actingId: string | null;
  actingUntil: number | null;
  /** Seat index that closes the current betting round. */
  lastAggressorId: string | null;
  actedThisStreet: Set<string>;

  pot: number;
  pots: Pot[];
  currentBet: number;
  minRaise: number;

  stack: StackState | null;
  /** Table-wide mods applied by sigils this hand. */
  mods: RuleMods;
  modNotes: string[];
  /** Ranks sealed face down this hand. */
  sealedRanks: Rank[];
  /** Marks granted for one hand only; stripped when the hand ends. */
  tempMarks: Array<{ cardId: string; markId: MarkId }>;
  /** Set by Schrödinger's Flop — the next flop arrives undecided. */
  quantumFlop: boolean;
  /** Permanent table-wide rules, one added per ante. They never come off. */
  omens: ActiveOmen[];

  shop: Map<string, ShopState>;
  payout: PayoutInfo | null;
  log: LogEntry[];
  seed: string;
  createdAt: number;
  lastActivity: number;
  winnerId: string | null;
}
