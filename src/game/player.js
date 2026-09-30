import { H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, fillPoly, drawGlowDot, ring } from '../render/draw.js';
import { burst, shake, hitStop } from '../render/fx.js';
import { LANES, laneX } from './world.js';

export const PLAYER_Y = H * 0.78;
const HALF_W = 12;
const LANE_TIME = 0.11;   // seconds for a lane hop, fixed: discrete, never follows the finger
const ORBIT_R = 28;

export function makePlayer(stats, color = PAL.cyan) {
  const lane = Math.floor(LANES / 2);
  return {
    lane,
    laneT: 1,
    x: laneX(lane),
    laneFromX: laneX(lane),
    bump: 0,
    prevX: laneX(lane),
    color,
    r: 7,                 // hurt radius
    hearts: stats.maxHearts,
    blueHearts: stats.blueStart,
    shield: stats.barrier,
    shieldT: 0,           // time since last hit, for barrier regen
    iframes: 0,
    fireTimer: 0,
    shotCount: 0,
    jumpT: 0,
    jumpDur: stats.jumpTime,
    phaseT: 0,
    phaseCd: 0,
    orbitA: 0,
    glitch: 0,
    dead: false,
    ev: {},               // one-frame events for audio/stats
    trail: new Float32Array(24),
    trailI: 0,
  };
}

export function updatePlayer(p, input, dt, stats) {
  p.prevX = p.x;
  p.ev = {};

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    const next = Math.max(0, Math.min(LANES - 1, p.lane + dir));
    if (next !== p.lane) {
      p.laneFromX = p.x;
      p.lane = next;
      p.laneT = 0;
      p.ev.lane = true;
    } else {
      p.bump = 0.12 * dir;
    }
  }
  if (p.laneT < 1) {
    p.laneT = Math.min(1, p.laneT + dt / LANE_TIME);
    const e = 1 - (1 - p.laneT) * (1 - p.laneT);
    p.x = p.laneFromX + (laneX(p.lane) - p.laneFromX) * e;
  } else {
    p.x = laneX(p.lane);
  }
  if (p.bump) { p.bump *= 0.7; if (Math.abs(p.bump) < 0.005) p.bump = 0; }

  // Jump
  if (p.jumpT > 0) {
    p.jumpT -= dt;
    if (p.jumpT <= 0) { p.jumpT = 0; p.ev.land = true; }
  } else if (input.jump && stats.canJump) {
    p.jumpDur = stats.jumpTime;
    p.jumpT = p.jumpDur;
    p.ev.jump = true;
  }

  // Phase: brief invulnerability in place
  if (p.phaseCd > 0) p.phaseCd -= dt;
  if (p.phaseT > 0) p.phaseT -= dt;
  else if (input.phase && p.phaseCd <= 0) {
    p.phaseT = stats.phaseTime;
    p.phaseCd = stats.phaseCd;
    p.iframes = Math.max(p.iframes, stats.phaseTime);
    p.ev.phase = true;
    burst(p.x, PLAYER_Y, PAL.cyan, 10, 140, 0.3, 2);
  }

  if (p.iframes > 0) p.iframes -= dt;
  if (p.glitch > 0) p.glitch = Math.max(0, p.glitch - dt * 2.5);

  // Barrier regen
  p.shieldT += dt;
  if (p.shield < stats.barrier && p.shieldT >= stats.barrierRegen) {
    p.shield++;
    p.shieldT = 0;
    p.ev.shield = true;
  }

  p.orbitA += dt * 3.2;

  p.trail[p.trailI] = p.x;
  p.trailI = (p.trailI + 1) % p.trail.length;
}

export function isAirborne(p) { return p.jumpT > 0; }
export function isPhased(p) { return p.phaseT > 0; }

export function orbitalPositions(p, n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = p.orbitA + (k / n) * Math.PI * 2;
    out.push({ x: p.x + Math.cos(a) * ORBIT_R, y: PLAYER_Y + Math.sin(a) * ORBIT_R * 0.7 });
  }
  return out;
}

// Returns 'iframe' | 'shield' | 'blue' | 'red' depending on what absorbed it.
export function hurtPlayer(p, stats) {
  if (p.iframes > 0 || p.dead) return 'iframe';
  p.shieldT = 0;
  if (p.shield > 0) {
    p.shield--;
    p.iframes = 0.5;
    burst(p.x, PLAYER_Y, PAL.blue, 14, 160, 0.4, 2.5);
    shake(3, 0.1);
    return 'shield';
  }
  let what = 'red';
  if (p.blueHearts > 0) { p.blueHearts--; what = 'blue'; }
  else p.hearts--;
  p.iframes = stats.iframeTime;
  p.glitch = 1;
  shake(8, 0.25);
  hitStop(0.07);
  burst(p.x, PLAYER_Y, what === 'blue' ? PAL.blue : PAL.red, 18, 200, 0.6, 3);
  if (p.hearts <= 0) { p.hearts = 0; p.dead = true; }
  return what;
}

export function jumpHeight(p) {
  if (p.jumpT <= 0) return 0;
  const t = 1 - p.jumpT / p.jumpDur;
  return Math.sin(t * Math.PI);
}

function boardPoly(x, y, w, h) {
  return [x, y - h, x + w, y - h * 0.3, x + w * 0.7, y + h * 0.6, x - w * 0.7, y + h * 0.6, x - w, y - h * 0.3];
}

export function drawPlayer(p, alpha, stats) {
  const x = p.prevX + (p.x - p.prevX) * alpha + p.bump * 40;
  const jh = jumpHeight(p);
  const y = PLAYER_Y - jh * 26;
  const blink = p.iframes > 0 && p.phaseT <= 0 && Math.floor(p.iframes * 20) % 2 === 0;
  const c = p.color;

  for (let i = 0; i < p.trail.length; i += 3) {
    const idx = (p.trailI + i) % p.trail.length;
    const t = i / p.trail.length;
    drawGlowDot(p.trail[idx], PLAYER_Y + 8 + (1 - t) * 30, c, 2 + t * 2, t * 0.5);
  }

  for (const o of orbitalPositions(p, stats.orbitals)) {
    drawGlowDot(o.x, o.y, PAL.blue, 4);
    ring(o.x, o.y, 6, PAL.white, 1, 0.6);
  }

  // Phase cooldown bar under the board
  if (p.phaseCd > 0) {
    const w = 26 * (1 - p.phaseCd / stats.phaseCd);
    fillPoly([x - 13, PLAYER_Y + 22, x - 13 + w, PLAYER_Y + 22, x - 13 + w, PLAYER_Y + 24, x - 13, PLAYER_Y + 24], PAL.dim);
  }

  if (blink) return;
  if (jh > 0) ring(x, PLAYER_Y + 6, 10 * (1 - jh * 0.5), PAL.dim, 2, 0.6);

  const scale = 1 + jh * 0.25;
  const w = HALF_W * scale;
  const h = 16 * scale;
  const poly = boardPoly(x, y, w, h);
  if (p.phaseT > 0) {
    strokePoly(boardPoly(x - 4, y, w, h), PAL.magenta, 1);
    strokePoly(boardPoly(x + 4, y, w, h), PAL.cyan, 1);
    strokePoly(poly, PAL.white, 1);
    return;
  }
  fillPoly(poly, PAL.bg2);
  strokePoly(poly, c, 2);
  drawGlowDot(x, y - 2, PAL.white, 3);
  drawGlowDot(x - w * 0.5, y + h * 0.6, PAL.magenta, 2.5);
  drawGlowDot(x + w * 0.5, y + h * 0.6, PAL.magenta, 2.5);
  if (p.shield > 0) ring(x, y, 20, PAL.blue, 1.5 + p.shield, 0.35 + Math.sin(p.orbitA * 3) * 0.15);
}
