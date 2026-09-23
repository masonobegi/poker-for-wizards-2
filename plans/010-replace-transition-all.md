# 010 — Replace every `transition: all` with an explicit property list

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM-HIGH
- **Category**: 5 (Performance)
- **Estimated scope**: 5 files, small-medium

## Problem

`transition: all` animates unintended properties off the GPU — always a finding. There are **11** of them, and because `all` sweeps *every* property that changes, each one arms a set of layout-triggering properties that were never meant to animate.

Each row below is the declaration, and what its own `:hover`/`.is-*` rules actually change versus what `all` additionally arms.

**`src/scenes/table.css:990` — `.stack-option`** — the worst of the set.

```css
/* current */
.stack-option {
  --school: var(--veil);
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--s-3);
  padding: 10px 13px;
  /* ... */
  transition: all var(--t-fast);
}
.stack-option:hover {
  border-color: var(--school);
  background: color-mix(in srgb, var(--school) 12%, rgba(5, 6, 12, 0.5));
  transform: translateX(3px);
}
```

Intent: `border-color`, `background`, `transform`. `all` also arms `grid-template-columns`, `gap` and `padding` — grid tracks, gap and padding are the most expensive layout properties in the file, on a **timed decision UI**.

**`src/scenes/table.css:1081` — `.prompt-rank`** — and it drives colour through an overshoot curve.

```css
/* current */
.prompt-rank {
  aspect-ratio: 3 / 4;
  /* ... */
  font-size: var(--fs-md);
  transition: all var(--t-fast) var(--ease-snap);
}
.prompt-rank:hover {
  transform: translateY(-4px) scale(1.06);
  border-color: var(--gold);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5), 0 0 22px rgba(240, 196, 101, 0.4);
}
```

`--ease-snap` is `cubic-bezier(0.34, 1.56, 0.64, 1)` — y overshoots to 1.56. Only `transform` should carry that. Here it also drives `border-color` and a two-layer `box-shadow` **past their target values and back**, which for a colour means overshooting into a clamped value — a non-monotonic colour ramp. This is a 13-button grid, so hovering across the prompt repaints a card-shaped box-shadow repeatedly.

**`src/scenes/table.css:1097` — `.prompt-suit`** — same, and `all` arms `font-size: 34px` and `aspect-ratio: 1`. `font-size` on a transition list is the text-layout hazard.

**`src/scenes/table.css:1113` — `.prompt-mark`** — arms `grid-template-columns`, `gap`, `padding`.

**`src/scenes/table.css:838` — `.ab-preset`** — arms `padding: 4px 14px`, `border-radius`, `font-size`, `letter-spacing`, in a flex row: a padding change would reflow the whole `.ab-presets` row mid-transition.

**`src/scenes/table.css:735` — `.sigil-discard`** — arms `top: -7px; right: -7px; width: 20px; height: 20px` — absolute offsets, i.e. layout — and fires on every sigil hover.

**`src/scenes/table.css:493` — `.tbl-sidetab`** — arms `flex: 1`, `padding: 6px`, `font-size: 10px`, `letter-spacing: .18em` on a flex child.

**`src/components/codex.css:42` — `.codex-chip`** — `.is-on` adds a `box-shadow: 0 0 16px color-mix(...)`, so `all` sweeps a shadow blur radius every frame. Two rules above it, the same file already does it correctly: `codex.css:28` is `transition: background var(--t-fast), color var(--t-fast);`.

**`src/components/chat.css:86` — `.chat-send`** — arms `width: 34px`, `border-radius`, `font-size`.

**`src/scenes/lobby.css:130` — `.lobby-kick`** — arms `width: 24px; height: 24px; border-radius: 50%; font-size: 16px; line-height: 1`.

**`src/scenes/shop.css:165` — `.shop-dot`** — sweeps a `box-shadow` at `--t-base` (260ms) on a row of ready-dots that flip in quick succession, and arms `width: 9px; height: 9px`.

## Target

Every one becomes an explicit list naming only the properties that actually change. Where an overshoot curve is in play, only `transform` gets it — colour and shadow get `--ease-out`.

```css
/* target — src/scenes/table.css:990 */
.stack-option { /* ...unchanged... */
  transition: border-color var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out),
              transform var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/table.css:1081 */
.prompt-rank { /* ...unchanged... */
  transition: transform var(--t-fast) var(--ease-snap),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/table.css:1097 */
.prompt-suit { /* ...unchanged... */
  transition: transform var(--t-fast) var(--ease-snap),
              border-color var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/table.css:1113 */
.prompt-mark { /* ...unchanged... */
  transition: border-color var(--t-fast) var(--ease-out),
              transform var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/table.css:838 */
.ab-preset { /* ...unchanged... */
  transition: border-color var(--t-fast) var(--ease-out),
              color var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/table.css:735 */
.sigil-discard { /* ...unchanged... */
  transition: opacity var(--t-fast) var(--ease-out),
              color var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/table.css:493 */
.tbl-sidetab { /* ...unchanged... */
  transition: color var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/components/codex.css:42 */
.codex-chip { /* ...unchanged... */
  transition: background var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              box-shadow var(--t-fast) var(--ease-out),
              color var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/components/chat.css:86 */
.chat-send { /* ...unchanged... */
  transition: color var(--t-fast) var(--ease-out),
              border-color var(--t-fast) var(--ease-out),
              opacity var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/lobby.css:130 */
.lobby-kick { /* ...unchanged... */
  transition: color var(--t-fast) var(--ease-out),
              background var(--t-fast) var(--ease-out);
}
```

```css
/* target — src/scenes/shop.css:165 */
.shop-dot { /* ...unchanged... */
  transition: background var(--t-base) var(--ease-out),
              border-color var(--t-base) var(--ease-out),
              box-shadow var(--t-base) var(--ease-out);
}
```

Note that several of these previously had **no** easing function at all (bare `transition: all var(--t-fast)`), so they fell back to CSS default `ease`. For a pure hover/colour change `ease` is actually the right curve, so adding `var(--ease-out)` is a deliberate small change: these are state indications that should feel responsive. If a particular one reads worse, `var(--ease-out)` may be dropped from that colour leg — note it if so.

## Repo conventions to follow

- `src/components/codex.css:28` is the in-file exemplar of the correct form: `transition: background var(--t-fast), color var(--t-fast);`
- `src/scenes/table.css:128` also does it right: `transition: opacity var(--t-base), filter var(--t-base), transform var(--t-base) var(--ease-out);`
- Durations are always tokens (`--t-fast`, `--t-base`), never literals.

## Steps

1. Work through the 11 sites in the order listed in **Target**, replacing each `transition: all ...` declaration with the explicit list given. Change nothing else in the rule.
2. After each file, re-read the element's `:hover`, `:active` and `.is-*` rules and confirm every property they change appears in the new transition list. If one is missing, add it — a property that changes but is not in the list now snaps instead of transitioning.
3. Verify no `transition: all` remains: `grep -rn "transition: *all" src` must return nothing.
4. If plan 007 (press feedback) has already landed, confirm each `:active` rule's `transform` is covered by the new list. If 007 has not landed yet, it will depend on this — see the ordering note in `plans/README.md`.

## Boundaries

- Do NOT change any duration token, colour, size or layout value.
- Do NOT add `will-change` to any of these elements.
- Do NOT remove a `:hover` rule because it now looks redundant.
- Do NOT add a dependency.
- If an element's hover changes a property not listed in **Target**, add it rather than dropping the behaviour, and note the addition.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `grep -rn "transition: *all" src` returns nothing. `npm run responsive` passes.
- **Feel check**: run `npm run dev`:
  - Hover across the full rank grid in the targeting prompt (cast a rank-targeting sigil). The lift should overshoot slightly; the **border colour must not** — before the fix it visibly ramps past gold and back.
  - Open a counterspell window and hover the options. With DevTools → Performance recording, confirm no Layout entries during the hover.
  - Hover the bet presets in sequence; the row must not shift.
  - Hover a sigil so the discard button fades in. It must fade in place, with no size or position change.
  - Codex school chips: toggling one on must transition its glow without the chip resizing.
- **Done when**: no `transition: all` exists in `src/`, every hover still animates what it animated before, and DevTools shows no layout thrash on any of the hovers above.
