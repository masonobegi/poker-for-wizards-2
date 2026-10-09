# HEXHOLD: Steam store page draft

Drafted 2026-10-09; the store copy was replaced the same day with the final
version from `market/hexhold-store-copy.md`. Every claim is checked against the
build, apart from the ones marked **(check)**.

## Short description (264 characters, limit 300)

> Texas Hold'em where a card on the board can show you one face and your rivals another, and both readings score. Cast spells mid-hand, counter theirs, buy relics, survive omens that rewrite the rules for good, and chase Five of a Kind: a hand no real deck can make.

## Capsule tagline (46 characters, limit 60)

> Texas Hold'em with a deck that breaks physics.

## About This Game (Steam BBCode)

```
[b]A card on the board shows you one face and shows everyone else another, and both readings score.[/b] That is Divergence, one spell out of 71 in HEXHOLD: Texas Hold'em played with a deck that does not obey physics.

Underneath, it is plain Hold'em: two hole cards, five on the board, best hand wins. Then mana arrives every street, and the table starts casting.

[h2]Spells that break the deck[/h2]
[list]
[*][b]Superpose[/b] a card into two cards at once. It stays undecided until showdown, then settles on whichever face helps its holder most.
[*][b]Rewind[/b] the latest community card and deal a different one.
[*][b]Sealed Rank:[/b] name a rank, and every card of it is dealt face down for the rest of the hand.
[*][b]Nullify[/b] a spell on the stack. The last spell cast resolves first, so a counter eats what it answers.
[/list]

[h2]A rulebook nobody wrote[/h2]
At each new ante, an omen lands and never leaves. Suits merge. Every King is dealt face down. Three cards in the deck quietly turn Wild, and nobody is told which. From ante five, the omen that lands can make the worst hand win every pot. They stack.

[h2]Hands a real deck can't make[/h2]
Above the Straight Flush sit [b]Five of a Kind[/b], [b]Flush House[/b] and [b]Flush Five[/b]. Wild, mirrored and undecided cards make them reachable.

[h2]Write your own spells[/h2]
Every Market has a blank page. Type a spell in plain English, like "burn the river and read the chip leader's cards", and it becomes a sigil in your hand, priced by what it does, not how you word it. A rules parser reads it, not an AI.

[h2]Build the run[/h2]
Pick one of seven covens, each opening with its own spells. Spend shards on relics that change the poker itself: four-card flushes, Jacks and Queens read as Kings, a hand that always scores one category higher.

Or buy a rite, and write a permanent mark onto one exact card in the deck everyone draws from. The upgrade you paid for can turn up in an opponent's hand.

Climb five hexes per coven, or play the Daily Rite: one seeded run a day, the same for everyone.

Play solo against bots at three difficulties, or host a table on your local network. Full controller support.
```

Copy source: `ops/session-2026-10-09/market/hexhold-store-copy.md` (masonobegi_webpage
repo), the final draft after two judges, with every claim checked against
`shared/*.ts`. Keep multiplayer wording to "host a table on your local
network" until someone has played against another human and Steam
networking exists.

**Photosensitivity line**, to add at the end of About This Game: "Contains
flashing light effects. Settings, Video, Reduce flashing turns off screen
flashes, colour splits and screen shake; it is on by default when your system
asks for reduced motion." (True as of 2026-10-09: `src/vfx/VfxLayer.tsx`
checks it for all three.)

## Feature bullets

- 71 spells across six schools: superposition, secrecy, time, binding, ruin, and rewriting the deck itself.
- A real spell stack: anyone holding a counterspell can answer, and the last spell cast resolves first.
- 41 permanent omens that stack one per ante, from merged suits to a table where the worst hand wins.
- Three hands no 52-card deck can produce: Five of a Kind, Flush House and Flush Five.
- Rites write permanent marks onto exact cards in the shared deck, so your upgrade can land in a rival's hand.
- A blank page in every Market: write your own spell in plain English, and a rules parser (not an AI) turns it into a sigil.
- Seven covens, five hexes each, 45 relics, and a Daily Rite that deals the same seeded run to everyone.

## Tags (16, most important first)

Poker, Card Game, Roguelite, Magic, Strategy, Turn-Based, Fantasy, Roguelike
Deckbuilder, Tabletop, Singleplayer, Replay Value, Controller, Multiplayer,
Stylized, 2D, Indie

Roguelike Deckbuilder sits at 8, not in the top five: there is a Market loop
and rites mark the deck, but the deck is shared, so it is not a personal
deckbuilder. Move it down or drop it if early reviews say "not a
deckbuilder". The old list's Online PvP and Local Multiplayer are gone on
purpose (see the multiplayer note above).

## A/B short descriptions (runner-ups, every claim verified)

- **B, roguelike framing (280 characters):** A poker roguelike played at a Texas Hold'em table. Win pots, shop between antes and build a run from 71 sigils and 45 relics. But your opponents cast too, spells resolve on a stack, the deck you upgrade is shared, and each new ante brings an omen that rewrites the rules for good.
- **C, social framing (283 characters), only after a real session with other people:** Texas Hold'em with a deck that breaks physics. Cast spells on a stack, counter the counterspell, and play under omens that rewrite the rules every ante. Host a table for friends on your network with a four-letter code, or fill the seats with bots. Five of a Kind is a real hand here.

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

Installed size measured: `release/win-unpacked` is 393 MB; the installer is
112 MB. SteamOS / Linux: same as minimum. **(check)** on real Deck hardware.

## Languages

English only (interface, full audio, subtitles: interface only; there is no
voice). No localisation framework yet.

## Controller support

**Full controller support** (Xbox layout). Every menu is reachable by d-pad or
stick (`npm run play:pad`, 9/9 at 1280x800). Button prompts switch to pad
glyphs while a pad is in use. PlayStation glyphs are not drawn; Steam Input
presents a PS pad as an Xbox one, so the prompts name the Xbox buttons.

Steam Deck: likely **Verified** once checked on hardware. 1280x800 layout and
pad navigation are tested; text legibility at arm's length and frame rate are
not (see HANDOFF.md section 5).

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
  write sigil text. Both are local or LAN only; there is no public matchmaking.
  Answer "yes, user-generated text, not moderated" if the survey asks.
- **Always online**: no. Single-player works with no network (verified with
  the network blocked).

## Price suggestion

**$9.99**, with a 10-15% launch discount.

- Comparable single-player card roguelites with a twist on poker: Balatro
  ($14.99, the genre's ceiling), Luck be a Landlord ($9.99), Poker Quest
  ($14.99), Dicey Dungeons ($14.99).
- HEXHOLD has real depth (71 sigils, 41 omens, 7 covens, hexes, a daily) but
  no reviews, no trailer, one language and an unknown name. $9.99 sits under
  the genre leader, inside the impulse-buy band, and leaves room to raise the
  price after content updates. Raising later is easier than defending a
  higher price with no reviews.
- Avoid $4.99: it reads as a slight game, and Steam's 30% cut plus the $100
  fee makes the maths worse for no gain in conversion.

## Assets in this folder

Checked 2026-10-09 against Valve's asset list (ops `steam-onboarding.md`,
section 2.2). Every file is at Steam's exact size.

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
| `art/achievements/<api_name>.jpg`, `<api_name>_locked.jpg` | Achieved and unachieved icon for each of the 20 achievements, 256x256 (`art/achievements_sheet.png` shows them all; not an upload) |
| `screenshots/*.png` | 1920x1080, from the packaged build |
| `achievements.json`, `achievements.vdf` | 20 achievements, 6 hidden |

**Screenshots: upload the six gameplay ones.** Valve's review wants
screenshots that "only contain gameplay". `01-menu.png` and
`11-menu-overlay.png` are the main menu and the pause menu, so leave them out:
upload `02-your-turn`, `06-showdown`, `07-spell-stack`, `08-market`,
`10-targeting` and `t03-showdown`.

All capsule art is regenerated by `python steam/make_art.py` from the packaged
game's own frames (`node test/packaged.mjs 200 --shots`), with the title in
Cinzel. The library hero is a 1920px capture scaled to 3840px under a blur, so
it is soft by design; a sharper one would need a 4K capture. The achievement
icons come from `python steam/make_achievement_icons.py`: the game's emblem
with a monogram per achievement. They are a complete, consistent set; bespoke
art can replace any file under the same name.
