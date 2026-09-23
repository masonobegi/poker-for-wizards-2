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

## Known remaining flakiness

`npm run play` fails roughly 1 run in 5 with "the table looks stuck", in runs
where the scripted player gets no turns at all. The app itself is clean under
that condition — six consecutive probe runs mount correctly with zero console
errors, `npm run sim` reports no deadlocks across long bot games, and the only
changes to `server/` in this work were removed unused imports (verifiable in
`git diff server/`). It is worth a look before release, but it is a harness
problem, not a gameplay one.
