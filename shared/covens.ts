/**
 * Covens — the school you sat down as.
 *
 * Every run of this game used to start in exactly the same place: a
 * counterspell, one random sigil, no relic, the same chips. That is fine for
 * a poker night and it is the wrong shape for a roguelike, where the first
 * decision of the run is supposed to be a decision. Balatro has fifteen
 * decks; Slay the Spire has four characters; HEXHOLD had one of everything.
 *
 * A coven is the cheapest honest version of that: two sigils you always open
 * with, and one relic you always own. It changes what your first three hands
 * can possibly do, and it changes which of the six schools you are being
 * pushed toward — without adding a single new engine hook, because the passive
 * half is expressed as a relic the engine already knows how to read.
 *
 * Since 2026-10-10 a coven also leans: half its hands, the first sigil drawn
 * comes from its school (COVEN_LEAN, below). That reads only the `school`
 * field every coven already had, so it adds no hook either.
 *
 * That constraint is deliberate. A coven cannot smuggle in behaviour; if you
 * want one to do something new, the relic has to learn it first, in
 * `shared/relics.ts`, where every other passive in the game is declared.
 *
 * Since round 4 (2026-10-10) each coven also has a creed: one rule for the
 * whole run, declared as a relic in `shared/relics.ts` (CREEDS) under the
 * same constraint, owned from the first hand and never sold.
 */
import type { School } from './sigils';

export interface CovenDef {
  id: string;
  name: string;
  /** The school the starting hand leans on. Purely for colour and grouping. */
  school: School;
  glyph: string;
  /** One line, on the menu card. */
  text: string;
  /** The pitch — what this coven is actually for. */
  style: string;
  /** Sigil ids dealt at the start of the run, in this order. */
  sigils: string[];
  /** A relic owned from the first hand. Optional: the Unaligned have none. */
  relic?: string;
  /**
   * The coven's creed: one rule for the whole run, a relic the coven owns
   * from the first hand and nobody can buy or take (shared/relics.ts CREEDS).
   */
  creed: string;
}

export const COVENS: CovenDef[] = [
  {
    id: 'unaligned',
    creed: 'creed_providence',
    name: 'The Unaligned',
    school: 'veil',
    glyph: '◇',
    text: 'A counterspell and whatever the deck feels like giving you.',
    style: 'The game as it was before anybody organised. No relic, no plan, no excuses.',
    sigils: ['nullify'],
  },
  {
    id: 'unmoored',
    creed: 'creed_many_futures',
    name: 'The Unmoored',
    school: 'entropy',
    glyph: '⟁',
    text: 'Superpose and Collapse, and one of your hole cards arrives undecided every hand.',
    style: 'Nothing is settled until you settle it. You will know your own hand last.',
    sigils: ['nullify', 'superpose', 'collapse'],
    relic: 'unstable_isotope',
  },
  {
    id: 'quiet',
    creed: 'creed_tells',
    name: 'The Quiet',
    school: 'veil',
    glyph: '☾',
    text: 'Gloaming and Cold Read, and you always see the top card of the deck.',
    style: 'You are not trying to make the best hand. You are trying to know theirs.',
    sigils: ['nullify', 'gloaming', 'cold_read'],
    relic: 'thin_veil',
  },
  {
    id: 'long_now',
    creed: 'creed_foreknown',
    name: 'The Long Now',
    school: 'chronos',
    glyph: '⧖',
    text: 'Foresight and Second Wind, and mana arrives a step faster.',
    style: 'You have read the river. Everything after that is arithmetic.',
    sigils: ['nullify', 'foresight', 'second_wind'],
    relic: 'leyline',
  },
  {
    id: 'twinned',
    creed: 'creed_kin',
    name: 'The Twinned',
    school: 'bind',
    glyph: '∞',
    text: 'Mirror and Graft, and every card scores higher for each pot it has already won you.',
    style: 'Two of a thing, then three, then a hand the deck could not have held.',
    sigils: ['nullify', 'mirror', 'graft'],
    relic: 'heirloom',
  },
  {
    id: 'ashen',
    creed: 'creed_salt',
    name: 'The Ashen',
    school: 'ruin',
    glyph: '🜂',
    text: 'Burn and Blight, and folding pays.',
    style: 'If you cannot win the hand, make sure nobody enjoys it.',
    sigils: ['nullify', 'burn', 'blight'],
    relic: 'grave_interest',
  },
  {
    id: 'loom',
    creed: 'creed_signature',
    name: 'The Loom',
    school: 'weave',
    glyph: '⊞',
    text: 'Inscribe and Gild, and you hold one more sigil than anybody else.',
    style: 'You are writing on the deck. Everyone will be playing your cards by ante three.',
    sigils: ['nullify', 'inscribe', 'gild'],
    relic: 'deep_pockets',
  },
];

/**
 * Creeds on (true) or off. Round 4 of the fun pass (FUN-REVIEW.md,
 * 2026-10-10): the rubric scored covens 6 of 10 because "a lean is not a
 * deck", and named what would earn more: one rule per coven for the whole
 * run, the way each of Balatro's decks and Slay the Spire's characters
 * changes a rule. Every seat plays its coven's creed, bots included, so a
 * table of four covens is four rulebooks. Off puts the covens back to two
 * sigils, a relic and a lean.
 */
export const COVEN_CREEDS = true;

/** The creed a coven plays under, or null with creeds off. */
export const creedOf = (c: CovenDef): string | null => (COVEN_CREEDS ? c.creed : null);

/**
 * At Hex I a bot's creed wakes at this ante, when the bots stop opening warm
 * (server/game/bots.ts WARMTH_BY_ANTE). The first floor teaches: measured
 * from the player's chair with every seat's creed on from hand one, the
 * player's busts before the first Market rose from 14% to 21% of runs
 * (FUN-REVIEW.md, round 4). The player's own creed is on from hand one, and
 * at Hex II and above every creed is. Set to 1 to wake them all at once.
 */
export const BOT_CREEDS_FROM_ANTE = 3;

/** Whether a seat plays its creed yet. */
export const creedAwake = (isBot: boolean, hex: number, ante: number): boolean =>
  !isBot || hex > 1 || ante >= BOT_CREEDS_FROM_ANTE;

export const COVEN_BY_ID: Record<string, CovenDef> = Object.fromEntries(
  COVENS.map((c) => [c.id, c]),
);

export const DEFAULT_COVEN = 'unaligned';

/**
 * How often a hand's first sigil draw comes from the coven's own school.
 *
 * A coven's two signature sigils are dealt once and are gone when cast, so by
 * the third hand every coven was drawing from the same pool and the only
 * difference left was one relic. Measured from the player's chair (`npm run
 * fun:batch`, 140 runs, 2026-10-10) the Twinned cast Mirror 1.1 and Graft 1.0
 * times in a whole run; a genre veteran's simulated review put it as "covens
 * feel like starting hands, not decks". The roguelites this is measured
 * against give a character its own pool for the whole run (Slay the Spire's
 * four card pools, Balatro's decks that change every hand of a run).
 *
 * So from ante 2, half of all hands, the first draw is from the coven's school: Bind for
 * the Twinned, Weave for the Loom. The other draws are the shared pool, so
 * every coven still meets cards it did not choose. The Unaligned do not lean:
 * "whatever the deck feels like giving you" is their whole pitch.
 * Set to 0 to switch it off.
 */
export const COVEN_LEAN = 0.5;

/**
 * The lean starts at the first Market. The opening hand already holds the
 * coven's two signature sigils, and the first ante is where a roguelike
 * teaches rather than executes (bots.ts `warmth`). Measured on three sets of
 * seeds, leaning from hand one raised the player's busts before the first
 * Market from 12% to 19% (FUN-REVIEW.md, round 3).
 */
export const COVEN_LEAN_FROM_ANTE = 2;

/** The school a coven's draws lean to, or null for one that does not lean. */
export const leanOf = (c: CovenDef): School | null => (c.id === DEFAULT_COVEN || COVEN_LEAN <= 0 ? null : c.school);

/** The coven a run should use, falling back rather than throwing on bad input. */
export function covenOf(id: string | undefined): CovenDef {
  return (id && COVEN_BY_ID[id]) || COVEN_BY_ID[DEFAULT_COVEN];
}
