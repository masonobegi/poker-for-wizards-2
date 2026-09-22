/**
 * Achievements.
 *
 * Steam expects them, and they are also the clearest statement a game can make
 * about what it thinks is interesting. Every one of these points at something
 * the impossible deck can do and an ordinary one cannot — winning with a hand
 * that has no physical existence, taking a pot with the worst cards at the
 * table, holding a card that remembers its own wins.
 *
 * Definitions live in `shared` so the ids are one source of truth for the game,
 * the Steam partner backend, and the store page.
 */
import { Cat } from './hand';

export type AchievementId =
  | 'first_blood' | 'first_run'
  | 'five_of_a_kind' | 'flush_house' | 'flush_five'
  | 'counterspell' | 'counterspelled_twice'
  | 'wildcard' | 'long_memory' | 'quantum_win'
  | 'sealed_win' | 'diverged_win'
  | 'ante_five' | 'ante_eight'
  | 'purist' | 'archmage' | 'the_inversion'
  | 'six_omens' | 'kingmaker' | 'whale';

export interface AchievementDef {
  id: AchievementId;
  /** Steam API name. Kept identical to the id so nothing can drift. */
  api: string;
  name: string;
  /** Shown once unlocked, or always when not hidden. */
  text: string;
  /** Hidden achievements show as "???" until earned. */
  hidden?: boolean;
  /** Progress target, for the ones that count. */
  target?: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_blood', api: 'first_blood', name: 'First Blood', text: 'Win your first pot.' },
  { id: 'first_run', api: 'first_run', name: 'Last One Standing', text: 'Win a run.' },

  {
    id: 'five_of_a_kind', api: 'five_of_a_kind', name: 'Impossible',
    text: 'Win with Five of a Kind — a hand fifty-two cards cannot make.',
  },
  {
    id: 'flush_house', api: 'flush_house', name: 'Two Impossibilities',
    text: 'Win with a Flush House.',
  },
  {
    id: 'flush_five', api: 'flush_five', name: 'The Same Card, Five Times',
    text: 'Win with a Flush Five.',
  },

  { id: 'counterspell', api: 'counterspell', name: 'Nullified', text: 'Counter an opponent’s sigil.' },
  {
    id: 'counterspelled_twice', api: 'counterspelled_twice', name: 'The Last Word',
    text: 'Counter a counterspell.', hidden: true,
  },

  {
    id: 'wildcard', api: 'wildcard', name: 'Anything At All',
    text: 'Win a pot using a Wild card.',
  },
  {
    id: 'long_memory', api: 'long_memory', name: 'It Remembers',
    text: 'Win with a card that has already won three pots.', hidden: true,
  },
  {
    id: 'quantum_win', api: 'quantum_win', name: 'Collapsed In Your Favour',
    text: 'Win a pot with a card that was undecided until the showdown.',
  },
  {
    id: 'sealed_win', api: 'sealed_win', name: 'Nobody Saw It Coming',
    text: 'Win a pot with a card that was sealed face down.', hidden: true,
  },
  {
    id: 'diverged_win', api: 'diverged_win', name: 'Your Own Private Truth',
    text: 'Win using a card that showed the rest of the table something else.', hidden: true,
  },

  { id: 'ante_five', api: 'ante_five', name: 'Deep Water', text: 'Reach ante 5.' },
  { id: 'ante_eight', api: 'ante_eight', name: 'The Far End', text: 'Reach ante 8.' },

  {
    id: 'purist', api: 'purist', name: 'Purist',
    text: 'Win a run without casting a single sigil.', hidden: true,
  },
  {
    id: 'archmage', api: 'archmage', name: 'Archmage',
    text: 'Cast 100 sigils.', target: 100,
  },
  {
    id: 'the_inversion', api: 'the_inversion', name: 'Upside Down',
    text: 'Win a pot with the worst hand at the table.', hidden: true,
  },
  {
    id: 'six_omens', api: 'six_omens', name: 'A Rulebook Nobody Wrote',
    text: 'Play a hand with six omens in force.',
  },
  {
    id: 'kingmaker', api: 'kingmaker', name: 'Kingmaker',
    text: 'Eliminate three players in one run.',
  },
  {
    id: 'whale', api: 'whale', name: 'Whale',
    text: 'Win a pot worth a hundred big blinds.',
  },
];

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

/** Category -> the achievement it unlocks, for the impossible hands. */
export const CAT_ACHIEVEMENT: Partial<Record<Cat, AchievementId>> = {
  [Cat.FiveOfAKind]: 'five_of_a_kind',
  [Cat.FlushHouse]: 'flush_house',
  [Cat.FlushFive]: 'flush_five',
};

/**
 * The Steam partner backend wants this as a list. Generating it from the same
 * array the game reads means the two can never disagree.
 */
export function steamManifest(): Array<{ name: string; displayName: string; description: string; hidden: '0' | '1' }> {
  return ACHIEVEMENTS.map((a) => ({
    name: a.api,
    displayName: a.name,
    description: a.text,
    hidden: a.hidden ? '1' : '0',
  }));
}
