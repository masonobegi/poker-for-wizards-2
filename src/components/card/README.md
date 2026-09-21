# The card layer

This folder renders one thing, in every way HEXHOLD needs it rendered: a playing card that may be
face down, face up, undecided, or only partly known. Everything is pure inline SVG and CSS — no
image assets, no icon fonts, no unicode card faces — so a card looks the same crisp, hand-drawn way
at 40px or at 400px, and the whole visual language (the ink, the deck back, the effects) can be
re-themed from `src/styles/tokens.css` alone.

There are five files here, and they divide the work cleanly:

- `CardArt.tsx` draws the ink on a face: the corner indices, the traditional pip layouts for 2–10,
  and bespoke engraved court figures for J/Q/K/A.
- `CardBack.tsx` draws the deck's own back: a gold guilloché rosette on deep violet stock.
- `Card.tsx` is the actual card entity — it owns the 3D flip, the pointer tilt, the deal-in
  animation, and every stateful effect (quantum, veiled, marks, highlights).
- `CardRow.tsx` lays a set of cards out as an overlapping row or a fanned hand.
- `card.css` is the stylesheet all four of the above depend on. It's the only place any card-related
  CSS lives; nothing is styled inline except the handful of values that have to be (pointer position,
  per-layer animation offsets) because they're computed per-render.
- `Gallery.tsx` is a standalone dev page, `CardGallery`, that renders one of everything so a change
  to `card.css` can be checked at a glance instead of by hunting through a real game for the right
  moment.

Nothing outside this folder needs to know how any of this works — the only public surface most
consumers touch is `Card` and `CardRow`, fed with a `CardView` from `shared/cards.ts`.

## Component reference

### `CardArt`

```ts
interface CardArtProps {
  face: Face;          // { rank, suit } — the identity to draw
  className?: string;
}
```

Renders a complete card face: the top-left index, the bottom-right index (rotated 180°), and the
centre art — pips for ranks 2 through 10, or a court figure for J/Q/K/A. It paints *only* ink; the
component has a transparent background on purpose, because `Card` stacks more than one `CardArt` on
top of a single ivory surface when a card is in superposition (see **Quantum**, below), and that only
works if each layer is otherwise invisible. Ink colour is driven by a single `data-ink="red"|"black"`
attribute on the root element, which `card.css` resolves to `--card-red` / `--card-black` — every
other coloured stroke or fill in the artwork (the pip shape, the court figure's outline, its tinted
silhouette) inherits that colour via `currentColor`, so re-theming ink is a one-line change.

`CardArt` also exports `SuitShape`, a standalone `{ suit, className }` component used anywhere a bare
suit glyph is needed outside a full face — the corner index and the veil plaque both use it directly.

### `CardBack`

```ts
interface CardBackProps {
  muted?: boolean;   // dim the engraving so an overlay (the veil plaque) reads clearly on top
  sheen?: boolean;    // default true — a slow specular sweep crossing the metal; turn off for a
                       // deep stack of backs where forty independent sweeps would be noise
  className?: string;
}
```

Renders the deck's own face: a gold-leaf border inset, a fan of guilloché ellipses, three concentric
rings, a hexagram, and the HEXHOLD monogram sealed in the centre. Every card that doesn't reveal its
identity to the current viewer — face-down, veiled, or an unseen quantum cloud — eventually shows
some variant of this same back, which is what makes the deck read as one consistent object across the
table even though each seat is being sent a different truth about it.

### `Card`

The card entity itself, and the only component most call sites need.

```ts
type CardSize = 'xs' | 'sm' | 'md' | 'lg';
type CardHighlight = 'none' | 'winning' | 'used' | 'target' | 'dimmed';

interface CardProps {
  view: CardView;                          // what this viewer is allowed to know (shared/cards.ts)
  size?: CardSize;                         // default 'md' — exactly --card-w × --card-h
  faceDown?: boolean;                      // force the back regardless of view.state
  highlight?: CardHighlight;               // default 'none'
  selectable?: boolean;
  selected?: boolean;
  onClick?: (id: string) => void;
  onHoverChange?: (id: string | null) => void;
  layoutId?: string;                       // shared-element id, for flying a card between layouts
  index?: number;                          // position in a deal, for the entrance stagger
  className?: string;
  tiltOnHover?: boolean;                   // default: on when the card is interactive
}
```

`size` is the only thing that changes a card's footprint, and it's a multiplier, not a set of
hand-tuned breakpoints — `md` is exactly `--card-w` / `--card-h` from `tokens.css` (78×112), and
`xs`/`sm`/`lg` scale everything else — border radius, shadow, badge size, index font size — from
that single number. The one deliberate exception is the corner index: it doesn't shrink linearly,
because "legible at a glance" matters more than strict proportionality. At `sm` and above the index
follows the card's scale; below that, `card.css` progressively over-sizes it (and puts a hard 9px
floor under it) so the rank and suit are still readable on a card the size of a fingertip.

`view.state` decides what's actually drawn — see **Visual language**, below, for what each one looks
like and why. `faceDown` is a separate escape hatch on top of that: it forces the back even for a
card whose `view.state` is `'faceup'`, which is how an opponent's mucked or still-hidden hand gets
rendered from a `CardView` that was otherwise built as if face up (useful when the same view object
is reused for both the owner's and an opponent's render).

`highlight` is a single enum rather than several booleans because a card only ever means one of these
at a time in the UI: it's part of the winning hand, it was used/discarded, it's a legal target waiting
for a click, or it's being de-emphasised while something else has focus. `selected` is independent of
all of that — it's the player's own pending choice, and stacks visually with whatever `highlight` is
also set.

### `CardRow`

```ts
interface CardRowProps {
  views: readonly CardView[];
  size?: CardSize;
  overlap?: number;                  // 0..0.85 of a card width; default 0.16 straight / 0.34 fanned
  highlightIds?: readonly string[];  // cards in this set get `highlight`; everything else gets `restHighlight`
  highlight?: CardHighlight;         // default 'winning'
  restHighlight?: CardHighlight;     // default 'none'
  onCardClick?: (id: string) => void;
  onCardHover?: (id: string | null) => void;
  fan?: boolean;                     // curve the row into a held hand
  fanSpread?: number;                // total sweep in degrees, default 16
  selectable?: boolean;
  selectedIds?: readonly string[];
  faceDown?: boolean;
  tiltOnHover?: boolean;
  layoutIdPrefix?: string;           // each card gets `${prefix}${view.id}` for shared-element flight
  staggerFrom?: number;              // continue another row's deal-in stagger instead of restarting it
  className?: string;
  label?: string;
}
```

`CardRow` only owns two things: spacing (the negative-margin overlap between seats) and, in fan mode,
the pivot every card rotates around. It doesn't touch anything about how an individual card looks or
animates — every `Card` inside it still owns its own flip, tilt, and effects independently, and exits
run through `AnimatePresence` so a card leaving the row (burned, mucked, won) animates out instead of
disappearing. The straight layout is what the community board uses; the fanned layout, with cards
rotated around a shared point below the row, is what a player's own hole cards use.

### `CardGallery`

A plain page component, `<CardGallery />`, with no props. It builds `CardView` objects directly
rather than going through the server or `shared/cards.ts`'s `CardEntity`/`viewCard` machinery, so it
can force combinations a real game might rarely produce — every mark on its own, every highlight,
both the "holder can see the cloud" and "observer can't" sides of quantum, both leak variants of
veiled. It isn't part of the game and isn't routed to anywhere; mount it from a temporary route (or
swap it in for `<App/>`) when tuning `card.css`.

## Visual language

Every card state is trying to answer one question at a glance: *how much do I know about this card,
and how much does the table know?* The styling follows from that.

**Face down** (`state: 'facedown'`, or any card with `faceDown` forced) is the plain deck back —
nothing more is implied.

**Face up** (`state: 'faceup'`) is the ordinary ivory face: `CardArt` on a warm, very faintly grained
ivory stock (`--card-face`), with a soft inner bevel — a thin bright edge along the top, a faint dark
one along the bottom — so the card reads as a lifted object with real thickness rather than a flat
rectangle. Red and black ink are tuned against that ivory to clear WCAG AA contrast on their own,
without relying on any outline or shadow to help legibility along.

**Quantum** (`state: 'quantum'`) is the flagship look, because it's the one state an ordinary deck of
cards cannot represent at all: a card that hasn't committed to an identity yet. What renders depends
on whether *this* viewer is allowed to see the possibilities (`view.possible`):

- If they can, `Card` stacks up to three `CardArt` faces directly on top of one shared ivory surface,
  each nudged a few pixels off-centre and slowly cross-fading in and out of opacity on its own phase —
  never all at once, never all settled, so the eye can't lock onto a single reading. Two independently
  drifting diagonal gratings lie on top of that for a genuine (not merely decorative) moiré shimmer,
  the pattern actually shifting rather than sitting static.
- If they can't, the face renders as `QuantumField` instead of a back: drifting violet and blue
  blobs and a slowly rotating cluster of rings over the ordinary back-deck gradient — visibly *not*
  the plain back, so "this card is unresolved" reads even to someone who isn't allowed to know more.

Either way, every quantum card — seen or not — gets a violet chromatic-aberration edge (a thin
RGB-split line traced just inside the border) and a fine breathing interference pattern, plus a slow
ring of arcane glyphs orbiting just outside the card's own edge. Those three are the tell that reads
from across the table, independent of who's allowed to see the cloud itself.

**Veiled** (`state: 'veiled'`) is a card back with one fact — rank or suit, never both — punched
through it: a soft gold glow behind an oversized rank numeral or a suit glyph, stamped in the centre
like a wax seal. The rest of the back is deliberately dimmed (`CardBack`'s `muted` prop) so that one
leaked fact is the only thing competing for attention.

**Diverged** (`view.diverged`) marks a card whose reading genuinely differs for this viewer versus the
table at large. It gets a subtle split-tone wash — cool veil-blue on the left half, warm chronos-amber
on the right — plus a small `⋔` badge, top right. It's meant to be noticeable without being loud;
divergence is a fact about the card, not an alarm.

**Entangled** (`view.entangled`) — two cards bound so that changing one changes both — gets a teal
glow around the card's own rim (the same rim element every highlight state uses, just a different
colour) and an `∞` badge alongside any diverged badge.

**Memory** (`view.memory`) is how many pots a card has already won. Five or fewer shows that many
small gold dots along the bottom edge; more than that collapses to one dot and a `×N` count, so a
card that's won a dozen pots doesn't grow a dozen dots.

**Marks** (`view.marks`) are permanent inscriptions, shown as small sealed badges along the top edge,
each coloured from its own `MARKS` definition in `shared/cards.ts`. Five of the nine get a matching
full-card effect as well, because they change how the card plays, not just how it looks:

- **Wild** — the badge and a thin ring just outside the card both cycle through the game's six schools
  of magic (a prismatic spin, since "counts as anything" is the point).
- **Blooded** — a slow red pulse from the centre.
- **Cursed** — a dark vignette that visibly creeps in from the corners rather than just sitting there.
- **Burning** — flickering ember glow at the four corners, irregular rather than a smooth fade, so it
  reads as fire and not as a breathing light.
- **Echo** — an expanding, fading ring, like a ping, repeating on a loop.

The other four (prism, leaden, mirrored, bound) get the plain badge treatment only — a sealed circle
in their own colour with the glyph from `MARKS`. Not every mark needs its own spectacle; the ones that
do are the ones a player needs to notice without reading the tooltip first.

**Highlights** (`highlight` prop) are the transient, situational states a card moves through during
play, not properties of the card itself:

- **Winning** — a gold rim and a slow, gentle float, so the winning hand visibly lifts off the table.
- **Used** — the same gold rim, but static; the card mattered, but the hand isn't in motion.
- **Target** — a pulsing cyan rim, inviting a click.
- **Dimmed** — desaturated and dropped to 45% opacity, for everything that isn't currently relevant
  while something else has the table's attention.

## Sizing and motion

Every size other than `md` is a pure multiplier (`0.52` / `0.74` / `1` / `1.36`) applied to
`--card-w` / `--card-h`; nothing in `card.css` hardcodes a pixel value for a specific size. The flip
is a real 3D Y-axis rotation (`transform-style: preserve-3d`, `backface-visibility: hidden` on both
faces) rather than a cross-fade, timed at 420ms with a slight overshoot so the card feels like it has
weight, and the contact shadow beneath it tightens as the card lands. Every animation in this folder —
the flip, the float, the phasing, the ring spins, the pulses — only ever touches `transform`, `opacity`
and `filter`, so nothing here forces layout.

`prefers-reduced-motion: reduce` is honoured twice over: `tokens.css` collapses every animation- and
transition-duration in the whole app to 1ms globally, and `Card.tsx` additionally turns off pointer
tilt and uses a zero-duration flip transition itself; `card.css` then explicitly kills every
`infinite` loop (the float, the phasing, every pulse and ring-spin) as a second, belt-and-braces pass,
so nothing so much as flickers for a player who has asked not to see motion.
