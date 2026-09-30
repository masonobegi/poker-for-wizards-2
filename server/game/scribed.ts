/**
 * Turning a scribed sigil's descriptions into concrete targets.
 *
 * A scribed clause says "the chip leader" or "my worst card", not a seat or a
 * card id. That is the point of writing one: it is worked out when the spell
 * resolves, against the table as it is then, so it cannot be dodged by
 * whoever moved ahead while the stack was open. Each concrete targeting is
 * then checked by the same validation a hand-aimed sigil goes through, so a
 * written sigil can never reach a warded hand or a card in amber that a
 * printed one could not.
 */
import type { CardEntity } from '../../shared/cards';
import type { BoardPick, CardRef, Clause, HolePick, Who } from '../../shared/scribe';
import { whoLabel } from '../../shared/scribe';
import type { Player, SigilTargets, Table } from '../../shared/types';
import { byId, card, live } from './table';

/** A card's rank for "best" and "worst": its settled face, or its best candidate. */
function rankOf(c: CardEntity | undefined): number {
  if (!c) return 0;
  if (c.marks.includes('wild')) return 15;
  if (c.collapsed !== null) return c.faces[c.collapsed]?.rank ?? 0;
  return Math.max(0, ...c.faces.map((f) => f.rank));
}

function players(t: Table, caster: Player, who: Who): Player[] {
  const opponents = live(t).filter((q) => q.id !== caster.id);
  const most = (score: (q: Player) => number): Player[] => {
    if (!opponents.length) return [];
    return [opponents.reduce((a, b) => (score(b) > score(a) ? b : a))];
  };
  switch (who.k) {
    case 'me': return [caster];
    case 'player': {
      const q = byId(t, who.id);
      return q && opponents.includes(q) ? [q] : [];
    }
    case 'leader': return most((q) => q.chips + q.bet);
    case 'short': return most((q) => -(q.chips + q.bet));
    case 'mana': return most((q) => q.mana);
    case 'aggressor': {
      const q = byId(t, t.lastAggressorId);
      return q && opponents.includes(q) ? [q] : [];
    }
    case 'each': return opponents;
  }
}

function holeCard(t: Table, p: Player, pick: HolePick): string | undefined {
  if (p.hole.length === 0) return undefined;
  if (pick === 'first') return p.hole[0];
  if (pick === 'second') return p.hole[1] ?? p.hole[0];
  const sorted = [...p.hole].sort((a, b) => rankOf(card(t, a)) - rankOf(card(t, b)));
  return pick === 'best' ? sorted[sorted.length - 1] : sorted[0];
}

function boardCard(t: Table, pick: BoardPick): string | undefined {
  const b = t.board;
  switch (pick) {
    case 'last': return b[b.length - 1];
    case 'river': return b[4];
    case 'turn': return b[3];
    case 'flop1': return b[0];
    case 'flop2': return b[1];
    case 'flop3': return b[2];
    case 'best':
    case 'worst': {
      const sorted = [...b].sort((x, y) => rankOf(card(t, x)) - rankOf(card(t, y)));
      return pick === 'best' ? sorted[sorted.length - 1] : sorted[0];
    }
  }
}

/** One card id per resolution of this reference: several when it says "everyone's". */
function cards(t: Table, caster: Player, ref: CardRef): string[] {
  if (ref.k === 'board') {
    const id = boardCard(t, ref.pick);
    return id ? [id] : [];
  }
  return players(t, caster, ref.who)
    .map((p) => (ref.rank
      // "my 2": the hole card that is a two, on any of its possible faces.
      ? p.hole.find((id) => card(t, id)?.faces.some((f) => f.rank === ref.rank))
      : holeCard(t, p, ref.pick)))
    .filter((id): id is string => !!id);
}

export interface Resolved {
  targets: SigilTargets[];
  /** Why the clause found nothing, in words, when it did not. */
  missing?: string;
}

/** Every targeting this clause resolves to right now. */
export function resolveClause(t: Table, caster: Player, c: Clause): Resolved {
  const base: SigilTargets = {};
  if (c.rank) base.rank = c.rank;
  if (c.suit) base.suit = c.suit;
  if (c.mark) base.markId = c.mark;

  if (c.who) {
    const ps = players(t, caster, c.who);
    if (!ps.length) return { targets: [], missing: `${whoLabel(c.who)} is not in the hand` };
    return { targets: ps.map((p) => ({ ...base, playerId: p.id })) };
  }

  if (c.cards?.length === 2) {
    const a = cards(t, caster, c.cards[0])[0];
    const b = cards(t, caster, c.cards[1])[0];
    if (!a || !b || a === b) return { targets: [], missing: 'those two cards are not both on the table' };
    return { targets: [{ ...base, cardIds: [a, b] }] };
  }

  if (c.cards?.length === 1) {
    const ids = cards(t, caster, c.cards[0]);
    if (!ids.length) return { targets: [], missing: 'that card is not on the table yet' };
    return { targets: ids.map((id) => ({ ...base, cardIds: [id] })) };
  }

  return { targets: [base] };
}
