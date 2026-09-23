# 011 — Gate hover motion behind a fine pointer

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: MEDIUM-HIGH
- **Category**: 6 (Accessibility)
- **Estimated scope**: 7 files, small

## Problem

`@media (hover: hover) and (pointer: fine)` appears **zero times** in any stylesheet in this repo. Verified:

```
$ grep -rc "hover: hover" src --include=*.css
(no matches)
$ grep -rn "hover: hover" src --include=*.tsx --include=*.ts
src/components/card/Card.tsx:99:  const query = '(hover: hover) and (pointer: fine)';
```

The JS layer got this right — `useFinePointer()` in `Card.tsx` gates the 3D tilt correctly. The CSS layer has no equivalent anywhere.

This matters specifically because HEXHOLD ships on **Steam Deck, which has a touchscreen**. On touch, a tap fires a hover that sticks until the next tap elsewhere. Every hover-motion rule below therefore leaves an element visibly displaced with no way to clear it.

The worst offenders, by how misleading the stuck state is:

```css
/* src/scenes/table.css:1083-1087, :1100, :1115 — current */
.prompt-rank:hover {
  transform: translateY(-4px) scale(1.06);
  border-color: var(--gold);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5), 0 0 22px rgba(240, 196, 101, 0.4);
}
.prompt-suit:hover { transform: translateY(-4px) scale(1.06); border-color: var(--gold); }
.prompt-mark:hover { border-color: var(--mark); transform: translateX(3px); }
```

Tapping a rank leaves it lifted 4px, scaled 6% and gold-bordered — reading as "selected" when nothing is selected.

```css
/* src/components/omens.css:42-48 — current */
.omen:hover, .omen.is-open { /* ... */ transform: translateY(-1px); box-shadow: 0 0 18px rgba(185,140,255,.35); }
```

The hover state is **aliased to the real `.is-open` state**, so a stuck false hover is visually indistinguishable from "this omen is open".

```css
/* src/scenes/table.css:757 — current */
.sigil:hover .sigil-tip { opacity: 1; transform: translateX(-50%) translateY(0); }
```

Tapping a sigil to cast it also pins its tooltip open over the table.

```css
/* src/scenes/table.css:992-996 — current */
.stack-option:hover { /* ... */ transform: translateX(3px); }
```

Inside a timed decision UI, where a stuck offset row is actively confusing.

```css
/* src/components/chat.css:58 — current */
.chat-emote:hover { background: rgba(255,255,255,.07); transform: scale(1.18); }
```

An 18% scale-up — the largest in the set — on one of the most-tapped controls.

```css
/* src/scenes/lobby.css:36 — current */
.lobby-code:hover { transform: scale(1.03); text-shadow: 0 0 46px rgba(240,196,101,.6); }
```

The room code is the single element a touchscreen player is most likely to tap, to read or copy it.

```css
/* src/styles/ui.css:154 — current */
.range::-webkit-slider-thumb:hover { transform: scale(1.15); }
```

The bet-amount slider thumb — touched on most hands.

Also ungated: `.codex-entry:hover { transform: translateX(2px) }` (`codex.css:74`), `.profile-glyph:hover` (`profile.css:88`), and `.btn:hover:not(:disabled)::after` (`ui.css:46`) — though plan 006 deletes that one.

## Target

Hover rules that change **only colour, background or opacity** stay ungated: a stuck colour is harmless and often helpful. Hover rules that **move or scale** get wrapped.

```css
/* target — the pattern */
@media (hover: hover) and (pointer: fine) {
  .prompt-rank:hover {
    transform: translateY(-4px) scale(1.06);
    border-color: var(--gold);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5), 0 0 22px rgba(240, 196, 101, 0.4);
  }
}
```

Where a hover rule mixes motion with colour, split it so touch still gets the colour feedback:

```css
/* target — src/components/omens.css:42-48 */
.omen.is-open {
  transform: translateY(-1px);
  box-shadow: 0 0 18px rgba(185, 140, 255, 0.35);
}
@media (hover: hover) and (pointer: fine) {
  .omen:hover {
    transform: translateY(-1px);
    box-shadow: 0 0 18px rgba(185, 140, 255, 0.35);
  }
}
```

The real state (`.is-open`) keeps its treatment unconditionally; only the *hover* alias is gated. This also fixes the ambiguity — after the change, a lifted omen on touch always means it is genuinely open.

Hover-revealed tooltips are gated as a whole, since a pinned tooltip on touch is worse than no tooltip:

```css
/* target — src/scenes/table.css:757 */
@media (hover: hover) and (pointer: fine) {
  .sigil:hover .sigil-tip { opacity: 1; transform: translateX(-50%) translateY(0); }
}
```

```css
/* target — src/scenes/table.css:738 */
@media (hover: hover) and (pointer: fine) {
  .sigil:hover .sigil-discard { opacity: 1; }
}
```

The discard button needs a touch route once gated — see **Boundaries**.

## Repo conventions to follow

- `src/components/card/Card.tsx:98-114` is the in-repo exemplar; its query string is exactly `'(hover: hover) and (pointer: fine)'`. Use the same query text in CSS so the two layers agree.
- Group the gated rules at the **end** of each file in one `@media` block rather than scattering many small ones — easier to audit, and it keeps the cascade order obvious. One block per file.

## Steps

1. `src/scenes/table.css` — move these hover rules into a single `@media (hover: hover) and (pointer: fine)` block at the end of the file: `.prompt-rank:hover` (`:1083`), `.prompt-suit:hover` (`:1100`), `.prompt-mark:hover` (`:1115`), `.stack-option:hover` (`:992`), `.sigil:hover .sigil-tip` (`:757`), `.sigil:hover .sigil-discard` (`:738`), and `.sigil.is-castable:hover .sigil-frame` (`:643`). Leave the colour-only hovers where they are.
2. `src/components/omens.css:42-48` — split the compound selector as in **Target**, keeping `.is-open` ungated.
3. `src/components/chat.css:58` — gate `.chat-emote:hover`'s `transform`. Keep the `background` change ungated so touch still gets feedback.
4. `src/scenes/lobby.css:36` — gate `.lobby-code:hover` entirely (both the scale and the text-shadow are decorative).
5. `src/styles/ui.css:154` — gate `.range::-webkit-slider-thumb:hover`. Check whether a `::-moz-range-thumb:hover` exists (`ui.css:158-161` defines the thumb but may not have a hover) and gate it too if so.
6. `src/components/codex.css:74` — gate `.codex-entry:hover`'s `transform`, keep its `background` ungated.
7. `src/components/profile/profile.css:88` — gate `.profile-glyph:hover`.
8. `src/components/table/SigilCard.tsx:68` — framer's `whileHover` fires on touch too. Gate it in JS by reusing the existing hook: extract `useFinePointer()` from `src/components/card/Card.tsx:98-114` into `src/components/fx/useFinePointer.ts`, import it in both files, and write `whileHover={finePointer && usable ? { y: -14, scale: 1.05, zIndex: 5 } : undefined}`.
9. Verify: `grep -rn "hover: hover" src --include=*.css` should now return one block per touched file.

## Boundaries

- Do NOT gate hover rules that change only colour, background or opacity — those are useful on touch.
- Do NOT gate `:active`/`whileTap` states (plan 007) — press feedback must work on touch.
- **The sigil discard button needs a touch route.** Once `.sigil:hover .sigil-discard` is gated, a touch player cannot discard. Either keep it permanently visible on coarse pointers (`@media (pointer: coarse) { .sigil-discard { opacity: 1 } }`) or confirm with the repo owner that discard is reachable another way. Do not simply remove the access.
- Do NOT change any hover value; only where it applies.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run responsive` passes.
- **Feel check**: run `npm run dev`, then in DevTools open device emulation and choose a **touch** device (or set Rendering → "Emulate: no touch" off and forced-colors off, and use a touch profile):
  - Tap a rank in the targeting prompt, then tap elsewhere. Nothing should remain lifted.
  - Tap an omen chip. It must not look "open" unless it is.
  - Tap a sigil. The tooltip must not pin open over the table.
  - Tap the emote button. No 18% scale should stick.
  - Tap the room code in the lobby. It must not stay scaled and glowing.
  - Switch back to a mouse profile and confirm **every** hover effect above still works exactly as before.
  - Confirm the sigil discard is still reachable on the touch profile.
- **Done when**: no motion-bearing hover state can be left stuck by a tap, every hover still works with a mouse, and discard remains reachable on touch.
