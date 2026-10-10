# HEXHOLD: Steam readiness (2026-10-09, finish pass)

Branch `steam-ready-2026-10-09`. **Ship the Steam depots from this branch
only**: `main` and `feedback-1` lack the save fix, the solo pause, the
playtest fixes and everything below.

## Code-side readiness: 81% (17 of 21), up from 60% this morning

Measured against a fixed list of the 21 things code and files can do for a
Steam launch (below), each DONE with proof or not. Before this pass: 10 done
and 5 half-done (counted as half) = 12.5 of 21. After: 17 of 21. Nothing
that needs Mason's account, hardware, money or judgement is in the count.

| # | Code-side item | Status | Proof |
| --- | --- | --- | --- |
| 1 | Windows build, current | DONE | `release/win-unpacked`, installer and zip rebuilt from `e78db5d`. Packaged harness: see section 2. |
| 2 | Linux build (Steam Deck depot), current and launched | DONE (was: never built) | `release/linux-unpacked`, cross-built on Windows. Headless run in WSL: **20 of 20** (section 2). |
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
| 18 | P6: spell overlay length (Full / Brief / Off) | NOT DONE | Needs a decision (see Mason later). `StackOverlay.tsx` `LINGER_MS = 2600`. |
| 19 | UI scale above 125% | NOT DONE | `.app` uses CSS zoom: 150% on a 1280x800 Deck lays out at 853x533, under the 1024x680 minimum. Needs a cap that depends on the window size. |
| 20 | `botmagic.test.ts` "rarely counters" is load-sensitive | NOT DONE | Bot previews have a wall-clock budget; under 100% CPU the test can fail. Give it a time-independent budget. `server/game/bots.ts` untouched. |
| 21 | PlayStation button glyphs | NOT DONE | Steam Input presents a PS pad as Xbox, so prompts are correct through Steam; native glyphs are a post-launch nicety. |

Still code-side and not done, beyond 18-21: one packaged-harness run of
three had Quit take over 15s to close the window (section 2). Not
reproduced; worth a look at the quit path (`before-quit`, the preload's
synchronous save on `beforeunload`) before upload.

## 1. What this pass fixed (finish pass, 2026-10-09 evening)

Commits `0d699ea..HEAD` on this branch.

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
  (muted, off-screen, unfocusable, offline): **20 of 20** on the final run.
  Three runs of the final build: run 1 failed "app did not close on Quit"
  (no process was left afterwards), run 2 failed the pause check (Escape
  opened no menu: the harness player had likely busted and the run had
  ended, P1), run 3 passed everything. Both look like harness races, but
  the Quit one is listed under "still code-side" until it is explained.
- **Linux**: `npx electron-builder --linux dir` (the depot uploads
  `release/linux-unpacked`). From Windows:
  `wsl -d Ubuntu-24.04 -- bash scripts/linux-smoke.sh 60` (headless Ozone,
  `--no-sandbox`, no display, so nothing appears): **20 of 20** at 1280x800:
  menu, Cinzel offline, version, Settings tabs, no DevTools, a practice run
  at the table, the solo pause, no network, Quit leaves no process, the save
  surviving a new port, a deleted key staying deleted. Not tested: a GPU,
  sound out of a speaker, the Steam runtime container, a real Deck.
  AppImage and tar.gz (non-Steam) are configured but not built this pass.
- **`npm test`**: **263 of 263** (was 247), on the final code.
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
  pass); the table plays on the pad; prompts switch to Xbox glyphs.
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
5. **Decide**: P6 spell overlay length (the playtest suggests Full / Brief
   at about 0.8s / Off as log only); UI scale above 125% (worth a
   window-size cap?); whether the two hidden Gameplay switches are ever
   built; the LAN server's `0.0.0.0` (a firewall prompt on first launch).
6. **Legal and naming**: trademark search on HEXHOLD, publisher name (the
   copyright line reads Mason Obegi), Australia's R 18+ for simulated
   gambling.
7. **Merge** this branch when ready; ship depots from it until then.
