# 025 — Teach the bots to bet

- **Status**: DONE
- **Severity**: HIGH (the single worst thing about playing the game)
- **Category**: gameplay
- **Scope**: `server/game/bots.ts`, one line of `server/game/engine.ts`

## Problem

A measured session, before any of this:

```
call       14  30%
check      14  30%
fold        8  17%
bet         6  13%
allin       3   6%
raise       2   4%
```

Four percent raises. That is not poker — it is a turnstile with a betting
interface. A table where nobody raises is a table where nobody can bluff,
which means the poker underneath the magic has no poker in it.

Two causes, both structural rather than tuning:

**1. No continuation betting.** The single most common aggressive action in
real poker is betting the flop because you raised before it, whatever came.
`decideAction` had no memory of the previous street, so a bot could only bet a
hand it had already made — `eq > 0.62` — and everything in the wide middle
checked.

**2. Pot odds were applied before the flop.** `edge = eq - potOdds`, where
`eq` is measured against the whole field to showdown and so sits near
`1 / players` for anything playable. Calling one big blind into 1.5 needs 40%
by that arithmetic, and a four-handed hand almost never has it, so almost
everything folded preflop. The blinds were doing all the betting.

## What was done

**Street memory.** `t.lastAggressorId` resets each street, so it is recorded on
every bot turn and kept per street. "Was I the aggressor on the previous
street" is then answerable, and a bot that raised preflop fires the flop with
probability `0.42 + aggro × 0.26`, scaled down by how many opponents are still
in — because every bluff is worth less against more people.

The approximation is documented where it lives: a human who raises *after* the
last bot has acted on a street is missed, and the bot fires once into a raiser.
Rare, survivable, and much cheaper than threading per-street history through
the table state for one consumer.

**A preflop range instead of pot odds.** Equity is compared against `par =
1 / field`: `par × 1.42` opens, `par × 1.75` three-bets, `par × 1.06` calls.
That is what an opening range actually is, and it is position-aware — a bot
with one player left to act steals with nothing at `0.06 + bluff`.

**Postflop, in order:** continuation bet → value at `eq > 0.55` → semi-bluff at
`eq > 0.38` (a draw is worth betting; it wins now or it wins later) → a late
steal. Facing a bet: raise at `edge > 0.14`, bluff-raise under `eq < 0.3`
when the price is right, call at `edge > -0.09`, fold.

**Stack discipline, added after the first attempt made it worse.** The initial
version produced 59% aggression and killed three of four players in two hands.
Putting a whole stack in is the one decision a bot cannot take back, so it now
needs `eq > 0.62` rather than `0.5`, a raise may not commit more than 55% of a
stack, and the short-stack shove wants `eq > 0.5`.

**Mana.** Bots were ending hands with four unspent of a ceiling of eight, so
they lean harder on a full pool — and the hand-start grant in `engine.ts` went
from +3 to +2, because an economy nobody can exhaust is an economy that never
asks a question.

## Result

```
call       42  28%        reached showdown   57%  ✓
fold       30  20%        hands with magic   91%  ✓
bet        23  15%        distinct sigils    44 of 56
raise      22  15%        impossible wins    1   (was 0)
check      20  13%
allin      14   9%
```

23 hands, 4 players. Aggression went from 17% to 39% without the showdown rate
collapsing, which was the failure mode of the first two attempts.

## Verification

`npm test` (131), `npm run sim` — chip conservation and no deadlocks across
long bot games, which is the check that matters when the betting logic
changes — `npm run metrics`, `npm run play`.

## What is still not proven

Every one of these numbers came from bots playing bots. Bots do not tilt, do
not slow-roll, and do not think about what you think they have. The ranges here
are a reasonable imitation of poker, not a solver, and the first real human
session should be expected to find something.
