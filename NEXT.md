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

## Round 3 (2026-10-10): done

`FUN3_BRIEF.md`. Rubric locked in `FUN-REVIEW.md` before any change: 6.5
(7) before, **7.1 (7) after**. The 8 was not earned; FUN-REVIEW says what
would earn it (art, a relic pass, covens as games, a human playtest).

Decided (each one constant): the phylactery (Hex I, solo, before ante 3),
the demo at 3 antes with the Ashen open by default, Spell cards Auto as the
default, covens leaning to their school from ante 2, bots inscribing real
marks (no Wild while warm). Fixed: Deal again reused the last run's deck;
eight duplicate relics; Cold Read and the Quiet's text; Inscribe's mark is
validated. 307 tests. `release-demo/` (Windows) rebuilt on this code; the
Linux demo dir and the full game's `release/` predate round 3.

Measured on seeds 0-139 (aggressive): runs over before the first Market
12% to 1%, before ante 3 23% to 6%; an impossible hand in 39% to 58% of
runs, one of your own 21% to 34%. Raw data and scripts were in the session
scratchpad (not kept).

Open, with data: the Unmoored loses its stack in the first ante more than
any coven (37% of demo runs, caught by the phylactery); the Twinned is not
the impossible-hand coven (the Loom is).

## Next steps, in order

1. Mason: play the demo once (`release-demo/win-unpacked/HEXHOLD Demo.exe`),
   `FULL_GAME_APP_ID` once Steamworks issues it, and a closed playtest with
   real players before Next Fest.
2. Rebuild the Linux demo dir and the full game's packages before upload
   (`npm run package:demo:linux`, `npm run package:win`, Linux in WSL).
3. The design passes that would earn the 8 (FUN-REVIEW round 3): relics that
   change rules, one whole-run rule per coven (the Twinned first), art.
4. Steam lobbies (online through Steam invites) before the store page says
   PvP or Multiplayer.
