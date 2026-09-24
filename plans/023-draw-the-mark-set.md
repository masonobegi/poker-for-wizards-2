# 023 — Draw the mark set

- **Status**: DONE
- **Severity**: HIGH (a shipping defect on the target platform, plus the art pass)
- **Category**: 8 (Missed opportunities) / correctness
- **Scope**: 3 new files, 18 edited

## Problem

Every sigil, relic, omen and card mark was a single Unicode character. Three
things were wrong with that, in order of what they cost:

### 1. They tofu on the platform we ship to

The UI font stack was:

```css
--font-ui: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
```

None of those fonts contains `🜂` (Burn), `⑃` (Tithe), `⌸` (Read the Room),
`⟒` (Fracture), `⟆` (Reflect), `⨭` (Cheap Tricks) or `⚱` (Grave Interest). On
Windows the browser silently falls through to **Segoe UI Symbol**, which has
all of them, so the whole set looks correct on a dev machine. A Steam Deck has
no Segoe anything. An unlisted fallback is an empty box — in the middle of a
spell card, where the card's identity is supposed to be.

This was measured, not assumed: rendering all 45 sigil glyphs to a canvas and
comparing each width against `U+FFFF` found zero missing **here**, which is
exactly what makes it dangerous.

### 2. They were not unique

`⧖` was Echo of a Hand (Chronos) *and* Tessellate (Bind). Across the four
families, **thirty characters were shared by two or three entries** — `👁` was
a sigil, a relic and an omen; `⟁`, `⧉`, `☠`, `✶`, `✚`, `◈` and `◐` were each
used three times. A symbol that means three things means nothing.

### 3. They were not one hand

Measured at a single font size the set spanned **7.5px to 15px wide**: hairline
mathematical operators next to heavy dingbats, and two colour emoji (`👁`,
`⛓`) that ignore `color` outright and render as someone else's artwork in
someone else's palette.

## What was done

`src/art/marks.tsx` — 102 drawings on one skeleton: a 24-unit box, 1.7 stroke,
round caps and joins, everything inside 3..21, optical centre at 12,12. Filled
dots are the only solid ink in the set and they mean one thing: a value that
has resolved.

Each school has a motif you can read before you read the name:

| School | Motif |
| --- | --- |
| entropy | circles that have not finished deciding — broken arcs, scatter |
| veil | something half-hidden — crescents, occlusion, a covered half |
| chronos | time with a direction — arcs with heads, nested rings |
| bind | two of a thing, joined — pairs, links, shared edges |
| ruin | a clean break — gaps, cuts, a shape pulled apart |
| weave | over and under — interlace, a nib, a grid being written on |

Relics are drawn as **objects** (a vessel, a coin, a compass) and omens as
**conditions over the table** (a horizon, weather, a rising level), so the
families stay apart at a glance even at 13px.

`<Mark kind="sigil" id="superpose" />`. Ids are namespaced by kind because they
collide: `long_memory` is both a sigil and an omen, and `the_ledger` (relic)
sits beside `the_ledger_sigil`. Anything with no drawing falls back to the
character it replaced, so a new sigil is never invisible while its mark is
being drawn.

Also drawn, because they had the same problem and were more visible than most:

- **The `⧉` impossible badge**, which appears in nine places.
- **The twelve chest sigils on the seat portraits**, which were rare characters
  set in `serif` — the one place in the game where a missing glyph is
  unmissable, since it is in the middle of every seat.

And `--sym` was added to the end of all three font stacks (`Segoe UI Symbol`,
`Apple Symbols`, `Noto Sans Symbols 2`, `DejaVu Sans`) for the handful of
characters still set as text: the shard diamond, the discard glyph, the arrows.
DejaVu Sans is on essentially every Linux including SteamOS.

## Sizing

`.hx-glyph` is **1.15em**, not 1em. The art occupies about three quarters of
its box, so a mark drawn at exactly the font size sits visibly lighter than the
dingbat it replaced — next to the bold serif on a sigil card the first version
read as an afterthought. 1.15em is the optical match, measured against the text
it shares a line with rather than against the box.

## Guard

`test/marks.test.tsx`, six tests:

- every sigil, relic, omen and card mark has a drawing (the fallback is
  deliberate but invisible in review — add a sigil, forget its mark, and it
  looks right here and tofus on a Deck);
- each one renders an `<svg>` with something in it;
- nothing paints with its own colour, so a mark takes the colour of whatever it
  sits in;
- nothing is drawn outside the 24-unit box;
- an unknown id still renders its fallback.

Both the coverage and the bounds assertions were mutation-tested: widening one
circle to `r=19` is caught (`spans -9.5..31.0`), and renaming one registry key
is caught (`1 of 101`).

**The bounds check took three attempts and is worth reading before touching.**
Version one pulled every number out of the `d` attribute, which is wrong twice
over — relative commands (`h-9`, `c-2 -4.5 ...`) carry *deltas*, and an arc's
`rx ry rot large sweep` are not coordinates at all. It reported 58 of 100 marks
as out of bounds and every single one was fine. A guard that cries wolf on more
than half the set is a guard somebody deletes, so it now walks the path
properly. Version two bounded arcs by `endpoint ± radius`, loose by a whole
radius. Version three bounded them by the full ellipse, which is right for a
large arc and put Gloaming's crescent at x=32 for a minor one. The arc handling
now splits on `large`, and a minor arc's sagitta is projected perpendicular to
its chord rather than padded in every direction.

## Verification

`npm run typecheck` (and with `--noUnusedLocals`), `npm test` (120), both
builds, `npm run sim`, `npm run responsive` (7/7), `npm run play:pad` (9/9),
`npm run play`. The whole set was also reviewed as four contact sheets rendered
through `react-dom/server` and screenshotted — which is how eighteen of them
came to be redrawn. Schrödinger's Flop read as a camera, Deep Well read as a
face, Sever read as a "no entry" sign, and there were three separate crowns.

Bundle cost: +21kB raw, +5kB gzip for 102 drawings.
