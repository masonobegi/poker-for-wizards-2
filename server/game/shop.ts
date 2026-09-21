/**
 * The Market — what happens between antes.
 *
 * Each player gets their own stock, so nobody is racing anybody to a relic.
 * Rites are the interesting purchase: they write a permanent mark onto a card
 * in the *shared* deck, so an upgrade you pay for can turn up in an opponent's
 * hand three hands later. That tension is the point.
 */
import { nanoid } from 'nanoid';
import { MARKS, type MarkId, faceLabel } from '../../shared/cards';
import { RELICS, RELIC_BY_ID, relicNumber } from '../../shared/relics';
import { SIGILS, SIGIL_BY_ID } from '../../shared/sigils';
import type { Rng } from '../../shared/rng';
import type { Player, ShopItem, ShopState, Table } from '../../shared/types';
import { giveSigil, randomSigil } from './magic';
import { log, maxManaFor, sigilHandSize } from './table';

const RITE_MARKS: MarkId[] = ['blooded', 'prism', 'echo', 'wild', 'leaden', 'cursed'];
const BASE_REROLL = 3;

function rollSigilItem(rng: Rng): ShopItem {
  const bag = SIGILS.flatMap((s) => Array(({ common: 6, rare: 3, mythic: 1 } as const)[s.rarity]).fill(s));
  const def = rng.pick(bag) as typeof SIGILS[number];
  return { kind: 'sigil', id: def.id, uid: nanoid(8), price: def.price };
}

function rollRelicItem(rng: Rng, owned: string[]): ShopItem | null {
  const pool = RELICS.filter((r) => !owned.includes(r.id));
  if (pool.length === 0) return null;
  const bag = pool.flatMap((r) => Array(({ common: 6, rare: 3, mythic: 1 } as const)[r.rarity]).fill(r));
  const def = rng.pick(bag) as typeof RELICS[number];
  return { kind: 'relic', id: def.id, uid: nanoid(8), price: def.price };
}

function rollRiteItem(t: Table, rng: Rng): ShopItem | null {
  // Only ordinary, unmarked cards from the shared deck are worth inscribing.
  const candidates = [...t.cards.values()].filter(
    (c) => c.marks.length === 0 && c.faces.length === 1 && c.origin !== 'conjured',
  );
  if (candidates.length === 0) return null;
  const card = rng.pick(candidates);
  const markId = rng.pick(RITE_MARKS);
  const face = card.faces[0];
  const price = markId === 'wild' ? 16 : markId === 'cursed' || markId === 'leaden' ? 5 : 10;
  return {
    kind: 'rite',
    uid: nanoid(8),
    price,
    markId,
    cardId: card.id,
    label: `${MARKS[markId].name} the ${faceLabel(face)}`,
  };
}

export function rollShop(t: Table, p: Player, rng: Rng, rerolls = 0): ShopState {
  const items: ShopItem[] = [];

  items.push(rollSigilItem(rng), rollSigilItem(rng));
  const relic = rollRelicItem(rng, p.relics);
  if (relic) items.push(relic);
  const rite = rollRiteItem(t, rng);
  if (rite) items.push(rite);
  if (rng.chance(0.4)) {
    items.push({ kind: 'mana', uid: nanoid(8), price: 6, amount: 1 });
  } else {
    items.push(rollSigilItem(rng));
  }

  return {
    items,
    sold: [],
    rerollCost: BASE_REROLL + rerolls * 2,
    closesAt: Date.now() + t.config.shopSeconds * 1000,
  };
}

export interface BuyResult { ok: boolean; error?: string; note?: string }

export function buy(t: Table, p: Player, uid: string, rng: Rng): BuyResult {
  const shop = t.shop.get(p.id);
  if (!shop) return { ok: false, error: 'The market is closed' };
  const item = shop.items.find((i) => i.uid === uid);
  if (!item) return { ok: false, error: 'No such item' };
  if (shop.sold.includes(uid)) return { ok: false, error: 'Already sold' };
  if (p.shards < item.price) return { ok: false, error: 'Not enough shards' };

  switch (item.kind) {
    case 'sigil': {
      if (p.sigils.length >= sigilHandSize(p)) return { ok: false, error: 'Your hand is full' };
      giveSigil(t, p, { uid: nanoid(8), defId: item.id });
      break;
    }
    case 'relic': {
      if (p.relics.includes(item.id)) return { ok: false, error: 'You already own it' };
      p.relics.push(item.id);
      p.maxMana = maxManaFor(p);
      break;
    }
    case 'rite': {
      const card = t.cards.get(item.cardId);
      if (!card) return { ok: false, error: 'That card has left the deck' };
      if (!card.marks.includes(item.markId)) card.marks.push(item.markId);
      break;
    }
    case 'mana': {
      p.maxMana += item.amount;
      break;
    }
  }

  p.shards -= item.price;
  shop.sold.push(uid);

  const label = item.kind === 'sigil' ? SIGIL_BY_ID[item.id]?.name
    : item.kind === 'relic' ? RELIC_BY_ID[item.id]?.name
      : item.kind === 'rite' ? item.label
        : `+${item.amount} max mana`;
  log(t, `${p.name} buys ${label}.`, 'magic', { playerId: p.id });
  return { ok: true, note: label };
}

export function reroll(t: Table, p: Player, rng: Rng): BuyResult {
  const shop = t.shop.get(p.id);
  if (!shop) return { ok: false, error: 'The market is closed' };
  if (p.shards < shop.rerollCost) return { ok: false, error: 'Not enough shards' };
  p.shards -= shop.rerollCost;
  const next = rollShop(t, p, rng, Math.floor((shop.rerollCost - BASE_REROLL) / 2) + 1);
  next.closesAt = shop.closesAt;
  t.shop.set(p.id, next);
  return { ok: true };
}

/**
 * Everything paid out when the market opens.
 *
 * A stipend that scales with the ante, so the expensive mythics are reachable
 * late rather than theoretical, plus a rubber-band top-up for anyone below the
 * average stack. Without the top-up the chip leader also wins the shop, and a
 * player who is behind has nothing to do in the one phase that exists to give
 * them a way back.
 */
export function payInterest(t: Table): void {
  const standing = t.players.filter((p) => !p.eliminated);
  if (standing.length === 0) return;

  const average = standing.reduce((a, p) => a + p.chips, 0) / standing.length;
  const stipend = 2 + t.ante;

  for (const p of standing) {
    let gain = stipend;

    // Up to three extra for being behind, scaled by how far behind.
    if (p.chips < average) {
      const behind = Math.min(1, (average - p.chips) / Math.max(1, average));
      gain += Math.round(behind * 3);
    }

    const pct = relicNumber(p.relics, (r) => r.economy?.interestPct);
    const interest = pct > 0 ? Math.ceil((p.shards * pct) / 100) : 0;
    gain += interest;

    p.shards += gain;
    log(
      t,
      `${p.name} draws ${gain} shards${interest ? ` (${interest} of it interest)` : ''}.`,
      'magic',
      { playerId: p.id },
    );
  }
}
