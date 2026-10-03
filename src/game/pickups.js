// Pickups: cells (the currency, and experience: lines in lanes, Subway style), hearts, blue hearts,
// corrupted items (locked items that unlock if you survive to the next boss).
import { PAL } from '../render/palette.js';
import { H } from '../core/canvas.js';
import { text } from '../render/draw.js';
import { ctx } from '../core/canvas.js';
import { rtri } from '../render/oled.js';
const TAU = Math.PI * 2;
import { laneX } from './world.js';

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

// Pickups from primitives, flat colour, no glow; motion is all easing.
//   cell  : one flat acid disc that breathes (no nucleus, no shade)
//   heart : two circles and a rounded triangle, pulsing (red, or blue shield)
//   corrupted item: a hollow magenta ring with a glitching "?"
export function drawPickups(alpha, time) {
  for (const p of pickups) {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    if (p.kind === 'coin') {
      const r = 5.2 * (1 + Math.sin(time * 5 + p.v * 2.1 + y * 0.03) * 0.1);
      ctx.fillStyle = PAL.acid;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    } else if (p.kind === 'heart' || p.kind === 'blue') {
      const s = 1 + Math.sin(time * 8) * 0.08;
      ctx.fillStyle = p.kind === 'heart' ? PAL.red : PAL.blue;
      heartShape(x, y, 8 * s);
    } else if (p.kind === 'corrupt') {
      const j = Math.sin(time * 37) > 0.7 ? 2 : 0;
      ctx.strokeStyle = PAL.magenta; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.stroke();
      text('?', x + j, y, { color: PAL.white, size: 13, align: 'center', font: 'display' });
    }
  }
}

// Heart from primitives: two circles on a rounded triangle pointing down.
export function heartShape(x, y, s) {
  const r = s * 0.52;
  ctx.beginPath(); ctx.arc(x - r * 0.95, y - r * 0.35, r, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + r * 0.95, y - r * 0.35, r, 0, TAU); ctx.fill();
  rtri(x, y + s * 0.05, s * 1.05, 0); ctx.fill();
}

export function clearPickups() { pickups.length = 0; }
