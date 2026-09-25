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
 * That constraint is deliberate. A coven cannot smuggle in behaviour; if you
 * want one to do something new, the relic has to learn it first, in
 * `shared/relics.ts`, where every other passive in the game is declared.
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
}

export const COVENS: CovenDef[] = [
  {
    id: 'unaligned',
    name: 'The Unaligned',
    school: 'veil',
    glyph: '◇',
    text: 'A counterspell and whatever the deck feels like giving you.',
    style: 'The game as it was before anybody organised. No relic, no plan, no excuses.',
    sigils: ['nullify'],
  },
  {
    id: 'unmoored',
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
    name: 'The Quiet',
    school: 'veil',
    glyph: '☾',
    text: 'Gloaming and Cold Read, and you always see one of somebody else’s cards.',
    style: 'You are not trying to make the best hand. You are trying to know theirs.',
    sigils: ['nullify', 'gloaming', 'cold_read'],
    relic: 'thin_veil',
  },
  {
    id: 'long_now',
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
    name: 'The Loom',
    school: 'weave',
    glyph: '⊞',
    text: 'Inscribe and Gild, and you hold one more sigil than anybody else.',
    style: 'You are writing on the deck. Everyone will be playing your cards by ante three.',
    sigils: ['nullify', 'inscribe', 'gild'],
    relic: 'deep_pockets',
  },
];

export const COVEN_BY_ID: Record<string, CovenDef> = Object.fromEntries(
  COVENS.map((c) => [c.id, c]),
);

export const DEFAULT_COVEN = 'unaligned';

/** The coven a run should use, falling back rather than throwing on bad input. */
export function covenOf(id: string | undefined): CovenDef {
  return (id && COVEN_BY_ID[id]) || COVEN_BY_ID[DEFAULT_COVEN];
}
