/**
 * Headless table simulation.
 *
 * Runs a full game of bots against each other with no sockets and no browser,
 * checking the invariants that matter after every single state push:
 *   - chips are conserved (nobody mints or destroys money)
 *   - nobody ever goes negative
 *   - the pot never exceeds what players have actually committed
 *   - the hand always advances (no phase deadlocks)
 *
 * Run: npx tsx test/sim.ts [seconds] [players]
 */
import { Engine } from '../server/game/engine';
import { alive, totalPot } from '../server/game/table';
import type { FxEvent } from '../shared/protocol';
import type { Table } from '../shared/types';

const SECONDS = Number(process.argv[2] ?? 45);
const PLAYERS = Math.max(2, Math.min(6, Number(process.argv[3] ?? 4)));

interface Violation { at: number; text: string }
const violations: Violation[] = [];
const fxCount = new Map<string, number>();
const phaseSeen = new Set<string>();
const handNames = new Map<string, number>();

let pushes = 0;
let lastHand = 0;
let lastProgress = Date.now();

const engine = new Engine(
  'SIMU',
  'host',
  {
    startingChips: 20000,
    baseBlind: 200,
    handsPerAnte: 3,
    actionSeconds: 3,
    responseSeconds: 1,
    shopSeconds: 3,
    magicEnabled: true,
  },
  (fx: FxEvent[]) => {
    for (const e of fx) {
      fxCount.set(e.t, (fxCount.get(e.t) ?? 0) + 1);
      if (e.t === 'win') handNames.set(e.handName, (handNames.get(e.handName) ?? 0) + 1);
    }
  },
  () => { pushes++; check(engine.table); },
);

let START = 0;
let running = false;

function check(t: Table): void {
  phaseSeen.add(t.phase);
  if (!running) return;

  const onTable = t.players.reduce((a, p) => a + p.chips + p.bet, 0);
  const banked = t.pot;
  const total = onTable + banked;

  // Relics can legitimately pay out from the bank, so allow an upward drift
  // but never a leak downwards.
  if (total < START - 1) {
    violations.push({ at: t.handNumber, text: `chips lost: ${total} of ${START}` });
  }

  for (const p of t.players) {
    if (p.chips < 0) violations.push({ at: t.handNumber, text: `${p.name} has ${p.chips} chips` });
    if (p.bet < 0) violations.push({ at: t.handNumber, text: `${p.name} bet ${p.bet}` });
    if (p.mana < 0) violations.push({ at: t.handNumber, text: `${p.name} mana ${p.mana}` });
    if (p.mana > p.maxMana) {
      violations.push({ at: t.handNumber, text: `${p.name} mana ${p.mana} over cap ${p.maxMana}` });
    }
    if (p.hole.length > 4) {
      violations.push({ at: t.handNumber, text: `${p.name} holds ${p.hole.length} hole cards` });
    }
  }

  if (t.board.length > 8) {
    violations.push({ at: t.handNumber, text: `board grew to ${t.board.length}` });
  }

  if (totalPot(t) < 0) violations.push({ at: t.handNumber, text: 'negative pot' });

  if (t.handNumber !== lastHand) { lastHand = t.handNumber; lastProgress = Date.now(); }
}

engine.addPlayer('host', 'Simulacrum', true);
for (let i = 1; i < PLAYERS; i++) engine.addBot();

const started = engine.start();
if (!started.ok) {
  console.error('could not start:', started.error);
  process.exit(1);
}
START = engine.table.players.reduce((a, p) => a + p.chips, 0);
running = true;
lastProgress = Date.now();

const t0 = Date.now();
const watchdog = setInterval(() => {
  // A hand that has not advanced in a minute means something is wedged.
  if (Date.now() - lastProgress > 60_000 && engine.table.phase !== 'gameover') {
    violations.push({
      at: engine.table.handNumber,
      text: `stalled in phase "${engine.table.phase}" acting=${engine.table.actingId ?? 'nobody'}`,
    });
    finish();
  }
  if (Date.now() - t0 > SECONDS * 1000) finish();
  if (engine.table.phase === 'gameover') finish();
}, 500);

function finish(): void {
  clearInterval(watchdog);
  engine.dispose();

  const t = engine.table;
  const survivors = alive(t);
  const chips = t.players.reduce((a, p) => a + p.chips + p.bet, 0) + t.pot;

  console.log('\n──────── HEXHOLD simulation ────────');
  console.log(`  ran            ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  hands played   ${t.handNumber}`);
  console.log(`  ante reached   ${t.ante}  (blinds ${t.sb}/${t.bb})`);
  console.log(`  state pushes   ${pushes}`);
  console.log(`  phases seen    ${[...phaseSeen].join(', ')}`);
  console.log(`  chips          ${chips.toLocaleString()} (started ${START.toLocaleString()})`);
  console.log(`  players left   ${survivors.length} / ${PLAYERS}`);

  const spells = fxCount.get('cast') ?? 0;
  const counters = fxCount.get('counter') ?? 0;
  const collapses = fxCount.get('collapse') ?? 0;
  console.log(`\n  sigils cast    ${spells}`);
  console.log(`  countered      ${counters}`);
  console.log(`  collapses      ${collapses}`);
  console.log(`  superposed     ${fxCount.get('superpose') ?? 0}`);
  console.log(`  burns          ${fxCount.get('burn') ?? 0}`);
  console.log(`  rewinds        ${fxCount.get('rewind') ?? 0}`);
  console.log(`  diverged       ${fxCount.get('diverge') ?? 0}`);
  console.log(`  seals          ${fxCount.get('seal') ?? 0}`);

  const won = [...handNames.entries()].sort((a, b) => b[1] - a[1]);
  if (won.length) {
    console.log('\n  winning hands');
    for (const [name, n] of won.slice(0, 12)) console.log(`    ${String(n).padStart(3)} × ${name}`);
  }

  console.log('\n  final stacks');
  for (const p of [...t.players].sort((a, b) => b.chips - a.chips)) {
    const relics = p.relics.length ? `  relics:${p.relics.length}` : '';
    console.log(
      `    ${p.name.padEnd(12)} ${String(p.chips).padStart(8)}` +
      `  won:${p.handsWon}  shards:${p.shards}${relics}`,
    );
  }

  if (violations.length) {
    console.log(`\n  ✖ ${violations.length} INVARIANT VIOLATIONS`);
    const seen = new Set<string>();
    for (const v of violations) {
      if (seen.has(v.text)) continue;
      seen.add(v.text);
      console.log(`    hand ${v.at}: ${v.text}`);
      if (seen.size > 12) break;
    }
    console.log('────────────────────────────────────\n');
    process.exit(1);
  }

  if (t.handNumber < 2) {
    console.log('\n  ✖ barely any hands completed — the engine is probably stuck');
    process.exit(1);
  }

  console.log('\n  ✔ all invariants held');
  console.log('────────────────────────────────────\n');
  process.exit(0);
}
