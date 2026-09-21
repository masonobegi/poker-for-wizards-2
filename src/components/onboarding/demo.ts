/**
 * Fixture CardView objects for the onboarding flow.
 *
 * Built directly, the same way `CardGallery` builds its fixtures (see
 * `src/components/card/README.md`) — no server, no real hand, just the exact
 * shapes `Card`/`CardRow` already know how to render. This lets the intro show
 * any card state on demand, including a live quantum card, without faking a
 * game underneath it.
 */
import type { CardView, Face, MarkId, Rank, Suit } from '@shared/cards';

let seq = 0;
const nextId = (): string => `intro-${(++seq).toString(36)}`;

function faceUp(rank: Rank, suit: Suit, marks: MarkId[] = []): CardView {
  return { id: nextId(), state: 'faceup', face: { rank, suit }, marks, memory: 0 };
}

// --- panel 1: it's Hold'em --------------------------------------------------

export const HOLE_DEMO: CardView[] = [faceUp(13, 'S'), faceUp(12, 'S')];
export const FLOP_DEMO: CardView[] = [faceUp(13, 'H'), faceUp(9, 'C'), faceUp(2, 'D')];

// --- panel 5: the deck breaks -----------------------------------------------

const QUANTUM_FACES: Face[] = [
  { rank: 13, suit: 'S' },
  { rank: 4, suit: 'H' },
];

export const QUANTUM_DEMO: CardView = {
  id: nextId(),
  state: 'quantum',
  face: null,
  possible: QUANTUM_FACES,
  marks: [],
  memory: 0,
};

export const SEALED_DEMO: CardView = {
  id: nextId(),
  state: 'veiled',
  face: null,
  rank: 13,
  marks: [],
  memory: 0,
};

export const DIVERGED_DEMO: CardView = {
  id: nextId(),
  state: 'faceup',
  face: { rank: 14, suit: 'H' },
  diverged: true,
  marks: [],
  memory: 0,
};

// --- panel 6: hands that cannot exist ---------------------------------------

/** Four true Kings plus a wild card standing in for the fifth. */
export const FIVE_OF_A_KIND: CardView[] = [
  faceUp(13, 'S'),
  faceUp(13, 'H'),
  faceUp(13, 'D'),
  faceUp(13, 'C'),
  faceUp(6, 'S', ['wild']),
];

/** A full house that is also a flush — the mirrored copies are what a real deck can't hold. */
export const FLUSH_HOUSE: CardView[] = [
  faceUp(14, 'H'),
  faceUp(14, 'H', ['mirrored']),
  faceUp(14, 'H', ['mirrored']),
  faceUp(13, 'H'),
  faceUp(13, 'H', ['mirrored']),
];

/** Five of the same rank and the same suit — one card, mirrored four times. */
export const FLUSH_FIVE: CardView[] = [
  faceUp(14, 'H'),
  faceUp(14, 'H', ['mirrored']),
  faceUp(14, 'H', ['mirrored']),
  faceUp(14, 'H', ['mirrored']),
  faceUp(14, 'H', ['mirrored']),
];
