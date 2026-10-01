// Runner obstacles, placed in lanes and scrolling with the world.
//   low  : knee-high barrier, jump over it (orange, like low waves)
//   wall : full-height block, change lane (magenta)
// A "gate" is a row of walls with one open lane.
import { PAL } from '../render/palette.js';
import { H } from '../core/canvas.js';
import { drawGlowDot } from '../render/draw.js';
import { obstacleSprite, drawSprite } from '../render/sprites.js';
import { LANES, LANE_W, laneX } from './world.js';

export const obstacles = [];

export function spawnObstacle(type, lane, y = -30) {
  obstacles.push({ type, lane, x: laneX(lane), y, prevY: y, hit: false, passed: false, jumped: false, dead: false });
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
    drawSprite(obstacleSprite(o.type, w), o.x, y);
    // Blinking beacon on walls
    if (o.type === 'wall' && Math.floor((o.y + o.x) / 40) % 2 === 0) drawGlowDot(o.x, y - 9, PAL.red, 3, 0.8);
  }
}

export function clearObstacles() { obstacles.length = 0; }
