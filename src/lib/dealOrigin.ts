/**
 * Where cards come from.
 *
 * Every card in the game already flew in along a spring arc, but from a fixed
 * offset up-and-left of wherever it happened to land. Three flop cards
 * therefore arrived on three parallel paths, the hole cards arrived on a
 * fourth, and nothing ever converged — which is precisely why the table read
 * as cards *appearing* rather than being dealt. A deal is not an animation
 * curve, it is a shared point of origin.
 *
 * This is that point. `Deck` publishes its rect here, and any row of cards
 * asks for the vector from the deck to itself. Rows measure their own
 * container, not the cards, because the container outlives every deal: the
 * measurement is taken once, survives all five streets, and costs nothing per
 * card.
 *
 * When there is no deck on screen — the market, the codex, the card gallery —
 * `originFor` returns null and the caller keeps its old fixed offset, so
 * nothing outside the table has to know this exists.
 */

let deck: { x: number; y: number } | null = null;

/** `Deck` calls this on mount and whenever the felt resizes. */
export function setDeckAnchor(rect: DOMRect | null): void {
  deck = rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
}

export interface DealOrigin {
  x: number;
  y: number;
  rotate: number;
}

/**
 * The offset a card in `el` should start from, in pixels relative to its own
 * resting position, plus the angle it should start turned at.
 *
 * The rotation is derived from the direction of travel rather than fixed, so
 * a card thrown to the left leans the other way from one thrown to the right
 * and the two do not look like the same animation played twice.
 */
export function originFor(el: Element | null): DealOrigin | null {
  if (!deck || !el) return null;
  const b = el.getBoundingClientRect();
  // A row gets measured while it is still empty, because that is the only
  // moment it can be measured *before* its first card mounts. A zero-sized
  // rect is therefore the normal case: a centred flex container with no
  // children still sits at the point its children will be centred on, which
  // is all this needs. Only a rect with no position at all is useless.
  if (!b.width && !b.height && !b.x && !b.y) return null;
  const dx = deck.x - (b.x + b.width / 2);
  const dy = deck.y - (b.y + b.height / 2);
  // A card that lands almost on top of the deck should not spin wildly.
  const dist = Math.hypot(dx, dy);
  const lean = Math.max(-26, Math.min(26, (dx / Math.max(1, dist)) * 26));
  return { x: dx, y: dy, rotate: lean };
}
