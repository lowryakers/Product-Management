/**
 * Generates the PWA icon set with no image dependency — a tiny PNG encoder plus
 * a mathematically drawn mark (rounded square, accent ground, white "P").
 *
 * These are placeholders with the right shape and colour. Once you have uploaded
 * the real ProDough logo in Settings, swap these by dropping properly sized PNGs
 * into public/icons/ with the same filenames.
 *
 *   npx tsx scripts/gen-icons.ts
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ACCENT: RGB = [0x94, 0x56, 0x31];
const PAPER: RGB = [0xfc, 0xfb, 0xf9];

type RGB = [number, number, number];

// ------------------------------------------------------------ PNG encoder

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // each scanline prefixed with filter type 0
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- the mark

/** Signed distance to a rounded rectangle, for antialiased edges. */
function roundedRectSdf(
  px: number,
  py: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  r: number,
): number {
  const qx = Math.abs(px - cx) - (halfW - r);
  const qy = Math.abs(py - cy) - (halfH - r);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - r;
}

function coverage(sdf: number, aa: number): number {
  return Math.min(1, Math.max(0, 0.5 - sdf / aa));
}

function drawIcon(size: number, opts: { maskable?: boolean } = {}): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const s = size;
  const aa = Math.max(1, s / 64);

  // Maskable icons need the mark inside a safe circle of ~80% — so the ground
  // fills the whole canvas and the glyph shrinks instead.
  const groundRadius = opts.maskable ? 0 : s * 0.22;
  const glyphScale = opts.maskable ? 0.62 : 0.78;

  const gx = s / 2;
  const gy = s / 2;
  const gh = (s * glyphScale) / 2; // half height of the P
  const stemW = gh * 0.28;
  // Bowl is centred on the stem so the ring genuinely merges with it, rather
  // than floating alongside.
  const bowlR = gh * 0.44;
  const bowlCy = gy - gh + bowlR + stemW / 2;
  const stemX = gx - bowlR * 0.85;

  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const px = x + 0.5;
      const py = y + 0.5;

      // ground
      const groundCov = opts.maskable
        ? 1
        : coverage(roundedRectSdf(px, py, s / 2, s / 2, s / 2, s / 2, groundRadius), aa);

      // glyph: vertical stem
      const stemSdf = roundedRectSdf(px, py, stemX, gy, stemW / 2, gh, stemW / 2);

      // glyph: bowl — annulus centred on the stem, right half only
      const dx = px - stemX;
      const dy = py - bowlCy;
      const ring = Math.abs(Math.sqrt(dx * dx + dy * dy) - bowlR) - stemW / 2;
      const bowlSdf = Math.max(ring, -dx);

      const glyphCov = Math.max(coverage(stemSdf, aa), coverage(bowlSdf, aa));

      const i = (y * s + x) * 4;
      const r = ACCENT[0] * (1 - glyphCov) + PAPER[0] * glyphCov;
      const g = ACCENT[1] * (1 - glyphCov) + PAPER[1] * glyphCov;
      const b = ACCENT[2] * (1 - glyphCov) + PAPER[2] * glyphCov;

      out[i] = Math.round(r);
      out[i + 1] = Math.round(g);
      out[i + 2] = Math.round(b);
      out[i + 3] = Math.round(255 * groundCov);
    }
  }
  return out;
}

/** Monochrome badge for the Android notification tray. */
function drawBadge(size: number): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const s = size;
  const aa = Math.max(1, s / 48);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d = Math.sqrt((px - s / 2) ** 2 + (py - s / 2) ** 2) - s * 0.42;
      const ring = Math.abs(d) - s * 0.09;
      const cov = coverage(ring, aa);
      const i = (y * s + x) * 4;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = Math.round(255 * cov);
    }
  }
  return out;
}

// --------------------------------------------------------------- write

const dir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(dir, { recursive: true });

const targets: Array<[string, number, { maskable?: boolean }]> = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  ['icon-180.png', 180, {}],
  ['icon-maskable-512.png', 512, { maskable: true }],
];

for (const [name, size, opts] of targets) {
  const png = encodePng(size, size, drawIcon(size, opts));
  writeFileSync(path.join(dir, name), png);
  // eslint-disable-next-line no-console
  console.log(`wrote icons/${name} (${size}×${size}, ${(png.length / 1024).toFixed(1)} kB)`);
}

const badge = encodePng(96, 96, drawBadge(96));
writeFileSync(path.join(dir, 'badge-96.png'), badge);
// eslint-disable-next-line no-console
console.log(`wrote icons/badge-96.png (96×96, ${(badge.length / 1024).toFixed(1)} kB)`);
