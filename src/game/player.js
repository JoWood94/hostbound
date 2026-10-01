import { ctx, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { fillPoly, drawGlowDot, ring } from '../render/draw.js';
import { burst, shake, hitStop } from '../render/fx.js';
import { shipSprite, SHIP_ENGINES, drawSprite } from '../render/sprites.js';
import { LANES, laneX } from './world.js';

export const PLAYER_Y = H * 0.78;
const LANE_TIME = 0.11;   // seconds for a lane hop, fixed: discrete, never follows the finger
const ORBIT_R = 28;

export function makePlayer(stats, color = PAL.cyan, ship = 'stock') {
  const lane = Math.floor(LANES / 2);
  return {
    lane,
    laneT: 1,
    x: laneX(lane),
    laneFromX: laneX(lane),
    bump: 0,
    prevX: laneX(lane),
    color,
    ship,
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
    jumpBuf: 0,           // swipe-up received shortly before landing: jump again on touchdown
    squash: 0,            // >0 landing squash, <0 takeoff stretch
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
    p.laneT = Math.min(1, p.laneT + dt * stats.speed / LANE_TIME);
    const e = 1 - (1 - p.laneT) * (1 - p.laneT);
    p.x = p.laneFromX + (laneX(p.lane) - p.laneFromX) * e;
  } else {
    p.x = laneX(p.lane);
  }
  if (p.bump) { p.bump *= 0.7; if (Math.abs(p.bump) < 0.005) p.bump = 0; }

  // Jump, with a short input buffer so a swipe just before landing is not lost.
  if (input.jump) p.jumpBuf = 0.18;
  if (p.jumpBuf > 0) p.jumpBuf -= dt;
  if (p.jumpT > 0) {
    p.jumpT -= dt;
    if (p.jumpT <= 0) { p.jumpT = 0; p.ev.land = true; p.squash = 1; }
  }
  if (p.jumpT <= 0 && p.jumpBuf > 0 && stats.canJump) {
    p.jumpBuf = 0;
    p.jumpDur = stats.jumpTime;
    p.jumpT = p.jumpDur;
    p.ev.jump = true;
    p.squash = -1;
  }
  if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 7);
  else if (p.squash < 0) p.squash = Math.min(0, p.squash + dt * 6);

  // Swipe down in the air = fast fall (Subway Surfers style). On the ground = phase.
  let phaseInput = input.phase;
  if (input.phase && p.jumpT > 0.07) {
    p.jumpT = 0.07;
    phaseInput = false;
    p.ev.slam = true;
  }

  // Phase: brief invulnerability in place
  if (p.phaseCd > 0) p.phaseCd -= dt;
  if (p.phaseT > 0) p.phaseT -= dt;
  else if (phaseInput && p.phaseCd <= 0) {
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

// 0..1..0 with a fast rise, a long hang at the top and a fast drop:
// reads as "I'm clearly in the air" for most of the jump.
export function jumpHeight(p) {
  if (p.jumpT <= 0) return 0;
  const t = 1 - p.jumpT / p.jumpDur;
  const u = 2 * t - 1;
  return 1 - u * u * u * u;
}

export function drawPlayer(p, alpha, stats) {
  const x = p.prevX + (p.x - p.prevX) * alpha + p.bump * 40;
  const jh = jumpHeight(p);
  const y = PLAYER_Y - jh * 12;
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
    fillPoly([x - 13, PLAYER_Y + 31, x - 13 + w, PLAYER_Y + 31, x - 13 + w, PLAYER_Y + 33, x - 13, PLAYER_Y + 33], PAL.mute);
  }

  if (blink) return;

  // Ground shadow stays on the track while the board rises: the gap between
  // them is what sells the jump in a top-down view.
  if (jh > 0) {
    ctx.globalAlpha = 0.55 - jh * 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, PLAYER_Y + 10, 14 * (1 - jh * 0.35), 6 * (1 - jh * 0.35), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ring(x, PLAYER_Y + 10, 12 * (1 - jh * 0.35), c, 1, 0.35 * jh);
  }

  const scale = 1 + jh * 0.45;
  const sq = p.squash;
  // Lean into lane changes: bank angle from horizontal speed.
  const vx = p.x - p.prevX;
  p.bank = (p.bank || 0) + (Math.max(-0.35, Math.min(0.35, vx * 0.09)) - (p.bank || 0)) * 0.3;
  const spr = shipSprite(p.ship, c);
  const sxs = scale * 0.85 * (1 + sq * 0.2);
  const sys = scale * 0.85 * (1 - sq * 0.2);

  // Engine flames (live, flickering), longer while boosting into a lane
  if (p.phaseT <= 0) {
    const cos = Math.cos(p.bank), sin = Math.sin(p.bank);
    for (const [ex, ey] of SHIP_ENGINES[p.ship] || SHIP_ENGINES.stock) {
      const len = 5 + Math.random() * 6 + (p.laneT < 1 ? 5 : 0);
      const bx = x + (ex * cos - ey * sin) * sxs, by = y + (ex * sin + ey * cos) * sys;
      drawGlowDot(bx, by + len * 0.45, c, 3.4, 0.85);
      drawGlowDot(bx, by + len, PAL.magenta, 2.2, 0.5);
      drawGlowDot(bx, by + 1, PAL.white, 1.6, 0.95);
    }
  }

  if (p.phaseT > 0) {
    drawSprite(spr, x - 4, y, { rot: p.bank, sx: sxs, sy: sys, alpha: 0.35 });
    drawSprite(spr, x + 4, y, { rot: p.bank, sx: sxs, sy: sys, alpha: 0.35 });
    drawSprite(spr, x, y, { rot: p.bank, sx: sxs, sy: sys, alpha: 0.55, flash: 0.6 });
    return;
  }
  drawSprite(spr, x, y, { rot: p.bank, sx: sxs, sy: sys, flash: p.iframes > 0 ? 0.25 : 0 });
  // Railgun charge building on the nose
  if (stats.carrier === 'rail' && p.charge > 0.05) {
    drawGlowDot(x + Math.sin(p.bank) * 22, y - 24 * sys, PAL.cyan, 2 + p.charge * 5, 0.4 + p.charge * 0.6);
    if (p.charge > 0.9) drawGlowDot(x + Math.sin(p.bank) * 22, y - 24 * sys, '#ffffff', 2.5);
  }
  if (p.shield > 0) ring(x, y, 20, PAL.blue, 1.5 + p.shield, 0.35 + Math.sin(p.orbitA * 3) * 0.15);
}
