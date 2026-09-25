# 020 — Grow the target prompt from the sigil that opened it

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM (additive)
- **Category**: 8 (Missed opportunities) / 3 (Physicality & origin)
- **Estimated scope**: 3 files, medium

## Problem

Spatially-connected UI should explain where it came from. The targeting prompt does not — and the connection it needs is already computed and then deliberately thrown away.

When a sigil needing a rank, suit or mark is cast, the prompt rises from screen centre:

```tsx
/* src/components/table/TargetPrompt.tsx:31-38 — current */
<motion.div
  className="prompt-panel"
  style={{ ['--school' as string]: school.accent }}
  initial={{ y: 24, scale: 0.95 }}
  animate={{ y: 0, scale: 1 }}
  exit={{ y: 16, scale: 0.97 }}
  transition={{ type: 'spring', stiffness: 340, damping: 28 }}
>
```

Meanwhile the rail has already located the exact card the player picked, and armed a spell flight from it:

```tsx
/* src/components/table/Rail.tsx:64-74 — current */
const originEl = railRef.current?.querySelector(`[data-sigil-uid="${CSS.escape(uid)}"]`) ?? null;
if (def) {
  if (def.target === 'none' || def.target === 'stack') {
    spellFlight.fireNow(originEl, immediateFlightTarget(), def.school, def.glyph);
  } else {
    spellFlight.arm(originEl, def.school, def.glyph);
  }
}
```

For the `rank`/`suit`/`inscribe` targets, `arm()` holds that origin waiting for a card or player pick that never comes — the target is a rank, not an element — and the armed flight is then cancelled:

```tsx
/* src/components/table/Rail.tsx:60-62 — current */
useEffect(() => {
  if (!targeting) spellFlight.cancel();
}, [targeting]);
```

So the one piece of spatial information the interaction has — *this dialog came from that card in your hand* — is computed, held, and discarded, and the player sees a panel teleport to the middle of the screen.

The card path and the player path do not have this problem: `spellFlight` releases at the picked card or seat, which is correct spatial storytelling. Only the abstract targets are orphaned.

## Target

The prompt panel scales from the rect of the sigil card that opened it. A popover anchored to a trigger scales from that trigger, not from its own centre — expressed with `transform-origin`.

Publish the origin as a CSS custom property, the way the codebase already publishes per-element values:

```tsx
/* target — src/components/table/Rail.tsx, in handleBeginCast */
const originEl = railRef.current?.querySelector(`[data-sigil-uid="${CSS.escape(uid)}"]`) ?? null;
if (def) {
  if (def.target === 'none' || def.target === 'stack') {
    spellFlight.fireNow(originEl, immediateFlightTarget(), def.school, def.glyph);
  } else if (def.target === 'card' || def.target === 'player') {
    spellFlight.arm(originEl, def.school, def.glyph);
  } else {
    // rank / suit / inscribe: there is no element to fly to, so instead of
    // arming a flight that will be cancelled, hand the prompt the origin it
    // should grow from.
    const r = originEl?.getBoundingClientRect();
    if (r) {
      document.documentElement.style.setProperty('--prompt-origin-x', `${r.left + r.width / 2}px`);
      document.documentElement.style.setProperty('--prompt-origin-y', `${r.top + r.height / 2}px`);
    }
  }
}
```

```tsx
/* target — src/components/table/TargetPrompt.tsx:31-38 */
<motion.div
  className="prompt-panel"
  style={{ ['--school' as string]: school.accent }}
  initial={{ opacity: 0, transform: 'scale(0.92)' }}
  animate={{ opacity: 1, transform: 'scale(1)' }}
  exit={{ opacity: 0, transform: 'scale(0.96)' }}
  transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
>
```

```css
/* target — src/scenes/table.css, on .prompt-panel */
.prompt-panel {
  /* Grow from the sigil that opened this, not from the middle of the screen.
     Rail.tsx publishes the card's centre; the fallback is the panel's own
     centre, which is what a keyboard-initiated cast gets. */
  transform-origin: var(--prompt-origin-x, 50%) var(--prompt-origin-y, 50%);
}
```

Note the `y: 24` travel is dropped. With a real origin the scale alone carries the connection; keeping both would read as two separate motions.

**Important**: `transform-origin` with viewport-pixel values resolves relative to the element's own border box, not the viewport. The published values must therefore be **relative to the panel**, not absolute. Compute them at prompt-mount time instead:

```tsx
/* target — src/components/table/TargetPrompt.tsx, a layout effect */
const panelRef = useRef<HTMLDivElement>(null);
useLayoutEffect(() => {
  const el = panelRef.current;
  const ox = document.documentElement.style.getPropertyValue('--prompt-origin-x');
  const oy = document.documentElement.style.getPropertyValue('--prompt-origin-y');
  if (!el || !ox || !oy) return;
  const r = el.getBoundingClientRect();
  el.style.transformOrigin = `${parseFloat(ox) - r.left}px ${parseFloat(oy) - r.top}px`;
}, []);
```

This runs before paint, so the first animated frame already has the right origin.

## Repo conventions to follow

- `src/components/table/Rail.tsx:67` already uses `CSS.escape` with a `data-sigil-uid` selector to find the origin element. Reuse that exact lookup — do not add a ref.
- `src/components/fx/useCardAnchors.ts` is the repo's existing pattern for resolving element rects for fx purposes. Read it first: if it already exposes a helper for "the rect of the sigil with this uid", use that instead of a new `getBoundingClientRect` call.
- Per-element values are passed as CSS custom properties in inline `style` throughout `src/vfx/` and `src/components/card/`. Follow that, not a React context.

## Steps

1. Read `src/components/fx/useCardAnchors.ts` and `src/components/fx/SpellFlight.tsx` to understand how origins are currently resolved and whether a helper already exists.
2. `src/components/table/Rail.tsx:64-74` — branch on `def.target` as in **Target**, so `rank`/`suit`/`inscribe` publish an origin instead of arming a flight that gets cancelled.
3. `src/components/table/Rail.tsx:60-62` — the `spellFlight.cancel()` effect stays; it is still correct for the card/player paths. Confirm it does not now cancel something that was never armed (cancel should be idempotent — verify in `SpellFlight.tsx`).
4. `src/scenes/table.css` — add the `transform-origin` declaration to `.prompt-panel`.
5. `src/components/table/TargetPrompt.tsx` — add the ref and the `useLayoutEffect` from **Target**; change the panel's `initial`/`animate`/`exit` to the scale-only form.
6. Clear the published properties when the prompt closes, so a subsequent keyboard-initiated cast does not inherit a stale origin: remove them in the same `useLayoutEffect`'s cleanup.
7. Handle the keyboard/gamepad path: a cast initiated without a pointer still has a sigil element, so the origin resolves the same way. Verify it does; if the rail element cannot be found, the CSS fallback (`50% 50%`) applies and the panel grows from its own centre, which is the correct degradation.

## Boundaries

- Do NOT change the card-targeting or player-targeting flows — `spellFlight.arm`/`release` is already correct for them.
- Do NOT change what the prompt contains, its cancel behaviour, or the `onPointerDown` scrim dismissal at `TargetPrompt.tsx:29`.
- Do NOT move the panel's position — it still appears centred; only its *origin* changes.
- Do NOT add a dependency (no Floating UI).
- If `useCardAnchors.ts` already solves this, use it and simplify the plan rather than adding a parallel mechanism — note what you found.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` completes — the harness drives a spell cast.
- **Feel check**: run `npm run dev`, get a rank-targeting or suit-targeting sigil into hand:
  - Cast it. The prompt must **grow out of the sigil card** you clicked, not from screen centre.
  - Cast a sigil at the far left of the rail, then one at the far right. The growth origin must visibly differ.
  - With the Animations panel at 10%, confirm the first frame already has the correct origin — no jump on frame two.
  - Cancel and re-cast a different sigil; confirm the origin updates rather than reusing the previous one.
  - Cast via keyboard/gamepad. Confirm it either grows from the sigil (if the element resolves) or from centre (the fallback) — but never from a stale position.
  - Confirm the card-targeting flow still shows the spell flight from card to target, unchanged.
- **Done when**: the abstract-target prompt is spatially connected to its sigil, no armed flight is created only to be cancelled, and the keyboard path degrades to a centred origin rather than a wrong one.
