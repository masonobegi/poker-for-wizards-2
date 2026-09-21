/**
 * `<CardRow>` (in `src/components/card/`, which this file does not own or
 * modify) renders one `.hx-row__seat` wrapper per card, in the same order as
 * the `views` array it is given, but never tags that wrapper with the card's
 * id. `vfx.burstAtEl` / `elementForCard` need exactly that tag to land a
 * burst on a specific hole card — the target of a cast, a collapsing
 * superposition, a card that just burned.
 *
 * This hook tags those wrappers from the outside, imperatively, after every
 * render: it never reads or writes any state CardRow owns, so it cannot
 * conflict with it. If the DOM briefly has a different number of
 * `.hx-row__seat` nodes than `ids` (mid exit-animation, a card leaving),
 * the extra/missing tag is harmless — every caller of `elementForCard` is
 * decoration and already tolerates a miss.
 */
import { useEffect, type RefObject } from 'react';

const ATTR = 'data-card-id';

export function useCardAnchors(
  containerRef: RefObject<HTMLElement | null>,
  ids: readonly string[],
): void {
  useEffect(() => {
    const root = containerRef.current;
    if (root === null) return;
    const seats = root.querySelectorAll<HTMLElement>('.hx-row__seat');
    for (let i = 0; i < seats.length; i++) {
      const id = ids[i];
      if (id) seats[i].setAttribute(ATTR, id);
      else seats[i].removeAttribute(ATTR);
    }
  });
}

export default useCardAnchors;
