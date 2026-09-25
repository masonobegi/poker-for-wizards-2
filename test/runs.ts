/**
 * Whole runs, start to finish, summarised.
 *
 * `metrics` samples a window of time; this plays complete runs to game over
 * and reports what a run is actually like as a unit: how long it lasts, how
 * deep it gets, and whether it ever produced one of the hands the game is
 * named after. Runs are independent, so it plays several at once.
 *
 * Run: HEXHOLD_PACE=10 npx tsx test/runs.ts [runs] [players] [maxSeconds]
 */
import { Engine } from '../server/game/engine';
import type { FxEvent } from '../shared/protocol';

const IMPOSSIBLE = /Five of a Kind|Flush House|Flush Five/;
const RUNS = Number(process.argv[2] ?? 6);
const PLAYERS = Math.max(2, Math.min(6, Number(process.argv[3] ?? 4)));
const MAX_SECONDS = Number(process.argv[4] ?? 600);

interface Summary {
  hands: number;
  ante: number;
  impossibleWins: number;
  impossibleNames: string[];
  /** Hand number of each elimination. */
  eliminatedAt: number[];
  finished: boolean;
  /** The ledger of a run that ended in its first two hands, for diagnosis. */
  earlyLog?: string[];
}

function play(i: number): Promise<Summary> {
  return new Promise((resolve) => {
    const s: Summary = {
      hands: 0, ante: 1, impossibleWins: 0, impossibleNames: [], eliminatedAt: [], finished: false,
    };
    const engine: Engine = new Engine(
      `RUN${i}`, 'host',
      {
        startingChips: 20000, baseBlind: 200, handsPerAnte: 3,
        actionSeconds: 3, responseSeconds: 1, shopSeconds: 2, magicEnabled: true,
      },
      (fx: FxEvent[]) => {
        for (const e of fx) {
          // By category, not the `impossible` flag: that flag also marks a pot won
          // with an impossible *effect*, including an uncontested one.
          if (e.t === 'win' && IMPOSSIBLE.test(e.handName)) {
            s.impossibleWins++; s.impossibleNames.push(e.handName);
          }
          if (e.t === 'eliminate') s.eliminatedAt.push(engine.table.handNumber);
        }
      },
      () => {
        s.hands = engine.table.handNumber;
        s.ante = engine.table.ante;
        if (engine.table.phase === 'gameover' && !s.finished) done(true);
      },
    );
    const t0 = Date.now();
    const guard = setInterval(() => { if (Date.now() - t0 > MAX_SECONDS * 1000) done(false); }, 500);
    function done(finished: boolean): void {
      if (s.finished && finished) return;
      s.finished = finished;
      clearInterval(guard);
      if (s.hands <= 2) s.earlyLog = engine.table.log.map((l) => l.text);
      engine.dispose();
      resolve(s);
    }
    engine.addPlayer('host', 'Probe', true);
    for (let k = 1; k < PLAYERS; k++) engine.addBot();
    engine.start();
  });
}

const results = await Promise.all(Array.from({ length: RUNS }, (_, i) => play(i)));
for (const [i, r] of results.entries()) {
  console.log(
    `run ${i}: ${r.finished ? 'finished' : 'TIMED OUT'} · ${r.hands} hands · ante ${r.ante}`
    + ` · eliminated at hands [${r.eliminatedAt.join(', ')}]`
    + ` · impossible ${r.impossibleWins}${r.impossibleNames.length ? ` (${r.impossibleNames.join(', ')})` : ''}`,
  );
  if (r.earlyLog) console.log(`  early ledger:\n    ${r.earlyLog.join('\n    ')}`);
}
const withImpossible = results.filter((r) => r.impossibleWins > 0).length;
const avgHands = results.reduce((a, r) => a + r.hands, 0) / results.length;
const avgAnte = results.reduce((a, r) => a + r.ante, 0) / results.length;
console.log(`\n${withImpossible}/${results.length} runs saw an impossible win · avg ${avgHands.toFixed(1)} hands · avg ante ${avgAnte.toFixed(1)}`);
process.exit(0);
