# NEXT: HEXHOLD after round 9 (2026-10-23)

## Round 9, in short

- **Branch `relics-r9-2026-10-23`.** Later runs sell 30 relics instead of
  23: seven new ones written for the later game (The Witness, The Ember Jar,
  Indelible Ink, Twofold, The High Spade, The Changeling, The Grimoire). The
  first run is unchanged, 280 of 280 seeded runs identical.
- **Fun 8/10 (7.5)**, the narrowest 8 the locked rubric allows: criterion 7
  ("builds have depth") 7 to 8, scored 8 by two blind reviewers. It rests on
  simulated players; the December playtest is the test of it.
- **Watch**: the Ashen won 9 of 40 later runs (15), partly to the Ember Jar
  in opponents' hands; three of four mythics are almost never bought.
- **Fixed**: the Burn sigil's ledger line ("burns a card in the deck out of
  the board").
- The Windows builds predate round 9; rebuild before an upload.

Round 8 follows.

# NEXT: HEXHOLD after round 8 (2026-10-23)

## Round 8, in short

- **Merged into `main`** (branch `relic-shelf-2026-10-23`). Later runs sell
  23 relics instead of 16; the first run is unchanged.
- **Fixed**: a second relic that marks a hole card did nothing (Wild
  Inheritance beside Gilt Edge), on every run since the shelf had both.
- **New**: Gilt Edge, Third Hand, Unstable Isotope and Wild Inheritance say
  in the ledger, and flash on the rail, when they changed a hand.
- **Fun stays 7/10 (7.4).** Criterion 7 is the strongest 7 yet; the next
  point needs a later shelf of about 28-30 or a wider sigil pool, which
  means new content, best steered by the December playtest
  (`FUN-REVIEW.md`, round 8).
- **Also 2026-10-23**: the "Answer it?" plate no longer covers the spell it
  asks about (it hid half of it at the Steam Deck's 1280x800;
  `test/stackfit.mjs`), the Market's "more rules" chip no longer sits on a
  rule, and the sixth store screenshot (`06-answer-it.png`) is captured.
  Code-side readiness 52 of 52. Windows builds are from 379c617, before the
  panel fix: rebuild before an upload. Linux builds are round 7's.

Everything below is from round 6 and still stands where round 7 and 8 did
not change it.

# NEXT: HEXHOLD after round 6 (2026-10-22)

HEXHOLD ships first: Coming Soon by 20 Nov 2026, a Steam Playtest in
December, the Next Fest demo 22 Feb - 1 Mar 2027 (register by 10 Jan),
release 8 Apr 2027.

**Branches.** Round 6 is on `steam-prep-2026-10-22`, pushed but **not merged
into `main`**: a push to `main` builds the public web version on Railway
(GitHub shows the Railway environment deploying every push since 17 Oct,
including commits that were only on the `railway` branch, and `railway`
equals `main`). Merging is Mason's call; `steam-ready-2026-10-09` still
equals `main` at 35549b8.

## State after round 6

- **Fun 7/10 on the locked rubric (7.1; round 5 was 7.6, an 8)**
  (`FUN-REVIEW.md`, round 6). The 2026-10-17..19 UI pass made the game
  clearer and better-looking (a blind reviewer puts it about a point above
  round 5's build), but the content cut that came with it (13 sigils, 9
  omens, 12 relics; covens off) cost criteria 4, 7 and 1. Nothing was
  reversed: the cut came from two real players' confusion.
- **Fixed this round**: the demo dealt the Ashen to everyone; the intro and
  the demo's pitch sold covens and cards that are not dealt; Mirror did not
  copy marks and its copies never reverted; the style audit could not read
  color-mix() and hid a 1.79:1 label and five off-palette colours; on a pad,
  first-run hints trapped the d-pad, nothing below the fold was reachable
  (the Market's Done), and B could not close the deck census or a pinned
  omen. Fonts credited; rich presence text added.
- **Built**: a Steam Playtest build with a feedback prompt; SteamPipe files
  for the demo and playtest apps; the store copy rewritten for the current
  game; an art brief for the capsules; five store screenshots and trailer
  cut 4 on the current UI.
- Code-side readiness: `STEAM-READY.md`.

## Next steps, in order

1. Mason: the Steamworks account, the $100 fee and the tax and bank
   interviews now; commission the capsule artist (`steam/art/BRIEF.md`, art
   needed by 13 Nov for a 20 Nov Coming Soon).
2. Mason: decide on the covens (FUN-REVIEW round 6, "What would earn the 8
   back"): bring them back as an unlock after the first run, grow the pools
   a card at a time, or keep the single opening. This decides whether the
   December playtest tests a 7 or an 8.
3. Mason: merge `steam-prep-2026-10-22` into `main` when a web deploy of it
   is wanted (it fixes the demo and the pad, and changes nothing about
   hosting).
4. Code, when wanted: a ledger line for the five relics that act silently at
   the deal; a clean spell-stack store screenshot (`steam/screenshots/`).
5. Mason, before the playtest: `PLAYTEST_FEEDBACK_URL`, the real-hardware
   Deck and pad check, one listening pass with headphones.

## State after round 5 (2026-10-16, kept for history)

- **Fun 8/10 on the locked rubric, 7.6 with one point of margin**
  (`FUN-REVIEW.md`, round 5 at the end). This morning's build re-scored 7.5:
  the art pass between rounds lifted presentation to 7, and a font bug from
  the same pass (Pixelify Sans drew "fi"/"fl" as "A": "the Arst hand", "Aop")
  cost "says what happened" a point until it was fixed. Sellable at $9.99 as a
  solo roguelite. Code-side 100%: `STEAM-READY.md`.
- Round 5 changed: two relics on the Market's shelf, take one
  (`RELIC_OFFERS`, `server/game/shop.ts`); bots finish a hand quickly once a
  solo player has folded (`FAST_AFTER_FOLD`, `server/game/engine.ts`);
  ligatures off (`src/styles/base.css`); the showdown board row laid flat.
  Measured on seeds 0-279 and 280-419 (`plans/fun-round5-data/`): one of your
  own impossible hands +5 points in both sets, a real relic choice 3.3 times a
  run, 12 s less dead time a run on identical outcomes, the demo's impossible
  hands 29% to 36%. Costs: pages written 1.2 to 0.9 a run (the harness's
  dearest-first buyer), and the Unaligned's wins fell (19 to 11 of 60).
- `npm test` 382 pass, typecheck clean; `npm run responsive` 7/7,
  `test/style.mjs`, `test/align.mjs` and `test/demo.mjs` pass on the new build.

## Next steps after round 5 (kept for history)

1. Mason: a closed playtest with real people (the December Steam Playtest).
   It decides whether the 8 holds: the creeds' feel, whether "pick one" reads
   as a choice or a loss, and whether the Unaligned's fall is real.
2. Mason: commissioned art (opponent portraits, coven art, capsules) and one
   listening pass with headphones. Presentation is a 7 "only just".
3. Rebuild the Linux full game and demo in WSL (`scripts/linux-smoke.sh`
   after): the Windows builds were rebuilt from `26f0fa0` on 2026-10-16, the
   Linux ones predate the arcade look. The store screenshots were recaptured;
   the generated capsules were not (commissioned art replaces them).
4. Watch list from round 5: the Unaligned's win rate; the Unmoored's first
   ante (33% lose their stack, caught by the phylactery); mythics are rarely
   affordable (7 runs of 280 own a new one).
5. Steam lobbies before the store page says PvP or Multiplayer.

## Done on 2026-10-11: the basketball cut-ins, ported

`plans/030-port-the-basketball-cut-ins.md`: banners play as arcade cut-ins
and skip on any input; relics punch when their rule fires (read from the
ledger's `rule` tags); BUSTED / COUNTERED / BOUGHT stamps; spell impact
frames; "+N" pot pops; count-ups on the showdown and the run summary.
Client only; `npm run fun:batch` unchanged. Left: a feel-check on a Deck.

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

## Next steps after round 4 (kept for history)

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
