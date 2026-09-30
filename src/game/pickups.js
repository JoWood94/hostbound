// Pickups: coins (lines in lanes, Subway style), hearts, blue hearts,
// corrupted items (locked items that unlock if you survive to the next boss).
import { PAL } from '../render/palette.js';
import { drawGlowDot, ring, text, strokePoly } from '../render/draw.js';
import { laneX } from './world.js';

export const pickups = [];

export function spawnPickup(kind, lane, y, extra = {}) {
  const x = laneX(lane);
  pickups.push({ kind, lane, x, y, prevX: x, prevY: y, fly: false, t: 0, dead: false, ...extra });
}

export function spawnCoinLine(lane, count, startY = -20, gap = 26) {
  for (let i = 0; i < count; i++) spawnPickup('coin', lane, startY - i * gap);
}

// Coins dropped by kills fly straight to the player.
export function dropCoins(x, y, n) {
  for (let i = 0; i < n; i++) {
    pickups.push({ kind: 'coin', lane: -1, x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20,
      prevX: x, prevY: y, fly: true, t: -i * 0.05, dead: false });
  }
}

// Returns collected pickups this step.
export function updatePickups(dt, speed, player, playerY, magnetLanes) {
  const got = [];
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i];
    p.prevX = p.x; p.prevY = p.y;
    p.t += dt;
    if (!p.fly) {
      p.y += speed * dt;
      // Magnet: coins in lanes within range get pulled once close enough
      if (p.kind === 'coin' && magnetLanes > 0 && Math.abs(p.lane - player.lane) <= magnetLanes && p.y > playerY - 160 && p.y < playerY + 10) {
        p.fly = true;
      }
    } else if (p.t > 0) {
      const dx = player.x - p.x, dy = playerY - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = 520 + p.t * 600;
      p.x += (dx / d) * s * dt;
      p.y += (dy / d) * s * dt;
    }
    const cx = player.x - p.x, cy = playerY - p.y;
    const reach = p.fly ? 14 : 20;
    if (Math.abs(cx) < reach && Math.abs(cy) < reach) {
      got.push(p);
      pickups.splice(i, 1); i--;
      continue;
    }
    if (p.y > 700) { pickups.splice(i, 1); i--; }
  }
  return got;
}

export function drawPickups(alpha, time) {
  for (const p of pickups) {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    if (p.kind === 'coin') {
      const w = Math.abs(Math.sin(time * 6 + y * 0.05)) * 4 + 1.5;
      drawGlowDot(x, y, PAL.acid, 4, 0.5);
      strokePoly([x, y - 5, x + w, y, x, y + 5, x - w, y], PAL.acid, 1.5);
    } else if (p.kind === 'heart' || p.kind === 'blue') {
      const c = p.kind === 'heart' ? PAL.red : PAL.blue;
      drawGlowDot(x, y, c, 7, 0.6 + Math.sin(time * 8) * 0.3);
      strokePoly([x, y - 4, x + 5, y - 8, x + 9, y - 4, x, y + 6, x - 9, y - 4, x - 5, y - 8], c, 2);
    } else if (p.kind === 'corrupt') {
      const j = (Math.random() - 0.5) * 3;
      drawGlowDot(x, y, PAL.magenta, 9, 0.5);
      ring(x + j, y, 12, PAL.cyan, 2, 0.8);
      ring(x - j, y, 12, PAL.magenta, 2, 0.8);
      text('??', x + j, y, { color: PAL.white, size: 10, align: 'center' });
    }
  }
}

export function clearPickups() { pickups.length = 0; }
