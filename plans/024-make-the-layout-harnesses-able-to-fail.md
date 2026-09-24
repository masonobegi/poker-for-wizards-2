# 024 — Make the layout harnesses able to fail

- **Status**: DONE
- **Severity**: HIGH (a test that cannot fail is worse than no test)
- **Category**: tooling / correctness
- **Scope**: 2 files

## Problem

Both layout harnesses asked the same question — *does any element extend past
the viewport?* — and neither could answer it usefully.

### `npm run responsive` could only ever pass

It intersects each element with its clipping ancestors before measuring, which
is right in principle: a decorative element that overshoots inside
`overflow: hidden` is real geometry (`getBoundingClientRect` reports it) but
never paints out there.

The walk ran to the top of the tree. This app sets `overflow: hidden` on
**both `.app` and `body`**, because it is a full-screen game that does not
scroll. So every element on the page clipped to exactly the viewport, and
`checkOverflowX` returned an empty array at every resolution, on every run,
since it was written.

The two layout bugs found at 1024×680 — a sigil name rendering as
"Doppelgange", BIND rendering as "BIN" — were both found by looking at
screenshots. This is why.

### `npm run play` cried wolf

It did not clip at all. The omen banner's glow bar scales past 1 on the way
out, inside a `position: fixed; inset: 0; overflow: hidden` container, so it
is physically incapable of reaching the edge of the screen — and it was
reported as `div. overflows horizontally (-99..1539 vs 1440)` on any run where
an omen happened to fire during the market. Intermittent, unfixable, and
attached to an element with no class name to search for.

**A check that can only pass and a check that cries wolf fail the same way:
nobody reads the output.**

## What was done

### 1. Both walks stop before `<body>`

An `overflow: hidden` on the page root is not "this is deliberately clipped
decoration" — it is "this app does not scroll", and content pushed outside it
is exactly the defect worth reporting. A clip from a panel *inside* the page
still contains, as it should.

`npm run play` also gained the clip intersection it never had, and a direct
`documentElement.scrollWidth > clientWidth` check, which is the ground truth
that no per-element heuristic can stand in for.

### 2. The check that actually matters

For a layout that clips at its root, "does anything paint outside the window"
is the wrong question: the answer is always no. The failure mode that happens
is the opposite one — **a box that clips its own contents**.

`checkClippedText` compares `scrollWidth` against `clientWidth` (and the
vertical pair) for every element with its own text and a non-visible
`overflow`. It excludes the deliberate "there is more" cues, because those are
design decisions rather than defects:

- `text-overflow: ellipsis`
- `-webkit-line-clamp`
- a fade `mask-image` (which is what the sigil card's body text uses)
- anything scrollable (`overflow: auto | scroll`) — the ledger
- any box 3px or smaller, which is the visually-hidden idiom. This one was
  found by running it: every `.sr-only` in the showdown panel reported
  "clips its own text (135px wider than its box)", because clipping its text
  away is precisely what that element is for.

It runs on the menu, the table, the market and the showdown.

## Verification

`npm run responsive` 7/7 PASS with the repaired checks — the layout genuinely
holds, which was worth establishing given that the previous PASS meant nothing.
`npm run play` no longer reports the banner.

The clip predicate was proven directly against the live page before the
harness was re-run: an element overshooting inside a fixed, clipped container
reports *contained*, and an unclipped 2000px-wide element reports
*FLAGGED 0..2000*.
