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
npm test           # 69 tests: hand evaluation, every sigil, end-to-end sockets
npm run sim -- 120 6   # headless bot-vs-bot game, 120 seconds, 6 players
```

The only runtime requirement is Node 20+. There are no database, no API keys and no audio or image assets — every sound is synthesised in the browser at runtime and every card is drawn in CSS and inline SVG.

---

## How it plays

It is Hold'em. Two hole cards, five community cards, four betting rounds, best five-card hand wins. If you know poker you already know most of it.

The rest is **mana** and **sigils**.

- **Mana** accrues each street and is spent casting sigils. It is public information. An opponent sitting on five unspent mana is a threat you are meant to be able to read across the table.
- **Sigils** are spells. Casting one puts it on a **stack** and opens a short response window. Anyone holding a counterspell may answer, and their answer goes on top. The stack unwinds from the top down, so the *last* thing cast resolves *first* — a Nullify played after your spell resolves before it and eats it.
- **Relics** are permanent passives bought between antes. They change what kind of poker you are playing: flushes that need only four cards, aces that bridge both ends of the rank order, a hand that always scores one category higher.
- **Rites** inscribe a permanent mark onto a card in the **shared** deck. The upgrade you paid for can turn up in an opponent's hand three hands later. That tension is deliberate.

Above a Straight Flush sit three categories a fifty-two card deck cannot produce — **Five of a Kind**, **Flush House** and **Flush Five**. Wild marks, mirrored cards and superposition make them reachable.

Blinds climb every few hands. Between antes the **Market** opens and you spend **shards** earned from won pots.

### The six schools

| School | Concerned with | Example |
| --- | --- | --- |
| **Entropy** | Superposition and collapse | *Superpose* — a card becomes two cards at once, undecided until showdown |
| **Veil** | Who is allowed to know what | *Sealed Rank* — name a rank; every card of it is dealt face down |
| **Chronos** | Time that has already happened | *Rewind* — unmake the last community card and deal a different one |
| **Bind** | Two objects, one fate | *Entangle* — whatever happens to one card happens to the other |
| **Ruin** | Removing things from existence | *Unmake* — a rank is struck from every hand at the table |
| **Weave** | Editing the deck itself | *Inscribe* — write a permanent mark on one exact card, forever |

37 sigils, 24 relics, 9 card inscriptions.

---

## Architecture

```
shared/     Pure game model — imported by both sides, no I/O
  cards.ts    Card entities: superposition, per-viewer divergence, marks, memory
  hand.ts     Hand evaluation, including the three impossible categories
  sigils.ts   The 37 spells, as data
  relics.ts   The 24 passives, as data
  types.ts    Table and per-player view shapes
  protocol.ts Socket contract and the transient effect stream

server/     Authoritative. The client is a renderer and an input device.
  game/table.ts     Seating, pot maths, and per-player projection
  game/engine.ts    Phase machine and every clock, on one scheduler
  game/magic.ts     The stack, and all 37 effects
  game/showdown.ts  Scoring, side pots, card memory
  game/bots.ts      Monte Carlo equity, pot odds, personalities, counterspells
  game/shop.ts      The Market
  net/               Socket wiring and the room registry

src/        Client
  audio/      ~50 sounds and 5 music beds, synthesised — zero audio files
  vfx/        Canvas particles, screen shake, chromatic aberration
  components/card/  Card rendering: pips, SVG court figures, quantum states
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
test/sigils.test.ts   All 37 sigils cast and resolved, plus teardown,
                      counterspelling, mana gating and ward protection
test/net.test.ts      Two real clients over a real socket: dealing, redaction,
                      showdown, and out-of-turn rejection
test/sim.ts           Headless bot game asserting chip conservation, no
                      negative stacks, and that hands always advance
```

The simulation harness is the one that earns its keep — it found a betting-round deadlock where a completed round left a player on the clock, letting the bot loop act on them forever.

---

## Status

Playable end to end: lobby, betting with side pots and all-ins, the full sigil stack with counterspells, showdown with the impossible categories, the Market, ante escalation, elimination and a winner. Bots fill empty seats and play a recognisable game of poker.

Rough edges worth knowing: the layout is built for desktop and is tight below about 760px; there is no persistence, so a server restart ends every table; and reconnection holds your seat only while the process lives.
