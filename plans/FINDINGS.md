# What the audit actually found

The 21 plans in this folder came from one audit pass. Executing them, and then
re-auditing the result eight more times, turned up a second set of defects that
no plan predicted — including several introduced by the fixes themselves. This
is the record of those, because they are the ones most likely to come back.

## Defects that were shipping, which no plan predicted

**`npm run typecheck` had never worked.** Both branches failed —
`tsc -b --noEmit false` conflicts with `allowImportingTsExtensions`, and the
fallback referenced a `tsconfig.app.json` that does not exist. Every plan's
"mechanical check" depended on it. Fixed to `tsc -p tsconfig.json --noEmit`.

**92 stale `.js` files sat next to their `.ts` sources** in `src/`, `shared/`
and `server/` — emitted by that broken script forcing `--noEmit false`. Stale,
untracked, and a module-resolution hazard. Deleted, and `.gitignore` now covers
the pattern.

**`window.__hexholdView` was never published.** `test/playthrough.mjs` had read
it since it was written, so `readState()` always returned `null` and every check
built on it — including the `final state` line, which never printed — was
silently inert. The store now publishes it.

**The achievement warning was backwards.** `npm run play` warned "unlocked
nothing — check the achievement watcher" whenever the scripted player happened
to win no pot, which is most runs. The watcher was fine. It now latches whether
a pot was actually won and only warns when a win produced no unlock — and
`test/achievements.test.ts` proves the watcher deterministically, which is what
SHIPPING.md should have been leaning on all along.

**Two more harness false positives**, both of which would have blocked a
release checklist: the first-run intro check sampled once and raced the first
paint, and being *eliminated* was reported as "the table looks stuck".

## Defects introduced by the fixes, caught by re-auditing

These are the ones worth internalising, because each looked correct when
written.

**The reduced-motion blanket rule could not work at any specificity.** Written
plainly, `:root[data-reduced-motion='1'] *` is (0,2,0) and *beats* an ordinary
class rule — it silently collapsed two information-carrying countdowns to 1ms
with `forwards`, so they read "expired" the moment they opened. Wrapping the
ancestor in `:where()` to zero the specificity fixed that and created the
opposite failure: nothing in the codebase declares an animation at (0,0,0), so
the rule matched everything and overrode nothing — a complete no-op, while five
loops ran unreduced. There is now no blanket rule. Each loop is named where it
lives, and `tokens.css` explains why at length.

**Stopping an animation is not the same as calming it.** `animation: none`
returns an element to its base rule, which was wrong in *both* directions:
`.hx-fx--echo` and `.vfx-pulse i` have `opacity: 0` as their base and vanished
entirely; `.hx-mark--echo::after`, `.hx-fx--cursed` and `.hx-fx--burning`
declare no opacity, so they rested at `1` — *louder* than their keyframes ever
reached. `.hx-q__layer` was the worst: every candidate face of an uncollapsed
card rendered at full ink at once, 3px apart, which is unreadable. Turning
motion down must never delete a cue or turn one up.

**A CSS `animation` shorthand at higher specificity wipes out `animation-name`.**
Adding the urgent glow to the turn timer stopped the countdown drain — in
normal mode — because `.fx-turntimer.is-urgent .fx-turntimer-fill` (0,3,0) beat
`.fx-turntimer-fill.is-running` (0,2,0) and replaced the shorthand wholesale.
The two are now listed together in one rule.

**An inline style beats every author rule.** Moving the camera shake from three
inherited custom properties to a direct `root.style.transform` was the right
performance call, and it silently killed the `.vfx-shaking { transform: none }`
that had been suppressing shake under reduced motion. That check now lives in
`VfxLayer.shake()` itself.

**Dropping `mode="wait"` leaves two scenes mounted at once.** Correct for
latency, but the outgoing scene stays clickable through the crossfade. Both
`App.tsx` and `Menu.tsx` now set `pointerEvents: 'none'` on exit.

**A guard test can be worse than no guard test.** The first version of
`test/motion.test.ts` compared selector strings for equality — but a
reduced-motion rule is written on a base class while the animation lives on a
modifier or a descendant, so it asserted on 2 of 26 targets and passed while
three real defects sat in the repo. It also harvested every class token from a
`<motion.*>` className, which swept up shared utilities like `.mono` and would
have failed in files that never touch framer — the kind of false positive that
gets a test deleted rather than obeyed. The rewrite resolves BEM modifiers to
their base, compares rightmost compounds, validates pin *values* against the
keyframe peak, parses keyframes and transforms with balanced-brace scans rather
than regexes that truncate, and checks transform pins by asking whether identity
falls inside the animated range. Every assertion in it has been verified to fail
on a reintroduced bug.

**A blend mode is not a colour, and `overlay` leaves dark surfaces dark.** The
specular highlight lifted out of `Card.tsx` into `usePointerFoil` was dropped
onto the sigils with the playing cards' `mix-blend-mode: overlay`. Every
computed style said it was working — mounted, correct opacity, gradient
tracking the pointer across the frame — and it was invisible on all 45 sigils,
because a sigil frame is near-black and overlay's entire job is to preserve
that. The sigil foil uses `screen`. Found by cropping a screenshot; no amount
of reading the DOM would have shown it. Anything that lights a surface needs
proving on the darkest and the lightest surface it will ever sit on.

**The whole symbol set was one font away from being empty boxes.** Every
sigil, relic, omen and card mark was a Unicode character, and the font stack
(`Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`) contains
none of `🜂 ⑃ ⌸ ⟒ ⟆ ⨭ ⚱`. On Windows the browser reaches past the stack to
Segoe UI Symbol and the set looks perfect; SteamOS has no Segoe anything.
Measuring all 45 sigil glyphs against `U+FFFF` on this machine found zero
missing, which is precisely what made it dangerous. Two further problems came
out of the same audit: thirty characters were shared by two or three entries
(`⧖` was both Echo of a Hand and Tessellate; `👁` was a sigil, a relic AND an
omen), and the set ranged from 7.5px to 15px wide at one font size, including
two colour emoji that ignore `color` entirely. All 102 are drawn now.

**A guard test can be wrong in three different directions before it is
right.** The bounds check in `test/marks.test.tsx` first read every number in a
`d` attribute as a coordinate — but relative commands carry deltas and an arc's
`rx ry rot large sweep` are not positions, so it failed 58 of 100 correct
marks. Bounding arcs by `endpoint ± radius` was loose by a whole radius.
Bounding them by the full ellipse is right for a large arc and put a crescent
at x=32 for a minor one. It now walks the path, splits on the large-arc flag,
and projects a minor arc's sagitta perpendicular to its chord. Every assertion
was then mutation-tested against a reintroduced defect.

**Two layout harnesses were asking a question that cannot fail.** Both
`npm run play` and `npm run responsive` checked "does any element extend past
the viewport". `responsive` intersected each element with its clipping
ancestors first, which is correct in principle — except the walk ran all the
way to `<body>`, and this app sets `overflow: hidden` on both `.app` and
`body` because it is a full-screen game that does not scroll. Every element on
the page therefore clipped to exactly the viewport, and the check reported
"nothing overflows" at every resolution, forever. `play` did not clip at all,
so it reported the omen banner's glow bar — a decoration inside a fixed,
viewport-sized, `overflow: hidden` container, physically incapable of reaching
the screen edge — as a LAYOUT failure on any run where an omen happened to
fire.

Both are fixed, but the more useful outcome is what the exercise exposed: for
an app that clips at its root, "does anything paint outside the window" is the
wrong question, because the answer is always no. The failure mode that
actually happens is the opposite one — a box that clips its own contents. Both
real bugs found at 1024x680 (a sigil reading "Doppelgange", BIND reading
"BIN") were exactly that, and both had to be found by looking at screenshots.
`checkClippedText` now asks it directly, excluding the deliberate "there is
more" cues: an ellipsis, a line clamp, a fade mask, a scrollable panel.

**A third test that could not fail.** `test/render.test.tsx` builds a JSDOM
and defines a dozen globals on it — `window`, `document`, `navigator`,
`CSS`, `AbortController` — and never defined `localStorage`. `profile.ts`
uses the bare identifier, so every read and write inside it threw, its own
try/catch swallowed the throw (correctly — that is there for private
browsing), and three profile tests passed against no storage whatsoever. It
surfaced only because a new test asserted something storage-dependent that
the in-memory return value could not fake. Defined now, and the same tests
pass for the right reason.

**Covens made an old redaction assertion wrong.** `net.test.ts` checked that
an opponent's hole card has `state === 'facedown'`. A bot on The Unmoored is
dealt one in superposition, so the state is `quantum` — still redacted, and
the line above it (`c.face === null`) is the assertion that actually
guarantees no leak. Pinning the exact state made a new feature look like a
security regression. It now accepts any state that hides the card.

**A camera shake makes every fixed layer look like a layout bug.** `shake()`
writes an inline transform to `#root`, which makes it the containing block
for every `position: fixed` element in the app — so the whole viewport
moves, which is the entire point, and each fixed layer measures a few pixels
past the window while it runs. `npm run play` sampled mid-shake and reported
`.stackview` and `.hints-layer` as running off the bottom by four pixels. The
layout check now returns early while the root carries a transform, because
geometry measured during a shake is not geometry.

## Known remaining flakiness

`npm run play` fails roughly 1 run in 5 with "the table looks stuck", in runs
where the scripted player gets no turns at all. The app itself is clean under
that condition — six consecutive probe runs mount correctly with zero console
errors, `npm run sim` reports no deadlocks across long bot games, and the only
changes to `server/` in this work were removed unused imports (verifiable in
`git diff server/`). It is worth a look before release, but it is a harness
problem, not a gameplay one.
