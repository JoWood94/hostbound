// Lane-based enemies. Every type has ONE fixed pattern and a telegraph:
// the lane(s) about to be hit glow before the shot. Difficulty scales
// timing, never the pattern, so players can learn each enemy.
import { W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, drawGlowDot, line } from '../render/draw.js';
import { enemyBullets, spawn } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { LANES, LANE_W, laneX } from './world.js';

export const enemies = [];

// Bullet speed down the lane. Grows slowly with difficulty.
const bulletSpeed = (d) => 190 + Math.min(120, d * 18);

// ---------------------------------------------------------------------------
// Type definitions. Each has: hp, hold y, telegraph time, and a `fire` step
// list executed while holding. A step: { lanes: [offsets], delay }.
// ---------------------------------------------------------------------------
export const TYPES = {
  // Burst of 3 straight down its own lane. Safe: any other lane.
  drone: {
    color: PAL.magenta, r: 11, hp: 3, holdY: 150, telegraph: 0.45,
    steps: [{ lanes: [0], delay: 0.14 }, { lanes: [0], delay: 0.14 }, { lanes: [0], delay: 0 }],
    rest: 1.4, unlockAt: 0,
  },
  // Sweeps left -> right across the 3 adjacent lanes. Safe: move against the sweep.
  sweeper: {
    color: PAL.orange, r: 12, hp: 4, holdY: 130, telegraph: 0.55,
    steps: [{ lanes: [-1], delay: 0.22 }, { lanes: [0], delay: 0.22 }, { lanes: [1], delay: 0 }],
    rest: 1.6, unlockAt: 300,
  },
  // Fires its lane and both neighbours at once. Safe: two lanes away.
  fork: {
    color: PAL.acid, r: 13, hp: 5, holdY: 120, telegraph: 0.7,
    steps: [{ lanes: [-1, 0, 1], delay: 0 }],
    rest: 1.9, unlockAt: 600,
  },
};

export function spawnEnemy(type, lane, difficulty) {
  const T = TYPES[type];
  const x = laneX(lane);
  enemies.push({
    type, T, lane,
    x, y: -24, prevX: x, prevY: -24,
    r: T.r,
    hp: T.hp + Math.floor(difficulty * 0.8),
    t: 0,
    state: 'enter',   // enter -> telegraph -> fire -> rest -> telegraph ... -> leave
    stateT: 0,
    step: 0,
    volleys: 0,
    maxVolleys: 2 + Math.floor(difficulty * 0.5),
    telegraphLanes: [],
    dead: false,
  });
}

function lanesFor(e, offsets) {
  const out = [];
  for (const o of offsets) {
    const l = e.lane + o;
    if (l >= 0 && l < LANES) out.push(l);
  }
  return out;
}

function fireLanes(e, lanes, d) {
  const s = bulletSpeed(d);
  for (const l of lanes) spawn(enemyBullets, laneX(l), e.y + 10, 0, s, 4, 1, 0);
}

export function updateEnemies(dt, difficulty) {
  const d = difficulty;
  const speedMul = 1 + Math.min(0.6, d * 0.08);
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const T = e.T;
    e.prevX = e.x; e.prevY = e.y;
    e.t += dt;
    e.stateT += dt;

    switch (e.state) {
      case 'enter':
        e.y += 160 * dt;
        if (e.y >= T.holdY) { e.y = T.holdY; e.state = 'telegraph'; e.stateT = 0; e.step = 0; e.telegraphLanes = lanesFor(e, T.steps[0].lanes); }
        break;
      case 'telegraph':
        if (e.stateT >= T.telegraph / speedMul) { e.state = 'fire'; e.stateT = 0; fireLanes(e, e.telegraphLanes, d); }
        break;
      case 'fire': {
        const st = T.steps[e.step];
        if (e.stateT >= st.delay / speedMul) {
          e.step++;
          e.stateT = 0;
          if (e.step >= T.steps.length) {
            e.volleys++;
            e.telegraphLanes = [];
            e.state = e.volleys >= e.maxVolleys ? 'leave' : 'rest';
          } else {
            e.telegraphLanes = lanesFor(e, T.steps[e.step].lanes);
            fireLanes(e, e.telegraphLanes, d);
          }
        }
        break;
      }
      case 'rest':
        if (e.stateT >= T.rest / speedMul) { e.state = 'telegraph'; e.stateT = 0; e.step = 0; e.telegraphLanes = lanesFor(e, T.steps[0].lanes); }
        break;
      case 'leave':
        e.y += 260 * dt;
        break;
    }
    if (e.y > H + 30) { enemies.splice(i, 1); i--; }
  }
}

export function damageEnemy(e, dmg) {
  e.hp -= dmg;
  burst(e.x, e.y, e.T.color, 3, 90, 0.25, 1.5);
  if (e.hp <= 0) {
    e.dead = true;
    burst(e.x, e.y, e.T.color, 16, 180, 0.5, 2.5);
    burst(e.x, e.y, PAL.white, 6, 90, 0.3, 2);
    shake(3, 0.1);
    return true;
  }
  return false;
}

// Drawn under enemies/bullets: glowing lane strips for telegraphed shots.
export function drawTelegraphs() {
  for (const e of enemies) {
    if (e.state !== 'telegraph' && e.state !== 'fire') continue;
    const prog = e.state === 'telegraph' ? Math.min(1, e.stateT / e.T.telegraph) : 1;
    const a = 0.15 + prog * 0.45;
    for (const l of e.telegraphLanes) {
      const x = laneX(l);
      line(x, e.y, x, H, e.T.color, 1 + prog * 2, a * 0.5);
      // Warning chevron at the bottom edge of the lane
      const cy = H - 14;
      strokePoly([x - 6, cy - 5, x, cy + 3, x + 6, cy - 5], e.T.color, 2, false);
    }
  }
}

export function drawEnemies(alpha) {
  for (const e of enemies) {
    const x = e.prevX + (e.x - e.prevX) * alpha;
    const y = e.prevY + (e.y - e.prevY) * alpha;
    const r = e.r;
    const c = e.T.color;
    const flash = e.state === 'telegraph' && Math.floor(e.stateT * 16) % 2 === 0;
    const col = flash ? PAL.white : c;
    if (e.type === 'drone') {
      const spin = e.t * 3;
      const pts = [];
      for (let k = 0; k < 6; k++) { const a = spin + (k / 6) * Math.PI * 2; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      strokePoly(pts, col, 2);
      drawGlowDot(x, y, PAL.orange, 3);
    } else if (e.type === 'sweeper') {
      // Wide chevron pointing down, wings hint at the 3-lane sweep
      strokePoly([x - r * 1.6, y - r * 0.6, x, y + r * 0.8, x + r * 1.6, y - r * 0.6, x, y - r * 0.1], col, 2);
      drawGlowDot(x, y, c, 3);
    } else if (e.type === 'fork') {
      // Trident: three prongs = three lanes
      strokePoly([x - r, y + r * 0.6, x - r, y - r * 0.6, x, y - r, x + r, y - r * 0.6, x + r, y + r * 0.6], col, 2, false);
      line(x, y - r, x, y + r * 0.8, col, 2);
      drawGlowDot(x, y + r * 0.3, c, 3);
    }
  }
}

export function clearEnemies() { enemies.length = 0; }
