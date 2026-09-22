/**
 * The cards drifting behind the main menu.
 *
 * Fixtures, built the same way the onboarding flow and the gallery build
 * theirs (see src/components/card/README.md) — no server, no hand in
 * progress, just the shapes `Card` already knows how to render.
 *
 * Every one is a state a real deck cannot hold. That is the point: the menu
 * should be making the game's argument before anybody reads a word of it.
 */
import type { CardView, Face } from '@shared/cards';

const QUANTUM_FACES: Face[] = [
  { rank: 13, suit: 'S' },
  { rank: 7, suit: 'D' },
];

/** Two cards at once, undecided until somebody looks. */
export const MENU_QUANTUM: CardView = {
  id: 'menu-q',
  state: 'quantum',
  face: null,
  possible: QUANTUM_FACES,
  marks: [],
  memory: 0,
};

/** Named by rank and dealt face down, before anybody has seen it. */
export const MENU_VEILED: CardView = {
  id: 'menu-v',
  state: 'veiled',
  face: null,
  rank: 12,
  marks: [],
  memory: 0,
};

/** The Ace the player opposite is not looking at. */
export const MENU_DIVERGED: CardView = {
  id: 'menu-d',
  state: 'faceup',
  face: { rank: 14, suit: 'H' },
  diverged: true,
  marks: [],
  memory: 0,
};

/** A permanent mark, written into the shared deck. */
export const MENU_WILD: CardView = {
  id: 'menu-w',
  state: 'faceup',
  face: { rank: 6, suit: 'C' },
  marks: ['wild'],
  memory: 0,
};

/** Court art, so the deck's own drawing gets a look in. */
export const MENU_COURT: CardView = {
  id: 'menu-c',
  state: 'faceup',
  face: { rank: 11, suit: 'S' },
  marks: [],
  memory: 0,
};

export const MENU_BACK: CardView = {
  id: 'menu-b',
  state: 'facedown',
  face: null,
  marks: [],
  memory: 0,
};
