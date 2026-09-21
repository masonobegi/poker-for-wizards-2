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
  type CardEntity, type Face, type Rank, type Suit, RANKS, SUITS,
  RANK_LABEL, RANK_NAME, possibleFaces,
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
  const p = (x: number) => `${n(x)}s`;
  switch (r.cat) {
    case Cat.FlushFive: return `Flush Five, ${p(a)}`;
    case Cat.FlushHouse: return `Flush House, ${p(a)} over ${p(b)}`;
    case Cat.FiveOfAKind: return `Five of a Kind, ${p(a)}`;
    case Cat.StraightFlush: return a === 14 ? 'Royal Flush' : `Straight Flush, ${n(a)} high`;
    case Cat.Quads: return `Four of a Kind, ${p(a)}`;
    case Cat.FullHouse: return `Full House, ${p(a)} over ${p(b)}`;
    case Cat.Flush: return `Flush, ${n(a)} high`;
    case Cat.Straight: return `Straight, ${n(a)} high`;
    case Cat.Trips: return `Three of a Kind, ${p(a)}`;
    case Cat.TwoPair: return `Two Pair, ${p(a)} and ${p(b)}`;
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
function markedRank(card: CardEntity, rank: Rank, mods: RuleMods): Rank {
  let r: number = rank;
  if (card.marks.includes('blooded')) r += 1;
  if (card.marks.includes('leaden')) r -= 1;
  if (card.marks.includes('echo') || mods.memoryBonus) r += card.memory;
  return clampRank(r);
}

interface Slot {
  card: CardEntity;
  candidates: Face[];
}

function buildSlots(cards: CardEntity[], viewerId: string | null, mods: RuleMods): Slot[] {
  const dead = new Set(mods.deadRanks ?? []);
  const presentRanks = new Set<Rank>();
  const presentSuits = new Set<Suit>();

  for (const c of cards) {
    for (const f of possibleFaces(c, viewerId)) {
      presentRanks.add(markedRank(c, f.rank, mods));
      presentSuits.add(f.suit);
    }
  }
  if (presentSuits.size === 0) SUITS.forEach((s) => presentSuits.add(s));

  const slots: Slot[] = [];
  for (const card of cards) {
    let cands: Face[];

    if (card.marks.includes('wild')) {
      // A wild is genuinely any card, so every rank has to be on the table —
      // restricting it to ranks already in play would stop it filling the gap
      // in a straight, which is most of what a wild is for. Suits are capped to
      // those already present, since a lone new suit can never help a flush.
      cands = [];
      for (const r of RANKS) for (const s of presentSuits) cands.push({ rank: r, suit: s });
    } else {
      const base = possibleFaces(card, viewerId);
      cands = [];
      for (const f of base) {
        let rank = markedRank(card, f.rank, mods);
        if (mods.facesAreKings && (rank === 11 || rank === 12)) rank = 13;
        if (dead.has(rank)) continue;
        if (card.marks.includes('prism')) {
          for (const s of presentSuits) cands.push({ rank, suit: s });
        } else {
          cands.push({ rank, suit: f.suit });
        }
      }
    }

    // Dedupe and drop dead ranks.
    const seen = new Set<string>();
    cands = cands.filter((f) => {
      if (dead.has(f.rank)) return false;
      const k = `${f.rank}${f.suit}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (cands.length === 0) continue; // card is struck from the hand entirely
    slots.push({ card, candidates: cands });
  }
  return slots;
}

/** Keep the combination space bounded without silently losing the best line. */
function trimSlots(slots: Slot[]): Slot[] {
  let product = slots.reduce((a, s) => a * s.candidates.length, 1);
  if (product <= MAX_COMBOS) return slots;

  const out = slots.map((s) => ({ ...s, candidates: s.candidates.slice() }));
  // Shrink the widest slots first; they are the least discriminating.
  while (product > MAX_COMBOS) {
    out.sort((a, b) => b.candidates.length - a.candidates.length);
    const widest = out[0];
    if (widest.candidates.length <= 1) break;
    product /= widest.candidates.length;
    widest.candidates = widest.candidates.slice(0, Math.max(1, Math.ceil(widest.candidates.length / 2)));
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

function score5(faces: Face[], mods: RuleMods): Five {
  const flushSize = mods.flushSize ?? 5;
  const straightSize = mods.straightSize ?? 5;

  const counts = new Map<number, number>();
  for (const f of faces) counts.set(f.rank, (counts.get(f.rank) ?? 0) + 1);

  const suitCounts = new Map<string, number>();
  for (const f of faces) {
    const k = suitClass(f.suit, mods);
    suitCounts.set(k, (suitCounts.get(k) ?? 0) + 1);
  }
  const isFlush = [...suitCounts.values()].some((n) => n >= flushSize);

  // Groups sorted by count desc, then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [g0, g1] = groups;
  const kickers = () => faces.map((f) => f.rank).sort((a, b) => b - a);

  const straightHigh = bestStraight([...counts.keys()], straightSize, !!mods.wheelWrap);

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
}

const EMPTY: HandResult = {
  cat: Cat.HighCard, ranks: [0, 0, 0, 0, 0], score: -1,
  usedIds: [], usedFaces: [], name: 'No Hand', impossible: false,
};

export function evaluate({ cards, viewerId, mods = {} }: EvalInput): HandResult {
  const slots = trimSlots(buildSlots(cards, viewerId, mods));
  if (slots.length < 5) return EMPTY;

  const n = slots.length;
  const subsets = combosOf(n, 5);
  const cursed = slots.some((s) => s.card.marks.includes('cursed'));

  let best: HandResult | null = null;

  const pick: Face[] = new Array(5);
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
