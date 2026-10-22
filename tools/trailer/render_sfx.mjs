#!/usr/bin/env node
/**
 * Renders the game's own sound effects to WAV files, offline, for the trailer.
 *
 *   node tools/trailer/render_sfx.mjs <sfx.json> <out-dir>
 *
 * Every sound HEXHOLD makes is a Web Audio synth (src/audio/sfx.ts); there are
 * no audio files to copy. So this opens the built client in a headless, muted
 * Chromium and renders each sound the recorder heard (sfx.json, written by
 * record_trailer.mjs) through the same hook test/audio.mjs measures with,
 * `window.__hexholdAudioTest.renderSfx`, into an OfflineAudioContext. The
 * level is the shipped one (the mix.ts trim). Nothing is played aloud: an
 * OfflineAudioContext has no speakers.
 *
 * Writes <out-dir>/<name>@<pitch>.wav, 48 kHz 16-bit stereo, one per distinct
 * sound and pitch in the cue list.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer, openPage } from './stage.mjs';

const [cuesPath, outDir] = process.argv.slice(2);
if (!cuesPath || !outDir) { console.error('usage: render_sfx.mjs <sfx.json> <out-dir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const SR = 48000;

const cues = JSON.parse(readFileSync(cuesPath, 'utf8')).filter((c) => !c.name.startsWith('tr_'));
const wanted = [...new Map(cues.map((c) => [`${c.name}@${(+c.pitch || 1).toFixed(3)}`, { name: c.name, pitch: +c.pitch || 1 }])).values()];

// SFX_PORT: record_trailer.sh passes its PORT_A, free again by the time this runs.
const srv = await startServer({ port: Number(process.env.SFX_PORT ?? 3431) });
const { browser, page } = await openPage(`http://127.0.0.1:${srv.port}/`, { width: 800, height: 600 });
await page.waitForTimeout(2000);
await page.mouse.click(30, 30); // the engine chunk loads on the first gesture (App.tsx)
await page.waitForFunction(() => !!window.__hexholdAudioTest, null, { timeout: 20000 });

function wav(l, r) {
  const n = l.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(l[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r[i] * 32767))), 46 + i * 4);
  }
  return buf;
}

let n = 0;
for (const { name, pitch } of wanted) {
  const out = await page.evaluate(async ([nm, p, sr]) => {
    const hook = window.__hexholdAudioTest;
    const meta = hook.sfx.find((s) => s.name === nm);
    if (!meta) return null;
    const dur = Math.min(8, meta.len / p + 2.4); // the shared reverb's tail
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
    hook.renderSfx(nm, ctx, p);
    const b = await ctx.startRendering();
    const pack = (a) => {
      const i16 = new Int16Array(a.length);
      for (let k = 0; k < a.length; k++) i16[k] = Math.max(-32768, Math.min(32767, Math.round(a[k] * 32767)));
      const u8 = new Uint8Array(i16.buffer);
      let bin = '';
      for (let k = 0; k < u8.length; k += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
      return btoa(bin);
    };
    // Trim the silent tail.
    const L = b.getChannelData(0); const R = b.getChannelData(1);
    let end = L.length;
    while (end > sr * 0.05 && Math.abs(L[end - 1]) < 1e-4 && Math.abs(R[end - 1]) < 1e-4) end--;
    return { l: pack(L.subarray(0, end)), r: pack(R.subarray(0, end)) };
  }, [name, pitch, SR]);
  if (!out) { console.log(`  (no synth named ${name})`); continue; }
  // Copied into a fresh buffer: a pooled Buffer can start on an odd byte.
  const i16 = (b64) => new Int16Array(Uint8Array.from(Buffer.from(b64, 'base64')).buffer);
  const l = i16(out.l);
  const r = i16(out.r);
  writeFileSync(join(outDir, `${name}@${pitch.toFixed(3)}.wav`), wav(Float32Array.from(l, (v) => v / 32767), Float32Array.from(r, (v) => v / 32767)));
  n++;
}
console.log(`rendered ${n} game sounds → ${outDir}`);
await browser.close();
srv.close();
