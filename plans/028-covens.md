# 028 — Covens

- **Status**: DONE
- **Severity**: HIGH (replayability — the thing reviews would have gone for)
- **Category**: gameplay / content
- **Scope**: `shared/covens.ts` (new), types, engine, io, net store, Menu, Seat, marks

## Problem

Every run of this game started in exactly the same place: one counterspell,
one random sigil, no relic, the same chips, the same everything.

That is fine for a poker night and it is the wrong shape for a roguelike,
where the first decision of a run is supposed to *be* a decision. Balatro
ships fifteen decks. Slay the Spire ships four characters. HEXHOLD shipped one
of everything, and "runs start to feel the same" is the single most predictable
thing a review would have said.

## What a coven is

Two or three sigils you always open with, and one relic you always own.

```ts
{
  id: 'ashen', name: 'The Ashen', school: 'ruin',
  text: 'Burn and Blight, and folding pays.',
  style: 'If you cannot win the hand, make sure nobody enjoys it.',
  sigils: ['nullify', 'burn', 'blight'],
  relic: 'grave_interest',
}
```

Seven of them: The Unaligned (the game as it was — no relic, no plan), The
Unmoored (entropy), The Quiet (veil), The Long Now (chronos), The Twinned
(bind), The Ashen (ruin), The Loom (weave).

**The passive half is expressed as a relic the engine already reads.** That
constraint is the important part of the design: a coven cannot smuggle in
behaviour. If one needs to do something new, the relic has to learn it first,
in `shared/relics.ts`, where every other passive in the game is declared. The
whole feature added exactly zero new engine hooks.

## Where it shows up

- **The menu**, as a row of seven cards directly above the button that starts a
  run — not behind a dropdown, because a choice a player has to go looking for
  is a choice most of them never make. The pick is remembered in
  `localStorage`.
- **The bots**, who each draw one at random and never The Unaligned. A table of
  four identical openings is the thing covens exist to stop, and it would be an
  odd game that only let the human have one.
- **The seats**, as a badge beside the relic row — the same kind of
  information, public and permanent for the run, and worth knowing before you
  decide what somebody is representing.

## Verified

A real browser run, picking The Ashen:

```
mySigils:  [nullify, burn, blight, probability_storm]   (the fourth is the per-hand draw)
myRelics:  [grave_interest]
coven:     ashen
botCovens: [long_now, quiet, loom]
```

Four different openings at one table.

`npm test` (131), `npm run sim`, both builds, `npm run responsive` 7/7,
`npm run play:pad` 9/9, `npm run play` clean. The marks guard was extended to
cover the seven coven marks and caught them undrawn first time, as usual.

## What this does not do yet

They are all unlocked from the start. Meta-progression — earning covens across
runs — is the obvious next layer and is deliberately not here: it needs the
profile to be a save file people trust before it is worth gating content
behind.
