import { W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, fillPoly, drawGlowDot, ring } from '../render/draw.js';
import { playerBullets, spawn } from './bullets.js';
import { burst, shake, hitStop } from '../render/fx.js';
import { LANES, laneX } from './world.js';

export const PLAYER_Y = H * 0.78;
const HALF_W = 12;
const LANE_SNAP = 18;     // higher = snappier lane change
const JUMP_TIME = 0.45;
const PHASE_TIME = 0.25;
const PHASE_CD = 2.0;

export function makePlayer() {
  const lane = Math.floor(LANES / 2);
  return {
    lane,
    x: laneX(lane),
    prevX: laneX(lane),
    r: 7,                 // hurt radius
    hearts: 3,
    maxHearts: 3,
    blueHearts: 0,
    iframes: 0,
    fireTimer: 0,
    fireRate: 7,
    jumpT: 0,
    phaseT: 0,
    phaseCd: 0,
    glitch: 0,
    dead: false,
    trail: new Float32Array(24),
    trailI: 0,
  };
}

export function updatePlayer(p, input, dt) {
  p.prevX = p.x;

  // Lane change (queued inputs feel responsive on mobile)
  if (input.left && p.lane > 0) p.lane--;
  if (input.right && p.lane < LANES - 1) p.lane++;
  const tx = laneX(p.lane);
  p.x += (tx - p.x) * Math.min(1, LANE_SNAP * dt);
  if (Math.abs(tx - p.x) < 0.3) p.x = tx;

  // Jump
  if (p.jumpT > 0) p.jumpT -= dt;
  else if (input.jump) p.jumpT = JUMP_TIME;

  // Phase: brief invulnerability in place
  if (p.phaseCd > 0) p.phaseCd -= dt;
  if (p.phaseT > 0) p.phaseT -= dt;
  else if (input.phase && p.phaseCd <= 0) {
    p.phaseT = PHASE_TIME;
    p.phaseCd = PHASE_CD;
    p.iframes = Math.max(p.iframes, PHASE_TIME);
    burst(p.x, PLAYER_Y, PAL.cyan, 10, 140, 0.3, 2);
  }

  if (p.iframes > 0) p.iframes -= dt;
  if (p.glitch > 0) p.glitch = Math.max(0, p.glitch - dt * 2.5);

  // Auto-fire straight up the lane
  p.fireTimer -= dt;
  if (p.fireTimer <= 0) {
    p.fireTimer += 1 / p.fireRate;
    spawn(playerBullets, p.x, PLAYER_Y - 14, 0, -520, 3, 1);
  }

  p.trail[p.trailI] = p.x;
  p.trailI = (p.trailI + 1) % p.trail.length;
}

export function isAirborne(p) { return p.jumpT > 0; }

export function hurtPlayer(p, amount = 1) {
  if (p.iframes > 0 || p.dead) return false;
  if (p.blueHearts > 0) p.blueHearts -= amount;
  else p.hearts -= amount;
  p.iframes = 1.0;
  p.glitch = 1;
  shake(8, 0.25);
  hitStop(0.07);
  burst(p.x, PLAYER_Y, PAL.red, 18, 200, 0.6, 3);
  if (p.hearts <= 0) { p.hearts = 0; p.dead = true; }
  return true;
}

export function jumpHeight(p) {
  if (p.jumpT <= 0) return 0;
  const t = 1 - p.jumpT / JUMP_TIME;
  return Math.sin(t * Math.PI);
}

function boardPoly(x, y, w, h) {
  return [x, y - h, x + w, y - h * 0.3, x + w * 0.7, y + h * 0.6, x - w * 0.7, y + h * 0.6, x - w, y - h * 0.3];
}

export function drawPlayer(p, alpha) {
  const x = p.prevX + (p.x - p.prevX) * alpha;
  const jh = jumpHeight(p);
  const y = PLAYER_Y - jh * 26;
  const blink = p.iframes > 0 && p.phaseT <= 0 && Math.floor(p.iframes * 20) % 2 === 0;

  for (let i = 0; i < p.trail.length; i += 3) {
    const idx = (p.trailI + i) % p.trail.length;
    const t = i / p.trail.length;
    drawGlowDot(p.trail[idx], PLAYER_Y + 8 + (1 - t) * 30, PAL.cyan, 2 + t * 2, t * 0.5);
  }

  if (blink) return;
  if (jh > 0) ring(x, PLAYER_Y + 6, 10 * (1 - jh * 0.5), PAL.dim, 2, 0.6);

  const scale = 1 + jh * 0.25;
  const w = HALF_W * scale;
  const h = 16 * scale;
  const poly = boardPoly(x, y, w, h);
  if (p.phaseT > 0) {
    // Phased: ghostly, offset copies
    strokePoly(boardPoly(x - 4, y, w, h), PAL.magenta, 1);
    strokePoly(boardPoly(x + 4, y, w, h), PAL.cyan, 1);
    strokePoly(poly, PAL.white, 1);
    return;
  }
  fillPoly(poly, PAL.bg2);
  strokePoly(poly, PAL.cyan, 2);
  drawGlowDot(x, y - 2, PAL.white, 3);
  drawGlowDot(x - w * 0.5, y + h * 0.6, PAL.magenta, 2.5);
  drawGlowDot(x + w * 0.5, y + h * 0.6, PAL.magenta, 2.5);
}
