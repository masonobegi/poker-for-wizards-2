# SteamPipe upload: HEXHOLD

Prepared 2026-10-09. Nothing here has been uploaded. Every step needs Mason's
Steamworks login.

## Once, in Steamworks (partner.steamgames.com)

1. **App Admin, SteamPipe, Depots.** Create two depots:
   - Windows: Operating System **Windows**, 64-bit.
   - Linux: Operating System **Linux + SteamOS**. The Steam Deck runs this one.
2. Replace the placeholders in `app_build.vdf`, `depot_build_windows.vdf` and
   `depot_build_linux.vdf`: `APP_ID`, `DEPOT_ID_WINDOWS`, `DEPOT_ID_LINUX`.
3. **Installation, General, Launch Options**:
   - Windows: executable `HEXHOLD.exe`, OS Windows.
   - Linux: executable `hexhold`, arguments `--no-sandbox`, OS Linux.
     Electron's Chromium sandbox wants a setuid helper that does not work
     inside the Steam Linux Runtime container, so without the flag an Electron
     game can exit at launch on the Deck. The Linux build launches and plays
     headless in WSL with the flag (`scripts/linux-smoke.sh`); confirm it in
     the Steam Linux Runtime on a Deck.
4. **Steam Cloud**: quota 10 MB, 20 files. Auto-Cloud root
   `WinAppDataRoaming`, path `HEXHOLD`, pattern `hexhold-storage.json`. For
   Linux, root `LinuxXdgConfigHome`, same path and pattern. That one file is
   the whole save (settings, profile, achievement progress). See
   `electron/main.cjs` `storageFile()`.
5. **Achievements**: enter the 20 from `steam/achievements.json`. The API names
   must match exactly. The 40 icons (256x256, unlocked and locked) are in
   `steam/achievements/`, named after each API name.

## Every build

```powershell
npm run package:win                 # release\win-unpacked
# Linux: build it in WSL from a clean clone (STEAM-READY.md, Builds), which
# keeps the execute bits; upload ~/hexhold-main/release/linux-unpacked.
# then, from the Steamworks SDK's tools\ContentBuilder\builder folder:
steamcmd +login <account> +run_app_build "<repo>\steam\steampipe\app_build.vdf" +quit
```

Set `"Preview" "1"` in `app_build.vdf` for a dry run first. The upload goes
live on no branch, because `SetLive` is empty. Set it live on `default` (or a
`beta` branch) by hand in **SteamPipe, Builds**.

## The demo and the playtest are apps of their own (added 2026-10-22)

Both are created from the full game's Steamworks page, under **All Associated
Packages, DLC, Demos and Tools**: a **Demo** for Next Fest (22 Feb - 1 Mar
2027, register by 10 Jan) and a **Playtest** for December. Each gets its own
App ID and its own two depots (Windows; Linux + SteamOS), and the same launch
options as the full game (`HEXHOLD Demo.exe` / `HEXHOLD Playtest.exe` on
Windows; on Linux the lower-case executable with `--no-sandbox`).

| App | Build it | Upload it | Placeholders to replace |
| --- | --- | --- | --- |
| Full game | `npm run package:win`, `npm run package:linux` | `app_build.vdf` | `APP_ID`, `DEPOT_ID_WINDOWS`, `DEPOT_ID_LINUX` |
| Next Fest demo | `npm run package:demo:win`, `:linux` | `demo/app_build_demo.vdf` | `DEMO_APP_ID`, `DEMO_DEPOT_ID_*` |
| Steam Playtest | `npm run package:playtest:win`, `:linux` | `playtest/app_build_playtest.vdf` | `PLAYTEST_APP_ID`, `PLAYTEST_DEPOT_ID_*` |

Before the demo ships, set `FULL_GAME_APP_ID` in `shared/demo.ts` so its
Wishlist button opens the real store page. Before the playtest ships, set
`PLAYTEST_FEEDBACK_URL` in `shared/playtest.ts` (or let it fall back to the
full game's Steam discussions once `FULL_GAME_APP_ID` is set); the build
script warns while neither is set, and the feedback button stays hidden.

The demo and playtest have their own save folders (their product names
differ), so nothing a demo or playtest player does carries into the full
game. That is by design: the demo is three antes of the same game, and a
playtest build may change under the tester.

Achievements and Steam Cloud are per app. The demo needs neither. If the
playtest should award achievements, enter the same 20 from
`steam/achievements.json` on the playtest app; otherwise the game's calls are
simply refused by Steam and nothing breaks (`electron/steam.cjs`).

`test/steampipe.test.ts` checks that each app build uploads the folder its
packaging writes and that no real ID has been committed.
