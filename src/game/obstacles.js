// Runner obstacles, placed in lanes and scrolling with the world.
//   low  : knee-high barrier, jump over it (orange, like low waves)
//   wall : full-height block, change lane (magenta)
// A "gate" is a row of walls with one open lane.
import { ctx } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { line, strokePoly } from '../render/draw.js';
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
    if (o.y > 700 || o.dead) { obstacles.splice(i, 1); i--; }
  }
}

export const OB_H = { low: 14, wall: 30 };

export function drawObstacles(alpha) {
  const hw = LANE_W * 0.42;
  for (const o of obstacles) {
    if (o.dead) continue;
    const y = o.prevY + (o.y - o.prevY) * alpha;
    const x = o.x;
    const h = OB_H[o.type];
    if (o.type === 'low') {
      ctx.fillStyle = 'rgba(255,106,0,0.18)';
      ctx.fillRect(x - hw, y - h / 2, hw * 2, h);
      ctx.strokeStyle = PAL.orange;
      ctx.lineWidth = 2;
      ctx.strokeRect(x - hw, y - h / 2, hw * 2, h);
      // hazard stripes
      for (let k = -hw + 6; k < hw; k += 10) line(x + k, y + h / 2, x + k + 6, y - h / 2, PAL.orange, 1.5, 0.7);
      // up-arrow glyph: jump
      strokePoly([x - 5, y - h / 2 - 4, x, y - h / 2 - 10, x + 5, y - h / 2 - 4], PAL.orange, 2, false);
    } else {
      ctx.fillStyle = 'rgba(255,43,214,0.22)';
      ctx.fillRect(x - hw, y - h / 2, hw * 2, h);
      ctx.strokeStyle = PAL.magenta;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(x - hw, y - h / 2, hw * 2, h);
      line(x - hw, y - h / 2, x + hw, y + h / 2, PAL.magenta, 1.5, 0.8);
      line(x + hw, y - h / 2, x - hw, y + h / 2, PAL.magenta, 1.5, 0.8);
    }
  }
}

export function clearObstacles() { obstacles.length = 0; }
