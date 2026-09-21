/**
 * Fun metrics.
 *
 * Balance is not something to have opinions about in the abstract — it is
 * measurable. This runs bot tables and reports the numbers that actually
 * predict whether the game is enjoyable: how long a hand takes, where that
 * time goes, how often magic fires at all, how much mana dies unspent, and how
 * often a hand ends in a fold instead of a showdown.
 *
 * Run: npx tsx test/metrics.ts [seconds] [players]
 */
import { Engine } from '../server/game/engine';
import { alive, totalPot } from '../server/game/table';
import type { FxEvent } from '../shared/protocol';
import type { Phase, Table } from '../shared/types';
import { SIGIL_BY_ID } from '../shared/sigils';

const SECONDS = Number(process.argv[2] ?? 90);
const PLAYERS = Math.max(2, Math.min(6, Number(process.argv[3] ?? 4)));

const phaseTime = new Map<Phase, number>();
const actionCount = new Map<string, number>();
const castCount = new Map<string, number>();
const handNames = new Map<string, number>();

let lastPhase: Phase | null = null;
let lastPhaseAt = Date.now();
let handsStarted = 0;
let handsToShowdown = 0;
let handsWithCast = 0;
let castThisHand = 0;
let manaWasted = 0;
let manaSamples = 0;
let potSum = 0;
let potSamples = 0;
let impossibleWins = 0;
let eliminations = 0;
let responseWindows = 0;
let counters = 0;

const engine = new Engine(
  'METR', 'host',
  {
    startingChips: 20000, baseBlind: 200, handsPerAnte: 3,
    actionSeconds: 3, responseSeconds: 1, shopSeconds: 2, magicEnabled: true,
  },
  (fx: FxEvent[]) => {
    for (const e of fx) {
      if (e.t === 'cast') {
        castCount.set(e.sigilId, (castCount.get(e.sigilId) ?? 0) + 1);
        castThisHand++;
      }
      if (e.t === 'counter') counters++;
      if (e.t === 'eliminate') eliminations++;
      if (e.t === 'win') {
        handNames.set(e.handName, (handNames.get(e.handName) ?? 0) + 1);
        if (e.impossible) impossibleWins++;
      }
    }
  },
  () => sample(engine.table),
);

function sample(t: Table): void {
  const now = Date.now();
  if (t.phase !== lastPhase) {
    if (lastPhase) {
      phaseTime.set(lastPhase, (phaseTime.get(lastPhase) ?? 0) + (now - lastPhaseAt));
    }
    lastPhase = t.phase;
    lastPhaseAt = now;

    if (t.phase === 'preflop') {
      handsStarted++;
      if (castThisHand > 0) handsWithCast++;
      castThisHand = 0;
    }
    if (t.phase === 'payout') {
      // 'showdown' is set and overwritten before any state is pushed, so a
      // contested hand is detected by more than one revealed hand at payout.
      const revealed = (t.payout?.entries ?? []).filter((e) => e.cards.length > 0).length;
      if (revealed > 1) handsToShowdown++;
      potSum += totalPot(t) + (t.payout?.pots.reduce((a, p) => a + p.amount, 0) ?? 0);
      potSamples++;
      for (const p of alive(t)) { manaWasted += p.mana; manaSamples++; }
    }
  }

  for (const p of t.players) {
    const a = p.lastAction;
    if (!a) continue;
    const key = `${a.kind}@${a.at}:${p.id}`;
    if (!seenActions.has(key)) {
      seenActions.add(key);
      actionCount.set(a.kind, (actionCount.get(a.kind) ?? 0) + 1);
    }
  }
  if (t.stack && t.stack.pending.length > 0 && !seenStacks.has(t.stack.entries[0]?.id ?? '')) {
    seenStacks.add(t.stack.entries[0]?.id ?? '');
    responseWindows++;
  }
}
const seenActions = new Set<string>();
const seenStacks = new Set<string>();

engine.addPlayer('host', 'Metric', true);
for (let i = 1; i < PLAYERS; i++) engine.addBot();
engine.start();

const t0 = Date.now();
const stop = setInterval(() => {
  if (Date.now() - t0 > SECONDS * 1000 || engine.table.phase === 'gameover') finish();
}, 400);

function pct(n: number, d: number): string {
  return d > 0 ? `${((n / d) * 100).toFixed(0)}%` : '—';
}

function finish(): void {
  clearInterval(stop);
  engine.dispose();
  const t = engine.table;
  const elapsed = (Date.now() - t0) / 1000;
  const hands = Math.max(1, t.handNumber);
  const totalActions = [...actionCount.values()].reduce((a, b) => a + b, 0);

  console.log('\n════════ HEXHOLD fun metrics ════════');
  console.log(`  ${PLAYERS} bots, ${elapsed.toFixed(0)}s, ${t.handNumber} hands, ante ${t.ante}\n`);

  console.log('  PACING');
  console.log(`    seconds per hand      ${(elapsed / hands).toFixed(1)}s      ${flag(elapsed / hands, 20, 12)}`);
  console.log(`    hands per minute      ${(hands / (elapsed / 60)).toFixed(1)}`);
  const totalPhase = [...phaseTime.values()].reduce((a, b) => a + b, 0) || 1;
  const rows = [...phaseTime.entries()].sort((a, b) => b[1] - a[1]);
  for (const [phase, ms] of rows) {
    const bar = '█'.repeat(Math.round((ms / totalPhase) * 28));
    console.log(`      ${phase.padEnd(11)} ${(ms / 1000).toFixed(0).padStart(4)}s ${pct(ms, totalPhase).padStart(4)} ${bar}`);
  }

  console.log('\n  MAGIC');
  const casts = [...castCount.values()].reduce((a, b) => a + b, 0);
  console.log(`    sigils cast           ${casts}  (${(casts / hands).toFixed(1)} per hand)   ${flag(casts / hands, 1.5, 3, true)}`);
  console.log(`    hands with any magic  ${pct(handsWithCast, handsStarted)}          ${flag(handsWithCast / Math.max(1, handsStarted), 0.5, 0.75, true)}`);
  console.log(`    response windows      ${responseWindows}`);
  console.log(`    countered             ${counters}`);
  console.log(`    mana unspent at end   ${(manaWasted / Math.max(1, manaSamples)).toFixed(1)} per player   ${flag(manaWasted / Math.max(1, manaSamples), 4, 2)}`);
  const distinct = castCount.size;
  console.log(`    distinct sigils seen  ${distinct} of ${Object.keys(SIGIL_BY_ID).length}`);

  console.log('\n  POKER');
  console.log(`    reached showdown      ${pct(handsToShowdown, handsStarted)}          ${flag(handsToShowdown / Math.max(1, handsStarted), 0.35, 0.5, true)}`);
  for (const [kind, n] of [...actionCount.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${kind.padEnd(8)} ${String(n).padStart(4)}  ${pct(n, totalActions)}`);
  }
  console.log(`    average pot           ${Math.round(potSum / Math.max(1, potSamples)).toLocaleString()} (${(potSum / Math.max(1, potSamples) / t.bb).toFixed(1)} bb)`);
  console.log(`    eliminations          ${eliminations}`);
  console.log(`    impossible wins       ${impossibleWins}`);

  const won = [...handNames.entries()].sort((a, b) => b[1] - a[1]);
  if (won.length) {
    console.log('\n  WINNING HANDS');
    for (const [name, n] of won.slice(0, 8)) console.log(`    ${String(n).padStart(3)} × ${name}`);
  }

  const cold = Object.keys(SIGIL_BY_ID).filter((id) => !castCount.has(id));
  if (cold.length) {
    console.log(`\n  NEVER CAST (${cold.length}): ${cold.slice(0, 14).join(', ')}${cold.length > 14 ? '…' : ''}`);
  }

  console.log('\n═════════════════════════════════════\n');
  process.exit(0);
}

/** ✓ good, ~ borderline, ✗ bad. `higherIsBetter` flips the comparison. */
function flag(value: number, bad: number, good: number, higherIsBetter = false): string {
  if (higherIsBetter) return value >= good ? '✓' : value >= bad ? '~' : '✗ too low';
  return value <= good ? '✓' : value <= bad ? '~' : '✗ too high';
}
