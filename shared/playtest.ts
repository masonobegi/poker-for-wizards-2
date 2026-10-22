/**
 * The Steam Playtest build: the full game, plus a way to say what you thought.
 *
 * Steam Playtest is a separate app under the full game's page (players press
 * "Request access"), built from this same code with HEXHOLD_PLAYTEST=1
 * (`npm run package:playtest:win` / `:linux`, scripts/build-playtest.mjs). It
 * is not cut down: the December playtest exists to find out whether the full
 * game holds up with people (FUN-REVIEW.md, "What would make it solid"). It
 * differs in three ways:
 *
 * 1. The menu and the end of every run offer "Send playtest feedback".
 * 2. The version line says PLAYTEST, so a report names the build.
 * 3. Its own app id and product name ("HEXHOLD Playtest"), so its saves live
 *    in their own folder and never carry into the full game.
 *
 * The server is the full game's, unchanged.
 */
import { FULL_GAME_APP_ID } from './demo';

/**
 * Where the feedback button goes. Empty until Mason picks one (a Steam
 * discussions board, a form). Empty and no App ID either: the button is not
 * shown, because a button that opens nothing is worse than none, and the
 * build script says so loudly.
 */
export const PLAYTEST_FEEDBACK_URL = '';

/**
 * The feedback link: the one set above, else the full game's Steam
 * discussions once the App ID exists (Steam Playtest players can post there),
 * else nothing.
 */
export const feedbackUrl = (
  url: string = PLAYTEST_FEEDBACK_URL,
  appId: number = FULL_GAME_APP_ID,
): string | null => {
  if (/^https:\/\//.test(url)) return url;
  if (appId > 0) return `https://steamcommunity.com/app/${appId}/discussions/`;
  return null;
};

/**
 * The questions the December playtest is for (FUN-REVIEW.md rounds 5 to 7).
 * The covens open from the second run in the playtest build as in the full
 * game (shared/unlock.ts), and only people can say whether that reads as a
 * reward or as a wall: round 7's criterion 4 is held at 7 for want of it.
 */
export const PLAYTEST_ASKS: readonly string[] = [
  'Was there a moment you wanted to tell someone about?',
  'Did you know why you won or lost the hands that mattered?',
  'At the Market, did "pick one" feel like a choice or a loss?',
  'From your second run: did the coven you picked change how you played?',
  'Would you play another run? Why, or why not?',
];
