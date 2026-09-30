// Lane-based enemies. Every type has ONE fixed pattern and a telegraph:
// the lane(s) about to be hit glow before the shot. Difficulty scales
// timing a little, never the pattern, so players can learn each enemy.
//
// Each enemy teaches one move:
//   drone   -> change lane
//   sweeper -> read direction, slip behind the sweep
//   crusher -> jump (low wave across 3 lanes) or move 2 lanes away
import { ctx, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, drawGlowDot, line } from '../render/draw.js';
import { enemyBullets, spawn, LOW } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { LANES, LANE_W, laneX } from './world.js';
import { sfx } from '../audio/audio.js';

let nextId = 1;
export const newId = () => nextId++;

export const enemies = [];

const bulletSpeed = (d) => 180 + Math.min(100, d * 10);
const timeMul = (d) => 1 + Math.min(0.4, d * 0.05); // max 40% faster, ever

// The enemy's lane and its neighbours, clamped to the track.
const around = (e) => [e.lane - 1, e.lane, e.lane + 1].filter((l) => l >= 0 && l < LANES);

// steps(e) returns the list of volleys: [{ lanes, delay, low }]
export const TYPES = {
  drone: {
    color: PAL.magenta, r: 11, hp: 2, holdY: 160, telegraph: 0.6, rest: 1.6, volleys: 2, unlockAt: 0,
    steps: (e) => [
      { lanes: [e.lane], delay: 0.15 },
      { lanes: [e.lane], delay: 0.15 },
      { lanes: [e.lane], delay: 0 },
    ],
  },
  sweeper: {
    color: PAL.orange, r: 11, hp: 4, holdY: 140, telegraph: 0.8, rest: 2.0, volleys: 2, unlockAt: 500,
    steps: (e) => {
      const a = around(e);
      const order = e.dir > 0 ? a : [...a].reverse();
      return order.map((l, i) => ({ lanes: [l], delay: i < 2 ? 0.32 : 0 }));
    },
  },
  crusher: {
    color: PAL.acid, r: 12, hp: 6, holdY: 120, telegraph: 0.9, rest: 2.4, volleys: 2, unlockAt: 1000,
    steps: (e) => [{ lanes: around(e), delay: 0, low: true }],
  },
};

export function spawnEnemy(type, lane, difficulty, rng) {
  const T = TYPES[type];
  const x = laneX(lane);
  const e = {
    id: newId(),
    poison: 0, poisonT: 0, poisonTick: 0, poisoned: false,
    type, T, lane,
    dir: rng.chance(0.5) ? 1 : -1,
    x, y: -24, prevX: x, prevY: -24,
    r: T.r,
    hp: T.hp + Math.floor(difficulty * 0.5),
    t: 0,
    state: 'enter',   // enter -> telegraph -> fire -> rest -> ... -> leave
    stateT: 0,
    step: 0,
    steps: null,
    volleys: 0,
    maxVolleys: Math.min(4, T.volleys + Math.floor(difficulty / 3)),
    telegraphLanes: [],
    dead: false,
  };
  e.steps = T.steps(e);
  enemies.push(e);
}

function fire(e, st, d) {
  const s = bulletSpeed(d);
  for (const l of st.lanes) {
    if (st.low) spawn(enemyBullets, laneX(l), e.y + 12, 0, s * 0.85, 10, 1, LOW);
    else spawn(enemyBullets, laneX(l), e.y + 12, 0, s, 5, 1, 0);
  }
}

// Lanes lit during telegraph: the whole sequence, so the player can plan.
function allSequenceLanes(e) {
  const set = new Set();
  for (const st of e.steps) for (const l of st.lanes) set.add(l);
  return [...set];
}

export function updateEnemies(dt, difficulty) {
  const d = difficulty;
  const m = timeMul(d);
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const T = e.T;
    if (e.type === 'boss') continue; // bosses drive themselves
    e.prevX = e.x; e.prevY = e.y;
    e.t += dt;
    e.stateT += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;

    switch (e.state) {
      case 'enter':
        e.y += 170 * dt;
        if (e.y >= T.holdY) { e.y = T.holdY; e.state = 'telegraph'; e.stateT = 0; e.telegraphLanes = allSequenceLanes(e); sfx.telegraph(); }
        break;
      case 'telegraph':
        if (e.stateT >= T.telegraph / m) {
          e.state = 'fire'; e.stateT = 0; e.step = 0;
          fire(e, e.steps[0], d);
          e.telegraphLanes = e.steps.slice(1).flatMap((s) => s.lanes);
        }
        break;
      case 'fire': {
        const st = e.steps[e.step];
        if (e.stateT >= st.delay / m) {
          e.step++;
          e.stateT = 0;
          if (e.step >= e.steps.length) {
            e.volleys++;
            e.telegraphLanes = [];
            e.state = e.volleys >= e.maxVolleys ? 'leave' : 'rest';
          } else {
            fire(e, e.steps[e.step], d);
            e.telegraphLanes = e.steps.slice(e.step + 1).flatMap((s) => s.lanes);
          }
        }
        break;
      }
      case 'rest':
        if (e.stateT >= T.rest / m) { e.state = 'telegraph'; e.stateT = 0; e.telegraphLanes = allSequenceLanes(e); sfx.telegraph(); }
        break;
      case 'leave':
        e.y += 240 * dt;
        break;
    }
    if (e.y > H + 30) { enemies.splice(i, 1); i--; }
  }
}

// Marks the enemy dead; rewards are handled by the run so every damage
// source (bullets, arcs, frags, poison, EMP) is treated the same.
export function damageEnemy(e, dmg) {
  if (e.dead) return false;
  e.hp -= dmg;
  e.hitFlash = 0.06;
  burst(e.x, e.y, e.T.color, 3, 90, 0.25, 1.5);
  if (e.hp <= 0) {
    e.dead = true;
    burst(e.x, e.y, e.T.color, 18, 180, 0.5, 2.5);
    burst(e.x, e.y, PAL.white, 6, 90, 0.3, 2);
    shake(3, 0.1);
    return true;
  }
  return false;
}

// Glowing lane strips for telegraphed shots, under everything else.
export function drawTelegraphs() {
  for (const e of enemies) {
    if (e.type === 'boss' || !e.telegraphLanes.length) continue;
    const prog = e.state === 'telegraph' ? Math.min(1, e.stateT / e.T.telegraph) : 1;
    const a = 0.12 + prog * 0.4;
    const low = e.type === 'crusher';
    for (const l of e.telegraphLanes) {
      const x = laneX(l);
      const w = LANE_W - 8;
      // Soft lane fill
      ctxFill(x - w / 2, e.y, w, H - e.y, e.T.color, a * 0.18);
      line(x, e.y, x, H, e.T.color, 1 + prog * 2, a * 0.6);
      // Warning glyph at bottom: chevron = move, up-arrow = jump
      const cy = H - 22;
      if (low) strokePoly([x - 8, cy + 4, x, cy - 6, x + 8, cy + 4], e.T.color, 2.5, false);
      else strokePoly([x - 8, cy - 5, x, cy + 4, x + 8, cy - 5], e.T.color, 2.5, false);
    }
    // Sweeper: arrow showing sweep direction
    if (e.type === 'sweeper' && e.state === 'telegraph') {
      const y = e.y + 30;
      const seq = e.steps.map((st) => st.lanes[0]);
      const x0 = laneX(seq[0]), x1 = laneX(seq[seq.length - 1]);
      const dir = Math.sign(x1 - x0) || 1;
      line(x0, y, x1, y, e.T.color, 2, 0.4 + prog * 0.5);
      strokePoly([x1 - dir * 8, y - 6, x1, y, x1 - dir * 8, y + 6], e.T.color, 2, false);
    }
  }
}

function ctxFill(x, y, w, h, color, alpha) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

export function drawEnemies(alpha) {
  for (const e of enemies) {
    if (e.type === 'boss' || e.dead) continue;
    const x = e.prevX + (e.x - e.prevX) * alpha;
    const y = e.prevY + (e.y - e.prevY) * alpha;
    const r = e.r;
    const c = e.T.color;
    const flash = e.state === 'telegraph' && e.stateT > e.T.telegraph * 0.5 && Math.floor(e.stateT * 16) % 2 === 0;
    const col = flash || e.hitFlash > 0 ? PAL.white : c;
    if (e.poison > 0) drawGlowDot(x, y - r - 5, PAL.acid, 2.5, 0.8);
    if (e.type === 'drone') {
      const spin = e.t * 3;
      const pts = [];
      for (let k = 0; k < 6; k++) { const a = spin + (k / 6) * Math.PI * 2; pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      strokePoly(pts, col, 2);
      drawGlowDot(x, y, PAL.orange, 3);
    } else if (e.type === 'sweeper') {
      strokePoly([x - r * 1.6, y - r * 0.6, x, y + r * 0.8, x + r * 1.6, y - r * 0.6, x, y - r * 0.1], col, 2);
      drawGlowDot(x, y, c, 3);
    } else if (e.type === 'crusher') {
      // Heavy block with a slot: fires low waves
      strokePoly([x - r * 1.3, y - r * 0.8, x + r * 1.3, y - r * 0.8, x + r * 1.3, y + r * 0.8, x - r * 1.3, y + r * 0.8], col, 2);
      line(x - r, y + r * 0.35, x + r, y + r * 0.35, c, 3);
      drawGlowDot(x, y - r * 0.2, c, 3);
    }
  }
}

export function clearEnemies() { enemies.length = 0; }
