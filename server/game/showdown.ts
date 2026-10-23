/**
 * Showdown: read every hand under its owner's private rules, split the pots,
 * move the chips, and let the cards remember that they won.
 *
 * Two players can legitimately disagree about what a community card is, and one
 * of them may be playing a game where the *worst* hand takes the pot. Both are
 * scored on their own terms and then compared — which is the only way a table
 * running six different rulebooks at once can still settle a bet.
 */
import { cardsOf, byId, describeCard, live, alive, log, modsFor, scoringHole } from './table';
import { type CardEntity, type MarkId, faceFor, faceLabel, marksFor, viewCard } from '../../shared/cards';
import { type HandResult, Cat, evaluate } from '../../shared/hand';
import { RELIC_BY_ID, hasRule, hasVision } from '../../shared/relics';
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
  if (!uncontested) for (const sc of scored.values()) { creditDealRelics(t, sc); creditTwofold(t, sc); }

  const won = new Map<string, number>();
  /** The High Spade's halves: paid, but not a pot won (no shards, no memory). */
  const spadeWon = new Map<string, number>();
  const shards = new Map<string, number>();
  const potResults: PayoutInfo['pots'] = [];

  for (const pot of t.pots) {
    const ws = uncontested
      ? contenders.map((p) => scored.get(p.id)!).filter(Boolean)
      : winnersOf(pot, scored);
    if (ws.length === 0) continue;

    // The High Spade: half of a contested pot its owner would lose.
    let amount = pot.amount;
    const spade = uncontested ? null : highSpade(t, pot, scored, ws);
    if (spade) {
      const half = Math.floor(amount / 2);
      amount -= half;
      spade.player.chips += half;
      spadeWon.set(spade.player.id, (spadeWon.get(spade.player.id) ?? 0) + half);
      fx.push({ t: 'pot_to', playerId: spade.player.id, amount: half });
      log(t, `${spade.player.name}'s High Spade: ${spade.label} is the highest Spade in the hole, and takes half the ${!pot.label || pot.label === 'Main Pot' ? 'pot' : pot.label.toLowerCase()}, ${half.toLocaleString()}.`, 'impossible', {
        playerId: spade.player.id, rule: spade.relicId,
      });
    }

    const share = Math.floor(amount / ws.length);
    let remainder = amount - share * ws.length;

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
      // Once a card, though Twofold can name a Wild twice in one hand.
      for (const cid of new Set(sc.used.usedIds)) {
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
      // The Engraver: a contested win writes its mark, for good, onto one
      // unmarked card of the winning five (the highest, so it is the card
      // that mattered). The deck is shared.
      if (w.engrave && sc && !uncontested) {
        const target = sc.used.usedIds
          .map((cid) => t.cards.get(cid))
          .filter((c): c is NonNullable<typeof c> => !!c && c.marks.length === 0 && !c.amber && c.origin !== 'conjured' && c.faces.length === 1)
          .sort((a, b) => b.faces[0].rank - a.faces[0].rank)[0];
        if (target) {
          target.marks.push(w.engrave);
          fx.push({ t: 'inscribe', cardId: target.id, markId: w.engrave });
          log(t, `${p.name}'s ${def.name} engraves ${describeCard(t, target.id)} ${w.engrave === 'prism' ? 'Prism' : w.engrave}, for good.`, 'impossible', {
            playerId: p.id, rule: rid,
          });
        }
      }
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
      won: (won.get(p.id) ?? 0) + (spadeWon.get(p.id) ?? 0),
      echoName: sc?.echo?.name,
      timelineUsed: sc?.timeline,
    };
  });

  for (const e of entries) {
    // The pot a hand won; a High Spade's half has its own line above.
    const took = won.get(e.playerId) ?? 0;
    if (took > 0) {
      log(t, `${byId(t, e.playerId)?.name} takes ${took.toLocaleString()} with ${e.handName}.`,
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

/** What a hole card's mark did for the hand, in the ledger's words. */
const MARK_PLAYED: Partial<Record<MarkId, string>> = {
  blooded: 'played a rank higher',
  wild: 'played as whatever the hand needed',
  prism: 'played as the suit the hand needed',
  echo: 'played higher for the pots it has won',
};

/**
 * Relics that act at the deal (a marked hole card, an undecided one, an extra
 * one) write nothing when they act, so neither the ledger nor the rail said
 * when one of them won a hand (FUN-REVIEW.md, round 6). At a contested
 * showdown each is read again without what it dealt, and a line is written
 * only when the hand reads differently: a relic that changed nothing says
 * nothing. The line carries the relic's id, so the rail flashes it.
 */
function creditDealRelics(t: Table, sc: Scored): void {
  const p = sc.player;
  const deals = (t.relicDeals ?? []).filter((d) => d.playerId === p.id);
  if (deals.length === 0) return;
  const mods = modsFor(t, p);
  const board = sc.timeline === 'echo' && t.echoTimeline ? t.echoTimeline.boardIds : t.board;
  const cards = cardsOf(t, [...scoringHole(t, p), ...board]);
  const score = (cs: CardEntity[]): number => evaluate({ cards: cs, viewerId: p.id, mods }).score;
  const swap = (alt: CardEntity): CardEntity[] => cards.map((c) => (c.id === alt.id ? alt : c));
  const full = sc.used.score;
  // Under a player's own Reversal the lower score is the better hand.
  const better = (a: number, b: number): boolean => (sc.lowWins ? a < b : a > b);
  const say = (relicId: string, text: string): void => {
    log(t, `${p.name}'s ${RELIC_BY_ID[relicId]?.name ?? relicId}: ${text}`, 'magic', { playerId: p.id, rule: relicId });
  };

  const credited = new Set<string>();
  for (const d of deals) {
    const deal = RELIC_BY_ID[d.relicId]?.deal;
    if (!deal || credited.has(d.relicId)) continue;
    const c = d.cardId ? t.cards.get(d.cardId) : undefined;

    if (deal.markOwn && c) {
      const mark = deal.markOwn;
      if (!better(full, score(swap({ ...c, marks: c.marks.filter((m) => m !== mark) })))) continue;
      say(d.relicId, `${describeCard(t, c.id)} ${MARK_PLAYED[mark] ?? 'played on its mark'}, in ${sc.used.name}.`);
    } else if (deal.quantumHole && c) {
      // Undecided until the showdown, then a coin: the first face is the card
      // as dealt, so landing on it is the relic doing nothing.
      if (c.collapsed === null || c.collapsed === 0) continue;
      const dealt = score(swap({ ...c, faces: [c.faces[0]], collapsed: 0 }));
      if (dealt === full) continue;
      const was = faceLabel(c.faces[0]);
      const now = faceLabel(c.faces[c.collapsed]);
      say(d.relicId, better(full, dealt)
        ? `the undecided ${was} landed as ${now}, and it played.`
        : `the undecided ${was} landed as ${now}, and the hand reads worse for it.`);
    } else if (deal.extraHole) {
      // The hand with one hole card fewer, whichever one it could best spare.
      let spare: number | null = null;
      for (const id of p.hole) {
        const s = score(cards.filter((x) => x.id !== id));
        if (spare === null || better(s, spare)) spare = s;
      }
      if (spare === null || !better(full, spare)) continue;
      say(d.relicId, `the extra hole card played, in ${sc.used.name}.`);
    } else {
      continue;
    }
    credited.add(d.relicId);
  }
}

/**
 * Twofold: when a Wild that fills two places is what made the hand, say so.
 * The hand is read again with every Wild in one place only, and a line is
 * written only when that reads worse.
 */
function creditTwofold(t: Table, sc: Scored): void {
  const p = sc.player;
  if (!hasRule(p.relics, 'twofold')) return;
  const ids = sc.used.usedIds;
  const twice = ids.find((id, i) => ids.indexOf(id) !== i);
  if (!twice) return;
  const mods = modsFor(t, p);
  const board = sc.timeline === 'echo' && t.echoTimeline ? t.echoTimeline.boardIds : t.board;
  const once = evaluate({ cards: cardsOf(t, [...scoringHole(t, p), ...board]), viewerId: p.id, mods: { ...mods, wildTwice: false } }).score;
  const better = sc.lowWins ? sc.used.score < once : sc.used.score > once;
  if (!better) return;
  const relicId = p.relics.find((id) => RELIC_BY_ID[id]?.rule === 'twofold') ?? 'twofold';
  log(t, `${p.name}'s ${RELIC_BY_ID[relicId]?.name ?? 'Twofold'}: the Wild ${describeCard(t, twice)} fills two places, in ${sc.used.name}.`, 'impossible', {
    playerId: p.id, rule: relicId,
  });
}

/**
 * The High Spade: of the players contesting a pot, the one holding the
 * highest Spade in the hole, when it is theirs alone, they own The High Spade
 * and their hand did not win it. A Wild is any card, so it is the Ace of
 * Spades; a Prism is every suit, so it is a Spade of its own rank; where a
 * player's rules make Spades and Clubs one suit, a Club is a Spade for them.
 * Each hole card is read as its holder reads it, after the showdown settled it.
 */
function highSpade(
  t: Table, pot: Pot, scored: Map<string, Scored>, ws: Scored[],
): { player: Player; label: string; relicId: string } | null {
  let top = 0;
  let holders: Array<{ player: Player; label: string }> = [];
  for (const id of pot.eligible) {
    const q = scored.get(id)?.player;
    if (!q) continue;
    const merged = !!modsFor(t, q).mergedColors;
    let best = 0;
    let label = '';
    for (const cid of q.hole) {
      const c = t.cards.get(cid);
      const f = c ? faceFor(c, q.id) : null;
      if (!c || !f) continue;
      const marks = marksFor(c, q.id);
      const rank = marks.includes('wild') ? 14
        : (f.suit === 'S' || marks.includes('prism') || (merged && f.suit === 'C')) ? f.rank : 0;
      if (rank > best) {
        best = rank;
        label = marks.includes('wild') ? `the Wild ${faceLabel(f)}` : marks.includes('prism') ? `the Prism ${faceLabel(f)}` : faceLabel(f);
      }
    }
    if (best === 0) continue;
    if (best > top) { top = best; holders = [{ player: q, label }]; } else if (best === top) holders.push({ player: q, label });
  }
  if (holders.length !== 1) return null;
  const { player, label } = holders[0];
  if (!hasRule(player.relics, 'high_spade') || ws.some((w) => w.player.id === player.id)) return null;
  const relicId = player.relics.find((id) => RELIC_BY_ID[id]?.rule === 'high_spade') ?? 'high_spade';
  return { player, label, relicId };
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
