// Pooled bullets in typed arrays. No allocation in the hot loop.
// Two pools: player bullets and enemy bullets.
import { drawGlowDot } from '../render/draw.js';
import { boltSprite, enemyOrbSprite, lowWaveSprite, pelletSprite, rocketSprite, drawSprite } from '../render/sprites.js';
import { W, H } from '../core/canvas.js';
import { LANE_W } from './world.js';
import { COLOR_PLAYER_BULLET, COLOR_ENEMY_BULLET } from '../render/palette.js';

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
    lane: new Int8Array(max),      // player bullets: lane fired from (homing range), -1 = no homing
    ox: new Float32Array(max),     // mode data: sine base x / pellet start y
    aux: new Float32Array(max),    // mode data: sine phase
  };
}

// kind flags
export const LOW = 1;       // enemy low wave: can be jumped over
export const BIG = 2;       // player echo/heavy shot, drawn bigger
export const PELLET = 3;    // scatter pellet, short range
export const ROCKET = 4;    // rocket pod, accelerates, explodes
export const SINE = 5;      // sine wave strand

export const playerBullets = makePool(384);
export const enemyBullets = makePool(1024);

export function spawn(pool, x, y, vx, vy, r = 3, dmg = 1, kind = 0, pierce = 0) {
  if (pool.n >= pool.max) return -1;
  const i = pool.n++;
  pool.x[i] = x; pool.y[i] = y; pool.vx[i] = vx; pool.vy[i] = vy;
  pool.r[i] = r; pool.dmg[i] = dmg; pool.kind[i] = kind; pool.pierce[i] = pierce; pool.lastHit[i] = -1; pool.lane[i] = -1; pool.ox[i] = x; pool.aux[i] = 0;
  return i;
}

export function kill(pool, i) {
  const l = --pool.n;
  pool.x[i] = pool.x[l]; pool.y[i] = pool.y[l]; pool.vx[i] = pool.vx[l]; pool.vy[i] = pool.vy[l];
  pool.r[i] = pool.r[l]; pool.dmg[i] = pool.dmg[l]; pool.kind[i] = pool.kind[l];
  pool.pierce[i] = pool.pierce[l]; pool.lastHit[i] = pool.lastHit[l]; pool.lane[i] = pool.lane[l];
  pool.ox[i] = pool.ox[l]; pool.aux[i] = pool.aux[l];
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
  const bolt = boltSprite(COLOR_PLAYER_BULLET);
  for (let i = 0; i < p.n; i++) {
    const rot = Math.atan2(p.vx[i], -p.vy[i]);
    const k = p.r[i] / 3;
    const kind = p.kind[i];
    if (kind === BIG) {
      drawGlowDot(p.x[i], p.y[i], COLOR_PLAYER_BULLET, p.r[i], 0.6);
      drawSprite(bolt, p.x[i], p.y[i], { rot, sx: k, sy: k, flash: 0.5 });
    } else if (kind === PELLET) {
      drawSprite(pelletSprite(), p.x[i], p.y[i], { sx: k, sy: k });
    } else if (kind === ROCKET) {
      const sp = Math.hypot(p.vx[i], p.vy[i]);
      const tx = -p.vx[i] / sp, ty = -p.vy[i] / sp;
      for (let s2 = 1; s2 <= 3; s2++) drawGlowDot(p.x[i] + tx * 7 * s2, p.y[i] + ty * 7 * s2, s2 === 1 ? '#ffffff' : COLOR_PLAYER_BULLET, 3 - s2 * 0.6, 0.8 - s2 * 0.2);
      drawSprite(rocketSprite(), p.x[i], p.y[i], { rot });
    } else if (kind === SINE) {
      drawGlowDot(p.x[i], p.y[i], COLOR_PLAYER_BULLET, p.r[i] + 1.5, 0.55);
      drawGlowDot(p.x[i], p.y[i], '#ffffff', p.r[i] * 0.5);
    } else {
      drawSprite(bolt, p.x[i], p.y[i], { rot, sx: k, sy: k });
    }
  }
}

// layer 'low' is drawn under the player (so you visibly jump over it),
// layer 'high' on top of everything (readability rule).
export function drawEnemyBullets(layer = 'high') {
  const p = enemyBullets;
  const wave = lowWaveSprite(Math.round(LANE_W * 0.86));
  for (let i = 0; i < p.n; i++) {
    if ((p.kind[i] === LOW) !== (layer === 'low')) continue;
    if (p.kind[i] === LOW) drawSprite(wave, p.x[i], p.y[i]);
    else drawSprite(enemyOrbSprite(COLOR_ENEMY_BULLET, p.r[i]), p.x[i], p.y[i]);
  }
}
