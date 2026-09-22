/**
 * Renders every `SfxName` and every music `Mood` offline and
 * deterministically, measures the result, and fails loudly on anything a
 * player would notice: silence, clipping, a DC thump, a stuck/unreleased
 * envelope, or a static drone where a rhythm was intended.
 *
 * This exists because every sound HEXHOLD makes is synthesized at runtime
 * with the Web Audio API — there are no audio files, and nothing has ever
 * verified the synths actually produce sound. A silent `win_impossible` or
 * 400ms of DC offset on `card_place` would otherwise ship unnoticed.
 *
 * How it works: the built client is opened in a real Chromium tab (Web
 * Audio needs a real browser — it doesn't exist in Node). `src/audio/engine.ts`
 * exposes a small `window.__hexholdAudioTest` hook (see the "TEST HOOK"
 * section at the bottom of that file) that renders one named sound, or one
 * mood, into an `OfflineAudioContext` passed in from here. Everything after
 * that — peak/RMS/DC/duration/spectral-centroid measurement — happens in
 * plain JS inside the page, on the real rendered samples.
 *
 * Serve the built client first:
 *   npx vite build && NODE_ENV=production npx tsx server/index.ts   (serves :3001)
 *
 * Run: node test/audio.mjs [--headed]
 */
import { chromium } from 'playwright';

const HEADED = process.argv.includes('--headed');
const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

const SILENT_PEAK = 0.005; // below this, there's effectively no signal
const CLIP_PEAK = 1.0; // above this, the raw synth is clipping
const HEADROOM_PEAK = 0.8; // design guideline: leave room for several at once
const DC_FAIL = 0.02; // a mean this far from zero reads as a thump
const DC_WARN = 0.008;
const QUIET_RATIO_FAIL = 0.025; // rms this many times below the loudest = inaudible in the mix
const MOOD_STATIC_COV = 0.08; // segment-RMS coefficient of variation below this = static drone

// ---------------------------------------------------------------------------
// Browser-side analysis (stringified into page.evaluate — plain JS only)
// ---------------------------------------------------------------------------

/** Runs entirely inside the page. Renders + measures every sound and mood. */
async function collectInPage(sfxList, moods) {
  const SR = 44100;

  function hannWindow(len) {
    const w = new Float32Array(len);
    for (let i = 0; i < len; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, len - 1));
    return w;
  }

  /** Single-frequency magnitude via Goertzel — a DFT coefficient without a full FFT. */
  function goertzelMag(samples, start, len, freq, sr, win) {
    const w = (2 * Math.PI * freq) / sr;
    const cosine = Math.cos(w);
    const sine = Math.sin(w);
    const coeff = 2 * cosine;
    let q1 = 0;
    let q2 = 0;
    for (let i = 0; i < len; i++) {
      const s = samples[start + i] * win[i];
      const q0 = coeff * q1 - q2 + s;
      q2 = q1;
      q1 = q0;
    }
    const real = q1 - q2 * cosine;
    const imag = q2 * sine;
    return Math.sqrt(real * real + imag * imag);
  }

  /** Spectral centroid (Hz) of a Hann-windowed segment centered on `centerIdx`. */
  function spectralCentroid(mono, sr, centerIdx, n) {
    const winLen = Math.min(4096, n);
    if (winLen < 8) return 0;
    let start = Math.max(0, centerIdx - Math.floor(winLen / 2));
    if (start + winLen > n) start = Math.max(0, n - winLen);
    const win = hannWindow(winLen);
    const bins = 40;
    const fMin = 60;
    const fMax = Math.min(10000, sr / 2 - 100);
    let num = 0;
    let den = 0;
    for (let b = 0; b < bins; b++) {
      const f = fMin * Math.pow(fMax / fMin, b / (bins - 1));
      const mag = goertzelMag(mono, start, winLen, f, sr, win);
      num += f * mag;
      den += mag;
    }
    return den > 0 ? num / den : 0;
  }

  function mixdown(buffer) {
    const n = buffer.length;
    const nCh = buffer.numberOfChannels;
    const chans = [];
    for (let c = 0; c < nCh; c++) chans.push(buffer.getChannelData(c));
    const mono = new Float32Array(n);
    let peak = 0;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let mx = 0;
      for (let c = 0; c < nCh; c++) {
        const v = chans[c][i];
        sum += v;
        const a = Math.abs(v);
        if (a > mx) mx = a;
      }
      mono[i] = sum / nCh;
      if (mx > peak) peak = mx;
    }
    return { mono, peak, n, sr: buffer.sampleRate };
  }

  function measureOneShot(buffer) {
    const { mono, peak, n, sr } = mixdown(buffer);
    const thresh = Math.max(0.001, peak * 0.02);
    let first = -1;
    let last = -1;
    let peakIdx = 0;
    let peakVal = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(mono[i]);
      if (a >= thresh) {
        if (first === -1) first = i;
        last = i;
      }
      if (a > peakVal) {
        peakVal = a;
        peakIdx = i;
      }
    }
    let rms = 0;
    let dc = 0;
    let durationSec = 0;
    if (first !== -1) {
      let sumSq = 0;
      let sum = 0;
      const count = last - first + 1;
      for (let i = first; i <= last; i++) {
        const v = mono[i];
        sumSq += v * v;
        sum += v;
      }
      rms = Math.sqrt(sumSq / count);
      dc = sum / count;
      durationSec = count / sr;
    }
    const spectralHz = first !== -1 ? spectralCentroid(mono, sr, peakIdx, n) : 0;
    return { peak, rms, dcOffset: dc, durationSec, spectralHz, renderSec: n / sr };
  }

  function measureMood(buffer) {
    const { mono, peak, n, sr } = mixdown(buffer);
    const skip = Math.floor(sr * 0.05);
    let sumSq = 0;
    let sum = 0;
    const count = Math.max(1, n - skip);
    for (let i = skip; i < n; i++) {
      const v = mono[i];
      sumSq += v * v;
      sum += v;
    }
    const rms = Math.sqrt(sumSq / count);
    const dc = sum / count;

    const segLen = Math.floor(sr * 0.4);
    const segRms = [];
    for (let s = skip; s + segLen <= n; s += segLen) {
      let sq = 0;
      for (let i = s; i < s + segLen; i++) sq += mono[i] * mono[i];
      segRms.push(Math.sqrt(sq / segLen));
    }
    const segMean = segRms.reduce((a, b) => a + b, 0) / Math.max(1, segRms.length);
    const segVar = segRms.reduce((a, b) => a + (b - segMean) ** 2, 0) / Math.max(1, segRms.length);
    const segCoV = segMean > 0.0001 ? Math.sqrt(segVar) / segMean : 0;

    let peakIdx = 0;
    let peakVal = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(mono[i]);
      if (a > peakVal) {
        peakVal = a;
        peakIdx = i;
      }
    }
    const spectralHz = spectralCentroid(mono, sr, peakIdx, n);
    return { peak, rms, dcOffset: dc, segCoV, spectralHz, renderSec: n / sr };
  }

  const hook = window.__hexholdAudioTest;
  if (!hook) throw new Error('window.__hexholdAudioTest is missing — the audio engine module never loaded.');

  const sfx = [];
  for (const { name, len } of sfxList) {
    try {
      const dur = Math.min(Math.max(len + 3, 2), 9);
      const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
      hook.renderSfx(name, ctx, 1);
      const buffer = await ctx.startRendering();
      sfx.push({ name, len, ...measureOneShot(buffer) });
    } catch (err) {
      sfx.push({ name, len, error: String(err && err.message ? err.message : err) });
    }
  }

  const music = [];
  for (const mood of moods) {
    try {
      const dur = 7;
      const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
      hook.renderMood(mood, ctx, dur);
      const buffer = await ctx.startRendering();
      music.push({ mood, ...measureMood(buffer) });
    } catch (err) {
      music.push({ mood, error: String(err && err.message ? err.message : err) });
    }
  }

  return { sfx, music };
}

// ---------------------------------------------------------------------------
// Node-side: drive the browser, then grade the numbers it sent back
// ---------------------------------------------------------------------------

const browser = await chromium.launch({ headless: !HEADED });
const page = await (await browser.newContext()).newPage();
page.on('pageerror', (e) => console.error('  page error:', String(e).slice(0, 200)));

console.log(`\n▶ opening ${URL}`);
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });

// The audio engine (src/audio/engine.ts) is a lazily-loaded chunk that only
// evaluates after the player's first gesture (see App.tsx's unlockAudio()
// wiring) — fire one so the module, and the test hook it attaches to
// `window`, actually loads.
await page.mouse.click(40, 40);
await page.waitForFunction(() => !!window.__hexholdAudioTest, { timeout: 15000 }).catch(() => {
  throw new Error('window.__hexholdAudioTest never appeared — the audio engine module failed to load.');
});

const { sfx: sfxList, moods } = await page.evaluate(() => ({
  sfx: window.__hexholdAudioTest.sfx,
  moods: window.__hexholdAudioTest.moods,
}));
console.log(`▶ rendering ${sfxList.length} sfx + ${moods.length} music moods offline\n`);

const { sfx, music } = await page.evaluate(collectInPage, [sfxList, moods]);

await browser.close();

// --- grade sfx ---------------------------------------------------------------

const okSfx = sfx.filter((s) => !s.error);
const maxRms = Math.max(...okSfx.map((s) => s.rms), 0.0001);

function gradeSfx(s) {
  const notes = [];
  let status = 'PASS';
  const fail = (msg) => {
    status = 'FAIL';
    notes.push(msg);
  };
  const warn = (msg) => {
    if (status === 'PASS') status = 'WARN';
    notes.push(msg);
  };

  if (s.error) {
    fail(`threw: ${s.error}`);
    return { status, notes };
  }
  if (s.peak < SILENT_PEAK) fail(`silent (peak ${s.peak.toFixed(4)} < ${SILENT_PEAK})`);
  if (s.peak > CLIP_PEAK) fail(`clipping (peak ${s.peak.toFixed(3)} > ${CLIP_PEAK})`);
  if (s.durationSec === 0 && s.peak >= SILENT_PEAK) fail('no audible window despite non-zero peak');
  const stuckAt = Math.max(s.len * 1.8, s.len + 2.2);
  if (s.durationSec > stuckAt) {
    fail(`audible for ${s.durationSec.toFixed(2)}s, declared len ${s.len}s — stuck/unreleased envelope?`);
  }
  if (Math.abs(s.dcOffset) > DC_FAIL) fail(`DC offset ${s.dcOffset.toFixed(4)} — thumps on every play`);
  else if (Math.abs(s.dcOffset) > DC_WARN) warn(`DC offset ${s.dcOffset.toFixed(4)}`);
  if (s.peak >= SILENT_PEAK && s.rms < maxRms * QUIET_RATIO_FAIL) {
    fail(`rms ${s.rms.toFixed(4)} is ${(maxRms / Math.max(s.rms, 1e-6)).toFixed(0)}x below the loudest sound — inaudible in the mix`);
  }
  if (s.peak > HEADROOM_PEAK && s.peak <= CLIP_PEAK) {
    warn(`peak ${s.peak.toFixed(3)} exceeds the ${HEADROOM_PEAK} headroom guideline`);
  }
  return { status, notes };
}

const sfxGraded = sfx.map((s) => ({ ...s, ...gradeSfx(s) }));

const nameW = Math.max(...sfxGraded.map((s) => s.name.length), 10);
console.log('SFX'.padEnd(1));
console.log(
  `  ${'name'.padEnd(nameW)}  ${'peak'.padStart(6)}  ${'rms'.padStart(6)}  ${'dur(s)'.padStart(6)}  ${'dc'.padStart(8)}  ${'centroid'.padStart(8)}  status`,
);
console.log('  ' + '-'.repeat(nameW + 60));
for (const s of sfxGraded) {
  const row = s.error
    ? `  ${s.name.padEnd(nameW)}  ${'—'.padStart(6)}  ${'—'.padStart(6)}  ${'—'.padStart(6)}  ${'—'.padStart(8)}  ${'—'.padStart(8)}  ${s.status}`
    : `  ${s.name.padEnd(nameW)}  ${s.peak.toFixed(3).padStart(6)}  ${s.rms.toFixed(3).padStart(6)}  ${s.durationSec.toFixed(2).padStart(6)}  ${s.dcOffset.toFixed(4).padStart(8)}  ${Math.round(s.spectralHz).toString().padStart(7)}Hz  ${s.status}`;
  console.log(row);
  for (const n of s.notes) console.log(`  ${' '.repeat(nameW)}    · ${n}`);
}

// --- grade music ---------------------------------------------------------------

function gradeMood(m) {
  const notes = [];
  let status = 'PASS';
  const fail = (msg) => {
    status = 'FAIL';
    notes.push(msg);
  };
  if (m.error) {
    fail(`threw: ${m.error}`);
    return { status, notes };
  }
  if (m.peak < SILENT_PEAK) fail(`silent (peak ${m.peak.toFixed(4)})`);
  if (m.peak > CLIP_PEAK) fail(`clipping (peak ${m.peak.toFixed(3)})`);
  if (Math.abs(m.dcOffset) > DC_FAIL) fail(`DC offset ${m.dcOffset.toFixed(4)}`);
  if (m.segCoV < MOOD_STATIC_COV) {
    fail(`segment-RMS coefficient of variation ${m.segCoV.toFixed(3)} < ${MOOD_STATIC_COV} — reads as a static drone`);
  }
  return { status, notes };
}

const musicGraded = music.map((m) => ({ ...m, ...gradeMood(m) }));

console.log('\nMUSIC (7s render)');
console.log(`  ${'mood'.padEnd(10)}  ${'peak'.padStart(6)}  ${'rms'.padStart(6)}  ${'dc'.padStart(8)}  ${'variation'.padStart(9)}  centroid  status`);
console.log('  ' + '-'.repeat(70));
for (const m of musicGraded) {
  const row = m.error
    ? `  ${m.mood.padEnd(10)}  ${'—'.padStart(6)}  ${'—'.padStart(6)}  ${'—'.padStart(8)}  ${'—'.padStart(9)}  —  ${m.status}`
    : `  ${m.mood.padEnd(10)}  ${m.peak.toFixed(3).padStart(6)}  ${m.rms.toFixed(3).padStart(6)}  ${m.dcOffset.toFixed(4).padStart(8)}  ${m.segCoV.toFixed(3).padStart(9)}  ${Math.round(m.spectralHz)}Hz  ${m.status}`;
  console.log(row);
  for (const n of m.notes) console.log(`  ${' '.repeat(10)}    · ${n}`);
}

// --- design sanity checks (ear-equivalent reasoning) --------------------------

const byName = Object.fromEntries(sfx.filter((s) => !s.error).map((s) => [s.name, s]));
const sanity = [];
function check(label, pass, detail) {
  sanity.push({ label, pass, detail });
}

if (byName.chip_single && byName.card_place) {
  check(
    'chip_single reads brighter than card_place',
    byName.chip_single.spectralHz > byName.card_place.spectralHz,
    `chip_single ${Math.round(byName.chip_single.spectralHz)}Hz vs card_place ${Math.round(byName.card_place.spectralHz)}Hz`,
  );
}
if (byName.ui_hover) {
  check(
    'ui_hover is quiet (peak under 40% of the median)',
    byName.ui_hover.peak <= [...okSfx].sort((a, b) => a.peak - b.peak)[Math.floor(okSfx.length / 2)].peak * 0.4,
    `ui_hover peak ${byName.ui_hover.peak.toFixed(3)}`,
  );
  check('ui_hover is short (< 0.3s audible)', byName.ui_hover.durationSec < 0.3, `${byName.ui_hover.durationSec.toFixed(3)}s`);
}
if (byName.win_impossible) {
  const substantiality = (s) => s.rms * s.durationSec;
  const rank = [...okSfx].sort((a, b) => substantiality(b) - substantiality(a));
  const place = rank.findIndex((s) => s.name === 'win_impossible') + 1;
  check(
    'win_impossible is among the most substantial sounds in the set (rms × duration)',
    place <= 3,
    `ranked #${place} of ${rank.length} (top: ${rank
      .slice(0, 3)
      .map((s) => s.name)
      .join(', ')})`,
  );
}

console.log('\nSANITY CHECKS');
for (const s of sanity) console.log(`  ${s.pass ? '✔' : '✘'} ${s.label} — ${s.detail}`);

// --- summary -------------------------------------------------------------------

const allGraded = [...sfxGraded, ...musicGraded];
const fails = allGraded.filter((r) => r.status === 'FAIL');
const warns = allGraded.filter((r) => r.status === 'WARN');
const sanityFails = sanity.filter((s) => !s.pass);

console.log('\n══════════ AUDIO ══════════');
console.log(`  sfx checked     ${sfx.length}`);
console.log(`  moods checked   ${music.length}`);
console.log(`  pass            ${allGraded.length - fails.length - warns.length}`);
console.log(`  warn            ${warns.length}`);
console.log(`  fail            ${fails.length}`);
console.log(`  sanity checks   ${sanity.length - sanityFails.length}/${sanity.length} passed`);
if (fails.length === 0 && sanityFails.length === 0) console.log('\n  ✔ every sound renders, and nothing reads as broken');
console.log('════════════════════════════\n');

process.exit(fails.length || sanityFails.length ? 1 : 0);
