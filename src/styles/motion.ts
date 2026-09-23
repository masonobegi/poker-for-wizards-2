/**
 * Motion tokens for the JavaScript half of the app.
 *
 * `tokens.css` has always been the single source of truth for CSS. The framer
 * side had no equivalent: one curve was hand-typed at thirteen call sites,
 * sixteen distinct durations sat against a five-value scale, and twenty
 * separately hand-tuned spring configs described what were really only three
 * kinds of movement. Changing `--ease-out` silently desynced all of it.
 *
 * Keep the values here and in `tokens.css` in step — they are the same scale,
 * expressed in the units each layer wants (seconds here, milliseconds there).
 */
import type { Transition } from 'framer-motion';

/** Mirrors `--ease-out`: strong ease-out, the house entrance curve. */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const;
/* `--ease-both` and `--ease-snap` are deliberately not mirrored here: both are
   used on the CSS side only, and an exported constant with no importer is just
   another value that can drift out of step with tokens.css. */

export const T_FAST = 0.16;    // --t-fast
export const T_BASE = 0.26;    // --t-base
export const T_SLOW = 0.42;    // no CSS twin: nothing in the stylesheets reads it

/** What a transition collapses to under reduced motion. Not zero: an element
 *  that teleports is harder to follow than one that moves, and the setting is
 *  meant to calm motion rather than delete the cue. */
export const T_REDUCED = 0.09;

/** The default entrance/exit: fast start, clean settle. */
export const ENTER: Transition = { duration: T_FAST, ease: EASE_OUT };
/** A slightly longer entrance, for panels, overlays and scrims. */
export const ENTER_PANEL: Transition = { duration: T_BASE, ease: EASE_OUT };

/*
 * Springs are described by how long and how springy, not by stiffness/damping/
 * mass. Three cover the whole app: a control appearing, something settling
 * into place, and a moment worth celebrating. Bounce stays in 0.1–0.3 except
 * where the moment is genuinely rare.
 */

/** Controls and badges — crisp, no visible bounce. */
export const SPRING_CRISP: Transition = { type: 'spring', duration: 0.3, bounce: 0.1 };
/** Panels and list items settling in. */
export const SPRING_SOFT: Transition = { type: 'spring', duration: 0.45, bounce: 0.2 };
/** Showdowns, achievements, the end of a run. The only places that bounce. */
export const SPRING_PLAYFUL: Transition = { type: 'spring', duration: 0.5, bounce: 0.35 };
