# 022 — Port the web demos' techniques to the table

- **Status**: DONE
- **Severity**: MEDIUM (additive)
- **Category**: 8 (Missed opportunities)
- **Estimated scope**: 9 files + 3 new

## Source

`masonobegi_webpage/site/src/components/demos` — 22 live demos built on
three.js and GSAP. None of it could be lifted as code: HEXHOLD has neither
dependency, framer-motion already owns the motion layer, and three.js alone is
roughly the size of the whole client bundle. What transfers is the *technique*,
re-expressed in what this project already has.

Four of the twenty-two were worth taking. The rest were either scroll-driven
(this game does not scroll), pointer-only in ways that would be dead weight on
a Steam Deck (magnetic buttons, a custom cursor), or already present here in a
better form — GSAP's `Flip` does what `layoutId` already does on every card.

| Demo | Technique | Where it landed |
| --- | --- | --- |
| `motion/CursorEffects` | pointer-tracked tilt + glare | sigil cards (playing cards already had it) |
| `motion/TextEffects` | scramble-and-settle reveal | the winning hand name at showdown |
| `LivingGradient` | slow domain-warped light | the felt |
| `ParticleMorph` | "each point sets off at its own moment" | the deal: card-by-card turn-over |

## 1. The sigils had no foil

`Card.tsx` had carried a pointer-tracked 3D tilt and a specular highlight since
the start. `SigilCard.tsx` had neither, so a rail of spells read flatter than
the board above it — in a game named after the sigils.

The tilt and specular are now `src/components/fx/usePointerFoil.ts`, used by
both. Two things the extraction fixed rather than moved:

- The springs run on the **pointer position**, not on the derived angle. Spring
  the position once and the tilt and the highlight stay in step; spring each
  output separately and they drift apart by the difference of their constants.
- The sheen strength is a parameter, so it can scale with rarity. A mythic
  glints at 0.4, a common at 0.16 — the job a foil finish does on a real card,
  which is to be legible from across the table.

**The trap**: the playing cards blend their glare with `mix-blend-mode:
overlay`, and overlay leaves a dark surface dark. A sigil frame is near-black,
so the first version was mounted, positioned, tracking the cursor and
completely invisible. The sigil foil uses `screen`. Found by cropping a
screenshot, not by reading computed styles — every property said it was
working.

## 2. The winning hand now decodes

`src/components/fx/DecodeText.tsx`. The hand that won the pot arrives as the
same runes the particle engine throws off a spell (`RUNE_GLYPHS`) and resolves
left to right into words.

Only the **winning** row decodes. Five rows of runes at once is a wall, and the
point is to pull the eye to the line that decided the pot.

Three decisions that are load-bearing:

- Each character sits in a slot sized by a hidden copy of its **final**
  character, with the live glyph laid over it. Runes are not the width of
  letters; without this the line's width jitters for the whole animation and
  drags the row around with it.
- Glyphs change on a 50ms clock, not per frame. At 144Hz a per-frame scramble
  is grey mush.
- The loop writes through refs. Twenty React renders a second to change one
  character is work for nothing — the same reasoning as `008` and `013`.

`lead` is 430ms at the call site because the panel's own entrance has a 0.25s
delay plus a spring. Without it a third of the decode happens behind an
invisible panel.

## 3. The felt is alive

Three very soft school-coloured discs drifting on 46/61/74s cycles under
`.felt-surface`, which was a fixed radial gradient — exactly as alive as a
printed page.

Built from what costs nothing: no `filter: blur()` (a radial gradient is
already soft, and blurring a third of the screen every frame is the one thing
on this table that would cost a Steam Deck frames), `translate` and `scale`
longhands rather than `transform`, and no animated opacity — so `animation:
none` under reduced motion leaves a still, faintly-lit table rather than a dark
one. `:root[data-particles='off']` hides them, which gives that setting a
meaning in CSS as well as in the particle engine.

## 4. Cards are dealt face-down and turn over

The deal already had its arc, its stagger and its shadow. What it did not have
was the single most recognisable thing a dealt card does: arrive face-down and
turn.

`dealFlip` on `Card`, passed by `Board` and the hole-card row in `Rail` — and
nowhere else. Every other card on screen (the codex, the shop, the
top-of-deck peek, a showdown row) is a card being *shown*, not dealt, and
flipping those on mount turns a quiet panel into a flock of spinning
rectangles.

`flipSeq` already existed to re-key the landing shadow, and it is still 0 for
as long as a card has never changed face — so it doubles as "this is the mount
animation", which is the only flip that should wait for the arc to land.

A companion `.hx-card__turn` sweeps a highlight across the card while it turns.
It lives in `.hx-card__fx`, which is a **sibling** of the flip rather than a
child, so it keeps facing the viewer and reads as a reflection passing over the
card rather than a decal glued to one face.

## What was deliberately left

- **Magnetic buttons** (`CursorEffects`). Mouse-only, and this game is
  gamepad-and-Deck first. It would be dead code for most of the audience.
- **A custom cursor.** Same reason, plus it fights the gamepad focus ring.
- **Everything scroll-driven** — `ScrollStory`, `StackingCards`, `SideScroll`,
  the masked line reveal, the highlighter. The table does not scroll.
- **The three.js scenes** (`ProductViewer`, `ExplodedView`, `RingCarousel`,
  `DeviceReveal`, the real `LivingGradient` shader). A fragment shader would
  give a better felt than three drifting discs, but not enough better to justify
  a WebGL context and its fill rate on a Deck, for a background.

## Verification

`npm run typecheck` (and with `--noUnusedLocals`), `npm test` (114), `npm run
build`, `npm run sim`, `npm run responsive` (7/7 PASS), `npm run play:pad`
(9/9), `npm run play`. Each of the four effects was also confirmed from
screenshots rather than from code: the deal mid-flip with one card still
showing its back, the decode resolving across nine frames, the foil on a
hovered sigil, and the felt in two frames nine seconds apart.
