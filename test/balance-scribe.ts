/**
 * Is writing a sigil worth it, and is it worth too much?
 *
 * Plays full four-handed runs twice over the same seeds: once where nobody
 * ever writes on the Market's page, once where seat 0 writes at every Market
 * and nobody else does. Seat 0 is a bot like the others, so the only
 * difference between the two halves is the page. A fair edge moves seat 0's
 * placement and win rate up a little; a dominant one moves them a lot.
 *
 * Run: HEXHOLD_PACE=10 npx tsx test/balance-scribe.ts [runs] [maxSeconds]
 */
import { Engine } from '../server/game/engine';
import { botScribe, type Draft } from '../server/game/bots';
import { SCRIBED_ID } from '../shared/sigils';
import type { FxEvent } from '../shared/protocol';

const RUNS = Number(process.argv[2] ?? 12);
const MAX_SECONDS = Number(process.argv[3] ?? 400);

interface Out { placement: number; won: boolean; written: number; cast: number; finished: boolean }

function play(seed: number, writer: boolean): Promise<Out> {
  return new Promise((resolve) => {
    let cast = 0;
    const e: Engine = new Engine(`BAL${seed}${writer ? 'W' : 'C'}`, 'host', {
      startingChips: 20000, baseBlind: 200, handsPerAnte: 3,
      actionSeconds: 3, responseSeconds: 1, shopSeconds: 3, magicEnabled: true,
      seed: `balance:${seed}`,
    }, (fx: FxEvent[]) => {
      for (const f of fx) if (f.t === 'cast' && f.sigilId === SCRIBED_ID && f.casterId === 'host') cast++;
    }, () => {
      // Counted as it happens: the ledger keeps only its last 200 lines.
      for (const l of e.table.log) {
        if (seen.has(l.id)) continue;
        seen.add(l.id);
        if (l.playerId === 'host' && /writes a sigil/.test(l.text)) out.written++;
      }
      if (e.table.phase === 'gameover') done(true);
    });
    const seen = new Set<string>();
    const out = { written: 0 };
    const t0 = Date.now();
    const guard = setInterval(() => { if (Date.now() - t0 > MAX_SECONDS * 1000) done(false); }, 500);
    let over = false;
    function done(finished: boolean): void {
      if (over) return;
      over = true;
      clearInterval(guard);
      const t = e.table;
      const ranked = [...t.players].sort((a, b) =>
        (a.id === t.winnerId ? -1 : b.id === t.winnerId ? 1 : 0) || (b.chips - a.chips));
      const placement = ranked.findIndex((p) => p.id === 'host') + 1;
      e.dispose();
      resolve({ placement, won: t.winnerId === 'host', written: out.written, cast, finished });
    }
    e.addPlayer('host', 'Probe', true);
    for (let k = 1; k < 4; k++) e.addBot();
    e.start();
  });
}

/**
 * The strongest sentences the reader will accept: whole-table effects and
 * bundles aimed at the leader. Weighted toward the expensive ones, so the
 * probe writes the most powerful spell it can afford every time — the
 * player a price has to hold against, not the average one.
 */
const SHARP: Draft[] = [
  { text: 'hex everyone', weight: 6 },
  { text: "see everyone's cards", weight: 4 },
  { text: "drain everyone's mana", weight: 6 },
  { text: "hex the chip leader and drain their mana", weight: 6 },
  { text: 'make my cards wild', weight: 7 },
  { text: 'make my worst card wild and protect it', weight: 6 },
  { text: "burn the river and see the chip leader's cards", weight: 5 },
];

type Mode = 'never' | 'situational' | 'sharp';

async function half(mode: Mode): Promise<Out[]> {
  const writer = mode !== 'never';
  botScribe.chanceFor = (p) => (writer && p.id === 'host' ? 1 : 0);
  botScribe.drafts = mode === 'sharp' ? () => SHARP : null;
  // Runs share the hook, so a half plays its runs together and the halves in turn.
  return Promise.all(Array.from({ length: RUNS }, (_, i) => play(i, writer)));
}

const control = await half('never');
const written = await half('situational');
const sharp = await half('sharp');

const sum = (xs: Out[]) => ({
  placement: xs.reduce((a, o) => a + o.placement, 0) / xs.length,
  wins: xs.filter((o) => o.won).length,
  unfinished: xs.filter((o) => !o.finished).length,
  written: xs.reduce((a, o) => a + o.written, 0),
  cast: xs.reduce((a, o) => a + o.cast, 0),
});
const c = sum(control);
const w = sum(written);
console.log(`\n${RUNS} runs a half, four-handed, seat 0 is the probe (1st is best, 2.5 is average)`);
console.log(`  never writes   avg place ${c.placement.toFixed(2)}   won ${c.wins}/${RUNS}${c.unfinished ? `   (${c.unfinished} timed out)` : ''}`);
console.log(`  always writes  avg place ${w.placement.toFixed(2)}   won ${w.wins}/${RUNS}   pages written ${w.written}, cast ${w.cast}${w.unfinished ? `   (${w.unfinished} timed out)` : ''}`);
const x = sum(sharp);
console.log(`  writes sharp   avg place ${x.placement.toFixed(2)}   won ${x.wins}/${RUNS}   pages written ${x.written}, cast ${x.cast}${x.unfinished ? `   (${x.unfinished} timed out)` : ''}`);
process.exit(0);
