# HEXHOLD: Steam store page draft

Drafted 2026-10-09 from `market/hexhold-store-copy.md`. **Rewritten 2026-10-22
against the game as it now is**: on 2026-10-17 (cc8f6ea) the live content was
cut to a pool of 13 sigils, 9 omens and 12 relics, and the coven picker was
turned off (`COVEN_CHOICE` in `shared/covens.ts`), after two people playing the
hosted build could not say what a single omen did. The old copy sold 71
spells, 41 omens, 45 relics, seven covens, Sealed Rank and "every King is dealt
face down", none of which a player can now be dealt. Every claim below is
checked against `POOL_IDS` (`shared/sigils.ts`), `OMEN_POOL_IDS`
(`shared/omens.ts`), `RELIC_POOL_IDS` (`shared/relics.ts`), `shared/hexes.ts`
and `server/game/shop.ts`. If a pool changes, the counts here change with it.

## Short description (264 characters, limit 300)

> Texas Hold'em where a card on the board can show you one face and your rivals another, and both readings score. Cast spells mid-hand, counter theirs, buy relics, survive omens that rewrite the rules for good, and chase Five of a Kind: a hand no real deck can make.

Still true: Divergence is in the pool, and so are the omens, relics and the
three impossible hands.

## Tagline (46 characters, limit 60): for copy, ads and events, never on capsule art

> Texas Hold'em with a deck that breaks physics.

## About This Game (Steam BBCode)

```
[b]A card on the board shows you one face and shows everyone else another, and both readings score.[/b] That is Divergence, one of the thirteen sigils in HEXHOLD: Texas Hold'em played with a deck that does not obey physics.

Underneath, it is plain Hold'em: two hole cards, five on the board, best hand wins. Then mana arrives every street, and on your turn you can cast.

[h2]Spells that break the deck[/h2]
[list]
[*][b]Superpose[/b] a card into two cards at once. It stays undecided until showdown, then settles on whichever face helps its holder most.
[*][b]Rewind[/b] the newest community card and deal a different one.
[*][b]Mirror[/b] one community card onto another, marks and all. For one hand the deck holds two of the same card.
[*][b]Nullify[/b] a spell on the stack. The last spell cast resolves first, so a counter eats what it answers, and every seat always has one to hand.
[/list]

[h2]A rulebook nobody wrote[/h2]
From the second ante, every new ante brings an omen that lands and never leaves. Suits merge. A sixth community card is dealt every hand. Five cards in the deck quietly turn Wild, and nobody is told which. Later, a rank leaves the game for good, and the omen that lands can make the worst hand win every pot. They stack.

[h2]Hands a real deck can't make[/h2]
Above the Straight Flush sit [b]Five of a Kind[/b], [b]Flush House[/b] and [b]Flush Five[/b]. Wild, mirrored and undecided cards make them reachable.

[h2]Write your own spells[/h2]
Every Market has a blank page. Type a spell in plain English, like "burn the river and read the chip leader's cards", and it becomes a sigil in your hand, priced by what it does, not how you word it. A rules parser reads it, not an AI.

[h2]Build the run[/h2]
Two relics on the Market's shelf, and you take one: straights of four cards, a hole card that is any card you need, a first spell each hand that resolves twice.

Or buy a rite, and write a permanent mark onto one exact card in the deck everyone draws from. The upgrade you paid for can turn up in an opponent's hand.

Climb five hexes, each one harder than the last, or play the Daily Rite: one seeded run a day, the same for everyone.

Play solo against bots at three difficulties, or host a table on your local network.

Contains flashing light effects. Settings, Video, Reduce flashing turns off screen flashes, colour splits and screen shake; it is on by default when your system asks for reduced motion.
```

Checked 2026-10-22: Superpose, Rewind, Mirror, Nullify and Divergence are in
`POOL_IDS`; Mirror's "marks and all, for one hand" is true from d03be97 (before
it, the sigil copied the face only and the copy never reverted). "Every seat
always has one to hand" is the Unaligned creed every seat now plays, The Last
Word (a Nullify comes to you at the start of a hand you begin without one).
Omens: Blurred, The Flood and The Gilded can land from ante 2, The Unmade from
4, The Inversion from 5. Relics: The Ladder, Wild Inheritance, Twice-Told.
"Climb five hexes" is `MAX_HEX`; the Daily Rite is `shared/hexes.ts`. Casting
happens in your own betting window since d6161e7 ("on your turn").

Keep multiplayer wording to "host a table on your local network" until Steam
lobbies exist (NEXT.md): nobody has played HEXHOLD against another human over
Steam, because there is no Steam networking yet.

**Photosensitivity line**: now the last paragraph of About This Game above.
(True as of 2026-10-09: `src/vfx/VfxLayer.tsx` checks it for all three.)

## Feature bullets

- 13 sigils across six schools: superposition, secrecy, time, binding, ruin, and rewriting the deck itself.
- A real spell stack: anyone holding a counterspell can answer, the last spell cast resolves first, and every seat always has an answer to hand.
- 9 permanent omens that stack one per ante, from merged suits to a table where the worst hand wins.
- Three hands no 52-card deck can produce: Five of a Kind, Flush House and Flush Five.
- Rites write permanent marks onto exact cards in the shared deck, so your upgrade can land in a rival's hand.
- A blank page in every Market: write your own spell in plain English, and a rules parser (not an AI) turns it into a sigil.
- 12 relics that change the rules for you, five hexes to climb, and a Daily Rite that deals the same seeded run to everyone.

Small numbers on purpose: the pools were cut so that every card is learnable
(cc8f6ea). Do not pad these bullets back up with the retired content; the
registry still holds it, but nobody is dealt it.

## Tags (15, most important first)

Poker, Card Game, Roguelite, Magic, Strategy, Turn-Based, Fantasy, Roguelike
Deckbuilder, Tabletop, Singleplayer, Replay Value, Pixel Graphics, Stylized,
2D, Indie

Changed 2026-10-22: **Multiplayer** is out and **Pixel Graphics** is in.
NEXT.md has said since round 4 that the store page says nothing of PvP or
multiplayer until Steam lobbies exist, and a LAN table is not what that tag
promises. The game has been pixel art since the arcade look (2026-10-13..15).
**Controller** is left off until the Deck check passes (Controller support
below); add it back as the 16th tag then.

Roguelike Deckbuilder sits at 8, not in the top five: there is a Market loop
and rites mark the deck, but the deck is shared, so it is not a personal
deckbuilder. Move it down or drop it if early reviews say "not a
deckbuilder".

## A/B short descriptions (runner-ups, every claim verified)

- **B, roguelike framing (275 characters):** A poker roguelike played at a Texas Hold'em table. Win pots, shop between antes and build a run from 13 sigils and 12 relics. But your opponents cast too, spells resolve on a stack, the deck you upgrade is shared, and each new ante brings an omen that rewrites the rules for good.
- **C, social framing, only after a real session with other people over Steam:** Texas Hold'em with a deck that breaks physics. Cast spells on a stack, counter the counterspell, and play under omens that rewrite the rules every ante. Host a table for friends with a four-letter code, or fill the seats with bots. Five of a Kind is a real hand here.

## Genre

Strategy, Indie (primary: Strategy).

## System requirements

Measured from the build where possible. The game is an Electron 44 app
(Chromium + Node). It runs a local game server and a WebGL backdrop at half
resolution, capped at 30 fps.

| | Minimum | Recommended |
| --- | --- | --- |
| OS | Windows 10 64-bit | Windows 11 64-bit |
| Processor | Dual-core 2.0 GHz (x64) | Quad-core 3.0 GHz |
| Memory | 4 GB RAM | 8 GB RAM |
| Graphics | Any GPU with WebGL 2 (Intel HD 520 class) | Any GPU from 2018 on |
| Storage | 500 MB | 500 MB |
| Display | 1280x720 | 1920x1080 |

Installed size measured 2026-10-22: `release/win-unpacked` is 392 MB. SteamOS /
Linux: same as minimum. **(check)** on real Deck hardware.

## Languages

English only (interface, full audio, subtitles: interface only; there is no
voice). No localisation framework yet.

## Controller support

**Declare Partial Controller Support** (Xbox layout) until one check on a
Steam Deck (below) passes; then switch to Full.

What works with a pad: every menu is reachable by d-pad or stick
(`npm run play:pad`, re-run 2026-10-22 on the current UI), the whole table
plays on the pad, and button prompts switch to the glyphs of the pad in hand
while it is in use: Xbox (and the Deck), PlayStation (Cross, Circle, Square,
Triangle, L1/R1) or Nintendo. When Steam Input remaps a PlayStation pad the
game sees a virtual Xbox pad and shows Xbox prompts.

Text entry (P8, wired 2026-10-09): with a pad in use, pressing A on a text
field, or a panel opening with its field focused, or a finger tapping a
field, asks Steam for its floating on-screen keyboard
(`ShowFloatingGamepadTextInput`, `electron/steam.cjs`, placed clear of the
field). That covers **Join a Table**'s code, **Host a Table**'s name, the
chat line and the Market's **blank page**. The d-pad passing over a field
does not open it. Unit-tested against a stand-in for Steam
(`test/keyboard.test.ts`, `test/steam.test.ts`); **not yet seen on a real
Steam client**, which only a Deck or Big Picture can show.

**The check that unlocks Full** (Mason, on a Deck in Game Mode, or Big
Picture on the desktop with a pad, launched from Steam with the real App ID):
Join a Table, press A on the code field, type a code on Steam's keyboard,
press its Enter; then in a Market press A on the blank page and write a
sigil. If both work: switch the declaration to Full, put "Full controller
support." back at the end of the About This Game paragraph on hosting, add
the **Controller** tag, and aim the Deck review at **Verified** (also needs
the legibility and frame-rate pass on hardware). If the keyboard does not
appear, keep Partial and aim for **Playable** ("may need the on-screen
keyboard opened by hand", STEAM + X).

The copy source (`ops/session-2026-10-09/market/hexhold-store-copy.md` in the
masonobegi_webpage repo) still says "Full controller support", lists the
Controller tag and sells the old content: paste from this file, not from that
one.

## Content survey: draft answers

- **Violence, gore, sexual content, nudity, profanity**: none.
- **Gambling**: this is the one that needs care. The game simulates poker
  betting with in-game chips. There is **no real money**, no purchasable
  currency, no loot boxes and no cash-out. On Steam's survey say yes to
  *simulated gambling*, and describe it plainly: "Poker with in-game chips
  that have no monetary value and cannot be bought."
- **Ratings consequence**: Australia has classified games with simulated
  gambling as **R 18+** since 22 September 2024. Expect an 18+ rating there,
  and a PEGI 12 or 16-style "simulated gambling" descriptor in Europe if you
  ever seek a formal rating. Steam itself does not need an IARC rating to ship.
- **User-generated content**: players can type chat at a hosted table and
  write sigil text on the blank page. Both are local or LAN only; there is no
  public matchmaking. Answer "yes, user-generated text, not moderated" if the
  survey asks.
- **Always online**: no. Single-player works with no network (verified with
  the network blocked, `test/packaged.mjs`).

## Price suggestion

**$9.99**, with a 10-15% launch discount.

- Comparable single-player card roguelites with a twist on poker: Balatro
  ($14.99, the genre's ceiling), Luck be a Landlord ($9.99), Poker Quest
  ($14.99), Dicey Dungeons ($14.99).
- HEXHOLD has real depth in a small, learnable set (13 sigils, 9 omens, 12
  relics, five hexes, a daily, a blank page that writes new sigils) but no
  reviews, one language and an unknown name. $9.99 sits under the genre
  leader, inside the impulse-buy band, and leaves room to raise the price
  after content updates. Raising later is easier than defending a higher
  price with no reviews.
- Avoid $4.99: it reads as a slight game, and Steam's 30% cut plus the $100
  fee makes the maths worse for no gain in conversion.

## Trailer

`trailer/hexhold-trailer.mp4` is the upload for the store page's first trailer
slot: cut 4, 81 s, 1920x1080, 60 fps, H.264 High at 5.0 Mbps + AAC 192k,
faststart, 52.9 MB. Valve
takes .mp4 at 1920x1080 and recommends 5,000 kbps or more, so upload this
file, not a re-encode. `hexhold-trailer.webm` is the same cut for the web,
`hexhold-trailer.jpg` its poster (the Flush Five), and
`hexhold-preview-6s.mp4` / `.webm` six silent seconds of the opening's payoff
(two Kings of Spades, then FIVE OF A KIND) that end on their own first frame
so they loop: for autoplay previews, events and social posts.

Cut 4 (2026-10-22) is cut 3's edit re-recorded on the table as it is after
the UI pass of 2026-10-17..19: your cards in front of you, the full-screen
showdown that shows the five cards that scored, the Wild card's rainbow pip
(`trailer/STORYBOARD.md`). What it shows: four Kings made five by a spell
written in plain words; write your own spell and watch it do both halves;
undo the last card; a permanent new rule (the worst hand wins); then one King
of Spades copied into a Flush Five. Every shot is the real game on the real
server with stacked decks; the music is an original score rendered from code,
the sound effects are the game's own synths, rendered to the file (nothing is
played aloud while recording).

Rebuild it with `tools/trailer/record_trailer.sh` (about 45 minutes, headless
and silent; `PORT_A`/`PORT_B` choose its ports; see the header of
`tools/trailer/record_trailer.mjs`), then `tools/trailer/legibility.py` on the
work folder to re-check reading time. A single shot can be re-taken with
`--only <shot>` into a new folder and cut in by passing that folder last to
`mux_trailer.py`. If the game's look changes, re-record before the next store
update: the trailer is only as true as the build it was filmed from.

## Assets in this folder

Checked 2026-10-09 against Valve's asset list (ops `steam-onboarding.md`,
section 2.2). Every file is at Steam's exact size. **The capsules are
placeholders** generated from game frames; the commissioned artist replaces
them (`art/BRIEF.md`).

| File | Steam slot |
| --- | --- |
| `art/header_capsule_920x430.png` | Header capsule |
| `art/small_capsule_462x174.png` | Small capsule |
| `art/main_capsule_1232x706.png` | Main capsule |
| `art/vertical_capsule_748x896.png` | Vertical capsule |
| `art/page_background_1438x810.png` | Page background (optional) |
| `art/shortcut_icon_256x256.png` | Shortcut icon (Steam builds the .ico) |
| `art/community_icon_184x184.jpg` | App (community) icon; the form wants .jpg (a .png copy is beside it) |
| `art/library_capsule_600x900.png` | Library capsule |
| `art/library_header_920x430.png` | Library header capsule (its own upload, same art as the store header) |
| `art/library_hero_3840x1240.png` | Library hero (no text, as Steam requires) |
| `art/library_logo_1280x720.png` | Library logo (transparent) |
| `art/event_cover_800x450.png` | Event cover, for the launch announcement and later events |
| `art/hexhold.ico` | Client icon (also `electron/icon.ico`) |
| `achievements/<api_name>.png`, `<api_name>_locked.png` | Achieved and unachieved icon for each of the 20 achievements, 256x256 PNG; `achievements.json` names the pair for each one. `achievements/64/` holds 64x64 copies, `achievements/contact-sheet.png` shows them all (not an upload) |
| `screenshots/*.png` | 1920x1080, from the packaged build |
| `trailer/hexhold-trailer.mp4` | Trailer 1 (see Trailer above); `.webm` and `.jpg` beside it for the web |
| `trailer/hexhold-preview-6s.mp4` | Six-second silent loop of the opening's payoff, for autoplay previews |
| `achievements.json`, `achievements.vdf` | 20 achievements, 6 hidden |

All 20 achievements can be earned with the current pool (checked
2026-10-22). One only through the blank page: "Nobody Saw It Coming" (win
with a sealed card) needs a sealed rank, and Sealed Rank left the dealt pool
in cc8f6ea, but the Scribe still writes it ("seal the kings"). It is hidden,
so nobody is promised a route that is hard to find.

**Screenshots: upload the gameplay ones only.** Valve's review wants
screenshots that "only contain gameplay", so leave out the main menu and the
pause menu (`01-menu.png`, `11-menu-overlay.png`). See
`screenshots/README.md` for which file shows what and when it was captured.

All capsule art is regenerated by `python steam/make_art.py` from the packaged
game's own frames (`node test/packaged.mjs 200 --shots`), with the title in
Cinzel, and **no tagline**: Valve's capsule rule allows the art and the
game's name or logo only, so the header, small, main, vertical and library
capsules carry HEXHOLD and nothing else (the tagline above is store copy, not
capsule art). The library hero is a 1920px capture scaled to 3840px under a
blur, so it is soft by design. The achievement icons are drawn ones: one
symbol per achievement in the game's own mark grammar, on the app icon's
brass hexagon over the felt. Their generator lives outside the repo
(`Projects/active/_steam-assets/_tools/achievement-icons/hexhold.py`);
replacing any file under the same name is enough.
