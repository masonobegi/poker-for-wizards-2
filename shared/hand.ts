/**
 * Hand evaluation for a deck that does not obey physics.
 *
 * Beyond the standard nine categories this understands Five of a Kind, Flush
 * House and Flush Five — hands that are unreachable with fifty-two physical
 * cards but ordinary here, because a card can be wild, prismatic, duplicated by
 * a mirror, or in two states at once.
 *
 * Evaluation is exhaustive: every identity a card could be wearing is tried and
 * the best reading wins. That search *is* the collapse — observing the hand is
 * what forces the deck to decide.
 */
import {
  type CardEntity, type Face, type MarkId, type Rank, type Suit, RANKS, SUITS,
  RANK_LABEL, RANK_NAME, faceKey, marksFor, possibleFaces,
} from './cards';

export enum Cat {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
  FiveOfAKind = 9,
  FlushHouse = 10,
  FlushFive = 11,
}

export const CAT_NAME: Record<Cat, string> = {
  [Cat.HighCard]: 'High Card',
  [Cat.Pair]: 'Pair',
  [Cat.TwoPair]: 'Two Pair',
  [Cat.Trips]: 'Three of a Kind',
  [Cat.Straight]: 'Straight',
  [Cat.Flush]: 'Flush',
  [Cat.FullHouse]: 'Full House',
  [Cat.Quads]: 'Four of a Kind',
  [Cat.StraightFlush]: 'Straight Flush',
  [Cat.FiveOfAKind]: 'Five of a Kind',
  [Cat.FlushHouse]: 'Flush House',
  [Cat.FlushFive]: 'Flush Five',
};

/** Categories that cannot exist in a physical deck — worth extra fanfare. */
export const IMPOSSIBLE_CATS = new Set<Cat>([Cat.FiveOfAKind, Cat.FlushHouse, Cat.FlushFive]);

export interface RuleMods {
  /** Hearts=Diamonds and Spades=Clubs for every flush check. */
  mergedColors?: boolean;
  /** Aces bridge the ends: Q-K-A-2-3 is a straight. */
  wheelWrap?: boolean;
  /** These ranks are struck from every hand. */
  deadRanks?: Rank[];
  /** The worst hand takes the pot. */
  lowWins?: boolean;
  /** Cards needed for a flush. Default 5. */
  flushSize?: number;
  /** Cards needed for a straight. Default 5. */
  straightSize?: number;
  /** Jacks and Queens may be read as Kings. */
  facesAreKings?: boolean;
  /** Category bump applied after evaluation (relics, Hex). */
  categoryShift?: number;
  /** Long Memory: every card scores +1 rank per pot it has already won. */
  memoryBonus?: boolean;
  /** Stepping Stones: a straight may skip one rank (5-6-8-9-10). */
  straightGap?: boolean;
  /** The Lodestone: every card printed with one of these ranks is Wild. */
  wildRanks?: Rank[];
  /** The Prism Lens: a Prism card is fully Wild. */
  prismIsWild?: boolean;
  /** The Twinned's creed: of two cards with the same face, one held, the second is Wild. */
  copiesWild?: boolean;
  /**
   * The hole cards a Kin copy has to touch (set by the server from the
   * reader's own hole). Without it, any two cards with one face qualify.
   */
  kinHole?: string[];
}

export interface HandResult {
  cat: Cat;
  /** Ordered tiebreak ranks, most significant first. */
  ranks: number[];
  /** Comparable scalar. Higher is better (before `lowWins` inversion). */
  score: number;
  /** The five entity ids that made the hand. */
  usedIds: string[];
  /** The concrete identities those five cards resolved to. */
  usedFaces: Face[];
  name: string;
  /** True when this reading required the deck to break a physical law. */
  impossible: boolean;
}

const CAT_WEIGHT = 15 ** 5;

function scoreOf(cat: Cat, ranks: number[]): number {
  let s = cat * CAT_WEIGHT;
  let w = CAT_WEIGHT;
  for (let i = 0; i < 5; i++) {
    w /= 15;
    s += (ranks[i] ?? 0) * w;
  }
  return s;
}

export function describe(r: HandResult): string {
  const [a, b] = r.ranks;
  const n = (x: number) => RANK_NAME[clampRank(x)] ?? String(x);
  /** "Six" needs "es", every other rank name takes a bare "s". */
  const p = (x: number) => {
    const name = n(x);
    return /(?:s|x|z|ch|sh)$/i.test(name) ? `${name}es` : `${name}s`;
  };
  /**
   * A category shift moves a hand up or down the ladder but keeps the ranks the
   * old category produced, so a promoted Five of a Kind arrives at Flush House
   * carrying one rank where two are read. Naming the pair it does not have
   * printed "Kings over undefineds" on the payout banner.
   */
  const pairing = (label: string, join: string) => (
    b === undefined ? `${label}, ${p(a)}` : `${label}, ${p(a)} ${join} ${p(b)}`
  );
  switch (r.cat) {
    case Cat.FlushFive: return `Flush Five, ${p(a)}`;
    case Cat.FlushHouse: return pairing('Flush House', 'over');
    case Cat.FiveOfAKind: return `Five of a Kind, ${p(a)}`;
    case Cat.StraightFlush: return a === 14 ? 'Royal Flush' : `Straight Flush, ${n(a)} high`;
    case Cat.Quads: return `Four of a Kind, ${p(a)}`;
    case Cat.FullHouse: return pairing('Full House', 'over');
    case Cat.Flush: return `Flush, ${n(a)} high`;
    case Cat.Straight: return `Straight, ${n(a)} high`;
    case Cat.Trips: return `Three of a Kind, ${p(a)}`;
    case Cat.TwoPair: return pairing('Two Pair', 'and');
    case Cat.Pair: return `Pair of ${p(a)}`;
    default: return `${n(a)} High`;
  }
}

const clampRank = (r: number): Rank => Math.max(2, Math.min(14, Math.round(r)));

// ---------------------------------------------------------------------------
// Face candidate expansion
// ---------------------------------------------------------------------------

const MAX_COMBOS = 3000;

/** Suit equivalence class under the active rules. */
const suitClass = (s: Suit, mods: RuleMods): string =>
  mods.mergedColors ? (s === 'H' || s === 'D' ? 'R' : 'B') : s;

/** Apply per-card inscriptions that shift a rank. */
function markedRank(card: CardEntity, rank: Rank, mods: RuleMods, marks: readonly MarkId[] = card.marks): Rank {
  let r: number = rank;
  if (marks.includes('blooded')) r += 1;
  if (marks.includes('leaden')) r -= 1;
  if (marks.includes('echo') || mods.memoryBonus) r += card.memory;
  return clampRank(r);
}

/**
 * The cards a rule makes Wild for this reader, on top of their Wild marks:
 * the Lodestone's rank, a Prism under the Prism Lens, and, under the
 * Twinned's creed, every card after the first with the same printed face,
 * when one of the two is in the reader's own hole (`kinHole`).
 *
 * Kin first counted any two cards with one face, which made every pair on
 * the board a Wild for the Twinned: the Twinned omen alone puts seven
 * mirrored cards in the deck. Measured on 70 Twinned runs each way it took
 * them from 20 runs won to 43 (FUN-REVIEW.md, round 4). A copy they made or
 * hold (Graft, Twin, Counterfeit) is their kin; a pair the table shares is
 * not.
 */
function wildByRule(cards: CardEntity[], viewerId: string | null, mods: RuleMods): Set<string> {
  const out = new Set<string>();
  if (!mods.wildRanks?.length && !mods.prismIsWild && !mods.copiesWild) return out;
  const seen = new Map<string, string>();
  for (const c of cards) {
    const faces = possibleFaces(c, viewerId);
    if (faces.length !== 1) continue;
    const f = faces[0];
    if (mods.wildRanks?.includes(f.rank)) out.add(c.id);
    if (mods.prismIsWild && marksFor(c, viewerId).includes('prism')) out.add(c.id);
    if (mods.copiesWild) {
      const k = faceKey(f);
      const first = seen.get(k);
      if (first !== undefined && (!mods.kinHole || mods.kinHole.includes(first) || mods.kinHole.includes(c.id))) out.add(c.id);
      if (first === undefined) seen.set(k, c.id);
    }
  }
  return out;
}

/**
 * A candidate face. `anySuit` marks a face whose suit is not fixed (a wild,
 * or a prism): it counts toward whichever flush the rest of the five make.
 */
type Cand = Face & { anySuit?: true };

interface Slot {
  card: CardEntity;
  candidates: Cand[];
}

function buildSlots(cards: CardEntity[], viewerId: string | null, mods: RuleMods): Slot[] {
  const dead = new Set(mods.deadRanks ?? []);
  const presentRanks = new Set<Rank>();
  const presentSuits = new Set<Suit>();

  for (const c of cards) {
    for (const f of possibleFaces(c, viewerId)) {
      presentRanks.add(markedRank(c, f.rank, mods, marksFor(c, viewerId)));
      presentSuits.add(f.suit);
    }
  }
  if (presentSuits.size === 0) SUITS.forEach((s) => presentSuits.add(s));
  const ruledWild = wildByRule(cards, viewerId, mods);

  const slots: Slot[] = [];
  for (const card of cards) {
    let cands: Cand[];
    const marks = marksFor(card, viewerId);

    if (marks.includes('wild') || ruledWild.has(card.id)) {
      // A wild is genuinely any card, so every rank has to be on the table —
      // restricting it to ranks already in play would stop it filling the gap
      // in a straight, which is most of what a wild is for. Its suit is not
      // enumerated: it joins whichever flush the other four make (score5).
      // Enumerating it over every suit in play made a wild 52 candidates and
      // a deck with five of them stalled the bots' Monte Carlo reads.
      const suit = presentSuits.values().next().value as Suit;
      cands = [];
      for (const r of RANKS) cands.push({ rank: r, suit, anySuit: true });
    } else {
      const base = possibleFaces(card, viewerId);
      cands = [];
      for (const f of base) {
        let rank = markedRank(card, f.rank, mods, marks);
        if (mods.facesAreKings && (rank === 11 || rank === 12)) rank = 13;
        if (dead.has(rank)) continue;
        if (marks.includes('prism')) {
          // Any suit, decided by the flush test rather than enumerated: one
          // candidate, not four (see the wild above).
          cands.push({ rank, suit: f.suit, anySuit: true });
        } else {
          cands.push({ rank, suit: f.suit });
        }
      }
    }

    // Dedupe and drop dead ranks.
    const seen = new Set<string>();
    cands = cands.filter((f) => {
      if (dead.has(f.rank)) return false;
      const k = f.anySuit ? `${f.rank}*` : `${f.rank}${f.suit}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (cands.length === 0) continue; // card is struck from the hand entirely
    slots.push({ card, candidates: cands });
  }
  return slots;
}

/**
 * Keep the combination space bounded, losing as little of the best line as
 * possible. The widest slot (a wild) is halved first, keeping the ranks the
 * other cards can also be (what a wild pairs with), then the highest. It used
 * to keep the first half in rank order, so a trimmed wild could be a Two but
 * never an Ace.
 */
function trimSlots(slots: Slot[], cap = MAX_COMBOS): Slot[] {
  let product = slots.reduce((a, s) => a * s.candidates.length, 1);
  if (product <= cap) return slots;

  const out = slots.map((s) => ({ ...s, candidates: s.candidates.slice() }));
  while (product > cap) {
    out.sort((a, b) => b.candidates.length - a.candidates.length);
    const widest = out[0];
    if (widest.candidates.length <= 1) break;
    const held = new Set<number>();
    // Only real cards count as what a wild could pair with: another wild
    // can be any rank, which would make every rank look held.
    for (const s of out) if (s !== widest && s.candidates.length <= 4) for (const c of s.candidates) held.add(c.rank);
    const keep = widest.candidates.slice().sort((a, b) =>
      Number(held.has(b.rank)) - Number(held.has(a.rank)) || b.rank - a.rank);
    product /= widest.candidates.length;
    widest.candidates = keep.slice(0, Math.max(1, Math.ceil(keep.length / 2)));
    product *= widest.candidates.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core five-card scoring
// ---------------------------------------------------------------------------

interface Five {
  cat: Cat;
  ranks: number[];
}

function score5(faces: Cand[], mods: RuleMods): Five {
  const flushSize = mods.flushSize ?? 5;
  const straightSize = mods.straightSize ?? 5;

  // Rank counts without a Map: this runs hundreds of thousands of times a
  // second when the bots read a board full of wilds.
  const rk: number[] = [];
  const ct: number[] = [];
  let mask = 0;
  for (const f of faces) {
    mask |= 1 << f.rank;
    const j = rk.indexOf(f.rank);
    if (j < 0) { rk.push(f.rank); ct.push(1); } else ct[j]++;
  }

  // A face of no fixed suit (wild, prism) joins the biggest suit among the
  // rest, which is exactly the best of enumerating it over every suit in play.
  const suitCounts = new Map<string, number>();
  let anySuit = 0;
  let topSuit = 0;
  for (const f of faces) {
    if (f.anySuit) { anySuit++; continue; }
    const k = suitClass(f.suit, mods);
    const n = (suitCounts.get(k) ?? 0) + 1;
    suitCounts.set(k, n);
    if (n > topSuit) topSuit = n;
  }
  const isFlush = topSuit + anySuit >= flushSize;

  // Groups sorted by count desc, then rank desc.
  const groups: Array<[number, number]> = rk.map((r, j) => [r, ct[j]]);
  groups.sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [g0, g1] = groups;
  const kickers = () => faces.map((f) => f.rank).sort((a, b) => b - a);

  const straightHigh = straightSize >= 2
    ? bestStraightBits(mask, straightSize, !!mods.wheelWrap, !!mods.straightGap)
    : bestStraight(rk, straightSize, !!mods.wheelWrap);

  // Impossible tier first.
  if (g0?.[1] >= 5) {
    if (isFlush) return { cat: Cat.FlushFive, ranks: [g0[0]] };
    return { cat: Cat.FiveOfAKind, ranks: [g0[0]] };
  }
  if (g0?.[1] === 3 && g1?.[1] === 2 && isFlush) {
    return { cat: Cat.FlushHouse, ranks: [g0[0], g1[0]] };
  }
  if (isFlush && straightHigh > 0) return { cat: Cat.StraightFlush, ranks: [straightHigh] };
  if (g0?.[1] === 4) return { cat: Cat.Quads, ranks: [g0[0], g1?.[0] ?? 0] };
  if (g0?.[1] === 3 && g1?.[1] === 2) return { cat: Cat.FullHouse, ranks: [g0[0], g1[0]] };
  if (isFlush) return { cat: Cat.Flush, ranks: kickers() };
  if (straightHigh > 0) return { cat: Cat.Straight, ranks: [straightHigh] };
  if (g0?.[1] === 3) {
    const ks = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { cat: Cat.Trips, ranks: [g0[0], ...ks] };
  }
  if (g0?.[1] === 2 && g1?.[1] === 2) {
    const hi = Math.max(g0[0], g1[0]);
    const lo = Math.min(g0[0], g1[0]);
    const k = groups.slice(2).map((g) => g[0]).sort((a, b) => b - a);
    return { cat: Cat.TwoPair, ranks: [hi, lo, ...k] };
  }
  if (g0?.[1] === 2) {
    const ks = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { cat: Cat.Pair, ranks: [g0[0], ...ks] };
  }
  return { cat: Cat.HighCard, ranks: kickers() };
}

/**
 * `bestStraight` on a bitmask of ranks (bit r set for rank r), for size 2 and up.
 *
 * With `gap` (Stepping Stones) a straight may skip one rank: `size` ranks
 * inside a window one longer, topped by the card that names it, so 5-6-8-9-10
 * is a Ten-high straight. An unbroken run passes the same test, so the first
 * top card found from the Ace down is the best straight either way.
 */
const RING: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const popcount = (x: number): number => { let n = 0; while (x) { x &= x - 1; n++; } return n; };
function bestStraightBits(mask: number, size: number, wrap: boolean, gap = false): number {
  const m = mask & (1 << 14) ? mask | (1 << 1) : mask; // the wheel: an ace is also a one
  const run = (1 << size) - 1;
  for (let high = 14; high >= size; high--) {
    if (((m >> (high - size + 1)) & run) === run) return high;
    if (gap && (m & (1 << high))) {
      const lo = Math.max(1, high - size);
      const window = (m >> lo) & ((1 << (high - lo + 1)) - 1);
      if (popcount(window) >= size) return high;
    }
  }
  if (!wrap) return 0;
  // Q-K-A-2-3 and friends: rank space as a ring of 13 from 2..14.
  let best = 0;
  const span = gap ? size + 1 : size;
  for (let s = 0; s < RING.length; s++) {
    const top = RING[(s + span - 1) % RING.length];
    if (!(mask & (1 << top))) continue;
    let held = 0;
    for (let i = 0; i < span; i++) if (mask & (1 << RING[(s + i) % RING.length])) held++;
    if (held >= size) best = Math.max(best, top);
  }
  return best;
}

/** Highest card of a run of `size`, or 0. Handles the wheel and, optionally, wraparound. */
function bestStraight(ranksIn: number[], size: number, wrap: boolean): number {
  const set = new Set(ranksIn);
  if (set.has(14)) set.add(1); // wheel: A-2-3-4-5
  const sorted = [...set].sort((a, b) => a - b);

  let best = 0;
  for (const start of sorted) {
    let ok = true;
    for (let i = 1; i < size; i++) if (!set.has(start + i)) { ok = false; break; }
    if (ok) best = Math.max(best, start + size - 1 === 1 ? 5 : start + size - 1);
  }
  if (best > 0) return best === 1 ? 5 : best;

  if (wrap) {
    // Q-K-A-2-3 and friends: treat rank space as a ring of 13 from 2..14.
    const ring = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    for (let s = 0; s < ring.length; s++) {
      let ok = true;
      let high = 0;
      for (let i = 0; i < size; i++) {
        const r = ring[(s + i) % ring.length];
        if (!set.has(r)) { ok = false; break; }
        high = r;
      }
      if (ok) best = Math.max(best, high);
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

const combinations = (n: number, k: number): number[][] => {
  const out: number[][] = [];
  const idx = Array.from({ length: k }, (_, i) => i);
  if (k > n) return out;
  for (;;) {
    out.push(idx.slice());
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
};

const comboCache = new Map<string, number[][]>();
function combosOf(n: number, k: number): number[][] {
  const key = `${n}:${k}`;
  let c = comboCache.get(key);
  if (!c) { c = combinations(n, k); comboCache.set(key, c); }
  return c;
}

export interface EvalInput {
  cards: CardEntity[];
  viewerId: string | null;
  mods?: RuleMods;
  /**
   * A lower bound on the search for callers that want an estimate, not the
   * answer: a bot's Monte Carlo read evaluates thousands of random hands a
   * decision. Showdowns leave it unset and get the exact hand.
   */
  maxCombos?: number;
}

const EMPTY: HandResult = {
  cat: Cat.HighCard, ranks: [0, 0, 0, 0, 0], score: -1,
  usedIds: [], usedFaces: [], name: 'No Hand', impossible: false,
};

/**
 * Roughly how many five-card readings `evaluate` would have to score for this
 * input: the sum, over every five-card subset, of the product of those five
 * slots' candidate faces. Cheap to compute — it walks the same slots without
 * scoring any of them.
 *
 * Wilds are what make this explode. A wild slot carries one candidate per rank
 * per suit in play, so two wilds and two superposed cards in one nine-card
 * hand is over a million readings and takes about a tenth of a second. That is
 * fine once, at showdown, where the answer has to be exact and the table is
 * waiting for it anyway. It is not fine on any hot path, and by ante five
 * "three cards in the shared deck quietly become Wild" is a rule the game
 * deals itself. This is how a caller checks the bill before committing.
 */
export function evalComplexity({ cards, viewerId, mods = {} }: EvalInput): number {
  const slots = trimSlots(buildSlots(cards, viewerId, mods));
  if (slots.length < 5) return 0;
  const lens = slots.map((s) => s.candidates.length);
  let total = 0;
  for (const subset of combosOf(slots.length, 5)) {
    let p = 1;
    for (let i = 0; i < 5; i++) p *= lens[subset[i]];
    total += p;
  }
  return total;
}

export function evaluate({ cards, viewerId, mods = {}, maxCombos }: EvalInput): HandResult {
  const slots = trimSlots(buildSlots(cards, viewerId, mods), maxCombos);
  if (slots.length < 5) return EMPTY;

  const n = slots.length;
  const subsets = combosOf(n, 5);
  const cursed = slots.some((s) => s.card.marks.includes('cursed'));

  let best: HandResult | null = null;

  const pick: Cand[] = new Array(5);
  const picked: Slot[] = new Array(5);

  for (const subset of subsets) {
    for (let i = 0; i < 5; i++) picked[i] = slots[subset[i]];

    // Walk the cartesian product of the five slots' candidate faces.
    const lens = picked.map((s) => s.candidates.length);
    const total = lens.reduce((a, b) => a * b, 1);

    for (let t = 0; t < total; t++) {
      let rem = t;
      for (let i = 0; i < 5; i++) {
        pick[i] = picked[i].candidates[rem % lens[i]];
        rem = Math.floor(rem / lens[i]);
      }
      const five = score5(pick, mods);
      const s = scoreOf(five.cat, five.ranks);
      if (!best || s > best.score) {
        best = {
          cat: five.cat,
          ranks: five.ranks,
          score: s,
          usedIds: picked.map((p) => p.card.id),
          usedFaces: pick.slice(),
          name: '',
          impossible: IMPOSSIBLE_CATS.has(five.cat),
        };
      }
    }
  }

  if (!best) return EMPTY;

  // Post-evaluation category shifts (curses, relics).
  let shift = mods.categoryShift ?? 0;
  if (cursed) shift -= 1;
  if (shift !== 0) {
    const cat = Math.max(0, Math.min(Cat.FlushFive, best.cat + shift)) as Cat;
    best = { ...best, cat, score: scoreOf(cat, best.ranks), impossible: IMPOSSIBLE_CATS.has(cat) };
  }

  best.name = describe(best);
  return best;
}

/** Compare two results under the active rules. Positive means `a` wins. */
export function compareHands(a: HandResult, b: HandResult, mods: RuleMods = {}): number {
  const d = a.score - b.score;
  return mods.lowWins ? -d : d;
}

/** Rough strength readout, 0..1, for bot heuristics and the odds meter. */
export function strength(r: HandResult): number {
  return Math.max(0, Math.min(1, r.score / (Cat.FlushFive * CAT_WEIGHT)));
}

export { RANK_LABEL };
