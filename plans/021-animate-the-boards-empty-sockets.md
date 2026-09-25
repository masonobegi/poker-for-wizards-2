# 021 — Animate the board's empty sockets

- **Status**: DONE
- **Commit**: 55ca0f0
- **Severity**: LOW (additive)
- **Category**: 8 (Missed opportunities)
- **Estimated scope**: 2 files, small

## Problem

```tsx
/* src/components/table/Board.tsx:100-105 — current */
        </AnimatePresence>

        {/* Slots that were never dealt, or were burned out of the board. */}
        {Array.from({ length: Math.max(0, 5 - view.board.length) }, (_, i) => (
          <div key={`slot-${i}`} className="board-slot" aria-hidden />
        ))}
```

```css
/* src/scenes/table.css:397-403 — current */
.board-slot {
  width: var(--card-w);
  height: var(--card-h);
  border-radius: var(--r-card);
  border: 1px dashed rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.18);
}
```

The empty sockets are plain `<div>`s outside the `AnimatePresence` that wraps the cards. They pop in and out instantly while the cards beside them ride `layout` springs.

This matters because **the board getting shorter is a real game event**. When a sigil burns a community card, the card exits on its arc and the survivors slide — and an empty socket materialises out of nothing at the end of the row. The one part of the change that is not explained by motion is the part that tells the player the board is now different.

## Target

Bring the sockets inside the same `AnimatePresence` and give them a reveal that reads as a space opening rather than a box appearing. `clip-path: inset()` is the right tool: it reveals the socket in place without the element having a size to animate.

```tsx
/* target — src/components/table/Board.tsx:100-110 */
          {/* Slots that were never dealt, or were burned out of the board.
              Inside the same AnimatePresence as the cards, so a burned card's
              exit and its socket's arrival read as one movement. */}
          {Array.from({ length: Math.max(0, 5 - view.board.length) }, (_, i) => (
            <motion.div
              key={`slot-${i}`}
              className="board-slot"
              aria-hidden
              layout
              initial={{ opacity: 0, clipPath: 'inset(0 50% 0 50%)' }}
              animate={{ opacity: 1, clipPath: 'inset(0 0% 0 0%)' }}
              exit={{ opacity: 0, clipPath: 'inset(0 50% 0 50%)' }}
              transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
            />
          ))}
        </AnimatePresence>
```

The socket opens from its own centre line outward — the space appearing where the card was. The percentages mean no hardcoded pixel offsets, so it works at every `--card-w` from the 58px floor to the 168px ceiling.

`layout` is added so a socket also slides when the row reflows, matching the cards' behaviour.

```css
/* target — src/scenes/table.css:397-403 */
.board-slot {
  width: var(--card-w);
  height: var(--card-h);
  border-radius: var(--r-card);
  border: 1px dashed rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.18);
  will-change: auto;   /* framer adds its own hint while animating */
}
```

No other CSS change is needed — the `clip-path` is driven entirely from the component.

## Repo conventions to follow

- `src/components/table/Board.tsx:88-98` — the board-card wrapper deliberately carries **only** `layout` and no transform, with a comment explaining it would otherwise fight `Card`'s per-axis springs. The sockets have no such conflict (nothing else animates them), so they may carry both `layout` and their own transition. Do not "fix" the card wrapper to match.
- Durations are tokens; `0.26` is `--t-base`. After plan 015 this becomes `T_BASE`/`ENTER_PANEL` from `src/styles/motion.ts`.
- `aria-hidden` stays — these are decorative and must not reach the accessibility tree.

## Steps

1. `src/components/table/Board.tsx:100-105` — move the slot map **inside** the closing `</AnimatePresence>` tag (currently at `:100`) and convert the `div` to a `motion.div` as in **Target**.
2. Confirm the `key` remains stable: `slot-${i}` is index-based, which is correct here because the sockets are interchangeable and always occupy the tail of the row. Do not key them on card ids.
3. `src/scenes/table.css:397-403` — no functional change required; add nothing unless a `will-change` conflict appears in testing.
4. Verify the row's flex/grid layout does not shift when a socket animates. `clip-path` does not affect layout, so it should not — but confirm at the narrowest and widest `--card-w`.

## Boundaries

- Do NOT change the number of sockets or the `5 - view.board.length` calculation.
- Do NOT remove `aria-hidden`.
- Do NOT animate `width` or `height` — that is the layout-thrash trap this plan exists to avoid.
- Do NOT touch the card wrapper at `:88-98` or `Card`'s own springs.
- Do NOT add a dependency.

## Verification

- **Mechanical**: `npm run typecheck` passes. `npm test` stays green. `npm run responsive` passes all seven resolutions — this element is sized from `--card-w`, which is viewport-derived.
- **Feel check**: run `npm run dev`:
  - Deal through preflop → flop → turn → river. Each dealt card should replace a socket, and the socket should close as the card arrives rather than blinking out.
  - **The real test**: get a burn sigil and destroy a community card mid-street. The card must exit on its arc, the survivors must slide, and the new socket must **open in place** — not appear fully formed.
  - With the Animations panel at 10%, confirm the socket opens from its centre outward.
  - Check at 1280×800 (smallest `--card-w`) and 3840×2160 (largest). The reveal must look proportionally identical.
  - Turn on reduce motion; the socket should appear without the wipe but still fade.
- **Done when**: no part of the board's shape changes instantly while the rest of it animates.
