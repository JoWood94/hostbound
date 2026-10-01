// Runner obstacles, placed in lanes and scrolling with the world.
//   low  : knee-high barrier, jump over it (orange, like low waves)
//   wall : full-height block, change lane (magenta)
// A "gate" is a row of walls with one open lane.
import { PAL } from '../render/palette.js';
import { H } from '../core/canvas.js';
import { drawGlowDot } from '../render/draw.js';
import { obstacleSprite, drawSprite } from '../render/sprites.js';
import { LANES, LANE_W, laneX } from './world.js';
import { sheet, drawCell } from '../render/images.js';

// Generated rocks (scripts/import-obstacles.py): row 0 low variants, row 1 walls.
const ROCKS = sheet('obstacles', 128);
const VARIANTS = { low: 2, wall: 3 };

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

export const OB_H = { low: 14, wall: 30 };

export function drawObstacles(alpha) {
  const w = Math.round(LANE_W * 0.84);
  for (const o of obstacles) {
    if (o.dead) continue;
    const y = o.prevY + (o.y - o.prevY) * alpha;
    if (ROCKS.ready) {
      const wall = o.type === 'wall';
      // colour-coded halo under the rock: orange = jump it, magenta = dodge it
      drawGlowDot(o.x, y, wall ? PAL.magenta : PAL.orange, wall ? 30 : 22, wall ? 0.32 : 0.18);
      drawCell(ROCKS, wall ? 1 : 0, o.v, o.x, y, LANE_W * (wall ? 1.02 : 1.0), { rot: wall ? o.rot : 0 });
      continue;
    }
    drawSprite(obstacleSprite(o.type, w), o.x, y);
    // Blinking beacon on walls
    if (o.type === 'wall' && Math.floor((o.y + o.x) / 40) % 2 === 0) drawGlowDot(o.x, y - 9, PAL.red, 3, 0.8);
  }
}

export function clearObstacles() { obstacles.length = 0; }
