/**
 * Hexes — the climb, and the Daily Rite.
 *
 * Covens gave a run a first decision. They did not give a player a reason to
 * start the next run once they had won one. The roguelikes this game is
 * measured against answer that the same way: Balatro has stakes, Slay the
 * Spire has ascension. A win unlocks the same opening, a little harder.
 *
 * A hex is that ladder, one per coven. Winning a run at Hex N as a coven opens
 * Hex N+1 for that coven. Each level keeps everything below it. Nothing is
 * hidden behind them: every coven, sigil and relic is open from the first run,
 * and Hex I is the game as it has always played.
 *
 * Every rule is expressed in things the engine already has — a relic handed
 * to a bot, an omen drawn early, a price, the ante length — so a hex cannot
 * smuggle in new behaviour, the same constraint covens live under.
 */
import { COVENS, DEFAULT_COVEN } from './covens';
import { Rng } from './rng';

export interface HexDef {
  level: number;
  name: string;
  /** What this level adds, on top of every level below it. */
  text: string;
}

export const HEXES: readonly HexDef[] = [
  { level: 1, name: 'Hex I', text: 'The table as it has always played.' },
  { level: 2, name: 'Hex II', text: 'Every opponent sits down already holding a relic.' },
  { level: 3, name: 'Hex III', text: 'An omen is in force before the first card is dealt.' },
  { level: 4, name: 'Hex IV', text: 'The Market charges you a quarter more.' },
  { level: 5, name: 'Hex V', text: 'The blinds climb every two hands instead of three.' },
];

export const MAX_HEX = HEXES.length;

export const clampHex = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.min(MAX_HEX, Math.round(n))) : 1;

/** Hex IV: what the Market charges a human, from the price it lists. */
export const hexPrice = (price: number, hex: number, isBot: boolean): number =>
  hex >= 4 && !isBot ? Math.ceil(price * 1.25) : price;

/** Hex V shortens the ante, but never below two hands. */
export const handsPerAnteAt = (base: number, hex: number): number =>
  hex >= 5 ? Math.max(2, base - 1) : base;

// ---------------------------------------------------------------------------
// The Daily Rite
// ---------------------------------------------------------------------------

/**
 * One seeded run a day, the same for everyone who plays it.
 *
 * The seed fixes the coven, the opponents, every deck shuffle, every omen and
 * every Market offer. What a player does still changes the run — a Rewind
 * deals a different card, a fold changes who is left — but two people who
 * play the same day start from the same table and can compare what they made
 * of it.
 */
export const DAILY_HEX = 2;

/** A calendar day in UTC, so everyone's "today" turns over at the same moment. */
export const dayKey = (at: number = Date.now()): string => new Date(at).toISOString().slice(0, 10);

export const dailySeed = (day: string): string => `daily:${day}`;

export const isDailySeed = (s: unknown): s is string =>
  typeof s === 'string' && /^daily:\d{4}-\d{2}-\d{2}$/.test(s);

/** The coven today's rite is played as. Never the Unaligned: the day should have a shape. */
export function dailyCoven(day: string): string {
  const pool = COVENS.filter((c) => c.id !== DEFAULT_COVEN);
  return new Rng(`coven:${dailySeed(day)}`).pick(pool).id;
}
