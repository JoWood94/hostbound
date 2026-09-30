import { W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, fillPoly, drawGlowDot, ring } from '../render/draw.js';
import { playerBullets, spawn } from './bullets.js';
import { burst, shake, hitStop } from '../render/fx.js';

export const PLAYER_Y = H * 0.78;
const HALF_W = 12;
const MIN_X = 22;
const MAX_X = W - 22;

export function makePlayer() {
  return {
    x: W / 2,
    prevX: W / 2,
    vx: 0,
    r: 7,                 // hurt radius (small, forgiving, bullet-hell style)
    hearts: 3,
    maxHearts: 3,
    blueHearts: 0,
    iframes: 0,
    fireTimer: 0,
    fireRate: 7,          // shots per second
    jumpT: 0,             // >0 while in the air
    dashT: 0,
    dashCd: 0,
    dashDir: 0,
    glitch: 0,
    dead: false,
    trail: new Float32Array(24), // ring buffer of x positions
    trailI: 0,
  };
}

export function updatePlayer(p, input, dt) {
  p.prevX = p.x;
  // Movement: drag delta (touch) or keyboard axis. Drag is 1:1 with a small gain.
  let dx = input.moveDelta * 1.15 + input.axis * 260 * dt;
  if (p.dashT > 0) dx += p.dashDir * 620 * dt;
  p.x += dx;
  if (p.x < MIN_X) p.x = MIN_X;
  if (p.x > MAX_X) p.x = MAX_X;

  // Jump
  if (p.jumpT > 0) p.jumpT -= dt;
  else if (input.jump) p.jumpT = 0.45;

  // Dash
  if (p.dashCd > 0) p.dashCd -= dt;
  if (p.dashT > 0) p.dashT -= dt;
  else if (input.dash && p.dashCd <= 0) {
    p.dashT = 0.16;
    p.dashCd = 2.0;
    p.dashDir = input.axis !== 0 ? input.axis : (input.moveDelta !== 0 ? Math.sign(input.moveDelta) : (p.x < W / 2 ? 1 : -1));
    p.iframes = Math.max(p.iframes, 0.2);
    burst(p.x, PLAYER_Y, PAL.cyan, 8, 140, 0.3, 2);
  }

  if (p.iframes > 0) p.iframes -= dt;
  if (p.glitch > 0) p.glitch = Math.max(0, p.glitch - dt * 2.5);

  // Auto-fire
  p.fireTimer -= dt;
  if (p.fireTimer <= 0) {
    p.fireTimer += 1 / p.fireRate;
    spawn(playerBullets, p.x, PLAYER_Y - 14, 0, -520, 3, 1);
  }

  p.trail[p.trailI] = p.x;
  p.trailI = (p.trailI + 1) % p.trail.length;
}

// Returns true if damage was actually applied.
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
  const t = 1 - p.jumpT / 0.45; // 0..1
  return Math.sin(t * Math.PI); // 0..1..0
}

export function drawPlayer(p, alpha) {
  const x = p.prevX + (p.x - p.prevX) * alpha;
  const jh = jumpHeight(p);
  const y = PLAYER_Y - jh * 26;
  const blink = p.iframes > 0 && Math.floor(p.iframes * 20) % 2 === 0;

  // Trail
  for (let i = 0; i < p.trail.length; i += 3) {
    const idx = (p.trailI + i) % p.trail.length;
    const t = i / p.trail.length;
    drawGlowDot(p.trail[idx], PLAYER_Y + 8 + (1 - t) * 30, PAL.cyan, 2 + t * 2, t * 0.5);
  }

  if (blink) return;

  // Shadow on the floor while jumping
  if (jh > 0) ring(x, PLAYER_Y + 6, 10 * (1 - jh * 0.5), PAL.dim, 2, 0.6);

  const scale = 1 + jh * 0.25;
  const w = HALF_W * scale;
  const h = 16 * scale;
  // Hoverboard: elongated hexagon
  fillPoly([x, y - h, x + w, y - h * 0.3, x + w * 0.7, y + h * 0.6, x - w * 0.7, y + h * 0.6, x - w, y - h * 0.3], PAL.bg2);
  strokePoly([x, y - h, x + w, y - h * 0.3, x + w * 0.7, y + h * 0.6, x - w * 0.7, y + h * 0.6, x - w, y - h * 0.3], PAL.cyan, 2);
  // Rider core
  drawGlowDot(x, y - 2, PAL.white, 3);
  // Thrusters
  drawGlowDot(x - w * 0.5, y + h * 0.6, PAL.magenta, 2.5);
  drawGlowDot(x + w * 0.5, y + h * 0.6, PAL.magenta, 2.5);
  // Dash ghost
  if (p.dashT > 0) strokePoly([x, y - h, x + w, y - h * 0.3, x + w * 0.7, y + h * 0.6, x - w * 0.7, y + h * 0.6, x - w, y - h * 0.3], PAL.white, 1);
}
