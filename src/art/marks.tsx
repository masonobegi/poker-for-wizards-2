/**
 * The mark set — every sigil, relic, omen and card mark, drawn rather than
 * typed.
 *
 * WHY THIS EXISTS
 *
 * The hundred of these that replace a Unicode character had three problems
 * with being typed rather than drawn, in order of what they cost:
 *
 *  1. **They tofu on the platform we ship to.** The UI font stack is
 *     `Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`. On
 *     Windows, Segoe UI Symbol quietly covers `🜂 ⑃ ⌸ ⟒ ⟆ ⨭ ⚱`, so every one
 *     of them looks fine here. A Steam Deck has none of those fonts. The
 *     Linux build's glyph coverage is a different set entirely, and anything
 *     it misses renders as an empty box — in the middle of a spell card,
 *     where the whole card's identity is supposed to be.
 *  2. **They were not unique.** `⧖` was both Echo of a Hand (Chronos) and
 *     Tessellate (Bind). Thirty characters were shared across two or three of
 *     sigils, relics, omens and card marks — `👁` was a sigil, a relic AND an
 *     omen. A symbol that means three things means nothing.
 *  3. **They were not one hand.** Measured at a single font size the set
 *     ranged from 7.5px to 15px wide: some are hairline mathematical
 *     operators, some are heavy dingbats, two are colour emoji that ignore
 *     `color` entirely and render as someone else's artwork.
 *
 * THE GRAMMAR
 *
 * Every mark is a 24x24 stroke drawing on a common skeleton: 1.7 stroke,
 * round caps and joins, nothing outside 3..21, optical centre at 12,12.
 * Filled dots are the only solid element, and they are used to mean a
 * *resolved* value — a card that has settled, a fixed point, a pip.
 *
 * Each school has a motif you can read before you read the name:
 *
 *   entropy  circles that have not finished deciding — broken arcs, scatter
 *   veil     something half-hidden — crescents, occlusion, a covered half
 *   chronos  time with a direction — arcs with heads, nested rings
 *   bind     two of a thing, joined — pairs, links, shared edges
 *   ruin     a clean break — gaps, cuts, a shape pulled apart
 *   weave    over and under — interlace, a nib, a grid being written on
 *
 * Relics are drawn as *objects* (a vessel, a coin, a compass) and omens as
 * *conditions over the table* (a horizon, weather, a rising level), so the
 * three families stay apart at a glance even at 14px.
 *
 * USAGE
 *
 * `<Mark kind="sigil" id="superpose" />`. Ids are namespaced by `kind`
 * because they collide across families: `long_memory` is both a sigil and an
 * omen, and `the_ledger` (relic) sits next to `the_ledger_sigil`.
 *
 * Anything without a drawing falls back to the Unicode character it
 * replaced, so a new sigil is never invisible while its mark is being drawn.
 */
import { memo, type ReactNode } from 'react';
import './marks.css';

export type MarkKind = 'sigil' | 'relic' | 'omen' | 'card' | 'ui';

// A filled dot: a value that has resolved. The only solid ink in the set.
const Dot = ({ x, y, r = 1.5 }: { x: number; y: number; r?: number }) => (
  <circle cx={x} cy={y} r={r} fill="currentColor" stroke="none" />
);

/* ===========================================================================
   Sigils — 45
   =========================================================================== */

const SIGIL: Record<string, ReactNode> = {
  // --- entropy: circles that have not finished deciding ---------------------
  superpose: (
    <>
      <circle cx={9.5} cy={12} r={5.5} />
      <circle cx={14.5} cy={12} r={5.5} strokeDasharray="2.6 2.4" />
      <Dot x={12} y={12} r={1.3} />
    </>
  ),
  collapse: (
    <>
      <circle cx={12} cy={12} r={7} strokeDasharray="2.4 2.6" />
      <path d="M12 4.6v2.6M12 16.8v2.6M4.6 12h2.6M16.8 12h2.6" />
      <Dot x={12} y={12} r={2} />
    </>
  ),
  schrodinger: (
    <>
      {/* A sealed box holding one settled value and one that is not. The
          earlier version drew the lid as a flat trapezoid and the whole mark
          read as a camera. */}
      <path d="M5 8.6h14v10.8H5Z" />
      <path d="M5 8.6 7.6 5.2h8.8L19 8.6" />
      <circle cx={9.6} cy={14} r={2.2} strokeDasharray="2.2 2" />
      <Dot x={14.6} y={14} r={2.1} />
    </>
  ),
  decohere: (
    <>
      <path d="M12 5a7 7 0 0 1 0 14" fill="currentColor" stroke="none" />
      <path d="M12 5a7 7 0 0 0 0 14" strokeDasharray="2.4 2.4" />
      <path d="M12 3.4v17.2" />
    </>
  ),
  probability_storm: (
    <>
      <circle cx={12} cy={12} r={4.2} strokeDasharray="2.2 2.4" />
      <path d="M12 3.6v2M12 20.4v-2M3.6 12h2M20.4 12h-2M6 6l1.5 1.5M18 18l-1.5-1.5M18 6l-1.5 1.5M6 18l1.5-1.5" />
      <Dot x={12} y={12} r={1.2} />
    </>
  ),
  fracture: (
    <>
      <path d="M12 4.8a7.2 7.2 0 0 1 6.6 4.4" />
      <path d="M19.1 13.3A7.2 7.2 0 0 1 13 19.1" />
      <path d="M10 18.9A7.2 7.2 0 0 1 5.2 13" />
      <path d="M6.3 8.3a7.2 7.2 0 0 1 2.6-2.7" />
      <path d="M14.6 7.8 9.9 12.2l3.4 1.1-2.6 3.6" />
    </>
  ),
  cascade: (
    <>
      <path d="M5.4 6.4a3 3 0 0 0 3 3" />
      <path d="M10.4 11.4a3 3 0 0 0 3 3" />
      <path d="M15.4 16.4a3 3 0 0 0 3 3" />
      <Dot x={5.4} y={6.4} r={1.3} />
      <Dot x={10.4} y={11.4} r={1.3} />
      <Dot x={15.4} y={16.4} r={1.3} />
    </>
  ),
  reflect: (
    <>
      <path d="M17.5 4.5v15" />
      <path d="M5 8h9.4" />
      <path d="M11.6 5.2 14.6 8l-3 2.8" />
      <path d="M14.4 16H5" />
      <path d="M7.8 13.2 5 16l2.8 2.8" />
    </>
  ),

  // --- veil: something half-hidden ------------------------------------------
  sealed_rank: (
    <>
      <path d="M12 4.2 18.4 6.6v5.2c0 3.6-2.6 6.4-6.4 8-3.8-1.6-6.4-4.4-6.4-8V6.6Z" />
      <path d="M8.2 12.4h7.6" />
      <Dot x={12} y={9} r={1.2} />
    </>
  ),
  divergence: (
    <>
      <path d="M12 20V13" />
      <path d="M12 13 6.6 7.4" />
      <path d="M12 13l5.4-5.6" />
      <Dot x={6.6} y={6.2} r={1.5} />
      <Dot x={17.4} y={6.2} r={1.5} />
    </>
  ),
  second_sight: (
    <>
      <path d="M3.6 12c2.6-3.8 5.4-5.7 8.4-5.7s5.8 1.9 8.4 5.7c-2.6 3.8-5.4 5.7-8.4 5.7S6.2 15.8 3.6 12Z" />
      <circle cx={12} cy={12} r={2.6} />
      <Dot x={12} y={12} r={1.1} />
    </>
  ),
  gloaming: (
    <>
      <path d="M16.6 4.8a8 8 0 1 0 2.6 11.6A8.6 8.6 0 0 1 16.6 4.8Z" />
      <Dot x={17.6} y={9.4} r={1.1} />
    </>
  ),
  false_face: (
    <>
      <path d="M4.6 7.4h14.8v5.2c0 3.6-3.1 7-7.4 7.8-4.3-.8-7.4-4.2-7.4-7.8Z" />
      <path d="M7.8 11.2h2.8" />
      <Dot x={15} y={11.2} r={1.5} />
      <path d="M10 16.2c1.3.8 2.7.8 4 0" />
    </>
  ),
  veiled_wager: (
    <>
      <circle cx={12} cy={12} r={7} />
      <path d="M12 5a7 7 0 0 1 0 14Z" fill="currentColor" stroke="none" />
      <circle cx={12} cy={12} r={3.4} />
    </>
  ),
  blind_spot: (
    <>
      <circle cx={12} cy={12} r={7} strokeDasharray="1.6 2.8" />
      <circle cx={12} cy={12} r={3.2} strokeDasharray="1.6 2.6" />
    </>
  ),
  the_ledger_sigil: (
    <>
      <path d="M5.4 4.8h13.2v14.4H5.4Z" />
      <path d="M5.4 8.4h13.2" />
      <path d="M8.2 11.8h7.6M8.2 15h5" />
      <Dot x={16.2} y={15} r={1.2} />
    </>
  ),
  nullify: (
    <>
      {/* Something on its way down, stopped short, and the two sparks of it
          going nowhere. Not a slash through a circle — Unmake owns that. */}
      <path d="M12 4v6.8" />
      <path d="M9.2 8 12 10.8 14.8 8" />
      <path d="M5.4 14h13.2" />
      <path d="M8.4 17.2 7 19M15.6 17.2 17 19" />
    </>
  ),

  // --- chronos: time with a direction ---------------------------------------
  rewind: (
    <>
      <path d="M19 12a7 7 0 1 1-2.6-5.4" />
      <path d="M11.6 5.4h4.8v4.8" />
      <Dot x={12} y={12} r={1.4} />
    </>
  ),
  echo_hand: (
    <>
      <path d="M8.4 5.6a8 8 0 0 1 0 12.8" />
      <path d="M12.6 7.4a5.2 5.2 0 0 1 0 9.2" strokeDasharray="2.4 2.2" />
      <path d="M16.6 9.2a2.6 2.6 0 0 1 0 5.6" strokeDasharray="1.8 2" />
      <path d="M5 4.8v14.4" />
    </>
  ),
  foresight: (
    <>
      {/* An hourglass with the sand still in the upper chamber: the card that
          has not fallen yet. */}
      <path d="M7 4.6h10M7 19.4h10" />
      <path d="M7.8 4.6c0 3.3 4.2 5.3 4.2 7.4s-4.2 4.1-4.2 7.4" />
      <path d="M16.2 4.6c0 3.3-4.2 5.3-4.2 7.4s4.2 4.1 4.2 7.4" />
      <Dot x={12} y={8.2} r={1.7} />
    </>
  ),
  stutter: (
    <>
      {/* Repeat-one: a loop around a single beat. Distinct from Echo of a
          Hand, which is the same event getting quieter. */}
      <path d="M8 8.4h8.4a2.2 2.2 0 0 1 2.2 2.2v2.8a2.2 2.2 0 0 1-2.2 2.2H7.6a2.2 2.2 0 0 1-2.2-2.2v-2.8" />
      <path d="M10.2 6.2 8 8.4l2.2 2.2" />
      <path d="M12 10.6v3" />
    </>
  ),
  long_memory: (
    <>
      <circle cx={12} cy={12} r={7} />
      <circle cx={12} cy={12} r={4.4} />
      <circle cx={12} cy={12} r={1.9} />
      <path d="M12 3.4v3.2" />
    </>
  ),
  amber: (
    <>
      <path d="M12 4.2c3.4 4 5.2 6.8 5.2 9.2a5.2 5.2 0 0 1-10.4 0c0-2.4 1.8-5.2 5.2-9.2Z" />
      <Dot x={12} y={13.6} r={1.9} />
      <path d="M9 13.6a3 3 0 0 0 .6 1.8" />
    </>
  ),

  // --- bind: two of a thing, joined -----------------------------------------
  entangle: (
    <>
      <circle cx={7.6} cy={12} r={4.2} />
      <circle cx={16.4} cy={12} r={4.2} />
      <path d="M10.4 8.8c2 2 3.2 4.4 3.2 6.4" />
    </>
  ),
  mirror: (
    <>
      <path d="M12 3.6v16.8" strokeDasharray="2.2 2.4" />
      <path d="M9.4 6.6 4.4 12l5 5.4Z" />
      <path d="M14.6 6.6 19.6 12l-5 5.4Z" />
    </>
  ),
  twin: (
    <>
      <path d="M4.6 7.4h6.2v11H4.6Z" />
      <path d="M13.2 7.4h6.2v11h-6.2Z" />
      <Dot x={7.7} y={12.9} r={1.4} />
      <Dot x={16.3} y={12.9} r={1.4} />
    </>
  ),
  chain: (
    <>
      <path d="M9.6 7.4H7a3.4 3.4 0 0 0 0 6.8h2.6" />
      <path d="M14.4 9.8H17a3.4 3.4 0 0 1 0 6.8h-2.6" />
      <path d="M9 12h6" />
    </>
  ),
  sympathy: (
    <>
      <circle cx={6.4} cy={12} r={2.8} />
      <circle cx={17.6} cy={12} r={2.8} />
      <path d="M9.2 12h5.6" strokeDasharray="2.2 2.2" />
      <Dot x={12} y={12} r={1.4} />
    </>
  ),
  tessellate: (
    <>
      <path d="M11.4 5.6 5.6 8.9v6.4l5.8 3.3V5.6Z" />
      <path d="M12.6 5.6l5.8 3.3v6.4l-5.8 3.3V5.6Z" />
      <path d="M11.4 5.6h1.2M11.4 18.6h1.2" />
    </>
  ),
  doppelganger: (
    <>
      <path d="M8.4 5.4h7.2v9.2H8.4Z" strokeDasharray="2.4 2.2" />
      <path d="M11 9.4h7.2v9.2H11Z" />
      <Dot x={14.6} y={14} r={1.4} />
    </>
  ),
  redirect: (
    <>
      <path d="M4.6 7h6.8a4 4 0 0 1 4 4v5.4" />
      <path d="M12.2 13.8 15.4 17l3.2-3.2" />
      <Dot x={4.6} y={7} r={1.5} />
    </>
  ),

  // --- ruin: a clean break ---------------------------------------------------
  burn: (
    <>
      <path d="M12 3.8c3.6 3.4 5.6 6.4 5.6 9.2a5.6 5.6 0 0 1-11.2 0c0-1.5.6-3 1.8-4.6.5 1.4 1.2 2.3 2.1 2.6-.3-2.4.2-4.8 1.7-7.2Z" />
      <path d="M12 19a2.8 2.8 0 0 1-1.4-5.2" />
    </>
  ),
  unmake: (
    <>
      <circle cx={12} cy={12} r={7} />
      <path d="M7 17 17 7" />
    </>
  ),
  larceny: (
    <>
      <path d="M4.6 9h7.4v10.4H4.6Z" />
      <path d="M14.4 5.2 19.4 8l-4.6 8.4-5-2.8Z" />
    </>
  ),
  sever: (
    <>
      <path d="M4.6 9.6h5.6v4.8H4.6Z" />
      <path d="M13.8 9.6h5.6v4.8h-5.6Z" />
      <path d="M12 3.8 11 12l2 .6-1 7.6" />
    </>
  ),
  hex: (
    <>
      {/* A hexagram with its descending triangle drawn wrong. */}
      <path d="M12 4.6 18.6 16H5.4Z" />
      <path d="M12 19.4 5.4 8h13.2Z" strokeDasharray="2.6 2.2" />
    </>
  ),
  conflagration: (
    <>
      <path d="M12 4.8c2.6 2.8 3.9 5 3.9 6.8a3.9 3.9 0 0 1-7.8 0c0-1.8 1.3-4 3.9-6.8Z" />
      <path d="M6.2 10.2c1.6 1.8 2.4 3.2 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.5 2.4-4.3Z" />
      <path d="M17.8 10.2c1.6 1.8 2.4 3.2 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1.1.8-2.5 2.4-4.3Z" />
    </>
  ),
  tithe: (
    <>
      {/* A coin with a quarter taken out of it, and the piece that was
          taken. */}
      <path d="M12 5a7 7 0 1 0 7 7h-7Z" />
      <path d="M13.8 4.2 19.8 10.2" strokeDasharray="2.2 2" />
      <Dot x={16.8} y={7.2} r={1.4} />
    </>
  ),
  toll: (
    <>
      <path d="M12 4.6v14.8" />
      <path d="M5.2 8.6h13.6" />
      <path d="M3 14.2a3 3 0 0 0 4.4 0L5.2 8.8Z" />
      <path d="M16.6 14.2a3 3 0 0 0 4.4 0l-2.2-5.4Z" />
      <path d="M9 19.4h6" />
    </>
  ),

  // --- weave: over and under -------------------------------------------------
  inscribe: (
    <>
      <path d="M17.6 4.6 19.4 6.4 9.8 16l-3.4 1.6L8 14.2Z" />
      <path d="M14.8 7.4 16.6 9.2" />
      <path d="M4.6 20h9" />
    </>
  ),
  wild_rite: (
    <>
      <circle cx={12} cy={12} r={4.2} />
      <path d="M12 3.4v3.6M12 17v3.6M3.4 12h3.6M17 12h3.6" />
      <path d="M5.9 5.9 8.4 8.4M15.6 15.6l2.5 2.5M18.1 5.9l-2.5 2.5M8.4 15.6l-2.5 2.5" />
    </>
  ),
  conjure: (
    <>
      <path d="M12 6.4 15 12l-3 5.6L9 12Z" />
      <path d="M12 3v1.8M19 8.4l-1.6.9M19 15.6l-1.6-.9M12 21v-1.8M5 15.6l1.6-.9M5 8.4l1.6.9" />
    </>
  ),
  sixth_card: (
    <>
      <path d="M6.6 4.8h10.8v14.4H6.6Z" strokeDasharray="2.8 2.4" />
      <path d="M12 8.6v6.8M8.6 12h6.8" />
    </>
  ),
  reweave: (
    <>
      <path d="M5 9.4c3.2 0 3.2 5.2 6.4 5.2s3.2-5.2 6.4-5.2" />
      <path d="M5 14.6c3.2 0 3.2-5.2 6.4-5.2" />
      <path d="M14.6 12.4c1.6 1 1.8 2.2 3.8 2.2" />
      <path d="M17.2 7.6 19.4 9.4l-2.2 1.8" />
    </>
  ),
  transmute: (
    <>
      <path d="M4.8 6.2h5.6v5.6H4.8Z" />
      <circle cx={16.6} cy={16.2} r={2.9} />
      <path d="M12.4 7.8h4.2v4.2" strokeDasharray="2.2 2" />
      <path d="M11.6 16.2H7.4v-4.2" strokeDasharray="2.2 2" />
    </>
  ),

  // --- the second printing ---------------------------------------------------
  quantum_leap: (
    <>
      <path d="M4.4 10.4h5.2v8.8H4.4Z" />
      <path d="M14.4 10.4h5.2v8.8h-5.2Z" strokeDasharray="2.4 2.2" />
      <path d="M6.6 8.2a6.4 6.4 0 0 1 10.8 0" strokeDasharray="2.2 2" />
      <Dot x={17} y={7} r={1.4} />
    </>
  ),
  observer_effect: (
    <>
      <circle cx={6.4} cy={9} r={2.8} strokeDasharray="2.2 2" />
      <circle cx={12} cy={9} r={2.8} strokeDasharray="2.2 2" />
      <Dot x={17.6} y={9} r={2.6} />
      <path d="M4 16.4h16" />
      <path d="M9.6 13.4 12 16.4M17.6 13.4 15.2 16.4" strokeDasharray="1.8 2" />
    </>
  ),
  cold_read: (
    <>
      <path d="M7.4 4.6h9.2v14.8H7.4Z" />
      <path d="M9.8 7.6h4.4M9.8 10.4h4.4" strokeDasharray="2 2" />
      <path d="M4 21.4c2.8-3.4 5.4-5.1 8-5.1s5.2 1.7 8 5.1" strokeDasharray="2.2 2" />
      <Dot x={12} y={13.4} r={1.6} />
    </>
  ),
  palimpsest: (
    <>
      <path d="M5.4 5h13.2v14H5.4Z" />
      <path d="M8 8.4h8M8 11.4h5.6" />
      <path d="M8.8 14.4h8.4M8.8 17h5.2" strokeDasharray="2.2 2" />
    </>
  ),
  second_wind: (
    <>
      <path d="M12 19.4V5.2" />
      <path d="M7.6 9.6 12 5.2l4.4 4.4" />
      <path d="M7.6 14.4 12 10l4.4 4.4" strokeDasharray="2.2 2" />
    </>
  ),
  resonance: (
    <>
      <path d="M4 8.6c2.7-2.4 5.3 2.4 8 0s5.3 2.4 8 0" />
      <path d="M4 15.4c2.7-2.4 5.3 2.4 8 0s5.3 2.4 8 0" />
      <path d="M12 10.4v3.2" />
      <Dot x={12} y={12} r={1.3} />
    </>
  ),
  graft: (
    <>
      <path d="M4.6 6.6h8.2v10.8H4.6Z" />
      <path d="M11.2 6.6h8.2v10.8h-8.2Z" />
      <path d="M12 4.4v15.2" />
      <Dot x={12} y={12} r={1.6} />
    </>
  ),
  ashes: (
    <>
      <path d="M12 4.4c2.6 2.8 4 5 4 6.8a4 4 0 0 1-8 0c0-1.8 1.4-4 4-6.8Z" strokeDasharray="2.6 2.2" />
      <path d="M4.6 19.6h14.8" />
      <Dot x={7.4} y={16.4} r={1.2} />
      <Dot x={12} y={16.4} r={1.2} />
      <Dot x={16.6} y={16.4} r={1.2} />
    </>
  ),
  blight: (
    <>
      <path d="M6.4 4.8h11.2v8.4H6.4Z" />
      <path d="M17.6 4.8a3.4 3.4 0 0 0-3.4 3.4" />
      <path d="M8.6 16.6v1.8M12 16.6v3.2M15.4 16.6v1.8" strokeDasharray="1.8 1.8" />
    </>
  ),
  gild: (
    <>
      <path d="M6.4 4.8h11.2v14.4H6.4Z" />
      <path d="M12 8.2 15 12l-3 3.8L9 12Z" />
      <path d="M18.8 3.4v3.4M17.1 5.1h3.4" />
    </>
  ),
  loom: (
    <>
      <path d="M5 5.4v13.2M9.6 5.4v13.2M14.4 5.4v13.2M19 5.4v13.2" />
      <path d="M3.6 9.4h16.8M3.6 14.6h16.8" strokeDasharray="2.6 2.2" />
      <Dot x={14.4} y={9.4} r={1.6} />
    </>
  ),
};

/* ===========================================================================
   Card marks — 9. These sit ON a card at 12px, so they carry less detail
   than anything else here and lean on their own colour.
   =========================================================================== */

const CARD: Record<string, ReactNode> = {
  wild: (
    <>
      <path d="M12 3.6v16.8M4.3 7.8l15.4 8.4M19.7 7.8 4.3 16.2" />
    </>
  ),
  prism: (
    <>
      <path d="M12 3.6 18.4 12 12 20.4 5.6 12Z" />
      <path d="M12 3.6v16.8" />
    </>
  ),
  blooded: (
    <>
      <path d="M12 4v16M4 12h16" />
      <Dot x={12} y={12} r={2.1} />
    </>
  ),
  leaden: (
    <>
      <path d="M4.6 6.8h14.8L12 19.4Z" />
      <path d="M8.4 11h7.2" />
    </>
  ),
  mirrored: (
    <>
      <path d="M4.6 6h9v12h-9Z" />
      <path d="M10.4 9h9v12h-9Z" />
    </>
  ),
  cursed: (
    <>
      <circle cx={12} cy={12} r={7.4} />
      <path d="M12 7.2v5.6" />
      <Dot x={12} y={16.4} r={1.5} />
    </>
  ),
  burning: (
    <>
      <path d="M12 3.8c3.6 3.4 5.6 6.4 5.6 9.2a5.6 5.6 0 0 1-11.2 0c0-1.5.6-3 1.8-4.6.5 1.4 1.2 2.3 2.1 2.6-.3-2.4.2-4.8 1.7-7.2Z" />
    </>
  ),
  bound: (
    <>
      <circle cx={7.4} cy={12} r={3.9} />
      <circle cx={16.6} cy={12} r={3.9} />
    </>
  ),
  echo: (
    <>
      <circle cx={12} cy={12} r={7.2} />
      <circle cx={12} cy={12} r={3.7} />
      <Dot x={12} y={12} r={1.5} />
    </>
  ),
};

/* ===========================================================================
   Relics — 23. Objects you carry: vessels, coins, instruments.
   =========================================================================== */

const RELIC: Record<string, ReactNode> = {
  broken_compass: (
    <>
      <circle cx={12} cy={12} r={7.4} />
      <path d="M8.6 15.4 13 13l-1.4-4.4" />
      <Dot x={12} y={12} r={1.2} />
    </>
  ),
  ouroboros: (
    <>
      <path d="M12 4.8a7.2 7.2 0 1 1-5.6 2.7" />
      <path d="M6.8 3.8 5.4 7.8l4.1 1" />
      <Dot x={13} y={5.2} r={1.2} />
    </>
  ),
  smeared_ink: (
    <>
      <circle cx={11} cy={12} r={5.8} />
      <path d="M11 6.2a5.8 5.8 0 0 1 0 11.6Z" fill="currentColor" stroke="none" />
      <path d="M17.6 9.6c1.4 1.2 1.9 3 1.4 4.8" strokeDasharray="2 2.2" />
    </>
  ),
  deep_well: (
    <>
      <ellipse cx={12} cy={7.6} rx={6.6} ry={2.6} />
      <path d="M5.4 7.6v8.8c0 1.4 3 2.6 6.6 2.6s6.6-1.2 6.6-2.6V7.6" />
      <path d="M12 10.4v6.4" strokeDasharray="2.2 2" />
    </>
  ),
  leyline: (
    <>
      <path d="M3.8 8.6c2.7-2.2 5.4 2.2 8.2 0s5.5 2.2 8.2 0" />
      <path d="M3.8 12.8c2.7-2.2 5.4 2.2 8.2 0s5.5 2.2 8.2 0" />
      <path d="M3.8 17c2.7-2.2 5.4 2.2 8.2 0s5.5 2.2 8.2 0" />
    </>
  ),
  deep_pockets: (
    <>
      <path d="M7 6.6h10a2.4 2.4 0 0 1 2.4 2.4v8.6a2 2 0 0 1-2 2H6.6a2 2 0 0 1-2-2V9a2.4 2.4 0 0 1 2.4-2.4Z" />
      <path d="M4.6 10.4h14.8" />
      <Dot x={16} y={14.6} r={1.4} />
    </>
  ),
  grave_interest: (
    <>
      <path d="M9 5.6h6l-.8 2.4h-4.4Z" />
      <path d="M9.8 8h4.4c2 1.6 3 3.6 3 6a5.2 5.2 0 0 1-10.4 0c0-2.4 1-4.4 3-6Z" />
      <path d="M6.6 19.6h10.8" />
    </>
  ),
  thin_veil: (
    <>
      <path d="M3.8 12c2.6-3.6 5.3-5.4 8.2-5.4s5.6 1.8 8.2 5.4c-2.6 3.6-5.3 5.4-8.2 5.4S6.4 15.6 3.8 12Z" strokeDasharray="2.6 2.4" />
      <Dot x={12} y={12} r={1.8} />
    </>
  ),
  crown_of_thieves: (
    <>
      {/* A crown with one of its points already gone. */}
      <path d="M4.6 16.6 5.8 7.8l3.6 3.2L12 5.6l2.6 5.4 2.4-2.1 1.4 7.7Z" />
      <path d="M17.6 6.6 19.8 4.4" strokeDasharray="2 2" />
      <Dot x={20.6} y={3.4} r={1.3} />
      <path d="M5.6 19.6h12.8" />
    </>
  ),
  unstable_isotope: (
    <>
      <circle cx={12} cy={12} r={2.2} />
      <path d="M12 4.4c4.2 0 7.6 3.4 7.6 7.6" strokeDasharray="2.4 2.2" />
      <path d="M12 19.6c-4.2 0-7.6-3.4-7.6-7.6" strokeDasharray="2.4 2.2" />
      <Dot x={19.6} y={12} r={1.4} />
      <Dot x={4.4} y={12} r={1.4} />
    </>
  ),
  third_hand: (
    <>
      <path d="M4.4 9h5v10.4h-5Z" />
      <path d="M10.2 9h5v10.4h-5Z" />
      <path d="M16 9h4v10.4h-4Z" strokeDasharray="2.4 2.2" />
      <path d="M4.4 5.6h15.6" />
    </>
  ),
  the_informant: (
    <>
      <path d="M4.6 7.6h14.8v9.6H4.6Z" />
      <path d="M4.6 7.6 12 13.4l7.4-5.8" />
      <Dot x={18} y={6} r={1.6} />
    </>
  ),
  cheap_tricks: (
    <>
      {/* Sigils cost less: a coin, and the price coming down. */}
      <circle cx={9.4} cy={10.6} r={5} />
      <path d="M9.4 8v5.2M7.6 9.6h3.6" />
      <path d="M17.4 8.6v9M14.6 14.8l2.8 2.8 2.8-2.8" />
    </>
  ),
  the_collector: (
    <>
      <path d="M5 8.6h14v10.8H5Z" />
      <path d="M8.2 8.6V6a2 2 0 0 1 2-2h3.6a2 2 0 0 1 2 2v2.6" />
      <path d="M5 13.2h14" />
      <Dot x={12} y={13.2} r={1.5} />
    </>
  ),
  bloodline: (
    <>
      <path d="M12 4.2c3 3.4 4.6 5.9 4.6 7.9a4.6 4.6 0 0 1-9.2 0c0-2 1.6-4.5 4.6-7.9Z" />
      <path d="M8 19.4h8" />
    </>
  ),
  mirror_shard: (
    <>
      <path d="M7.8 4.4 17.6 7.4 14.2 19.6 6.2 14Z" />
      <path d="M10.4 7.4 12.6 13.4" />
    </>
  ),
  the_ledger: (
    <>
      <path d="M6 4.6h11.4a1.6 1.6 0 0 1 1.6 1.6v13.2H7.6A1.6 1.6 0 0 1 6 17.8Z" />
      <path d="M6 16.4h13" />
      <path d="M9.2 8h6.8M9.2 11.2h4.6" />
    </>
  ),
  the_impossible: (
    <>
      <path d="M12 4 19 8v8l-7 4-7-4V8Z" />
      <path d="M8.6 14.6 15.4 9" />
      <path d="M8.6 9l6.8 5.6" />
    </>
  ),
  crowned: (
    <>
      <path d="M4.4 16.4 5.6 6.8l4 3.6L12 4.6l2.4 5.8 4-3.6 1.2 9.6Z" />
      <Dot x={12} y={13.4} r={1.4} />
    </>
  ),
  reversal: (
    <>
      <path d="M8.6 4.8v14.4" />
      <path d="M5.6 8 8.6 4.8 11.6 8" />
      <path d="M15.4 19.2V4.8" />
      <path d="M18.4 16l-3 3.2L12.4 16" />
    </>
  ),
  moneylender: (
    <>
      <circle cx={12} cy={12} r={7.2} />
      <path d="M14.6 9.2a3 3 0 1 0 0 5.6" />
      <path d="M12 6.8v10.4" />
    </>
  ),
  kingmaker: (
    <>
      <path d="M12 4.6 18.6 8v4.6c0 3.4-2.6 6.2-6.6 7.4-4-1.2-6.6-4-6.6-7.4V8Z" />
      <path d="M8.8 13.4 10.2 9l1.8 3.2L13.8 9l1.4 4.4Z" />
    </>
  ),
  crooked_ladder: (
    <>
      <path d="M7.4 19.6 9.6 4.6M14.4 19.4 16.6 4.4" />
      <path d="M8.8 15.4h6.4M9.4 11.4h6.4M10 7.4h6.4" />
    </>
  ),
  full_purse: (
    <>
      <path d="M7.8 7.6h8.4a4 4 0 0 1 3.8 4.2l-.5 5.2a2.6 2.6 0 0 1-2.6 2.4H7.1a2.6 2.6 0 0 1-2.6-2.4l-.5-5.2a4 4 0 0 1 3.8-4.2Z" />
      <path d="M9.4 7.6a2.6 2.6 0 0 1 5.2 0" />
      <Dot x={12} y={13.6} r={1.8} />
    </>
  ),
  pauper_stone: (
    <>
      <path d="M5.6 6.4h12.8v11.2H5.6Z" />
      <path d="M8.6 12h6.8" />
      <path d="M5.6 6.4 18.4 17.6" strokeDasharray="2.4 2.2" />
    </>
  ),
  heirloom: (
    <>
      <path d="M12 4.6 18.6 8v4.6c0 3.4-2.6 6.2-6.6 7.4-4-1.2-6.6-4-6.6-7.4V8Z" />
      <Dot x={9.4} y={11.4} r={1.3} />
      <Dot x={12} y={11.4} r={1.3} />
      <Dot x={14.6} y={11.4} r={1.3} />
    </>
  ),
  gilded_thumb: (
    <>
      <path d="M12 4.6 18.4 12 12 19.4 5.6 12Z" />
      <path d="M12 4.6v14.8" />
      <path d="M12 8.2 15.2 12 12 15.8 8.8 12Z" />
    </>
  ),
  high_roller: (
    <>
      <circle cx={9.4} cy={13.4} r={5.2} />
      <circle cx={15.2} cy={9.6} r={5.2} strokeDasharray="2.4 2.2" />
      <path d="M9.4 10.8v5.2M7.6 12.2h3.6" />
    </>
  ),
  the_understudy: (
    <>
      <path d="M4.4 7h6.2v12H4.4Z" strokeDasharray="2.4 2.2" />
      <path d="M8.6 5h6.2v12H8.6Z" />
      <path d="M12.8 7h6.8v12h-6.8Z" />
      <Dot x={16.2} y={13} r={1.4} />
    </>
  ),
  wild_inheritance: (
    <>
      <path d="M12 3.8v16.4M4.6 8l14.8 8M19.4 8 4.6 16" />
      <circle cx={12} cy={12} r={2.6} />
    </>
  ),
  apotheosis: (
    <>
      <circle cx={12} cy={12} r={3.4} />
      <path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M5.6 5.6l2.3 2.3M16.1 16.1l2.3 2.3M18.4 5.6l-2.3 2.3M7.9 16.1l-2.3 2.3" />
      <Dot x={12} y={12} r={1.3} />
    </>
  ),
};

/* ===========================================================================
   Omens — 23. Conditions over the whole table: horizons, weather, levels.
   =========================================================================== */

const OMEN: Record<string, ReactNode> = {
  blurred: (
    <>
      <path d="M4 8.4h16" strokeDasharray="3 2.4" />
      <path d="M4 12h16" strokeDasharray="1.8 2.6" />
      <path d="M4 15.6h16" strokeDasharray="3 2.4" />
    </>
  ),
  serpent: (
    <>
      <path d="M19 7c-3.4 0-3.4 4-6.8 4S8.8 7 5.4 7" />
      <path d="M5 17c3.4 0 3.4-4 6.8-4s3.4 4 6.8 4" />
      <Dot x={19.2} y={7} r={1.3} />
    </>
  ),
  thin_ice: (
    <>
      <path d="M3.6 9.6h5.2l2.4 3.2 2.2-3.2h6.8" />
      <path d="M4.4 14.4h15.2" strokeDasharray="2.4 2.4" />
      <path d="M4.4 18.4h15.2" strokeDasharray="2.4 2.4" />
    </>
  ),
  coronation: (
    <>
      <path d="M4.4 17 5.6 7.4l4 3.6L12 5.2l2.4 5.8 4-3.6L19.6 17Z" />
      <path d="M4.4 20h15.2" />
    </>
  ),
  feast: (
    <>
      <path d="M4.6 12.4h14.8a7.4 7.4 0 0 1-14.8 0Z" />
      <Dot x={9.2} y={9.4} r={1.6} />
      <Dot x={14.8} y={9.4} r={1.6} />
      <Dot x={12} y={6.2} r={1.6} />
      <path d="M5.6 19.8h12.8" />
    </>
  ),
  the_flood: (
    <>
      <path d="M3.8 15c2.7-2.2 5.4 2.2 8.2 0s5.5 2.2 8.2 0" />
      <path d="M3.8 19c2.7-2.2 5.4 2.2 8.2 0s5.5 2.2 8.2 0" />
      <path d="M8.8 10.6 12 4.4l3.2 6.2" />
      <path d="M12 4.4v6.6" />
    </>
  ),
  the_watchful: (
    <>
      <path d="M3.8 12c2.6-3.6 5.3-5.4 8.2-5.4s5.6 1.8 8.2 5.4c-2.6 3.6-5.3 5.4-8.2 5.4S6.4 15.6 3.8 12Z" />
      <Dot x={12} y={12} r={2.4} />
      <path d="M12 3.4v2M5 5.6l1.4 1.4M19 5.6l-1.4 1.4" />
    </>
  ),
  sealed_court: (
    <>
      <path d="M6 9.6h12v9.8H6Z" />
      <path d="M8.8 9.6V7.4a3.2 3.2 0 0 1 6.4 0v2.2" />
      <Dot x={12} y={14.2} r={1.5} />
    </>
  ),
  the_gilded: (
    <>
      <circle cx={10.4} cy={13.2} r={6.2} />
      <circle cx={10.4} cy={13.2} r={2.6} />
      <path d="M18.4 3.6v4.2M16.3 5.7h4.2" />
    </>
  ),
  entropy_rising: (
    <>
      <path d="M4.4 19.4h15.2" />
      <path d="M6.6 19.4V13M10.8 19.4V9.6M15 19.4v-6" strokeDasharray="2.4 2.2" />
      <path d="M19.2 19.4V6" />
      <Dot x={19.2} y={4.2} r={1.4} />
    </>
  ),
  third_card: (
    <>
      <path d="M4.4 8.6h5v10.8h-5Z" />
      <path d="M10.2 8.6h5v10.8h-5Z" />
      <path d="M16 8.6h3.8v10.8H16Z" strokeDasharray="2.4 2.2" />
      <Dot x={12.7} y={14} r={1.4} />
    </>
  ),
  long_memory: (
    <>
      <circle cx={12} cy={12} r={7.4} />
      <circle cx={12} cy={12} r={4.4} strokeDasharray="2.4 2.2" />
      <Dot x={12} y={12} r={1.5} />
      <path d="M12 4.6v2.6" />
    </>
  ),
  the_blooded: (
    <>
      <path d="M12 4.2c3 3.4 4.6 5.9 4.6 7.9a4.6 4.6 0 0 1-9.2 0c0-2 1.6-4.5 4.6-7.9Z" />
      <path d="M12 8.6v6.8M9.4 12h5.2" />
    </>
  ),
  famine: (
    <>
      <path d="M4.6 12.4h14.8a7.4 7.4 0 0 1-14.8 0Z" strokeDasharray="2.6 2.4" />
      <path d="M9.8 6.2 14.2 10.6M14.2 6.2 9.8 10.6" />
      <path d="M5.6 19.8h12.8" />
    </>
  ),
  unmade: (
    <>
      <path d="M5.6 6.4h12.8v11.2H5.6Z" strokeDasharray="2.6 2.4" />
      <path d="M8.4 15.2 15.6 8" />
    </>
  ),
  the_veil: (
    <>
      <path d="M16.6 4.8a8 8 0 1 0 2.6 11.6A8.6 8.6 0 0 1 16.6 4.8Z" />
      <path d="M3.6 19.6h16.8" strokeDasharray="2.4 2.2" />
    </>
  ),
  the_prism: (
    <>
      <path d="M12 4.4 19.4 17H4.6Z" />
      <path d="M12 4.4V17" />
    </>
  ),
  sleight: (
    <>
      {/* A card, and the card it is quietly becoming. */}
      <path d="M8.6 5.6 15.2 7.8 11.9 18.4 5.3 16.2Z" />
      <path d="M11.6 4.6 18.2 6.8l-1.4 4.4" strokeDasharray="2.4 2.2" />
    </>
  ),
  the_weight: (
    <>
      {/* A weight pressing on the table. Toll is the scales; this is the
          load on them. */}
      <path d="M7 8.6h10l1.8 7.4H5.2Z" />
      <path d="M10.2 8.6a1.8 1.8 0 0 1 3.6 0" />
      <path d="M3.8 19.6h16.4" />
    </>
  ),
  amber_age: (
    <>
      <path d="M12 4.6c3.2 3.8 5 6.4 5 8.8a5 5 0 0 1-10 0c0-2.4 1.8-5 5-8.8Z" />
      <circle cx={12} cy={13.4} r={2.3} />
      <path d="M3.8 20.2h16.4" strokeDasharray="2.2 2" />
    </>
  ),
  court_of_prisms: (
    <>
      <path d="M8 6.4 11.4 12 8 17.6 4.6 12Z" />
      <path d="M16 6.4 19.4 12 16 17.6 12.6 12Z" />
      <path d="M11.4 12h1.2" />
    </>
  ),
  doubling_down: (
    <>
      <path d="M8.4 4.6v14.8" />
      <path d="M5 16l3.4 3.4L11.8 16" />
      <path d="M15.6 4.6v14.8" />
      <path d="M12.2 16l3.4 3.4L19 16" />
    </>
  ),
  the_long_road: (
    <>
      <path d="M3.8 19.4 9 4.8M20.2 19.4 15 4.8" />
      <path d="M11.2 17h1.6M11.4 12.6h1.2M11.6 8.2h.8" />
    </>
  ),
  the_twinned: (
    <>
      <path d="M4.4 6.6h8.2v10.8H4.4Z" />
      <path d="M11.4 6.6h8.2v10.8h-8.2Z" strokeDasharray="2.4 2.2" />
      <path d="M8.5 12h6.8" />
    </>
  ),
  the_leaden_hour: (
    <>
      <path d="M4.4 6.6h15.2L12 19.4Z" />
      <path d="M8 11h8" />
      <Dot x={12} y={15} r={1.5} />
    </>
  ),
  the_curse: (
    <>
      <circle cx={12} cy={12} r={7.4} />
      <path d="M8.2 8.2 15.8 15.8M15.8 8.2 8.2 15.8" />
    </>
  ),
  the_kindling: (
    <>
      <path d="M12 4.4c2.8 3 4.3 5.3 4.3 7.2a4.3 4.3 0 0 1-8.6 0c0-1.9 1.5-4.2 4.3-7.2Z" />
      <path d="M5.2 19.6h13.6" strokeDasharray="2.4 2.2" />
    </>
  ),
  the_binding: (
    <>
      <circle cx={8} cy={12} r={4} />
      <circle cx={16} cy={12} r={4} />
      <path d="M10.4 9.8c1.6 1.6 1.6 2.8 0 4.4" />
    </>
  ),
  the_deepening: (
    <>
      <path d="M4.4 8h15.2M4.4 12h15.2M4.4 16h15.2" />
      <path d="M12 4.4v2.2" />
      <Dot x={12} y={19.4} r={1.4} />
    </>
  ),
  the_wider_table: (
    <>
      <path d="M3.6 9h4v10h-4Z" />
      <path d="M8.4 9h4v10h-4Z" />
      <path d="M13.2 9h4v10h-4Z" />
      <path d="M18 9h2.4v10H18Z" strokeDasharray="2.4 2" />
      <Dot x={10.4} y={14} r={1.4} />
    </>
  ),
  inversion: (
    <>
      <path d="M8.4 19.4V4.6" />
      <path d="M5 8l3.4-3.4L11.8 8" />
      <path d="M15.6 4.6v14.8" />
      <path d="M12.2 16l3.4 3.4L19 16" />
    </>
  ),
};

/* ===========================================================================
   UI — things the shop sells that are not a sigil, relic or card mark.
   =========================================================================== */

const UI: Record<string, ReactNode> = {
  /* The badge on anything a physical deck could not produce. A square and a
     diamond of the same size trying to occupy the same place — distinct from
     `card:mirrored`, which is two rectangles that merely overlap. */
  impossible: (
    <>
      <path d="M5.2 8.2h10.6v10.6H5.2Z" />
      <path d="M15 4.6 21 10.6 15 16.6 9 10.6Z" />
    </>
  ),
  mana: (
    <>
      {/* A raised ceiling: the pip row, and the line above it moving up. */}
      <Dot x={6.4} y={16.4} r={1.7} />
      <Dot x={12} y={16.4} r={1.7} />
      <Dot x={17.6} y={16.4} r={1.7} />
      <path d="M4.6 11.6h14.8" />
      <path d="M12 9.4V4.2M9.4 6.6 12 4l2.6 2.6" />
    </>
  ),
};

const REGISTRY: Record<MarkKind, Record<string, ReactNode>> = {
  ui: UI,
  sigil: SIGIL,
  card: CARD,
  relic: RELIC,
  omen: OMEN,
};

export interface MarkProps {
  kind: MarkKind;
  id: string;
  /**
   * The Unicode character this mark replaced. Rendered when nothing is drawn
   * for `id`, so adding a sigil never leaves a hole where its mark should be.
   */
  fallback?: string;
  className?: string;
  /** Accessible name. Omitted, the mark is decorative and hidden. */
  title?: string;
}

function MarkBase({ kind, id, fallback, className, title }: MarkProps) {
  const art = REGISTRY[kind][id];
  const cls = ['hx-glyph', className ?? ''].filter(Boolean).join(' ');

  if (!art) {
    return (
      <span className={cls} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
        {fallback ?? '◇'}
      </span>
    );
  }

  return (
    <svg
      className={cls}
      viewBox="0 0 24 24"
      // The whole set is stroked, so the stroke attributes live here once
      // rather than on 400 individual paths.
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {art}
    </svg>
  );
}

export const Mark = memo(MarkBase);
Mark.displayName = 'Mark';

/**
 * The raw drawing, for a caller that needs to place it inside an SVG of its
 * own rather than as an inline element — the seat portraits nest a mark in
 * their own 48-unit viewBox.
 */
export function markArt(kind: MarkKind, id: string): ReactNode {
  return REGISTRY[kind][id] ?? null;
}

/** Is a mark drawn for this id? Lets a caller size text and art differently. */
export function hasMark(kind: MarkKind, id: string): boolean {
  return REGISTRY[kind][id] !== undefined;
}

export default Mark;
