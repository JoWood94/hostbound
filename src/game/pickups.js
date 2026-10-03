// Pickups: cells (the currency, and experience: lines in lanes, Subway style), hearts, blue hearts,
// corrupted items (locked items that unlock if you survive to the next boss).
import { PAL } from '../render/palette.js';
import { H } from '../core/canvas.js';
import { text } from '../render/draw.js';
import { ctx } from '../core/canvas.js';
import { capsule } from '../render/oled.js';
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
//   cell  : a dividing cell, two acid halves joined by a capsule neck that
//           pinches and refills (mitosis), each on its own phase and axis
//   heart : two capsules meeting at a round tip, beating lub-dub (red, or blue shield)
//   corrupted item: a hollow magenta ring with a glitching "?"
export function drawPickups(alpha, time) {
  for (const p of pickups) {
    const x = p.prevX + (p.x - p.prevX) * alpha;
    const y = p.prevY + (p.y - p.prevY) * alpha;
    if (p.kind === 'coin') {
      cellShape(x, y, time + y * 0.01, p.v);
    } else if (p.kind === 'heart' || p.kind === 'blue') {
      const s = 1 + lubdub(time) * 0.12;
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

// Two-beat heart pulse (lub-dub), 0..~1, period 1.1 s.
function lubdub(t) {
  const p = t % 1.1;
  return Math.exp(-(((p - 0.08) / 0.06) ** 2)) + 0.6 * Math.exp(-(((p - 0.3) / 0.06) ** 2));
}

// Cell: two halves of radius 3.8 on an axis set by v, the gap and the neck
// breathing together (apart = thin neck, together = full capsule).
function cellShape(x, y, t, v) {
  const k = 0.5 + 0.5 * Math.sin(t * 3 + v * 2);
  const d = 2.2 + k * 1.6, a = 0.5 + v;
  const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
  ctx.fillStyle = PAL.acid;
  capsule(x - dx, y - dy, x + dx, y + dy, 3.8 - k * 1.6); ctx.fill();
  ctx.beginPath(); ctx.arc(x - dx, y - dy, 3.8, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x + dx, y + dy, 3.8, 0, TAU); ctx.fill();
}

// Heart from primitives: two capsules leaning in, meeting at a round tip.
export function heartShape(x, y, s) {
  const r = s * 0.46, by = y + s * 0.5, ty = y - s * 0.22, tx = s * 0.5;
  capsule(x, by, x - tx, ty, r); ctx.fill();
  capsule(x, by, x + tx, ty, r); ctx.fill();
}

export function clearPickups() { pickups.length = 0; }
