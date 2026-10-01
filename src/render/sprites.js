// Baked sprites. Every entity is drawn ONCE into an offscreen canvas at RES×
// resolution (gradients, neon tubes with glow, panel details), then blitted each
// frame. Only small animated parts (flames, rotors, treads, eyes) are drawn live.
import { ctx, makeOffscreen } from '../core/canvas.js';
import { PAL } from './palette.js';

const RES = 3;
const cache = new Map();

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------
export function bake(key, w, h, fn) {
  let s = cache.get(key);
  if (s) return s;
  const off = makeOffscreen(Math.ceil(w * RES), Math.ceil(h * RES));
  const c = off.ctx;
  c.scale(RES, RES);
  c.translate(w / 2, h / 2);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  fn(c, w, h);
  s = { canvas: off.canvas, w, h };
  cache.set(key, s);
  return s;
}

// flash: 0..1 additive brighten (telegraph / hit feedback)
export function drawSprite(s, x, y, { rot = 0, sx = 1, sy = 1, alpha = 1, flash = 0 } = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * Math.min(1, flash);
    ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Colour + drawing helpers (operate on a baking context `c`)
// ---------------------------------------------------------------------------
function rgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
// t < 0 darkens toward black, t > 0 lightens toward white
export function shade(hex, t) {
  const [r, g, b] = rgb(hex);
  const m = (v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
export function rgba(hex, a) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function path(c, pts, close = true) {
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  if (close) c.closePath();
}
function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }

// Metallic plate fill: lit from the top.
function plate(c, color, y0, y1, dark = -0.82, light = -0.5) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(1, shade(color, dark));
  c.fillStyle = g;
  c.fill();
}
// Neon tube: glowing outer stroke + bright thin core. Uses the current path.
function neon(c, color, lw = 1.6, blur = 7) {
  c.save();
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.strokeStyle = color;
  c.lineWidth = lw;
  c.stroke();
  c.shadowBlur = 0;
  c.strokeStyle = shade(color, 0.65);
  c.lineWidth = Math.max(0.5, lw * 0.4);
  c.stroke();
  c.restore();
}
function glow(c, x, y, r, color, core = '#ffffff') {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, core);
  g.addColorStop(0.35, color);
  g.addColorStop(1, rgba(color.startsWith('#') ? color : '#ffffff', 0));
  c.fillStyle = g;
  circle(c, x, y, r);
  c.fill();
}
function rivets(c, pts, color = '#ffffff', a = 0.35) {
  c.fillStyle = color;
  c.globalAlpha = a;
  for (let i = 0; i < pts.length; i += 2) { circle(c, pts[i], pts[i + 1], 0.7); c.fill(); }
  c.globalAlpha = 1;
}
function panelLine(c, x1, y1, x2, y2, a = 0.25, color = '#ffffff') {
  c.strokeStyle = color;
  c.globalAlpha = a;
  c.lineWidth = 0.6;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.globalAlpha = 1;
}
function hazard(c, x, y, w, h, color, step = 4) {
  c.save();
  c.beginPath(); c.rect(x, y, w, h); c.clip();
  c.fillStyle = '#0a0606';
  c.fillRect(x, y, w, h);
  c.fillStyle = color;
  for (let k = -h; k < w + h; k += step * 2) {
    c.beginPath();
    c.moveTo(x + k, y + h); c.lineTo(x + k + step, y + h); c.lineTo(x + k + step + h, y); c.lineTo(x + k + h, y);
    c.closePath(); c.fill();
  }
  c.restore();
}

// ---------------------------------------------------------------------------
// BIOMASS art language: organic hulls (smooth blobs), dark flesh tinted by the
// entity's neon colour, bone plates with seams, bioluminescent veins, nodules,
// translucent membranes. Eyes are drawn live (they track the player).
// ---------------------------------------------------------------------------
function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const m = (i) => Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  return `#${m(0)}${m(1)}${m(2)}`;
}
// Smooth closed (or open) curve through points (Catmull-Rom as Béziers).
function blob(c, pts, close = true) {
  const n = pts.length / 2;
  const P = (i) => { const k = close ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i)); return [pts[k * 2], pts[k * 2 + 1]]; };
  c.beginPath();
  const [sx, sy] = P(0);
  c.moveTo(sx, sy);
  const last = close ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const [x0, y0] = P(i - 1), [x1, y1] = P(i), [x2, y2] = P(i + 1), [x3, y3] = P(i + 2);
    c.bezierCurveTo(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
  }
  if (close) c.closePath();
}
// Flesh: dark, wet, lit from the top-left, tinted by the neon colour.
function flesh(c, col, cx, cy, r, light = 0.2) {
  // Grim palette: dried blood and bruise, a sickly yellow sheen, only a hint of neon.
  const base = mix('#24090f', col, 0.12);
  const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r * 1.15);
  g.addColorStop(0, mix(base, '#d9c792', light * 0.7));
  g.addColorStop(0.45, base);
  g.addColorStop(1, mix(base, '#000000', 0.8));
  c.fillStyle = g;
  c.fill();
}
function bioEdge(c, col, lw = 1.2, blur = 7) {
  c.save();
  c.shadowColor = col; c.shadowBlur = blur;
  c.strokeStyle = rgba(col, 0.6); c.lineWidth = lw * 0.85; c.stroke();
  c.restore();
}
// Bone plate filling the current path: yellowed, filthy, with grime specks.
let grimeSeed = 1;
function bone(c, y0, y1) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#cdbb8e'); g.addColorStop(0.5, '#8a7553'); g.addColorStop(1, '#2e2216');
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  c.fillStyle = 'rgba(40,18,8,0.55)';
  for (let k = 0; k < 6; k++) {
    grimeSeed = (grimeSeed * 9301 + 49297) % 233280;
    const rx = (grimeSeed / 233280 - 0.5) * 40, ry = y0 + ((grimeSeed * 7) % 100) / 100 * (y1 - y0);
    c.beginPath(); c.arc(rx, ry, 0.6 + (k % 3) * 0.5, 0, Math.PI * 2); c.fill();
  }
  c.restore();
  c.strokeStyle = 'rgba(30,14,8,0.9)'; c.lineWidth = 0.8; c.stroke();
}
// Surgical stitches across a wound line (Fear & Hunger body horror).
function sutures(c, x1, y1, x2, y2, n = 4) {
  c.strokeStyle = '#3a0c10'; c.lineWidth = 1.6;
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  c.strokeStyle = '#d8cfb4'; c.lineWidth = 0.6;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 + dx * t, y = y1 + dy * t;
    c.beginPath(); c.moveTo(x - nx * 2, y - ny * 2); c.lineTo(x + nx * 2, y + ny * 2); c.stroke();
  }
}
// An open gash: a dark wet slit with a red rim.
function gash(c, x, y, w, h = 2) {
  c.beginPath(); c.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  c.fillStyle = '#140205'; c.fill();
  c.strokeStyle = '#7a0d18'; c.lineWidth = 0.8; c.stroke();
}
function vein(c, pts, col, w = 0.9, a = 0.75) {
  c.save();
  blob(c, pts, false);
  c.shadowColor = col; c.shadowBlur = 5;
  c.strokeStyle = rgba(col, a); c.lineWidth = w; c.stroke();
  c.restore();
}
function nodule(c, x, y, r, col) {
  circle(c, x, y, r);
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, mix(col, '#000000', 0.6));
  c.save(); c.shadowColor = col; c.shadowBlur = r * 2.5; c.fillStyle = g; c.fill(); c.restore();
}
function membrane(c, pts, col, a = 0.22) {
  blob(c, pts);
  c.fillStyle = rgba(col, a); c.fill();
  c.strokeStyle = rgba(col, 0.55); c.lineWidth = 0.7; c.stroke();
}
function socket(c, x, y, r) {
  circle(c, x, y, r + 1.2); c.fillStyle = '#12040c'; c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.8)'; c.lineWidth = 1; c.stroke();
}
// Spine segments down the middle, bone-coloured.
function spine(c, x, y0, y1, w, n) {
  for (let i = 0; i < n; i++) {
    const t = i / n, h = (y1 - y0) / n;
    c.beginPath(); c.ellipse(x, y0 + h * (i + 0.5), w * (1 - t * 0.35), h * 0.62, 0, 0, Math.PI * 2);
    bone(c, y0 + h * i, y0 + h * (i + 1));
  }
}
// Pilot inside a translucent sac (mask nod kept from the earlier design).
function pilotSac(c, cx, cy, rx, ry, col) {
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const g = c.createRadialGradient(cx, cy - ry * 0.3, 0, cx, cy, ry);
  g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0.12));
  c.fillStyle = g; c.fill();
  c.strokeStyle = rgba(col, 0.8); c.lineWidth = 0.8; c.stroke();
  c.fillStyle = 'rgba(244,240,255,0.8)';
  circle(c, cx, cy + ry * 0.15, Math.min(rx, ry) * 0.5); c.fill();
  path(c, [cx - rx * 0.45, cy, cx - rx * 0.55, cy - ry * 0.5, cx - rx * 0.12, cy - ry * 0.15]); c.fill();
  path(c, [cx + rx * 0.45, cy, cx + rx * 0.55, cy - ry * 0.5, cx + rx * 0.12, cy - ry * 0.15]); c.fill();
  c.strokeStyle = PAL.magenta; c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(cx - rx * 0.32, cy + ry * 0.1); c.lineTo(cx - rx * 0.08, cy + ry * 0.14);
  c.moveTo(cx + rx * 0.32, cy + ry * 0.1); c.lineTo(cx + rx * 0.08, cy + ry * 0.14); c.stroke();
}

// ---------------------------------------------------------------------------
// Player bio-ships (nose up)
// ---------------------------------------------------------------------------
const SHIP_ART = {
  // HUSK: a broad beetle-skull carapace, two bone mandibles forward (the guns),
  // bat-wing ribs swept back with torn membrane, an open ribcage over a glowing organ.
  stock: (c, col) => {
    // swept-back rib wings with membrane between
    for (const s of [-1, 1]) {
      membrane(c, [s * 12, -6, s * 25, 2, s * 26, 14, s * 19, 10, s * 15, 18, s * 10, 8], col, 0.16);
      for (const [x2, y2] of [[25, 3], [26, 14], [16, 19]]) {
        c.beginPath(); c.moveTo(s * 11, -4); c.quadraticCurveTo(s * (x2 * 0.7), y2 * 0.2 - 4, s * x2, y2);
        c.strokeStyle = '#a8946c'; c.lineWidth = 1.8; c.stroke();
        c.strokeStyle = 'rgba(30,14,8,0.85)'; c.lineWidth = 0.5; c.stroke();
      }
    }
    // mandibles: curved bone prongs pointing forward
    for (const s of [-1, 1]) {
      blob(c, [s * 6, -16, s * 12, -20, s * 10, -29, s * 6, -31, s * 7, -24], true);
      bone(c, -31, -16);
      nodule(c, s * 7.5, -29, 1.4, col);
    }
    // carapace: wide skull-shield
    blob(c, [0, -21, 13, -19, 21, -9, 19, 6, 10, 15, 0, 19, -10, 15, -19, 6, -21, -9, -13, -19]);
    flesh(c, col, 0, -2, 20, 0.22); bioEdge(c, col, 1.4, 7);
    // brow ridge plate
    blob(c, [0, -20, 11, -17, 15, -11, 0, -9, -15, -11, -11, -17]); bone(c, -20, -9);
    // open ribcage over the core organ
    c.beginPath(); c.ellipse(0, 4, 8, 9, 0, 0, Math.PI * 2); c.fillStyle = '#120306'; c.fill();
    nodule(c, 0, 5, 3.4, '#c0182c');
    for (const y of [-1, 3, 7, 11]) {
      c.beginPath(); c.moveTo(-8, y); c.quadraticCurveTo(0, y - 3, 8, y);
      c.strokeStyle = '#b9a47c'; c.lineWidth = 1.3; c.stroke();
    }
    sutures(c, -17, -4, -12, 10, 4); gash(c, 14, 6, 2.6, 1);
    pilotSac(c, 0, -13, 3.8, 4.6, col);
    for (const x of [-7, 7]) nodule(c, x, 16, 2.3, PAL.magenta);
  },
  // GHOST: translucent jellyfish mantle, frilled rim, faint organs inside
  ghost: (c, col) => {
    for (const x of [-9, -3, 3, 9]) vein(c, [x, 6, x * 1.3, 16, x * 0.8, 26], col, 1, 0.55);
    blob(c, [0, -29, 10, -22, 15, -8, 16, 4, 10, 8, 4, 5, 0, 9, -4, 5, -10, 8, -16, 4, -15, -8, -10, -22]);
    const g = c.createRadialGradient(0, -14, 2, 0, -8, 20);
    g.addColorStop(0, rgba('#ffffff', 0.5)); g.addColorStop(1, rgba(col, 0.12));
    c.fillStyle = g; c.fill(); bioEdge(c, col, 1.2, 10);
    vein(c, [-10, -18, -4, -10, 0, -2], col, 0.7, 0.5); vein(c, [10, -18, 4, -10, 0, -2], col, 0.7, 0.5);
    pilotSac(c, 0, -15, 4, 6.4, '#9ad8ff');
    nodule(c, 0, -2, 2.2, col);
  },
  // ISOPOD: segmented armour plates, stubby legs, twin mandible cannons
  tank: (c, col) => {
    for (const s of [-1, 1]) for (const y of [-8, 0, 8]) { c.strokeStyle = mix(col, '#2c0c22', 0.5); c.lineWidth = 2.4; c.beginPath(); c.moveTo(s * 16, y); c.quadraticCurveTo(s * 22, y + 2, s * 23, y + 6); c.stroke(); }
    for (const s of [-1, 1]) { blob(c, [s * 6, -18, s * 9, -27, s * 12, -18, s * 10, -12], true); bone(c, -27, -12); }
    blob(c, [0, -22, 14, -16, 18, -2, 17, 12, 10, 20, 0, 22, -10, 20, -17, 12, -18, -2, -14, -16]);
    flesh(c, col, 0, -2, 20); bioEdge(c, col, 1.6, 8);
    for (let i = 0; i < 5; i++) {
      const y = -15 + i * 7.5;
      c.beginPath(); c.ellipse(0, y, 15.5 - Math.abs(i - 2) * 1.5, 4.2, 0, 0, Math.PI * 2);
      bone(c, y - 4, y + 4);
    }
    pilotSac(c, 0, -15, 4.2, 4.6, PAL.cyan);
    for (const x of [-15, -6, 6, 15]) nodule(c, x, 20, 2, PAL.magenta);
  },
  // SPORE: a stalk carrying glowing spore pods
  viral: (c, col) => {
    blob(c, [0, -26, 6, -16, 7, 0, 5, 16, 0, 20, -5, 16, -7, 0, -6, -16]);
    flesh(c, col, 0, -2, 14); bioEdge(c, col, 1.3, 8);
    for (const [x, y, r] of [[-15, -4, 6], [15, -4, 6], [-12, 9, 5], [12, 9, 5], [0, 10, 4]]) {
      vein(c, [0, y * 0.5, x * 0.6, y, x, y], col, 0.9, 0.6);
      circle(c, x, y, r); flesh(c, col, x, y, r, 0.3); bioEdge(c, col, 0.9, 6);
      nodule(c, x, y, r * 0.45, col);
    }
    pilotSac(c, 0, -14, 4, 6, PAL.acid);
    nodule(c, 0, 18, 2.4, PAL.magenta);
  },
  // MUTANT: the manta, but torn and re-stitched out of phase
  glitch: (c, col) => {
    c.save(); c.translate(-1.6, 0); SHIP_ART.stock(c, PAL.cyan); c.restore();
    c.save(); c.globalAlpha = 0.85; c.translate(1.6, 0); SHIP_ART.stock(c, col); c.restore();
    for (const [y, dx] of [[-16, 3], [0, -3], [10, 2.5]]) {
      c.save(); c.beginPath(); c.rect(-26, y, 52, 3); c.clip(); c.translate(dx, 0);
      SHIP_ART.stock(c, PAL.white); c.restore();
    }
  },
};

// Engine glands per ship (sprite coordinates), for live flames.
export const SHIP_ENGINES = {
  stock: [[-7, 18], [7, 18]],
  ghost: [[0, 12]],
  tank: [[-15, 22], [-6, 22], [6, 22], [15, 22]],
  viral: [[0, 20]],
  glitch: [[-7, 18], [7, 18]],
};

export function shipSprite(id, color) {
  const art = SHIP_ART[id] || SHIP_ART.stock;
  return bake(`ship:${id}:${color}`, 54, 62, (c) => art(c, color));
}

// ---------------------------------------------------------------------------
// Enemies: bio-creatures. Eye spots get live pupils (see EYES).
// ---------------------------------------------------------------------------
const ENEMY_ART = {
  // A floating eye on four veined membrane wings
  drone: (c, col) => {
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      membrane(c, [dx * 4, dy * 3, dx * 15, dy * 6, dx * 16, dy * 15, dx * 7, dy * 11], col, 0.24);
      vein(c, [dx * 5, dy * 4, dx * 12, dy * 9, dx * 15, dy * 14], col, 0.7, 0.6);
    }
    circle(c, 0, 0, 9.5); flesh(c, col, 0, 0, 10, 0.25); bioEdge(c, col, 1.3, 7);
    sutures(c, -8, -5, -3, -8, 3); sutures(c, 3, 8, 8, 5, 3);
    vein(c, [-8, -3, -5, -1, -4, 2], '#9a1020', 0.6, 0.7); vein(c, [7, 4, 5, 2, 3, 3], '#9a1020', 0.6, 0.7);
    socket(c, 0, 0, 4.4);
  },
  // A ray with gill slits and three spit glands
  sweeper: (c, col) => {
    blob(c, [0, -9, 12, -8, 26, -2, 22, 4, 10, 7, 0, 12, -10, 7, -22, 4, -26, -2, -12, -8]);
    flesh(c, col, 0, -2, 22); bioEdge(c, col, 1.4, 8);
    for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(s * (9 + k * 3.5), -5); c.quadraticCurveTo(s * (10 + k * 3.5), -1, s * (9 + k * 3.5), 3); c.stroke(); }
    spine(c, 0, -8, 6, 2.6, 3);
    for (const gx of [-12, 0, 12]) nodule(c, gx, 7 + (gx ? 0 : 3), 2.4, col);
    socket(c, -5, -4, 1.8); socket(c, 5, -4, 1.8);
  },
  // An armoured crab: bone shell, claws, glowing maw that spits low waves
  crusher: (c, col) => {
    for (const s of [-1, 1]) { blob(c, [s * 12, 4, s * 20, 8, s * 19, 16, s * 13, 14], true); bone(c, 4, 16); }
    blob(c, [0, -16, 14, -13, 19, -2, 15, 9, 0, 13, -15, 9, -19, -2, -14, -13]);
    flesh(c, col, 0, -2, 18); bioEdge(c, col, 1.5, 8);
    blob(c, [0, -15, 12, -12, 15, -4, 0, -2, -15, -4, -12, -12]); bone(c, -15, -2);
    c.strokeStyle = 'rgba(40,24,16,0.8)'; c.lineWidth = 0.7;
    for (const x of [-6, 0, 6]) { c.beginPath(); c.moveTo(x, -14); c.lineTo(x * 1.2, -3); c.stroke(); }
    gash(c, -12, 1, 3, 1); sutures(c, 9, -1, 15, 3, 3);
    blob(c, [-10, 7, 0, 5, 10, 7, 0, 12]); c.fillStyle = '#12040c'; c.fill();
    c.save(); c.shadowColor = col; c.shadowBlur = 8; c.strokeStyle = col; c.lineWidth = 1.4; c.stroke(); c.restore();
    socket(c, -7, -7, 2); socket(c, 7, -7, 2);
  },
  // A tick: ridged abdomen, small head (legs are live)
  hopper: (c, col) => {
    blob(c, [0, -4, 9, -1, 11, 6, 6, 11, 0, 12, -6, 11, -11, 6, -9, -1]);
    flesh(c, col, 0, 4, 11); bioEdge(c, col, 1.2, 6);
    for (const y of [2, 6]) { c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-8, y); c.quadraticCurveTo(0, y + 3, 8, y); c.stroke(); }
    blob(c, [0, -11, 5, -8, 4, -3, -4, -3, -5, -8]); bone(c, -11, -3);
    socket(c, 0, -7, 1.9);
  },
  // A parasite stinger diving head-first (pointing down)
  kamikaze: (c, col) => {
    membrane(c, [-3, -12, -11, -14, -9, -6, -3, -6], col, 0.3);
    membrane(c, [3, -12, 11, -14, 9, -6, 3, -6], col, 0.3);
    blob(c, [0, -14, 5, -8, 6, 2, 3, 10, 0, 17, -3, 10, -6, 2, -5, -8]);
    flesh(c, col, 0, 0, 12, 0.3); bioEdge(c, col, 1.2, 7);
    for (const y of [-6, -1, 4]) { c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-5, y); c.quadraticCurveTo(0, y + 2, 5, y); c.stroke(); }
    nodule(c, 0, 13, 2.2, '#ffffff');
    socket(c, 0, -9, 1.7);
  },
  // A vertebral bar studded with eye-pods; the gap marker sits under it
  wall: (c, col) => {
    blob(c, [-31, -5, -15, -8, 0, -6, 15, -8, 31, -5, 31, 5, 15, 7, 0, 5, -15, 7, -31, 5]);
    flesh(c, col, 0, 0, 30, 0.15); bioEdge(c, col, 1.4, 8);
    for (const x of [-15.5, 0, 15.5]) { c.beginPath(); c.ellipse(x, 0, 3, 6.5, 0, 0, Math.PI * 2); bone(c, -6, 6); }
    for (const x of [-24, -8, 8, 24]) socket(c, x, 0, 2.8);
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-4, 10); c.lineTo(0, 13.5); c.lineTo(4, 10); c.stroke();
  },
  // A beetle: two bone elytra, head with mandibles and a horn cannon (legs live)
  tank: (c, col) => {
    blob(c, [0, -20, 11, -16, 14, 0, 11, 15, 0, 19, -11, 15, -14, 0, -11, -16]);
    flesh(c, col, 0, 0, 18); bioEdge(c, col, 1.5, 7);
    for (const s of [-1, 1]) { blob(c, [s * 1, -15, s * 11, -12, s * 13, 2, s * 9, 13, s * 1, 15], true); bone(c, -15, 15); }
    c.strokeStyle = 'rgba(30,18,12,0.9)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, -16); c.lineTo(0, 15); c.stroke();
    blob(c, [0, 14, 7, 17, 5, 23, 0, 21, -5, 23, -7, 17]); flesh(c, col, 0, 18, 7, 0.3); bioEdge(c, col, 1, 5);
    for (const s of [-1, 1]) { c.strokeStyle = '#d8c6ac'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(s * 4, 21); c.quadraticCurveTo(s * 7, 25, s * 3, 26); c.stroke(); }
    nodule(c, 0, 24, 2, col);
  },
};
// Second Brood wave (placeholder art until the generated sheet arrives)
// An egg sac on legs with a dripping ovipositor
ENEMY_ART.brooder = (c, col) => {
  for (const s of [-1, 1]) for (const k of [-1, 1]) vein(c, [s * 6, k * 4, s * 13, k * 8, s * 15, k * 14], '#3a1a2a', 1.6, 1);
  blob(c, [0, -14, 10, -10, 13, 0, 9, 10, 0, 14, -9, 10, -13, 0, -10, -10]);
  flesh(c, col, 0, -3, 14); bioEdge(c, col, 1.3, 7);
  for (const [x, y] of [[-5, -5], [4, -6], [0, 2], [-4, 7], [5, 6]]) nodule(c, x, y, 2.2, col);
  socket(c, 0, -9, 1.8);
};
// A thin eel with one long sighting eye and a barbed snout
ENEMY_ART.stalker = (c, col) => {
  blob(c, [0, -16, 5, -8, 6, 6, 3, 15, 0, 18, -3, 15, -6, 6, -5, -8]);
  flesh(c, col, 0, -2, 14); bioEdge(c, col, 1.2, 8);
  spine(c, 0, -14, 12, 1.6, 5);
  vein(c, [0, 12, 0, 20], col, 1.2, 0.9);
  socket(c, 0, -4, 2.6);
};
// A pulsing heart with three valves
ENEMY_ART.throb = (c, col) => {
  for (const s of [-1, 0, 1]) membrane(c, [s * 8, -6, s * 14 - 4, -16, s * 14 + 4, -16], col, 0.3);
  circle(c, 0, 0, 13); flesh(c, col, 0, 0, 14, 0.3); bioEdge(c, col, 1.5, 9);
  vein(c, [-10, -4, -4, 0, -6, 7], '#9a1020', 0.8, 0.8); vein(c, [9, -5, 4, 1, 7, 8], '#9a1020', 0.8, 0.8);
  sutures(c, -6, 9, 6, 9, 4);
  socket(c, -5, -2, 1.8); socket(c, 5, -2, 1.8);
};
// A loom of three tendrils that weaves the bullets
ENEMY_ART.weaver = (c, col) => {
  for (const s of [-1, 0, 1]) vein(c, [s * 7, 4, s * 14, 10, s * 10, 18], col, 1.4, 0.9);
  blob(c, [0, -12, 14, -9, 20, -1, 13, 6, 0, 8, -13, 6, -20, -1, -14, -9]);
  flesh(c, col, 0, -3, 18); bioEdge(c, col, 1.4, 8);
  sutures(c, -12, -4, 12, -4, 6);
  socket(c, -7, -6, 1.7); socket(c, 0, -7, 2); socket(c, 7, -6, 1.7);
};

const ENEMY_SIZE = { brooder: [36, 36], stalker: [22, 42], throb: [36, 40], weaver: [44, 40], drone: [38, 38], sweeper: [58, 32], crusher: [46, 40], hopper: [30, 30], kamikaze: [28, 38], wall: [68, 30], tank: [42, 54] };

// Live eye positions [x, y, radius] in sprite coordinates.
export const EYES = {
  drone: [[0, 0, 4]], sweeper: [[-5, -4, 1.7], [5, -4, 1.7]], crusher: [[-7, -7, 1.9], [7, -7, 1.9]],
  hopper: [[0, -7, 1.7]], kamikaze: [[0, -9, 1.6]], wall: [[-24, 0, 2.6], [-8, 0, 2.6], [8, 0, 2.6], [24, 0, 2.6]],
  tank: [[-3, 17, 1.4], [3, 17, 1.4]],
  brooder: [[0, -9, 1.6]], stalker: [[0, -4, 2.4]], throb: [[-5, -2, 1.6], [5, -2, 1.6]], weaver: [[-7, -6, 1.5], [0, -7, 1.8], [7, -6, 1.5]],
};

export function enemySprite(type, color) {
  const [w, h] = ENEMY_SIZE[type];
  return bake(`enemy:${type}:${color}`, w, h, (c) => ENEMY_ART[type](c, color));
}

// A live eye: glowing iris, slit pupil looking toward (tx, ty).
export function drawEye(x, y, r, color, tx, ty, blink = 0) {
  const dx = tx - x, dy = ty - y;
  const d = Math.hypot(dx, dy) || 1;
  const ox = (dx / d) * r * 0.38, oy = (dy / d) * r * 0.38;
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = r * 2.5;
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(x, y, r, r * (1 - blink), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (blink < 0.8) {
    ctx.fillStyle = '#0a0006';
    ctx.beginPath(); ctx.ellipse(x + ox, y + oy, r * 0.28, r * 0.7 * (1 - blink), 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// Bosses: big bio-forms (eyes and hearts live)
// ---------------------------------------------------------------------------
const BOSS_ART = {
  // A fortress of flesh around one giant eye, a row of spitting teeth below
  sentinel: (c, col, hw, hh) => {
    blob(c, [-hw, 0, -hw * 0.6, -hh, 0, -hh * 1.1, hw * 0.6, -hh, hw, 0, hw * 0.6, hh, 0, hh * 0.9, -hw * 0.6, hh]);
    flesh(c, col, 0, 0, hw * 0.9, 0.15); bioEdge(c, col, 2, 10);
    for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
      const x = s * (30 + k * 16);
      c.beginPath(); c.moveTo(x, -hh * 0.8 + k * 3); c.quadraticCurveTo(x + s * 8, 0, x, hh * 0.8 - k * 3);
      c.strokeStyle = '#cdb99c'; c.lineWidth = 3; c.stroke();
      c.strokeStyle = 'rgba(40,24,16,0.8)'; c.lineWidth = 0.7; c.stroke();
    }
    for (let k = -2; k <= 2; k++) { path(c, [k * 34 - 4, hh - 4, k * 34, hh + 6, k * 34 + 4, hh - 4]); bone(c, hh - 4, hh + 6); }
    sutures(c, -hw * 0.75, -8, -hw * 0.45, 10, 6); sutures(c, hw * 0.45, -12, hw * 0.78, 6, 6);
    gash(c, -24, 14, 7, 1.6); gash(c, 30, -14, 5, 1.4);
    vein(c, [-hw * 0.5, -6, -30, -10, -20, -4], '#9a1020', 1, 0.7); vein(c, [hw * 0.5, 6, 30, 10, 20, 4], '#9a1020', 1, 0.7);
    socket(c, 0, 0, 17);
  },
  // Three translucent egg sacs on flesh strands (larvae glow live)
  hive: (c, col) => {
    vein(c, [-62, 0, -30, -6, 0, 0, 30, -6, 62, 0], col, 4, 0.5);
    for (const cx of [-62, 0, 62]) {
      const r = cx === 0 ? 27 : 23;
      blob(c, [cx, -r, cx + r * 0.85, -r * 0.45, cx + r, r * 0.3, cx + r * 0.5, r * 0.9, cx, r, cx - r * 0.5, r * 0.9, cx - r, r * 0.3, cx - r * 0.85, -r * 0.45]);
      const g = c.createRadialGradient(cx, -r * 0.3, 2, cx, 0, r * 1.1);
      g.addColorStop(0, rgba('#ffffff', 0.35)); g.addColorStop(0.5, rgba(col, 0.28)); g.addColorStop(1, rgba('#1a0614', 0.95));
      c.fillStyle = g; c.fill(); bioEdge(c, col, 1.8, 9);
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; vein(c, [cx + Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, cx + Math.cos(a + 0.4) * r * 0.5, Math.sin(a + 0.4) * r * 0.5], col, 0.7, 0.5); }
    }
  },
  // A predator skull: bone cranium, jaw, one socket that aims at you
  hunter: (c, col, hw, hh) => {
    blob(c, [-hw, -hh * 0.3, -hw * 0.5, -hh, 0, -hh * 1.05, hw * 0.5, -hh, hw, -hh * 0.3, hw * 0.65, hh * 0.5, hw * 0.25, hh, -hw * 0.25, hh, -hw * 0.65, hh * 0.5]);
    flesh(c, col, 0, 0, hw * 0.9, 0.12); bioEdge(c, col, 1.8, 9);
    blob(c, [-hw * 0.45, -hh * 0.75, 0, -hh * 0.95, hw * 0.45, -hh * 0.75, hw * 0.55, hh * 0.1, 0, hh * 0.3, -hw * 0.55, hh * 0.1]); bone(c, -hh, hh * 0.3);
    for (const s of [-1, 1]) { blob(c, [s * hw * 0.62, -6, s * hw * 0.82, 0, s * hw * 0.62, 14, s * hw * 0.48, 4], true); bone(c, -6, 14); }
    for (let k = -3; k <= 3; k++) { path(c, [k * 9 - 3, hh * 0.3, k * 9, hh * 0.3 + 7, k * 9 + 3, hh * 0.3]); bone(c, hh * 0.3, hh * 0.3 + 7); }
    gash(c, -hw * 0.3, hh * 0.55, 6, 1.4); sutures(c, hw * 0.2, -hh * 0.9, hw * 0.4, -hh * 0.5, 4);
    socket(c, 0, -4, 13);
  },
  // An infested crystal: the shard is clean, the roots are flesh
  prism: (c, col) => {
    for (const s of [-1, 1]) vein(c, [0, 16, s * 18, 22, s * 32, 18], col, 2.4, 0.7);
    path(c, [0, -30, 0, 4, -30, 22]); c.fillStyle = shade(col, -0.35); c.fill();
    path(c, [0, -30, 30, 22, 0, 4]); c.fillStyle = shade(col, -0.6); c.fill();
    path(c, [-30, 22, 0, 4, 30, 22]); c.fillStyle = shade(col, -0.15); c.fill();
    path(c, [0, -30, 30, 22, -30, 22]); neon(c, col, 2, 10);
    blob(c, [-18, 18, 0, 12, 18, 18, 10, 26, -10, 26]); flesh(c, col, 0, 20, 18, 0.2); bioEdge(c, col, 1, 6);
    for (const x of [-9, 0, 9]) nodule(c, x, 21, 2, col);
  },
  // A ribcage gate with a beating heart (heart is live)
  warden: (c, col, hw, hh) => {
    blob(c, [-hw, -hh, 0, -hh * 1.1, hw, -hh, hw * 0.85, hh, 0, hh * 1.05, -hw * 0.85, hh]);
    flesh(c, col, 0, 0, hw, 0.12); bioEdge(c, col, 2, 10);
    for (let k = -2; k <= 2; k++) {
      const x = k * 34;
      c.beginPath(); c.moveTo(x - 10, -hh + 4); c.quadraticCurveTo(x + 8, 0, x - 4, hh - 2);
      c.strokeStyle = '#d6c3a5'; c.lineWidth = 5; c.stroke();
      c.strokeStyle = 'rgba(40,24,16,0.8)'; c.lineWidth = 1; c.stroke();
      nodule(c, x - 4, hh - 1, 2.6, col);
    }
    sutures(c, -hw * 0.9, 0, -hw * 0.6, 0, 5); sutures(c, hw * 0.6, 4, hw * 0.9, 4, 5);
    vein(c, [-hw * 0.8, -hh * 0.6, -40, -4, -14, 0], '#9a1020', 1.2, 0.7);
    vein(c, [hw * 0.8, -hh * 0.6, 40, -4, 14, 0], '#9a1020', 1.2, 0.7);
    socket(c, 0, -4, 10);
  },
};

export function bossSprite(id, color, hw, hh) {
  const w = hw * 2 + 16, h = hh * 2 + 30;
  return bake(`bossbio:${id}:${color}`, w, h, (c) => BOSS_ART[id](c, color, hw, hh));
}
export function prismEmitterSprite(color, hw) {
  return bake(`prismbarbio:${color}`, hw * 2 + 8, 14, (c) => {
    blob(c, [-hw, 0, -hw * 0.5, -4, 0, -3, hw * 0.5, -4, hw, 0, hw * 0.5, 4, 0, 3, -hw * 0.5, 4]);
    flesh(c, color, 0, 0, hw, 0.2); bioEdge(c, color, 1.2, 6);
    for (let k = -2; k <= 2; k++) nodule(c, k * 34, 0, 2.8, '#ffffff');
  });
}

// ---------------------------------------------------------------------------
// Obstacles: fake 3D with a front face, so height reads instantly
// (low = thin slab you jump, wall = tall block you avoid)
// ---------------------------------------------------------------------------
export function obstacleSprite(type, w) {
  if (type === 'low') {
    return bake(`ob:low:${w}`, w + 6, 30, (c) => {
      const hw = w / 2;
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.beginPath(); c.ellipse(0, 12, hw, 4, 0, 0, Math.PI * 2); c.fill();
      rrect(c, -hw, 3, w, 7, 1.5); c.fillStyle = '#1a0f08'; c.fill();             // front face
      rrect(c, -hw, -9, w, 13, 2); plate(c, '#a06030', -9, 4, -0.85, -0.55);     // top face
      hazard(c, -hw + 3, -6, w - 6, 6, PAL.orange, 3);
      rrect(c, -hw, -9, w, 13, 2); neon(c, PAL.orange, 1.4, 7);
      for (const lx of [-hw + 6, hw - 6]) glow(c, lx, 6.5, 2.4, PAL.orange, '#fff0d0');
      c.fillStyle = '#ffffff'; c.globalAlpha = 0.8;                               // up-arrow: jump
      path(c, [-4, -11, 0, -14.5, 4, -11]); c.strokeStyle = '#ffffff'; c.lineWidth = 1.4; c.stroke();
      c.globalAlpha = 1;
    });
  }
  return bake(`ob:wall:${w}`, w + 6, 52, (c) => {
    const hw = w / 2;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath(); c.ellipse(0, 22, hw + 2, 5, 0, 0, Math.PI * 2); c.fill();
    rrect(c, -hw, 2, w, 19, 2); c.fillStyle = '#16061a'; c.fill();                // front face (tall)
    for (let k = -hw + 6; k < hw - 2; k += 7) panelLine(c, k, 4, k, 19, 0.35, PAL.magenta);
    c.save(); c.shadowColor = PAL.red; c.shadowBlur = 6; c.strokeStyle = PAL.red; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(-6, 7); c.lineTo(6, 16); c.moveTo(6, 7); c.lineTo(-6, 16); c.stroke(); c.restore();
    rrect(c, -hw, -20, w, 23, 2.5); plate(c, '#c03aa8', -20, 3, -0.88, -0.6);    // top face
    rrect(c, -hw + 4, -16, w - 8, 15, 1.5); c.strokeStyle = rgba(PAL.magenta, 0.35); c.lineWidth = 0.8; c.stroke();
    rivets(c, [-hw + 3, -17, hw - 3, -17, -hw + 3, 0, hw - 3, 0]);
    rrect(c, -hw, -20, w, 23, 2.5); neon(c, PAL.magenta, 1.6, 8);
    glow(c, 0, -9, 3.2, PAL.red);
  });
}

// ---------------------------------------------------------------------------
// Pickups and bullets
// ---------------------------------------------------------------------------
export function coinSprite() {
  return bake('coin', 16, 16, (c) => {
    const hex = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; hex.push(Math.cos(a) * 6.2, Math.sin(a) * 6.2); }
    path(c, hex);
    const g = c.createLinearGradient(-6, -6, 6, 6);
    g.addColorStop(0, '#eaffb0'); g.addColorStop(0.45, PAL.acid); g.addColorStop(1, '#3e6a08');
    c.fillStyle = g; c.fill();
    neon(c, PAL.acid, 1, 5);
    c.strokeStyle = 'rgba(20,40,0,0.7)'; c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(-3, 0); c.lineTo(0, 0); c.lineTo(0, -3); c.moveTo(0, 0); c.lineTo(2.5, 2.5); c.stroke();
    circle(c, 0, 0, 1.2); c.fillStyle = '#1a3000'; c.fill();
  });
}

export function heartSprite(color) {
  return bake(`heart:${color}`, 26, 24, (c) => {
    c.beginPath();
    c.moveTo(0, 8);
    c.bezierCurveTo(-12, 0, -9, -10, 0, -4);
    c.bezierCurveTo(9, -10, 12, 0, 0, 8);
    const g = c.createRadialGradient(-3, -4, 1, 0, 0, 12);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, color); g.addColorStop(1, shade(color, -0.5));
    c.fillStyle = g; c.fill();
    neon(c, color, 1.2, 8);
  });
}

// Player shot: a glob of bio-plasma, round glowing head, tapering wet tail.
export function boltSprite(color) {
  return bake(`glob:${color}`, 12, 24, (c) => {
    c.beginPath();
    c.moveTo(0, 10);
    c.quadraticCurveTo(-1.6, 2, -3.4, -5);
    c.arc(0, -5.5, 3.5, Math.PI, 0);
    c.quadraticCurveTo(1.6, 2, 0, 10);
    c.closePath();
    c.save(); c.shadowColor = color; c.shadowBlur = 8; c.fillStyle = color; c.fill(); c.restore();
    c.fillStyle = shade(color, -0.35); c.globalAlpha = 0.6;
    c.beginPath(); c.ellipse(0, 3, 1, 4, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    circle(c, 0, -5.5, 2); c.fillStyle = '#f4ffd8'; c.fill();
    circle(c, -0.8, -6.4, 0.7); c.fillStyle = '#ffffff'; c.fill();
  });
}

export function enemyOrbSprite(color, r) {
  const rr = Math.round(r * 2) / 2;
  return bake(`orb:${color}:${rr}`, rr * 5, rr * 5, (c) => {
    c.save(); c.shadowColor = color; c.shadowBlur = rr * 2.2;
    circle(c, 0, 0, rr); c.fillStyle = color; c.fill(); c.fill(); c.restore();
    circle(c, 0, 0, rr * 0.45); c.fillStyle = '#ffffff'; c.fill();
  });
}

export function lowWaveSprite(w) {
  return bake(`lowwave:${w}`, w + 8, 20, (c) => {
    const hw = w / 2;
    c.beginPath(); c.moveTo(-hw, -2); c.quadraticCurveTo(0, 9, hw, -2);
    c.save(); c.shadowColor = PAL.orange; c.shadowBlur = 8;
    c.strokeStyle = PAL.orange; c.lineWidth = 4; c.stroke(); c.restore();
    c.strokeStyle = '#fff2d8'; c.lineWidth = 1.3; c.stroke();
    c.beginPath(); c.moveTo(-hw, -2); c.quadraticCurveTo(0, 9, hw, -2); c.lineTo(hw * 0.8, -7); c.quadraticCurveTo(0, 2, -hw * 0.8, -7); c.closePath();
    c.fillStyle = rgba(PAL.orange, 0.22); c.fill();
  });
}

export function pelletSprite() {
  return bake('pellet', 10, 10, (c) => {
    c.save(); c.shadowColor = '#c6ff1a'; c.shadowBlur = 6;
    circle(c, 0, 0, 2.6); c.fillStyle = '#c6ff1a'; c.fill(); c.restore();
    circle(c, 0, 0, 1.2); c.fillStyle = '#f4ffd8'; c.fill();
  });
}

export function rocketSprite() {
  return bake('rocket', 10, 20, (c) => {
    path(c, [0, -8, 2.4, -4, 2.4, 5, 4, 8, -4, 8, -2.4, 5, -2.4, -4]);
    plate(c, '#8a6a5a', -8, 8, -0.5, 0.1);
    c.strokeStyle = '#c6ff1a'; c.lineWidth = 0.8; c.stroke();
    c.fillStyle = '#c6ff1a'; c.fillRect(-2.4, -2, 4.8, 1.4);
  });
}
