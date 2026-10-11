# NEXT: HEXHOLD after fun round 4 (2026-10-10)

Brief: `masonobegi_webpage/ops/session-2026-10-09/CONTINUE_BRIEF.md` (with
`FUN_BRIEF.md` and `FIX_BRIEF.md` beside it). Branch `steam-ready-2026-10-09`,
this worktree. HEXHOLD ships first: Coming Soon by 20 Nov 2026, Next Fest
demo 22 Feb 2027, release 8 Apr 2027.

## State

- **Code-side 100% (24 of 24)**: `STEAM-READY.md`. **Fun 8/10 on the locked
  rubric, at its threshold (7.5; round 3 was 7.1)**, sellable at $9.99 as a
  solo roguelite: `FUN-REVIEW.md`, round 4 (end of the file).
- Round 4 is merged to `main`. Windows full game (`release/`) and demo
  (`release-demo/`) rebuilt on round 4's code. Packaged smoke
  (`npm run play:packaged`): every check passed on the rerun, then the
  harness could not delete its temp profile (a Windows file lock, removed
  by hand); the first run, under a 10-process batch load, timed out on
  Quit. `node test/quit.mjs` 9/9. **Linux (WSL) build and its
  smoke test: pending, WSL is down.** `npm test` all passing, tsc clean.

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

## Round 4 (2026-10-10): done

`FUN3_BRIEF.md`, same rubric. Twelve number relics became rules (Stepping
Stones, the Keepsake, the Second River, the Sanctum, the Prism Lens, the
Magpie, the Engraver, the Blood Price, Vow of Silence, the Lodestone,
Twice-Told, the Usurper); every coven has a creed (The Last Word, Many
Futures, Tells, Foreknown, Kin, Salt, Signature). Fixed: Heirloom and The
Long Game never reached the evaluator; Open Palm and Full Purse were never
paid; showdown settled undecided hole cards on the highest rank instead of
the holder's best face; bots ignored what they had been shown.

Switches: `RULE_RELICS` (relics.ts); `COVEN_CREEDS`, `BOT_CREEDS_FROM_ANTE`,
`KIN_BOARD_ONLY` (covens.ts); `READ_WHAT_IS_SEEN` (bots.ts).

Measured on seeds 0-279 (before 3a3d6be, after b7702e7): every aggregate
figure flat or better; a bought relic's rule visibly fires in 54% of runs
(29%); the Twinned lead every coven in impossible hands (48%, was 30%).
Batch summaries are kept in `plans/fun-round4-data/` (each file names its
commit and command). Harness additions: relic offers and buys, rules fired
by relic, hands made by coven, covens-apart distance.

Open, with data: the Unmoored still loses its stack in the first ante most
(33%; partly the harness's 16-rollout reads on undecided cards); the Magpie
and the Second River barely fire; the three new mythics are rarely
affordable; covens' showdowns are no more distinct (the creeds act inside
the hand).

## Next steps, in order

1. Mason: play the demo once (`release-demo/win-unpacked/HEXHOLD Demo.exe`),
   `FULL_GAME_APP_ID` once Steamworks issues it, and a closed playtest with
   real players before Next Fest.
2. When WSL is back: `npm run package:linux` and `npm run package:demo:linux`,
   then the headless Linux smoke (`scripts/linux-smoke.sh`). Windows is
   rebuilt on round 4.
3. A human playtest decides whether the 8 holds (FUN-REVIEW round 4: the
   creeds' feel, the Keepsake, a table of four creeds). Then: two relic
   offers a Market visit (proposal), the Unmoored's first ante, art.
4. Steam lobbies (online through Steam invites) before the store page says
   PvP or Multiplayer.
