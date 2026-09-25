# 007 — Give every pressable element a press state

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: HIGH
- **Category**: 3 (Physicality & origin)
- **Estimated scope**: ~9 files, medium

## Problem

`whileTap` appears **zero times** in the codebase. There are exactly **three** `:active` rules in the entire repo:

```
src/styles/ui.css:47      .btn:active:not(:disabled) { transform: translateY(1px) scale(0.985); }
src/components/chat.css:59 .chat-emote:active { transform: scale(0.94); }
src/scenes/lobby.css:37    .lobby-code:active { transform: scale(0.99); }
```

Everything else that can be pressed has a hover state and no press response. The hover tells you the thing is clickable; nothing tells you the click landed. On a Steam title played with a gamepad — where there is no hover at all — that means the primary interactions of the game give no confirmation whatsoever.

**The sigil card — the game's primary verb.**

```tsx
/* src/components/table/SigilCard.tsx:68 — current */
whileHover={usable ? { y: -14, scale: 1.05, zIndex: 5 } : { y: -5 }}
```

`role={usable ? 'button' : undefined}`, `onClick` casts the spell, and there is no `whileTap` and no `.sigil:active` anywhere in `src/scenes/table.css` (1285 lines, checked).

**Playing cards.** Pressable during every targeting flow:

```tsx
/* src/components/card/Card.tsx:405-409 — current */
onClick={onClick ? handleClick : undefined}
role={onClick ? 'button' : 'img'}
tabIndex={onClick ? 0 : undefined}
```

styled only by `.hx-card-slot.is-interactive { cursor: pointer; }` (`src/components/card/card.css:58`).

**Seats.** Become buttons during targeting (`src/components/table/Seat.tsx:62-65`), have an attract-pulse (`src/scenes/table.css:166-171`), no press state.

**Seven more control families at the table**, all `transition: all var(--t-fast)` with a `:hover` and no `:active`: `.tbl-sidetab` (`table.css:484`), `.sigil-discard` (`:725`), `.ab-preset` (`:831`), `.stack-option` (`:979`), `.prompt-rank` (`:1072`), `.prompt-suit` (`:1089`), `.prompt-mark` (`:1103`).

**And every shell surface**: `.codex-tab` (`codex.css:19`), `.codex-chip` (`codex.css:34`), `.hh-tab` and `.hh-segmented-label` (`shell.css:139`, `:198`), `.chat-send` (`chat.css:80`), `.hint-mark__dismiss` (`onboarding.css:290`), `.lobby-kick` (`lobby.css:126`).

## Target

One shared press treatment, applied everywhere, at the value the rules specify: `transform: scale(0.97)` with `transition: transform 160ms ease-out`. Keep it subtle — the band is 0.95–0.98.

The repo already has the exact transition on most of these elements (`var(--t-fast)` = 160ms), so in CSS this is usually a one-line addition per selector.

```css
/* target — the pattern for every CSS-styled pressable */
.ab-preset:active { transform: scale(0.97); }
```

Where the element already has a hover transform, the press state must **compose** with it rather than cancel it:

```css
/* target — src/scenes/table.css, elements with a hover lift */
.prompt-rank:active { transform: translateY(-2px) scale(0.99); }
.prompt-suit:active { transform: translateY(-2px) scale(0.99); }
.stack-option:active { transform: translateX(3px) scale(0.98); }
.prompt-mark:active { transform: translateX(3px) scale(0.98); }
```

The lift halves and the scale dips — the element reads as pushed *into* the surface from wherever hover left it, rather than snapping back to origin.

For the framer-driven components, use `whileTap`, which also fires for keyboard Enter/Space and therefore covers the gamepad path:

```tsx
/* target — src/components/table/SigilCard.tsx:68 */
whileHover={usable ? { y: -14, scale: 1.05, zIndex: 5 } : { y: -5 }}
whileTap={usable ? { y: -10, scale: 0.99 } : undefined}
```

```tsx
/* target — src/components/card/Card.tsx, on the outer motion.div at :398 */
whileTap={onClick ? { scale: 0.97 } : undefined}
```

```tsx
/* target — src/components/table/Seat.tsx, on the seat wrapper */
/* The seat is a plain <div>, so add a CSS rule instead: */
```

```css
/* target — src/scenes/table.css, next to .seat.is-targetable at :166 */
.seat.is-targetable:active .seat-pod { transform: scale(0.98); }
```

## Repo conventions to follow

- `src/styles/ui.css:47` is the exemplar to imitate — the one button in the repo that already does this correctly:
  ```css
  .btn:active:not(:disabled) { transform: translateY(1px) scale(0.985); }
  ```
- Transitions use `var(--t-fast)` (160ms) and `var(--ease-out)`. Most of these elements already have a `transition` declaration; after plan 010 they will list `transform` explicitly, which is what the press state needs. **Run plan 010 first** so you are adding `:active` to rules that already transition `transform` by name.
- Disabled/locked states must not press: follow `.btn`'s `:not(:disabled)` guard. For sigils that means gating on `usable`; for `.sigil-discard` there is no disabled state.

## Steps

1. `src/scenes/table.css` — add `:active` rules for `.tbl-sidetab`, `.sigil-discard`, `.ab-preset`, `.stack-option`, `.prompt-rank`, `.prompt-suit`, `.prompt-mark`, and `.seat.is-targetable`, using the values in **Target**. Place each immediately after that selector's existing `:hover` rule.
2. `src/components/codex.css` — `.codex-tab:active` and `.codex-chip:active`, both `transform: scale(0.97);`. Confirm each rule's `transition` covers `transform` (after plan 010 it will).
3. `src/components/shell/shell.css` — `.hh-tab:active` and `.hh-segmented-label:active`, `transform: scale(0.97);`.
4. `src/components/chat.css` — `.chat-send:active { transform: scale(0.97); }`. `.chat-emote` already has one at `:59`; leave it.
5. `src/components/onboarding/onboarding.css` — `.hint-mark__dismiss:active { transform: scale(0.94); }` (it is a small icon button, so the deeper end of the band reads better).
6. `src/scenes/lobby.css` — `.lobby-kick:active { transform: scale(0.94); }`.
7. `src/components/table/SigilCard.tsx:68` — add the `whileTap` in **Target**, directly after the `whileHover` prop.
8. `src/components/card/Card.tsx` — add `whileTap={onClick ? { scale: 0.97 } : undefined}` to the outer `motion.div` at `:398`. Confirm it does not fight the tilt `style` at `:429`; if it does, put the `whileTap` on the inner `motion.div` at `:412` instead and note which you chose.
9. `src/scenes/shop.css` — check `.shop-dot` and any shop tile: the actual press target in `src/scenes/Shop.tsx:122-131` is a nested `Button`, which already has `:active`. If so, add nothing and record that in the PR description.
10. Final sweep: `grep -rn ":hover" src --include=*.css | wc -l` versus `grep -rn ":active" src --include=*.css | wc -l`. Every hover rule on an element that is clickable should now have an active counterpart. Interactive elements that are purely informational on hover (tooltips revealing) do not need one.

## Boundaries

- Do NOT change any hover value — only add press states.
- Do NOT add press feedback to non-interactive elements (`src/components/onboarding/SigilTile.tsx` has no `onClick`, no `role`, no `tabIndex` — it is a display tile; skip it).
- Do NOT exceed the 0.95–0.98 scale band; a deeper press reads as a bug.
- Do NOT add a dependency.
- If an element's existing `transition` does not include `transform`, add `transform` to that list rather than writing a new `transition` line.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run play` and `npm run play:pad` both pass.
- **Feel check**: run `npm run dev`:
  - Click and **hold** a sigil card. It must visibly settle while held, and spring back on release. Do the same with a bet preset, a rank in the targeting prompt, a codex tab and a settings tab.
  - Tab to a sigil and hold **Enter**. `whileTap` fires for keyboard activation — confirm it does, since this is the gamepad path.
  - With a controller: navigate to a bet preset and hold A. Confirm the press reads.
  - Press a **locked** sigil (insufficient mana). It must NOT press — the feedback is reserved for actions that will happen.
  - In the Animations panel at 10%, confirm the press does not overshoot: it should ease in to the pressed state and back, with no bounce.
- **Done when**: every element with `role="button"` or an `onClick` in the table, shell and menu layers responds to press, locked/disabled elements do not, and no press exceeds a 3% scale change.
