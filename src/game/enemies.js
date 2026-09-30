// Fase 0: one enemy type (drone). Structured so more types slot in later.
import { W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, drawGlowDot } from '../render/draw.js';
import { enemyBullets, spawn } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { PLAYER_Y } from './player.js';

export const enemies = [];

export function spawnDrone(rng, x, difficulty) {
  enemies.push({
    type: 'drone',
    x,
    y: -20,
    prevX: x,
    prevY: -20,
    r: 11,
    hp: 3 + Math.floor(difficulty * 1.5),
    t: 0,
    fireT: 0.9 + rng.next() * 0.6,
    fired: 0,
    speed: 120 + difficulty * 15,
    wobble: rng.range(0.6, 1.4),
    phase: rng.next() * Math.PI * 2,
    dead: false,
  });
}

export function updateEnemies(dt, player, difficulty) {
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    e.prevX = e.x; e.prevY = e.y;
    e.t += dt;
    e.y += e.speed * dt;
    e.x += Math.sin(e.t * 2.2 * e.wobble + e.phase) * 40 * dt;
    e.fireT -= dt;
    if (e.fireT <= 0 && e.y > 30 && e.y < PLAYER_Y - 80) {
      e.fireT = 1.4 - Math.min(0.8, difficulty * 0.08);
      // Aimed shot at player
      const dx = player.x - e.x;
      const dy = PLAYER_Y - e.y;
      const len = Math.hypot(dx, dy) || 1;
      const s = 170 + difficulty * 12;
      spawn(enemyBullets, e.x, e.y + 8, (dx / len) * s, (dy / len) * s, 4, 1, 0);
    }
    if (e.y > H + 30) { enemies.splice(i, 1); i--; }
  }
}

export function damageEnemy(e, dmg) {
  e.hp -= dmg;
  burst(e.x, e.y, PAL.acid, 3, 90, 0.25, 1.5);
  if (e.hp <= 0) {
    e.dead = true;
    burst(e.x, e.y, PAL.acid, 16, 180, 0.5, 2.5);
    burst(e.x, e.y, PAL.white, 6, 90, 0.3, 2);
    shake(3, 0.1);
    return true;
  }
  return false;
}

export function drawEnemies(alpha) {
  for (const e of enemies) {
    const x = e.prevX + (e.x - e.prevX) * alpha;
    const y = e.prevY + (e.y - e.prevY) * alpha;
    const r = e.r;
    const spin = e.t * 3;
    // Hexagon drone
    const pts = [];
    for (let k = 0; k < 6; k++) {
      const a = spin + (k / 6) * Math.PI * 2;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    strokePoly(pts, PAL.magenta, 2);
    drawGlowDot(x, y, PAL.orange, 3);
  }
}

export function clearEnemies() { enemies.length = 0; }
