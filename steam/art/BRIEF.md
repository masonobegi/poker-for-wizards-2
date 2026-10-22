# HEXHOLD: brief for the commissioned store art

For the artist who makes HEXHOLD's Steam capsules and library art. Written
2026-10-22. The PNGs in this folder are **placeholders** generated from game
frames by `steam/make_art.py`; every file named below replaces one of them
under the same name. Sizes and rules are from Valve's Steamworks
documentation as of 2026-10 (Store Graphical Assets, Library Assets); check
the current pages before delivery, because Valve has changed sizes before.

**Needed by 13 Nov 2026** for the Coming Soon page (target 20 Nov 2026):
Valve reviews a store page before it goes public, so leave a week.

## The game, in one paragraph

Texas Hold'em played with a deck that does not obey physics. You sit at a
poker table with three wizard opponents; on your turn you can cast a sigil (a
spell card) that bends the cards: one card becomes two at once, a card is
copied onto another, the last card dealt is taken back. Every ante brings an
omen that rewrites the rules for good. The payoff is a hand no real deck can
make: **Five of a Kind**, **Flush House**, **Flush Five** (five copies of the
same card). The art has to say "poker, but magic breaks the deck", fast.

What sells it, in order: the impossible hand (five Kings of Spades), the
table of wizards, a spell visibly bending a card. Not a generic fantasy
wizard, not a casino.

## Art direction (match the game, do not invent a new look)

The game is pixel art with a fixed palette. Screenshots in `../screenshots/`
show it.

- **Fourteen colours, nothing between them.** Ink `#0d0a14`, night
  `#14102b`, indigo `#2b2266`, purple `#5b2a86`, magenta `#c2185b`, hot pink
  `#ff4fa3`, cyan `#00e5ff`, teal `#1fa3a3`, gold `#ffd23f`, orange
  `#ff8c1a`, red `#e5261e`, wood `#c98a3e`, dark wood `#a86a2a`, light wood
  `#e8b064`, bone `#f4f1e8` (`src/styles/tokens.css`). A material gets two or
  three tones with a hard edge or a dither between, never a smooth ramp.
- **Light from the top left. Black ink outlines** around every shape; the
  outline does the drawing, not glows. Glow is reserved for magic and gold.
- **Hard pixels.** Work at a low resolution and scale up by a whole number
  with nearest-neighbour; no blur, no soft brushes, no anti-aliased edges.
- **The wordmark** is how the game sets a headline: Bungee, cut through three
  hard horizontal bands of gold, orange and red, with a 4 px ink outline (the
  menu, the trailer's title card). The placeholders set it in Cinzel, from an
  older look; the commissioned logo should not. A redrawn pixel wordmark in
  the same spirit is welcome; deliver it separately as the library logo.
- The cards are bone paper with ink court figures (see a showdown
  screenshot). The table is an indigo felt oval in a wood rail. Opponents are
  currently silhouettes: if portraits are commissioned too (see the end), the
  capsule should use the same faces.

## Valve's rules for every capsule

- Artwork and the game's **name or logo only**. No tagline ("Texas Hold'em
  with a deck that breaks physics" is store copy, not capsule art), no review
  quotes, award laurels, prices, "Coming Soon", "Demo", "Early Access" or
  update text, no platform logos.
- The name must be legible at the size Steam shows the capsule.
- Exact pixel sizes; PNG (or JPG where noted), sRGB.

## The deliverables

| File (replace in this folder) | Size | Where Steam shows it | What it needs |
| --- | --- | --- | --- |
| `header_capsule_920x430.png` | 920x430 | Top of the store page, recommendations, wishlists | The key art plus the logo. The most-seen asset: if one gets the most care, this one. |
| `small_capsule_462x174.png` | 462x174 | Search results, lists, top sellers (often shown near 120 px wide) | Mostly the logo, large enough to read at that size, on a simple piece of the key art. Detail disappears here. |
| `main_capsule_1232x706.png` | 1232x706 | The front page's big carousel | The key art at its fullest, logo included. |
| `vertical_capsule_748x896.png` | 748x896 | Seasonal sales and events | The key art rearranged for a tall frame, logo included. |
| `library_capsule_600x900.png` | 600x900 | The player's Steam library grid | Logo plus art, readable as a small tile. |
| `library_header_920x430.png` | 920x430 | Library, recently played | Same art as the store header is fine. |
| `library_hero_3840x1240.png` | 3840x1240 | Behind the game's library page | **No logo and no text.** A wide scene (the table, the room) with the important part away from the lower left, where Steam places the logo over it. The placeholder is a blurred capture; a crisp painting is the point of commissioning it. |
| `library_logo_1280x720.png` | up to 1280 wide or 720 tall | Over the library hero | The wordmark alone, transparent background. |
| `page_background_1438x810.png` | 1438x810 (optional) | Behind the store page | Quiet: Steam darkens it under the page. Can be a crop of the hero. |
| `event_cover_800x450.png` | 800x450 | Announcements and events | Key art plus logo; reused for every event post. |
| `community_icon_184x184.jpg` | 184x184 JPG | The community hub | The hexagon mark (see `shortcut_icon_256x256.png`), redrawn if wanted. |
| `shortcut_icon_256x256.png` | 256x256 | Desktop shortcut, Steam's .ico | Same mark. `hexhold.ico` and `electron/icon.ico` are built from it. |

Please also deliver the layered source files (PSD, Aseprite or similar) and
the key art at its working pixel resolution, so later crops (a demo capsule,
a Next Fest tile, a sale banner) can be made without coming back.

## Also worth commissioning (it moves the fun score, not only the store)

The game's own review (`FUN-REVIEW.md`, criterion 8) holds presentation at 7
of 10 until the opponents stop being silhouettes: "a real sprite layer,
expressive opponents, distinct court cards". If the budget allows, the same
artist doing:

1. **Opponent portraits**: ten names (Mordent, Vesper, Kestrel, Nyx, Sable,
   Corvid, Ashgrave, Wren, Thorn, Quill), about 64x64 at the art pixel, with
   a neutral and a reacting face (won a pot, got countered).
2. **Court cards**: Jack, Queen, King in four suits, at the card's art
   resolution, in the same ink-and-bone style as now.

## How to check a delivery

1. Every file is the exact size in the table (`python -c "from PIL import
   Image; print(Image.open('header_capsule_920x430.png').size)"`).
2. Look at the small capsule at 120 px wide: can you read HEXHOLD?
3. The hero has no text, and nothing important sits in its lower left.
4. Drop the files into this folder under the same names; nothing in the
   build reads them, so nothing else changes.
