/**
 * Showdown: read every hand under its owner's private rules, split the pots,
 * move the chips, and let the cards remember that they won.
 *
 * Two players can legitimately disagree about what a community card is, and one
 * of them may be playing a game where the *worst* hand takes the pot. Both are
 * scored on their own terms and then compared — which is the only way a table
 * running six different rulebooks at once can still settle a bet.
 */
import { cardsOf, byId, live, alive, log, modsFor, scoringHole, totalPot } from './table';
import { viewCard } from '../../shared/cards';
import { type HandResult, Cat, evaluate } from '../../shared/hand';
import { RELIC_BY_ID, hasVision } from '../../shared/relics';
import type { FxEvent } from '../../shared/protocol';
import type { Rng } from '../../shared/rng';
import type { PayoutInfo, Player, Pot, ShowdownEntry, Table } from '../../shared/types';
import { buildPots } from './table';

const BASE_SHARDS_WIN = 3;

interface Scored {
  player: Player;
  result: HandResult;
  echo?: HandResult;
  used: HandResult;
  timeline: 'primary' | 'echo';
  lowWins: boolean;
}

function scorePlayer(t: Table, p: Player): Scored {
  const mods = modsFor(t, p);
  const board = t.board;
  const primary = evaluate({ cards: cardsOf(t, [...scoringHole(t, p), ...board]), viewerId: p.id, mods });

  let echo: HandResult | undefined;
  let used = primary;
  let timeline: 'primary' | 'echo' = 'primary';

  if (t.echoTimeline && t.echoTimeline.ownerId === p.id) {
    echo = evaluate({
      cards: cardsOf(t, [...scoringHole(t, p), ...t.echoTimeline.boardIds]),
      viewerId: p.id,
      mods,
    });
    const better = mods.lowWins ? echo.score < primary.score : echo.score > primary.score;
    if (better) { used = echo; timeline = 'echo'; }
  }

  return { player: p, result: primary, echo, used, timeline, lowWins: !!mods.lowWins };
}

/** Best hands in a pot. Inverted when anyone contesting it is playing Reversal. */
function winnersOf(pot: Pot, scored: Map<string, Scored>): Scored[] {
  const field = pot.eligible
    .map((id) => scored.get(id))
    .filter((s): s is Scored => !!s && s.used.score >= 0);
  if (field.length === 0) return [];

  const inverted = field.some((s) => s.lowWins);
  let best = field[0];
  for (const s of field) {
    const better = inverted ? s.used.score < best.used.score : s.used.score > best.used.score;
    if (better) best = s;
  }
  return field.filter((s) => s.used.score === best.used.score);
}

export interface ShowdownOutput {
  payout: PayoutInfo;
  fx: FxEvent[];
}

export function runShowdown(t: Table, rng: Rng): ShowdownOutput {
  const fx: FxEvent[] = [];
  const contenders = live(t);

  // Fold any remaining street bets into the pot before splitting it.
  for (const p of t.players) { t.pot += p.bet; p.bet = 0; }
  t.pots = buildPots(t);
  if (t.pots.length === 0 && t.pot > 0) {
    t.pots = [{ amount: t.pot, eligible: contenders.map((p) => p.id), label: 'Main Pot' }];
  }

  const scored = new Map<string, Scored>();
  for (const p of contenders) scored.set(p.id, scorePlayer(t, p));

  // Uncontested — everyone else folded. No hand is read, nothing is revealed.
  const uncontested = contenders.length === 1;

  const won = new Map<string, number>();
  const shards = new Map<string, number>();
  const potResults: PayoutInfo['pots'] = [];

  for (const pot of t.pots) {
    const ws = uncontested
      ? contenders.map((p) => scored.get(p.id)!).filter(Boolean)
      : winnersOf(pot, scored);
    if (ws.length === 0) continue;

    const share = Math.floor(pot.amount / ws.length);
    let remainder = pot.amount - share * ws.length;

    // Odd chips go to the first winner left of the button, as at a real table.
    const ordered = [...ws].sort((a, b) => seatDistance(t, a.player.seat) - seatDistance(t, b.player.seat));
    for (const w of ordered) {
      let take = share;
      if (remainder > 0) { take += 1; remainder -= 1; }
      w.player.chips += take;
      won.set(w.player.id, (won.get(w.player.id) ?? 0) + take);
    }

    potResults.push({ amount: pot.amount, winners: ws.map((w) => w.player.id), label: pot.label });
  }

  // ------------------------------------------------------------- rewards
  for (const [id, amount] of won) {
    const p = byId(t, id);
    if (!p) continue;
    p.handsWon += 1;
    p.biggestPot = Math.max(p.biggestPot, amount);

    let s = BASE_SHARDS_WIN;
    const sc = scored.get(id);

    // The cards themselves keep score.
    if (sc && !uncontested) {
      for (const cid of sc.used.usedIds) {
        const c = t.cards.get(cid);
        if (c) c.memory += 1;
      }
    }

    for (const rid of p.relics) {
      const def = RELIC_BY_ID[rid];
      const w = def?.onWin;
      if (!w) continue;
      if (w.requireImpossible && !(sc?.used.impossible)) continue;
      if (w.requireCat !== undefined && sc?.used.cat !== w.requireCat) continue;
      if (w.shards) s += w.shards;
      if (w.chipsPerBB) p.chips += w.chipsPerBB * t.bb;
    }

    if (sc?.used.impossible) s += 4;
    p.shards += s;
    shards.set(id, s);

    fx.push({ t: 'pot_to', playerId: id, amount });
    fx.push({
      t: 'win', playerId: id,
      handName: uncontested ? 'Last one standing' : (sc?.used.name ?? 'Winner'),
      impossible: !!sc?.used.impossible,
      amount,
    });
  }

  const anyImpossible = [...scored.values()].find((s) => s.used.impossible && won.has(s.player.id));
  if (anyImpossible) {
    fx.push({ t: 'sfx', name: 'win_impossible' });
    fx.push({ t: 'shake', power: 1 });
    fx.push({
      t: 'banner',
      text: anyImpossible.used.name.toUpperCase(),
      sub: 'A hand that cannot exist',
      tone: 'impossible',
    });
  } else if (won.size) {
    fx.push({ t: 'sfx', name: won.size === 1 && [...won.values()][0] > t.bb * 12 ? 'win_big' : 'win_normal' });
  }

  // ------------------------------------------------------------- entries
  const entries: ShowdownEntry[] = alive(t).map((p) => {
    const sc = scored.get(p.id);
    const reveal = !uncontested && !p.folded;
    return {
      playerId: p.id,
      cards: reveal
        ? p.hole.map((id) => {
          const c = t.cards.get(id);
          return c
            ? viewCard(c, { viewerId: p.id, reveal: true, showdown: true })
            : { id, state: 'facedown' as const, face: null, marks: [], memory: 0 };
        })
        : [],
      handName: p.folded ? 'Folded' : (reveal ? (sc?.used.name ?? '') : 'Uncontested'),
      cat: sc?.used.cat ?? Cat.HighCard,
      score: sc?.used.score ?? -1,
      usedIds: reveal ? (sc?.used.usedIds ?? []) : [],
      impossible: !!sc?.used.impossible,
      won: won.get(p.id) ?? 0,
      echoName: sc?.echo?.name,
      timelineUsed: sc?.timeline,
    };
  });

  for (const e of entries) {
    if (e.won > 0) {
      log(t, `${byId(t, e.playerId)?.name} takes ${e.won.toLocaleString()} with ${e.handName}.`,
        e.impossible ? 'impossible' : 'win', { playerId: e.playerId });
    }
  }

  t.pot = 0;
  for (const p of t.players) p.committed = 0;

  return {
    payout: {
      pots: potResults,
      entries,
      shards: Object.fromEntries(shards),
      bestImpossible: anyImpossible?.used.name,
    },
    fx,
  };
}

function seatDistance(t: Table, seat: number): number {
  const n = Math.max(1, t.config.maxPlayers);
  return (seat - t.dealerSeat + n) % n;
}

/** Give The Informant holders their peek, just before the river locks. */
export function grantInformantVision(t: Table, rng: Rng): void {
  for (const p of live(t)) {
    if (!hasVision(p.relics, 'one_hole')) continue;
    const others = live(t).filter((q) => q.id !== p.id && !q.warded && q.hole.length > 0);
    if (others.length === 0) continue;
    const mark = rng.pick(others);
    const id = rng.pick(mark.hole);
    if (id && !p.foreknowledge.seenHole.includes(id)) {
      p.foreknowledge.seenHole.push(id);
      log(t, `${p.name}'s Informant whispers.`, 'magic', { playerId: p.id });
    }
  }
}
