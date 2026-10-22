# HEXHOLD — third-party software, fonts and assets

Shipped next to the game binary (electron-builder `extraFiles`) and summarised
in **Settings → About → Credits**. Generated from `npm ls --omit=dev --all`
on 2026-10-09; re-run that when dependencies change.

**Verdict: nothing here blocks a commercial release.** Every item is under a
permissive licence (MIT, ISC, BSD, 0BSD, SIL OFL 1.1) or is the Steamworks SDK
redistributable, which Valve licenses to Steamworks partners for exactly this
use. There are **no third-party images, sounds or music** in the game: every
sound is synthesised at runtime (`src/audio/`), and all card art, avatars and
devices are drawn in code (`src/components/`, `src/art/`).

## Fonts (vendored in `public/fonts/`, no network fetch)

| Font | Author | Licence |
| --- | --- | --- |
| Bungee (400) | David Jonathan Ross | SIL Open Font License 1.1 |
| Pixelify Sans (400) | Stefie Justprince | SIL Open Font License 1.1 |
| Press Start 2P (400) | CodeMan38 | SIL Open Font License 1.1 |
| Cinzel (500, 600, 700, 900) | Natanael Gama | SIL Open Font License 1.1 |
| Inter (400–800) | Rasmus Andersson | SIL Open Font License 1.1 |
| JetBrains Mono (500, 700) | JetBrains | SIL Open Font License 1.1 |

The first three are the arcade look's faces (headlines, body text, the 8-pixel
labels); `OFL.txt` has carried their copyright lines since that look shipped.
This table and the in-game credits named only the older three until
2026-10-22.

OFL 1.1 allows bundling in a commercial product; the fonts may not be sold on
their own, and the licence text must travel with them. It does:
`public/fonts/OFL.txt` (each font's copyright line plus the full OFL 1.1 text,
taken from the Google Fonts repository) ships as
`resources/client/fonts/OFL.txt` in the game folder. Added 2026-10-09; before
that only a URL shipped.

The store art in `steam/art/` also uses Cinzel, under the same licence.

## Where the licence texts are, in an installed copy

- This file: `THIRD_PARTY.md`, beside the exe.
- Fonts: `resources/client/fonts/OFL.txt`.
- Electron and Chromium: `LICENSE.electron.txt` and `LICENSES.chromium.html`,
  beside the exe.
- npm packages: each package's own `LICENSE` file, inside `resources/app.asar`
  (electron-builder copies the production dependencies there).
  Reading them needs an asar tool, such as `npx @electron/asar extract`.

## Runtime and shell

| Component | Licence | Notes |
| --- | --- | --- |
| Electron 44 | MIT | Ships `LICENSE.electron.txt` beside the exe |
| Chromium (inside Electron) | BSD-3-Clause and others | Ships `LICENSES.chromium.html` beside the exe |
| Node.js (inside Electron) | MIT | |
| steamworks.js 0.4.0 | MIT | Optional dependency |
| Steamworks SDK redistributables (`steam_api64.dll`, `libsteam_api.so`, inside steamworks.js) | Steamworks SDK Access Agreement | Redistributable by Steamworks partners; accepted when the partner account is created |

## Client bundle (`dist/`)

| Package | Licence |
| --- | --- |
| react, react-dom, scheduler, loose-envify, js-tokens | MIT |
| framer-motion, motion-dom, motion-utils | MIT |
| zustand | MIT |
| socket.io-client, engine.io-client, engine.io-parser, socket.io-parser, @socket.io/component-emitter, xmlhttprequest-ssl, ws, debug, ms | MIT |
| tslib | 0BSD |

## Game server bundle (`dist-server/index.mjs`)

| Package | Licence |
| --- | --- |
| express and its dependency tree (accepts, body-parser, bytes, content-disposition, content-type, cookie, cookie-signature, debug, depd, destroy, ee-first, encodeurl, escape-html, etag, finalhandler, forwarded, fresh, http-errors, iconv-lite, ipaddr.js, media-typer, merge-descriptors, methods, mime, mime-db, mime-types, negotiator, on-finished, parseurl, path-to-regexp, proxy-addr, range-parser, raw-body, safe-buffer, safer-buffer, send, serve-static, side-channel*, statuses, toidentifier, type-is, unpipe, utils-merge, vary, call-bind*, get-intrinsic, gopd, has-symbols, hasown, function-bind, es-*, dunder-proto, get-proto, math-intrinsics, object-inspect, array-flatten) | MIT |
| qs | BSD-3-Clause |
| inherits, setprototypeof | ISC |
| socket.io, socket.io-adapter, engine.io, base64id, cors, object-assign, ws | MIT |
| nanoid | MIT |

## Development-only (not shipped)

TypeScript (Apache-2.0), Vite, esbuild, tsx, Playwright (Apache-2.0),
electron-builder, jsdom, concurrently, wait-on — all permissive, none of them
in the packaged game.

## Name and content flags (for Mason, not legal advice)

- **"HEXHOLD"**: no conflict found in a quick search on 2026-10-09, but no
  trademark search was done. Search USPTO (and EUIPO if selling in the EU)
  before paying for anything with the name on it.
- **"Poker for Wizards"** is only the repository folder name and does not ship.
- **"Texas Hold'em"** is a generic term and safe to use descriptively.
- **Simulated gambling**: the game is poker with no real money and nothing to
  buy. That still matters for ratings: Australia has classified games with
  simulated gambling as **R 18+** since 22 September 2024, and Steam's content
  survey asks about it directly. See `steam/store-page.md`.
