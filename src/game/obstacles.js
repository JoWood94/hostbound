// Runner obstacles, placed in lanes and scrolling with the world.
//   low  : tripwire of orange plasma, jump over it (like low waves)
//   wall : magenta field-line barrier, change lane
//   veil : a rift curtain across ALL lanes, cannot be dodged or jumped: PHASE
//          through it (cyan, the phase colour)
//   rift : the same tear, one lane wide. Usually set in the gap of a barrier
//          row, so the only way through is to phase
// A "gate" is a row of walls with one open lane.
import { PAL } from '../render/palette.js';
import { ctx, W, H } from '../core/canvas.js';
import { LANES, LANE_W, laneX } from './world.js';

const VARIANTS = { low: 3, wall: 3, veil: 1, rift: 1 };

export const obstacles = [];

export function spawnObstacle(type, lane, y = -30) {
  obstacles.push({ type, lane, x: laneX(lane), y, prevY: y, hit: false, passed: false, jumped: false, dead: false, v: Math.floor(Math.random() * VARIANTS[type]), rot: (Math.random() - 0.5) * 0.3 });
}

export function spawnGate(gapLane, y = -30) {
  for (let l = 0; l < LANES; l++) if (l !== gapLane) spawnObstacle('wall', l, y);
}

export function updateObstacles(dt, speed) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    o.prevY = o.y;
    o.y += speed * dt;
    if (o.y > H + 60 || o.dead) { obstacles.splice(i, 1); i--; }
  }
}

export const OB_H = { low: 14, wall: 30, veil: 10, rift: 12 };

export function spawnVeil(y = -30) {
  spawnObstacle('veil', 2, y);
}

// ---------------------------------------------------------------------------
// Drawing. Every obstacle is pre-rendered once into a 12-frame animation loop
// (glow, strands, sparks) and stamped with drawImage at play time: shadowBlur
// strokes and gradients per obstacle per frame made dense courses lag on
// phones. The art is the same, only cached.
// ---------------------------------------------------------------------------
const FRAMES = 12;
const FPS = 12;
const RES = 2.5;                       // cache pixels per logical pixel
const cache = new Map();

function cached(key, w, h, paint) {
  let frames = cache.get(key);
  if (!frames) {
    frames = [];
    for (let f = 0; f < FRAMES; f++) {
      const c = document.createElement('canvas');
      c.width = Math.ceil(w * RES); c.height = Math.ceil(h * RES);
      const g = c.getContext('2d');
      g.scale(RES, RES);
      g.translate(w / 2, h / 2);
      paint(g, (f / FRAMES) * Math.PI * 2, f / FRAMES);
      frames.push(c);
    }
    cache.set(key, frames);
  }
  return frames;
}
function stamp(frames, x, y, w, h, seed, alpha = 1) {
  const f = (Math.floor((performance.now() / 1000) * FPS) + seed) % FRAMES;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(frames[f], x - w / 2, y - h / 2, w, h);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

export function drawObstacles(alpha) {
  for (const o of obstacles) {
    if (o.dead) continue;
    const y = o.prevY + (o.y - o.prevY) * alpha;
    const seed = o.lane * 5 + o.v * 3;
    if (o.type === 'veil') stamp(veilFrames(), W / 2, y, W, VEIL_H, 0, o.phased ? 0.35 : 1);
    else if (o.type === 'low') stamp(tripFrames(o.v), o.x, y, CELL_W, CELL_H, seed);
    else if (o.type === 'rift') stamp(riftFrames(), o.x, y, CELL_W, CELL_H, seed, o.phased ? 0.35 : 1);
    else stamp(barrierFrames(o.v), o.x, y, CELL_W, CELL_H, seed);
  }
}

const CELL_W = LANE_W + 16, CELL_H = 64, VEIL_H = 64;

// All three obstacles are one family: strands of plasma stretched across the
// current, coloured by what you must do. Orange = jump, magenta = dodge,
// cyan = phase. `ph` is the loop phase (0..2pi), so animations wrap cleanly.
function glowDot(g, x, y, color, r, a = 1) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.globalAlpha = a; g.globalCompositeOperation = 'lighter';
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
function strands(g, x0, x1, y, ph, { color, core, n, gap, amp, freq, blur, alpha = 1, seed = 0 }) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const mid = k === (n >> 1);
    g.strokeStyle = mid ? core : color;
    g.globalAlpha = alpha * (mid ? 0.95 : 0.6);
    g.lineWidth = mid ? 1.6 : 1;
    g.shadowColor = color; g.shadowBlur = (mid ? blur : blur * 0.4) * RES;
    const yy0 = y + (k - (n - 1) / 2) * gap;
    g.beginPath();
    for (let x = x0; x <= x1 + 0.1; x += 4) {
      const yy = yy0 + Math.sin(x * freq + ph * (1 + (k % 2)) + k + seed) * amp;
      if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.restore();
}
// Soft vertical glow band; `rgba` has an "A" placeholder for the alpha.
function field(g, x0, x1, y, h, rgba, a) {
  const gr = g.createLinearGradient(0, y - h, 0, y + h);
  gr.addColorStop(0, rgba.replace('A', 0));
  gr.addColorStop(0.5, rgba.replace('A', a));
  gr.addColorStop(1, rgba.replace('A', 0));
  g.fillStyle = gr;
  g.fillRect(x0, y - h, x1 - x0, h * 2);
}
function chevron(g, x, y, up, color, a = 0.9) {
  g.save(); g.strokeStyle = color; g.lineWidth = 2; g.globalAlpha = a; g.lineCap = 'round';
  g.beginPath();
  if (up) { g.moveTo(x - 5, y + 2); g.lineTo(x, y - 3); g.lineTo(x + 5, y + 2); }
  else { g.moveTo(x - 5, y - 3); g.lineTo(x, y + 2); g.lineTo(x + 5, y - 3); }
  g.stroke(); g.restore();
}

// Tripwire: a thin, low ribbon of orange plasma across one lane, sparks
// crawling along it, emitters on the lane edges. Jump it.
const tripFrames = (v) => cached(`trip${v}`, CELL_W, CELL_H, (g, ph, u) => {
  const hw = LANE_W * 0.42;
  field(g, -hw, hw, 0, 10, 'rgba(255,106,0,A)', 0.22);
  strands(g, -hw, hw, 0, ph, { color: PAL.orange, core: '#fff1e0', n: 3, gap: 2.5, amp: 1.6, freq: 0.16, blur: 10, seed: v });
  for (let k = 0; k < 3; k++) {
    const f = (u + k / 3 + v * 0.17) % 1;
    glowDot(g, -hw + f * hw * 2, Math.sin(f * 20) * 1.5, '#ffffff', 1.6, 0.9);
  }
  for (const s of [-1, 1]) { glowDot(g, s * hw, 0, PAL.orange, 5, 0.8); glowDot(g, s * hw, 0, '#ffffff', 2, 1); }
  chevron(g, 0, -11, true, PAL.orange, 0.75 + Math.sin(ph * 2) * 0.2);
});

// Micro rift: a one-lane tear, cyan like every phase signal. Phase through.
const riftFrames = () => cached('rift', CELL_W, CELL_H, (g, ph) => {
  const hw = LANE_W * 0.44;
  field(g, -hw, hw, 0, 16, 'rgba(25,240,255,A)', 0.3);
  strands(g, -hw, hw, 0, ph, { color: PAL.cyan, core: '#f0ffff', n: 3, gap: 3.5, amp: 2.4, freq: 0.2, blur: 10 });
  for (const s of [-1, 1]) glowDot(g, s * hw, 0, PAL.cyan, 5, 0.8);
  chevron(g, 0, -13 + Math.sin(ph * 2) * 1.5, false, PAL.cyan, 0.85);
});

// Barrier: a dense magenta knot of field lines filling one lane, dark and
// solid at the core, anchored by two pylons. Too tall to jump: change lane.
const barrierFrames = (v) => cached(`barrier${v}`, CELL_W, CELL_H, (g, ph) => {
  const hw = LANE_W * 0.44;
  g.fillStyle = 'rgba(12,0,14,0.85)';
  g.beginPath(); g.ellipse(0, 0, hw, 15, 0, 0, Math.PI * 2); g.fill();
  field(g, -hw, hw, 0, 22, 'rgba(255,43,214,A)', 0.28);
  strands(g, -hw, hw, 0, ph, { color: PAL.magenta, core: '#ffe0fa', n: 5, gap: 4.5, amp: 2.6, freq: 0.12, blur: 12, seed: v * 2 });
  for (const s of [-1, 1]) {
    const px = s * hw;
    g.fillStyle = '#1a0418'; g.strokeStyle = PAL.magenta; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(px, -15); g.lineTo(px + 4, 0); g.lineTo(px, 15); g.lineTo(px - 4, 0); g.closePath();
    g.fill(); g.stroke();
    glowDot(g, px, 0, PAL.magenta, 6, 0.6 + Math.sin(ph + s) * 0.3);
  }
  glowDot(g, 0, 0, PAL.red, 7 + Math.sin(ph) * 1.5, 0.55);
  glowDot(g, 0, 0, '#ffffff', 2, 0.9);
});

// A tear in space stretched across the whole track: shimmering strands of
// cyan light with a white-hot seam. Phase (swipe down) to slip through it.
const VEIL_X0 = laneX(0) - LANE_W / 2, VEIL_X1 = laneX(LANES - 1) + LANE_W / 2;
const veilFrames = () => cached('veil', W, VEIL_H, (g, ph) => {
  const x0 = VEIL_X0 - W / 2, x1 = VEIL_X1 - W / 2;
  g.save();
  g.globalCompositeOperation = 'lighter';
  const gr = g.createLinearGradient(0, -22, 0, 22);
  gr.addColorStop(0, 'rgba(25,240,255,0)'); gr.addColorStop(0.5, 'rgba(25,240,255,0.22)'); gr.addColorStop(1, 'rgba(25,240,255,0)');
  g.fillStyle = gr; g.fillRect(x0, -22, x1 - x0, 44);
  g.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = k === 1 ? 'rgba(240,255,255,0.95)' : 'rgba(25,240,255,0.6)';
    g.lineWidth = k === 1 ? 1.6 : 1;
    g.shadowColor = PAL.cyan; g.shadowBlur = (k === 1 ? 10 : 4) * RES;
    g.beginPath();
    for (let x = x0; x <= x1; x += 6) {
      const yy = (k - 1) * 4 + Math.sin(x * 0.07 + ph * (1 + k) + k) * 2.5;
      if (x === x0) g.moveTo(x, yy); else g.lineTo(x, yy);
    }
    g.stroke();
  }
  g.restore();
  for (let l = 0; l < LANES; l++) chevron(g, laneX(l) - W / 2, -16 + Math.sin(ph * 2) * 1.5, false, PAL.cyan, 0.85);
});

export function clearObstacles() { obstacles.length = 0; }

// Build every animation cache up front (run start), so the one-off ~40 ms
// cost never lands in the middle of a dodge.
export function warmObstacleArt() {
  for (let v = 0; v < VARIANTS.low; v++) tripFrames(v);
  for (let v = 0; v < VARIANTS.wall; v++) barrierFrames(v);
  riftFrames();
  veilFrames();
}
