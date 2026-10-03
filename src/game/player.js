import { ctx, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { ring } from '../render/draw.js';
import { burst, shake, hitStop } from '../render/fx.js';
import { drawSymbiote, drawSymbioteDeath, SYM_BODY, capsule } from '../render/oled.js';

const SYM_R = 19;   // body radius of the procedural symbiote
import { LANES, laneX } from './world.js';

export const PLAYER_Y = H * 0.8;   // keep in step with PLAYER_ROW in world.js and boss.js
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

  // A tap that turned out to be the start of a vertical swipe: take its lane
  // change back (and whatever the move itself granted).
  if (p.tapUndo) {
    p.tapUndo.t -= dt;
    if (input.untap) {
      const u = p.tapUndo;
      p.laneFromX = p.x; p.lane = u.lane; p.laneT = 0;
      p.twinT = 0; p.slingT = 0; p.phaseCd += u.refund; p.stillT = u.stillT; p.laneTimes = u.laneTimes;
      p.tapUndo = null;
    } else if (p.tapUndo.t <= 0) p.tapUndo = null;
  }

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir !== 0) {
    const next = Math.max(0, Math.min(LANES - 1, p.lane + dir));
    if (next !== p.lane) {
      p.tapUndo = input.fromTap ? { lane: p.lane, refund: 0, stillT: p.stillT, laneTimes: p.laneTimes, t: 0.25 } : null;
      p.laneFromX = p.x;
      // TWIN LINK keeps firing from the lane just left for a moment
      p.twinLane = p.lane; p.twinT = stats.twinTime || 0.6;
      p.slingT = 0.35; p.slingDir = dir;                // SLINGSHOT window
      p.lane = next;
      p.laneT = 0;
      p.ev.lane = true;
      p.stillT = 0;                                   // CHARGE resets on every move
      if (stats.momentum) {
        const cd = p.phaseCd;
        p.phaseCd = Math.max(0, p.phaseCd - 0.15 * stats.momentum);
        if (p.tapUndo) p.tapUndo.refund = cd - p.phaseCd;
      }
      p.laneTimes = [...(p.laneTimes || []).slice(-1), p.time || 0];
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
  p.time = (p.time || 0) + dt;
  if (p.twinT > 0) p.twinT -= dt;
  if (p.slingT > 0) p.slingT -= dt;
  if (p.shrinkT > 0) p.shrinkT -= dt;
  if (p.overchargeT > 0) p.overchargeT -= dt;
  // CHARGE: stand still in a lane to charge the next shot
  if (stats.charge) {
    p.stillT = (p.stillT || 0) + dt;
    if (p.stillT >= (stats.charge > 1 ? 0.7 : 1)) p.charged = true;
  }

  // Jump, with a short input buffer so a swipe just before landing is not lost.
  if (input.jump) p.jumpBuf = 0.18;
  if (p.jumpBuf > 0) p.jumpBuf -= dt;
  if (p.jumpT > 0) {
    p.jumpT -= dt;
    if (p.jumpT <= 0) { p.jumpT = 0; p.ev.land = true; p.squash = 1; }
  }
  if (p.jumpT <= 0 && p.jumpBuf > 0 && stats.canJump) {
    p.jumpBuf = 0;
    // shorter as the clock speeds up (run.js sets airMul): the same jump in ticks
    p.jumpDur = stats.jumpTime * (p.airMul || 1);
    p.jumpT = p.jumpDur;
    p.ev.jump = true;
    p.squash = -1;
  }
  if (p.squash > 0) p.squash = Math.max(0, p.squash - dt * 7);
  else if (p.squash < 0) p.squash = Math.min(0, p.squash + dt * 6);

  // Swipe down in the air: with phase ready, drop to the track and phase at
  // once (a jump never takes the phase away); on cooldown, fast fall only.
  // On the ground = phase.
  let phaseInput = input.phase;
  if (input.phase && p.jumpT > 0) {
    p.ev.slam = true;
    if (p.phaseCd <= 0 && p.phaseT <= 0) { p.jumpT = 0; p.ev.land = true; p.squash = 1; }
    else if (p.jumpT > 0.07) { p.jumpT = 0.07; phaseInput = false; }
  }

  // Phase: brief invulnerability in place
  if (p.phaseCd > 0) p.phaseCd -= dt;
  if (p.phaseT > 0) p.phaseT -= dt;
  else if (phaseInput && p.phaseCd <= 0) {
    p.phaseT = stats.phaseTime;
    p.phaseCd = stats.phaseCd;
    // no i-frames: phase passes only shots, enemy bodies and cyan tears /
    // veils (run.js); barriers and wires still hit (dodge / jump them)
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
  // CARAPACE: the shell takes the first hit(s) of each section
  if (p.carapace > 0) {
    p.carapace--;
    p.iframes = 0.5;
    burst(p.x, PLAYER_Y, '#d8d0bc', 16, 170, 0.4, 2.5);
    shake(3, 0.1);
    return 'shield';
  }
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

  // ORBITAL spheres: flat blue beads.
  ctx.fillStyle = PAL.blue;
  for (const o of orbitalPositions(p, stats.orbitals)) { ctx.beginPath(); ctx.arc(o.x, o.y, 5, 0, Math.PI * 2); ctx.fill(); }

  // Phase cooldown under the body: a capsule that fills up.
  if (p.phaseCd > 0) {
    const w = 26 * (1 - p.phaseCd / stats.phaseCd);
    capsule(x - 13, PLAYER_Y + 32, x - 13 + w, PLAYER_Y + 32, 1.5); ctx.fillStyle = PAL.mute; ctx.fill();
  }
  // KICKFLIP recharge: cyan when full = the next landing wipes the lane.
  if (stats.kickflip) {
    const w = 26 * (p.kickK || 0);
    capsule(x - 13, PLAYER_Y + 37, x - 13 + w, PLAYER_Y + 37, 1.5); ctx.fillStyle = p.kickK >= 1 ? PAL.cyan : PAL.mute; ctx.fill();
  }

  if (blink) return;
  drawSymbioteLive(p, x, y, jh, stats);
}

// ---------------------------------------------------------------------------
// Symbiote (sprite sheet)
// ---------------------------------------------------------------------------
function growth(p) { return Math.min(0.35, (p.items || 0) * 0.03); }

// Draw radius of the symbiote (grows with items, shrinks with MOLT).
export function symRadius(p) { return SYM_R * (1 + growth(p)) * (p.shrinkT > 0 ? 0.75 : 1); }

function drawSymbioteLive(p, x, y, jh, stats) {
  const t = performance.now() / 1000;
  const R = symRadius(p) * (1 + jh * 0.35);
  const vx = p.x - p.prevX;
  p.bank = (p.bank || 0) + (Math.max(-0.3, Math.min(0.3, vx * 0.08)) - (p.bank || 0)) * 0.3;
  const hit = p.iframes > 0 && p.phaseT <= 0 && Math.floor(p.iframes * 18) % 2 === 0;
  p.oled = p.oled || {};
  const pose = { R, bank: p.bank, squash: p.squash, jh, phase: false, hit, t, state: p.oled, genome: p.specimen, air: p.jumpT > 0 };
  if (p.jumpT > 0) {
    // JUMP: the body rolls into a sphere (oled.drawSymbiote) and somersaults;
    // a ring left on the track shrinks under it, so the height reads top-down.
    const k = 1 - p.jumpT / p.jumpDur;
    pose.spin = (1 - (1 - k) ** 3) * Math.PI * 2 * (p.bank < 0 ? -1 : 1);
    ring(x, PLAYER_Y + 4, R * (1.1 - jh * 0.45), SYM_BODY, 1.5, 1);
  }
  if (p.phaseT > 0) {
    // PHASE: out of step with the world. Two dark-cyan echoes slide apart on
    // either side of a flat cyan silhouette.
    const k = 1 - p.phaseT / Math.max(0.01, stats.phaseTime);
    const off = 4 + 8 * Math.sin(Math.PI * Math.min(1, k * 1.4));
    p.oledL = p.oledL || {}; p.oledR = p.oledR || {};
    drawSymbiote(x - off, y + 2, { ...pose, phase: true, phaseColor: '#0b4a50', state: p.oledL });
    drawSymbiote(x + off, y + 2, { ...pose, phase: true, phaseColor: '#0b4a50', state: p.oledR });
    pose.phase = true;
  }
  drawSymbiote(x, y + 2, pose);
  // Rail charge: a flat acid bead swelling at the top of the body
  if (stats.carrier === 'rail' && p.charge > 0.05) {
    ctx.fillStyle = p.charge > 0.9 ? '#f4ffd8' : '#c6ff1a';
    ctx.beginPath(); ctx.arc(x, y - R * 1.2, 1.5 + p.charge * 4, 0, Math.PI * 2); ctx.fill();
  }
  // Shield: a solid blue ring, thicker with more shield
  if (p.shield > 0) ring(x, y, R * 1.45, PAL.blue, 1.2 + p.shield * 0.8, 1);
}

// Death: the symbiote bursts (row 3, frames 3-7). Returns false when finished.
export function drawPlayerDeath(p, deadT) {
  return drawSymbioteDeath(p.x, PLAYER_Y + 2, SYM_R * (1 + growth(p)), deadT);
}
