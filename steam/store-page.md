# HEXHOLD: Steam store page draft

Drafted 2026-10-09. Every claim below is checked against the build, apart from
the ones marked **(check)**.

## Short description (≤300 characters)

> Texas Hold'em with a deck that breaks physics. Cards sit in two states at
> once, the river can run twice, and every hand is a duel of sigils and
> counterspells. Climb ante after ante against bots who cast back, or host a table
> for friends.

(262 characters)

## Long description (Steam BBCode)

```
[h2]Poker, until the deck stops obeying physics[/h2]
HEXHOLD is Texas Hold'em played with impossible cards. A card can sit in two states until someone looks at it. The King you see is not the King your opponent sees. The river has run before, and it can run again.

[h2]Cast sigils between the bets[/h2]
[list]
[*]71 sigils across six schools. Peek at the river, weld two cards into one, rot a hand, or counter the spell that was about to beat you.
[*]A response window on every cast: answer it, or let it resolve.
[*]Write your own sigils at the Market's blank page, in plain English.
[/list]

[h2]A run, not a session[/h2]
[list]
[*]Survive ante after ante as the blinds climb. Every ante break opens the Market and lands a new omen, a permanent rule that bends the table.
[*]41 omens, 45 relics, 7 covens to play as, and 5 Hex levels for when the table gets easy.
[*]A Daily Rite: the same deals and omens for everyone, once a day.
[/list]

[h2]Made for a couch and a Deck[/h2]
[list]
[*]Full controller support, laid out for 1280x800.
[*]Plays fully offline against bots in three skill bands and three table speeds.
[*]Host a table for friends on your network.
[*]Every sound is synthesised live. There is not a single audio file in the game.
[/list]

No real money. Nothing to buy. Chips cannot be bought or cashed out.
```

## Tags (up to 20, most important first)

Card Game, Poker, Roguelite, Deckbuilding, Strategy, Magic, Turn-Based
Strategy, Singleplayer, Multiplayer, Local Multiplayer, Online PvP, Replay
Value, Indie, Fantasy, Dark Fantasy, Tabletop, Controller, Casual, 2D,
Atmospheric

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

| File | Steam slot |
| --- | --- |
| `art/header_capsule_920x430.png` | Header capsule |
| `art/small_capsule_462x174.png` | Small capsule |
| `art/main_capsule_1232x706.png` | Main capsule |
| `art/vertical_capsule_748x896.png` | Vertical capsule |
| `art/library_capsule_600x900.png` | Library capsule |
| `art/library_hero_3840x1240.png` | Library hero (no text, as Steam requires) |
| `art/library_logo_1280x720.png` | Library logo (transparent) |
| `art/community_icon_184x184.png` | Community icon |
| `art/hexhold.ico` | Client icon (also `electron/icon.ico`) |
| `screenshots/*.png` | 8 screenshots, 1920x1080, from the packaged build |
| `achievements.json`, `achievements.vdf` | 20 achievements, 6 hidden |

All art is regenerated by `python steam/make_art.py` from the packaged game's
own frames (`node test/packaged.mjs 200 --shots`), with the title in Cinzel.
The library hero is a 1920px capture scaled to 3840px under a blur, so it is
soft by design. A sharper one would need a 4K capture.
