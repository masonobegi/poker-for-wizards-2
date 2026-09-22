# HEXHOLD

**Impossible poker.** Online multiplayer Texas Hold'em played with a deck that does not obey physics.

A card can hold two identities at once and refuse to choose until someone looks at it. The King you are staring at is not the King the player opposite is staring at — and both readings score. You can name a rank and have every card of that rank dealt face down, before anybody has seen it. You can take the river back and run it again.

None of that survives contact with cardboard. That is the entire design brief: **if a mechanic could be reproduced at a real table with a real deck and a good memory, it does not belong in this game.**

---

## Running it

```bash
npm install
npm run dev
```

That starts the authoritative game server on `:3001` and the Vite client on `:5173`. Open the client, host a table, and you will get a four-letter code. Anyone with the code can sit down; fill the empty seats with bots if you want to start immediately.

```bash
npm run build      # production client bundle into dist/
npm start          # serve the built client + game server from :3001
npm test           # 104 tests: hand eval, sigils, omens, DOM mounts, sockets
npm run play       # plays a full run in a real browser and reports problems
npm run play:pad   # proves the game is playable on a controller
npm run responsive # lays the game out at all seven shipped resolutions
npm run audio      # renders every sound offline and measures the mix
npm run sim -- 120 6      # headless bot-vs-bot game, checks invariants
npm run metrics -- 150 5  # balance report: pacing, magic rate, action spread
```

The only runtime requirement is Node 20+. There are no database, no API keys and no audio or image assets — every sound is synthesised in the browser at runtime and every card is drawn in CSS and inline SVG.

The one exception is typography: `public/fonts/` holds the three webfonts, vendored by `scripts/vendor-fonts.mjs` and licensed under the SIL OFL. They used to be fetched from Google Fonts at runtime, which meant a desktop build launched without a network connection fell back to Times — and the display face is what the title, the hand names and the Market headings are made of. A game that ships as a binary cannot ask the internet what it looks like.

### Playing with other people

The game plays offline against bots with no setup, and a desktop build hosts
for anyone on the same network. To play with someone further away, one of you
runs a server:

```bash
docker compose up -d --build
```

Players then enter that address under **Online** on the menu. Everything that
protects a public server — room caps, per-address limits, message rate,
allowed origins — is set by environment variable in one file, `server/config.ts`.

### Desktop builds

```bash
npm run electron:dev   # the desktop shell against the Vite dev server
npm run package:win    # installer + zip into release/
npm run package:linux  # AppImage + tarball
```

The desktop build starts the game server in a child process on a free port and points a chromeless window at it, so a single binary plays offline against bots and can also host a table for people on the same network with nothing to deploy. F11 toggles fullscreen.

The app icon is generated too — `npm run icon` draws it and encodes the PNG by hand, because committing a binary would be the one asset in the repo.

Controller support is complete: d-pad or stick moves focus geometrically, the
face buttons map onto the same actions as the keyboard, and every on-screen key
hint swaps to controller glyphs while a pad is in use. `npm run play:pad`
verifies it at 1280×800 by driving a synthetic gamepad.

Steam integration — achievements, cloud saves, rich presence — is written and
dormant until an App ID is configured. See [SHIPPING.md](SHIPPING.md).

---

## How it plays

It is Hold'em. Two hole cards, five community cards, four betting rounds, best five-card hand wins. If you know poker you already know most of it.

The rest is **mana** and **sigils**.

- **Mana** accrues each street and is spent casting sigils. It is public information. An opponent sitting on five unspent mana is a threat you are meant to be able to read across the table.
- **Sigils** are spells. Casting one puts it on a **stack** and opens a short response window. Anyone holding a counterspell may answer, and their answer goes on top. The stack unwinds from the top down, so the *last* thing cast resolves *first* — a Nullify played after your spell resolves before it and eats it.
- **Relics** are permanent passives bought between antes. They change what kind of poker you are playing: flushes that need only four cards, aces that bridge both ends of the rank order, a hand that always scores one category higher.
- **Rites** inscribe a permanent mark onto a card in the **shared** deck. The upgrade you paid for can turn up in an opponent's hand three hands later. That tension is deliberate.

Above a Straight Flush sit three categories a fifty-two card deck cannot produce — **Five of a Kind**, **Flush House** and **Flush Five**. Wild marks, mirrored cards and superposition make them reachable.

Blinds climb every few hands. Between antes the **Market** opens and you spend **shards** — earned from pots, plus a stipend that scales with the ante and leans toward whoever is behind, because the shop is the one phase that exists to let a losing player change their situation.

### Omens

At every ante a new **omen** lands on the table. It is permanent, it applies to everyone, and it never comes off.

Suits merge. Aces start bridging both ends of the rank order. Every King is dealt face down before anyone has seen it. Three cards in the shared deck quietly become Wild and nobody is told which. One rank is struck from the game entirely. At ante five, the worst hand starts winning every pot.

They stack. By the end of a run you are playing under a rulebook nobody sat down to — and you can name every decision that got you there. Omens are also what make the impossible hands reachable in practice rather than in theory.

### The six schools

| School | Concerned with | Example |
| --- | --- | --- |
| **Entropy** | Superposition and collapse | *Superpose* — a card becomes two cards at once, undecided until showdown |
| **Veil** | Who is allowed to know what | *Sealed Rank* — name a rank; every card of it is dealt face down |
| **Chronos** | Time that has already happened | *Rewind* — unmake the last community card and deal a different one |
| **Bind** | Two objects, one fate | *Entangle* — whatever happens to one card happens to the other |
| **Ruin** | Removing things from existence | *Unmake* — a rank is struck from every hand at the table |
| **Weave** | Editing the deck itself | *Inscribe* — write a permanent mark on one exact card, forever |

45 sigils, 23 relics, 23 omens, 9 card inscriptions.

---

## Architecture

```
shared/     Pure game model — imported by both sides, no I/O
  cards.ts    Card entities: superposition, per-viewer divergence, marks, memory
  hand.ts     Hand evaluation, including the three impossible categories
  sigils.ts   The 45 spells, as data
  relics.ts   The 23 passives, as data
  omens.ts    The 23 permanent table rules, as data
  types.ts    Table and per-player view shapes
  protocol.ts Socket contract and the transient effect stream

server/     Authoritative. The client is a renderer and an input device.
  game/table.ts     Seating, pot maths, and per-player projection
  game/engine.ts    Phase machine and every clock, on one scheduler
  game/magic.ts     The stack, and all 45 effects
  game/showdown.ts  Scoring, side pots, card memory
  game/bots.ts      Monte Carlo equity, pot odds, personalities, counterspells
  game/shop.ts      The Market
  net/               Socket wiring and the room registry

src/        Client
  audio/      ~50 sounds and 5 music beds, synthesised — zero audio files
  audio/mix.ts            The faders: what each sound's level should be,
                          and the trims that land it there
  vfx/        Canvas particles, screen shake, chromatic aberration
  components/card/        Pips, SVG court figures, quantum and veiled states
  components/onboarding/  First-run intro, practice table, contextual hints
  components/shell/       System menu, settings, prefs, connection recovery
  scenes/     Menu, Lobby, Table, Market
```

### Two decisions worth knowing about

**The server owns every card identity, and projects a different view per seat.** Half the mechanics are about information asymmetry, so redaction is not a feature bolted on top — it is the core of `viewFor()`. There is exactly one place private state could leak, and it is covered by an end-to-end test that plays a real hand over a real socket and asserts that no opponent's hole card identity ever reaches the wire.

**Animation is driven by an explicit effect stream, not by diffing snapshots.** The server says "this card collapsed", "this pot went to that seat", and the client animates it. "Why did that card flip?" is a question with one answer.

---

## Testing

```
test/hand.test.ts     Hand evaluation: standard hands, the impossible ones,
                      wilds, superposition, and every rule modifier
test/sigils.test.ts   All 45 sigils cast and resolved, plus teardown,
                      counterspelling, mana gating and ward protection
test/render.test.tsx  Mounts the real components in a real DOM: every card
                      state, the court art, the menu, and the whole app with
                      no canvas and no AudioContext
test/net.test.ts      Two real clients over a real socket: dealing, redaction,
                      showdown, and out-of-turn rejection
test/omens.test.ts    Every omen well formed, mods merging, one landing per
                      ante without repeating, deck edits applying once
test/sim.ts           Headless bot game asserting chip conservation, no
                      negative stacks, and that hands always advance
test/metrics.ts       Not a test — a balance report. Seconds per hand, where
                      that time goes, sigils cast per hand, mana left unspent,
                      showdown rate, action spread, impossible hands seen
test/audio.mjs        Renders all 50 sounds and 5 music beds offline and
                      measures them: peak, RMS, DC offset, duration, spectral
                      centroid, and whether each one still sits where
                      src/audio/mix.ts says it should
test/responsive.mjs   Plays the game at all seven shipped resolutions and
                      fails on anything that overflows, collides, or shrinks
                      below readable
```

`metrics.ts` is the one that shaped the game. Its first run read 25s per hand, two sigils cast per hand, the mana pool sitting at its cap all game, nine of thirty-six sigils ever appearing, zero counterspells across eleven response windows, and not a single impossible hand in any run — a spell game where barely anyone cast anything. A six-handed table now runs 17-23s a hand and the default practice table about 15s, with six to nine sigils cast a hand and half the set turning up in a single run. Be careful reading any one run of it: the spread between runs is wide enough that a single sample will tell you whatever you want to hear.

`audio.mjs` is the equivalent for sound, and it found the same class of problem. Nothing was broken — every sound rendered, nothing clipped — but no one had ever set the relative levels, so `card_deal`, the sound a player hears more than any other, sat more than 20 dB under `win_impossible` and disappeared under the music. Levels now live in `src/audio/mix.ts` as a deliberate ladder, `npm run audio:calibrate` computes the trims that hit it, and the harness fails if the shipped mix drifts.

Between them these found the bugs worth mentioning: a betting-round deadlock where a completed round left a player on the clock and the bot loop kept acting on them; a redaction failure that sent every opponent's hole cards to every client; three modules reading `import.meta.env` at module scope, which only exists under Vite; a table header built as a three-column grid with four children, which wrapped its whole nav over the felt the moment the first omen landed; and a fanned hole-card row whose rotated outer card sat on top of the first sigil tile at every resolution the game ships at.

---

## Shipping

[SHIPPING.md](SHIPPING.md) has the honest state of things: what is verified and
by which command, what only a Steam partner account can do, and the known gaps
worst-first.

## Status

Playable end to end: a first-run intro, one-click practice against bots, betting with side pots and all-ins, the full sigil stack with counterspells, showdown with the impossible categories, the Market, escalating omens, elimination and a winner. Bots fill empty seats and play a recognisable game of poker, including counterplay.

A run lands at roughly 25-30 hands, or eight to twelve minutes.

The biggest honest gap: nobody has played this against another human. Every
balance number in the repository comes from bots, and bots do not bluff, tilt,
or think about what you think they are holding.
