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
     game can exit at launch on the Deck. Untested here (no Linux build was
     launched); confirm on the Deck.
4. **Steam Cloud**: quota 10 MB, 20 files. Auto-Cloud root
   `WinAppDataRoaming`, path `HEXHOLD`, pattern `hexhold-storage.json`. For
   Linux, root `LinuxXdgConfigHome`, same path and pattern. That one file is
   the whole save (settings, profile, achievement progress). See
   `electron/main.cjs` `storageFile()`.
5. **Achievements**: enter the 20 from `steam/achievements.json`. The API names
   must match exactly. Steam also wants a 256x256 unlocked and locked JPG for
   each one. Those icons have not been made.

## Every build

```powershell
npm run package:win                 # release\win-unpacked
npx electron-builder --linux dir    # release\linux-unpacked (not yet tried)
# then, from the Steamworks SDK's tools\ContentBuilder\builder folder:
steamcmd +login <account> +run_app_build "<repo>\steam\steampipe\app_build.vdf" +quit
```

Set `"Preview" "1"` in `app_build.vdf` for a dry run first. The upload goes
live on no branch, because `SetLive` is empty. Set it live on `default` (or a
`beta` branch) by hand in **SteamPipe, Builds**.
