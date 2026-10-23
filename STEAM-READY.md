# HEXHOLD: Steam readiness (2026-10-23, round 8: the later shelf)

**Round 8 (2026-10-23, branch `relic-shelf-2026-10-23`, merged into
`main`)**: the later runs' relic shelf grows from 16 to 23, a bug that made
a second hole-card-marking relic do nothing is fixed (Wild Inheritance
beside Gilt Edge, on every run), and the relics that act at the deal now say
in the ledger and on the rail when they changed a hand. The first run is
unchanged apart from that fix. Fun: still 7/10 (7.4; `FUN-REVIEW.md`, round
8). Rows 44, 50 and 51 below.

Round 7 follows.

**Round 7 is on branch `covens-unlock-2026-10-22`** (from `main` at 8d1fea7,
pushed, not merged: a push to `main` redeploys the web version). Mason chose
"covens as unlock": the first run is unchanged, and after one finished run
the coven picker opens and the pools grow to 16 sigils, 12 omens and 16
relics (`shared/unlock.ts`). It also fixes "Leave table" going to a blank
screen at the end of a run, which is live on `main` today. The builds and
items below marked round 7 are from that branch; upload depots from it once
it is merged. Fun: 7/10 (7.4), up from 7.1 (`FUN-REVIEW.md`, round 7).

The round 6 state follows unchanged where round 7 did not touch it.

Milestones: Coming Soon page by **20 Nov 2026**, Steam Playtest in
**December**, Next Fest demo **22 Feb - 1 Mar 2027** (register by
**10 Jan**), release **8 Apr 2027**.

Round 6 was branch `steam-prep-2026-10-22` (main at 35549b8, the
2026-10-17..19 UI pass, plus round 6's fixes), since merged: `main` is
8d1fea7.

## Builds, round 7 (2026-10-22, branch `covens-unlock-2026-10-22`)

| Build | Where | Commit | Smoke |
| --- | --- | --- | --- |
| Windows full | `release/win-unpacked` (+ `HEXHOLD Setup 0.9.0.exe`, zip) in this worktree | 87b6f1a | packaged 21/21; quit 9/9 (slowest 90 ms) |
| Windows demo | `release-demo/win-unpacked` (+ installer, zip) | 87b6f1a | packaged 22/22 on the rerun (first run 21/22: "menu did not pause", the known flake where the play loop ends on an open spell prompt); quit 9/9 on the rerun (first run timed out launching the 6th, under load); `test/demo.mjs` all checks, including the unlock |
| Windows playtest | `release-playtest/win-unpacked` (+ installer, zip) | 87b6f1a | packaged 21/21 on the rerun (first run 19/21: Quit did not close the app, the same flake; no process was left afterwards) |
| Linux full | WSL `~/hexhold-covens/release/linux-unpacked` (+ AppImage, tar.gz), its own clone of the branch | 87b6f1a | packaged 21/21 at 1280x800; quit: 113 quits measured (stopped there; it had been given 60 rounds), every process gone in all 113, 112 within 3 s, median 549 ms, slowest 3.3 s with the Windows smokes running beside it |
| Linux demo | WSL `~/hexhold-covens/release-demo/linux-unpacked` | 87b6f1a | packaged 22/22 |
| Linux playtest | WSL `~/hexhold-covens/release-playtest/linux-unpacked` | 87b6f1a | packaged 21/21 |

The Windows builds replaced round 6's in this worktree's `release*/`; round
6's Linux builds are untouched in `~/hexhold-main`. Commits after 87b6f1a
change tests and docs only. All smokes headless, muted and off-screen.

## Builds, round 6 (2026-10-22)

| Build | Where | Commit | Smoke |
| --- | --- | --- | --- |
| Windows full | `release/win-unpacked` (+ `HEXHOLD Setup 0.9.0.exe`, zip) | 06ce69c | packaged 21/21; quit 9/9 (slowest 198 ms) |
| Windows demo | `release-demo/win-unpacked` (+ installer, zip) | 06ce69c | packaged 22/22 (see note); quit 9/9 (slowest 147 ms); `test/demo.mjs` all checks |
| Windows playtest | `release-playtest/win-unpacked` (+ installer, zip) | 06ce69c | packaged 21/21 (version line says playtest) |
| Linux full | WSL `~/hexhold-main/release/linux-unpacked` (+ AppImage, tar.gz) | cbea412 | packaged 21/21 at 1280x800 and 21/21 at 1920x1080; quit 6/6 (slowest 1.2 s, under load) |
| Linux demo | WSL `~/hexhold-main/release-demo/linux-unpacked` | cbea412 | packaged 22/22; quit 6/6 (slowest 237 ms) |
| Linux playtest | WSL `~/hexhold-main/release-playtest/linux-unpacked` | cbea412 | packaged 21/21 |

06ce69c and cbea412 are the same game code (the commits between them change
docs and screenshots). The Linux builds stay in WSL, where their execute bits
survive; the stale Windows-side copies from 12 Oct were deleted so an upload
from Windows fails instead of shipping an old build. The Windows demo's first
packaged run scored 20/22 (Quit did not close the app): round 5's known
harness flake, whose play loop can end with a spell prompt open, where the
menu ignores Escape by design. The rerun passed 22/22, and the quit harness
on the same build went 9/9. Linux was built with
Node 22.23 in WSL (round 5: 24.12; `engines` asks for 20+). Smoke runs are
headless, muted and off-screen (`test/packaged.mjs`, `test/quit.mjs`;
`scripts/linux-smoke.sh` in WSL on SwiftShader).

## Code-side readiness: 98% (50 of 51)

The fixed list below (items 1-26 from earlier rounds, all still done), plus
what round 6 found. Only work Claude can do counts; nothing that needs
Mason's account, money, hardware or judgement is in it.

| # | Code-side item (round 6) | Status | Proof |
| --- | --- | --- | --- |
| 27 | The demo player plays the coven the table plays | DONE (was: everyone sat down as the Ashen against Unaligned bots) | 92892eb; `test/demo.test.ts` fails on the old `covenFor` |
| 28 | The intro and the demo's pitch promise only what is dealt | DONE (was: "choose one of seven covens", Sealed Rank, Deep Well, "All 7 covens") | 64fed75; `test/demo.mjs` fails if the end screen promises covens |
| 29 | Mirror does what its card says, for the hand | DONE (was: no marks, no "was", and the copy never reverted) | d03be97; three tests failing on 35549b8 |
| 30 | The style audit reads every background, and the game passes it | DONE (was: blind to color-mix(); a 1.79:1 label and six off-palette colours behind it) | 439b609, f91a8a9, 36b6100; `test/style.mjs` in style |
| 31 | Legible at Deck size | DONE | `test/legibility.mjs` 0 findings on 12 screens at 1600x1000; `npm run responsive` 0 failures at 1280x800 with a 12 px text floor (11 px for labels on a card face), above Valve's 9 px |
| 32 | Every control the UI pass added works on a pad | DONE (was: hints trapped the d-pad, the Market's Done unreachable, B could not close the deck census or a pinned omen) | 9195f62; `test/gamepad.mjs` 14 of 14 at 1280x800 (rules tab, deck census, cast, Market buy, Done) |
| 33 | Glyphs match the pad in hand | DONE | Xbox (and the Deck), PlayStation, Nintendo; `test/padglyphs.test.ts` |
| 34 | A Steam Playtest build with a feedback prompt | DONE | 481e79b; `npm run package:playtest:win` / `:linux`; menu and end-of-run "Send playtest feedback" once a link is set |
| 35 | SteamPipe for the demo and the playtest apps | DONE | `steam/steampipe/demo/`, `steam/steampipe/playtest/`; `test/steampipe.test.ts` |
| 36 | Rich presence text Steam can show | DONE (was: a token with no localization) | `steam/rich_presence.vdf`; `test/steampipe.test.ts` |
| 37 | Achievements: all 20 obtainable with the current pool | DONE (checked) | One only through the blank page ("seal the kings"): Sealed Rank left the dealt pool |
| 38 | Store copy matches the game | DONE (was: 71 spells, 41 omens, 45 relics, seven covens) | `steam/store-page.md`, each claim against the pools |
| 39 | A brief for the commissioned capsule art | DONE | `steam/art/BRIEF.md` |
| 40 | Store screenshots on the current UI | DONE | Five at 1920x1080, `steam/screenshots/README.md` |
| 41 | Trailer on the current UI | DONE (was: cut 3, the pre-UI-pass table) | Cut 4, 81 s, 5.0 Mbps; `steam/trailer/STORYBOARD.md` |
| 42 | Credits name every shipped font | DONE (was: three of six) | `THIRD_PARTY.md`, Settings > About |
| 43 | Builds current on Windows and Linux, demo and playtest included | DONE | The table above |
| 44 | The relics that act at the deal say so (ledger line, rail punch) | DONE (round 8; was: Gilt Edge, Third Hand, Unstable Isotope and Wild Inheritance acted with no word) | d1e664e: a line, tagged with the relic, only when the showdown reads differently without it; `test/relics.test.ts`. Cold Read is left as it was: what it shows is face up on the table from the deal. On the first run a bought relic now visibly fires in 59% of runs (47%) |
| 45 | A clean spell-stack store screenshot | OPEN | The capture has a hint over the ante bar and text running under the sticky "Answer it?"; Valve's minimum of five is met without it |
| 46 | Round 7: the covens open after the first run, the first run unchanged, Steam-Cloud-safe | DONE (branch) | `test/unlock.test.ts` (pools identical on a first run, a coven honoured on a later one, the demo's three, the Daily Rite, persistence on a failed write, `cloudWins` both ways); the browser harnesses run both ways (`HEXHOLD_LATER_RUN=1`) |
| 47 | "Leave table" reaches the menu | DONE (branch; was: a blank screen at the end of every run, live on `main`) | b8bf409; `test/net.test.ts` fails on the old order |
| 48 | `test/style.mjs` in style with a Market on screen | DONE (branch; was: every shop card's border off the palette at 8d1fea7) | 58ab5ab, 33d89d2 |
| 49 | Every achievement has a dealt route | DONE (branch; was: "Nobody Saw It Coming" only through the blank page) | The Sealed Court in later runs; `test/unlock.test.ts` |
| 50 | Round 8: every relic that marks a hole card applies | DONE (was: only the first one, so Wild Inheritance bought beside Gilt Edge did nothing; 4 of 28 first runs had a seat holding both) | d1e664e; `test/relics.test.ts` fails on 326034a with "Wild Inheritance marked no card" |
| 51 | Round 8: the later shelf's 23 relics fit the Market | DONE | `test/shoptext.mjs`: the shelf's longest name, rule and italic line on every card at 1024x680, 1280x800 and 1920x1080, nothing clipped, Done reachable |

**Whether it is fun is a separate question** (`FUN-REVIEW.md`, round 8):
**7/10 on the locked rubric (7.4, as round 7; round 6 7.1, round 5 7.6, an
8)**. Round 8's 23-relic later shelf is the strongest "builds have depth"
the game has had and still a 7: a shelf that size cannot reach the variety
the 45-relic 8s had, and the rest could only be added by padding. Round 7:
the covens are back from the second run and play differently (criterion 4,
5 to 7). The first run stays the plain opening, by design. Round 6: the UI pass helped presentation and
clarity, and the content cut that came with it cost depth and variety.
Sellable at $9.99 as a tight solo roguelite.

## What the Coming Soon page needs

| Item | Status |
| --- | --- |
| Short description, About This Game, feature bullets, tags, genre, languages, system requirements, content survey answers | **Done**: `steam/store-page.md` (paste from it) |
| At least 5 screenshots, 1920x1080 | **Done**: `steam/screenshots/` (five) |
| Trailer | **Done**: `steam/trailer/hexhold-trailer.mp4` (cut 4) and the 6 s loop |
| Header, small, main and vertical capsules; library capsule, header, hero, logo; page background; community and shortcut icons | Placeholders done (`steam/art/`); **commissioned art is Mason's** (`steam/art/BRIEF.md`, needed by 13 Nov) |
| Controller declaration | **Done**: declare Partial now (`store-page.md`); Full after Mason's Deck keyboard check |
| Steamworks partner account, $100 app fee, identity, tax and bank | **Mason** |
| The app created, App ID issued, store page created in Steamworks | **Mason** |
| Assets uploaded, copy pasted, content survey filled, page submitted for Valve's review (allow about a week) | **Mason**, by 13 Nov for 20 Nov |
| Trademark search on HEXHOLD | **Mason**, before paying for art with the name on it |

## The December playtest and the Next Fest demo

- **Playtest**: `npm run package:playtest:win` and `:linux` build the full
  game as "HEXHOLD Playtest" (own app, own saves). The menu and the end of
  every run offer "Send playtest feedback" with the five questions the
  playtest is for, once `PLAYTEST_FEEDBACK_URL` (`shared/playtest.ts`) is set
  or the full game's App ID exists. Upload with
  `steam/steampipe/playtest/app_build_playtest.vdf`.
- **Demo**: 3 antes; a first cast within seconds, a run in about 5 minutes,
  an impossible hand in 40% of first demos (52% of a player's second, once
  the covens and the larger pools open, round 7); it ends on "the demo ends here", the
  run summary, an honest "In the full game" list and Wishlist above the fold
  (and a bust ends on the same button). Checked against the 2024 and 2026
  Next Fest data (`shared/demo.ts`): a demo has a player's attention for
  minutes; median playtime barely predicts wishlists. Saves never carry into
  the full game (its own app and save folder), by design. Wishlist opens a
  store search until `FULL_GAME_APP_ID` is set. Upload with
  `steam/steampipe/demo/app_build_demo.vdf`.

## Mason later, in date order

1. **Now (by 30 Oct)**: the Steamworks partner account, the $100 app fee,
   the identity, tax and bank interviews; a trademark search on HEXHOLD;
   commission the capsule artist with `steam/art/BRIEF.md`.
2. **When the App ID arrives**: the App ID and depot IDs into
   `steam/steampipe/*.vdf` (and the demo's and playtest's, once those apps
   are created from the full game's page); `FULL_GAME_APP_ID` in
   `shared/demo.ts`.
3. **By 13 Nov**: the commissioned capsules delivered; paste
   `steam/store-page.md`, upload the five screenshots, the trailer and the
   art; fill the content survey (simulated gambling); submit the page for
   review. **20 Nov: Coming Soon live.**
4. **Before December** (round 7: decided, covens as unlock, on branch
   `covens-unlock-2026-10-22`; merge it, then the rest of this item is
   history): decide on the covens (FUN-REVIEW round 6: an unlock
   after the first run, or growing the pools) so the playtest tests the game
   you mean to ship; merge `steam-prep-2026-10-22` into `main` when a web
   deploy of it is wanted.
5. **Before the playtest goes out (early December)**: set
   `PLAYTEST_FEEDBACK_URL`; on a real Steam Deck (or Big Picture with a pad)
   the keyboard check in `store-page.md` (pass: declare Full controller
   support, add the Controller tag, aim for Verified), plus legibility and
   frame rate on the hardware; one listening pass with headphones on the
   packaged build; upload the playtest build and send the invites.
6. **December**: run the playtest; it decides whether the creeds, the
   two-relic shelf and the single opening hold up with people.
7. **By 10 Jan 2027**: register for Next Fest (22 Feb - 1 Mar); the demo app,
   its store page and its build uploaded and set live.
8. **By 25 Mar 2027**: the release build uploaded for Valve's build review
   (the store page must have been Coming Soon for at least two weeks, which
   it will have been); price and launch discount set.
9. **8 Apr 2027: release.**

---

# Steam readiness as of 2026-10-16 (kept for history)

Branch `steam-ready-2026-10-09`. **Ship the Steam depots from this branch
only**: `feedback-1` lacks the save fix, the solo pause, the playtest fixes
and everything below. (2026-10-12: this branch was fast-forwarded to `main`
at `60c3e84`, the animation layer and the COUNTERED fix included, so the two
were then the same commit.)

**Current builds: Windows full and demo from `26f0fa0` (2026-10-16, see the note under the table); Linux full and demo from `60c3e84` (2026-10-12):**

| Build | Where | Smoke |
| --- | --- | --- |
| Windows full | `release/win-unpacked` (+ `HEXHOLD Setup 0.9.0.exe`, `HEXHOLD-0.9.0-win.zip`) | 2026-10-16: packaged checks all pass (rerun), quit 9/9 |
| Windows demo | `release-demo/win-unpacked` (+ `HEXHOLD Demo Setup 0.9.0.exe`, `HEXHOLD Demo-0.9.0-win.zip`) | 2026-10-16: packaged checks all pass (rerun), `test/demo.mjs` all pass |
| Linux full | built in WSL Ubuntu-24.04 at `~/hexhold-main/release/linux-unpacked` (+ AppImage, tar.gz); copied to `release/linux-unpacked` | packaged 21/21, quit 6/6 |
| Linux demo | `~/hexhold-main/release-demo/linux-unpacked` in WSL; copied to `release-demo/linux-unpacked` | packaged 22/22, quit 6/6 |

**2026-10-16, fun round 5:** the two Windows builds were rebuilt from `main`
at `26f0fa0` (the arcade look and round 5: two relics on the Market's shelf,
quick bots after a fold, the ligature fix; `FUN-REVIEW.md`), in this
worktree's `release/win-unpacked` and `release-demo/win-unpacked`. Packaged
smoke, full game: every check passed on a quiet machine (then the harness's
known temp-profile EPERM on cleanup); the first run, beside the demo's
packaging, failed the harness's own 15 s wait on Quit. Demo: every check
passed on the rerun; the first run failed the same Quit wait. `node
test/quit.mjs` on the full build: 9 of 9 quits with every process gone
within 3 s, slowest 1.7 s, so the Quit flake is the harness's wait, not the
game (worth one look before the demo ships). **The Linux builds in the table
above were not rebuilt** (they predate the arcade look); rebuild them in WSL
before uploading. `steam/screenshots/` were recaptured from the new build.

`~/hexhold-main` is a clean WSL clone of `main` (`npm ci`, Node 24.12,
Electron 44.4.3), built with `npm run package:linux` and
`npm run package:demo:linux`. Upload the Linux depot from there: the WSL
copy keeps its execute bits, and the copies here do not. No
`steam_appid.txt` in any of the four, nor in `app.asar` (the only one is the
dev-only `steam/dev/steam_appid.txt`). Each build's `resources/client` and
`resources/server` are byte-identical to the `dist*` folders the harnesses
test.

## Code-side readiness: 100% (26 of 26), up from 95% (21 of 22)

Measured against a fixed list of the things code and files can do for a
Steam launch (below), each DONE with proof or not. 2026-10-09 morning: 12.5
of 21; evening: 21 of 22. 2026-10-10: 24 of 24. 2026-10-11: 26 of 26
(the Linux smoke, run again once WSL was back, found items 25 and 26). P6 is built (Mason gave a
blanket go-ahead; Full stays the default), and two items were added when
they were found: the menu could not be scrolled on a Deck (23), and the Next
Fest demo had never been looked at (24). Nothing that needs Mason's
account, hardware, money or judgement is in the count. Whether the game is
fun and sellable is a separate question: `FUN-REVIEW.md` (fun 7/10, was 6;
sellable at $9.99 as a solo roguelite).

| # | Code-side item | Status | Proof |
| --- | --- | --- | --- |
| 1 | Windows build, current | DONE | `release/win-unpacked`, installer and zip rebuilt **2026-10-12 from `60c3e84`** (main: the animation layer and the COUNTERED fix). Packaged harness 21/21 (twice; a first run scored 20/21, see section 2), quit harness 9/9, slowest 135ms after the press. |
| 2 | Linux build (Steam Deck depot), current and launched | DONE | Rebuilt **2026-10-12 from `60c3e84`** in WSL Ubuntu-24.04 from a clean clone of main (`~/hexhold-main/release/linux-unpacked`, copied to `release/linux-unpacked`). Headless in WSL on SwiftShader GL: packaged harness **21 of 21** at 1280x800; quit harness 6 of 6 (section 2). |
| 3 | Steamworks: App ID from Steam, achievements, rich presence, Cloud | DONE | `test/steam.test.ts`; dormant until an App ID exists. |
| 4 | Achievements: 20 defined, manifests, icons | DONE (was: monogram icons the manifest did not name) | 40 drawn icons in `steam/achievements/`; `achievements.json`/`.vdf` name each pair; test fails if one is missing. |
| 5 | Settings that all do something | DONE (was: 3 dead switches) | Confirm before folding drives the fold guard; the other two hidden. `render.test.tsx`. |
| 6 | Pause, quit, saves | DONE | `test/pause.test.ts`, `test/solo.test.ts`, packaged harness. |
| 7 | Shipping hygiene: no menu, no DevTools, crash log | DONE (was: DevTools stayed open on Linux) | `webPreferences.devTools` off in release; harness check passes on Windows and Linux. |
| 8 | Store art at Valve's sizes, capsule rule | DONE (was: tagline on 4 capsules) | Name and art only; UI text cropped or inked out. Every file looked at. |
| 9 | Store copy, with an honest controller declaration | DONE | `steam/store-page.md`; Partial until the Deck check (section 4). |
| 10 | Licences ship | DONE | `THIRD_PARTY.md`, `client/fonts/OFL.txt`, licences in `app.asar`. |
| 11 | P1: a bust ends a solo run at once | DONE | `test/solo.test.ts`; harness run reaches game over. |
| 12 | P2: two-press fold (free check) and all-in, held keys ignored | DONE | `render.test.tsx` (two tests). |
| 13 | P3: no Market clock solo, and no hang after Done | DONE (was: repaired, unconfirmed) | `test/market.test.ts` (section 1). |
| 14 | P4: 12px text floor | DONE | `npm run responsive` enforces it; no 10/10.5/11px rule left in `src`. |
| 15 | P5: Reduce flashing | DONE | Settings, Video; `render.test.tsx`. |
| 16 | P7: title music at launch | DONE | Harness: AudioContext runs before any input, Windows and Linux. |
| 17 | P8: Steam on-screen keyboard for text fields | DONE in code (was: none) | `test/keyboard.test.ts`, `test/steam.test.ts`, `test/display.test.ts`. Not yet seen on a Steam client (Mason, section 4). |
| 18 | P6: spell overlay length (Auto / Full / Brief / Off) | DONE (default decided 2026-10-10: Auto) | Settings > Gameplay > Spell cards: Auto (default: Full until a sigil has resolved in front of you 3 times, then Brief), Full 2.6s, Brief 0.8s, Off (only spells you can answer). `render.test.tsx` proves each mode. |
| 19 | UI scale above 125% | DONE (was: capped at 125%) | Up to 200%, applied as the page zoom and capped so the layout never drops under 1024x680 (Deck 117%, 1080p 158%, 1440p and up 200%). `npm run responsive` at 200%: 0 failures at 1280x800 and 1920x1080 (3 and 4 with the old CSS zoom). `test/uiscale.test.ts`; the packaged harness checks the zoom on Windows and Linux. |
| 20 | Bot decisions independent of server load | DONE (was: `botmagic` failed under CPU load) | Preview budget on an injectable clock; tests run idle and overloaded simulated clocks. It found a real bug: under load bots Nullified 81 of 150 harmless peeks; now under 20% either way. |
| 21 | PlayStation (and Nintendo) button glyphs | DONE (was: Xbox only) | Family from the `Gamepad.id` vendor (054c Sony, 057e Nintendo; the Deck and Steam Input stay Xbox); the legend, action bar and Controls follow the pad in hand. `test/padglyphs.test.ts` (5). |
| 22 | Quit ends the game promptly | DONE (was: 4 to 12s, once over 15s) | Electron's native teardown kept the exe (GPU, audio, browser processes) alive after the window closed; `electron/shutdown.cjs` ends the tree on `quit`. `test/quit.mjs` (menu, table, spell stack; by pid; hidden, muted): before 0/9 under 3s, after 9/9 on Windows (slowest 827ms) and 6/6 on Linux. |
| 23 | Every menu control reachable on a Deck (1280x800) | DONE (was: Settings, Quit, Daily Rite and hosting off the bottom of a screen that did not scroll) | The menu column scrolls. `npm run responsive` now fails a control nothing scrolls to (`checkReachable`): against the old menu build it reports 12 failures at 1280x800 (Daily Rite, both pickers, Host, Join, Codex...); on this build 0 at 1280x800 and 1024x680. `test/demo.mjs` scrolls to Settings. |
| 24 | Next Fest demo build, seen in a browser | DONE (was: built, never looked at) | `npm run build:demo`, then `node test/demo.mjs` (headless, muted, 1280x800): 3 covens open and 4 locked with a lock and their pitch, Play and Wishlist above the fold, a folding run reaches the wishlist screen, a shoving run gets the bust line; Wishlist opens the store. Packaged 2026-10-10: `npm run package:demo:win` (installer, zip) and `:linux` (the unpacked dir a depot uploads; the AppImage target needs symlinks Windows refuses). **The packaged demo was first launched 2026-10-11** (Linux, rebuilt from `aaba11b`): `HEXHOLD_BUILD=release-demo/linux-unpacked` packaged harness **22 of 22** (its menu: 3 covens open, 4 locked, Wishlist shown), quit harness **18 of 18**. The Windows demo was rebuilt from `5840d41` the same day: packaged harness **22 of 22**, quit harness **9 of 9** (section 2). **2026-10-12, both demos rebuilt from `60c3e84`:** Windows packaged 22/22, quit 9/9, `test/demo.mjs` all checks pass (a folding run ends on the wishlist screen after 107s, a shoving run busts and is told by whom); Linux packaged 22/22, quit 6/6. |
| 25 | Launch to the menu without a fixed 6-second wait | DONE (was: every launch waited 6s before the window existed) | The shell waited for a stdout word ("listening") the server never printed, so it always sat out its 6s fallback, and on a machine slower than that it loaded a port nobody listened on. The server now says so over IPC (`electron/serverready.cjs`). Linux build, no harness attached: menu median 7-9s before, **2.9s** after (60 launches). `test/serverready.test.ts` forks the real server; it fails on the old one. |
| 26 | A killed game leaves no server behind | DONE (was: the game server outlived its shell indefinitely) | Found running half an hour after its shell was SIGKILLed, holding its port and `tables.db`. It now shuts down when the IPC channel to the shell closes (`server/index.ts`); `test/serverready.test.ts` fails without it. |

## 0a. Fun round 3 (2026-10-10, later): the calls made

Details, measurements and the locked rubric in `FUN-REVIEW.md` (round 3).
Fun stays 7 (7.1 on the rubric, was 6.5); the 8 needs art and a relic or
coven design pass.

- **Phylactery** (Hex I, solo, one buy-back before ante 3): runs over before
  the first Market 12% to 1%. `test/phylactery.test.ts`.
- **Demo**: 3 antes (decided), the Ashen open by default.
- **Spell cards**: Auto is the default.
- **Covens lean to their school** from ante 2; **bots inscribe real marks**
  (no Wild while warm). Impossible hand in 39% of runs to 58%.
- **Fixed**: Deal again reused the last run's deck; eight duplicate relics;
  the Cold Read relic and the Quiet's coven text; Inscribe's mark is
  validated on the server. 307 tests.
- **Packages**: `release-demo/` was rebuilt on this code (Windows). The full
  game's `release/` builds predate round 3: the upload step below rebuilds
  them. (2026-10-11: all four builds are current. Linux from `aaba11b`;
  Windows full game and demo rebuilt from `5840d41`, the same code, after
  items 25 and 26. 2026-10-12: all four rebuilt from `60c3e84`, main with
  the animation layer and the COUNTERED fix; the table at the top.)

## 0. What the fun pass changed (2026-10-10)

Commits `7fae4b1..HEAD`. Measured with `npm run fun:batch` (140 whole solo
runs from the player's chair, same seeds before and after); details and
the verdicts in `FUN-REVIEW.md`.

- **Balance**: bots open warm at Hex I (antes 1-2), blinds climb 1.4x an
  ante (was 1.6x), and the first omen of every run is The Gilded (5 wilds)
  or The Twinned (7 mirrored). Runs over before the first Market 15% to
  12%; before ante 3 29% to 23%; an impossible hand in 29% of runs to 39%,
  inside the 3-ante demo 10% to 22%; your stack at ante 7 11 to 19 big
  blinds. Pinned by `test/balance.test.ts` and `test/omens.test.ts`.
- **Evaluator**: a wild's or prism's suit is decided by the flush test, not
  enumerated; bots' rollouts read a hand to 300 readings. About 7x faster
  on exotic hands, never a worse hand, a better one where the old trimming
  lost it. Half-second engine ticks over 28 runs: 27 before, 7 after.
- **P6 Spell cards** (Full / Brief / Off), **menu scroll on a Deck**, the
  **demo's locks and wishlist** above the fold.
- **Harnesses**: `npm run fun:batch` (parallel, deterministic,
  `--player cautious`, `--wall`), `test/demo.mjs`, `checkReachable` in
  `npm run responsive`; `test/browser.mjs` falls back to an installed
  Chromium when Playwright's pinned build is missing.

## 1. What the finish passes fixed (2026-10-09 evening)

Commits `0d699ea..HEAD` on this branch. Second round (items 19 to 22):

- **Quit**, root cause measured by pid: the window closed in ~150ms and the
  shell's JavaScript finished ~100ms later, then Electron's native teardown
  held HEXHOLD.exe 4 to 12s (GPU process and audio service 1.6 to 7s, then
  the browser process). It was not the spell stack (menu quits were as
  slow), and `app.exit()`/`process.exit()` do not skip it. Steam shows a
  game running, and refuses a relaunch, until that process is gone. On
  `quit` the packaged shell now ends its children and itself; every save is
  already written by then (the harness's relaunch checks prove it).
- **UI scale to 200%** as the page zoom (webFrame), so media queries and
  measurements see the real layout size. CSS zoom (the old way, still the
  browser build's, at most 125%) let the seats slide over the board.
- **Bots and server load**: the preview budget read the wall clock, so a
  busy machine changed what bots did (and failed the test). Simulated clock
  in tests; an unmeasured preview still knows whether a spell touches the
  seat.
- **PlayStation and Nintendo glyphs**, from the pad in hand.

First round:

- **The Market hang is confirmed fixed.** The verifier reported that P3 (no
  Market clock solo) could hold a Market open up to 30 minutes after Done;
  `5782781` repaired it with staged-fixture tests. `test/market.test.ts` now
  plays whole seeded solo games under a simulated clock (the real 120ms tick,
  bots on their own schedules), presses Done the moment the Market opens, and
  requires it closed within 6s. Against the engine and bots from before the
  repair it fails: seeds 1, 2, 7, 13 and 14 of 0-15 held the Market the full
  1800s. On the repair all 16 closed in 0.8 to 1.4s. The suite keeps seeds
  0-7 (three of the hangs), about 8s.
- **Steam on-screen keyboard (P8).** With a pad in use: A on a text field, a
  panel opening with its field focused, or a finger tapping a field asks
  Steam for `ShowFloatingGamepadTextInput`, placed clear of the field
  (CSS px to screen pixels through `display.fieldToScreen`). The d-pad
  passing over a field does not open it; a mouse never does. Covers Join's
  code, Host's name, the chat line and the Scribe (multi-line). A on a field
  used to fire the table's check/call shortcut behind it; it no longer does.
- **Linux build, built and launched.** `scripts/linux-smoke.sh` (WSL, no
  root, no display) runs the packaged harness against
  `release/linux-unpacked`. Its first run caught a real defect: DevTools were
  still open 800ms after `openDevTools()` on Linux, because the release guard
  only closed them after the fact. `webPreferences.devTools` is now off in a
  packaged build.
- **Achievement icons**: the drawn set from `_steam-assets/hexhold` replaces
  the monogram set; the manifests name each icon; a test checks every file is
  a 256x256 PNG and nothing stale is left beside them.
- **Capsules**: no tagline (IMPOSSIBLE POKER is store copy, not art) and no
  UI text from the capture on any capsule.
- **Settings, Gameplay**: Confirm before folding now governs the free-check
  fold guard; Always show pot odds and Auto-muck, read by nothing, are hidden.

Earlier passes today (`8f41f54..6ef3aa1`): the Steam App ID bug, save
storage across ports, real-pixel window sizes, OFL licence, Mac menu, solo
pause, bust ends the run, two-press guards and held-key repeat, the solo
Market and its repair, 12px floor, Reduce flashing, title music, the store
kit. Their proofs are in the commit messages.

## 2. Builds and runs

- **Windows**: `npm run package:win` (installer `HEXHOLD Setup 0.9.0.exe`,
  `HEXHOLD-0.9.0-win.zip`, `win-unpacked/`). `node test/packaged.mjs 60`
  (muted, off-screen, unfocusable, offline): **21 of 21**, now including UI
  scale 200% applied as page zoom. `node test/quit.mjs 3` (quit from the
  menu, a table and a spell stack; every game process timed by pid): **9 of
  9**, slowest 208ms from the press to the last process gone (rebuilt and
  re-run 2026-10-10 on the final code). **2026-10-11, rebuilt from
  `5840d41`** (server readiness and the orphan-server exit, items 25-26):
  full game packaged harness **21 of 21**, quit harness **9 of 9** (slowest
  109ms after the press); the demo (`npm run package:demo:win`, run with
  `HEXHOLD_EXE="release-demo\win-unpacked\HEXHOLD Demo.exe"` and
  `HEXHOLD_EXPECT_DEMO=1`) packaged harness **22 of 22**, quit harness **9
  of 9** (slowest 710ms, run beside a CPU-heavy job). Both hidden, muted,
  off-screen. Fixed on the way: both harnesses counted leftover processes
  on Windows as `HEXHOLD.exe`, which never matches `HEXHOLD Demo.exe`, so a
  demo that left a process running would still have passed "no HEXHOLD
  process left"; they now count the build's own exe name.
  **2026-10-12, rebuilt from `60c3e84`** (main, 15 commits on: the
  animation layer, the COUNTERED fix): full game packaged harness **21 of
  21** on two runs, quit harness **9 of 9** (slowest 135ms); demo packaged
  harness **22 of 22**, quit harness **9 of 9** (slowest 231ms),
  `node test/demo.mjs` all checks pass. The first full-game run scored
  **20 of 21**: "menu did not pause", the menu never opened on Escape and
  the ledger moved. It did not come back in two reruns. That run had played
  15 turns (the reruns 2 and 4), and the menu ignores Escape by design while
  a spell prompt, a target hint or a modal is open, so the likeliest cause
  is the harness's 60s loop ending with a prompt it had just opened. Not
  proven; if it recurs, have the harness close any `.prompt` or
  `.tbl-targethint` before it presses Escape.
- **Linux**: `npx electron-builder --linux dir` (the depot uploads
  `release/linux-unpacked`). From Windows:
  `wsl -d Ubuntu-24.04 -- bash scripts/linux-smoke.sh 60` (headless Ozone,
  `--no-sandbox`, SwiftShader GL, no display, so nothing appears).
  **2026-10-11, rebuilt from `aaba11b`:** **21 of 21** at 1280x800 in all 5
  runs; the demo (`env HEXHOLD_BUILD=release-demo/linux-unpacked`) **22 of
  22**. With `env HEXHOLD_HARNESS=test/quit.mjs`: full game 6 of 6 twice and
  demo 18 of 18 on the final harness, slowest 975ms from the press. In the
  day's earlier repeats 71 of 72 passed; the one over the 3s limit took 5.9s
  under load and nothing then said why, so every quit now prints its stages
  (before-quit, window close, the save, quit) as the main process stamps
  them. **2026-10-12, built in WSL** (not cross-built) from a clean clone
  of main at `60c3e84` (`~/hexhold-main`, `npm ci`, `npm run package:linux`,
  `npm run package:demo:linux`), smoked from that clone under
  `env -u DISPLAY -u WAYLAND_DISPLAY xvfb-run -a`: full game **21 of 21**,
  demo **22 of 22**, quit harness 6 of 6 each (slowest 331ms and 1037ms
  from before-quit, beside the Windows harness runs). What the smoke found:
  - **About one launch in 20 never showed a window** under the old flags.
    Headless Ozone has no EGL display, so the GPU process fails to start,
    and now and then the renderer's main thread parks before its first
    frame. It is not the harness: launched 60 times with no Playwright
    attached, 3 stuck; with `--disable-webgl` 1; with SwiftShader 0, and 0
    in the 150+ harness launches since. A machine with a GPU (a Deck
    included) starts its GPU process and never takes that path, so the
    smoke now runs on SwiftShader, which also draws the WebGL backdrop
    instead of its fallback.
  - **Every launch waited 6s for nothing** (item 25), and **a killed game's
    server ran on** (item 26).
  - The quit harness scored a quit that closed the page under Playwright's
    click as a failed press; it is now timed from before-quit.
  Earlier: 21 of 21 on 2026-10-10's build; 1920x1080 passed on 2026-10-09's
  (`env HEXHOLD_TEST_SIZE=1920x1080`). Checked:
  menu, Cinzel offline, version, Settings tabs, no DevTools, a practice run
  at the table, the solo pause, no network, Quit leaves no process, the save
  surviving a new port, a deleted key staying deleted. Not tested: a GPU,
  sound out of a speaker, the Steam runtime container, a real Deck.
  AppImage and tar.gz (non-Steam) are configured; first built 2026-10-12
  in WSL, not launched.
- **`npm test`**: **292 of 292** on the final code (275 on 2026-10-09).
- **Demo**: `npm run build:demo` and `node test/demo.mjs`: every check
  passes (item 24). `npm run package:demo:win` and `:linux` into
  `release-demo/`.
- **`npm run responsive`** with `HEXHOLD_UI_SCALE=2` (page zoom emulated):
  1280x800 and 1920x1080, 0 failures. At the default scale this afternoon's
  12px-floor run stands (no layout CSS changed since).
- **`npx tsc --noEmit`**: clean.

## 3. Steamworks (dormant until an App ID exists)

- `electron/steam.cjs` (steamworks.js, optional) reads the App ID from
  `SteamAppId`/`SteamGameId` (Steam sets them), then `STEAM_APP_ID` (local
  test), then `steam_appid.txt` (dev only, 480). No ID, no module or no
  Steam: every call is a no-op.
- Achievements: 20 (6 hidden) in `shared/achievements.ts`; `npm run
  steam:manifest` writes `steam/achievements.json` and `.vdf`, icons named.
- Steam Cloud: the game writes `hexhold-save.json` through the API
  (`src/lib/cloud.ts`). Use the API file or Auto-Cloud, not both.
- On-screen keyboard: `showKeyboard` / `steam:keyboard` (section 1).

## 4. Controller and Steam Deck

- Every menu reachable by pad (`npm run play:pad`, 9/9 at 1280x800, earlier
  pass); the table plays on the pad; prompts show the buttons of the pad in
  hand: Xbox (and the Deck), PlayStation or Nintendo. When Steam Input
  remaps a PlayStation pad, the game sees a virtual Xbox pad and the prompts
  say Xbox; reading the real type through the Steam Input API is a possible
  later step.
- Text entry by pad: wired (P8), unit-tested against a stand-in for Steam.
  **The store says Partial** until Mason sees it work once on a real Steam
  client; `steam/store-page.md` "Controller support" has the exact check and
  the three lines to flip to Full.
- Linux build launches and plays headless (section 2). Legibility at arm's
  length and frame rate need a Deck.

## 5. Store kit (`steam/`)

- Every Valve asset slot at its exact size (`python steam/make_art.py`); the
  header, small, main, vertical and library capsules carry the name and art
  only. Upload the six gameplay screenshots, not `01-menu`/`11-menu-overlay`.
- Achievement icons: `steam/achievements/<api>.png` and `<api>_locked.png`
  (256x256; 64x64 copies in `64/`; `contact-sheet.png` is not an upload).
- `steam/store-page.md`: final copy, tags, photosensitivity line, content
  survey drafts, controller section. `steam/steampipe/`: app and depot VDFs.

## Mason later

1. **Steamworks**: partner account, $100 fee, tax and bank interviews, the
   30-day wait. Then the App ID and both depot IDs go only into
   `steam/steampipe/*.vdf`; nothing in the build changes.
2. **Store page**: paste `steam/store-page.md` (not the ops draft, which still
   says Full controller support); upload `steam/art/*`, the six gameplay
   screenshots and the 40 icons in `steam/achievements/`. Price, content
   survey (simulated gambling), trailer.
3. **Upload**: `npm run package:win` and `npx electron-builder --linux dir`,
   then `steamcmd +run_app_build steam/steampipe/app_build.vdf`. Linux
   launch option `--no-sandbox`.
4. **On a Deck (or Big Picture with a pad)**: the keyboard check in
   `store-page.md` (press A on Join's code field and on the Scribe; type;
   Enter). Pass: declare Full, add the Controller tag, aim for Verified.
   Also legibility, frame rate, and one listening pass.
5. **Decide**: whether the two hidden Gameplay switches are ever built; the
   LAN server's `0.0.0.0` (a firewall prompt on first launch); the five
   design proposals in `FUN-REVIEW.md`. The phylactery, the demo length and
   the spell-card default were decided on 2026-10-10 (FUN-REVIEW round 3);
   each is one constant if you want it the other way.
6. **Legal and naming**: trademark search on HEXHOLD, publisher name (the
   copyright line reads Mason Obegi), Australia's R 18+ for simulated
   gambling.
7. **Merge** this branch when ready; ship depots from it until then.
8. **The Next Fest demo**: set `FULL_GAME_APP_ID` in `shared/demo.ts` once
   Steamworks issues the App ID (until then Wishlist opens a store search);
   3 antes, decided (`DEMO_ANTES`; FUN-REVIEW round 3); play it once
   (`release-demo/`), and register for the Feb 2027 Next Fest by 10 Jan.
