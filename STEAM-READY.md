# HEXHOLD: Steam readiness (2026-10-09)

Branch `steam-ready-2026-10-09`, built on `feedback-1` at `ceff08b`. **Ship
the Steam depot from this branch only**: `main` and `feedback-1` lack the save
fix, the solo pause and everything in the afternoon pass below.

Verdict: **about 90% of what code and files can do.** What is left is mostly
Mason's Steamworks account, real hardware, human ears, and three design calls
listed at the end.

Status key: **DONE** (verified, and how), **PARTIAL**, **BLOCKED**.

## 0. Afternoon pass (2026-10-09): review findings and playtest fixes

An independent review of this branch found 8 defects; all 8 are fixed. The
playtest fix list named 8 "before Steam launch" fixes; 6 are done, 2 wait on
Mason (section 10).

| # | Finding | Status and proof |
| --- | --- | --- |
| R1 (high) | A Steam-launched copy never turned Steam on: `steam.cjs` ignored `SteamAppId`/`SteamGameId`, and the depot excludes `steam_appid.txt` | DONE. Reads Steam's variables first, rejects a non-Steam shortcut's 64-bit ID. `test/steam.test.ts` 5/5 (2 fail on the old resolver). `SHIPPING.md` step 2 rewritten. |
| R2, R3 | A launch that reused an old port brought deleted save keys back; every launch left a dead copy of the save | DONE. The shell clears page storage before loading, and the preload clears before seeding. Packaged harness launch 3 (old port back after a key was deleted elsewhere) passes; with both clears removed it fails: "a deleted key came back from port 54336's old storage". |
| R4 | "Borderless window" was a maximized window | DONE. Renamed "Maximized window" (Fullscreen is the borderless mode). |
| R5 | Window sizes said pixels, applied DIPs (1920x1080 made 2400x1350 at 125%; empty row at 1080p/150%) | DONE. `electron/display.cjs`; presets are real pixels, only offered when they fit; minimum window shrinks to the screen; an empty row explains itself. `test/display.test.ts` 6/6. |
| R6 | The OFL font licence did not ship | DONE. `resources/client/fonts/OFL.txt` (verified in the built folder); About and `THIRD_PARTY.md` say where each licence is. |
| R7 | No menu on a Mac build broke Cmd+C/V/X/A and Cmd+Q | DONE (untested on a Mac). macOS gets app, Edit and Window roles only; unit-tested that no reload or DevTools role is in it. |
| R8 | Relaunch check passed even on the same port | DONE. The harness picks its ports; equal ports fail. |
| P1 | Busting at a solo table meant watching bots finish, no skip | DONE. When every human is out, the run ends that hand; the chip leader takes the table. `test/solo.test.ts` (fails on the old engine). |
| P2 | LB/F folded a free check; Y/A shoved, one press each | DONE. Second press within 1.5s, with a prompt in pad glyphs. jsdom test in `render.test.tsx` (fails on the old ActionBar). |
| P3 | 45s Market clock at solo tables | DONE. No clock solo; Done closes it; 30-minute abandon cap. Two-human tables keep 45s. `test/solo.test.ts`. |
| P4 | 10px text on a Deck | DONE. Every 10, 10.5 and 11px rule, the xs token and the sigil cards' fluid floors are 12px. `npm run responsive` now enforces 12px (card-face glyphs keep 10px): see section 4. UI scale max left at 1.25 (see section 10). |
| P5 | No way to stop flashes without losing all motion | DONE. Settings, Video, **Reduce flashing** (flashes, colour splits, shake); on when the OS asks for reduced motion. Test in `render.test.tsx`. Store-page line drafted. |
| P6 | Spell overlay length setting | NOT DONE. The 2.6s hold (`StackOverlay.tsx` `LINGER_MS`) is confirmed to have no setting. Left for a decision on Brief's length and on what Off shows. |
| P7 | Silent title screen | DONE. The shell allows audio without a gesture and the desktop app starts the menu music at once. Packaged harness: AudioContext runs before any input. |
| P8 | No Steam on-screen keyboard for text fields | NOT DONE: needs the Steam client to test, and a choice between wiring `ShowFloatingGamepadTextInput` and hiding Join on a pad. |

Found while working, not fixed: Settings, Gameplay has three toggles
(**Confirm before folding** (on by default), Always show pot odds, Auto-muck)
that are stored but read by nothing. They do nothing in play. Either wire them
or remove them before launch.

## 1. Desktop build that runs offline: DONE

- `npm run package:win` makes the installer, a zip and `release/win-unpacked/`.
  This pass rebuilt `win-unpacked` (`electron-builder --win --dir`) for the
  harness; rebuild the installer before uploading.
- `test/packaged.mjs` launches the **packaged exe** through Playwright's
  Electron driver, with a dead proxy so nothing can leave the machine. It now
  runs the game **muted, off-screen and unfocusable** (`HEXHOLD_TEST_OFFSCREEN`),
  and picks its own ports. Final run: see section 9.
- Linux (Steam Deck): target configured, never built or launched. PARTIAL.

## 2. Steamworks, degrading gracefully: DONE (dormant until an App ID exists)

- `electron/steam.cjs` (steamworks.js, optional) reads the App ID from
  `SteamAppId`/`SteamGameId` (set by Steam on launch), then `STEAM_APP_ID`
  (local test of a packaged build), then `steam_appid.txt` (dev only). No ID,
  no module or no Steam client: it no-ops.
- The native module ships unpacked (`app.asar.unpacked/.../steam_api64.dll`).
- `steam/dev/steam_appid.txt` = 480 (Spacewar), dev runs only, never packaged.
- Achievements: 20 (6 hidden) in `shared/achievements.ts`; `npm run
  steam:manifest` writes `steam/achievements.json`/`.vdf`. Rich presence wired.
- Steam Cloud: the game writes `hexhold-save.json` through the Cloud API
  (`src/lib/cloud.ts`). `steam/steampipe/README.md` also describes Auto-Cloud
  for `hexhold-storage.json`. Use one, not both.

## 3. Settings menu: DONE

- **Video**: display mode (Fullscreen, Maximized window, Windowed), window
  sizes in real pixels that the display can honour, VSync (next launch),
  reduce motion, **reduce flashing**, particle density, UI scale. All buttons,
  so the gamepad reaches them.
- **Audio**, **Controls** and **About** (version, credits, where the licences are).
- Persisted per user in `%APPDATA%\HEXHOLD\`: `hexhold-storage.json` (the
  whole save, the only source of page storage), `settings.json`,
  `window-state.json`, `tables.db`, `crash.log`. A save that cannot be read
  is copied to `hexhold-storage.json.unreadable-<time>` before it is replaced.

## 4. Controller and Steam Deck: PARTIAL

- `npm run responsive` (all 7 resolutions, headless and muted) with the new
  12px floor: see section 9 for the final result. Before the change, the Deck
  run failed the same check on 41 pieces of text at 10 to 11.5px.
- `npm run play:pad` (9/9 at 1280x800) was verified before this branch and
  not re-run.
- Prompts are Xbox glyphs. No PlayStation glyphs. No Steam on-screen keyboard
  yet (P8).
- BLOCKED for Mason: real Deck hardware (legibility, frame rate).

## 5. Pause, Quit, saves: DONE

- Solo tables (practice, the Daily Rite) pause from the menu, have no Market
  clock, and end the moment the player is out. Tables with two humans do none
  of these. `test/pause.test.ts`, `test/solo.test.ts`.
- Quit: the packaged harness's Quit click now closes the app, and no HEXHOLD
  process is left (it timed out under the morning's harness).

## 6. Shipping hygiene: DONE

- Release builds: no menu on Windows/Linux (no live Reload or DevTools
  accelerators); macOS keeps app/Edit/Window roles only. DevTools cannot open
  (verified by shortcut and by API).
- The dev-only Sounds tab is absent from the packaged build (verified).
- Renderer errors reach `crash.log`, capped at 20 a session.
- Flag for Mason: the built-in server listens on `0.0.0.0` for LAN play, so
  Windows may show a firewall prompt on first launch. A product decision.

## 7. Store kit in `steam/`: DONE

- Checked against Valve's asset list (ops `steam-onboarding.md` 2.2). Every
  slot is filled at its exact size; the two the morning kit missed are now
  there: **`shortcut_icon_256x256.png`** and **`library_header_920x430.png`**.
  Also new: `community_icon_184x184.jpg` (the form wants .jpg),
  `page_background_1438x810.png` (optional), `event_cover_800x450.png`.
  All from `steam/make_art.py`; each new one was opened and looked at.
- **Achievement icons**: 40 JPGs (achieved and locked, 256x256) in
  `steam/art/achievements/`, from `steam/make_achievement_icons.py`: the
  emblem with a monogram each. `achievements_sheet.png` shows all of them.
- `steam/store-page.md`: the **final copy** (short description 264 chars,
  tagline, About This Game BBCode, 7 bullets, 16 tags, A/B variants) from
  `market/hexhold-store-copy.md`, plus a photosensitivity line. System
  requirements, languages, controller support, content survey and price kept.
- Screenshots: 8 at 1920x1080. **Upload the 6 gameplay ones**; `01-menu` and
  `11-menu-overlay` are menus, which Valve's review rejects.
- `steam/steampipe/`: app and depot VDFs (placeholders) and a README.

## 8. Licences and naming: DONE

- `THIRD_PARTY.md` ships beside the exe; the OFL text ships in
  `resources/client/fonts/OFL.txt`; npm licences are inside `app.asar`.
  Nothing blocks a commercial release.
- Flags: no trademark search on "HEXHOLD"; simulated gambling means R 18+ in
  Australia.

## 9. Played and tested

- **Packaged build** (`node test/packaged.mjs 60`, rebuilt after every change
  here, run muted and off-screen): **20 of 20**. New checks: audio may start
  before any input; saved state survives a new port (60155 to 60156); a key
  deleted on one port stays deleted when an older port comes back. The
  practice run reached the game-over screen inside the 60 seconds: the
  harness player busted and the run ended at once (P1).
- **`npm run responsive`** (headless, muted, 12px floor): all 7 resolutions
  pass. 1080p, 1440p, 4K and ultrawide in the full run; Deck, laptop and the
  1024x680 minimum window re-run after the short-screen spacing fix.
- **`npm test`**: 242 tests. 241/241 passed at 14:10 with the engine changes.
  The final run was 241/242: the one failure is `botmagic.test.ts` "a bot
  rarely counters a spell that does not touch its hand", the load-sensitive
  test this file already flagged (bot previews have a wall-clock budget). The
  machine was at 100% CPU from other jobs; that test and `server/game/bots.ts`
  are untouched on this branch. Give it a time-independent budget.
- `npx tsc --noEmit`: clean.

## 10. Only Mason can do

1. **Steamworks partner account**, the $100 fee, the tax and bank interviews,
   and the 30-day wait.
2. **The App ID** goes only into `steam/steampipe/*.vdf` (APP_ID,
   DEPOT_ID_WINDOWS, DEPOT_ID_LINUX). Nothing in the build changes: Steam
   passes the ID at launch.
3. **Store page**: paste from `steam/store-page.md`; upload `steam/art/*`
   (not `achievements_sheet.png`) and the six gameplay screenshots.
4. **Achievements**: enter the 20 from `steam/achievements.json` and upload
   the 40 icons in `steam/art/achievements/` (or commission bespoke ones under
   the same names).
5. **Steam Cloud**: set a quota; pick the API file or Auto-Cloud, not both.
6. **Upload builds**: `npm run package:win`, then `steamcmd +run_app_build
   steam/steampipe/app_build.vdf`. Linux launch option `--no-sandbox`.
7. **Pricing** (draft $9.99), **content survey** (simulated gambling; read
   Valve's wording), **trailer**, **legal** (trademark search; publisher name;
   the copyright line reads "Mason Obegi").
8. **Design calls**:
   - P6: spell overlay length (Full / Brief / Off). What Brief's length is,
     and whether Off still shows a line in the log.
   - P8: Steam on-screen keyboard for Join, Host and the Scribe, or hide Join
     on a pad for launch. Testing it needs the Steam client.
   - UI scale above 125%: `.app` uses CSS zoom, so 150% on a 1280x800 Deck
     would lay the game out at 853x533, under its 1024x680 minimum. Raising
     the cap safely needs a cap that depends on the window size.
   - The three Gameplay toggles that do nothing (section 0).
9. **Things that need a person or a screen**: a listening pass, a full run on
   a Steam Deck, a session against real humans, and one look at the Maximized
   window and window-size buttons on a scaled display.
