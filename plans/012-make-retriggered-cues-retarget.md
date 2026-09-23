# 012 — Make rapidly-retriggered cues retarget instead of restart

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM
- **Category**: 4 (Interruptibility)
- **Estimated scope**: 4 files, medium

## Problem

CSS transitions retarget from the current state mid-flight; `@keyframes` restart from zero. Anything triggered rapidly must use a transition or a spring. Four cues here use a `useEffect` + class toggle driving a keyframe — and one of them is outright broken by it.

**1. The pot jump does not fire more than once per 460ms — and silently.**

```tsx
/* src/components/table/Board.tsx:30-39 — current */
const [jumping, setJumping] = useState(false);
const prevPot = useRef(view.pot);
useEffect(() => {
  if (view.pot === prevPot.current) return;
  prevPot.current = view.pot;
  setJumping(true);
  const t = window.setTimeout(() => setJumping(false), 460);
  return () => window.clearTimeout(t);
}, [view.pot]);
```

```css
/* src/scenes/table.css:431-439 — current */
.pot-amount.is-jumping {
  color: var(--gold-hi);
  animation: pot-jump 460ms var(--ease-snap);
}
@keyframes pot-jump {
  0%   { transform: scale(1); }
  35%  { transform: scale(1.22); }
  100% { transform: scale(1); }
}
```

Trace it: pot changes, `jumping` goes true, the class is applied, the keyframe runs. A second bet lands 200ms later — the cleanup clears the pending timer, the effect re-runs, `setJumping(true)` is called while `jumping` is **already** true, so React does not re-render, the class never toggles off and on, and **the animation does not re-fire**. Three raises in one street produce one jump. The cue for "the pot moved" is missing exactly when the pot is moving most.

**2. The sigil pop, same pattern, on the most rapidly-changing state at the table.**

```tsx
/* src/components/table/SigilCard.tsx:32-43 — current */
if (usable && !wasUsable.current) {
  setJustUsable(true);
  const t = window.setTimeout(() => setJustUsable(false), 260);
```

```css
/* src/scenes/table.css:648-653 — current */
.sigil.is-justcastable .sigil-frame { animation: sigil-pop 260ms var(--ease-snap); }
@keyframes sigil-pop {
  0%   { transform: scale(1); }
  45%  { transform: scale(1.08); }
  100% { transform: scale(1); }
}
```

Mana crosses a sigil's cost repeatedly within one betting round, so this re-triggers constantly and either cuts dead or is suppressed.

**3. The vignette restarts via a forced reflow.**

```tsx
/* src/vfx/VfxLayer.tsx:309-311 — current */
el.classList.remove('is-on');
void el.offsetWidth; // restart the keyframe
el.classList.add('is-on');
```

An explicit layout-forcing hack whose only purpose is to restart a keyframe from zero. Spell casts, counterspells and impossible-hand hits fire in bursts; each new vignette snaps the previous one back to 0% opacity instead of continuing from where it was.

**4. The counterspell punch fights framer for the same property.**

```css
/* src/scenes/table.css:926-936 — current */
.stack-item.is-countered { opacity: 0.45; animation: stack-impact 320ms var(--ease-snap); }
@keyframes stack-impact {
  0%   { transform: translateX(0) scale(1); }
  18%  { transform: translateX(-7px) scale(1.035); }
  /* ... */
}
```

while `src/components/table/StackOverlay.tsx:90-92` gives the same element `initial={{ opacity: 0, x: -20 }}` — two systems writing `transform` on one node. A second entry countered while the first punch is mid-flight restarts from `translateX(0) scale(1)`.

## Target

**Pot jump** — drive it from a transition on a value, so a second change retargets:

```tsx
/* target — src/components/table/Board.tsx, replacing the jumping state */
/* A counter rather than a boolean: every pot change increments it, so React
   always re-renders and the cue always fires — including three times in one
   street. */
const [jumpSeq, setJumpSeq] = useState(0);
const prevPot = useRef(view.pot);
useEffect(() => {
  if (view.pot === prevPot.current) return;
  prevPot.current = view.pot;
  setJumpSeq((n) => n + 1);
}, [view.pot]);
```

and let framer own the motion, which retargets natively:

```tsx
/* target — src/components/table/Board.tsx, on the pot amount span */
<motion.span
  className="pot-amount mono"
  key={jumpSeq}
  initial={{ scale: 1.18 }}
  animate={{ scale: 1 }}
  transition={{ type: 'spring', duration: 0.4, bounce: 0.3 }}
>
```

Then delete the `.pot-amount.is-jumping` rule and the `pot-jump` keyframes from `src/scenes/table.css:431-439`, and the `:root[data-reduced-motion='1']` override at `:440` becomes unnecessary — the reduced-motion branch goes in the component instead, following `ActionBar.tsx:89-91`'s existing shape.

**Sigil pop** — same treatment, a `key`-bumped spring on the existing `motion` wrapper in `SigilCard.tsx` rather than a class-toggled keyframe. Delete `.sigil.is-justcastable .sigil-frame`, the `sigil-pop` keyframes, and the reduced-motion override at `:654`.

**Vignette** — replace the keyframe with a transition so a burst layers instead of snapping:

```css
/* target — src/vfx/effects.css, replacing the .vfx-vignette.is-on animation at :70-72 */
.vfx-vignette {
  opacity: 0;
  transition: opacity var(--vfx-vignette-ms, 900ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}
.vfx-vignette.is-on { opacity: 1; }
```

```tsx
/* target — src/vfx/VfxLayer.tsx:309-311 */
/* No forced reflow. Setting the class on, then scheduling it off, lets the
   transition retarget from wherever it currently is when a second vignette
   arrives mid-fade. */
el.classList.add('is-on');
window.clearTimeout(this.vignetteOff);
this.vignetteOff = window.setTimeout(() => el.classList.remove('is-on'), ms);
```

This changes the vignette's shape from the current three-stop eased keyframe (fast in, settle at 55–80%, fade out) to a symmetric fade. If the settle is wanted, keep it by transitioning to an intermediate opacity and then to 0 in the timeout — but do not reintroduce the reflow.

**Counterspell punch** — pick one owner for `transform`. framer already owns the element's entrance, so move the punch there:

```tsx
/* target — src/components/table/StackOverlay.tsx, on the countered item */
animate={countered
  ? { opacity: 0.45, x: [0, -7, 5, -2, 0] }
  : { opacity: 1, x: 0 }}
transition={{ type: 'spring', duration: 0.32, bounce: 0.25 }}
```

and delete `animation: stack-impact ...` from `src/scenes/table.css:926` plus the `stack-impact` keyframes and the reduced-motion override at `:937`.

## Repo conventions to follow

- `src/components/Toasts.tsx` is the repo's model for this: framer `initial`/`animate`/`exit` with `layout` and a short transition — toasts stack and unstack and always retarget, with no keyframes anywhere in the path.
- The Apple-style spring form is `{ type: 'spring', duration: n, bounce: n }`. Bounce stays in 0.1–0.3; reserve visible bounce for genuinely playful moments. The pot jump earns 0.3; the sigil pop 0.2.
- Reduced-motion branching in components follows `src/components/table/ActionBar.tsx:89-91`: a ternary on the hook's boolean, with a short `duration` fallback.

## Steps

1. `src/components/table/Board.tsx:30-39` — replace the `jumping` boolean with the `jumpSeq` counter as in **Target**.
2. `src/components/table/Board.tsx` — find the `.pot-amount` span (around `:117`, it currently renders `${jumping ? 'is-jumping' : ''}`) and convert it to the keyed `motion.span` in **Target**. Keep the `RollingNumber` child untouched. Add the reduced-motion branch.
3. `src/scenes/table.css:431-440` — delete `.pot-amount.is-jumping`, the `pot-jump` keyframes, and the `:root[data-reduced-motion='1']` override. Keep `.pot-amount`'s own `transition: color ...` (plan 017 adjusts its duration).
4. `src/components/table/SigilCard.tsx:32-43` — replace the `justUsable` boolean with a `popSeq` counter, and move the pop onto the existing framer wrapper as a keyed `initial`/`animate` spring.
5. `src/scenes/table.css:648-654` — delete `.sigil.is-justcastable .sigil-frame`, the `sigil-pop` keyframes, and the reduced-motion override.
6. `src/vfx/effects.css:70-72` — replace the `.vfx-vignette.is-on` animation with the transition form in **Target**.
7. `src/vfx/VfxLayer.tsx:309-311` — remove the `void el.offsetWidth` reflow and use the add-then-schedule-off form. Store the timeout handle on the controller instance so repeated calls clear the previous one.
8. `src/components/table/StackOverlay.tsx:88-92` — move the punch into the framer `animate` prop as in **Target**.
9. `src/scenes/table.css:926-937` — delete the `animation` from `.stack-item.is-countered` (keep `opacity: 0.45`), the `stack-impact` keyframes, and the reduced-motion override.
10. Re-grep for the pattern elsewhere: `grep -rn "setTimeout" src/components src/scenes | grep -i "anim\|pop\|jump\|pulse\|flash"` — any other effect-toggles-a-keyframe pair has the same defect and should be reported even if not fixed here.

## Boundaries

- Do NOT remove any of these four cues. Each answers a real question ("the pot moved", "you can cast this now", "a spell resolved", "that was countered").
- Do NOT change the pot's `RollingNumber` count-up — the comment at `Board.tsx:28-29` explains the jump is deliberately separate from it so the roll never restarts. Preserve that separation.
- Do NOT reintroduce `void el.offsetWidth` anywhere.
- Do NOT add a dependency.
- If removing a `:root[data-reduced-motion='1']` override would leave a motion path uncovered, add the equivalent branch in the component before deleting the CSS.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` completes.
- **Feel check**: run `npm run dev` against bots:
  - **The regression test for this plan**: get three raises into one betting street and watch the pot. It must jump **three times**. Before the fix it jumps once.
  - Hover near a sigil while mana oscillates across its cost (raise and fold repeatedly). The pop must fire each time it becomes castable, and re-firing mid-pop must look continuous, not restarted.
  - Cast two spells in quick succession. The vignette must layer smoothly — the second must not snap the screen back to clear first.
  - Counter a spell while another counter animation is still playing. Both punches must read.
  - With the Animations panel at 10%, retrigger each cue mid-flight and confirm it **continues from its current value** rather than snapping to the start.
  - Turn on reduce motion and confirm all four still give a cue, just a calm one.
- **Done when**: no cue in this plan can be suppressed by rapid re-triggering, `grep -rn "offsetWidth" src` returns nothing, and no element has both a CSS `animation` and a framer `transform` writing to it.
