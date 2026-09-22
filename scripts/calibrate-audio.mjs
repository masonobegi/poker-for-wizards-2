/**
 * Sets the faders.
 *
 * Renders every sound in the registry at unity gain, measures how loud it
 * actually is, and writes the per-sound trim that lands it on the target
 * `src/audio/mix.ts` asks for. That file holds the intent; this script does
 * the arithmetic, so a synth can be rewritten without anyone having to guess
 * a new gain by ear they cannot hear.
 *
 * Loudness here is the loudest 50 ms window of the rendered sound, not whole
 * buffer RMS. A 40 ms card flick and a three second victory pad have to be
 * comparable, and averaging a transient across three seconds of silence says
 * it is inaudible when it is not.
 *
 * Every sound is rendered several times, because a good share of the synths
 * randomise voicing per play; the median across renders is what gets trimmed,
 * so one unusually quiet roll of the dice does not move the mix.
 *
 * Run: npm run audio:calibrate   (needs the dev server up)
 */
import { launch } from '../test/browser.mjs';
import { readFileSync, writeFileSync } from 'node:fs';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:5173/';
const RENDERS = 5;
/** No synth may be pushed so hard it clips on its own. */
const PEAK_CEILING = 0.92;
/** A trim outside this range means the synth, not the fader, is wrong. */
const TRIM_MIN = 0.05;
const TRIM_MAX = 12;

const browser = await launch({ headless: true });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.error('  page error:', e.message));

console.log(`▶ opening ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__hexholdAudioTest, null, { timeout: 30_000 });

const measured = await page.evaluate(async ({ renders }) => {
  const SR = 44100;
  const api = window.__hexholdAudioTest;

  /** Loudest 50 ms window, plus absolute peak, of a rendered buffer. */
  function analyse(buffer) {
    const n = buffer.length;
    const chans = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
    const mono = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let c = 0; c < chans.length; c++) sum += chans[c][i];
      const v = sum / chans.length;
      mono[i] = v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const win = Math.min(n, Math.round(SR * 0.05));
    if (win < 8) return { loud: 0, peak };
    // Sliding sum of squares — one pass, no per-window rescan.
    let acc = 0;
    for (let i = 0; i < win; i++) acc += mono[i] * mono[i];
    let best = acc;
    for (let i = win; i < n; i++) {
      acc += mono[i] * mono[i] - mono[i - win] * mono[i - win];
      if (acc > best) best = acc;
    }
    return { loud: Math.sqrt(best / win), peak };
  }

  const out = [];
  for (const { name, len, target } of api.sfx) {
    const dur = Math.max(0.25, len + 0.3);
    const louds = [];
    const peaks = [];
    for (let r = 0; r < renders; r++) {
      const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
      api.renderSfx(name, ctx, 1, /* raw */ true);
      const { loud, peak } = analyse(await ctx.startRendering());
      louds.push(loud);
      peaks.push(peak);
    }
    const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    out.push({ name, target, loud: median(louds), peak: Math.max(...peaks) });
  }
  return out;
}, { renders: RENDERS });

await browser.close();

// ---------------------------------------------------------------------------
// Fader positions
// ---------------------------------------------------------------------------

const rows = [];
for (const m of measured) {
  let trim = m.loud > 1e-6 ? m.target / m.loud : 1;
  let note = '';
  // A synth that already peaks near full scale cannot be trimmed up to its
  // target without clipping; take it as loud as it will safely go and say so.
  if (m.peak * trim > PEAK_CEILING) {
    trim = PEAK_CEILING / m.peak;
    note = 'peak-limited';
  }
  if (trim < TRIM_MIN || trim > TRIM_MAX) {
    trim = Math.min(TRIM_MAX, Math.max(TRIM_MIN, trim));
    note = note ? `${note}, clamped` : 'clamped';
  }
  rows.push({ ...m, trim: Number(trim.toFixed(3)), note });
}

const db = (x) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);
console.log('\n  name              raw       trim      → loudness   target');
console.log('  ' + '-'.repeat(68));
for (const r of rows) {
  const landed = r.loud * r.trim;
  console.log(
    `  ${r.name.padEnd(16)} ${db(r.loud).padStart(6)}dB ${String(r.trim).padStart(7)} ` +
      `${db(landed).padStart(8)}dB ${db(r.target).padStart(8)}dB  ${r.note}`,
  );
}

const landedAll = rows.map((r) => r.loud * r.trim);
console.log(
  `\n  spread after calibration: ${db(Math.min(...landedAll))}dB … ${db(Math.max(...landedAll))}dB ` +
    `(${(20 * Math.log10(Math.max(...landedAll) / Math.min(...landedAll))).toFixed(1)}dB)`,
);

// ---------------------------------------------------------------------------
// Write it back
// ---------------------------------------------------------------------------

const FILE = 'src/audio/mix.ts';
const src = readFileSync(FILE, 'utf8');
const BEGIN = '// BEGIN GENERATED TRIM';
const END = '// END GENERATED TRIM';
const a = src.indexOf(BEGIN);
const b = src.indexOf(END);
if (a < 0 || b < 0) throw new Error(`${FILE} is missing its generated-trim markers.`);

const body = [
  BEGIN,
  'export const TRIM: Record<SfxName, number> = {',
  ...rows.map((r) => `  ${r.name}: ${r.trim},${r.note ? ` // ${r.note}` : ''}`),
  '};',
].join('\n');

writeFileSync(FILE, src.slice(0, a) + body + '\n' + src.slice(b));
console.log(`\n  ✔ wrote ${rows.length} trims into ${FILE}`);
