# NEXT: the fun and sellable pass (paused 2026-10-09, ~22:40)

Brief: `masonobegi_webpage/ops/session-2026-10-09/FUN_BRIEF.md` (follow it; git
and silent-launch rules in `FIX_BRIEF.md` beside it). Branch
`steam-ready-2026-10-09`, this worktree. HEXHOLD ships first: Coming Soon by
20 Nov 2026, Next Fest demo 22 Feb 2027, release 8 Apr 2027.

## Done (committed and pushed)

1. **`test/fun.ts`** (`71fb4c6`, `npm run fun`): whole solo runs from the
   player's chair on a simulated clock. A real human seat (solo rules: untimed
   Market, run ends on the bust), driven by the bots' own decision code at a
   human pace (3.5s a bet, 2.5s a response, 20s a Market). Reports bust hazard
   and stack depth by ante, impossible hands by ante, run arc, decision
   density, where the player's time goes, builds by coven.
   - Parallel batch: `npx tsx test/fun.ts 7 <first-seed> --json <dir>/partN.json`
     in 10 processes with first-seed 0,7,14..63 (covens rotate by seed), then
     `npx tsx test/fun.ts --merge <dir>`. 70 runs take ~3-5 min on 10 cores.
   - Runs are not bit-reproducible (nanoid card ids, a wall-clock preview
     budget in bots). Treat 70 runs as the minimum sample; differences under
     ~5 points are noise.
2. **Next Fest demo build** (`102d88a`): `npm run build:demo`,
   `package:demo:win`, `package:demo:linux` (output `dist-demo/`,
   `dist-server-demo/`, `release-demo/`; never touches `dist/`).
   - `shared/demo.ts`: `DEMO_ANTES = 3`, `DEMO_COVENS` (unmoored, twinned,
     ashen), `FULL_GAME_APP_ID = 0` (Mason sets it once Steamworks issues the
     ID; until then the button opens a store search).
   - Server enforces it (`server/net/io.ts` `sanitizeConfig`, `config.demo`
     compiled in via `__HEXHOLD_DEMO__`): hex 1, no Daily seed, `demoAntes`.
   - Engine `endDemo()` after the last ante: `gameover`, `winnerId: null`
     (unlocks nothing), `demoComplete: true`, banner YOU SURVIVED.
   - Client: `src/lib/demo.ts` `IS_DEMO`; Menu shows 3 covens open and 4
     locked, hides Hex picker, Daily Rite, Host/Join, Online; "Play the Demo"
     and "Wishlist on Steam". GameOver shows "In the full game" and Wishlist.
   - Built and bundle-checked; **not yet seen in a browser**.
3. **Bust clarity, every run**: `Player.bustedBy` (who, their hand, your
   hand, ante, hand number), in the log and as a line on the game-over panel.
4. Proof: `npm test` 280/280 (adds `test/demo.test.ts`, 5 tests), `tsc`
   clean, `npm run build` and `npm run build:demo` pass.

## Measurements (70 solo runs each, adept bots, Hex I)

| | baseline | heat only | combo (not shipped) |
|---|---|---|---|
| run over before the first Market | 16% | 11% | 10% |
| run over before ante 3 | 33% | 23% | 21% |
| mean pot at ante 1 | 110 bb | 86 bb | 86 bb |
| impossible hand seen, any time | 26% | 33% | 39% |
| impossible hand by ante 3 (the demo window) | 10% | 10% | 21% |
| first impossible hand (median ante) | 4.5 | 5.0 | 3.0 |
| your stack at ante 7 | 8 bb | 8 bb | 21 bb |
| casts per hand at ante 1 / 7 / 8 | 6.7 / 1.5 / 1.1 | 7.1 / 2.1 / 1.3 | 7.1 / 2.7 / 3.0 |
| won the table | 20% | 27% | 17% |

Other baseline facts: 13 hands and ~6 min a run (biggest pot lands 73% of
the way in, in the last 3 hands in 60% of runs); 9.1 real choices a minute;
the player holds an answer in 10.3 response windows a run and the probe
answers 1.7; dead time (watching bots, showdown holds, banners) about 38% of
a run; relic sets barely overlap between runs (Jaccard 0.08, 36 distinct
relics); covens finish within a narrow band (ante 4.0 to 5.9, 1 to 3 wins in
10 each) and the Twinned, pitched as the impossible-hand coven, sees them no
more often (20%) than the rest. ~90% of impossible hands need a duplicating
omen in force (Gilded, Court of Prisms, Prism, Twinned); deck marks alone
give 0.6% per deal for 3 wilds, so they come from spells on top of marks.

Variants, all reverted in code (they were env knobs; nothing ships them):
- **heat**: Hex I only, bots' raise/bet/bluff chances x0.55 at ante 1 and
  x0.8 at ante 2, sizing x(0.6+0.4*heat), in `bots.ts` `decideAction`.
- **growth 1.4**: blinds `Math.pow(1.4, steps)` not 1.6 (`engine.ts`
  `openShop`). Same run length (12.9 hands), stack at ante 7 8 -> 16 bb.
- **imp2**: `IMPOSSIBLE_BY_ANTE` 2, forcing from every opening omen
  regardless of `minAnte`. Alone: no gain (noise).
- **combo** = heat + growth 1.4 + imp2 + duplicating-omen inscribe counts
  x1.67 (Gilded 3->5 wilds, Court of Prisms 8->13, Prism 6->10, Twinned 4->7).
- **stackoff** (graded calling margin by bet/stack): no effect; drop it.

## Next steps, in order

1. **Ship the combo as real code**, not env reads: a `warmth(t)` helper in
   `server/game/bots.ts` used by `decideAction`; `BLIND_GROWTH = 1.4` in
   `engine.ts` `openShop` (check Hex V and Doubling Down still escalate);
   `IMPOSSIBLE_BY_ANTE = 2` in `shared/omens.ts` with the forced draw allowed
   to ignore `minAnte` (update `test/omens.test.ts:190`); raise the four
   duplicating omens' `count`s and their `text`. Watch `evaluate` cost with 5
   wilds (SHIPPING.md gap 6). Re-run 140 runs (two batches) and `npm run
   metrics -- 150 4` and `npm run sim`; update README/SHIPPING numbers.
2. **See the demo in a browser**, headless and muted: `HEXHOLD_DEMO=1` on
   the server (`npm start` after `npm run build:demo`, or dev with the env
   var), Playwright to the wishlist panel; screenshot menu and end screen;
   check the locked covens and the bust line at 1280x800.
3. **Write `FUN-REVIEW.md`** (FUN_BRIEF section 3) from the table above.
   Draft ranking: (a) the run can end in the first 90 seconds before any
   Market or omen (16%); (b) the run arc is inverted: magic and stakes peak
   at ante 1 (110 bb pots, 6.7 casts a hand) and decay to push-or-fold at
   ante 7+ (8 bb, 1.5 casts); (c) the game's namesake hand is rare and late
   (26% of runs, median ante 4.5, 10% inside a 3-ante demo); (d) covens do
   not play differently in outcome, and the Twinned does not deliver its
   pitch; (e) about 38% of a run is watching. Then three simulated Steam
   reviews and the honest verdict (fun 1-10, sellable at $9.99).
4. **Spell overlay length** (P6, Full / Brief / Off, default Full) in
   `src/components/table/StackOverlay.tsx` (`LINGER_MS`) and SettingsPanel:
   ante 1 averages 6.7 casts a hand.
5. Proposals for Mason (write in FUN-REVIEW, do not build): a one-time
   "phylactery" rebuy before ante 3; a per-ante goal instead of
   last-player-standing; a Twinned that reliably builds toward an impossible
   hand; demo length 3 vs 4 antes.
6. Update `STEAM-READY.md` (demo build, `FULL_GAME_APP_ID`), the global
   runbook and the audit checklist if anything general was learned, and
   `ops/MASON-TODO.md` in masonobegi_webpage: set `FULL_GAME_APP_ID`, decide
   demo length, play the demo once.
