/**
 * Which relics just fired, read from the ledger.
 *
 * The server has tagged every log line a relic's rule caused with that relic's
 * id (`LogEntry.rule`) since the rule shelf went in, and nothing on the client
 * ever read it: a Keepsake handing a card back, a Lodestone turning a rank
 * wild, a creed waking — all of it happened in the ledger and nowhere on the
 * table. The basketball roguelike flashes a charm's slot every time the charm
 * pays out, and that is what makes a build feel like it is doing something.
 *
 * This turns new tagged entries into client-side `relic` effects for the fx
 * bridge. It is a client concern, so the server's protocol does not grow: the
 * event is derived here and never crosses the wire.
 *
 * The first view of a table only learns what is already there. A reload, a
 * reconnect or joining mid-run must not replay a run's worth of triggers.
 */
import type { TableView } from '@shared/types';
import { RELIC_BY_ID } from '@shared/relics';

export interface RelicFx { t: 'relic'; playerId: string; relicId: string }

export function createRelicWatcher(): (view: TableView | null) => RelicFx[] {
  let code: string | null = null;
  const seen = new Set<string>();
  return (view) => {
    if (!view) { code = null; seen.clear(); return []; }
    if (view.code !== code) {
      code = view.code;
      seen.clear();
      for (const e of view.log) seen.add(e.id);
      return [];
    }
    const out: RelicFx[] = [];
    for (const e of view.log) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.rule && e.playerId && RELIC_BY_ID[e.rule]) {
        out.push({ t: 'relic', playerId: e.playerId, relicId: e.rule });
      }
    }
    // The server keeps the last 200 lines; forget what has scrolled off so
    // the set cannot grow for the length of a long run.
    if (seen.size > 600) {
      const live = new Set(view.log.map((e) => e.id));
      for (const id of seen) if (!live.has(id)) seen.delete(id);
    }
    return out;
  };
}
