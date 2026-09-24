# 029 — The plate

- **Status**: DONE
- **Severity**: MEDIUM (it is what the game looks like)
- **Category**: visual design
- **Scope**: `base.css`, `ui.css`, `menu.css`, `codex.css`, `shop.css`, `onboarding.css`, `table.css`, five components

## Problem

Every panel in the game was the same object:

```css
border-radius: var(--r-lg);                       /* 18–26px, uniform */
background: linear-gradient(180deg, …, …);        /* soft vertical fade */
border: 1px solid var(--line-soft);               /* one hairline */
box-shadow: …, inset 0 1px 0 rgba(255,255,255,.04);
backdrop-filter: blur(12px);                      /* frosted glass */
```

That is the default surface of every UI framework and every design tool
shipped in the last five years. It is competent and it is anonymous — it reads
as a settings dialog, not as something a wizard owns. The owner's word for it
was that the menus "look very AI", which is exactly right: it is the shape
produced by not making a decision.

## The grammar that replaced it

An engraved plate, `.hx-plate`:

- **A chamfered corner**, not a rounded one. Two opposite corners are cut flat.
  Nothing in a browser does this by accident, so it reads as cut metal rather
  than as a rectangle with its edges softened.
- **A double rule** — a gold hairline, a dark channel, a second fainter line —
  the way a plate in a printed book is bordered.
- **Registration marks** at the two corners the chamfer leaves square, the way
  a ritual diagram is squared up.
- **One faint ring**, off-centre, under the content, at about five percent.
- **No backdrop blur.** Frosted glass is the single most dated surface in
  modern interface design. A plate is opaque.

Squared buttons (3px), chamfered coven chips, squared codex tabs, and the two
full-screen scrims changed from `blur() saturate()` to a radial wash.

## Two things that had to be got right

**`inset` box-shadow cannot follow a `clip-path`.** The first version drew the
rule with inset shadows and the chamfer with a clip, and the diagonal corners
came out bare — the shadow is painted inside the border box and then the clip
cuts it away. The element's own background is now the rule colour, and a
`::before` inset by 1px carries the fill with its own matching clip. The line
follows the cut because it *is* the shape underneath it.

**`clip-path` clips `outline`, and focus is an outline.** Chamfering a control
would have silently removed its gold focus ring — on a game whose primary
input is a controller and whose gamepad harness asserts a visible focus
indicator. Clipped controls take an `inset` box-shadow ring instead, which is
inside the clip and survives it. The buttons themselves were given a small
radius rather than a chamfer for exactly this reason: a chamfer is not worth a
focus ring.

## Verified

`npm test` (133), `npm run responsive` 7/7, `npm run play:pad` 9/9 — including
"a direction press focuses something" and "the button legend is visible",
which are the checks that would have caught a lost focus ring. The focus state
was also read directly out of a chamfered chip: `outline: none`, `box-shadow:
rgb(240,196,101) 0 0 0 2px inset`, clip intact.
