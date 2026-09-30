// Pooled bullets in typed arrays. No allocation in the hot loop.
// Two pools: player bullets and enemy bullets.
import { drawGlowDot, line } from '../render/draw.js';
import { W, H } from '../core/canvas.js';
import { LANE_W } from './world.js';
import { COLOR_PLAYER_BULLET, COLOR_ENEMY_BULLET, COLOR_ENEMY_BULLET_ALT, PAL } from '../render/palette.js';

function makePool(max) {
  return {
    max,
    n: 0,
    x: new Float32Array(max),
    y: new Float32Array(max),
    vx: new Float32Array(max),
    vy: new Float32Array(max),
    r: new Float32Array(max),
    dmg: new Float32Array(max),
    kind: new Uint8Array(max),     // enemy: 0 normal, LOW; player: 0 normal, BIG
    pierce: new Uint8Array(max),   // remaining enemies this bullet can pass through
    lastHit: new Int32Array(max),  // id of last enemy hit, avoids double hits while piercing
  };
}

// kind flags
export const LOW = 1;       // enemy low wave: can be jumped over
export const BIG = 2;       // player echo/heavy shot, drawn bigger

export const playerBullets = makePool(384);
export const enemyBullets = makePool(1024);

export function spawn(pool, x, y, vx, vy, r = 3, dmg = 1, kind = 0, pierce = 0) {
  if (pool.n >= pool.max) return -1;
  const i = pool.n++;
  pool.x[i] = x; pool.y[i] = y; pool.vx[i] = vx; pool.vy[i] = vy;
  pool.r[i] = r; pool.dmg[i] = dmg; pool.kind[i] = kind; pool.pierce[i] = pierce; pool.lastHit[i] = -1;
  return i;
}

export function kill(pool, i) {
  const l = --pool.n;
  pool.x[i] = pool.x[l]; pool.y[i] = pool.y[l]; pool.vx[i] = pool.vx[l]; pool.vy[i] = pool.vy[l];
  pool.r[i] = pool.r[l]; pool.dmg[i] = pool.dmg[l]; pool.kind[i] = pool.kind[l];
  pool.pierce[i] = pool.pierce[l]; pool.lastHit[i] = pool.lastHit[l];
}

const MARGIN = 40;
export function updatePool(pool, dt) {
  for (let i = 0; i < pool.n; i++) {
    pool.x[i] += pool.vx[i] * dt;
    pool.y[i] += pool.vy[i] * dt;
    if (pool.x[i] < -MARGIN || pool.x[i] > W + MARGIN || pool.y[i] < -MARGIN || pool.y[i] > H + MARGIN) {
      kill(pool, i); i--;
    }
  }
}

export function clearPool(pool) { pool.n = 0; }

export function drawPlayerBullets() {
  const p = playerBullets;
  for (let i = 0; i < p.n; i++) {
    if (p.kind[i] === BIG) {
      drawGlowDot(p.x[i], p.y[i], COLOR_PLAYER_BULLET, p.r[i], 0.7);
      drawGlowDot(p.x[i], p.y[i], PAL.white, p.r[i] * 0.5);
    } else {
      drawGlowDot(p.x[i], p.y[i], COLOR_PLAYER_BULLET, p.r[i]);
    }
  }
}

export function drawEnemyBullets() {
  const p = enemyBullets;
  for (let i = 0; i < p.n; i++) {
    if (p.kind[i] === LOW) {
      // Low wave: flat bar across the lane, reads as "jump over me"
      const hw = LANE_W * 0.42;
      line(p.x[i] - hw, p.y[i], p.x[i] + hw, p.y[i], COLOR_ENEMY_BULLET_ALT, 5, 0.9);
      line(p.x[i] - hw, p.y[i], p.x[i] + hw, p.y[i], '#fff', 1.5, 0.8);
    } else {
      drawGlowDot(p.x[i], p.y[i], COLOR_ENEMY_BULLET, p.r[i]);
    }
  }
}
