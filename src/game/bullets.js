// Pooled bullets in typed arrays. No allocation in the hot loop.
// Two pools: player bullets and enemy bullets.
import * as S from '../render/shots.js';
import { W, H } from '../core/canvas.js';
import { LANE_W } from './world.js';

// Kept for run.js: the build's dominant trait no longer changes the look
// (all shots are drawn from primitives), the call stays harmless.
export function setShotLook() {}

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
    flags: new Uint16Array(max),   // player shot traits, combinable (F_*)
    shape: new Uint8Array(max),    // player shot carrier body (SH_*): how it moves and lands
  };
}

// kind flags
export const LOW = 1;       // enemy low wave: can be jumped over
export const BIG = 2;       // player echo/heavy shot, drawn bigger
// player shot looks (kind bits, bolts only): which art cell a special shot uses
export const K_DRONE = 4, K_SHARD = 8, K_ECHOLET = 64;
// Player shot traits: any combination is valid (that is the synergy engine).
export const F_EXPLODE = 1; // blast on hit (ROCKET POD)
export const F_WAVE = 2;    // weaves across neighbour lanes (SINE WAVE)
export const F_RANGE = 4;   // short range pellet (SCATTER)
export const F_ROCKET = 8;  // rocket body: accelerates, smoke trail
export const F_FISSION = 16;  // child of a FISSION split (does not split again)
export const F_FISSION2 = 32; // CASCADE: a second-generation child
export const F_TOXIC = 64;    // SPORE BURST shards: heavier poison
export const F_SLOW = 128;    // WRAITH ghost shots: slow what they hit
export const F_ECHO = 256;    // THUNDERCLAP: an echo round that bursts on its first hit
export const F_LATCH = 512;   // a larva or stinger stuck in an enemy (aux = host id, ox = time left)
// bits 10-12: RICOCHET bounce count
// Carrier bodies (v1.2): what the shot is, beyond the bolt.
export const SH_BOLT = 0, SH_GLAIVE = 1, SH_MINE = 2, SH_LARVA = 3, SH_STING = 4, SH_LOB = 5;

export const playerBullets = makePool(384);
export const enemyBullets = makePool(1024);

export function spawn(pool, x, y, vx, vy, r = 3, dmg = 1, kind = 0, pierce = 0) {
  if (pool.n >= pool.max) return -1;
  const i = pool.n++;
  pool.x[i] = x; pool.y[i] = y; pool.vx[i] = vx; pool.vy[i] = vy;
  pool.r[i] = r; pool.dmg[i] = dmg; pool.kind[i] = kind; pool.pierce[i] = pierce; pool.lastHit[i] = -1; pool.lane[i] = -1; pool.ox[i] = x; pool.aux[i] = 0; pool.flags[i] = 0; pool.shape[i] = 0;
  return i;
}

export function kill(pool, i) {
  const l = --pool.n;
  pool.x[i] = pool.x[l]; pool.y[i] = pool.y[l]; pool.vx[i] = pool.vx[l]; pool.vy[i] = pool.vy[l];
  pool.r[i] = pool.r[l]; pool.dmg[i] = pool.dmg[l]; pool.kind[i] = pool.kind[l];
  pool.pierce[i] = pool.pierce[l]; pool.lastHit[i] = pool.lastHit[l]; pool.lane[i] = pool.lane[l];
  pool.ox[i] = pool.ox[l]; pool.aux[i] = pool.aux[l]; pool.flags[i] = pool.flags[l]; pool.shape[i] = pool.shape[l];
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

// Every shot is drawn live from primitives (render/shots.js).
// alpha: how far the render frame is between the last two logic steps; shots
// are drawn back along their velocity by the time not yet simulated, so they
// glide on 90/120 Hz screens instead of stepping at 60.
const STEP = 1 / 60;
export function drawPlayerBullets(alpha = 1) {
  const p = playerBullets;
  const t = performance.now() / 1000;
  const back = (alpha - 1) * STEP;
  for (let i = 0; i < p.n; i++) {
    const vx = p.vx[i], vy = p.vy[i], r = p.r[i];
    const x = p.x[i] + vx * back, y = p.y[i] + vy * back;
    const f = p.flags[i], sh = p.shape[i];
    if (f & F_EXPLODE && !(f & F_ROCKET)) S.explosiveTag(x, y, r);
    if (sh !== SH_BOLT) { drawBody(p, i, sh, x, y, r, t); continue; }
    const k2 = p.kind[i];
    if (k2 === BIG) S.echo(x, y, r, t);
    else if (f & F_ROCKET) S.rocket(x, y, vx, vy, r, t, i);
    else if (f & F_RANGE) S.pellet(x, y, r);
    else if (f & F_WAVE) S.larvaShot(x, y, vx, vy, r, t, i);
    else if (k2 & K_DRONE) S.traitShot('drone', x, y, vx, vy, r, t, i);
    else if (k2 & K_SHARD) S.traitShot('shard', x, y, vx, vy, r, t, i);
    else if (k2 & K_ECHOLET) S.traitShot('echolet', x, y, vx, vy, r, t, i);
    else if (f & (F_FISSION | F_FISSION2)) S.traitShot('fission', x, y, vx, vy, r, t, i);
    else S.bolt(x, y, vx, vy, r, p.pierce[i] > 0);
  }
}

// v1.2 carrier bodies.
function drawBody(p, i, sh, x, y, r, t) {
  const latched = p.flags[i] & F_LATCH;
  const rot = Math.atan2(p.vx[i], -p.vy[i]);
  if (sh === SH_GLAIVE) S.glaive(x, y, Math.max(6, r + 3), t, i);
  else if (sh === SH_MINE) S.mine(x, y, Math.max(3, r), t, p.vy[i] === 0, p.aux[i]);
  else if (sh === SH_LARVA) S.grub(x, y, rot, t, i, latched);
  else if (sh === SH_STING) S.sting(x, y, rot, latched, Math.max(0, Math.min(1, p.ox[i])));
  else if (sh === SH_LOB) S.lob(x, y, r, Math.max(0, Math.min(1, (p.ox[i] - y) / Math.max(1, p.ox[i] - p.aux[i]))));
}

// layer 'low' is drawn under the player (so you visibly jump over it),
// layer 'high' on top of everything (readability rule).
export function drawEnemyBullets(layer = 'high', alpha = 1) {
  const p = enemyBullets;
  const t = performance.now() / 1000;
  const w = LANE_W * 0.86;
  const back = (alpha - 1) * STEP;
  for (let i = 0; i < p.n; i++) {
    if ((p.kind[i] === LOW) !== (layer === 'low')) continue;
    const x = p.x[i] + p.vx[i] * back, y = p.y[i] + p.vy[i] * back;
    if (p.kind[i] === LOW) S.enemyLowWave(x, y, w, t, i);
    else S.enemyOrb(x, y, p.r[i], t, i, p.vx[i], p.vy[i]);
  }
}
