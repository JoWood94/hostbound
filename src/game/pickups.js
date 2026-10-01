// Pickups: cells (the currency, and experience: lines in lanes, Subway style), hearts, blue hearts,
// corrupted items (locked items that unlock if you survive to the next boss).
import { PAL } from '../render/palette.js';
import { H } from '../core/canvas.js';
import { drawGlowDot, ring, text, strokePoly } from '../render/draw.js';
import { laneX } from './world.js';
import { cellSprite, heartSprite, drawSprite } from '../render/sprites.js';

export const pickups = [];

export function spawnPickup(kind, lane, y, extra = {}) {
  const x = laneX(lane);
  pickups.push({ kind, lane, x, y, prevX: x, prevY: y, fly: false, t: 0, dead: false, v: Math.floor(Math.random() * 3), ...extra });
}

// Coins dropped by kills fly straight to the player.
export function dropCoins(x, y, n) {
  for (let i = 0; i < n; i++) {
    pickups.push({ kind: 'coin', v: Math.floor(Math.random() * 3), lane: -1, x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20,
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
    if (p.y > H + 60) { pickups.splice(i, 1); i--; }
  }
  return got;
}

export function drawPickups(alpha, time) {
  for (const p of pickups) {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    if (p.kind === 'coin') {
      // cells breathe instead of spinning
      const b = 1 + Math.sin(time * 6 + y * 0.05) * 0.08;
      drawSprite(cellSprite(p.v), x, y, { sx: b, sy: 2 - b, rot: Math.sin(time * 2 + p.v) * 0.3 });
    } else if (p.kind === 'heart' || p.kind === 'blue') {
      const c = p.kind === 'heart' ? PAL.red : PAL.blue;
      const pulse = 1 + Math.sin(time * 8) * 0.08;
      drawGlowDot(x, y, c, 9, 0.35);
      drawSprite(heartSprite(c), x, y, { sx: pulse, sy: pulse });
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
