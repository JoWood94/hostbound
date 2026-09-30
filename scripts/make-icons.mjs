// Generates the PWA icons as PNGs with no dependencies (raw pixels + zlib).
// Run: node scripts/make-icons.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#0a0008'), CYAN = hex('#19f0ff'), MAG = hex('#ff2bd6'), DIM = hex('#3a1030'), WHITE = hex('#f4f0ff');

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function inside(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function render(size, safe) {
  // Maskable icons keep content inside the central 80%.
  const s = size * (safe ? 0.72 : 0.9);
  const cx = size / 2, cy = size / 2;
  const w = s * 0.34, h = s * 0.42;
  const poly = [[cx, cy - h], [cx + w, cy - h * 0.3], [cx + w * 0.7, cy + h * 0.6], [cx - w * 0.7, cy + h * 0.6], [cx - w, cy - h * 0.3]];
  const stroke = size * 0.028;
  const buf = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    buf[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let col = [...BG];
      const add = (c, a) => { for (let k = 0; k < 3; k++) col[k] = Math.min(255, col[k] + c[k] * a); };
      // lanes
      for (let l = 1; l < 5; l++) {
        const lx = (size / 5) * l;
        if (Math.abs(x - lx) < size * 0.004) add(DIM, 1.2);
      }
      for (let r = 0; r < size; r += size / 8) if (Math.abs(y - r) < size * 0.003) add(DIM, 0.7);
      // board
      let d = 1e9;
      for (let i = 0; i < poly.length; i++) {
        const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
        d = Math.min(d, segDist(x, y, ax, ay, bx, by));
      }
      const inPoly = inside(x, y, poly);
      if (inPoly) col = [20, 2, 15];
      add(CYAN, Math.exp(-((d / (size * 0.05)) ** 2)) * 0.55);
      if (d < stroke) col = [...CYAN];
      // rider core + thrusters
      const core = Math.hypot(x - cx, y - (cy - h * 0.05));
      add(WHITE, Math.exp(-((core / (size * 0.035)) ** 2)) * 1.2);
      for (const tx of [cx - w * 0.5, cx + w * 0.5]) {
        const t = Math.hypot(x - tx, y - (cy + h * 0.6));
        add(MAG, Math.exp(-((t / (size * 0.03)) ** 2)) * 1.4);
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      buf[o] = col[0]; buf[o + 1] = col[1]; buf[o + 2] = col[2]; buf[o + 3] = 255;
    }
  }
  return buf;
}

function crc32(b) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < b.length; n++) {
    c = (crc ^ b[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, safe = false) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(render(size, safe))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-180.png', png(180));
writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512));
writeFileSync('public/icon-maskable-512.png', png(512, true));
console.log('icons written');
