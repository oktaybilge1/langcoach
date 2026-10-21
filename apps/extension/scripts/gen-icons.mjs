// Generates public/icons/{16,32,48,128}.png: a rounded speech bubble with a check mark.
// No dependencies: PNG is written by hand (zlib deflate + CRC32). Run: node scripts/gen-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const outDir = fileURLToPath(new URL('../public/icons/', import.meta.url));
const SS = 4; // supersampling per axis

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Geometry in unit square coordinates.
const BUBBLE = { x0: 0.07, y0: 0.1, x1: 0.93, y1: 0.74, r: 0.2 };
const TAIL = [[0.2, 0.68], [0.2, 0.93], [0.47, 0.7]];
const CHECK = [[0.29, 0.42], [0.43, 0.56], [0.72, 0.27]];
const CHECK_HALF = 0.05;

function inRoundRect(x, y, { x0, y0, x1, y1, r }) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function inTriangle(px, py, [[ax, ay], [bx, by], [cx, cy]]) {
  const d = (x1, y1, x2, y2, x3, y3) => (x1 - x3) * (y2 - y3) - (x2 - x3) * (y1 - y3);
  const d1 = d(px, py, ax, ay, bx, by);
  const d2 = d(px, py, bx, by, cx, cy);
  const d3 = d(px, py, cx, cy, ax, ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
const onCheck = (x, y) =>
  distSeg(x, y, CHECK[0], CHECK[1]) <= CHECK_HALF || distSeg(x, y, CHECK[1], CHECK[2]) <= CHECK_HALF;
const inBubble = (x, y) => inRoundRect(x, y, BUBBLE) || inTriangle(x, y, TAIL);

// Friendly blue (top) to green (bottom) gradient.
const TOP = [59, 130, 246];
const BOTTOM = [16, 185, 129];

function render(size) {
  const out = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cov = 0;
      let white = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = (px + (sx + 0.5) / SS) / size;
          const y = (py + (sy + 0.5) / SS) / size;
          if (inBubble(x, y)) {
            cov++;
            if (onCheck(x, y)) white++;
          }
        }
      }
      const n = SS * SS;
      const t = Math.min(1, Math.max(0, (py / size - 0.1) / 0.83));
      const w = cov ? white / cov : 0;
      const o = (py * size + px) * 4;
      for (let k = 0; k < 3; k++) {
        const base = TOP[k] + (BOTTOM[k] - TOP[k]) * t;
        out[o + k] = Math.round(base * (1 - w) + 255 * w);
      }
      out[o + 3] = Math.round((cov / n) * 255);
    }
  }
  return out;
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`${outDir}${size}.png`, png(size, render(size)));
  console.log(`wrote icons/${size}.png`);
}
