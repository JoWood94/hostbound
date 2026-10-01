// Runner obstacles, placed in lanes and scrolling with the world.
//   low  : knee-high barrier, jump over it (orange, like low waves)
//   wall : full-height block, change lane (magenta)
//   veil : a rift curtain across ALL lanes, cannot be dodged or jumped: PHASE
//          through it (cyan, the phase colour)
// A "gate" is a row of walls with one open lane.
import { PAL } from '../render/palette.js';
import { drawGlowDot } from '../render/draw.js';
import { ctx, W, H } from '../core/canvas.js';
import { obstacleSprite, drawSprite } from '../render/sprites.js';
import { LANES, LANE_W, laneX } from './world.js';
import { sheet, drawCell } from '../render/images.js';

// Generated rocks (scripts/import-obstacles.py): row 0 low variants, row 1 walls.
const ROCKS = sheet('obstacles', 128);
const VARIANTS = { low: 2, wall: 3, veil: 1 };

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

export const OB_H = { low: 14, wall: 30, veil: 10 };

export function spawnVeil(y = -30) {
  spawnObstacle('veil', 2, y);
}

export function drawObstacles(alpha) {
  const w = Math.round(LANE_W * 0.84);
  for (const o of obstacles) {
    if (o.dead) continue;
    const y = o.prevY + (o.y - o.prevY) * alpha;
    if (o.type === 'veil') { drawVeil(y, o.phased); continue; }
    if (ROCKS.ready) {
      const wall = o.type === 'wall';
      // colour-coded halo under the rock: orange = jump it, magenta = dodge it
      if (wall) drawGlowDot(o.x, y, PAL.magenta, 30, 0.32);
      drawCell(ROCKS, wall ? 1 : 0, o.v, o.x, y, LANE_W * (wall ? 1.02 : 1.0), { rot: wall ? o.rot : 0 });
      if (!wall) neonTube(o.x, y, LANE_W * 0.8, o.v);
      continue;
    }
    drawSprite(obstacleSprite(o.type, w), o.x, y);
    // Blinking beacon on walls
    if (o.type === 'wall' && Math.floor((o.y + o.x) / 40) % 2 === 0) drawGlowDot(o.x, y - 9, PAL.red, 3, 0.8);
  }
}

// Low rocks carry a neon tripwire: a bent glass tube stretched across the
// lane, orange like every other "jump over it" signal. Japan neon, not lava.
function neonTube(x, y, w, v) {
  const t = performance.now() / 1000;
  const flick = Math.sin(t * 17 + x) > 0.97 ? 0.4 : 1;
  const hw = w / 2, k = v ? 3 : -3;             // two bends, one per variant
  const pts = [x - hw, y + 2, x - hw * 0.35, y + k, x + hw * 0.35, y - k, x + hw, y + 2];
  ctx.save();
  ctx.globalAlpha = flick;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [col, lw, blur] of [[PAL.orange, 5, 14], [PAL.orange, 2.6, 6], ['#fff1e0', 1, 0]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.shadowColor = PAL.orange; ctx.shadowBlur = blur;
    ctx.beginPath(); ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    ctx.stroke();
  }
  ctx.restore();
  // mounting clips at the ends
  drawGlowDot(x - hw, y + 2, '#ffffff', 1.6, 0.9 * flick);
  drawGlowDot(x + hw, y + 2, '#ffffff', 1.6, 0.9 * flick);
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
