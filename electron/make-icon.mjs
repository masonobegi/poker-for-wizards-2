/**
 * Draws the HEXHOLD app icon and writes it as a PNG.
 *
 * There is no image library in this project and no binary assets in the repo,
 * which is consistent with the rest of the game: the cards are SVG, the sounds
 * are synthesised, and the icon is arithmetic. Run with `npm run icon`.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SIZES = [256, 512];

// --- palette, lifted from tokens.css ---------------------------------------
const BG_IN = [19, 26, 51];
const BG_OUT = [5, 6, 12];
const GOLD = [240, 196, 101];
const GOLD_HI = [255, 230, 168];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * clamp(t, 0, 1)));

/** Signed distance to a pointy-top regular hexagon of radius r. */
function hexDist(x, y, r) {
  const qx = Math.abs(x);
  const qy = Math.abs(y);
  return Math.max(qx * 0.8660254 + qy * 0.5, qy) - r;
}

/** Coverage of a shape edge, antialiased over roughly one pixel. */
const band = (d, halfWidth, aa) =>
  clamp((halfWidth - Math.abs(d)) / aa + 0.5, 0, 1);

function render(size) {
  const px = Buffer.alloc(size * size * 4);
  const c = size / 2;
  const s = size / 256; // everything below is authored at 256
  const aa = 1.2 * s;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c + 0.5;
      const dy = y - c + 0.5;
      const r = Math.hypot(dx, dy) / (size / 2);

      // Background: a soft radial fade from the table blue to the void.
      let col = mix(BG_IN, BG_OUT, Math.pow(r, 0.85));
      let alpha = 255;

      // Round the icon off so it sits well in a dock or a library grid.
      const corner = clamp((1.0 - r) / (0.03), 0, 1);
      alpha = Math.round(255 * corner);

      // Two concentric guide rings.
      for (const [rr, w, tone] of [[104 * s, 1.1 * s, 0.5], [88 * s, 0.7 * s, 0.3]]) {
        const cov = band(Math.hypot(dx, dy) - rr, w, aa);
        if (cov > 0) col = mix(col, GOLD, cov * tone);
      }

      // The hexagon.
      const hd = hexDist(dx, dy, 74 * s);
      const hexEdge = band(hd, 2.6 * s, aa);
      if (hexEdge > 0) col = mix(col, GOLD, hexEdge);
      // A faint wash inside it, so the mark reads as a solid object.
      if (hd < 0) col = mix(col, GOLD, 0.06 * clamp(-hd / (40 * s), 0, 1));

      // The H: two uprights and a crossbar.
      const barW = 9 * s;
      const barH = 40 * s;
      const gap = 27 * s;
      const upright = (ox) =>
        Math.abs(dx - ox) < barW && Math.abs(dy) < barH;
      const cross = Math.abs(dy) < barW * 0.62 && Math.abs(dx) < gap + barW;
      if (upright(-gap) || upright(gap) || cross) {
        // Vertical gradient on the metal so it is not flat.
        col = mix(GOLD_HI, GOLD, (dy + barH) / (barH * 2));
      }

      const i = (y * size + x) * 4;
      px[i] = col[0];
      px[i + 1] = col[1];
      px[i + 2] = col[2];
      px[i + 3] = alpha;
    }
  }
  return px;
}

// --- PNG container ----------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function toPng(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  ihdr[10] = 0;  // deflate
  ihdr[11] = 0;  // adaptive filtering
  ihdr[12] = 0;  // no interlace

  // Each scanline is prefixed with its filter byte (0 = none).
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const src = y * size * 4;
    const dst = y * (size * 4 + 1);
    raw[dst] = 0;
    pixels.copy(raw, dst + 1, src, src + size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(here, { recursive: true });
for (const size of SIZES) {
  const out = join(here, size === 256 ? 'icon.png' : `icon@${size}.png`);
  writeFileSync(out, toPng(render(size), size));
  console.log(`wrote ${out} (${size}x${size})`);
}
