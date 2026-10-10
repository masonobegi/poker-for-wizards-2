# HEXHOLD: Steam readiness (2026-10-10, fun pass)

Branch `steam-ready-2026-10-09`. **Ship the Steam depots from this branch
only**: `main` and `feedback-1` lack the save fix, the solo pause, the
playtest fixes and everything below.

## Code-side readiness: 100% (24 of 24), up from 95% (21 of 22)

Measured against a fixed list of the things code and files can do for a
Steam launch (below), each DONE with proof or not. 2026-10-09 morning: 12.5
of 21; evening: 21 of 22. 2026-10-10: 24 of 24. P6 is built (Mason gave a
blanket go-ahead; Full stays the default), and two items were added when
they were found: the menu could not be scrolled on a Deck (23), and the Next
Fest demo had never been looked at (24). Nothing that needs Mason's
account, hardware, money or judgement is in the count. Whether the game is
fun and sellable is a separate question: `FUN-REVIEW.md` (fun 7/10, was 6;
sellable at $9.99 as a solo roguelite).

| # | Code-side item | Status | Proof |
| --- | --- | --- | --- |
| 1 | Windows build, current | DONE | `release/win-unpacked`, installer and zip rebuilt 2026-10-10 from `d31900c` (code as of `8c3b37a`, the last code change). Packaged harness 21/21, quit harness 9/9, slowest 208ms (section 2). |
| 2 | Linux build (Steam Deck depot), current and launched | DONE | `release/linux-unpacked`, same commit. Headless in WSL: **21 of 21** at 1280x800; quit harness 6/6 (section 2). |
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
| 18 | P6: spell overlay length (Full / Brief / Off) | DONE (was: waiting on a decision) | Settings > Gameplay > Spell cards: Full 2.6s (default), Brief 0.8s, Off (only spells you can answer). `render.test.tsx` proves each mode. |
| 19 | UI scale above 125% | DONE (was: capped at 125%) | Up to 200%, applied as the page zoom and capped so the layout never drops under 1024x680 (Deck 117%, 1080p 158%, 1440p and up 200%). `npm run responsive` at 200%: 0 failures at 1280x800 and 1920x1080 (3 and 4 with the old CSS zoom). `test/uiscale.test.ts`; the packaged harness checks the zoom on Windows and Linux. |
| 20 | Bot decisions independent of server load | DONE (was: `botmagic` failed under CPU load) | Preview budget on an injectable clock; tests run idle and overloaded simulated clocks. It found a real bug: under load bots Nullified 81 of 150 harmless peeks; now under 20% either way. |
| 21 | PlayStation (and Nintendo) button glyphs | DONE (was: Xbox only) | Family from the `Gamepad.id` vendor (054c Sony, 057e Nintendo; the Deck and Steam Input stay Xbox); the legend, action bar and Controls follow the pad in hand. `test/padglyphs.test.ts` (5). |
| 22 | Quit ends the game promptly | DONE (was: 4 to 12s, once over 15s) | Electron's native teardown kept the exe (GPU, audio, browser processes) alive after the window closed; `electron/shutdown.cjs` ends the tree on `quit`. `test/quit.mjs` (menu, table, spell stack; by pid; hidden, muted): before 0/9 under 3s, after 9/9 on Windows (slowest 827ms) and 6/6 on Linux. |
| 23 | Every menu control reachable on a Deck (1280x800) | DONE (was: Settings, Quit, Daily Rite and hosting off the bottom of a screen that did not scroll) | The menu column scrolls. `npm run responsive` now fails a control nothing scrolls to (`checkReachable`): against the old menu build it reports 12 failures at 1280x800 (Daily Rite, both pickers, Host, Join, Codex...); on this build 0 at 1280x800 and 1024x680. `test/demo.mjs` scrolls to Settings. |
| 24 | Next Fest demo build, seen in a browser | DONE (was: built, never looked at) | `npm run build:demo`, then `node test/demo.mjs` (headless, muted, 1280x800): 3 covens open and 4 locked with a lock and their pitch, Play and Wishlist above the fold, a folding run reaches the wishlist screen, a shoving run gets the bust line; Wishlist opens the store. Packaged 2026-10-10: `npm run package:demo:win` (installer, zip) and `:linux` (the unpacked dir a depot uploads; the AppImage target needs symlinks Windows refuses). |

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
  re-run 2026-10-10 on the final code).
- **Linux**: `npx electron-builder --linux dir` (the depot uploads
  `release/linux-unpacked`). From Windows:
  `wsl -d Ubuntu-24.04 -- bash scripts/linux-smoke.sh 60` (headless Ozone,
  `--no-sandbox`, no display, so nothing appears; xvfb would need root,
  which this WSL does not give): **21 of 21** at 1280x800 on 2026-10-10's
  build (1920x1080 passed on 2026-10-09's: `env HEXHOLD_TEST_SIZE=1920x1080`);
  with `env HEXHOLD_HARNESS=test/quit.mjs` quit is 6 of 6, every process gone
  within 582ms of the press. Checked:
  menu, Cinzel offline, version, Settings tabs, no DevTools, a practice run
  at the table, the solo pause, no network, Quit leaves no process, the save
  surviving a new port, a deleted key staying deleted. Not tested: a GPU,
  sound out of a speaker, the Steam runtime container, a real Deck.
  AppImage and tar.gz (non-Steam) are configured but not built this pass.
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
   design proposals in `FUN-REVIEW.md` (the phylactery first). P6 was built
   on the blanket go-ahead with Full as the default; say if you want Brief.
6. **Legal and naming**: trademark search on HEXHOLD, publisher name (the
   copyright line reads Mason Obegi), Australia's R 18+ for simulated
   gambling.
7. **Merge** this branch when ready; ship depots from it until then.
8. **The Next Fest demo**: set `FULL_GAME_APP_ID` in `shared/demo.ts` once
   Steamworks issues the App ID (until then Wishlist opens a store search);
   decide 3 or 4 antes (`DEMO_ANTES`; FUN-REVIEW proposal 4); play it once
   (`release-demo/`), and register for the Feb 2027 Next Fest by 10 Jan.
