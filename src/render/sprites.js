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
// Player ships: one silhouette per ship type, nose up. The pilot's animal mask
// shows through the canopy (Hotline nod). Engine points get live flames.
// ---------------------------------------------------------------------------
function canopy(c, cx, cy, rx, ry, glass) {
  c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  const g = c.createLinearGradient(cx, cy - ry, cx, cy + ry);
  g.addColorStop(0, shade(glass, 0.5)); g.addColorStop(0.5, rgba(glass, 0.55)); g.addColorStop(1, shade(glass, -0.6));
  c.fillStyle = g; c.fill();
  c.strokeStyle = shade(glass, 0.3); c.lineWidth = 0.8; c.stroke();
  // pilot mask seen through the glass
  c.fillStyle = 'rgba(244,240,255,0.85)';
  circle(c, cx, cy + ry * 0.15, Math.min(rx, ry) * 0.48); c.fill();
  path(c, [cx - rx * 0.45, cy - ry * 0.05, cx - rx * 0.55, cy - ry * 0.55, cx - rx * 0.15, cy - ry * 0.2]); c.fill();
  path(c, [cx + rx * 0.45, cy - ry * 0.05, cx + rx * 0.55, cy - ry * 0.55, cx + rx * 0.15, cy - ry * 0.2]); c.fill();
  c.strokeStyle = PAL.magenta; c.lineWidth = 0.7;
  c.beginPath(); c.moveTo(cx - rx * 0.35, cy + ry * 0.05); c.lineTo(cx - rx * 0.1, cy + ry * 0.1);
  c.moveTo(cx + rx * 0.35, cy + ry * 0.05); c.lineTo(cx + rx * 0.1, cy + ry * 0.1); c.stroke();
  // glint
  c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.8;
  c.beginPath(); c.ellipse(cx - rx * 0.3, cy - ry * 0.35, rx * 0.25, ry * 0.18, -0.5, Math.PI, Math.PI * 1.6); c.stroke();
}
function nozzle(c, x, y, w, h, col) {
  rrect(c, x - w / 2, y, w, h, Math.min(w, h) * 0.35);
  plate(c, '#9a9aaa', y, y + h, -0.85, -0.45);
  c.strokeStyle = rgba(col, 0.8); c.lineWidth = 0.8; c.stroke();
  c.fillStyle = shade(col, 0.2);
  c.fillRect(x - w * 0.3, y + h - 1.4, w * 0.6, 1.4);
}

const SHIP_ART = {
  // Swept-wing interceptor
  stock: (c, col) => {
    path(c, [0, -28, 5, -14, 22, 6, 22, 13, 8, 10, 6, 20, -6, 20, -8, 10, -22, 13, -22, 6, -5, -14]);
    plate(c, col, -28, 20, -0.86, -0.5); neon(c, col, 1.6, 9);
    path(c, [0, -24, 3, -12, 3, 14, -3, 14, -3, -12]); c.fillStyle = shade(col, -0.7); c.fill();
    panelLine(c, 5, -12, 18, 8, 0.3); panelLine(c, -5, -12, -18, 8, 0.3); panelLine(c, -8, 10, 8, 10, 0.25);
    rivets(c, [-15, 7, 15, 7, -10, 3, 10, 3]);
    for (const wx of [-21, 21]) glow(c, wx, 9.5, 2.6, wx < 0 ? PAL.red : PAL.acid);
    canopy(c, 0, -10, 4.4, 7.5, PAL.cyan);
    nozzle(c, -4.5, 17, 5.5, 6, col); nozzle(c, 4.5, 17, 5.5, 6, col);
  },
  // Long, thin, forward-swept stealth
  ghost: (c, col) => {
    path(c, [0, -30, 3, -6, 18, -12, 20, -8, 6, 8, 4, 22, -4, 22, -6, 8, -20, -8, -18, -12, -3, -6]);
    plate(c, '#cfd6ff', -30, 22, -0.9, -0.62); neon(c, col, 1.3, 10);
    panelLine(c, 0, -26, 0, 18, 0.35);
    panelLine(c, 3, -6, 17, -10, 0.3); panelLine(c, -3, -6, -17, -10, 0.3);
    for (const wx of [-19, 19]) glow(c, wx, -10, 2, col);
    canopy(c, 0, -12, 3.4, 7, '#9ad8ff');
    nozzle(c, 0, 19, 6, 6, col);
  },
  // Wide armoured gunship, four engines, twin cannons
  tank: (c, col) => {
    rrect(c, -20, -16, 40, 34, 6); plate(c, col, -16, 18, -0.85, -0.55); neon(c, col, 1.8, 8);
    path(c, [-10, -16, -6, -26, 6, -26, 10, -16]); plate(c, col, -26, -16, -0.8, -0.45); neon(c, col, 1.2, 5);
    for (const gx of [-14, 14]) { rrect(c, gx - 2, -27, 4, 13, 1.2); plate(c, '#aaa', -27, -14, -0.85, -0.5); glow(c, gx, -27, 2, col); }
    hazard(c, -18, 10, 36, 4, col, 3);
    for (const px of [-12, 12]) { rrect(c, px - 6, -10, 12, 16, 2); c.strokeStyle = rgba(col, 0.4); c.lineWidth = 0.8; c.stroke(); }
    rivets(c, [-17, -13, 17, -13, -17, 7, 17, 7, -6, 7, 6, 7]);
    canopy(c, 0, -5, 5, 6, PAL.cyan);
    for (const ex of [-15, -6, 6, 15]) nozzle(c, ex, 18, 5.5, 5, col);
  },
  // Organic bio-ship: curved hull, pods and veins
  viral: (c, col) => {
    c.beginPath();
    c.moveTo(0, -28);
    c.bezierCurveTo(10, -22, 12, -6, 20, 2);
    c.bezierCurveTo(24, 8, 16, 16, 8, 12);
    c.bezierCurveTo(6, 20, -6, 20, -8, 12);
    c.bezierCurveTo(-16, 16, -24, 8, -20, 2);
    c.bezierCurveTo(-12, -6, -10, -22, 0, -28);
    c.closePath();
    plate(c, col, -28, 20, -0.88, -0.55); neon(c, col, 1.5, 10);
    c.strokeStyle = rgba(col, 0.45); c.lineWidth = 0.8;
    c.beginPath(); c.moveTo(0, -20); c.bezierCurveTo(6, -6, 12, 2, 18, 4); c.moveTo(0, -20); c.bezierCurveTo(-6, -6, -12, 2, -18, 4); c.stroke();
    for (const [px, py, r] of [[-13, 6, 3.4], [13, 6, 3.4], [0, 4, 2.6]]) { circle(c, px, py, r); c.fillStyle = '#0c1406'; c.fill(); glow(c, px, py, r * 0.9, col); }
    canopy(c, 0, -11, 4.2, 6.5, PAL.acid);
    nozzle(c, 0, 15, 6, 5, col);
  },
  // Fractured silhouette, sliced and offset like a corrupted file
  glitch: (c, col) => {
    const hull = [0, -28, 6, -12, 20, 4, 14, 12, 6, 10, 4, 20, -4, 20, -6, 10, -14, 12, -20, 4, -6, -12];
    c.save(); c.translate(-1.5, 0); path(c, hull); c.strokeStyle = rgba(PAL.cyan, 0.7); c.lineWidth = 1.2; c.stroke(); c.restore();
    c.save(); c.translate(1.5, 0); path(c, hull); c.strokeStyle = rgba(PAL.magenta, 0.7); c.lineWidth = 1.2; c.stroke(); c.restore();
    path(c, hull); plate(c, col, -28, 20, -0.88, -0.6);
    for (const [y0, dx] of [[-16, 2], [-2, -3], [8, 2.5]]) {
      c.save(); c.beginPath(); c.rect(-24, y0, 48, 3); c.clip();
      c.translate(dx, 0); path(c, hull); c.fillStyle = shade(col, -0.3); c.fill(); c.restore();
    }
    path(c, hull); neon(c, col, 1.4, 9);
    canopy(c, 0, -9, 4.2, 6.8, PAL.white);
    nozzle(c, -4, 17, 5, 5, PAL.cyan); nozzle(c, 4, 17, 5, 5, PAL.magenta);
  },
};

// Engine exhaust points per ship (sprite coordinates), for live flames.
export const SHIP_ENGINES = {
  stock: [[-4.5, 24], [4.5, 24]],
  ghost: [[0, 25]],
  tank: [[-15, 23], [-6, 23], [6, 23], [15, 23]],
  viral: [[0, 20]],
  glitch: [[-4, 22], [4, 22]],
};

export function shipSprite(id, color) {
  const art = SHIP_ART[id] || SHIP_ART.stock;
  return bake(`ship:${id}:${color}`, 50, 62, (c) => art(c, color));
}

// ---------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------
const ENEMY_ART = {
  drone: (c, col) => {
    c.strokeStyle = '#2b2236'; c.lineWidth = 3;
    for (const [dx, dy] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) { c.beginPath(); c.moveTo(0, 0); c.lineTo(dx, dy); c.stroke(); }
    for (const [dx, dy] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
      circle(c, dx, dy, 5.6); c.fillStyle = 'rgba(0,0,0,0.55)'; c.fill(); neon(c, col, 0.9, 4);
      circle(c, dx, dy, 1.4); c.fillStyle = shade(col, 0.3); c.fill();
    }
    const hex = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; hex.push(Math.cos(a) * 9, Math.sin(a) * 9); }
    path(c, hex); plate(c, col, -9, 9); neon(c, col, 1.5, 6);
    const hex2 = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; hex2.push(Math.cos(a) * 5.5, Math.sin(a) * 5.5); }
    path(c, hex2); c.strokeStyle = rgba(col, 0.4); c.lineWidth = 0.7; c.stroke();
    circle(c, 0, 0, 3.6); c.fillStyle = '#100810'; c.fill();
    glow(c, 0, 1, 3.4, PAL.orange, '#fff3d0');
  },
  sweeper: (c, col) => {
    const wing = [0, 12, 26, -5, 19, -12, 0, -6, -19, -12, -26, -5];
    path(c, wing); plate(c, col, -12, 12); neon(c, col, 1.5, 7);
    panelLine(c, 0, -6, 0, 12, 0.3); panelLine(c, 0, 4, 22, -6); panelLine(c, 0, 4, -22, -6);
    rivets(c, [-14, -6, 14, -6, -8, -2, 8, -2]);
    for (const gx of [-12, 0, 12]) {
      rrect(c, gx - 2, 7 - Math.abs(gx) * 0.55, 4, 7, 1.2); c.fillStyle = '#1a1414'; c.fill();
      glow(c, gx, 13 - Math.abs(gx) * 0.55, 2.2, col);
    }
    c.beginPath(); c.ellipse(0, -1, 3.4, 5, 0, 0, Math.PI * 2);
    const g = c.createLinearGradient(0, -6, 0, 4); g.addColorStop(0, '#ffe2b8'); g.addColorStop(1, shade(col, -0.2));
    c.fillStyle = g; c.fill();
  },
  crusher: (c, col) => {
    rrect(c, -18, -14, 36, 26, 5); plate(c, col, -14, 12); neon(c, col, 1.6, 7);
    hazard(c, -16, 4, 32, 6, col, 3);
    for (const vx of [-9, -3, 3, 9]) panelLine(c, vx, -11, vx, -5, 0.5);
    rivets(c, [-15, -11, 15, -11, -15, 1, 15, 1]);
    rrect(c, -5, -6, 10, 9, 2); c.fillStyle = '#0d120a'; c.fill();
    glow(c, 0, -1.5, 4, col);
    rrect(c, -13, 12, 26, 3.5, 1.5); c.fillStyle = shade(col, 0.2); c.fill();
    c.save(); c.shadowColor = col; c.shadowBlur = 8; c.fillRect(-13, 12, 26, 3.5); c.restore();
  },
  hopper: (c, col) => {
    const d = [0, -10, 10, 0, 0, 10, -10, 0];
    path(c, d); plate(c, col, -10, 10); neon(c, col, 1.5, 6);
    path(c, [0, -5, 5, 0, 0, 5, -5, 0]); c.strokeStyle = rgba(col, 0.45); c.lineWidth = 0.7; c.stroke();
    glow(c, 0, 0, 3.2, col);
  },
  kamikaze: (c, col) => {
    const body = [0, 17, 6, -1, 11, -12, 4, -8, 0, -13, -4, -8, -11, -12, -6, -1];
    path(c, body); plate(c, col, -13, 17, -0.75, -0.35); neon(c, col, 1.4, 7);
    panelLine(c, 0, -10, 0, 14, 0.35);
    hazard(c, -4, 4, 8, 4, PAL.red, 2);
    glow(c, 0, 12, 2.6, '#ffffff', '#ffffff');
  },
  wall: (c, col) => {
    rrect(c, -31, -8, 62, 16, 4); plate(c, col, -8, 8); neon(c, col, 1.6, 7);
    for (const sx of [-15.5, 0, 15.5]) panelLine(c, sx, -6, sx, 6, 0.45);
    for (const tx of [-24, -8, 8, 24]) {
      circle(c, tx, 0, 3.6); c.fillStyle = '#120a1a'; c.fill();
      glow(c, tx, 0.5, 2.8, col);
      rrect(c, tx - 1.3, 3, 2.6, 6, 1); c.fillStyle = '#2a2236'; c.fill();
    }
    rivets(c, [-28, -5, 28, -5, -28, 5, 28, 5]);
    // safe-spot marker: right under it
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.4;
    c.beginPath(); c.moveTo(-4, 10); c.lineTo(0, 13.5); c.lineTo(4, 10); c.stroke();
  },
  tank: (c, col) => {
    for (const tx of [-15, 15]) { rrect(c, tx - 5, -21, 10, 42, 3); c.fillStyle = '#121414'; c.fill(); c.strokeStyle = rgba(col, 0.5); c.lineWidth = 0.8; c.stroke(); }
    rrect(c, -11, -17, 22, 34, 4); plate(c, col, -17, 17); neon(c, col, 1.5, 6);
    rivets(c, [-8, -14, 8, -14, -8, 14, 8, 14]);
    panelLine(c, -11, -8, 11, -8, 0.3); panelLine(c, -11, 10, 11, 10, 0.3);
    rrect(c, -2.4, 4, 4.8, 18, 1.5); plate(c, '#9aa', 4, 22, -0.8, -0.4);
    circle(c, 0, -1, 8.5); plate(c, col, -9, 8, -0.75, -0.35); neon(c, col, 1.2, 5);
    glow(c, 0, -1, 3, col);
  },
};
const ENEMY_SIZE = { drone: [36, 36], sweeper: [56, 32], crusher: [44, 40], hopper: [30, 30], kamikaze: [28, 38], wall: [66, 30], tank: [42, 48] };

export function enemySprite(type, color) {
  const [w, h] = ENEMY_SIZE[type];
  return bake(`enemy:${type}:${color}`, w, h, (c) => ENEMY_ART[type](c, color));
}

// ---------------------------------------------------------------------------
// Bosses (static bodies; eyes, aim lines, rotation are drawn live)
// ---------------------------------------------------------------------------
const BOSS_ART = {
  sentinel: (c, col, hw, hh) => {
    const outer = [-hw, 0, -hw * 0.5, -hh, hw * 0.5, -hh, hw, 0, hw * 0.5, hh, -hw * 0.5, hh];
    path(c, outer); plate(c, col, -hh, hh); neon(c, col, 2.2, 10);
    path(c, outer.map((v, i) => v * (i % 2 ? 0.62 : 0.7))); c.strokeStyle = rgba(col, 0.35); c.lineWidth = 1; c.stroke();
    for (const sx of [-1, 1]) {
      path(c, [sx * hw * 0.62, -hh * 0.55, sx * hw * 0.92, 0, sx * hw * 0.62, hh * 0.55]);
      c.fillStyle = shade(col, -0.7); c.fill(); c.strokeStyle = rgba(col, 0.6); c.lineWidth = 1; c.stroke();
      rivets(c, [sx * hw * 0.7, -hh * 0.3, sx * hw * 0.7, hh * 0.3, sx * hw * 0.82, 0]);
    }
    for (let k = -2; k <= 2; k++) { circle(c, k * 34, hh - 5, 3.5); c.fillStyle = '#100810'; c.fill(); c.strokeStyle = col; c.lineWidth = 1; c.stroke(); }
    circle(c, 0, 0, 19); c.fillStyle = '#0d0610'; c.fill(); neon(c, col, 1.4, 6);
  },
  hive: (c, col) => {
    c.strokeStyle = '#26301a'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(-62, 0); c.lineTo(62, 0); c.stroke();
    for (const cx of [-62, 0, 62]) {
      const r = cx === 0 ? 27 : 23;
      const hex = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; hex.push(cx + Math.cos(a) * r, Math.sin(a) * r); }
      path(c, hex); plate(c, col, -r, r); neon(c, col, 1.8, 8);
      const inner = []; for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; inner.push(cx + Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); }
      path(c, inner); c.fillStyle = '#0c1206'; c.fill(); c.strokeStyle = rgba(col, 0.5); c.lineWidth = 1; c.stroke();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; panelLine(c, cx + Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, cx + Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, 0.35); }
    }
  },
  hunter: (c, col, hw, hh) => {
    const hull = [-hw, -hh * 0.4, -hw * 0.4, -hh, hw * 0.4, -hh, hw, -hh * 0.4, hw * 0.6, hh, hw * 0.15, hh * 0.6, -hw * 0.15, hh * 0.6, -hw * 0.6, hh];
    path(c, hull); plate(c, col, -hh, hh); neon(c, col, 2, 9);
    for (const sx of [-1, 1]) {
      rrect(c, sx * hw * 0.62 - 8, -hh * 0.6, 16, hh * 1.3, 4); plate(c, '#888', -hh, hh, -0.85, -0.5);
      c.strokeStyle = rgba(col, 0.6); c.lineWidth = 1; c.stroke();
      glow(c, sx * hw * 0.62, hh * 0.75, 5, col);
    }
    panelLine(c, -hw * 0.4, -hh, 0, hh * 0.6, 0.3); panelLine(c, hw * 0.4, -hh, 0, hh * 0.6, 0.3);
    rivets(c, [-hw * 0.8, -hh * 0.35, hw * 0.8, -hh * 0.35, -30, -hh * 0.8, 30, -hh * 0.8]);
    circle(c, 0, 0, 15); c.fillStyle = '#120408'; c.fill(); neon(c, col, 1.2, 5);
  },
  prism: (c, col) => {
    const t = [0, -30, 30, 22, -30, 22];
    path(c, [0, -30, 0, 4, -30, 22]); c.fillStyle = shade(col, -0.35); c.fill();
    path(c, [0, -30, 30, 22, 0, 4]); c.fillStyle = shade(col, -0.6); c.fill();
    path(c, [-30, 22, 0, 4, 30, 22]); c.fillStyle = shade(col, -0.15); c.fill();
    path(c, t); neon(c, col, 2, 10);
    panelLine(c, 0, -30, 0, 4, 0.5); panelLine(c, -30, 22, 0, 4, 0.5); panelLine(c, 30, 22, 0, 4, 0.5);
  },
  warden: (c, col, hw, hh) => {
    const body = [-hw, -hh, hw, -hh, hw * 0.8, hh, -hw * 0.8, hh];
    path(c, body); plate(c, col, -hh, hh); neon(c, col, 2.2, 10);
    for (let k = -2; k <= 2; k++) {
      const ex = k * 34;
      rrect(c, ex - 5, -hh + 6, 10, hh * 2 - 8, 2); c.fillStyle = shade(col, -0.75); c.fill();
      c.strokeStyle = rgba(col, 0.5); c.lineWidth = 0.8; c.stroke();
      rrect(c, ex - 3, hh - 6, 6, 9, 1.5); c.fillStyle = '#1a0e06'; c.fill();
      glow(c, ex, hh + 1, 3, col);
    }
    hazard(c, -hw * 0.9, -hh + 1, hw * 1.8, 4, col, 4);
    circle(c, 0, -4, 10); c.fillStyle = '#140606'; c.fill(); neon(c, PAL.red, 1.2, 6);
  },
};

export function bossSprite(id, color, hw, hh) {
  const w = hw * 2 + 16, h = hh * 2 + 24;
  return bake(`boss:${id}:${color}`, w, h, (c) => BOSS_ART[id](c, color, hw, hh));
}
export function prismEmitterSprite(color, hw) {
  return bake(`prismbar:${color}`, hw * 2 + 8, 12, (c) => {
    rrect(c, -hw, -3, hw * 2, 6, 3); plate(c, '#999', -3, 3, -0.85, -0.5); neon(c, color, 1.2, 6);
    for (let k = -2; k <= 2; k++) glow(c, k * 34, 0, 3.2, '#ffffff');
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

export function boltSprite(color) {
  return bake(`bolt:${color}`, 10, 22, (c) => {
    rrect(c, -2.4, -9, 4.8, 18, 2.4);
    c.save(); c.shadowColor = color; c.shadowBlur = 8; c.fillStyle = color; c.fill(); c.restore();
    rrect(c, -1.1, -7, 2.2, 13, 1.1); c.fillStyle = '#ffffff'; c.fill();
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
