# 026 — The second printing

- **Status**: DONE
- **Severity**: MEDIUM (replayability, and the game's own premise)
- **Category**: content
- **Scope**: `shared/sigils.ts`, `shared/relics.ts`, `shared/omens.ts`, `server/game/magic.ts`, `src/art/marks.tsx`

## Problem

Two separate things, one of which was worse than it looked.

**Content volume.** 45 sigils, 23 relics, 23 omens. Enough that no two runs
are identical; short of what a roguelike people play for thirty hours carries.
Reviewers count content.

**The game's own name did not happen.** HEXHOLD's premise is hands a physical
deck cannot produce — Five of a Kind, Flush House, Flush Five. A measured
session produced **zero**. Not rare: absent. Every route to one ran through a
single uncommon mark, and if that mark did not turn up, the headline mechanic
was decorative.

## What was added

**Eleven sigils** (45 → 56). Four exist specifically to open more doors into
the impossible:

| Sigil | School | What it does | Why |
| --- | --- | --- | --- |
| Resonance | bind | Both hole cards take the suit of the first community card | Flush Five is reachable |
| Graft | bind | One hole card becomes an exact copy of the other | A pair made of one card |
| Gild | weave | A community card counts as every suit | Flush House |
| Loom | weave | Name a rank; the next community card is woven to order | The board can be built |

The other seven fill mechanical gaps rather than power level: Quantum Leap
(trade a card with the deck unseen), Observer Effect (the mirror of Decohere —
everything undecided settles *well*), Cold Read, Palimpsest (a board slot
written over twice), Second Wind, Ashes (unburn the last destroyed card),
Blight (a sigil rots out of a hand before it is cast).

**Eight relics** (23 → 31), including two more impossible routes — Gilded
Thumb (a Prism hole card every hand) and Wild Inheritance (a Wild one). Every
relic is a plain data record using knobs the engine already reads; none of them
added behaviour.

**Eight omens** (23 → 31): The Long Road, The Twinned (four Mirrored cards in
the shared deck), The Leaden Hour, The Curse, The Kindling, The Binding, The
Deepening, The Wider Table.

**Twenty-seven marks**, so the set stayed drawn rather than typed. The marks
guard caught all eleven undrawn sigils on the first `npm test` after the
definitions landed, which is exactly the job it was written for.

## Result

`impossible wins` went from 0 to 1 across 23 measured hands, and
`distinct sigils seen` from 25 of 45 to 44 of 56 — so the pool is both larger
and better circulated.

## A correction worth recording

An earlier read of the metrics said "24 of 45 sigils are never cast", and
treated it as a design defect. It was mostly **sample size**: the default
metrics run is 90 seconds, which is about five hands, and four players holding
two starting sigils plus one draw a hand cannot physically show more than about
two dozen distinct cards. A 400-second run showed 25 of 45 — near the ceiling
of what was reachable. The lesson is the ordinary one: check what the sample
could possibly have shown before calling a number a defect.

## Verification

`npm test` (131 — eleven new "resolves without throwing" cases arrived with
the definitions), `npm run sim` for chip conservation across long games with
the new effects in play, `npm run metrics`, both builds.
