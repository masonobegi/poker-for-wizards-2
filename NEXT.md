# NEXT: HEXHOLD after the fun pass (2026-10-10)

Brief: `masonobegi_webpage/ops/session-2026-10-09/CONTINUE_BRIEF.md` (with
`FUN_BRIEF.md` and `FIX_BRIEF.md` beside it). Branch `steam-ready-2026-10-09`,
this worktree. HEXHOLD ships first: Coming Soon by 20 Nov 2026, Next Fest
demo 22 Feb 2027, release 8 Apr 2027.

## State

- **Code-side 100% (24 of 24)**: `STEAM-READY.md`. **Fun 7/10 (was 6),
  sellable at $9.99 as a solo roguelite**: `FUN-REVIEW.md` (measurements,
  the five refund reasons, three simulated reviews, the verdict, five
  design proposals for Mason).
- Windows and Linux rebuilt on the final code and passing (packaged 21/21
  and quit 9/9 on Windows; 21/21 and 6/6 headless in WSL). Demo built,
  packaged (`release-demo/`) and seen in a headless browser
  (`node test/demo.mjs`: all checks pass). `npm test` 292/292, tsc clean.

## Done on 2026-10-10 (all committed and pushed)

1. Balance set shipped as real code and pinned by tests: `bots.ts`
   `warmth` (Hex I antes 1-2, bots only), `engine.ts` `BLIND_GROWTH` 1.4,
   `omens.ts` `IMPOSSIBLE_BY_ANTE` 2 with `keepsPromise` (The Gilded 5 wilds,
   The Twinned 7 mirrored, both minAnte 2; prism omens back to 6 and 8).
2. Evaluator 7x faster on exotic hands and exact (a wild's or prism's suit
   comes from the flush test); bots' rollouts capped at 300 readings.
3. P6 Spell cards (Full / Brief / Off); the menu scrolls on a Deck; demo
   locks, pitch on hover, wishlist above the fold on both end screens.
4. Harnesses: `npm run fun:batch` (parallel; deterministic, a seed
   replays; `--player cautious`; `--wall` for real stall times),
   `test/demo.mjs`, `checkReachable` in `test/responsive.mjs`.

## How to measure (and the traps)

- `npm run fun:batch -- 140 0 --jobs 10` takes about 10-15 minutes. Compare
  configurations on the same seeds; a seed replays exactly, but runs
  diverge after the first different decision, so 140 runs is the minimum.
- The default preview budget in the harness is 5 previews a decision (a
  counter clock), not wall time: stall numbers from it overstate. For real
  stall times use `--wall` with `--jobs 2` on a quiet machine.
- To compare against an older commit: `git worktree add --detach <dir>
  <sha>`, junction `node_modules` in, copy the current `test/fun.ts` over
  (it imports `bigBlindAt` from the engine; inline it for older commits).
- The harness's player is the bots' adept code at full heat, which is
  aggressive. Report `--player cautious` alongside it.

## Round 3 (2026-10-10, in progress): `FUN3_BRIEF.md`

Rubric locked in `FUN-REVIEW.md` (mean 6.5, rounds to 7). Built so far, each
measured on the same 140 seeds:
- **Phylactery** (`shared/hexes.ts`): runs over before the first Market
  12% to 1%, before ante 3 23% to 4% (aggressive player); busts themselves
  unchanged at 12%. Cautious player: 0% / 1%.
- **Deal again** now starts on a clean 52-card deck (Graft/Mirror/Unprint
  used to carry over). Inscribe marks are validated on the server.
- **Coven lean** (`shared/covens.ts COVEN_LEAN`) and **bots inscribe real
  marks**: impossible hand 48% to 61% of runs, yours 25% to 34%. Open
  question: early busts (caught or not) rose 12% to 19%; an A/B on seeds
  140-279 is running to see whether that is real.
- **Spell cards Auto** (default): your turns covered 26% (Full) to 17% over
  a player's first seven runs.
- Measurement worktrees in the session scratchpad (`m0`, `m1`); remove with
  `git worktree remove` when done.

## Next steps, in order

1. Mason's calls (in `FUN-REVIEW.md` and `ops/MASON-TODO.md`): the
   phylactery (one second chance before ante 3 at Hex I), demo length 3 or
   4 antes, `FULL_GAME_APP_ID` once Steamworks issues it, play the demo once.
2. If Mason says yes to the phylactery: build it at Hex I only, measure
   with `fun:batch` (the target is under 5% of runs over before the first
   Market), and add it to the Hex II rule text as something the climb
   removes.
3. The Twinned as the promise's first omen shows an impossible hand in 3%
   of hands at antes 2-3 against 7% for The Gilded. Either drop it from
   `PROMISED_MARKS` (every run then opens on The Gilded; the test wants a
   choice of two, so it needs a second wild omen) or make mirrored cards
   stronger. A design call (FUN-REVIEW proposal 3).
4. Steam lobbies (online through Steam invites) before the store page says
   PvP or Multiplayer.
