# 006 — Delete the 420ms sheen sweep from every button

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 1 (Purpose & frequency) / 2 (Easing & duration)
- **Estimated scope**: 1 file, tiny

## Problem

```css
/* src/styles/ui.css:30-39 — current */
.btn::after {
  /* Specular sweep on hover. */
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(100deg, transparent 30%, rgba(255, 255, 255, 0.14) 50%, transparent 70%);
  transform: translateX(-120%);
  transition: transform var(--t-slow) var(--ease-out);
  pointer-events: none;
}
```

```css
/* src/styles/ui.css:46 — current */
.btn:hover:not(:disabled)::after { transform: translateX(120%); }
```

Three separate rules are broken at once:

1. **Duration.** `--t-slow` is 420ms. The ceiling for interactive UI is 300ms; button feedback belongs at 100–160ms. This is nearly three times the budget for the element it sits on.
2. **Frequency.** `.btn` is the base button component. This fires on hover of *every* button in the game, including Fold, Check, Call, Raise and All In — the controls the mouse crosses constantly. Hover effects hit that often should be drastically reduced or removed.
3. **Purpose.** A specular sweep answers no question about state. The button already has a hover response one rule below it (`src/styles/ui.css:41-45`: a 1px lift, a border-colour change and an elevation bump), which does the actual job of saying "this is interactive".

It is also ungated hover motion on a machine with a touchscreen — see plan 011 — so on Steam Deck a tap leaves the sheen parked mid-sweep.

## Target

Delete it. Both rules. The remaining hover state is sufficient and already correct:

```css
/* target — src/styles/ui.css, what remains */
.btn:hover:not(:disabled) {
  transform: translateY(-1px);
  border-color: var(--surface-3);
  box-shadow: var(--e-2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
}
.btn:active:not(:disabled) { transform: translateY(1px) scale(0.985); }
.btn:disabled { opacity: 0.4; filter: saturate(0.4); }
```

If a sheen is wanted somewhere, it belongs on a rare, celebratory surface — a shop item, a just-unlocked relic — not on the base button. The repo already has the right tool for that: `<Shimmer />` in `src/vfx/` (documented in `src/vfx/README.md`), which is opt-in per element.

## Repo conventions to follow

- `src/styles/ui.css` is the shared component layer; `.btn` is consumed by every scene. A change here is global by design.
- `overflow: hidden` on `.btn` (`src/styles/ui.css:28`) exists to clip this pseudo-element. Check whether anything else in the button depends on it before removing it — the `.btn-primary` gradient may. If in doubt, leave `overflow: hidden` in place; it costs nothing.

## Steps

1. `src/styles/ui.css:30-39` — delete the entire `.btn::after` rule.
2. `src/styles/ui.css:46` — delete the `.btn:hover:not(:disabled)::after` rule.
3. Grep for other users of the pseudo-element before finishing: `grep -rn "btn::after\|\.btn::after" src`. If a variant style (e.g. `.btn-primary::after`) overrides it, remove that too or confirm it is independent.
4. Leave `overflow: hidden` on `.btn` unless you can confirm nothing else clips to it.

## Boundaries

- Do NOT remove or alter the `:hover` lift, the `:active` press, or the `:disabled` state.
- Do NOT touch `.btn-primary`, `.btn-ghost` or any other variant's colours.
- Do NOT replace the sweep with a different decorative effect.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run responsive` still passes all seven resolutions.
- **Feel check**: run `npm run dev`:
  - Hover Fold, Call and Raise in turn. Each must respond **immediately** with the 1px lift and border change, and nothing should sweep across it.
  - Sweep the mouse quickly along the action bar across all buttons. Before the fix this produced a train of 420ms sweeps chasing the cursor; after, the row should feel still.
  - Confirm the buttons still read as interactive — if they now feel dead, the problem is the remaining hover state, not the missing sweep; report rather than re-adding the sweep.
- **Done when**: `grep -rn "Specular sweep" src` returns nothing, and no button animates anything on hover except the lift.
