# steam/dev — local testing only

`steam_appid.txt` here holds **480**, Valve's public "Spacewar" test app. It is
a placeholder so `npm run electron:dev` can talk to a running Steam client
before HEXHOLD has an App ID of its own.

- It is read only by unpackaged (development) runs — see `electron/steam.cjs`.
- It is never packaged: electron-builder ships `electron/**` only.
- Do **not** copy it next to a shipped binary. A Steam-launched build gets its
  App ID from Steam itself; for a local test of a packaged build, set
  `STEAM_APP_ID=<real id>` instead.
