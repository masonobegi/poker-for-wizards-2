# Shipping HEXHOLD

What is done, what is left, and which parts only you can do.

---

## Done and verified

Each of these is checked by something you can run, not by assertion.

| Area | Verified by |
| --- | --- |
| Game rules, hand evaluation, all 45 sigils, all 23 omens | `npm test` — 104 tests |
| A full run completes in a real browser | `npm run play` — Playwright drives menu → intro → betting → spell stack → showdown → market → omens → game over |
| Full controller support at Steam Deck resolution | `npm run play:pad` — 9 checks driven by a synthetic gamepad, no mouse used |
| No memory leak over a session | heap stays flat across a full playthrough |
| Server survives abuse | room caps, per-address socket and room-creation limits, token-bucket rate limiting |
| Server bundles and runs standalone | `npm run build:server` → one 1.8MB `.mjs`, no `node_modules` |
| Desktop installer builds with an icon | `npm run package:win` → `release/HEXHOLD Setup 0.9.0.exe` |
| Achievements fire during real play | `npm run play` reports what unlocked |
| Chip conservation, no deadlocks, across long bot games | `npm run sim` |
| Balance | `npm run metrics` — pacing, cast rate, showdown rate, action spread |
| Tables survive a restart | `npm test` — a hand in progress, its cards, chips and reconnect tokens all come back |
| Every sound renders, and none clip | `npm run audio` — 50 sounds and 5 music beds rendered offline and measured for peak, RMS, DC offset, duration and spectral centroid |
| Every target resolution lays out correctly | `npm run responsive` — Steam Deck, laptop, 1080p, 1440p, 4K, ultrawide and the minimum window |

---

## What you have to do — Steam account work

None of this can be done from the repository. It all needs your Steam partner account.

1. **Pay the Steam Direct fee and create the app.** You get an App ID.
2. **Write the App ID into the build.** Either set `STEAM_APP_ID` in the environment, or drop a `steam_appid.txt` containing the number next to the binary. Nothing else needs changing — `electron/steam.cjs` picks it up and stays dormant without it.
3. **Install the native module:** `npm i steamworks.js`. It is already listed as an optional dependency, so a build without it still works.
4. **Upload the achievements.** Run `npm run steam:manifest`; it writes `steam/achievements.json` and `steam/achievements.vdf` from the same definitions the game uses, so the names cannot drift. Twenty achievements, five hidden.
5. **Enable Steam Cloud** in the app's settings, auto-cloud for `hexhold-save.json`. The sync code is written and dormant until then.
6. **Store page assets.** Capsule images, header, screenshots, trailer. The `playthrough/` folder has clean 1440×900 captures of every phase that are a reasonable starting point for screenshots.
7. **Age rating and content survey.** The game has gambling *mechanics* but no real-money gambling and no purchasable currency — the answer to "does your game contain gambling" is nuanced and you should read Valve's current wording rather than take mine.
8. **Depot and build upload** via `steamcmd`. The packaged output in `release/win-unpacked/` is what you upload.

---

## Online multiplayer

The game plays offline against bots with no setup. For two people in different places, one of you runs a server.

```bash
docker compose up -d --build
```

That serves the client and the socket on port 3001. Players enter the address in **Online** on the menu. Everything that protects a public server is configurable by environment variable — see `server/config.ts`, which is deliberately the only place limits are defined.

**Not verified:** the Docker image itself was never built, because there is no Docker in the environment this was developed in. Every step it performs is verified individually — the lockfile installs clean, the server bundles, and the bundled server boots and serves the built client with working `/health` and `/ready`. Build it once yourself before relying on it.

If you would rather not run a server, the alternative is Steam's own networking (`ISteamNetworkingSockets`) for peer-to-peer play through the Steam relay. That is a real piece of work and is not written — the current transport is Socket.IO over TCP.

---

## Known gaps

Honest list, worst first.

1. **Nobody has played this against another human.** Every balance number comes from bots. Bots do not tilt, do not slow-roll, and do not think about what you think they have. Expect the sigil economy in particular to need another pass once real people are bluffing with it.
2. **The Docker image is unbuilt** (above).
4. **Audio has never been heard by a human.** It is measured — every sound renders, none clip, `ui_hover` is quiet and short, chips read brighter than felt, and the impossible-hand sound is the biggest in the set. Measuring is not listening.
5. **Crash reporting is local only.** The desktop shell writes a plain-text `crash.log` in the user data folder and offers a reload, which means a player whose game died has one file you can ask for. A hosted service would tell you without asking; that is worth adding before a wide release.
6. **Content depth.** 45 sigils, 23 relics, 23 omens. Enough that no two runs look alike, but a long-lived roguelike wants more; replayability is still the thing most likely to be criticised.
7. **One language.** No localisation framework; all copy is inline English.

---

## Release checklist

- [ ] App ID created, written into the build
- [ ] `npm i steamworks.js`
- [ ] Achievements uploaded from `npm run steam:manifest`
- [ ] Steam Cloud enabled for `hexhold-save.json`
- [ ] `npm test && npm run play && npm run play:pad` all green
- [ ] `npm run package:win` (and `:linux` for Deck) produce installers
- [ ] Docker image built once and a real remote game played over it
- [ ] Store page, capsules, trailer
- [ ] Age rating survey
- [ ] A build played end to end on actual Steam Deck hardware
- [ ] At least one full session against real humans
