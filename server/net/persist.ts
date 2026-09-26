/**
 * Keeping tables alive across a restart.
 *
 * A deploy, a crash, or an operator restarting the process should not end
 * everyone's game. The table is mostly plain data, but it holds a Map of card
 * entities and a Set of who has acted, neither of which survives JSON — so the
 * conversion is explicit in both directions rather than hopeful.
 *
 * Anything that fails to restore is discarded rather than half-loaded. A lost
 * table is a bad evening; a corrupt one is a bug report nobody can reproduce.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CardEntity } from '../../shared/cards';
import type { Table } from '../../shared/types';
import { config } from '../config';

const VERSION = 2;

interface Snapshot {
  v: number;
  at: number;
  tables: SerializedTable[];
  /** playerId -> reconnect token. Without these nobody can reclaim a seat. */
  tokens: Array<[string, string]>;
}

type SerializedTable = Omit<Table, 'cards' | 'actedThisStreet' | 'shop'> & {
  cards: Array<[string, CardEntity]>;
  actedThisStreet: string[];
  shop: Array<[string, Table['shop'] extends Map<string, infer V> ? V : never]>;
};

function serialize(t: Table): SerializedTable {
  const { cards, actedThisStreet, shop, ...rest } = t;
  return {
    ...rest,
    cards: [...cards.entries()],
    actedThisStreet: [...actedThisStreet],
    shop: [...shop.entries()],
  };
}

function deserialize(s: SerializedTable): Table | null {
  try {
    if (!Array.isArray(s.cards) || !Array.isArray(s.players)) return null;
    const { cards, actedThisStreet, shop, ...rest } = s;
    const table: Table = {
      ...(rest as unknown as Omit<Table, 'cards' | 'actedThisStreet' | 'shop'>),
      cards: new Map(cards),
      actedThisStreet: new Set(actedThisStreet ?? []),
      shop: new Map(shop ?? []),
    };

    /*
     * Everything but `cards` and `players` was spread out of the stored blob
     * and cast to a Table, so a row written by an older build restores with
     * whatever fields that build happened to save. A table whose blinds came
     * back null reached postBlinds and threw on `t.sb.toLocaleString()` once a
     * tick, for ever, behind the stall guard.
     *
     * The blinds are derivable from the config, so repair them rather than
     * throwing the game away. Anything not derivable is left to the checks
     * below, which drop the table instead of restoring one that cannot run.
     */
    if (!Number.isFinite(table.bb) || table.bb <= 0) table.bb = table.config?.baseBlind ?? 0;
    if (!Number.isFinite(table.sb) || table.sb <= 0) table.sb = Math.floor(table.bb / 2);
    if (!Number.isFinite(table.bb) || table.bb <= 0) return null;

    for (const key of ['pot', 'currentBet', 'minRaise', 'ante', 'handNumber', 'dealerSeat'] as const) {
      if (!Number.isFinite(table[key])) return null;
    }
    if (typeof table.phase !== 'string') return null;

    // A restored table has nobody connected yet — the clients have to come back.
    for (const p of table.players) {
      p.connected = false;
      if (!p.isBot) p.sittingOut = true;
    }
    // Clocks measured against the old process's wall time are meaningless.
    table.actingUntil = null;
    if (table.stack) table.stack.closesAt = Date.now() + table.config.responseSeconds * 1000;
    return table;
  } catch {
    return null;
  }
}

const file = (): string => path.resolve(config.persistence.file);

export function saveTables(tables: Table[], tokens: Map<string, string>): void {
  if (!config.persistence.enabled) return;
  try {
    const target = file();
    mkdirSync(path.dirname(target), { recursive: true });
    const snapshot: Snapshot = {
      v: VERSION,
      at: Date.now(),
      // A lobby nobody has started is not worth restoring.
      tables: tables.filter((t) => t.phase !== 'lobby' && t.phase !== 'gameover').map(serialize),
      tokens: [...tokens.entries()],
    };
    // Write beside the target and rename, so a crash mid-write cannot leave a
    // truncated file that fails to parse on the next boot.
    const tmp = `${target}.tmp`;
    writeFileSync(tmp, JSON.stringify(snapshot));
    renameSync(tmp, target);
  } catch (err) {
    console.error('[hexhold] could not save tables:', err);
  }
}

export function loadTables(): { tables: Table[]; tokens: Map<string, string> } {
  if (!config.persistence.enabled) return { tables: [], tokens: new Map() };
  try {
    const raw = readFileSync(file(), 'utf8');
    const snapshot = JSON.parse(raw) as Snapshot;
    if (snapshot?.v !== VERSION || !Array.isArray(snapshot.tables)) {
      console.log('[hexhold] ignoring a save from a different version');
      return { tables: [], tokens: new Map() };
    }
    // Anything older than a couple of hours is not a game anyone is waiting on.
    if (Date.now() - snapshot.at > 2 * 3_600_000) return { tables: [], tokens: new Map() };

    const out: Table[] = [];
    for (const s of snapshot.tables) {
      const t = deserialize(s);
      if (t) out.push(t);
    }
    if (out.length) console.log(`[hexhold] restored ${out.length} table(s)`);
    return { tables: out, tokens: new Map(snapshot.tokens ?? []) };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
      console.error('[hexhold] could not read the save:', err);
    }
    return { tables: [], tokens: new Map() };
  }
}
