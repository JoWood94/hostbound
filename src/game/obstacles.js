// Runner obstacles, placed in lanes and scrolling with the world.
//   low  : tripwire of orange plasma, jump over it (like low waves)
//   wall : magenta field-line barrier, change lane
//   veil : a rift curtain across ALL lanes, cannot be dodged or jumped: PHASE
//          through it (cyan, the phase colour)
//   rift : the same tear, one lane wide. Usually set in the gap of a barrier
//          row, so the only way through is to phase
// A "gate" is a row of walls with one open lane.
import { PAL } from '../render/palette.js';
import { drawGlowDot } from '../render/draw.js';
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

export function drawObstacles(alpha) {
  for (const o of obstacles) {
    if (o.dead) continue;
    const y = o.prevY + (o.y - o.prevY) * alpha;
    if (o.type === 'veil') drawVeil(y, o.phased);
    else if (o.type === 'low') drawTrip(o.x, y, o.v);
    else if (o.type === 'rift') drawRift(o.x, y, o.phased);
    else drawBarrier(o.x, y, o.v);
  }
}

// All three obstacles are one family: strands of plasma stretched across the
// current, coloured by what you must do. Orange = jump, magenta = dodge,
// cyan = phase.
function strands(x0, x1, y, { color, core, n, gap, amp, freq, speed, blur, alpha = 1, seed = 0 }) {
  const t = performance.now() / 1000;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const mid = k === (n >> 1);
    ctx.strokeStyle = mid ? core : color;
    ctx.globalAlpha = alpha * (mid ? 0.95 : 0.6);
    ctx.lineWidth = mid ? 1.6 : 1;
    ctx.shadowColor = color; ctx.shadowBlur = mid ? blur : blur * 0.4;
    const yy0 = y + (k - (n - 1) / 2) * gap;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 0.1; x += 4) {
      const yy = yy0 + Math.sin(x * freq + t * (speed + k * 1.7) + k + seed) * amp;
      if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}
// Soft vertical glow band; `rgba` has an "A" placeholder for the alpha.
function field(x0, x1, y, h, rgba, a) {
  const g = ctx.createLinearGradient(0, y - h, 0, y + h);
  g.addColorStop(0, rgba.replace('A', 0));
  g.addColorStop(0.5, rgba.replace('A', a));
  g.addColorStop(1, rgba.replace('A', 0));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y - h, x1 - x0, h * 2);
}
function chevron(x, y, up, color, a = 0.9) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = a; ctx.lineCap = 'round';
  ctx.beginPath();
  if (up) { ctx.moveTo(x - 5, y + 2); ctx.lineTo(x, y - 3); ctx.lineTo(x + 5, y + 2); }
  else { ctx.moveTo(x - 5, y - 3); ctx.lineTo(x, y + 2); ctx.lineTo(x + 5, y - 3); }
  ctx.stroke(); ctx.restore();
}

// Tripwire: a thin, low ribbon of orange plasma across one lane, sparks
// crawling along it, emitters on the lane edges. Jump it.
function drawTrip(x, y, v) {
  const hw = LANE_W * 0.42;
  const t = performance.now() / 1000;
  field(x - hw, x + hw, y, 10, 'rgba(255,106,0,A)', 0.22);
  strands(x - hw, x + hw, y, { color: PAL.orange, core: '#fff1e0', n: 3, gap: 2.5, amp: 1.6, freq: 0.16, speed: 9, blur: 10, seed: v });
  for (let k = 0; k < 3; k++) {
    const f = (t * 0.9 + k / 3 + v * 0.17) % 1;
    drawGlowDot(x - hw + f * hw * 2, y + Math.sin(f * 20) * 1.5, '#ffffff', 1.3, 0.9);
  }
  for (const s of [-1, 1]) { drawGlowDot(x + s * hw, y, PAL.orange, 4, 0.8); drawGlowDot(x + s * hw, y, '#ffffff', 1.5, 1); }
  chevron(x, y - 11, true, PAL.orange, 0.75 + Math.sin(t * 8) * 0.2);
}

// Micro rift: a one-lane tear, cyan like every phase signal. Phase through.
function drawRift(x, y, phased) {
  const hw = LANE_W * 0.44;
  const t = performance.now() / 1000;
  const a = phased ? 0.35 : 1;
  field(x - hw, x + hw, y, 16, 'rgba(25,240,255,A)', 0.3 * a);
  strands(x - hw, x + hw, y, { color: PAL.cyan, core: '#f0ffff', n: 3, gap: 3.5, amp: 2.4, freq: 0.2, speed: 11, blur: 10, alpha: a });
  for (const s of [-1, 1]) drawGlowDot(x + s * hw, y, PAL.cyan, 4, 0.8 * a);
  if (!phased) chevron(x, y - 13 + Math.sin(t * 8) * 1.5, false, PAL.cyan, 0.85);
}

// Barrier: a dense magenta knot of field lines filling one lane, dark and
// solid at the core, anchored by two pylons. Too tall to jump: change lane.
function drawBarrier(x, y, v) {
  const hw = LANE_W * 0.44;
  const t = performance.now() / 1000;
  ctx.save();
  ctx.fillStyle = 'rgba(12,0,14,0.85)';
  ctx.beginPath(); ctx.ellipse(x, y, hw, 15, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  field(x - hw, x + hw, y, 22, 'rgba(255,43,214,A)', 0.28);
  strands(x - hw, x + hw, y, { color: PAL.magenta, core: '#ffe0fa', n: 5, gap: 4.5, amp: 2.6, freq: 0.12, speed: 6, blur: 12, seed: v * 2 });
  for (const s of [-1, 1]) {
    const px = x + s * hw;
    ctx.save(); ctx.fillStyle = '#1a0418'; ctx.strokeStyle = PAL.magenta; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(px, y - 15); ctx.lineTo(px + 4, y); ctx.lineTo(px, y + 15); ctx.lineTo(px - 4, y); ctx.closePath();
    ctx.fill(); ctx.stroke(); ctx.restore();
    drawGlowDot(px, y, PAL.magenta, 5, 0.6 + Math.sin(t * 5 + s) * 0.3);
  }
  drawGlowDot(x, y, PAL.red, 6 + Math.sin(t * 6) * 1.5, 0.55);
  drawGlowDot(x, y, '#ffffff', 1.6, 0.9);
}

// A tear in space stretched across the whole track: shimmering strands of
// cyan light with a white-hot seam. Phase (swipe down) to slip through it.
const VEIL_X0 = laneX(0) - LANE_W / 2, VEIL_X1 = laneX(LANES - 1) + LANE_W / 2;
function drawVeil(y, phased) {
  const t = performance.now() / 1000;
  const a = phased ? 0.35 : 1;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // soft field
  const g = ctx.createLinearGradient(0, y - 22, 0, y + 22);
  g.addColorStop(0, 'rgba(25,240,255,0)'); g.addColorStop(0.5, `rgba(25,240,255,${0.22 * a})`); g.addColorStop(1, 'rgba(25,240,255,0)');
  ctx.fillStyle = g; ctx.fillRect(VEIL_X0, y - 22, VEIL_X1 - VEIL_X0, 44);
  // three wavering strands
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.strokeStyle = k === 1 ? `rgba(240,255,255,${0.95 * a})` : `rgba(25,240,255,${0.6 * a})`;
    ctx.lineWidth = k === 1 ? 1.6 : 1;
    ctx.shadowColor = PAL.cyan; ctx.shadowBlur = k === 1 ? 10 : 4;
    ctx.beginPath();
    for (let x = VEIL_X0; x <= VEIL_X1; x += 6) {
      const yy = y + (k - 1) * 4 + Math.sin(x * 0.07 + t * (6 + k * 2) + k) * 2.5;
      if (x === VEIL_X0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
  // phase chevrons (swipe down) in every lane
  if (!phased) for (let l = 0; l < LANES; l++) {
    const x = laneX(l), cy = y - 16 + Math.sin(t * 8) * 1.5;
    ctx.save(); ctx.strokeStyle = PAL.cyan; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x - 5, cy - 3); ctx.lineTo(x, cy + 2); ctx.lineTo(x + 5, cy - 3); ctx.stroke();
    ctx.restore();
  }
}

export function clearObstacles() { obstacles.length = 0; }
