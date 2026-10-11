# HEXHOLD: fun and sellable review (2026-10-10)

> **Round 3 (end of this file) is the current state:** fun 7/10 on a locked
> rubric (7.1, was 6.5), the phylactery, demo length and spell-card calls
> made, and what would earn the 8.

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

---

# Round 3 (2026-10-10): earn the 8, or say the real number

Brief: `masonobegi_webpage/ops/session-2026-10-09/FUN3_BRIEF.md`. Mason's
rule: "it has to earn the 8, and if it can't, fine, but no lying or moving
the goalposts or adding shitty mechanics."

## The rubric, locked before any change

The review above gave one number, 7. Its criteria are its own sections: the
five ranked refund reasons, "what makes it special", and the two gaps the
verdict names (relics, art). They are scored here, each out of 10, from the
evidence the review already had, re-measured on e011a88 (`npm run
fun:batch -- 140 0`, adept bots, Hex I, aggressive player; it reproduced
every published number). The total is the mean, rounded half up; an 8
needs a mean of 7.5. No criterion is redefined after this point.

| # | Criterion (where it comes from) | Evidence before (e011a88) | Before |
|---|---|---|---|
| 1 | The run shows itself before it can end (reason 1) | over before the first Market 12% (cautious player 9%); before ante 3 23%; survived 3 antes 71% | 6 |
| 2 | The namesake shows up (reason 2) | an impossible hand in 39% of runs, 22% inside 3 antes; one of your own in 21% | 7 |
| 3 | The run arc builds (reason 3) | stack at ante 7 19 bb; casts a hand 6.3 at ante 1, 2.2 at ante 7; biggest pot in the last 3 hands in 56% of runs | 7 |
| 4 | Covens play differently and deliver their pitch (reason 4) | wins 2-7 of 20 per coven; the Unmoored dies earliest (ante 3.5); the Twinned, pitched as the impossible-hand coven, sees one in 35% of runs against the Ashen's 55%; the Loom ("writing on the deck") 25%, the fewest | 5 |
| 5 | Little dead time, and the game says what happened (reason 5) | 9.3 real choices a minute; 38% of a run is not the player's decision; the end screen names the hand that busted you | 7 |
| 6 | The special things show in the first 10 minutes | first cast 4 s; Scribe at the first Market (99 s); a deck-breaking omen at the first Market; an impossible hand in 22% of 3-ante demos | 8 |
| 7 | Builds have depth; relics are more than numbers (verdict) | 36 distinct relics owned across 140 runs, overlap between runs 0.09; most relics are a number on a passive | 6 |
| 8 | Presentation: art and feel (verdict) | clean CSS and SVG, synthesised sound, no illustrated assets | 6 |
| | **Mean** | | **6.5, rounds to 7** |

Which evidence is which: every number above is measured by the harness
(simulated players driven by the bots' own decision code at a human pace).
"Most relics are a number" and the art line are read from the code and from
the three simulated reviews. Comparables are the market file
(`market/poker-for-wizards-2.md`) and the sources named where they are used.

What can move in code: 1, 2, 4, 5 and 6. Criterion 3 is already where the
last pass put it. Criterion 7 is content work, and 8 needs an artist, so
those two hold at 6 whatever happens here. That caps the honest mean at
(10 + 10 + 7 + 10 + 10 + 10 + 6 + 6) / 8 = 8.6 in theory and makes 7.5 a
real climb: it needs about eight points across criteria 1, 2, 4, 5 and 6.

## What the best poker roguelites do in their first 15 minutes

From the market file and the sources named:
- **Balatro** makes its opening blinds "regular rounds that you can play to
  earn cash and get access to the shop"
  ([Dot Esports](https://dotesports.com/indies/news/balatro-antes-blinds-explained));
  the danger arrives with the Boss Blinds. Losing in minute one is close to
  impossible.
- **Slay the Spire** offers Neow's Lament (enemies in your first three fights
  have 1 HP) to a player whose last run died before the Act 1 boss
  ([TrueAchievements](https://www.trueachievements.com/game/Slay-The-Spire/walkthrough/5),
  [Steam discussion](https://steamcommunity.com/app/646570/discussions/0/3428949623347842943)),
  and the Lizard Tail relic, a second life.
- **Poker tournaments** have a rebuy period in their first levels. Balatro
  has Mr. Bones; Inscryption's first act gives two candles.
- **Poker Quest**'s negative reviews name randomness first (market file).

The pattern: the first floor teaches, the run cannot end before the player
has seen why it exists, and the danger ramps. HEXHOLD had the ramp (warm
bots at Hex I) but not the floor.

## Decisions made 2026-10-10

Each is one constant or one setting, so each can be reversed in one line.

1. **The phylactery: yes.** At a solo Hex I table, the player's first bust
   before ante 3 buys them back in with a full starting stack, once. Hex II
   takes it away and says so on the menu; the Daily Rite (Hex II) never has
   one. Why a player of the genre wants it: a poker player knows the rebuy
   period and a roguelite player knows Lizard Tail and Neow's Lament, a
   first loss that teaches instead of ending the run. Reason from data: 12%
   of aggressive runs and 9% of cautious ones were over in about ninety
   seconds, before any of the four things the game sells. The header shows
   "phylactery until ante 3" while it can be spent, the break has its own
   banner, and the end screen names the bust it caught.
   Switch: `PHYLACTERY_BEFORE_ANTE` in `shared/hexes.ts` (1 turns it off).
2. **Demo length: 3 antes.** On 282 demo runs (two seed sets), 3 antes:
   72% reach the wishlist screen and 31% see an impossible
   hand, in 5.0 minutes; a fourth ante adds 10 points of
   impossible hands and costs 16 points of runs that reach the
   wishlist screen. Either length is far under the 14-minute median demo
   session in Zukowski's Next Fest surveys
   ([howtomarketagame](https://howtomarketagame.com/2022/10/26/what-is-a-good-median-play-time-for-a-demo-benchmark/)),
   so a second run fits, and ending on "You survived 3 antes" with the
   full-game pitch beats ending on a bust. Switch: `DEMO_ANTES` in
   `shared/demo.ts`.
3. **Spell-overlay length: Auto, a new default.** Full for a sigil you have
   not yet seen resolve three times, Brief after; a written sigil is always
   read in full. Full covered the middle of the table for 26% of the
   player's own turns (Brief 8%); Auto covers 17% over a player's first
   seven runs and falls toward Brief after that. Why a player wants it: the
   playtest's first-run reader needed 2.6 s to learn what Graft does, and
   the simulated Deck player switched to Brief after an hour; nobody should
   have to find a setting to stop re-reading Nullify. Full, Brief and Off
   stay. Switches: `DEFAULT_PREFS.spellCards` and `AUTO_LEARNED_AFTER` in
   `src/components/shell/prefs.ts`.
4. **Covens lean to their school, from the first Market.** Half of all
   hands from ante 2, a coven's first sigil draw comes from its school; the
   Unaligned do not lean. Why a player wants it: a roguelite character is a
   pool for the whole run (Slay the Spire's four card pools), and the
   veteran's review said "covens feel like starting hands, not decks".
   Leaning from hand one raised early busts on three seed sets, so it starts
   at ante 2. Switches: `COVEN_LEAN`, `COVEN_LEAN_FROM_ANTE` in
   `shared/covens.ts`.
5. **Bots inscribe the marks a player would** (Wild, Prism or Blooded,
   previewed), except that a warm bot (Hex I, antes 1-2) writes no Wild.
   Why: a bot that writes Blooded every time reads as a bot that does not
   know its spell, and it kept the Loom from ever breaking the deck.
   Switches: `INSCRIBE_CHOICES`, `WARM_INSCRIBE` in `server/game/bots.ts`.
6. **The demo's default coven is the Ashen** (was the Unmoored). In three
   batches of 47 demo runs per coven the Unmoored reached the wishlist
   screen least often and lost its stack in the first ante most; the Ashen
   reached it most. Switch: the order of `DEMO_COVENS`.

Not decided here: the HEXHOLD name's trademark clearance (unverified, as
before), anything that spends money, and Steam networking.

## What changed, measured

Same 140 seeds (0-139), adept bots, Hex I, `npm run fun:batch`. "Before" is
e011a88 (the published review; `--no-phylactery` on the new code reproduces
it exactly). "After" is 606bcf5. Below about 5 points, a difference between
two batches is noise: a second seed set (140-279) moved some figures by up
to 8 points.

| Aggressive player | before | after |
|---|---|---|
| run over before the first Market | 12% | **1%** |
| run over before ante 3 | 23% | **6%** |
| survived 3 antes | 71% | 79% |
| busted before the first Market, caught or not | 12% | 14% |
| an impossible hand in the run | 39% | **58%** |
| ... by ante 3 | 22% | 31% |
| ... one of your own | 21% | **34%** |
| impossible hands per run | 0.96 | 1.42 |
| runs won (Hex I) | 30 of 140 | 47 of 140 |
| your stack at ante 7 | 19 bb | 24 bb |
| biggest pot in the last 3 hands | 56% | 49% |
| real choices a minute | 9.3 | 9.1 |
| a spell card covering your own turn | 26% (Full) | 17% (Auto, first 7 runs) |
| a run, minutes | 6.4 | 7.5 |

Cautious player (same seeds): run over before the first Market 9% to
0%, before ante 3 18% to 1%; impossible hand in the run about one in two
(the published figure) to 59%. Its busts before the first Market, caught
or not, rose from 9% to 12%: the deck breaks sooner for everyone.

**Covens now draw differently.** Share of your own casts from your coven's
school: before 21-32% for every coven (the Unaligned 27%, so no coven
leaned); after, 31-45% for the six that lean against 26% for the
Unaligned. The Twinned 21% to 37% Bind, the Ashen 25% to 39% Ruin. The
Unmoored still loses its stack in the first ante more than any other coven
(5 of 20 full-game runs, 37% of demo runs); the phylactery now catches it,
so the run ends there in 1 of 20 (was 6). The Loom, "writing on the deck", made its own
impossible hand in 10% of runs and now 50%. Not fixed: the Twinned is still
not the impossible-hand coven (25% of runs with one of its own, the Loom
50%), and with 20 runs a coven, wins per coven (3 to 11) are mostly noise.

**Also found and fixed.**
- *Deal again* reused the last run's deck: Graft, Mirror and Tessellate
  rewrite a card's face for the rest of a run, and an Unprinted card stays
  gone, so the next run started with duplicates and missing cards.
- Eight relics were another relic under a new name, some at twice the price
  (Bloodline, rare, 16 shards, was Gilt Edge, common, 8): the store page's
  "45 relics" were 37 effects. Each now does its own thing, mostly as a
  trade-off (Cheap Tricks: sigils 2 cheaper, ceiling 3 lower). A test holds
  every relic to a distinct effect.
- The Cold Read relic said it showed a card of every player and did The
  Informant's river peek; it now does what it says. The Quiet's coven card
  and the intro promised a card the Quiet's relic never showed; the words
  now match the relic.
- The server wrote any string a client sent as Inscribe's mark onto a
  shared card, which every client at the table then looked up. It is held
  to the picker's six marks.

## Re-scored with the same rubric

| # | Criterion | Before | After | Why |
|---|---|---|---|---|
| 1 | The run shows itself before it can end | 6 | 8 | Runs over before the first Market 12% to 1%, before ante 3 23% to 6%. Not 9: a player still loses the stack in the first ninety seconds in 14% of runs; the phylactery cushions it, it does not prevent it. |
| 2 | The namesake shows up | 7 | 8 | 39% to 58% of runs, and one of your own in 34% (was 21%). |
| 3 | The run arc builds | 7 | 7 | Deeper late (24 bb at ante 7), but the biggest pot lands in the last three hands less often (49%, was 56%) now runs are longer. |
| 4 | Covens play differently and deliver their pitch | 5 | 6 | They draw measurably differently and the Loom now breaks the deck, but a lean is not a deck, the Twinned still does not deliver "a hand the deck could not have held", and the Unmoored still loses its stack first. |
| 5 | Little dead time, and the game says what happened | 7 | 7 | Spell cards cover a third less of your turns and two lying texts are true now, but the dead time itself did not move (9.1 choices a minute). |
| 6 | The special things show in the first 10 minutes | 8 | 9 | 99% of runs reach the first Market and its Scribe and deck-breaking omen; an impossible hand in 31% of 3-ante demos (was 22%). |
| 7 | Builds have depth; relics are more than numbers | 6 | 6 | Eight fake relics became real ones, three as trade-offs; most relics are still a number. |
| 8 | Presentation: art and feel | 6 | 6 | Untouched: it needs an artist. |
| | **Mean** | **6.5 (7)** | **7.1 (7)** | |

## Was the 8 earned?

**No. HEXHOLD is a 7 (7.1 on the locked rubric), a better 7 than this
morning's.** The two things that made people bounce in the first two minutes
are answered in code: a run almost never ends before the game has shown
itself, and the hands it is named after now turn up in most runs, often in
the player's own hand. Scoring criteria 1, 4 and 5 one point higher each
would make it 7.5 and round to 8; I do not think the evidence supports that,
so it stays at 7.

What would earn the rest, in order:
1. **Art (criterion 8).** A commissioned capsule and an illustrated card
   back, table and coven art in the trailer's style: worth 2 points on this
   rubric, and it is what the market file says reviewers compare first.
2. **Relics that change rules, not numbers (criterion 7).** A content pass
   in the shape of Balatro's jokers: half the 45 should change what a hand
   is or how a street plays. Code, but a design job of its own.
3. **Covens as games (criterion 4).** Each coven needs one rule of its own
   for the whole run (the Twinned's copies counting as Wild, say), the way
   Balatro's decks change every hand. A design pivot, so it should follow a
   playtest.
4. **A real human playtest**, on the demo build, before Next Fest. Every
   number here is from simulated players, and two of the calls (the
   phylactery's tension, Auto's three readings) are about how something
   feels.

## Three simulated Steam reviews (after round 3)

**The impatient refunder** · 1.4 hrs · Recommended

> Lost my whole stack on the second hand to a Full House I never saw
> coming. Instead of a game-over screen I got "THE PHYLACTERY BREAKS. Back
> in with 20,000." Fine, I'll take it. Played tighter, got to the shop,
> typed "hex the chip leader" and it became a spell. Two hands after the
> first omen ("Five cards in the shared deck become permanently Wild") I hit
> a Flush House myself and the screen went nuts. Second run I busted at
> ante 4 and the end screen told me exactly how. The spell pop-ups were
> long at first and then got short on their own. Keeping it.

**The genre veteran** · 12 hrs · Recommended

> It is Hold'em with a real stack, and the covens now feel like they mean
> something past the first hand: as the Loom I kept drawing Weave and by
> ante 4 I had written three Wilds into the shared deck, one of which beat
> me. The phylactery is a training wheel; it is gone at Hex II, which is
> where the game starts. Complaints: the Twinned still does not do what its
> card says better than anyone else, relics are mostly +1s (at least there
> are no longer two Third Hands at different prices), and the presentation
> is clean CSS next to Balatro's CRT. $9.99, yes. $14.99, not yet.

**The Deck player** · 7 hrs · Recommended

> Plays well on the Deck. The default spell cards are long the first few
> times you meet a sigil and then flash, so I never went into Settings.
> Text is readable, the A, B, X, Y prompts match, Y asks before going all
> in. The phylactery note under the blinds is a nice touch so you know the
> first bust is not the last. Typing in the Scribe on a pad is still the
> clumsy bit. No Steam invites yet, so solo it is.

## Verdict, round 3

**Fun: 7/10** (was 7; 7.1 on the locked rubric, was 6.5). Earned the honest
way: no padding systems, every change a fix to the core loop with a
measurement before and after. Not an 8, for the reasons above.

**Sellable at $9.99: yes, as a solo poker roguelite**, on the same two
conditions as before: the store page must not sell online play until Steam
invites exist, and the capsule art must be commissioned. The store page's
"45 relics" is now true.
