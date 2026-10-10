/**
 * The Steam Next Fest demo: what it holds back, and where it ends.
 *
 * A demo is a separate Steam app built from this same code with HEXHOLD_DEMO=1
 * (`npm run build:demo`). It plays the real game, not a cut-down copy: the
 * same table, Market, omens and impossible hands. It differs in three ways.
 *
 * 1. A run ends after DEMO_ANTES antes, on a screen that says what the full
 *    game holds and asks for a wishlist. A Next Fest player gives a demo
 *    minutes, not an evening; a whole run is 20-plus hands and a demo that
 *    ends while it is getting good is one that gets wishlisted.
 * 2. Three covens of seven are open. The other four are shown, locked, with
 *    their pitch: a demo should show the shape of what it is holding back.
 * 3. No hex ladder, no Daily Rite, no hosting: the demo is the practice table.
 *
 * The server enforces all of it (server/net/io.ts), so a demo cannot be
 * turned into the full game by editing the page.
 */

/** Antes a demo run lasts: three Markets' worth, so two omens and the third ante. */
export const DEMO_ANTES = 3;

/**
 * Open in the demo. Each one shows a different school doing something a deck
 * cannot: undecided cards, duplicated cards, and a board that burns away.
 * The Twinned is the coven most likely to make an impossible hand.
 */
export const DEMO_COVENS: readonly string[] = ['unmoored', 'twinned', 'ashen'];

/**
 * The full game's Steam App ID, for the wishlist button. 0 until the Steam app
 * exists (Mason: set it once Steamworks issues the ID). With 0 the button goes
 * to a store search for the name, which finds the page once it is public.
 */
export const FULL_GAME_APP_ID = 0;

export const wishlistUrl = (appId: number = FULL_GAME_APP_ID): string =>
  appId > 0
    ? `https://store.steampowered.com/app/${appId}/HEXHOLD/`
    : 'https://store.steampowered.com/search/?term=HEXHOLD';

/** A demo coven, falling back to the first one for anything else. */
export const demoCoven = (id: string): string =>
  DEMO_COVENS.includes(id) ? id : DEMO_COVENS[0];
