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
 * 2. While the coven picker exists (COVEN_CHOICE, shared/covens.ts), three
 *    covens of seven are open and the other four are shown, locked, with
 *    their pitch. With the picker off, the demo is Unaligned like the full
 *    game (server/net/io.ts `covenFor`).
 * 3. No hex ladder, no Daily Rite, no hosting: the demo is the practice table.
 *
 * The server enforces all of it (server/net/io.ts), so a demo cannot be
 * turned into the full game by editing the page.
 */

/**
 * Antes a demo run lasts: two Markets and two omens, and the third ante.
 *
 * Decided 2026-10-10 (FUN-REVIEW.md, round 3), on 282 demo runs from the
 * player's chair: at 3 antes 72% of runs reach the wishlist screen and 31% see
 * an impossible hand (22% before round 3), in 5.0 minutes; a fourth ante adds
 * 10 points of impossible hands and costs 16 points of runs that reach the
 * wishlist screen. Either is far under the 14-minute median demo session
 * (Zukowski's 2022 Next Fest surveys), so a second run fits.
 */
export const DEMO_ANTES = 3;

/**
 * Open in the demo. Each one shows a different school doing something a deck
 * cannot: a board that burns away, duplicated cards, and undecided cards.
 *
 * The first is the default a player gets without choosing. It was the
 * Unmoored, which in three batches of 47 demo runs each reached the wishlist
 * screen least often (64-77%) and busted in the first ante most; the Ashen
 * reached it most often (83-89%) and saw an impossible hand as often as any
 * (FUN-REVIEW.md, round 3).
 */
export const DEMO_COVENS: readonly string[] = ['ashen', 'twinned', 'unmoored'];

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
