// Pooled bullets in typed arrays. No allocation in the hot loop.
// Two pools: player bullets and enemy bullets.
import { drawGlowDot, ring, DIM } from '../render/draw.js';
import { ctx } from '../core/canvas.js';
import { boltSprite, enemyOrbSprite, lowWaveSprite, pelletSprite, rocketSprite, drawSprite } from '../render/sprites.js';
import { W, H } from '../core/canvas.js';
import { LANE_W } from './world.js';
import { COLOR_PLAYER_BULLET, COLOR_ENEMY_BULLET } from '../render/palette.js';
import { sheet, drawCell } from '../render/images.js';

// Generated shot sheet (8x2 cells). Each entry: [row, col, K] where K turns the
// bullet radius into the cell's draw size (how much of the cell the art fills).
export const SHOTS = sheet('shots_player', 96);
// v1.2 carrier bodies (scripts/pixel-shots.py shots_bio): row 0 glaive x2,
// mine, mine bursting, seed shell, seed splitting, husk, egg; row 1 maggot,
// maggot bent, maggot curled, stinger, stinger stuck, stinger hot, pop.
export const BIO = sheet('shots_bio', 96);
// Bolt looks by the build's dominant trait (shots_trait.png), set by the run.
export const TRAIT = sheet('shots_trait', 96);
let look = null;                       // [row, col] or null = the base spit/glob
export function setShotLook(cell) { look = cell; }
const S_SPIT = [0, 0, 7], S_GLOB = [0, 1, 4.6], S_PELLET = [0, 2, 12], S_ROCKET = [0, 3, 8.5],
  S_LARVA = [0, 4, 9], S_ECHO = [0, 5, 3], S_NEEDLE = [0, 6, 7.5];
function shot(spec, x, y, r, rot, flash = 0) {
  return drawCell(SHOTS, spec[0], spec[1], x, y, r * spec[2], { rot, flash });
}

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

export function drawPlayerBullets() {
  const p = playerBullets;
  const bolt = boltSprite(COLOR_PLAYER_BULLET);
  const art = SHOTS.ready;
  for (let i = 0; i < p.n; i++) {
    const rot = Math.atan2(p.vx[i], -p.vy[i]);
    const r = p.r[i];
    const k = r / 3;
    const f = p.flags[i];
    const sh = p.shape[i];
    if (f & F_EXPLODE && !(f & F_ROCKET)) drawGlowDot(p.x[i], p.y[i], '#ffd27a', r + 2, 0.45);
    if (sh !== SH_BOLT) { drawBody(p, i, sh, r, rot, art); continue; }
    if (p.kind[i] === BIG) {
      drawGlowDot(p.x[i], p.y[i], COLOR_PLAYER_BULLET, r, 0.6);
      if (!(art && shot(S_ECHO, p.x[i], p.y[i], r, rot, 0.3))) drawSprite(bolt, p.x[i], p.y[i], { rot, sx: k, sy: k, flash: 0.5 });
    } else if (f & F_ROCKET) {
      if (art) shot(S_ROCKET, p.x[i], p.y[i], r, rot);
      else {
        const sp = Math.hypot(p.vx[i], p.vy[i]);
        const tx = -p.vx[i] / sp, ty = -p.vy[i] / sp;
        for (let s2 = 1; s2 <= 3; s2++) drawGlowDot(p.x[i] + tx * 7 * s2, p.y[i] + ty * 7 * s2, s2 === 1 ? '#ffffff' : COLOR_PLAYER_BULLET, 3 - s2 * 0.6, 0.8 - s2 * 0.2);
        drawSprite(rocketSprite(), p.x[i], p.y[i], { rot });
      }
    } else if (f & F_RANGE) {
      if (!(art && shot(S_PELLET, p.x[i], p.y[i], r, rot))) drawSprite(pelletSprite(), p.x[i], p.y[i], { sx: k, sy: k });
    } else if (f & F_WAVE) {
      // the larva lies sideways in the sheet: turn it so its head leads
      if (!(art && shot(S_LARVA, p.x[i], p.y[i], r, rot - Math.PI / 2))) {
        drawGlowDot(p.x[i], p.y[i], COLOR_PLAYER_BULLET, r + 1.5, 0.55);
        drawGlowDot(p.x[i], p.y[i], '#ffffff', r * 0.5);
      }
    } else if (art) {
      // Isaac-style: the shot's look follows its size, and size follows damage;
      // with a dominant trait it takes that trait's look (shots_trait.png)
      const k2 = p.kind[i];
      const cell = k2 & K_DRONE ? [1, 2] : k2 & K_SHARD ? [1, 3] : k2 & K_ECHOLET ? [1, 5]
        : f & (F_FISSION | F_FISSION2) ? [1, 4] : p.pierce[i] > 0 ? null : look;
      if (cell && TRAIT.ready) drawCell(TRAIT, cell[0], cell[1], p.x[i], p.y[i], r * 7.5, { rot });
      else shot(p.pierce[i] > 0 ? S_NEEDLE : r >= 5 ? S_GLOB : S_SPIT, p.x[i], p.y[i], r, rot);
    } else {
      drawSprite(bolt, p.x[i], p.y[i], { rot, sx: k, sy: k });
    }
  }
}

// v1.2 carrier bodies. Vector art until their sprites exist (ART_PROMPTS.md).
function drawBody(p, i, sh, r, rot, art) {
  const x = p.x[i], y = p.y[i], t = performance.now() / 1000;
  const C = COLOR_PLAYER_BULLET;
  if (BIO.ready) { drawBodySprite(p, i, sh, x, y, rot, t); return; }
  if (sh === SH_GLAIVE) {
    // a spinning three-bladed bone disc
    drawGlowDot(x, y, C, r + 3, 0.35);
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 18 + i);
    ctx.strokeStyle = C; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.95 * DIM;
    for (let k = 0; k < 3; k++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(r * 1.1, -r * 0.4, r * 1.5, r * 0.5); ctx.stroke();
    }
    ctx.restore();
    drawGlowDot(x, y, '#f4ffd8', 2);
  } else if (sh === SH_MINE) {
    // a spore pod: pulses faster as its fuse runs out once armed
    const armed = p.vy[i] === 0;
    const pulse = armed ? 0.6 + 0.4 * Math.sin(t * (8 + p.aux[i] * 10)) : 0.8;
    drawGlowDot(x, y, C, r + 4 * pulse, 0.3 + 0.3 * pulse);
    ring(x, y, r + 1, C, 1.5, 0.9);
    drawGlowDot(x, y, '#f4ffd8', r * 0.45);
  } else if (sh === SH_LARVA) {
    // a segmented grub: head first while it hunts, curled and chewing once latched
    const latched = p.flags[i] & F_LATCH;
    const ang = latched ? t * 3 + i : rot - Math.PI / 2;
    const seg = 4, len = 3.2;
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    for (let k = seg - 1; k >= 0; k--) {
      const wig = Math.sin(t * 16 + k * 1.3 + i) * (latched ? 2.2 : 1.4);
      const sx = latched ? Math.cos(k * 0.9) * 4 : -k * len, sy = latched ? Math.sin(k * 0.9) * 4 : wig;
      const rr = 2.6 - k * 0.35;
      ctx.fillStyle = '#07040a'; ctx.beginPath(); ctx.arc(sx, sy, rr + 1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = k === 0 ? '#f4ffd8' : C; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, Math.PI * 2); ctx.fill();
    }
    // mandibles
    ctx.strokeStyle = C; ctx.lineWidth = 1.2;
    const bite = Math.sin(t * (latched ? 30 : 12) + i) * 0.5;
    const hx = latched ? 4 : 0, hy = 0;
    ctx.beginPath(); ctx.moveTo(hx + 2, hy - 1); ctx.lineTo(hx + 5, hy - 2.5 - bite); ctx.moveTo(hx + 2, hy + 1); ctx.lineTo(hx + 5, hy + 2.5 + bite); ctx.stroke();
    ctx.restore();
    if (latched) drawGlowDot(x, y, C, 7, 0.25 + 0.15 * Math.sin(t * 20 + i));
  } else if (sh === SH_STING) {
    const latched = p.flags[i] & F_LATCH;
    if (latched) {
      // stuck in its host, barb up; the fuse ring tightens and turns orange
      const left = Math.max(0, Math.min(1, p.ox[i]));
      const hot = 1 - left;
      ring(x, y, 8 + 12 * left, hot > 0.6 ? '#ffd27a' : C, 2.2, 0.6 + 0.4 * hot);
      drawGlowDot(x, y, '#ffd27a', 4 + 7 * hot + Math.sin(t * 40) * 2 * hot, 0.4 + 0.5 * hot);
      needle(x, y + 9, -Math.PI / 2, 16, C);
    } else {
      drawGlowDot(x, y, C, r + 2.5, 0.4);
      needle(x, y, rot - Math.PI / 2, 15, C);
    }
  } else if (sh === SH_LOB) {
    // in flight it rises toward the camera (bigger) and falls onto its target row
    const k = Math.max(0, Math.min(1, (p.ox[i] - y) / Math.max(1, p.ox[i] - p.aux[i])));
    const lift = 1 + 0.9 * Math.sin(Math.PI * k);
    drawGlowDot(x, y + 10 * Math.sin(Math.PI * k), '#000000', r * 0.8, 0.25);   // shadow
    if (!(art && shot(S_GLOB, x, y, r * lift, rot))) drawGlowDot(x, y, C, r * lift, 0.9);
  }
}

// The pixel-art bodies (shots_bio.png). Readability cues that are not art
// (a stinger's fuse ring) stay drawn on top.
function drawBodySprite(p, i, sh, x, y, rot, t) {
  const latched = p.flags[i] & F_LATCH;
  if (sh === SH_GLAIVE) {
    drawGlowDot(x, y, COLOR_PLAYER_BULLET, 9, 0.25);
    drawCell(BIO, 0, Math.floor(t * 20 + i) % 2, x, y, 27, { rot: t * 14 + i });
  } else if (sh === SH_MINE) {
    const armed = p.vy[i] === 0;
    const late = armed && (Math.floor(t * (6 + p.aux[i] * 8)) % 2 === 0 || p.aux[i] > 1.5);
    drawCell(BIO, 0, late ? 3 : 2, x, y, 30);
  } else if (sh === SH_LARVA) {
    if (latched) drawCell(BIO, 1, 2, x, y, 20, { rot: Math.sin(t * 3 + i) * 0.6 });
    else {
      const f = Math.floor(t * 8 + i) % 4;   // straight, bent, straight, bent the other way
      drawCell(BIO, 1, f % 2, x, y, 20, { rot, sx: f === 3 ? -1 : 1 });
    }
  } else if (sh === SH_STING) {
    if (latched) {
      const left = Math.max(0, Math.min(1, p.ox[i]));
      ring(x, y, 8 + 12 * left, left < 0.4 ? '#ffd27a' : COLOR_PLAYER_BULLET, 2.2, 0.6 + 0.4 * (1 - left));
      drawCell(BIO, 1, left < 0.4 ? 5 : 4, x, y + 6, 22);
    } else drawCell(BIO, 1, 3, x, y, 22, { rot });
  } else if (sh === SH_LOB) {
    const k = Math.max(0, Math.min(1, (p.ox[i] - y) / Math.max(1, p.ox[i] - p.aux[i])));
    const lift = 1 + 0.8 * Math.sin(Math.PI * k);
    drawGlowDot(x, y + 10 * Math.sin(Math.PI * k), '#000000', 5, 0.3);   // shadow on the track
    drawCell(BIO, 0, 4, x, y, 26 * lift);
  }
}

// A barbed bone needle pointing along `ang` (0 = right), tip at x, y.
function needle(x, y, ang, len, C) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.strokeStyle = '#07040a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len, 0); ctx.stroke();
  ctx.strokeStyle = C; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-len, 0); ctx.stroke();
  ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(-6, -3); ctx.moveTo(-3, 0); ctx.lineTo(-6, 3); ctx.stroke();
  ctx.fillStyle = '#f4ffd8'; ctx.beginPath(); ctx.arc(0, 0, 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// layer 'low' is drawn under the player (so you visibly jump over it),
// layer 'high' on top of everything (readability rule).
export function drawEnemyBullets(layer = 'high') {
  const p = enemyBullets;
  const wave = lowWaveSprite(Math.round(LANE_W * 0.86));
  for (let i = 0; i < p.n; i++) {
    if ((p.kind[i] === LOW) !== (layer === 'low')) continue;
    if (p.kind[i] === LOW) drawSprite(wave, p.x[i], p.y[i]);
    else {
      // a dark halo cuts every enemy shot out of whatever glows behind it
      drawGlowDot(p.x[i], p.y[i], '#000000', p.r[i] + 4, 0.9);
      drawSprite(enemyOrbSprite(COLOR_ENEMY_BULLET, p.r[i]), p.x[i], p.y[i]);
    }
  }
}
