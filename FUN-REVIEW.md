# HEXHOLD: fun and sellable review (2026-10-10)

Branch `steam-ready-2026-10-09`. Brief: `masonobegi_webpage/ops/session-2026-10-09/FUN_BRIEF.md`.
Grounded in the market research (`market/poker-for-wizards-2.md`), the three
simulated playtests (`playtest/hexhold.md`), the store copy, and measured
play: `npm run fun:batch` plays whole solo runs from the player's chair (a
real human seat at a solo table, driven by the bots' own decision code at a
human pace, on a simulated clock), and `test/demo.mjs` plays the Next Fest
demo in a headless browser.

**Core loop:** play Hold'em hands against three bots while casting spells
onto a counterspell stack, shop a Market between antes, and survive one new
permanent omen per ante until you hold every chip or bust.

**Hook:** Texas Hold'em with a spell stack and a deck that breaks: cards in
two states, a river you can rewind, a spell you write in plain English, and
hands no real deck can make (Five of a Kind, Flush House, Flush Five).

## How it was measured

140 runs per configuration, seeds 0-139 (each coven 20 times), adept bots,
Hex I. Since 2026-10-10 a seed replays exactly (the bots' look-ahead budget
runs on the simulated clock), so before and after are the same 140 deals,
not two random samples; the remaining spread comes from the runs diverging
after the first decision that differs. Below 140 runs, differences under
about 5 points are noise.

The player in the chair is the bots' adept decision code at full heat,
which is aggressive: it raises strong hands and calls off big bets. That is
the hard case. `--player cautious` plays the same code at the bots' opening
warmth for two antes, a newcomer still learning the table.

## The five biggest reasons a buyer would refund or stop, ranked

Measured before this pass (`base`), with what changed (`after`).

### 1. The run can end before the game has shown itself

| | before | after |
|---|---|---|
| run over before the first Market (about 90 s in) | 15% | 12% |
| run over before ante 3 | 29% | 23% |
| survived three antes (the whole demo) | 64% | 71% |
| mean pot at ante 1 | 128 bb | 100 bb |
| all-ins a hand at ante 1 | 0.85 | 0.55 |

A solo run ends on the player's first bust. One run in seven ended in the
first three hands, before a Market, an omen, a relic or an impossible hand:
before any of the reasons the game exists. In every one of those busts the
player had bet or raised in the hand, and half lost to a Full House or
Four of a Kind, mostly spell-made. The opening ante was the most violent
stretch of the run (128 bb pots on 100 bb stacks). Comparables: Balatro's
first blind is close to unlosable; Poker Quest's negative reviews name
randomness first.

Fixed in code (`bots.ts` `warmth`): at Hex I the bots open warm (bet,
raise, bluff and cast at 0.55x at ante 1, 0.8x at ante 2, smaller sizes),
full heat from ante 3 and at every hex above I. A cautious newcomer
(`--player cautious`): 9% over before the first Market, 18% before
ante 3. Not fixed: an aggressive player can still stack off in hand one,
which is poker. The real fix is a design call (proposal 1).

### 2. The game's namesake was rare and late

| | before | after |
|---|---|---|
| an impossible hand in the run | 29% | 39% |
| by ante 3 (inside the demo) | 10% | 22% |
| per run | 0.56 | 0.96 |
| first one (median ante) | 4.0 | 3.0 |

The store page sells "hands a real deck can't make". 71% of runs never
showed one, and the promised omen arrived at ante 3, so a three-ante demo
showed one in one run of ten. Measured per hand at antes 2-3, a deck with
wilds in it (The Gilded) showed one in 7-9% of hands; prisms (The Court of
Prisms) 2.4%, mirrored cards (The Twinned) 2-3%.

Fixed in code (`omens.ts`): the promise is the first omen (ante 2), drawn
from The Gilded (now five wilds, was three) and The Twinned (seven
mirrored, was four), both now open at ante 2; prism omens still open the
impossible hands but no longer count as the promise. A test holds every
deck-editing omen's banner to the number of cards it edits.

### 3. The run arc was upside down

| | before | after |
|---|---|---|
| your stack at ante 7 | 11 bb | 19 bb |
| casts a hand at ante 1 / ante 7 | 6.7 / 1.7 | 6.3 / 2.2 |
| biggest pot in the last three hands | 61% of runs | 56% |

Stakes and magic peaked at ante 1 and decayed to push-or-fold by ante 7,
exactly where the omens have stacked up and the build is finished. Fixed
in code: blinds climb 1.4x an ante, not 1.6x (`engine.ts`
`BLIND_GROWTH`; Doubling Down, the Quickening and Hex V still add steps),
and the warm opening moves magic from ante 1 to later.

### 4. Covens do not play differently in outcome

Before: the Unaligned (no relic, one counterspell) won 10 of 20 runs and
reached ante 5.8; the Unmoored and the Twinned, the two most magical
openings, reached ante 3.4 and 3.6 and saw impossible hands in 15% of runs
each, the fewest. The coven pitched as the impossible-hand coven
("a hand the deck could not have held") is the worst at it. After: wins now spread 2 to 7 of 20 per coven (was 2 to 10); the Twinned reaches ante 4.3 and sees an impossible hand in 35% of its runs (was 3.6 and 15%), the Unmoored 3.5 and 40% (was 3.4 and 15%). The Unmoored still dies earliest, and as the promise's first omen The Twinned shows an impossible hand in 3.1% of hands against 7.4% for The Gilded.
Not fixed in code: it is a design call about what each coven's opening
spells do (proposal 3).

### 5. A lot of the run is watching or reading

38% of a run is not the player's decision (bots betting 13%, showdown and
payout holds 16%, deals and banners 6%, spells 3%), and ante 1 averaged
6.7 casts a hand, each a 2.6 s card in the middle of the table. Fixed:
Settings > Gameplay > Spell cards (Full 2.6 s by default, Brief 0.8 s, Off:
only spells you can answer), playtest item P6. The opening ante now has
fewer bot casts (6.3 a hand). Real choices: 9.4 a minute, unchanged.

### Found while looking: refund triggers on a Steam Deck

- **The menu could not be scrolled at 1280x800.** The plate ran 400-550 px
  past the bottom of a screen with `overflow: hidden`: Daily Rite, hosting,
  Settings and Quit (and the demo's Wishlist) could not be reached by mouse
  or touch. Every layout check passed because nothing was clipped, only
  off-screen. Fixed; `npm run responsive` now fails on a control nothing
  scrolls to.
- **The table froze for half a second or more.** With five wilds in the
  deck the bots' Monte Carlo reads got expensive. The hand evaluator now
  decides a wild's or prism's suit by the flush test instead of trying all
  four (7x faster on exotic hands, and it finds the true best hand in a
  quarter of them where the old trimming lost it), and a rollout reads a
  hand to 300 readings. With the shipped preview budget: over half a second 7 times in 28 runs (27 before, 96 with five wilds and the old reads), worst tick per run 184 ms at the median (372 before), worst of all 1.1 s (2.5 s before).

## What makes it special, and whether the first 10 minutes show it

- **A spell stack on a poker table.** Nothing on the shelf has it. Shown in
  the first 4 seconds (the median first cast) and every hand after.
- **The Scribe.** Typing "hex the chip leader" into the Market's blank page
  and getting a priced, explained spell with no AI. Shown at the first
  Market, about 90 s in. The best moment in the game.
- **Omens that stack.** The first one is now always a deck-breaking one at
  the first Market ("Five cards in the shared deck become permanently Wild.
  Nobody is told which."), so the rulebook visibly goes wrong in minute two.
- **Impossible hands.** Now inside the demo in about 22% of runs
  (was 10%), with the shake, slow-mo and confetti treatment.

The first ten minutes now show all four, if the run survives the first
three hands, which it does 88% of the time for an aggressive player
and 91% for a cautious one.

## Proposals for Mason (not built: they change what the game is)

1. **A phylactery.** Once per run, before ante 3 and at Hex I only, a bust
   returns you to the table with a starting stack (or half of one). The
   measured early-bust rate for an aggressive player is still 12%
   before the first Market; this takes it to zero for the run's first
   minutes without touching the bots. Cost: a second life changes the
   tension of the opening; Hex II could remove it as part of the climb.
2. **A per-ante goal** (win N pots, or survive with M chips) instead of
   last-player-standing, so a run has milestones and an ante can be "won".
   A bigger change; it is how Balatro's blinds work.
3. **Covens that deliver their pitch.** The Twinned should reliably build
   toward an impossible hand (for example, Mirror and Graft that also leave
   a permanent mark), and the magical openings should not lose to the
   plain one.
4. **Demo length: 3 antes or 4.** At 3, 71% of aggressive runs see the
   end screen and 22% see an impossible hand; a fourth ante adds about
   two minutes and lifts that to about 30%.
5. **Make the first Market show a deck-breaking item** (a Wild Rite or a
   rite that writes Wild), so the player can cause the first impossible
   hand rather than watch it.

## Three simulated Steam reviews (after this pass)

**The impatient refunder** · 0.9 hrs · Recommended, barely

> First run lasted about ninety seconds. I raised pocket Jacks, Quill cast
> something called Graft and showed a Full House, and that was it. Credit
> where due: the end screen told me exactly what happened ("Knocked out on
> hand 2, ante 1, by Quill's Full House against your Pair of Jacks") and
> Deal again had me back in one click, not three minutes of watching bots.
> Second run the table was oddly gentle for a couple of rounds, then at the
> first Market an omen landed: "Five cards in the shared deck become
> permanently Wild. Nobody is told which." Two hands later Mordent turned
> over a Flush House and the whole screen shook. OK, I get it now. Typed
> "hex the chip leader" into the blank page in the shop and it became an
> actual spell. Escape pauses and the shop waits for me. If my first run
> had been my only run I'd have refunded.

**The genre veteran** (400 hours of Balatro, plays MTG) · 11 hrs · Recommended

> Not a deckbuilder and it doesn't pretend to be: it is Hold'em with a real
> stack. Nullify, Reflect, Nullify resolves last in, first out, and the
> response window gives you time to read the card. Omens stack the way
> they should; by ante 6 I was under Blurred, The Gilded, The Unmade
> (Sevens struck) and The Inversion, playing for the worst hand with five
> wild cards loose in a deck nobody could see. The blinds no longer crush
> you into push-or-fold by ante 7; I had about twenty big blinds and was
> still casting. Complaints: covens feel like starting hands, not decks.
> The Twinned is pitched as "a hand the deck could not have held" and I saw
> more impossible hands as the Ashen. The first omen is always The Gilded
> or The Twinned, which I clocked by run four. Relics are mostly numbers.
> The Scribe is the best idea in the genre this year. Fair at $9.99;
> I would not pay $14.99 for it yet.

**The Deck player** · 6 hrs · Recommended

> Plays well on the Deck. Nothing on the table is too small to read, UI
> scale goes to 117% and nothing clips, and the A, B, X, Y prompts match the
> Deck's buttons.
> Y asks twice before going all in and LB won't fold a free check, so no
> accidental shoves. The menu scrolls with the touchscreen. I set Spell
> cards to Brief after an hour: on Full every bot spell sits in the middle
> of the table for a few seconds and the first ante has six or seven of
> them a hand. Battery is fine, it is all flat art. Typing a spell into the
> Scribe on a pad is the one clumsy bit. No online with friends through
> Steam, LAN only, so I play it solo, which is how it is best anyway.

## Verdict

**Fun now: 7/10 (was 6/10).** The hook now lands in the first two minutes
for most runs: the first Market sits under a deck that has gone wild, an
impossible hand shows up in about two runs in five (a cautious newcomer:
one in two), the late antes are deep enough to keep casting, and the
Scribe is the best moment in the genre this year. The before score is the
three playtests' 3 to 3.5 out of 5. It is not an 8 because an aggressive
player still loses about one run in eight inside ninety seconds, the
covens are starting hands rather than different games (the Twinned does
not deliver its pitch), relics are mostly numbers, and the art is clean
CSS rather than a showpiece. Proposals 1 and 3 are what would move it.

**Sellable at $9.99: yes, as a solo poker roguelite.** The demo is ready
for Next Fest and ends on a wishlist screen that works at Deck size; the
refund triggers the playtests named (no pause, a bust that made you watch,
one-press shoves, a Market clock, 10px text, no flashing setting, an
unscrollable Deck menu, a frozen table) are fixed and measured. Two
conditions that are not code: the store page must not sell online play
until Steam invites exist (it is LAN or a self-hosted server today), and
the capsule art must be commissioned. At $14.99, no: that needs Balatro's
content depth and art.
