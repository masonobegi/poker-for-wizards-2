# Shipping HEXHOLD

What is done, what is left, and which parts only you can do.

For the parts that need a desktop, a pair of ears or another person — the
listening pass, the Electron build, an offline launch, Docker, Steam Deck
hardware — see [HANDOFF.md](HANDOFF.md), which is written as a run list rather
than a status report.

---

## Done and verified

Each of these is checked by something you can run, not by assertion.

| Area | Verified by |
| --- | --- |
| Game rules, hand evaluation, all 71 sigils, all 41 omens, all 7 covens | `npm test` |
| A full run completes in a real browser | `npm run play` — Playwright drives menu → intro → betting → spell stack → showdown → market → omens → game over |
| Full controller support at Steam Deck resolution | `npm run play:pad` — 9 checks driven by a synthetic gamepad, no mouse used |
| No memory leak over a session | heap stays flat across a full playthrough |
| Server survives abuse | room caps, per-address socket and room-creation limits, token-bucket rate limiting |
| Server bundles and runs standalone | `npm run build:server` → one 1.8MB `.mjs`, no `node_modules` |
| Desktop installer builds with an icon | `npm run package:win` → `release/HEXHOLD Setup 0.9.0.exe` |
| Achievements fire during real play | `npm test` — the watcher is driven directly against a synthetic payout. `npm run play` also reports what unlocked, but only when the bots happen to lose you a pot, so it is a sample, not a proof |
| Motion holds its invariants | `npm test` — reduced motion never deletes a cue or makes one louder; nothing framer animates relies on a CSS transform; no `transition: all`; every `whileHover` is gated |
| Chip conservation, no deadlocks, across long bot games | `npm run sim` |
| Balance | `npm run metrics` — pacing, cast rate, showdown rate, action spread. Bots raise 15%, bet 14%, call 26%, check 14%, fold 23%; showdowns land around 47% and magic fires in ~88% of hands |
| Sounds are distinguishable from each other | `npm run audio` — every pair compared on length, brightness, loudness and attack, and the winning sounds are held brighter than the elimination sting |
| Tables survive a restart | `npm test` — a hand in progress, its cards, chips and reconnect tokens all come back |
| Every sound renders, none clip, and the mix holds | `npm run audio` — 50 sounds and 5 music beds rendered offline and measured for peak, RMS, DC offset, duration and spectral centroid, plus every sound checked against the level `src/audio/mix.ts` assigns it |
| Every target resolution lays out correctly | `npm run responsive` — Steam Deck, laptop, 1080p, 1440p, 4K, ultrawide and the minimum Electron window |

---

## What you have to do — Steam account work

None of this can be done from the repository. It all needs your Steam partner account.

1. **Pay the Steam Direct fee and create the app.** You get an App ID.
2. **Write the App ID into the build.** Either set `STEAM_APP_ID` in the environment, or drop a `steam_appid.txt` containing the number next to the binary. Nothing else needs changing — `electron/steam.cjs` picks it up and stays dormant without it.
3. **Install the native module:** `npm i steamworks.js`. It is already listed as an optional dependency, so a build without it still works.
4. **Upload the achievements.** Run `npm run steam:manifest`; it writes `steam/achievements.json` and `steam/achievements.vdf` from the same definitions the game uses, so the names cannot drift. Twenty achievements, six of them hidden.
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

0. **Two of these harnesses run against the BUILD, not the source.** `npm run
   responsive` and `npm run play:pad` open `localhost:3001`, which is the
   express server serving `dist/`. `npm run play` opens the vite dev server on
   `:5173`. Edit a file, run the first two without `npm run build`, and you
   have tested the previous build — which happened during development and
   produced a green result that meant nothing. **Always `npm run build` before
   those two.** Related: `responsive`'s viewport-overflow check was incapable
   of failing until it was fixed, because it clipped every element against
   `body { overflow: hidden }`; treat older green runs of it as unproven.
1. **Nobody has played this against another human.** Every balance number comes from bots. Bots do not tilt, do not slow-roll, and do not think about what you think they have. Expect the sigil economy in particular to need another pass once real people are bluffing with it.
2. **The Docker image is unbuilt** (above).
3. **The six-handed table is the slow configuration.** `npm run metrics -- 180 6` reads about 20s a hand against a threshold that wants 12; the default practice table (you and three bots) now runs about 12s, down from 19s, after a resumed turn stopped paying a bot's full deliberation again after every cast (2026-09-25). Bot think time already shortens as the table fills, and the remaining cost is real — six players, four streets, and six to nine spells a hand with a response window on each. It is worth another look, but not by making the spell layer quieter.
4. **Audio has never been heard by a human.** It is now measured a good deal harder than it was — every sound renders, none clip, each one sits within 3 dB of a hand-authored target level, the ladder from `ui_hover` up to `win_impossible` is checked end to end, and the table bed has content above the bass where a laptop speaker can actually reproduce it. That last one was a real bug found purely by measurement: the bed under most of a session was a 36 Hz sine and a pluck every ten seconds, which is silence on any speaker smaller than a subwoofer.

    None of that is listening. Measurement can tell you two sounds are 12 dB apart; it cannot tell you the counterspell sound is annoying by the fortieth time, that the table bed grates after an hour, or that the win sting is corny. Put headphones on before you ship.
5. **Crash reporting is local only.** The desktop shell writes a plain-text `crash.log` in the user data folder and offers a reload, which means a player whose game died has one file you can ask for. A hosted service would tell you without asking; that is worth adding before a wide release.
6. **`evaluate` is expensive on a wild board, and the omens deal wilds.** A
   plain seven-card hand evaluates in 0.11ms; one wild takes 1.7ms, two wilds
   with two superposed cards take 39ms, and nine cards can reach 122ms. A wild
   slot carries one candidate face per rank per suit in play and the evaluator
   walks the product of five of them.
7. **Content depth.** 71 sigils, 45 relics, 41 omens, 7 covens, 5 hexes per
   coven and a Daily Rite. Hexes and the daily give a reason to start the next
   run; the hex rules themselves were set without a human win rate, so Hex V
   may be too easy or unwinnable. Replayability is still the thing most likely
   to be criticised in reviews.

    Four of those omens did nothing at all until 2026-09-26. The Twinned, The
    Kindling, The Binding and The Bindings each inscribe a mark — Mirrored,
    Burning, Bound — that no engine code read, so they landed with a banner
    naming a permanent rule and changed no rule. They are implemented now, and
    `test/content.test.ts` fails if any mark is written but never acted on.
    Worth knowing when reading older balance numbers: every measurement taken
    before that date was taken against a game where roughly one omen in ten
    was inert.
8. **One language.** No localisation framework; all copy is inline English.

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
- [ ] The whole sound set listened to, on speakers and on headphones
- [ ] A build launched with the network disconnected, to confirm it still
      looks like itself
