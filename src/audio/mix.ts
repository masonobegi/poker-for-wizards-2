/**
 * HEXHOLD — the mix.
 *
 * `sfx.ts` decides what each sound *is*. This file decides how loud it sits
 * against every other sound, which is a separate job and wants separate
 * hands on it.
 *
 * Without this, a sound's level is an accident of how its synth happened to
 * be written, and the set drifts apart: the first calibration pass measured
 * `card_deal` — the sound a player hears more than any other — sitting more
 * than 20 dB under `win_impossible`, quiet enough to vanish under the music
 * bed. Nothing was wrong with either synth. Nobody had ever set the faders.
 *
 * ## TARGET_LOUDNESS
 *
 * Hand-authored. The design intent, in linear amplitude, measured as the
 * loudest 50 ms window of the rendered sound — a rough loudness proxy that
 * treats a 40 ms card flick and a three-second victory pad on comparable
 * terms, which plain whole-buffer RMS does not.
 *
 * These are deliberately *not* equal. A flat mix is as wrong as an
 * accidental one: the ladder from `ui_hover` up to `win_impossible` is the
 * game telling the player what matters. Roughly:
 *
 *   whisper   under the conversation — hovers, timer ticks. Subliminal by
 *             design: these fire constantly and must never be *noticed*.
 *   light     constant and mechanical — dealing, sliding, clicking
 *   normal    a thing happened — a chip, a card landing, a small spell
 *   event     a thing happened that changes the hand — casts, streets
 *   loud      the hand turns — the river, an all-in, the showdown
 *   payoff    the run turns — a big win, an elimination, victory
 *
 * ## TRIM
 *
 * Generated. `npm run audio:calibrate` renders every sound, measures it, and
 * writes the per-sound gain that lands it on its target. Regenerate it after
 * touching a synth; `npm run audio` fails if the shipped mix has drifted off
 * its targets.
 */

import type { SfxName } from './sfx';

// ---------------------------------------------------------------------------
// Design intent — edit these
// ---------------------------------------------------------------------------

/** Tier names exist only to make the table below readable at a glance. */
const whisper = 0.007;
const light = 0.024;
const normal = 0.046;
const event = 0.068;
const loud = 0.098;
const payoff = 0.135;

export const TARGET_LOUDNESS: Record<SfxName, number> = {
  // Cards — the constant texture of the game. Dealing happens hundreds of
  // times a session, so it has to be present without ever being the thing
  // you notice.
  card_deal: light,
  card_flip: light,
  card_slide: light,
  card_place: normal,
  card_burn: normal,
  card_shuffle: light,

  // Chips — brighter and heavier than cards, because chips are money.
  chip_single: normal,
  chip_stack: event,
  chip_slide: normal,
  pot_collect: loud,
  chip_allin: payoff,

  // UI — must never compete with the table.
  ui_hover: whisper,
  ui_click: light,
  ui_back: light,
  ui_error: normal,
  ui_confirm: normal,
  ui_tick: whisper,
  ui_warn: normal,

  // Casting — one per school, and each one is a hand-changing commitment.
  cast_entropy: event,
  cast_veil: event,
  cast_chronos: event,
  cast_bind: event,
  cast_ruin: event,
  cast_weave: event,

  // Spell outcomes. A counter beats the thing it countered, so it sits above
  // the casts; a fizzle is an anticlimax and is mixed like one.
  spell_counter: loud,
  spell_fizzle: normal,
  collapse: event,
  superpose: normal,
  diverge: normal,
  entangle: normal,
  inscribe: normal,
  rewind: event,
  seal: event,

  // Street beats, deliberately climbing. The river should feel heavier than
  // the flop before a player can name why.
  deal_start: event,
  street_flop: 0.070,
  street_turn: 0.082,
  street_river: 0.095,
  showdown: loud,

  // Results — the top of the ladder.
  win_normal: loud,
  win_big: payoff,
  win_impossible: 0.170,
  lose_hand: normal,
  eliminate: payoff,
  victory: payoff,

  // Market.
  shop_open: event,
  shop_buy: event,
  shop_reroll: normal,
  level_up: loud,

  // Pressure. `heartbeat` loops under a running clock, so it is mixed to be
  // felt rather than heard.
  heartbeat: event,
  your_turn: loud,
};

// ---------------------------------------------------------------------------
// Generated — do not edit by hand
// ---------------------------------------------------------------------------

// BEGIN GENERATED TRIM
export const TRIM: Record<SfxName, number> = {
  card_deal: 1.865,
  card_flip: 0.647,
  card_slide: 0.681,
  card_place: 1.385,
  card_burn: 0.414,
  card_shuffle: 2.24,
  chip_single: 0.399,
  chip_stack: 0.591,
  chip_slide: 0.944,
  pot_collect: 0.336,
  chip_allin: 0.502,
  ui_hover: 1.222,
  ui_click: 0.9,
  ui_back: 1.058,
  ui_error: 0.507,
  ui_confirm: 1.087,
  ui_tick: 1.033,
  ui_warn: 0.967,
  cast_entropy: 0.448,
  cast_veil: 0.947,
  cast_chronos: 0.75,
  cast_bind: 0.817,
  cast_ruin: 0.163,
  cast_weave: 1.072,
  spell_counter: 0.245,
  spell_fizzle: 0.533,
  collapse: 0.49,
  superpose: 0.926, // peak-limited
  diverge: 0.644,
  entangle: 0.717,
  inscribe: 2.772,
  rewind: 0.39,
  seal: 0.155,
  deal_start: 0.266,
  street_flop: 0.269,
  street_turn: 0.28,
  street_river: 0.288,
  showdown: 0.313,
  win_normal: 0.536,
  win_big: 0.719,
  win_impossible: 0.901,
  lose_hand: 0.347,
  eliminate: 0.54,
  victory: 0.448,
  shop_open: 0.805,
  shop_buy: 0.658,
  shop_reroll: 1.002,
  level_up: 0.365,
  heartbeat: 0.212,
  your_turn: 1.592,
};
// END GENERATED TRIM

/** The shipped gain for one sound. Unknown names mix at unity. */
export function trimFor(name: SfxName): number {
  const t = TRIM[name];
  return typeof t === 'number' && Number.isFinite(t) && t > 0 ? t : 1;
}
