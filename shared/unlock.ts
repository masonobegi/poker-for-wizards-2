/**
 * What opens after the first run.
 *
 * Decided by Mason on 2026-10-22 ("Covens as unlock", FUN-REVIEW.md round 7).
 * The UI pass of 2026-10-17..19 cut the live content to 13 sigils, 9 omens
 * and 12 relics and turned the coven picker off (cc8f6ea), because two real
 * players could not say what a single omen did and the first screen asked a
 * newcomer to weigh about thirty rules before the first card. That made the
 * first run readable, and it made every run the same run: on the locked
 * rubric the game fell from 7.6 to 7.1 (round 6), mostly on "covens play
 * differently" and "builds have depth".
 *
 * So the first run stays exactly what the cut made it: the Unaligned, the
 * small pool, nobody asked to choose anything. Once a run has been finished,
 * won or lost, the run after it opens with a choice of coven and a slightly
 * larger pool. It is the genre's own pattern (Balatro's decks, Slay the
 * Spire's characters): learn the table first, then get choices.
 *
 * Every piece is one switch, so each can be taken back on its own:
 *
 *   UNLOCK_AFTER_RUNS          here: how many finished runs open it all
 *   COVENS_UNLOCK              shared/covens.ts: the coven picker opens
 *   UNLOCKED_SIGIL_IDS         shared/sigils.ts: sigils added from then on
 *   UNLOCKED_OMEN_IDS          shared/omens.ts: omens added from then on
 *   UNLOCKED_RELIC_IDS         shared/relics.ts: relics added from then on
 *
 * The client knows how many runs this player has finished (its profile, which
 * Steam Cloud carries), and says so when it opens a table: `RoomConfig.unlocked`.
 * The server reads only that flag, so a table someone opens without it, an
 * old client, a test, a bot-only table, deals exactly the first run's game.
 */

/** Finished runs (won, lost or a demo played to its end) that open the rest. */
export const UNLOCK_AFTER_RUNS = 1;

/** Whether a player who has finished this many runs gets the later game. */
export const unlockedAfter = (runsFinished: number): boolean =>
  Number.isFinite(runsFinished) && runsFinished >= UNLOCK_AFTER_RUNS;
