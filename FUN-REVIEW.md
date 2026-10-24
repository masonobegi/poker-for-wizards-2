# HEXHOLD: fun and sellable review (2026-10-10)

> **Round 9 (end of this file) is the current state:** fun 8/10 on the
> locked rubric, 7.5, the narrowest 8 it allows: seven new relics on the
> later shelf (23 to 30) took criterion 7 from 7 to 8, and the first run is
> round 8's to the digit (branch `relics-r9-2026-10-23`). Round 8 (7.4)
> grew the later shelf to 23; round 7 (7.4) opened the covens after the
> first run, which stays the plain table the playtest asked for. Round 6
> (7.1) measured the UI pass and its content cut; round 5 (7.6, an 8) is the
> last round with covens from the first run. Rounds 3 and 4 are above them.

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

---

# Round 4 (2026-10-10): relics that change rules, a creed per coven

Brief: `masonobegi_webpage/ops/session-2026-10-09/FUN3_BRIEF.md`, the same
honesty rule. The job: the two gaps round 3 named that code can reach,
criterion 7 ("relics are more than numbers", 6) and criterion 4 ("covens
play differently and deliver their pitch", 6). Everything else is held to
the same rubric so a gain here cannot hide a loss there.

## The rubric, unchanged

The eight criteria above, word for word, scored out of 10; the total is the
mean rounded half up, and an 8 needs 7.5. Nothing is redefined. The "before"
column is round 3's "after" column (7.1). Before touching the game, the
harness gained four measurements (commit 3a3d6be, measurement only): what
the Market offered and what was bought, how often each owned relic's rule
changed something, the hands made and won by coven, and how far apart two
covens' runs sit. Run on that commit, seeds 0-139 reproduce every round 3
figure exactly (47 runs won, 1% / 6% / 79%, 58% / 34%, 1.42 a run, 9.1
choices a minute, 49%).

Which evidence is which: every number is measured by the harness
(simulated players driven by the bots' decision code at a human pace). The
genre lessons are from the sources linked. "Why a player wants it" is a
judgement, written before each thing was built.

## What makes a relic memorable in this genre

- **One idea, an effect and at most one condition.** Balatro's developer
  wrote down his joker rules: a joker has a theme, an effect and an optional
  condition, and a powerful effect should be conditional
  ([LocalThunk, r/balatro, May 2024](https://lr.sudovanilla.org/r/balatro/comments/1czo9g0/guidelines_for_joker_design)).
- **The ones players talk about change what a hand is.** Four Fingers and
  Shortcut together made a Steam player ask whether "2467 is a straight" was
  a bug ([Steam discussion](https://steamcommunity.com/app/2379780/discussions/0/4348864563386474737)).
  The cards are deliberately plain so the jokers carry the complexity and
  become the run's build ([Game Wisdom](https://game-wisdom.com/analysis/balatro)).
- **A power with a rule attached.** Slay the Spire's boss relics trade a
  resource for a rule you must play around (Runic Dome, Velvet Choker);
  Necronomicon doubles a card; Runic Pyramid keeps what you would discard.
  MTG's stack vocabulary, which HEXHOLD already speaks, has hexproof,
  "can't be countered", Phyrexian mana and stealing a spell you answered.
- The market file: reviewers praise Balatro's "broken synergies" and its
  rule-breaking hands are the pitch; Poker Quest is punished for grind.

The lens for this pass: one idea per relic; an effect and at most one cost
or condition; and it has to change a decision inside a hand (what to chase,
when to fold, what to cast first, whom to target), not only a total.

## The relic pass: twelve numbers out, twelve rules in

Of 45 relics, 19 were a number on a passive. Twelve of the flattest are
replaced, common for common, rare for rare, mythic for mythic, so the shelf
stays 45 (the store page's count) and the Market's rarity mix is unchanged.
`RULE_RELICS = false` in `shared/relics.ts` puts the twelve numbers back.

| Out (number) | In (rule) | What it does | Why a player of the genre wants it |
|---|---|---|---|
| Split Focus (+1 draw) | **Stepping Stones**, common | Your straights may skip one rank | Balatro's Shortcut, the hand-definition joker veterans build around; it changes which draws are worth a call |
| Open Palm (+2 mana a hand, never paid) | **The Keepsake**, common | Fold before the flop and your higher hole card is dealt back next hand | Runic Pyramid: folding stops being only a loss and becomes a plan |
| Thrift (-1 cost) | **The Second River**, common | Once a hand, a river that leaves you High Card is dealt again, in front of everyone | A reroll on a miss, paid for with a tell |
| Deep Well (+3 max mana) | **The Sanctum**, common | No opponent's sigil can target you or your cards; none of yours can target an opponent | Hexproof, with a boss relic's price |
| Full Purse (+3 mana, never paid) | **The Prism Lens**, common | Every Prism is fully Wild for you | A synergy piece: Prism comes from rites, omens, Gild, Gilded Thumb and the Engraver |
| The Gambler (shards on two pair) | **The Magpie**, rare | Counter a sigil and it comes to your hand | Commandeer: stealing the spell you answered is the stack's best feeling |
| High Roller (+2 bb a win) | **The Engraver**, rare | A showdown win engraves a card of the winning hand Prism, for good, in the shared deck | Midas Mask and Hiker: a relic that rewrites the deck as you play |
| The Low Road (shards a fold) | **The Blood Price**, rare | Short of mana on your turn, pay the rest in chips, a big blind a mana | Phyrexian mana: chips are your life, now also your mana |
| The Usurer (15% interest) | **Vow of Silence**, rare | Your sigils cannot be countered; you can never cast a response | "Can't be countered", with the price that you never answer either |
| The Hoard (+4 mana, +1 regen, +1 hand) | **The Lodestone**, mythic | Each hand a rank is drawn for you; every card of it is Wild for you | Ancient Joker and The Idol: a target that moves every hand |
| The Understudy (+1 draw, +1 hand) | **Twice-Told**, mythic | The first sigil you cast each hand resolves twice | Necronomicon: the order you cast in becomes the decision |
| Kingmaker (shards on a knockout) | **The Usurper**, mythic | Knock a player out and their relics are yours | The same fantasy, paid in what players covet: the other build |

Every rule says what it did in the log, under its own name, so the game
says why a hand went the way it did.

## The creeds: one rule per coven, for the whole run

A creed is a relic the coven owns from the first hand, never sold and never
taken (`CREEDS` in `shared/relics.ts`; `COVEN_CREEDS = false` in
`shared/covens.ts` turns all seven off). The menu, the seat tooltip and the
Codex name it.

| Coven (pitch) | Creed | Rule | Why a player of the genre wants it |
|---|---|---|---|
| The Unaligned ("a counterspell and whatever the deck gives you") | **The Last Word** | Begin a hand without a counterspell and a Nullify comes to you, even into a full hand | A control player's promise: you are never without an answer |
| The Unmoored ("you will know your own hand last") | **Many Futures** | A card that goes undecided in your hand holds three faces, not two | A coven's own mechanic should scale, the way a Balatro deck amplifies one strategy |
| The Quiet ("trying to know theirs") | **Tells** | Each opponent's first bet or raise in a hand shows you one of their hole cards | Poker's oldest read, made literal |
| The Long Now ("you have read the river") | **Foreknown** | When the flop is dealt you see the river | The pitch, as a rule: the river is already written |
| The Twinned ("then a hand the deck could not have held") | **Kin** | When two community cards share a face (a Mirror, a mirrored card), the copy is Wild for you | Copies become a road to the impossible hands, and the table can see it coming |
| The Ashen ("make sure nobody enjoys it") | **Salt** | A card you burn takes its rank from every hand for the rest of the hand | Spite with a use: burn the card that made their hand |
| The Loom ("you are writing on the deck") | **Signature** | A Wild, Prism, Blooded or Echo you write works only for you | The Market's shared-deck risk, removed for the coven that writes |

Two creeds needed more than one try, each measured on 70 runs of that coven
(seeds 0-69, same seeds each way; `plans/fun-round4-data/`):

- **The Unaligned.** The first creed was *Providence* (draws ignore rarity,
  "whatever the deck feels like giving you"). It cost them: an impossible
  hand of their own in 17% of runs against 31% without it, and a first-ante
  bust in 23% against 14% (a flat draw is mostly rares and mythics, and few
  of the cheap commons a hand is built from). Cut. *The Last Word* in its
  first form took a draw's place in a full hand; it now comes on top. No
  creed: 13 runs won, 31% own impossible, 14% first-ante bust. The Last
  Word: 17, 30%, 14%. It is a small rule and it never costs them anything.
- **The Twinned.** Kin with *any* copy Wild won 43 of 70 runs (no creed: 20)
  and an impossible hand of their own in 59%: a Wild in most hands is the
  best card in poker, and one coven winning three runs in five is a broken
  coven. A copy *you hold* Wild: 38 won, 43%, strength without the pitch.
  A copy *on the board* Wild (shipped, `KIN_BOARD_ONLY`): 22 won, 41%, and
  impossible hands a run up from 1.43 to 1.66. It changes about one
  showdown a run. Most of what now delivers the Twinned's pitch is the
  Heirloom fix below, not Kin.

## Found and fixed while measuring

- **Heirloom and The Long Game did nothing.** Their memory bonus never
  reached the hand evaluator (`modsFor` dropped it), so the Twinned's own
  relic, sold as "every card scores higher for each pot it has already
  won", changed no hand in 49 runs that owned it. It now changes about four
  showdowns a run. A test reads every relic's hand rule through the
  evaluator. Its card also said "won you"; it counts every pot, and says so.
- **Open Palm and Full Purse were never paid.** Their starting mana was a
  field nothing read. Both are among the twelve retired; the field works now
  in case `RULE_RELICS` is switched back.
- **Showdown lied about undecided cards.** Superpose says an undecided card
  "settles on whichever face helps its holder most", and every read before
  showdown (the hand meter, the bots' equity) counted it that way; showdown
  settled it on its highest rank instead. A Seven-or-King on a board of two
  Sevens became the King. It now settles on the face that makes its
  holder's hand best.
- **Bots rolled out blind.** A bot that had cast Cold Read, or been shown
  the river, read its odds as if it had seen nothing, so the information
  half of the game did nothing for any bot or for the harness's player. It
  now reads the cards it has legitimately been shown (never in a preview,
  which would read the cards the spell has not yet revealed).
  `READ_WHAT_IS_SEEN` in `server/game/bots.ts`.
- Log and table notes said "Sixs"; they say "Sixes".

## Decisions made 2026-10-10 (round 4)

Each is one constant.

1. **The rule shelf replaces twelve number relics.** Why: the rubric scored
   relics 6 because most were a number; the genre remembers relics that
   change a rule. `RULE_RELICS` in `shared/relics.ts`.
2. **Every coven has a creed, every seat plays it.** A table of four covens
   is four rulebooks, each named on its seat. `COVEN_CREEDS` in
   `shared/covens.ts`.
3. **At Hex I a bot's creed wakes at ante 3**, when the bots stop opening
   warm. With every creed on from hand one, the player's busts before the
   first Market (caught or not) rose from 14% to 21% (140 seeds); with the
   wake (and the showdown fix, same change) 16%, and 14% on the final code
   (280 seeds). The player's own creed is on from hand one; at Hex II every
   creed is. `BOT_CREEDS_FROM_ANTE`.
4. **The Unaligned's creed is The Last Word; Providence is cut** (data above).
   The creed is the `creed` field of the coven in `shared/covens.ts`.
5. **Kin bends board copies only** (data above). `KIN_BOARD_ONLY`.
6. **Bots read what they have been shown.** `READ_WHAT_IS_SEEN` in
   `server/game/bots.ts`.

Not decided here, as before: the name's trademark clearance, anything that
spends money, Steam networking. Round 3 said a coven pass "should follow a
playtest"; the caller asked for it now, so it is built and switchable, and
the playtest is still the thing that decides it.

## What changed, measured

Seeds 0-279 (280 runs, 40 per coven), adept bots, Hex I, aggressive player.
Before: 3a3d6be (round 3's game, the new harness). After: b7702e7 (this
round's game code). Raw summaries: `plans/fun-round4-data/`. Below about 4
points a difference is noise at 280 runs; per coven (40 runs) it is about
10 points.

| Aggressive player | before | after |
|---|---|---|
| run over before the first Market | 1% | 1% |
| run over before ante 3 | 5% | 3% |
| survived 3 antes | 82% | 83% |
| busted before the first Market, caught or not | 13% | 14% |
| an impossible hand in the run | 55% | 61% |
| ... one of your own | 32% | 32% |
| ... by ante 3 | 30% | 33% |
| impossible hands a run | 1.43 | 1.43 |
| runs won | 95 of 280 | 93 of 280 |
| your stack at ante 7 | 24 bb | 22 bb |
| biggest pot in the last 3 hands | 53% | 50% |
| real choices a minute | 9.1 | 9.2 |
| first Market | 97 s | 96 s |

Cautious player (seeds 0-139; before is round 3's published figure, the same
game code): run over before the first Market 0% and 0%, before ante 3 1% and
4%, busts before the first Market caught or not 12% and 12%, an impossible
hand 59% and 67%. Demo (3 antes, seeds 0-139): the wishlist screen 73%
(round 3: 72%), an impossible hand inside the demo 29% (31%), 4.3 minutes.

**Relics.**

| | before | after |
|---|---|---|
| the shelf: change a rule / information / a number | 20 / 6 / 19 | 32 / 6 / 7 |
| bought relics a run that change a rule | 1.39 of 2.97 | 2.54 of 2.94 |
| runs where a bought relic's rule visibly changed something | 29% | 54% |
| distinct relics bought, of 45 | 38 | 39 |
| spread of purchases (of 5.49 bits possible) | 4.96 | 4.96 |
| overlap between two runs' relics | 0.10 | 0.10 |

"Visibly changed something" is a logged rule (the Keepsake dealing a card
back, the Engraver writing one) or a showdown that reads differently without
the relic; a relic that changes the deal every hand (Gilt Edge, Twin Suns)
is not counted, so the figure is a floor. The new relics in measured play,
fires a run where owned: the Keepsake 7.8, the Engraver 1.8, the Blood Price
1.7, Vow of Silence 1.7, the Prism Lens 1.0, Stepping Stones 0.5, the Magpie
0.2, the Second River 0.2 (the Sanctum blocks rather than fires). The three
mythics were bought in 4 of 280 runs: at 22-26 shards the harness's greedy
buyer can rarely afford them, which is true of every mythic on the shelf.
The Magpie and the Second River are the weakest and the first to tune after
a human playtest. The buyer takes whatever relic it can afford, so the pick
rate (81%) is affordability, not appeal, and the build-variety figures
(distinct relics, spread, overlap) did not move: the Market still offers one
relic a visit.

**Covens** (40 runs each).

| Coven | won before / after | own impossible before / after | first bust at ante 1 before / after | rules that fired a run before / after (creed) |
|---|---|---|---|---|
| Unaligned | 15 / 12 | 35% / 28% | 10% / 18% | 0.9 / 5.3 (2.3) |
| Unmoored | 13 / 18 | 40% / 28% | 28% / 33% | 0.7 / 16.8 (15.0) |
| Quiet | 11 / 11 | 30% / 35% | 10% / 8% | 0.3 / 13.2 (9.9) |
| Long Now | 12 / 7 | 23% / 33% | 8% / 10% | 0.7 / 10.9 (6.9) |
| Twinned | 15 / 16 | 30% / **48%** | 13% / 8% | 0.7 / 9.5 (0.8) |
| Ashen | 9 / 13 | 30% / 28% | 13% / 5% | 1.0 / 3.6 (1.4) |
| Loom | 20 / 16 | 38% / 28% | 8% / 20% | 0.8 / 6.8 (2.0) |

- Every coven now plays under a rule of its own that does something in a
  run: from about once (Kin, Salt) to fifteen times (Many Futures). Before,
  the only rule was a lean, and the relics and sigils fired under one a run.
- The Twinned is the impossible-hand coven: 48% of runs with one of their
  own, the most of any coven (before, 30%, tied third).
- The Unmoored still loses its stack in the first ante more than any coven
  (33%, caught by the phylactery). Part of that is the harness: its player's
  reads on an undecided card use 16 rollouts; at 48 (70 runs) the figure
  was 19% against 24%. The rest is open.
- The covens are not further apart in what they make at showdown: the mean
  distance between two covens' hand categories went from 0.13 to 0.09, and
  between the schools they cast stayed at 0.26 and 0.25. The difference a
  creed makes is inside the hand (a river seen, a tell read, a card salted),
  and the harness's hand categories cannot see it.

## Re-scored with the same rubric

| # | Criterion | Before | After | Why |
|---|---|---|---|---|
| 1 | The run shows itself before it can end | 8 | 8 | Unchanged within noise: over before the first Market 1% and 1%, before ante 3 5% and 3%; busts caught or not 13% and 14%. The cautious player's before-ante-3 figure went from 1% to 4% (2 runs to 6 of 140). |
| 2 | The namesake shows up | 8 | 8 | Seen in 61% of runs (55%), but one of your own in 32% both times. |
| 3 | The run arc builds | 7 | 7 | Biggest pot in the last three hands 50% (53%), 22 bb at ante 7 (24). |
| 4 | Covens play differently and deliver their pitch | 6 | 7 | Round 3 named three faults. Two are answered: a lean was the only thing a coven did, and now each plays a rule that fires 1 to 15 times a run; the Twinned did not deliver its pitch, and now leads every coven in impossible hands (48%, was 30%). The third is not: the Unmoored still loses its stack first. And the covens' showdowns look no more different than before. |
| 5 | Little dead time, and the game says what happened | 7 | 7 | Choices a minute 9.2 (9.1); every new rule says what it did in the log; the hand meter no longer shows a hand you do not have. The dead time itself did not move. |
| 6 | The special things show in the first 10 minutes | 9 | 9 | First Market 96 s; an impossible hand by ante 3 in 33% (30%); the demo's figures held. |
| 7 | Builds have depth; relics are more than numbers | 6 | 8 | The fault round 3 scored was "most relics are still a number", and the bar it set for more was half of 45 changing a rule. Now 32 of 45 do, 86% of what a run buys is a rule (was 47%), and a bought relic's rule visibly fires in 54% of runs (29%); two relics that did nothing (Heirloom, The Long Game) work. Not 9: build variety did not move, the Market still offers one relic a visit, and three new relics barely show (the mythics, bought in 4 of 280 runs). |
| 8 | Presentation: art and feel | 6 | 6 | Untouched: it needs an artist. |
| | **Mean** | **7.1 (7)** | **7.5 (8)** | |

## Was the 8 earned?

**On the locked rubric, yes, at the threshold and no further: 7.5, which
the rule written in round 3 (mean rounded half up, an 8 needs 7.5) makes an
8.** It rests on two criteria moving and nothing falling. It is worth saying
plainly how thin that is: if criterion 7 is read as a 7 (because build
variety did not move) or criterion 4 as a 6 (because the covens' showdowns
are no more different and the Unmoored still busts first), the mean is 7.4
and HEXHOLD is a 7. I scored each on what round 3 said was wrong with it;
the evidence for each is above, and every number is from simulated players.

What would make it a solid 8, and what would take it back:
1. **A human playtest** on this build. Whether the Keepsake feels like a
   plan or a chore, whether Tells and Foreknown read as power or as noise,
   and whether a table of four creeds is readable are judgements about
   feel that no harness can make. If players do not notice the creeds,
   criterion 4 is a 6 and this is a 7.
2. **Two relic offers a visit** (a design proposal, not built): the build
   choice the genre is played for is between relics, and the Market offers
   one. It is the most direct way to move build variety.
3. **The Unmoored's first ante**: test with people before tuning.
4. **Art (criterion 8)**, as before: worth up to 2 points on its own.

## Three simulated Steam reviews (after round 4)

**The impatient refunder** · 1.2 hrs · Recommended

> Picked the Quiet because the card said I would know their hand instead
> of making mine. The first time each bot raised, the log said I had read
> its tell and one of its cards turned face up for me. I folded a lot less
> stupidly. The phylactery caught my first bust, which I did not deserve,
> and I typed "hex the chip leader" into the shop. Keeping it.

**The genre veteran** · 14 hrs · Recommended

> Round three's complaint was "relics are mostly +1s" and it is fixed.
> Stepping Stones is Shortcut, the Keepsake is Runic Pyramid for folding,
> the Blood Price lets me cast my 5-mana mythic on the flop for two big
> blinds, and Vow of Silence makes the counterspell war somebody else's
> problem. Covens finally have rules: as the Long Now I see the river when
> the flop lands, as the Quiet an opponent's first raise shows me one of their cards. The Market
> still shows one relic a visit, so I am drafting from whatever turns up,
> and I never once saw Twice-Told for sale. $9.99 yes; $14.99 after art.

**The Deck player** · 8 hrs · Recommended

> Same good Deck port. The creed is on the menu under each coven and on
> every seat's tooltip, so I know the bot across the table is Ashen and can
> salt the King I am holding. The log says what every relic did, which is
> how I learned the Second River had fired for me. Typing in the Scribe on
> a pad is still the clumsy bit.

## Verdict, round 4

**Fun: 8/10 on the locked rubric (7.5, was 7.1), by the smallest margin the
rubric allows.** No padding: twelve number relics became twelve rules
(every one measured), each coven got one rule for its whole run, two
creeds that measured badly were cut or reshaped, and four defects found
on the way were fixed (two relics that did nothing, a showdown that settled
undecided cards against their holder, bots that never used what they had
seen). A human playtest decides whether it stays an 8.

**Sellable at $9.99: yes**, on the same two conditions as before (no online
play on the store page until Steam invites exist; commissioned capsule art).
The store page's "45 relics" stays true. Windows full game and demo rebuilt
on this code; the Linux build and its smoke test are pending (WSL is down).

---

# Round 5 (2026-10-16): re-measure from today's build, then one more round

Brief: the caller's round-5 brief, with `FUN3_BRIEF.md`'s honesty rule
("it has to earn the 8, and if it can't, fine, but no lying or moving the
goalposts or adding shitty mechanics"). Branch `fun5-2026-10-16`, from `main`
at 5f48e22. Raw batch summaries: `plans/fun-round5-data/` (each names its
commit and command).

## The rubric, unchanged

The same eight criteria, word for word, each out of 10; the total is the
mean rounded half up, and an 8 needs 7.5. Nothing below redefines one.

## The honest baseline: what moved between round 4 and today

Round 4 was scored on b7702e7. Since then 55 commits reached `main`, all
from other sessions: the basketball cut-ins (plan 030), the COUNTERED stamp,
a committed pixel-arcade art direction (14 colours, a 4px art pixel, no blur,
three faces), hit-stop and slow motion, a brighter mix, table layout fixes
and the trailer's third cut. A few touched `shared/` and `server/` for display
(sigil card lines, the resolved stack the COUNTERED stamp reads).

- **Criteria 1-7, gameplay: nothing moved.** `npm run fun:batch -- 280 0` on
  5f48e22 reproduces round 4's after column to the digit: 93 of 280 won, 1% /
  3% / 83%, an impossible hand in 61% of runs and one of your own in 32%,
  1.43 a run, 9.2 real choices a minute, the biggest pot in the last three
  hands in 50%.
- **Criterion 8 moved up.** Round 4's 6 rested on "clean CSS and SVG,
  synthesised sound, no illustrated assets". Today there is a committed art
  direction, drawn court cards, and juice (cut-ins, stamps, relic punches,
  pot pops, count-ups, hit-stop). To keep my own hope out of it, a separate
  reviewer was given the criterion's words, the evidence behind the 6, the
  comparables (Balatro, Poker Quest, Luck be a Landlord, Apokerlypse) and
  screenshots then and now, and asked for a number without being told one:
  **7, "only just"**. What holds it at 7: the opponents are silhouettes, the
  table is a flat ellipse, the sound is still synthesised and unheard, and
  the capsules are generated. Round 3 put an artist's pass at 2 points; this
  is about half of one.
- **Criterion 5 moved down.** The same reviewer found what the style audit
  (0 findings) could not: the arcade look's body face, Pixelify Sans, draws
  `fi` and `fl` as one glyph that reads as a capital A, and the body's
  `text-rendering: optimizeLegibility` turns that ligature on. The menu's
  first lines read "Three bots All the table and the Arst hand deals itself";
  about 23 of 174 sigil, relic and omen texts with a lowercase flop, flush or
  five read "Aop", "Aush", "Ave". A game whose rules text misspells its own
  street names is not saying what happened, so the baseline scores criterion 5
  one point under round 4.

| # | Criterion | Round 4 | Today, before (5f48e22) |
|---|---|---|---|
| 1 | The run shows itself before it can end | 8 | 8 |
| 2 | The namesake shows up | 8 | 8 |
| 3 | The run arc builds | 7 | 7 |
| 4 | Covens play differently and deliver their pitch | 7 | 7 |
| 5 | Little dead time, and the game says what happened | 7 | 6 |
| 6 | The special things show in the first 10 minutes | 9 | 9 |
| 7 | Builds have depth; relics are more than numbers | 8 | 8 |
| 8 | Presentation: art and feel | 6 | 7 |
| | **Mean** | **7.5 (8)** | **7.5 (8)** |

## Where the gap to a solid 8 was, with evidence

Round 4 named the thin spots: criterion 7's build variety ("the Market still
offers one relic a visit"), criterion 4's feel (only a playtest can say), and
criterion 8 (an artist). Today adds criterion 5's broken text. What the
genre's reviewers say, from Steam reviews and discussions read for this round
(quotes through a summariser, 10-20 reviews a game, so directional):

- **A shop that does not offer what the build needs is the recurring shop
  complaint**, not the slot count: Apokerlypse ("needs more options in the
  store... more repeats of items",
  [reviews](https://steamcommunity.com/app/3481020/reviews/?browsefilter=mostrecent&filterLanguage=english)),
  Poker Quest's fans ("not every run has shop inventory that will fill the
  exact need",
  [reviews](https://steamcommunity.com/app/1184820/positivereviews/?browsefilter=toprated&filterLanguage=english)),
  Balatro's negatives ("5-15 rerolls... nothing but unusable garbage",
  [reviews](https://steamcommunity.com/app/2379780/negativereviews/?browsefilter=toprated&filterLanguage=english)).
  HEXHOLD's Market showed one relic a visit, bought 81% of the time.
- **Slow pace and watching the AI recur, at medium strength**: Balatro
  players call 1x "positively glacial"
  ([thread](https://steamcommunity.com/app/2379780/discussions/0/6426156954538745672)),
  Slay the Spire added a fast mode on request
  ([thread](https://steamcommunity.com/app/646570/discussions/0/2549465882935485677)),
  Poker Night 2 is punished for its waits. HEXHOLD has a Speed setting, but at
  the default a run spent 20 s of 7.8 minutes watching bots finish hands the
  player had already folded.
- **Unexplained losses read as cheating** against AI opponents (Apokerlypse,
  Poker Night, Dungeons & Degenerate Gamblers). A rules text that misspells
  "flop" is that failure in miniature.

## What changed, each reversible

1. **Two relics on the shelf; buying one takes the other** (`RELIC_OFFERS = 2`
   in `server/game/shop.ts`; 1 puts back the old shelf with the same draws).
   Two different relics take the place of one sigil, so a visit still shows
   five wares; the card says "Relic · pick one" while both are there and
   "Gone" on the one left behind; the first-Market hint says so. Why a player
   of the genre wants it: choosing between relics is the decision a roguelite
   build is made of, and "the shop didn't have what my build needed" is the
   genre's shop complaint. Why take-one rather than buy-both: a shelf where
   both could be bought would spend on relics the shards that buy rites and
   blank pages, the two purchases the game is named for. Bots get the same
   shelf and never reach for a withdrawn relic. Tests: `test/market.test.ts`
   (composition over 40 seeds, the withdrawal and its price, bots, a reroll's
   fresh pair).
2. **Once you fold at a solo table, the bots finish the hand quickly**
   (`FAST_AFTER_FOLD` in `server/game/engine.ts`). They act at the pace they
   already use to answer a spell (140-340 ms, was 300-920), and a showdown you
   folded out of holds half its reading time after the reveal; an impossible
   hand keeps its full ceremony. Why: a poker player who has folded wants the
   next hand, which is why fast-fold is the most played online format. Tests:
   `test/fastfold.test.ts`.
3. **Ligatures off** (`src/styles/base.css`): "first", "flop" and "flush" are
   spelled with their letters again. Test: `test/css.test.ts`.
4. **The showdown panel's board row is laid out flat.** It was fanned at
   0.24, and the five corner indices crowded each other in the one row that
   exists so a reader can check what scored.

## Measured, before and after

Same seeds, adept bots, Hex I: seeds 0-279 and a second set, 280-419. At 280
runs a difference under about 4 points is noise; per coven (40 runs) about 10.

| Aggressive player | before 0-279 | after 0-279 | before 280-419 | after 280-419 |
|---|---|---|---|---|
| run over before the first Market | 1% | 1% | 1% | 1% |
| run over before ante 3 | 3% | 5% | 4% | 1% |
| survived 3 antes | 83% | 80% | 84% | 84% |
| an impossible hand in the run | 61% | 64% | 60% | 63% |
| ... one of your own | 32% | **37%** | 34% | **39%** |
| impossible hands a run | 1.43 | 1.50 | 1.51 | 1.69 |
| runs won | 93 | 91 | 50 | 50 |
| your stack at ante 7 | 22 bb | 21 bb | 23 bb | 21 bb |
| biggest pot in the last 3 hands | 50% | 49% | 50% | 41% |
| real choices a minute | 9.2 | 9.5 | 9.1 | 9.3 |
| first Market | 96 s | 92 s | 91 s | 87 s |
| pages written a run | 1.2 | 0.9 | 1.2 | 1.0 |

**The fold change on its own** (seeds 0-139, the shelf off): the same 140
runs to the hand, because the change swaps one random draw for another of the
same count. Only the clock moved: a run 7.8 to 7.6 minutes, watching bots
finish a folded hand 20 s to 11 s, showdowns 76 s to 73 s, the first Market
96 s to 92 s, real choices a minute 9.2 to 9.4.

**The relic shelf.**

| | before | after (0-279) | after (280-419) |
|---|---|---|---|
| a real choice: two affordable relics side by side | never | 69% of visits, 3.3 a run | 67%, 3.3 a run |
| a relic bought, per Market visit | 81% | 91% | 91% |
| a bought relic's rule visibly fired | 54% | 60% | 59% (before 51%) |
| distinct relics bought, of 45 | 39 | 41 | 39 (before 38) |
| spread of purchases (of 5.49 bits) | 4.96 | 5.09 | 5.08 (before 4.97) |
| overlap between two runs' relics | 0.10 | 0.09 | 0.10 (before 0.10) |
| a run owning a new mythic (Lodestone, Twice-Told, Usurper) | 4 of 280 | 7 of 280 | |

- One of your own impossible hands rose 5 points in both seed sets. The
  rares that open them are bought more: the Prism Lens 56 times (41), the
  Gilded Thumb 34 (17), Unsettled 34 (14), Bloodline 33 (19).
- **What the harness cannot tell you about the choice.** The player's chair
  runs the bots' shopping code, which takes the dearest relic it can afford.
  So purchases skew to rares (the Keepsake, a cheap common, was bought 18
  times, was 51), and with a relic affordable more often the blank page is
  written less (1.2 to 0.9 a run, 1.0 on the second set). A person chooses by
  build; these figures are a floor for variety and a warning for the page.
- **Watch: the Unaligned.** They won 12 to 6 of 40 runs on the first set and
  7 to 5 of 20 on the second (19 to 11 of 60). No other coven moved outside
  noise and the total held (143 to 141). The cause is not identified.
- **Cautious player** (seeds 0-139; before is round 4's published figure, the
  same game code): run over before the first Market 0% and 0%, before ante 3
  4% and 2%, survived 3 antes 82% and 85%, an impossible hand 67% and 63%,
  one of your own 37% and 34%.
- **The demo** (3 antes, seeds 0-139): the wishlist screen 73% to 74%, an
  impossible hand inside the demo **29% to 36%** (yours 10% to 14%), 4.3
  minutes both.
- **Browser harnesses on the new build:** `npm run responsive` passes at all
  7 resolutions with the Market and showdown reached; `test/style.mjs` in
  style; `test/align.mjs` square; `test/demo.mjs` all checks pass. `npm test`:
  382 pass (375 before this round, seven new), typecheck clean. One run
  under a second suite running beside it had one failure that four clean
  runs did not repeat.

## Re-scored with the same rubric

| # | Criterion | Before | After | Why |
|---|---|---|---|---|
| 1 | The run shows itself before it can end | 8 | 8 | Flat: over before ante 3 3% to 5% on one seed set and 4% to 1% on the other; survived 3 antes 83/80 and 84/84. |
| 2 | The namesake shows up | 8 | 8 | Seen in 64% and 63% of runs (61, 60), one of your own 37% and 39% (32, 34): up in both sets. Not 9: about two runs in three still never make one of their own. |
| 3 | The run arc builds | 7 | 7 | Nothing here aimed at it. Biggest pot in the last three hands 49% and 41% (50, 50), 21 bb at ante 7 (22, 23): flat to slightly worse. |
| 4 | Covens play differently and deliver their pitch | 7 | 7 | Unchanged in substance. The Twinned still lead own impossible hands (50%, tied with the Long Now on the first set); the Unmoored still lose their stack first; the Unaligned's wins fell. The covens' showdowns sit further apart (0.09 to 0.14, 0.12 to 0.17), but nothing aimed at that, so it is not credited. |
| 5 | Little dead time, and the game says what happened | 6 | 7 | The rules text spells its own words again, which puts back round 4's 7. Dead time: a folded hand's bots take half as long, 12 s a run on identical outcomes, and choices a minute 9.2 to 9.5. Not 8: 36% of a run is still not the player's decision, most of it showdowns, which are the payoff. |
| 6 | The special things show in the first 10 minutes | 9 | 9 | First Market 92 s (96); an impossible hand inside the demo 36% (29%). Not 10: still a minority of demo runs. |
| 7 | Builds have depth; relics are more than numbers | 8 | 8 | Round 4's three reasons for not 9: the Market's one relic (answered: a real choice 3.3 times a run); build variety did not move (moved a little: spread +0.12 bits on both sets, distinct +1 to +2, overlap flat); the mythics barely show (still: 7 runs of 280). One answered, one barely, one not, measured by a buyer that cannot choose by build: a sturdier 8, not a 9. |
| 8 | Presentation: art and feel | 7 | 7 | The two defects the reviewer named that code could fix are fixed (the ligature, the crowded showdown board). Its other condition for a secure 7 is not code: nobody has listened to the audio. |
| | **Mean** | **7.5 (8)** | **7.6 (8)** | 61 points; an 8 needs 60. |

## Was the 8 earned?

**Yes, with one point of margin: more than round 4 had, less than I would
call solid.** Against round 4's card the net change is criterion 8, up one
for the art pass other sessions shipped, scored by a reviewer who was not
told a number. This round's own work kept that point from being cancelled
(the ligature bug had cost criterion 5 a point) and made two thin spots
sturdier: the Market now offers the relic choice round 4 named as missing,
and the dead time moved, if only by 12 seconds a run. Nothing was added that
is not a fix to the core loop or a widening of the shelf the game already had.

What would take it back: one criterion dropping one point leaves 7.5, still
an 8 at the threshold; two leave 7.4, a 7. The two most likely to drop are
criterion 4 (if playtesters do not notice the creeds) and criterion 8 (the
reviewer's 7 was "only just").

What would make it solid, none of it code:
1. **A human playtest** (the December Steam Playtest). It decides criterion 4
   (do people notice and like the creeds?), the relic shelf (is "pick one"
   read as a choice or as a loss?), and whether the Unaligned's fall is real.
2. **Commissioned art**: opponent portraits, coven art and the capsules. The
   reviewer's bar for an 8 on criterion 8 is "a real sprite layer, expressive
   opponents, distinct court cards" and artist-made key art.
3. **One listening pass** with headphones on the packaged build, the other
   half of a secure 7 on criterion 8.

## Decisions made 2026-10-16

Each is one constant.

1. **Two relics, take one** (`RELIC_OFFERS`). Buy-both was rejected without a
   build: the harness's buyer already writes fewer pages when one more relic
   is affordable, and buy-both would make that worse.
2. **Fast after a fold** (`FAST_AFTER_FOLD`, with `FOLDED_READ` 0.5). Solo
   tables only; a table with two humans keeps every pause.
3. **Ligatures off for every face.** Not a switch: no face in the game needs
   them.

Not decided here, as before: the name's trademark clearance, anything that
spends money, Steam networking.

## Three simulated Steam reviews (after round 5)

**The impatient refunder** · 1.1 hrs · Recommended

> I folded a lot in my first run and the bots just got on with it, so I was
> back in a hand in a couple of seconds instead of watching three AIs think.
> At the first Market there were two relics and a note that I could take one;
> I took the one that makes Prism cards fully wild for me, and an hour later
> that was my whole build. The phylactery caught my first bust. Typed "hex the
> chip leader" into the blank page. Keeping it.

**The genre veteran** · 15 hrs · Recommended

> Round four's Market showed one relic, so you bought it. Now it is two and
> you choose, which is the decision this genre is played for: Stepping Stones
> or the Sanctum, the Blood Price or the cheap common and a Wild rite. I still
> never saw Twice-Told at a price I could pay, and the covens play differently
> inside a hand more than at showdown. The arcade look is clean and the
> cut-ins land; it is not Balatro's CRT, and the opponents are silhouettes.
> $9.99, yes. $14.99 after real art.

**The Deck player** · 9 hrs · Recommended

> The Market's two relics both fit on the Deck's screen with "pick one" on
> them, and the one you leave goes grey with "Gone" under it, so there is no
> guessing. Folding gets you to the next hand fast. The text reads properly
> now; an earlier build said "the Arst hand" on the menu. Typing in the
> Scribe on a pad is still the clumsy bit.

## Verdict, round 5

**Fun: 8/10 on the locked rubric (7.6; this morning's build re-scored 7.5,
round 4 published 7.5), earned with one point of margin.** Every number is
from simulated players and one blind reviewer; a human playtest decides
whether it holds.

**Sellable at $9.99: yes**, on the same conditions as before (no online play
on the store page until Steam invites exist; commissioned capsule art). The
store screenshots predated the arcade look, so the page would have shown a
different game; they were recaptured from the rebuilt packaged build this
round (`steam/screenshots/`). The generated capsules still use the older
look's frames until the commissioned art replaces them.


# Round 6 (2026-10-22): re-measure after the UI pass

Brief: re-verify the game after another session's UI pass of 2026-10-17..19
(f47cd99..35549b8), re-score on the same locked rubric, and say with evidence
whether the pass helped or hurt. Same honesty rule as rounds 3 to 5. Raw batch
summaries: `plans/fun-round6-data/` (each names its commit and command).

## The rubric, unchanged

The same eight criteria, word for word, each out of 10; the mean is rounded
half up, and an 8 needs 7.5. Nothing below redefines one.

## What the UI pass was

Twenty commits, written from two people's play of the hosted build (Mason
and a friend). Two kinds of change, and they pull in opposite directions on
this rubric:

- **Presentation and clarity.** Your cards in front of you; a readable turn
  indicator and bet costs; seat positions (D/SB/BB); the target of every
  spell named and ringed for every viewer; a rules tab listing every rule in
  force and where it came from; hover any card for what has been done to it;
  a Mirrored card shows what it was; Wild and Prism drawn differently; the
  showdown fills the screen and shows the five cards that scored, and stays
  up long enough to read; a contrast pass with zero findings on twelve
  screens. Rule fixes: a street gets exactly one betting round; a burn is
  for good; a mirror copies the marks; casting happens in your betting
  window.
- **Content.** On 2026-10-17 (cc8f6ea) the live pool was cut from 71 sigils,
  41 omens and 45 relics to 13, 9 and 12, and the coven picker was turned off
  (`COVEN_CHOICE`): everyone, bots included, is the Unaligned. The reason
  given: neither player could say what a single omen did, and the first
  screen asked a new player to weigh about thirty rules before the first
  card. The bots were also slowed (520-1040 ms an action, was 300-920) and
  the showdown held longer (2.6 s plus 1 s a hand), both from "too fast, I
  can't tell what's going on".

## Found and fixed this round

- **The demo dealt a coven nobody could see.** With the picker off the menu
  sends 'unaligned'; the demo server mapped anything outside its three
  covens to the first, so every demo player since cc8f6ea played the Ashen
  (its opening sigils and creed) against Unaligned bots. Fixed in
  `covenFor` (server/net/io.ts); test fails on the old code.
- **Three texts still sold the old game**: the first-run intro told every new
  player to pick one of seven covens, and taught Sealed Rank and Deep Well,
  neither dealt any more; the demo's end screen promised "All 7 covens".
- **Mirror did not do what its card said.** "An exact duplicate of the first,
  marks and all. For this hand..." The sigil copied the face only, and the
  copy never reverted: cards live the whole run, so the overwritten card left
  the deck for good. One copy routine for the sigil and the Twinned omen now,
  borrowed marks hand-long, the printed face restored between hands. Three
  tests, each failing on 35549b8.
- **The style audit had been blind to every color-mix() fill**, the same bug
  the UI pass found in its legibility audit. Reading them exposed a "was 3♠"
  label at 1.79:1 and five labels mixed off the 14-colour palette; all fixed,
  and the "was" label moved to the edge a fanned row never covers.
- **On a pad, the first-run hints trapped the d-pad.** The hints live in a
  full-screen click-through layer, which the pad took for a modal: while a
  hint was up, the only reachable control was its ×, and A pressed it
  instead of checking. **Nothing below the fold could be reached**: the
  Market's Done at 1280x800 was out of the pad's reach (down from the last
  control on screen wrapped to the top). And **B could not close the deck
  census or a pinned omen**: the pad sent its keys to `window`, which their
  `document` listeners never hear. All three fixed in GamepadLayer;
  `test/gamepad.mjs` now walks the pad to the rules tab, the deck census, a
  sigil (arm, cast), a Market purchase and Done, 14 of 14. It found all three.

## Measured

Seeds 0-279, adept bots, Hex I, the aggressive player, playing the coven the
game deals. Round 5's column is its published "after" (eb6075d), which rotated
all seven covens; the harness did that until this round regardless of the
switch, so a straight run of today's harness against round 5's numbers is
the comparison a player would feel: the game as shipped then and now.

| | round 5 (eb6075d) | UI pass (35549b8) | after this round |
|---|---|---|---|
| run over before the first Market | 1% | 3% | 3% |
| run over before ante 3 | 5% | 8% | 10% |
| survived 3 antes | 80% | 71% | 69% |
| busted, caught or not, before the first Market | 14% | 20% | 20% |
| an impossible hand in the run | 64% | 58% | 57% |
| ... one of your own | 37% | 34% | 35% |
| impossible hands a run | 1.50 | 1.43 | 1.38 |
| runs won | 91 | 87 | 91 |
| your stack at ante 7 | 21 bb | 26 bb | 29 bb |
| biggest pot in the last 3 hands | 49% | 58% | 58% |
| real choices a minute | 9.5 | 8.7 | 8.9 |
| share of the run that is not your decision | 36% | 44% | 44% |
| a run | 7.4 min | 8.1 min | 8.0 min |
| first Market | 92 s | 100 s | 100 s |
| a real choice of two relics, per run | 3.3 | 2.6 | 2.5 |
| distinct relics bought | 41 of 45 | 12 of 12 | 12 of 12 |
| spread of purchases | 5.09 bits | 3.44 | 3.42 |
| overlap between two runs' relics | 0.09 | 0.34 | 0.34 |
| a bought relic's rule visibly fired | 60% | 45% | 47% |
| a run owning a mythic | 2.5% (new ones) | 14% | 9% |

At 280 runs a difference under about 4 points is noise. The Mirror fix moved
nothing outside it: on the same 280 seeds one of your own impossible hands
went 34% to 35% (on the first 70 seeds alone it looked like 24% to 37%,
which is why 70 runs is not a measurement).

**The demo** (3 antes, seeds 0-139): an impossible hand inside the demo 40%
(round 5: 36%), yours 16% (14%), reached the "demo ends here" screen 64%
(74%; a bust ends on a screen with the same Wishlist button), 5.1 minutes
(4.3), first Market 100 s.

**Two numbers that are not what they look like.** "A bought relic's rule
visibly fired" counts ledger lines tagged with a relic. Five of the twelve
shelf relics (Gilt Edge, Third Hand, Cold Read, Unstable Isotope, Wild
Inheritance) act at the deal and write no line, so they never count, and
never trigger the relic "punch" on the rail either: an attribution gap,
recorded, not fixed (a ledger line per relic per hand is a design call about
noise). And the time split moved partly by design: the bots were slowed and
the showdown lengthened because two players asked for it.

**The browser harnesses on the final client**: `npm run responsive` 7 of 7
resolutions (a 1440p failure under heavy load passed on its rerun),
`test/legibility.mjs` zero findings on twelve screens, `test/style.mjs` in
style, `test/align.mjs` square, `test/demo.mjs` every check, `test/gamepad.mjs` 14 of 14, `npm test` 453.

## Presentation, scored blind

A separate reviewer was given the criterion's words, the comparables
(Balatro, Poker Quest, Luck be a Landlord, Apokerlypse), the facts a still
cannot show (synthesised sound nobody has listened to, silhouette opponents,
generated capsules, motion juice), and two unlabelled sets of screenshots:
round 5's store set and today's. No score from any round. It gave round 5's
build **5** ("only just, close to a 4") and today's **6** ("only just").

So this reviewer is two points harsher than round 5's on the same build
(round 5's gave it 7). Absolute numbers from one blind reviewer are that
noisy; the relative call, from one eye on both builds, is the signal: **the
UI pass is worth about a point of presentation**, mostly the drawn card
states (the "was" face, the burned slot, the Wild tag, rules chips, BUSTED),
your hand centre-stage and the turn indicator. Against it: the mutation
treatments read as crude (a black slash through a card looks like a
strike-through, not magic), the felt is flat, the opponents are silhouettes,
the menu is a scrolling form, and stills showed layout blemishes (a spell's
text running under the sticky "Answer it?", the MORE RULES chip over text, a
hint toast over the ante bar).

## Re-scored with the same rubric

| # | Criterion | Round 5 | Now | Why |
|---|---|---|---|---|
| 1 | The run shows itself before it can end | 8 | 7 | Over before the first Market 3% (1%), before ante 3 10% (5%), survived 3 antes 69% (80%), busted before the first Market 20% (14%). The phylactery still catches the first bust (99 runs). Cause: everyone now opens as the Unaligned, the thinnest opening (no relic, no signature sigils); in round 5 the Unaligned alone busted in the first ante 18% of the time against a 14% average. Round 4 scored 8 at 1% / 3% / 83%; round 3 scored 6 at 12% / 23% / 71%. |
| 2 | The namesake shows up | 8 | 8 | Seen in 57% of runs (64%), one of your own 35% (37%). The first fell beyond noise, the second did not; round 4 scored 8 at 61% / 32%. Not 7: about one run in three still makes its own. Not 9: two in three do not. |
| 3 | The run arc builds | 7 | 7 | Biggest pot in the last three hands 58% (49%), 29 bb at ante 7 (21). Better, by about what round 3's 7 rested on (56%, 19 bb), so not a full point. |
| 4 | Covens play differently and deliver their pitch | 7 | 5 | There are no covens to play differently: the picker is off and every seat is the Unaligned, so every run opens the same way. That is less than round 3's 5 on the first half (covens existed then, and differed a little in outcome). On the second half nothing is promised any more (the store copy, the intro and the demo's pitch no longer sell covens), so the refund this criterion was written for, a coven that does not deliver, cannot happen, and the one creed left delivers (it fires 1.6 times a run). Read strictly on the first half it is a 4. |
| 5 | Little dead time, and the game says what happened | 7 | 7 | "Says what happened" is far better (the list above, and this round's Mirror and "was" fixes). Dead time is worse, by design: 44% of a run is not your decision (36%), 8.9 choices a minute (9.5), a run 8.0 minutes (7.4). One half up, one half down. |
| 6 | The special things show in the first 10 minutes | 9 | 9 | First cast 4 s, first Market 100 s (92), an impossible hand inside the demo 40% (36%). The intro no longer points at a menu control that is not there. |
| 7 | Builds have depth; relics are more than numbers | 8 | 7 | Relics are rules more than ever (10 of the 12 on the shelf; 85% of what a run buys), and the mythics now show (9-14% of runs own one, was 2.5%), which answers one of round 4's "not 9" reasons. But depth is what the criterion says first, and it fell hard: two runs now share a third of their relics (overlap 0.34, was 0.09), the spread of purchases is 3.42 bits (5.09), a real two-relic choice comes 2.5 times a run (3.3), and the sigils a run is built from went from 71 to 13. |
| 8 | Presentation: art and feel | 7 | 7 | Held. The blind reviewer puts the UI pass about a point above round 5's build, and two points below round 5's reviewer in absolute terms; neither moves this number honestly. What would: an artist (portraits, a felt with life, card states that look like magic), and one listening pass. |
| | **Mean** | **7.6 (8)** | **7.1 (7)** | 57 points; an 8 needs 60. |

## Did the UI pass help or hurt?

**Both, and on this rubric it hurt on balance: 7.6 to 7.1, the 8 lost.**

- Helped: what the game says about itself. Criterion 5's second half and
  criterion 8 are better by evidence (a blind reviewer, zero legibility
  findings, the cards and showdown that explain the magic), and the rules
  fixes (one betting round a street, a burn that stays burned) remove ways
  an unexplained loss could read as cheating. Criterion 3 improved.
- Hurt: the content cut and the covens switch, which arrived in the same
  pass. They cost criterion 4 two points and criterion 7 one, and the
  all-Unaligned opening costs criterion 1 one. Net -4 points against +0 that
  moved a whole criterion up.

Was the cut wrong? The rubric cannot say, and that matters: it measures
depth and variety, and the cut traded both for a game two real players could
follow. Their confusion is the strongest evidence this project has, and no
harness here can weigh it. So this round reverses nothing.

## What would earn the 8 back (not built: each is Mason's call)

1. **Covens back as an unlock after the first run.** The first run stays the
   simple, symmetric Unaligned table the playtest asked for; from the second
   run the picker opens (bots stay Unaligned, so the table never plays
   rulebooks you were not shown). It is the genre's own pattern (Balatro's
   decks, Slay the Spire's characters). It speaks to criteria 4, 7 and 1 at
   once: round 5's other covens opened safer than the Unaligned. One switch
   and a profile check; the content is all still there.
2. **Grow the pools one card at a time**, as cc8f6ea's own rule says
   (ceilings 16 sigils, 12 omens, 16 relics), starting with relics: four more
   on the shelf is the most direct lever on criterion 7.
3. **A line for the five silent relics**, so the ledger and the rail say
   when Gilt Edge or Wild Inheritance did something.
4. As before, none of it code: the December playtest decides criterion 4
   and whether "pick one" reads as a choice; an artist moves criterion 8.

## Watch list from round 5, re-measured

- **The Unaligned's win rate**: it is now the only coven, and wins 91 of
  280 (32%), where round 5's Unaligned won 6 of 40 (15%) and the whole game
  91 of 280. With every seat Unaligned the table is symmetric, and the fall
  is gone. Nothing to adjust.
- **The Unmoored's first ante**: the Unmoored is no longer dealt. The
  table-wide figure that replaced it is criterion 1's: busted before the
  first Market 20% (round 5: 14% across covens, 33% for the Unmoored), with
  the phylactery catching it. A constant could soften it (a longer
  phylactery, warmer bots); not changed, because the cause is the opening,
  and proposal 1 addresses the opening.
- **Mythic affordability**: answered by the pool cut, not by a price: two
  mythics among twelve relics, owned in 9-14% of runs (round 5: 7 of 280 owned
  a new one).

No constant was changed this round: none had evidence of a fault a constant
should fix rather than a design call.

## Three simulated Steam reviews (after round 6)

**The impatient refunder** · 0.9 hrs · Recommended

> I could tell what was going on, which is not something I say about card
> roguelites with spells. Every card says what was done to it when you hover,
> the showdown shows the actual five cards, and when a guy copied a card it
> said "was 7♥" underneath. Lost my first run in the second ante, the
> phylactery brought me back. Bots are a bit slow.

**The genre veteran** · 14 hrs · Not recommended (for now)

> Clean and readable, and the impossible hands are real. But every run starts
> the same, the shelf has twelve relics so by run five I had seen all of
> them, and two runs share a third of their builds. The earlier builds people
> talk about had covens; this one has a single opening. $9.99 for a tight
> core, but I want the variety back before I put more hours in.

**The Deck player** · 6 hrs · Recommended

> Plays fine on a pad now: the d-pad gets to everything including the deck
> and the Market's Done button. Text is readable at Deck size. Hints used to
> grab the controller on the first hand; not any more. Typing on the blank
> page is still the clumsy bit.

## Verdict, round 6

**Fun: 7/10 on the locked rubric (7.1; round 5 published 7.6, an 8).** The UI
pass made the game clearer and better-looking by a point a blind reviewer
could see, and the content cut that came with it cost more than that on a
rubric that measures depth and variety. Every number is from simulated
players and one blind reviewer.

**Sellable at $9.99: yes, as a tight solo roguelite**, on the same conditions
as before (no online play on the store page until Steam invites exist;
commissioned capsule art). The store copy was rewritten this round to sell
what the game now deals: 13 sigils, 9 omens, 12 relics, no covens.

# Round 7 (2026-10-22): covens as unlock

Brief: Mason chose round 6's first proposal, "Covens as unlock". Keep the
simpler first run the UI pass made (it cut content because two real players
were confused); after the first run, open the covens and bring back a vetted
subset of the cut cards, so later runs differ again. Same rubric, same
honesty rule ("it has to earn the 8, and if it can't, fine, but no lying or
moving the goalposts or adding shitty mechanics"). Branch
`covens-unlock-2026-10-22`, from 8d1fea7. Raw batch summaries:
`plans/fun-round7-data/` (each names its commit and command).

## The rubric, unchanged, and the one thing that is new

The same eight criteria, word for word, each out of 10; the mean is rounded
half up, and an 8 needs 7.5.

What is new is that the game now has two kinds of run, and the rubric was
written when it had one. Decided before any batch was run, so the data could
not choose the rule:

- **Criteria 1 and 6** are about the first impression ("before it can end",
  "the first 10 minutes"). A buyer's first run is run 1, so they are scored
  on run 1.
- **Criteria 4 and 7** are about variety across runs. Run 1 is the same on
  purpose, so they are scored on runs 2 and later, the game a player keeps
  playing.
- **Criteria 2, 3 and 5** apply to every run: scored on runs 2+, unless run 1
  would score lower, in which case the lower score stands.
- **Criterion 8**: nothing here touched art.

## What changed

**The first run is exactly round 6's.** Unaligned, 13 sigils, 9 omens, 12
relics, no picker, the same intro, the same menu. A first-run table builds
every bag from the same lists in the same order as before, so it deals the
same cards: `test/unlock.test.ts` checks identity, not equality, and the run-1
batch below reproduces round 6's numbers to the digit.

**After one finished run, won or lost** (a demo played to its end counts):

- **The coven picker opens** with all seven, above the button that starts a
  run, where it always sat. The bots stay Unaligned, as round 6's proposal
  said: the one rulebook at the table you were not dealt is the one you
  picked, and the picker showed you its creed first. The Daily Rite plays the
  day's coven again, for everyone past their first run.
- **Three sigils, three omens, four relics** join the pools, which stop at
  the cut's own ceilings (16, 12, 16; `test/pool.test.ts` holds both pools to
  everything the engine assumes):
  - Sigils: **Graft, Blight, Gild**, the Twinned's, the Ashen's and the
    Loom's own cards, so a coven's lean deals its card again after the
    opening hand instead of drawing from two cards that are not its own.
  - Omens: **The Kindling** (five cards that burn off the board at the end of
    their street), **The Sealed Court** (Kings face down for everyone),
    **The Prism** (six cards that are every suit, from ante 4).
  - Relics: **The Keepsake** (fold before the flop, keep your higher card),
    **Broken Compass** (flushes of four), **The Magpie** (counter a spell and
    keep it, in a game where every seat holds a Nullify), **Crown of Thieves**
    (Jacks and Queens read as Kings).
  - Left out, and why, is written beside each list: the near-duplicates the
    cut named (more sixth cards, cheaper mana, more straights of four), a
    sigil that shares a relic's name (Cold Read), one that repeats a creed
    (Foresight: the Long Now's creed already shows the river), plain numbers,
    hidden penalties a player cannot see coming (The Curse), and a relic that
    never shows when it works (The Sanctum).
- **A reveal, once**, on the run-end screen of the run that opened it: "New
  from your next run. Covens. Pick one on the menu: 6 more beside the
  Unaligned, each with its own sigils, a relic and a rule of its own. 3
  sigils, 3 omens and 4 relics join the deck", with a "Choose a coven" button.
  In the demo it is one shorter line with no button, so "Wishlist on Steam"
  stays whole on screen at 1280x800 (`test/demo.mjs` now checks the button is
  inside the panel's visible box, not only above the fold). "Deal again" from
  that screen deals the later pools too.

Every piece is one switch or one list: `UNLOCK_AFTER_RUNS` (shared/unlock.ts),
`COVENS_UNLOCK` (shared/covens.ts), `UNLOCKED_SIGIL_IDS`, `UNLOCKED_OMEN_IDS`,
`UNLOCKED_RELIC_IDS`. Empty all three lists and set the switch off, and every
run is round 6's.

**Builds:**

- **Full game:** as above.
- **Demo:** the same unlock, after a demo run is finished. The picker offers
  the Unaligned and its three covens (Ashen, Twinned, Unmoored) and shows the
  other three locked with their pitch, which is how the demo always showed
  them; the larger pools are dealt. A demo that shows the second run's choice
  says the game has one. Demo saves do not carry into the full game (its own
  app), so a buyer's first full-game run is the plain one again, on purpose.
- **Playtest:** the full game's behaviour, since the playtest exists to test
  the game as it will ship, plus one question on the feedback screen: "From
  your second run: did the coven you picked change how you played?"

**Persistence, and Steam Cloud.** The count is `profile.totals.runs`, in the
save Steam Cloud already carries; nothing new is stored. A save that cannot
be written (a private window) still opens the next run of the session. Steam
Cloud keeps whichever save has finished a run over one that has not, both
ways, so a second machine's few achievements from an unfinished run cannot
take the covens back, or keep them from arriving (`cloudWins`, tested). The
server only reads a flag the client sends when it opens a table
(`RoomConfig.unlocked`); a table opened without it, by an old client, a test
or the harness, is a first run.

## Vetted before anything came back, and found while building

- **Graft overwrote a card for the rest of the run.** It copied the faces with
  nothing to put them back, so the grafted card stayed a duplicate and its own
  identity left the deck: Mirror's bug from round 6, in a sigil that was not
  live then. It now copies the way Mirror does since d03be97 (the whole card,
  for the hand, "was" shown). Gild always wore off with the hand and now says
  so, and so does Graft; Blight no longer claims the target is not told which
  sigil died (the target can see its own hand). Test fails on 8d1fea7.
- **"Leave table" went to a blank screen**, at the end of every run, on `main`
  today. The engine broadcast the table to the room while the leaving socket
  was still in it, so the client went back to a table with nobody in the
  chair. Found because "Choose a coven" is a way to leave; fixed in the socket
  layer, test fails on the old order.
- **An empty save was one shared object**, and the first run banked on it was
  added to the constant, so "no save" read as a player with runs for the rest
  of the session. Harmless until a run count opened anything.
- **`test/style.mjs` failed at 8d1fea7 whenever a Market was on screen**:
  every shop card's border was a mix off the fourteen colours. Round 6
  recorded the harness as in style; run here on a build of 8d1fea7 it reports
  three palette findings on the Market. Now ink, as a sigil in hand is
  outlined. A second, situational finding (an out seat's "OUT" at 3.04:1 when
  a bot was out at the sweep) now uses the light ink the name beside it
  passes with; no bot was out in the reruns, so that one is fixed by the
  audit's arithmetic, not seen passing.
- **"Nobody Saw It Coming" had no dealt route** since cc8f6ea (only a blank
  page could seal a card). The Sealed Court gives later runs one;
  `test/unlock.test.ts` checks that a later run can seal a card. All 20
  achievements are earnable.
- **Five sigils at the 1024x680 minimum window scroll sideways.** The Loom
  holds five from its first hand (Deep Pockets). The row was designed to
  scroll for a long hand; `test/responsive.mjs` now fails only a card the row
  cannot be scrolled to. Shrinking the cards to fit was tried and rejected:
  the school labels collided and the rail covered the pot.

## Measured

Seeds 0-279, adept bots, Hex I, the aggressive player (round 6's batch).
"Runs 2+" is the same 280 seeds as a player past their first run: the later
pools, the player rotating all seven covens (40 runs each), the bots
Unaligned. The harness's buyer is greedy (it takes the dearest relic it can
afford), so purchase figures are a floor for variety, as before.

| | round 5 (eb6075d) | round 6, and this round's run 1 | this round, runs 2+ |
|---|---|---|---|
| run over before the first Market | 1% | 3% | 3% |
| run over before ante 3 | 5% | 10% | 6% |
| survived 3 antes | 80% | 69% | 77% |
| busted, caught or not, before the first Market | 14% | 20% | 19% |
| an impossible hand in the run | 64% | 57% | 68% |
| ... one of your own | 37% | 35% | 43% |
| impossible hands a run | 1.50 | 1.38 | 1.74 |
| runs won | 91 | 91 | 106 |
| your stack at ante 7 | 21 bb | 29 bb | 26 bb |
| biggest pot in the last 3 hands | 49% | 58% | 49% |
| real choices a minute | 9.5 | 8.9 | 8.3 |
| share of the run that is not your decision | 36% | 44% | 45% |
| a run | 7.4 min | 8.0 min | 8.3 min |
| first Market | 92 s | 100 s | 99 s |
| a real choice of two relics, per run | 3.3 | 2.5 | 3.3 |
| distinct relics bought | 41 of 45 | 12 of 12 | 16 of 16 |
| spread of purchases | 5.09 bits | 3.42 | 3.87 (of 4.00) |
| overlap between two runs' relics | 0.09 | 0.34 | 0.17 |
| ... over what the Market sold (no creed, no coven relic) | | 0.21 | 0.16 |
| a bought relic's rule visibly fired | 60% | 47% | 71% |
| a run owning a mythic | 2.5% (new ones) | 9% | 11% |
| overlap between two runs' omens | | 0.31 | 0.26 |
| distinct sigils cast across runs | | 14 | 22 |

**The first run is round 6's, to the digit.** The run-1 column is this
branch's own batch, not a copy: every line of its 280-run summary matches
round 6's published one except the wall-clock server-stall line (`diff`, both
files in the data folders). At 280 runs a difference under about 4 points is
noise.

**One number is smaller than it looks.** Overlap between two runs' relics
halved, 0.34 to 0.17, but that line counts the creed and the coven's relic,
and in round 6 every run shared one creed. Over what the Market sold, the
shelf alone went 0.21 to 0.16: four more relics on the shelf, not a halving.

**The demo, runs 2+** (seeds 0-139, the Unaligned and the demo's three
covens rotating): reached the "demo ends here" screen 64% (run 1, round 6:
64%), an impossible hand inside the demo 52% (40%), yours 24% (16%), 5.0
minutes (5.1), first Market 106 s (100).

**What a later run meets** (runs 2+): one of the unlocked sigils cast in 89%
of runs, an unlocked omen in force in 56%, an unlocked relic owned in 63%.
Graft, Blight and Gild are each cast in about half of all runs.

**Covens, runs 2+** (40 runs each; at 40 runs a gap under about 11 points is
noise):

| | wins of 40 | final ante | own impossible hand | creed fires a run |
|---|---|---|---|---|
| The Unaligned | 14 | 5.3 | 33% | 2.0 |
| The Unmoored | 13 | 4.8 | 33% | 16.1 |
| The Quiet | 18 | 6.0 | 45% | 10.4 |
| The Long Now | 14 | 6.2 | 50% | 7.2 |
| The Twinned | 17 | 5.9 | 63% | 0.9 |
| The Ashen | 17 | 5.1 | 38% | 2.2 |
| The Loom | 13 | 5.8 | 40% | 0.9 |

Round 5, the last time covens were dealt: wins 6 to 21 of 40, the Twinned
50% own impossible hands, Signature 2.05 a run. Covens apart (mean distance
between two): hands made 0.11 (round 5: 0.14), schools cast 0.26 (0.28).
Each coven casts its own school 35-42% of the time, others 9-20%.

## Re-scored with the same rubric

A separate reviewer was given criteria 4 and 7 word for word, rounds 3 to 6's
evidence and scores as anchors, and this round's numbers, unlabelled as a
build to score, and told to be strict. It gave 7 and 7, the same as below,
and its reasons are folded in.

| # | Criterion | Round 6 | Now | Scored on | Why |
|---|---|---|---|---|---|
| 1 | The run shows itself before it can end | 7 | 7 | run 1 | Run 1 is round 6's: over before the first Market 3%, before ante 3 10%, survived 3 antes 69%. Runs 2+ alone would read 3% / 6% / 77%, busted before the first Market 19% (round 5's 8: 1% / 5% / 80%, 14%): between the two, closer to the 8 on two figures, the same as round 6 on the first Market. The first run decides this one, and it did not change. |
| 2 | The namesake shows up | 8 | 8 | runs 2+, run 1 no lower | Runs 2+: seen in 68% of runs, one of your own 43%, 1.74 a run (round 6: 57%, 35%, 1.38; round 5: 64%, 37%). The best this game has measured, beyond noise. Not 9: 57% of runs still never make one of their own. Run 1 is round 6's 8. |
| 3 | The run arc builds | 7 | 7 | both | Biggest pot in the last three hands 49% (run 1: 58%), 26 bb at ante 7 (29). Round 5's 7 sat at 49%. |
| 4 | Covens play differently and deliver their pitch | 5 | 7 | runs 2+ | There are covens again, and in substance they are round 5's (a 7): the Twinned, pitched as the impossible-hand coven, make their own in 63% of runs, the most of any; each coven casts its own school at about twice anyone else's rate; hands made 0.11 apart, inside round 5's range. Nothing is promised that is not dealt: the store copy says "from your second run", the reveal "from your next run". Not 8: no human has played it (round 5's own gate), two creeds fire under once a run (Kin, Signature: was 2.05), the Unmoored still die first, and the bots staying Unaligned takes a little of round 5's variety off the table. |
| 5 | Little dead time, and the game says what happened | 7 | 7 | both | Says what happened: a bought relic's rule visibly fired in 71% of runs (47%), the rules tab names whose creed it is, the reveal says what is new. Dead time: 45% of a run is not your decision (44%), 8.3 real choices a minute (8.9), a run 8.3 minutes (8.0). One half up a little, one half flat. |
| 6 | The special things show in the first 10 minutes | 9 | 9 | run 1 | Run 1 unchanged: first cast 4 s, first Market 100 s, an impossible hand inside the demo 40%. (A demo player's second run sees one in 52%.) |
| 7 | Builds have depth; relics are more than numbers | 7 | 7 | runs 2+ | The strongest 7 yet, not an 8. Up from round 6 on every measure: overlap between two runs' relics 0.17 (0.34; over what the Market sold alone 0.16, was 0.21, so most of the halving is seven creeds in place of one), spread of purchases 3.87 bits of 4.00 (3.42 of 3.58), a real two-relic choice 3.3 a run (2.5), 16 of 16 bought, 25 distinct relics owned with covens (13), a rule visibly fired 71% (round 5: 60%), a run owning a mythic 10.7%. But depth is what the criterion says first, and the two depth figures the 8s rested on are still far off: overlap 0.17 against rounds 4 and 5's 0.10 and 0.09, and the spread is about 15 relics' worth of variety against 31 and 34. A run draws on 16 sigils and its coven's openers, against 71. |
| 8 | Presentation: art and feel | 7 | 7 | | Untouched. |
| | **Mean** | **7.1 (7)** | **7.4 (7)** | | 59 points; an 8 needs 60. |

## Was the 8 earned?

**No. 7.4, one point short.** The unlock did what round 6 said it would for
criterion 4 (5 to 7), and nothing else moved a whole point. Where it did not
reach:

- **Criterion 1** was named in round 6 as one the unlock would speak to,
  because round 5's covens opened safer than the Unaligned. On runs 2+ it
  partly does (before ante 3 10% to 6%, survived 3 antes 69% to 77%), but busts
  before the first Market did not move (20% to 19%), and the criterion is
  about the first run, which is the Unaligned by design. Scoring it on later
  runs would have been the generous reading; it would not have made it an 8
  anyway.
- **Criterion 7** is capped by the ceiling the cut set: 16 relics cannot get
  the overlap between two runs near 0.10. The reviewer's estimate of what
  would: a later-run shelf of about 24-30 with the rule share and the
  side-by-side choice kept.

The unlock is the only new structure, and it is the one Mason chose; every
card behind it is the game's own, coming back through a list. No new card,
no new rule, no number tuned (Graft's change is a fix to what its card
always said).

## What would earn the 8 (not built: each is Mason's call)

1. **A bigger later-run shelf** (criterion 7), the cut's ceiling raised for
   runs 2+ only: about eight more relics, each from round 5's measured shelf,
   with the same bar (visible, not a duplicate, not a number). This is the
   most direct point left, and it is a design decision the cut said should
   read like one ("the small size is the feature").
2. **The December playtest** (criterion 4): whether people notice and like
   the creeds, and whether "from your second run" reads as a reward or a
   wall. The playtest build now asks.
3. **Creeds that fire**: Kin and Signature fire under once a run (criterion
   4's "not 8"). Kin's reach is one constant (`KIN_BOARD_ONLY`), set by
   measurement in round 4; Signature has none. Changing either is tuning, so
   it waits for the playtest.
4. **An artist** (criterion 8), as before.

## Decisions for Mason

1. **Merge `covens-unlock-2026-10-22`.** It also fixes "Leave table" going to
   a blank screen, which is live on `main` and the web version today.
2. **Bots stay Unaligned in later runs**, as round 6 proposed. The other way
   (each bot draws a coven, as round 5) is one line in `addBot`; it would put
   rulebooks you did not pick back on the table, the thing the cut called
   confusing.
3. **The Daily Rite** plays the day's coven for anyone past their first run,
   and the Unaligned for a first run. Two players at different stages play
   different rites on the same day; the alternative is a Rite that never has
   a coven.
4. **The demo unlocks too** (the Unaligned and three covens open, three locked). The other choice is a
   demo that is always the first run; it would never show the choice the full
   game is selling.

## Three simulated Steam reviews (after round 7)

**The impatient refunder** · 0.9 hrs · Recommended

> First run was plain poker with spells, which was fine, I could follow it.
> When it ended the screen said covens were open and I got to pick one, so I
> took the Twinned and the next run I made a Five of a Kind out of two copies
> of the same card. Leave table took me to a black screen in an older build;
> it goes to the menu now.

**The genre veteran** · 14 hrs · Recommended

> The first run is a tutorial with the training wheels bolted on, then the
> game opens: seven covens, each with a rule that changes how you play (the
> Quiet see a card the first time someone bets, the Ashen burn a rank out of
> every hand). The shelf is still small, sixteen relics, so by run six I had seen
> them all, but the coven changes which ones I want. Better than the build
> people complained about, short of the old one for sheer variety.

**The Deck player** · 6 hrs · Recommended

> With the coven picker on the menu the d-pad still gets everywhere,
> including the Market's Done. The Loom gives you five sigils and all five fit
> on the Deck's screen; in the smallest window on my laptop the fifth one
> scrolls. Typing on the blank page is still the clumsy bit.

## Verdict, round 7

**Fun: 7/10 on the locked rubric (7.4; round 6 7.1, round 5 7.6).** The
covens are back and play differently (criterion 4, 5 to 7), the namesake
shows up more than it ever has, and a first-time player sees exactly the
game the playtest asked for. One point short of an 8: the first run is the
weakest opening by design, and a 16-relic shelf is not round 5's depth.
Every number is from simulated players and one blind reviewer.

**Sellable at $9.99: yes**, on the same conditions as before (no online play
on the store page until Steam invites exist; commissioned capsule art). The
store copy now says both halves: the first run, and what opens after it.

# Round 8 (2026-10-23): a bigger later shelf, and the deal relics speak

Brief: Mason said to work on what makes money, and game calls are delegated
to Claude (2026-10-10). Round 7 named the most direct point left: a later
shelf of about 24-30 relics, kept to the same bar. Round 6 named an
attribution gap nobody had closed. Both are code, both are reversible, and
neither touches the first run's content. Same rubric, same honesty rule.
Branch `relic-shelf-2026-10-23`, from main at 326034a. Raw batch summaries:
`plans/fun-round8-data/`, each naming its commit and command, run from a
pinned worktree so a later edit cannot leak into a running batch.

## The rubric, unchanged

The same eight criteria, word for word, scored on the same runs as round 7:
criteria 1 and 6 on run 1, criteria 4 and 7 on runs 2+, criteria 2, 3 and 5
on runs 2+ unless run 1 is lower. Decided before any batch.

## What changed

**Seven more relics on the later shelf**, 16 to 23, for runs 2+ only
(`UNLOCKED_RELIC_IDS`; the first run's twelve are untouched, and
`test/unlock.test.ts` still checks the first run deals the same cards). The
cut's ceiling of 16 rose to 24 for relics alone (`LATER_RELIC_CEILING`).
Sigils and omens keep 16 and 12. The reason the kinds differ: a player meets
relics by choice, two at a time in the Market, and owns four or five in a
run; sigils and omens are played against you whether you chose them or not.
The player who could not remember 71 sigils still meets 16 of them.

The bar was round 7's: a rule or a sight you can see work, not a number, and
not a rule the shelf, a creed or a live omen already runs. The seven:

| Relic | Rarity | Why it earns a slot |
|---|---|---|
| The Prism Lens | common | Every Prism is Wild for you. Gild, The Prism omen and The Engraver all make Prism cards in a later run, so it is the later game's own combo. |
| Heirloom | common | A card scores a rank higher for each pot it has won. The Twinned's relic, sold to everyone else; 3.9 visible firings a run in round 5. |
| The Second River | common | A High Card river runs again, in front of the table. |
| The Engraver | rare | Win a showdown and a card of your hand is Prism, for good, on the shared deck. |
| Mirror Shard | rare | Read both faces of every undecided card. Superpose, Entropy Rising, the Unmoored's creed and Unstable Isotope all make them. |
| The Lodestone | mythic | A rank drawn in front of the table, Wild for you that hand. |
| The Usurper | mythic | Knock a player out and take their relics. |

Left out, and why (also beside the list in `shared/relics.ts`):

- **A live omen already runs the rule**: Smeared Ink (Blurred), Ouroboros
  (Serpent), Reversal (Inversion), Crowned (The Sealed Court).
- **The Ledger does nothing.** "You see every opponent's exact mana", but
  every seat's mana is already on the table for everyone
  (`server/game/table.ts`, `viewFor`: `mana: isYou || seesMana || p.isBot ?
  p.mana : p.mana`, the same value on both branches). Not on any shelf, so
  nobody pays for it today; recorded here so it is not put back as it is.
- **The Informant** is Cold Read's job, at the river.
- **The hole-card family again**: Bloodline, Gilded Thumb, Twin Suns,
  Unsettled (round 7's rule).
- **Two shelf relics glued together**: The Archive, The Long Game.
- **Numbers**: everything else.

That is seven, not round 7's "about eight": an eighth would have had to break
the bar.

**Every relic that marks a hole card now applies.** Found reading the deal:
it applied only the first such relic (`.find(Boolean)`), so a player who owned
Gilt Edge and then bought Wild Inheritance, a 20-shard mythic, got nothing
for it. Both are on the first run's shelf, so this was live in every run.
Each marking relic now takes its own hole card, in the order bought
(`test/relics.test.ts`; fails on 326034a with "Wild Inheritance marked no
card").

**The relics that act at the deal say when they mattered** (round 6's third
proposal, `STEAM-READY.md` row 44). The deal records what each one shaped
(`t.relicDeals`), and a contested showdown reads each hand again without it.
A ledger line, tagged with the relic so the rail flashes it, is written only
when the hand reads differently:

- Gilt Edge, Wild Inheritance: "Hero's Wild Inheritance: 2♣ played as
  whatever the hand needed, in Four of a Kind."
- Third Hand: "the extra hole card played, in Three of a Kind."
- Unstable Isotope, which is a coin (every undecided card lands at random at
  the showdown): "the undecided 2♣ landed as A♣, and it played", or "...and
  the hand reads worse for it". Landing on the card as dealt says nothing.

A relic that changed nothing says nothing, which is the answer to round 6's
worry about noise. Cold Read is left as it was: what it shows is on the
table, face up, from the deal.

**Proved, not assumed: the new lines change no play.** On seeds 0-27 of the
first run, this branch with only the mark fix reverted plays every run
exactly as main (326034a) does: 28 of 28 identical, every field but the
firing counters and the wall clock (`samerun` over both parts folders). With
the fix in, 4 of the 28 differ, each a table where some seat owned two
marking relics. So the first run below is round 7's game plus the fix,
nothing else.

**The Market holds the longest card the shelf can print.** The new rules are
the longest any shelf relic has had (The Second River 113 characters; the
longest before was The Blood Price at 99). `test/shoptext.mjs` plays to the
first Market of a later run at 1024x680, 1280x800 and 1920x1080, prints the
shelf's longest name, longest rule and longest italic line onto every card at
once (a card worse than any real one), and checks nothing is clipped, nothing
runs past its card or off the screen, and Done can be reached.

## Measured

Seeds 0-279, adept bots, Hex I, the aggressive player, as round 7. "Runs 2+"
is the later run: the later pools, the player rotating all seven covens (40
runs each), the bots Unaligned.

| | round 7, runs 2+ | this round, runs 2+ | this round, run 1 (round 7's) |
|---|---|---|---|
| run over before the first Market | 3% | 3% | 3% (3%) |
| run over before ante 3 | 6% | 6% | 10% (10%) |
| survived 3 antes | 77% | 77% | 68% (69%) |
| busted, caught or not, before the first Market | 19% | 19% | 20% (20%) |
| an impossible hand in the run | 68% | 65% | 58% (57%) |
| ... one of your own | 43% | 40% | 36% (35%) |
| impossible hands a run | 1.74 | 1.99 | 1.63 (1.38) |
| runs won | 106 | 102 | 90 (91) |
| your stack at ante 7 | 26 bb | 27 bb | 29 bb (29) |
| biggest pot in the last 3 hands | 49% | 53% | 57% (58%) |
| real choices a minute | 8.3 | 8.1 | 8.8 (8.9) |
| share of the run that is not your decision | 45% | 45% | 43% (44%) |
| a run | 8.3 min | 8.3 min | 8.0 min (8.0) |
| first Market | 99 s | 98 s | 100 s (100) |
| a real choice of two relics, per run | 3.3 | 3.2 | 2.5 (2.5) |
| distinct relics bought | 16 of 16 | 23 of 23 | 12 of 12 |
| spread of purchases | 3.87 bits (of 4.00) | 4.29 (of 4.52) | 3.42 (3.42) |
| overlap between two runs' relics | 0.17 | 0.14 | 0.34 (0.34) |
| ... over what the Market sold | 0.16 | 0.11 | 0.21 (0.21) |
| distinct relics owned, covens' included | 25 | 31 | 13 (13) |
| a bought relic's rule visibly fired | 71% | 73% | 59% (47%) |
| ... counted as round 7 counted it (`scripts/fun-fired.cjs`) | 71% | 68% | 47% (47%) |
| a run owning a mythic | 11% | 7% | 10% (9%) |

At 280 runs a difference under about 4 points is noise. The impossible-hand
lines moved 3 points each, down on runs 2+ and up on run 1: noise both ways.
Impossible hands a run is a mean that a few runs past ante 15 can carry (run 1
had eight runs reach ante 17 this time), so it is not read as a change.

**Two numbers went the wrong way, and both are the price of the change.**

- **A run owning a mythic, 11% to 7%.** Four mythics now share what the
  Market's mythic draws used to split two ways, and the two new ones cost 22
  and 24 shards against a greedy buyer that rarely holds that much: The
  Lodestone was bought in 10 runs, The Usurper in 4, Twice-Told in 3 (was 10).
  On the edge of noise, and the mythics that are bought fire loudly (The
  Lodestone 9.8 lines a run in the runs that own it).
- **Visibly fired, counted as round 7 counted it, 71% to 68%.** Seven
  relics joined, and two of them seldom fire in this harness: The Second River
  (0.12 a run: the simulated player is rarely still in at the river with High
  Card) and Mirror Shard, which shows information and never writes a line.

**What the new relics do in a later run**: The Prism Lens was owned in 93
runs, the most of any new relic, and is the relic the Long Now and the
Twinned buy most; Heirloom 4.2 firings a run, The Engraver 2.1, The
Lodestone 9.8. The Usurper was owned in 4 runs and never fired: a knockout
by its owner is rare against three bots. The deal relics' new lines, later runs: Wild Inheritance 2.7 a
run, Unstable Isotope 1.9, Gilt Edge 1.1, Third Hand 0.5.

## Re-scored with the same rubric

A separate reviewer was given criterion 7 word for word, rounds 3 to 7's
evidence and scores as anchors, and this round's numbers unlabelled, with
both counts of the firing figure, and told to be strict. It gave 7: "the
strongest 7 so far, not yet an 8", with the reasons folded in below.

| # | Criterion | Round 7 | Now | Scored on | Why |
|---|---|---|---|---|---|
| 1 | The run shows itself before it can end | 7 | 7 | run 1 | Run 1 is round 7's: 3% / 10% / 68%, busted before the first Market 20%. |
| 2 | The namesake shows up | 8 | 8 | runs 2+, run 1 no lower | Runs 2+ 65% / 40%, 1.99 a run; run 1 58% / 36%. Inside noise of round 7 both ways. |
| 3 | The run arc builds | 7 | 7 | both | Biggest pot in the last three hands 53% (49%), 27 bb at ante 7. Up, not a point. |
| 4 | Covens play differently and deliver their pitch | 7 | 7 | runs 2+ | Untouched: hands made 0.13 apart (0.11), schools 0.27 (0.26). |
| 5 | Little dead time, and the game says what happened | 7 | 7 | both | Says what happened, up again: on the first run a bought relic now visibly fires in 59% of runs (47%), because five of its twelve relics act at the deal and now say so. Dead time flat: 45% of a run is not your decision (43% on run 1), 8.1 choices a minute. Round 5's "not 8" still stands. |
| 6 | The special things show in the first 10 minutes | 9 | 9 | run 1 | Untouched. |
| 7 | Builds have depth; relics are more than numbers | 7 | 7 | runs 2+ | The strongest 7 yet. More than numbers: 21 of the shelf's 23 change a rule or show something, 7% of purchases are numbers, all 23 are bought, the side-by-side choice holds at 3.2. Depth closed about half the gap and no more: overlap 0.14 (round 7 0.17; the 8s 0.10 and 0.09; Market-sold alone 0.11), spread 4.29 bits, about 20 relics' worth (15; the 8s 31 and 34), and that spread is already 95% of what a 23-relic shelf allows, so the shelf's size is now the limit. Against it: mythics owned 7% (11%), firing 68% counted the old way (71%). |
| 8 | Presentation: art and feel | 7 | 7 | | Untouched. |
| | **Mean** | **7.4 (7)** | **7.4 (7)** | | 59 points; an 8 needs 60. |

## Was the 8 earned?

**No. 7.4, one point short, as round 7.** Criterion 7 moved as far as
seven honest relics move it, and the reviewer and this review agree it is
not a whole point: the depth figures the 8s rested on came from a 45-relic
shelf, and a 23-relic shelf cannot reach them. Its estimate of what would:
a later shelf of about 28-30 or a wider sigil pool, enough for a spread of
4.6 bits and an overlap of 0.11 or lower, with numbers under 10% of what a
run buys and firing at 70% or more.

The shelf was not padded to get there. The relics left could only be added
by breaking round 7's bar (a rule a live omen already runs, the hole-card
family again, two relics glued together, or a number), which is the "shitty
mechanics" the brief rules out. A 28-relic shelf needs new relics, written
and measured, or the sigil pool reopened by one school at a time: both are
content design that the December playtest should steer.

## What round 8 is worth anyway

- **A mythic that did nothing now works.** Wild Inheritance bought beside
  Gilt Edge, on any run, first or later: 4 of 28 first runs were changed by
  it, so this was common, and a player who paid 20 shards for a relic that
  never acts is a refund reason on its own.
- **The game says when its quietest relics win.** Five of the first run's
  twelve relics acted with no word; now the ledger and the rail say when one
  of them changed the hand.
- **Later runs differ more**: two runs share 0.11 of what the Market sold
  them (0.16), and 23 relics are all bought.

## Decisions made (each reversible)

1. **The later shelf is 23** (`UNLOCKED_RELIC_IDS`; `LATER_RELIC_CEILING` 24).
   Delete the seven round-8 lines to put round 7's sixteen back.
2. **The relic ceiling rises for later runs only; sigils and omens keep 16
   and 12.** The reason is above: relics are met by choice.
3. **A deal relic's line is written only when it changed the hand.** The
   other way, a line every hand it acts, is the noise round 6 worried about.

## Three simulated Steam reviews (after round 8)

**The impatient refunder** · 1.1 hrs · Recommended

> Plain poker with spells for one run, then covens. I bought the wild card
> relic on top of the one that makes a card worth more and the log told me
> the wild card made my four of a kind. Did not know the game was tracking
> that.

**The genre veteran** · 18 hrs · Recommended

> Twenty-odd relics once you are past the first run, and they are rules, not
> +1s: a rank that turns wild every hand, Prism cards that go wild if you
> hold the Lens, a river that reruns when you whiff. By run eight I was
> still seeing new pairs. Fewer runs than the old 45-relic build before it
> repeats itself, and the expensive mythics are hard to afford.

**The Deck player** · 7 hrs · Recommended

> Market cards stay readable on the Deck even with the long ones. The d-pad
> gets everywhere. Typing on the blank page is still the clumsy bit.

## Verdict, round 8

**Fun: 7/10 on the locked rubric (7.4, as round 7).** Criterion 7 is the
strongest 7 the game has had, and the shelf's size, not its contents, is now
what holds it there. One paying player's bug is gone (a 20-shard mythic that
did nothing), and the quietest relics now say when they won. Every number is
from simulated players and one blind reviewer.

**Sellable at $9.99: yes**, on the same conditions as before.

# Round 9 (2026-10-23): seven new relics, written for the later game

Brief: Mason said to work on what makes money, and game calls are delegated
to Claude (2026-10-10). Round 8's blind reviewer put the next point at a
later shelf of about 28-30 relics or a wider sigil pool: a spread of 4.6 bits
or more and an overlap of 0.11 or less, with numbers under 10% of what a run
buys, a side-by-side choice 3 or more times a run, and firing at 70% or more
counted the old way. Round 8 also found that every relic left in the
registry fails round 7's bar, so this round writes new ones. Same rubric,
same honesty rule. Branch `relics-r9-2026-10-23`, from `main` at 379c617.
Raw batch summaries and probes: `plans/fun-round9-data/`, each naming its
commit and command; every batch ran from a pinned worktree.

## The rubric, unchanged

The same eight criteria, word for word, scored on the same runs as rounds 7
and 8: criteria 1 and 6 on run 1, criteria 4 and 7 on runs 2+, criteria 2, 3
and 5 on runs 2+ unless run 1 is lower. Decided before any batch.

## What changed

**Seven new relics on the later shelf**, 23 to 30, for runs 2+ only
(`UNLOCKED_RELIC_IDS`; `LATER_RELIC_CEILING` 24 to 30). The first run's
twelve are the same objects (`test/unlock.test.ts`), and a Hex II bot still
equips from the first run's 45 (`NINTH_RELIC_IDS`). The bar is round 7's,
unchanged: a rule you can watch work, which the ledger names when it acts (a
line tagged with the relic, so the rail flashes it) or which changes the
showdown's read; not a number; not a hidden penalty; not a rule the shelf, a
creed or a live omen already runs. Each engine rule is one `RuleId`, read
where the comment beside it says (`shared/relics.ts`). Each has its own
drawing in the set's grammar (`src/art/marks.tsx`): a headless render
checked all seven at 96 and 16 pixels, and the later Codex shows each one
drawn rather than as a fallback glyph (`test/render.test.tsx`). Tests:
`test/ninth.test.ts`, one or more per relic, each holding it to its card and
to its ledger line.

| Relic | Rarity | The rule | Why it earns a slot |
|---|---|---|---|
| The Witness | common, 9 | At the showdown, every undecided community card settles on the face that helps you most. | The board's undecided cards were a coin. Superpose, Entropy Rising, the Unmoored's creed and Mirror Shard all put them there; this is the one thing that decides them. It says nothing when every face reads the same for its owner. Observer Effect and Decohere, which also settle cards on purpose, are in no pool. |
| The Ember Jar | rare, 14 | When a community card burns, it does not vanish: it comes to your hand for the rest of the hand. | Burn, The Kindling and Salt only ever took cards away. This puts a burned card to use, and it is a theft the table watches. It is still burned: it never comes back to the deck. Ashes, the one card that un-burns, is in no pool. |
| Indelible Ink | common, 9 | The Wild your Wild Rite writes, and the Prism your Gild writes, stay on the card for good. The deck is shared. | MTG's "until end of turn" against "permanently". The Loom writes on the deck, and its two writing sigils faded with the hand; under its creed the ink works for its writer alone. Not the Engraver: that one writes a Prism the rule picks, when you win; this keeps what you chose to write, when you cast. |
| Twofold | rare, 15 | Every card that is Wild for you counts as two of the same card: a pair and a Wild is four of a kind. | The later game is full of Wild cards (The Gilded in 81% of later runs, Wild Inheritance, Wild Rite, the Lodestone, the Prism Lens, Kin). Three and a Wild is five of a kind: the namesake. Nothing reads a card twice today. |
| The High Spade | rare, 13 | Lose a showdown holding the highest Spade in anyone's hole and half the pot is yours. Wild and Prism count. | Chicago, the home game where the high Spade in the hole splits the pot: a second way to be paid, read off a card the hand may not even use. A Prism is a Spade of its rank, a Wild the Ace. Nothing on the shelf pays a losing hand. |
| The Changeling | rare, 13 | Each hand, one relic a random opponent holds is yours too, for that hand. The table sees which. | Balatro's Blueprint, at a table where everyone shops: your build is partly theirs, a different part every hand, and the ledger names it. Never a creed, never one you hold, never one that only pays between antes. The Usurper takes a loser's relics for good on a knockout; this lends one for a hand. |
| The Grimoire | common, 8 | A sigil you wrote on a blank page is not spent when you cast it: it comes back to your hand when the hand ends. | The blank page is the game's own invention, and a written sigil was spent once. MTG's buyback: the page you wrote is a spell you keep. Printed sigils are spent as ever. |

Written and turned down by the same bar:

- **Deuces Wild, Follow the Queen** (a rank Wild for you, fixed or set by the
  board): the Lodestone's rule with another trigger.
- **Both faces at once** (an undecided card plays as both its faces):
  Twofold's verb on another kind of card.
- **The Lightning Rod** (a Wild on the board trades places with your lowest
  hole card): the Ember Jar's verb, a board card into your hand.
- **The Rebound** (a countered sigil of yours comes back): it and the Magpie
  would both claim one countered card "instead of vanishing".
- **Short Deck** (your flush beats a full house): your full house then loses
  to an ordinary flush, a penalty dressed as a rule.
- **A mulligan** (trash hole cards dealt again): the Second River's rule,
  before the flop.
- **Rabbit hunting** (see the board you folded from): information that
  changes nothing.

**Twofold was rewritten after the first batch.** Its first version gave a
doubled Wild a second place with a face of its own, so one Wild could fill
two gaps in a straight. It also made a hand holding one Wild about eleven
times as dear to read (10.9x under the bots' rollout cap), and every bot
reads the owner's hand in every equity rollout. Now the Wild stands twice
wearing one face (`twofoldPlans` in `shared/hand.ts`): one Wild reads at
1.6x the plain cost, two at 2.5x (`plans/fun-round9-data/probes.txt`;
`test/ninth.test.ts` holds the reading count under 3x). The card says "two
of the same card". The numbers below are the shipped version's (a79b04d);
the first version's batch (adc23c6) is in the data folder, and no figure in
the table below differs between the two by more than noise.

## Found and fixed while building

- **The Burn sigil's ledger line named the card after it had left the
  board**: "Quill burns a card in the deck out of the board", and "K♠ in the
  deck" to the seats allowed to see the face, on every Burn since 80a1a4d,
  first run included. The card is now named while it is still on the board:
  "Quill burns K♠ out of the board." Text only; the run-1 batch is identical.
- **A card kept under the Keepsake is dealt back whether or not the Keepsake
  is still held.** Only the Keepsake sets a kept card, so a first run plays
  as before; without this a Changeling that wore the Keepsake for one hand
  kept a card and never gave it back.
- **The Usurper beside the Changeling**: a relic the loser had only borrowed
  is not the Usurper's to take, and a relic the Usurper had borrowed from the
  loser becomes its own.
- **The Ember Jar and Salt**: the Ashen's creed strikes a burned card's rank
  from every hand, the Jar's included. The Jar's line now says so ("catches
  K♠, but Kings are struck from every hand") instead of promising a card
  that cannot play.

**Proved, not assumed: the first run is round 8's.** Seeds 0-279 of the
first run at adc23c6, against round 8's own first-run parts (d1e664e): 280
of 280 runs identical, every field but the firing counters and the wall
clock (`scripts/samerun.cjs`). The final commit changes only Twofold's
reading and the Jar's line, neither reachable on a first run, and a 14-run
spot check at a79b04d is 14 of 14 identical too.

## Measured

Seeds 0-279, adept bots, Hex I, the aggressive player, as rounds 7 and 8.
"Runs 2+" is the later run: the later pools, the player rotating all seven
covens (40 runs each), the bots Unaligned. The harness's buyer is greedy (it
takes the dearest relic it can afford), so purchase figures are a floor for
variety, as before.

| | round 8, runs 2+ | this round, runs 2+ | run 1 (round 8's, 280 of 280 identical) |
|---|---|---|---|
| run over before the first Market | 3% | 3% | 3% |
| run over before ante 3 | 6% | 7% | 10% |
| survived 3 antes | 77% | 75% | 68% |
| busted, caught or not, before the first Market | 19% | 19% | 20% |
| an impossible hand in the run | 65% | 65% | 58% |
| ... one of your own | 40% | 40% | 36% |
| impossible hands a run | 1.99 | 2.21 | 1.63 |
| runs won | 102 | 109 | 90 |
| your stack at ante 7 | 27 bb | 28 bb | 29 bb |
| biggest pot in the last 3 hands | 53% | 55% | 57% |
| real choices a minute | 8.1 | 8.2 | 8.8 |
| share of the run that is not your decision | 45% | 45% | 43% |
| a run | 8.3 min | 8.4 min | 8.0 min |
| first Market | 98 s | 99 s | 100 s |
| a real choice of two relics, per run | 3.2 | 3.4 | 2.5 |
| distinct relics bought | 23 of 23 | 30 of 30 | 12 of 12 |
| spread of purchases | 4.29 bits (of 4.52) | 4.71 (of 4.91) | 3.42 |
| overlap between two runs' relics | 0.14 | 0.11 | 0.34 |
| ... over what the Market sold | 0.11 | 0.08 | 0.21 |
| numbers, share of what was bought | 7.0% | 4.0% | 17% |
| distinct relics owned, covens' included | 31 | 38 | 13 |
| a bought relic's rule visibly fired | 73% | 75% | 59% |
| ... counted as round 7 counted it (`scripts/fun-fired.cjs`) | 68% | 72% | 47% |
| ... and without the Changeling's own lines | | 70% | |
| a run owning a mythic | 7% | 9% | 10% |
| covens apart: hands made, schools cast | 0.13, 0.27 | 0.15, 0.26 | |

At 280 runs a difference under about 4 points is noise. Every target the
round 8 reviewer named is met, two of them narrowly: spread 4.71 (4.6),
overlap 0.11 (0.11 or lower, so exactly), numbers 4.0% of purchases (under
10%), the side-by-side choice 3.4 a run (3), and firing 72% the old way
(70%), or 70% with the Changeling's per-hand line taken out as well. The first version of
Twofold measured 4.72 bits, 0.11 and 0.09, 3.6 choices a run, 3.8% numbers
and 72%.

**What the seven do in a later run** (owned-runs; ledger lines a run; share
of owning runs in which it acted at least once): Indelible Ink 76, 1.45,
66%; The Witness 67, 0.76, 39%; The Grimoire 44, 2.61, 43%; The High Spade
43, 0.53, 33%; The Changeling 41, 11.5, 100% (one line every hand, naming
the relic it wears); The Ember Jar 38, 2.08, 79%; Twofold 38, 1.03, 55%. For
comparison on the same shelf: The Magpie fires in 19% of the runs that own
it, The Second River in 4%, Mirror Shard never writes a line.

**One number is smaller than it looks.** Numbers are 4.0% of what the Market
sold, but Leyline and Deep Pockets are also the Long Now's and the Loom's
starting relics, so they are about 9% of what runs end up holding.

**One coven did worse, and it is not only the new shelf's fault.** The Ashen
won 9 of 40 (round 8: 15), the fewest; every other coven won as often or
more (Unaligned 11, Unmoored 18, Quiet 20, Long Now 12, Twinned 17, Loom 22).
At 40 runs one standard deviation is about 3 wins. The same 40 seeds with
the Ember Jar cut from the shelf won 12; the Ashen runs that owned the Jar
won 4 of 8. So the Jar costs the Ashen something, mostly as a relic their
opponents hold (replaying the first version's 40 Ashen runs, 5 had a bot's
Jar catch a card, and none was won), and the rest is the bigger shelf
itself: the Keepsake, the relic round 7 brought back for the Ashen, is the
cheapest on it and the greedy buyer takes it least. Round 5 scored covens 7 with wins of 6 to 21 of
40, so the spread is not new; it is the one thing in this round to watch in
the playtest.

**Engine time is the same a hand.** The batches' "engine wall time" moves
with the machine's load (the identical first run measured 31 s a run today,
21 s on round 8's day), so round 8 and round 9 were run side by side on the
same seeds at the same time: 2.03 s of engine time a hand against round 8's
2.16, the worst tick a run 1.0 s against 0.8 s, on runs 24% longer
(`probes.txt`).

## Re-scored with the same rubric

Two separate reviewers, each fresh, were given criterion 7 word for word,
rounds 3 to 8's evidence and scores as anchors, this round's numbers
unlabelled (the first on the first version's batch, the second on the
shipped one), the full later shelf as its cards print it, the live omens,
sigils and creeds to judge duplicates against, and both firing counts, and
told to be strict. Both gave 8: "a narrow 8: the thinnest of the three 8s on
depth, and the strongest of any round on more than numbers", and "an 8, but
less sturdy than round 5's". Their reasons are folded in below.

| # | Criterion | Round 8 | Now | Scored on | Why |
|---|---|---|---|---|---|
| 1 | The run shows itself before it can end | 7 | 7 | run 1 | Run 1 is round 8's, 280 of 280 runs identical: 3% / 10% / 68%, busted before the first Market 20%. |
| 2 | The namesake shows up | 8 | 8 | runs 2+, run 1 no lower | Runs 2+ 65% / 40%, 2.21 a run (65% / 40%, 1.99); run 1 58% / 36%. Not 9: 60% of later runs still never make one of their own. |
| 3 | The run arc builds | 7 | 7 | both | Biggest pot in the last three hands 55% (53%), 28 bb at ante 7 (27); run 1 57%, 29 bb. |
| 4 | Covens play differently and deliver their pitch | 7 | 7 | runs 2+ | Hands made 0.15 apart (0.13), schools cast 0.26 (0.27), each coven casts its own school at about twice anyone else's rate. Not 8, for round 7's reasons (no human has played it, Kin fires under once a run and Signature about twice, the Unmoored still die first, ante 4.5) and one more: the Ashen won 9 of 40, partly to the Ember Jar. Not 6: round 5's 7 had a wider spread of wins. |
| 5 | Little dead time, and the game says what happened | 7 | 7 | both | Says what happened: a bought relic visibly fires in 75% of later runs (73%), and every new relic names itself when it acts, including the Ember Jar when Salt has made its catch worthless. Dead time flat: 45% of a run is not your decision, 8.2 choices a minute, 8.4 minutes. |
| 6 | The special things show in the first 10 minutes | 9 | 9 | run 1 | Untouched: run 1 identical. |
| 7 | Builds have depth; relics are more than numbers | 7 | 8 | runs 2+ | The two depth figures the 8s rested on have mostly caught up: overlap 0.11 against 0.10 and 0.09, 0.08 over what the Market sold (the fair comparison, since rounds 4 and 5 had no creed or starting relic in the count), and spread about 26 relics' worth, 96% of what a 30-relic shelf allows, so round 8's "the shelf's size is now the limit" is answered. More than numbers, ahead of both 8s on two of three counts: 4% of purchases are numbers and 84% rules (round 4: 86% rules, the rest numbers and information), a rule visibly fires in 72% of runs counted their way (54%, 60%), 70% without the Changeling's announcements, and a real two-relic choice comes 3.4 times a run (3.3). The rules now cross the covens: Twofold, the Prism Lens, the Engraver and Indelible Ink with Wild Rite, Gild and Signature; Unstable Isotope, the Witness and Mirror Shard with Many Futures; the Ember Jar against Salt; the Grimoire with the blank page. Not 9: spread still trails the 45-relic builds by 5 to 8 relics' worth and the sigil pool is 16 against 71; three of the four mythics barely show (the Usurper, the Lodestone, Twice-Told in 3, 3 and 2 runs of 280), the fault that kept round 4 from a 9; a greedy buyer cannot show that a player can steer into an engine. Both reviewers named the weak relics on the shelf, all older than this round: the Second River (fires in 4% of the runs that own it), Gilt Edge (a rank on one card), Third Hand (an omen made private), Mirror Shard (never writes a line). They are why this is a thin 8, and neither reviewer thought they made it a 7. |
| 8 | Presentation: art and feel | 7 | 7 | | Untouched; seven new drawings in the set's own grammar. |
| | **Mean** | **7.4 (7)** | **7.5 (8)** | | 60 points; an 8 needs 60. |

## Was the 8 earned?

**Yes, by the narrowest margin the rubric allows: 60 points, a mean of 7.5,
rounded half up to 8.** It rests on one criterion moving one point, 7 to 8,
on numbers that meet every target the last reviewer set and on two strict
blind reads that agree. Nothing was redefined, nothing was tuned, and no
rule was added that the bar would have turned down: the seven relics are
new, each does one thing no card, creed or omen does, and each says so when
it acts. Every other criterion holds where round 8 left it, run 1 to the
digit.

It is the thinnest 8 this game has had, and it should be read as one:

- **Every number is simulated.** No human has played a later run. The
  December playtest decides whether thirty relics read as a deeper Market
  or as a longer list, and whether the Changeling's line every hand reads as
  a story or as noise.
- **One criterion carries it.** If the playtest takes criterion 7 back to 7,
  the game is 7.4 again; if it lifts criterion 4 (covens) or 5 (dead time),
  the 8 gets a second leg.
- **Three of four mythics are nearly never bought** by a buyer that rarely
  holds 22-26 shards. That is a price question, and prices wait for the
  playtest.
- **The Ashen** won 9 of 40, the fewest of any coven. Watch it.

## Decisions made (each reversible)

1. **The later shelf is 30** (`UNLOCKED_RELIC_IDS`; `LATER_RELIC_CEILING`
   30). Delete the seven round-9 lines to put round 8's 23 back.
2. **Bots buy the new relics too.** A bot's Ember Jar can catch what you
   burn, and a bot's High Spade can take half a pot you win; each says so in
   the ledger, and the relic sits on the bot's seat. The other way, the seven
   sold to the player only, would make them the only relics the table cannot
   hold.
3. **Twofold is two of the same card**, not two cards (above).
4. **Salt still strikes a rank the Ember Jar caught**, and the Jar says so.
   Sparing the Jar's card would be a special case in the Ashen's creed; the
   playtest can say whether Ashen players want it.

## Three simulated Steam reviews (after round 9)

**The impatient refunder** · 1.2 hrs · Recommended

> First run was plain poker with spells. Second run I took the Twinned and
> bought a relic called Twofold, and a Wild card counted as two of the same
> card, so my pair of nines and a Wild was four nines. The log said so,
> which is good because I would not have believed it.

**The genre veteran** · 21 hrs · Recommended

> Thirty relics past the first run and nearly all of them are rules. The
> good ones talk to each other: Indelible Ink makes your Wild Rites
> permanent, Twofold doubles every Wild, and a bot with the Changeling spent
> a hand wearing my Lens. The High Spade is a nod to Chicago that changes
> which junk hands you call with. The expensive mythics are still a
> lottery, and a couple of the old relics (the river rerun) almost never do
> anything.

**The Deck player** · 8 hrs · Recommended

> Market cards still fit on the Deck. The new relic icons read at a glance,
> the d-pad gets everywhere, and typing on the blank page is still the clumsy
> bit, which matters more now that a relic makes written sigils come back.

## Verdict, round 9

**Fun: 8/10 on the locked rubric (7.5; round 8 7.4).** Seven relics written
for the later game took criterion 7 from 7 to 8: two runs now share about a
tenth of their relics, the Market sells about 26 relics' worth of variety,
and 96% of what a run buys is a rule or a sight. It is the thinnest 8 the
rubric allows, it rests on one criterion and on simulated players, and the
December playtest should be read as the test of it. The first run is round
8's, to the digit.

**Sellable at $9.99: yes**, on the same conditions as before.
