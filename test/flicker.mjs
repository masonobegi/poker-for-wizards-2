/**
 * Does anything on screen flash?
 *
 * Takes frames 100ms apart and counts pixels that blink: brightness jumps by more
 * than a threshold and jumps back within two frames — the thing a player sees as a
 * light flashing in the background. A slow drift never trips it; a speck that
 * pops in and out, or a glow that strobes, does.
 *
 * Run: HEXHOLD_URL=http://localhost:3001/ node test/flicker.mjs [menu|table]
 */
import { launch } from './browser.mjs';

const URL = process.env.HEXHOLD_URL ?? 'http://localhost:3001/';
const WHERE = process.argv[2] ?? 'menu';
const FRAMES = 30;
const JUMP = 40; // out of 255 luminance

const browser = await launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => { try { localStorage.setItem('hexhold.speed', 'blitz'); } catch { /* */ } });
if (process.env.RM) await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto(URL);
for (let i = 0; i < 20; i++) {
  const skip = page.locator('button:has-text("Skip")').first();
  if (await skip.isVisible().catch(() => false)) { await skip.click(); break; }
  await page.waitForTimeout(250);
}
if (WHERE === 'table') {
  await page.locator('button:has-text("Practice vs Bots")').click();
  await page.waitForFunction(() => window.__hexholdView?.phase && window.__hexholdView.phase !== 'lobby', null, { timeout: 30000 });
}
await page.waitForTimeout(4000);
// ONLY=backdrop hides everything but the shader; HIDE=<selector> hides one layer.
if (process.env.ONLY === 'backdrop') {
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } canvas.backdrop { visibility: visible !important; }' });
}
if (process.env.HIDE) await page.addStyleTag({ content: `${process.env.HIDE} { visibility: hidden !important; }` });

const shots = [];
const lum = async () => {
  const buf = await page.screenshot();
  shots.push(buf);
  const b64 = buf.toString('base64');
  return page.evaluate(async (data) => {
    const img = new Image();
    img.src = `data:image/png;base64,${data}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const out = new Uint8Array(d.length / 4);
    for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) | 0;
    return Array.from(out);
  }, b64);
};

// A blink is a pixel that jumps and comes back within two frames: a flash, a
// strobe, a speck popping in and out. Content that changes and stays changed
// (a panel opening, a card dealt) is not a blink, so it is not counted.
const frames = [await lum()];
for (let f = 1; f < FRAMES; f++) {
  await page.waitForTimeout(100);
  frames.push(await lum());
}
const blinks = [];
for (let f = 1; f < frames.length - 1; f++) {
  const [a, b, c] = [frames[f - 1], frames[f], frames[f + 1]];
  let n = 0;
  for (let i = 0; i < b.length; i++) {
    const up = b[i] - a[i];
    const back = c[i] - b[i];
    if (Math.abs(up) > JUMP && Math.abs(back) > JUMP && Math.sign(up) !== Math.sign(back)) n++;
  }
  blinks.push(n);
}
if (process.env.SAVE) {
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(process.env.SAVE, { recursive: true });
  const worst = blinks.indexOf(Math.max(...blinks)) + 1;
  for (const k of [worst - 1, worst, worst + 1]) writeFileSync(`${process.env.SAVE}/f${k}.png`, shots[k]);
}
const blinking = blinks.filter((n) => n > 200).length;
console.log(`${WHERE}: ${blinking}/${blinks.length} frames with a blink over 200 pixels; max ${Math.max(...blinks)} pixels blinking at once`);
console.log(`  per frame: ${blinks.join(' ')}`);
await browser.close();
