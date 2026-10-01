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
import { strokePoly, drawGlowDot, line, ring } from '../render/draw.js';
import { enemySprite, drawSprite } from '../render/sprites.js';
import { enemyBullets, spawn, LOW } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { LANES, LANE_W, laneX } from './world.js';
import { sfx } from '../audio/audio.js';

let nextId = 1;
export const newId = () => nextId++;

export const enemies = [];

import { bulletSpeed, timeMul, enemyHp, maxVolleys, LEAVE_SPEED } from './balance.js';

// The enemy's lane and its neighbours, clamped to the track.
const around = (e) => [e.lane - 1, e.lane, e.lane + 1].filter((l) => l >= 0 && l < LANES);

const others = (e) => [0, 1, 2, 3, 4].filter((l) => l !== e.lane && l < LANES);

// steps(e) returns the volley for the current cycle: [{ lanes, delay, low }].
// It is re-evaluated before every telegraph, so patterns may depend on
// e.lane (hopper moves) or e.volleys (tank alternates) and stay deterministic.
//   wide: covers many lanes, only spawned when alone on screen.
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
    color: PAL.acid, r: 12, hp: 6, holdY: 120, telegraph: 0.9, rest: 2.4, volleys: 2, unlockAt: 1000, wide: true,
    steps: (e) => [{ lanes: around(e), delay: 0, low: true }],
  },
  // One shot, then hops one lane in its direction (bounces off the walls).
  // An arrow shows the next lane. Teaches: track it, do not follow it.
  hopper: {
    color: PAL.red, r: 11, hp: 3, holdY: 150, telegraph: 0.55, rest: 0.9, volleys: 4, unlockAt: 1500,
    steps: (e) => [{ lanes: [e.lane], delay: 0.12 }, { lanes: [e.lane], delay: 0 }],
    afterVolley: (e) => {
      if (e.lane + e.dir < 0 || e.lane + e.dir >= LANES) e.dir = -e.dir;
      e.hopFromX = e.x;
      e.lane += e.dir;
      e.hopT = 0;
    },
  },
  // Lights its lane, then dives down it. Teaches: leave the lane or kill it first.
  kamikaze: {
    color: PAL.amber, r: 10, hp: 3, holdY: 110, telegraph: 1.0, rest: 0, volleys: 1, unlockAt: 2000,
    dive: 520,
    steps: (e) => [{ lanes: [e.lane], delay: 0 }],
  },
  // Fires every lane except its own. Teaches: get under it.
  wall: {
    color: PAL.violet, r: 14, hp: 7, holdY: 120, telegraph: 1.0, rest: 2.0, volleys: 2, unlockAt: 2500, wide: true,
    steps: (e) => [{ lanes: others(e), delay: 0.16 }, { lanes: others(e), delay: 0 }],
  },
  // Alternates a low wave on every lane (jump) and shots two lanes out.
  tank: {
    color: PAL.mint, r: 16, hp: 14, holdY: 110, telegraph: 1.0, rest: 1.8, volleys: 4, unlockAt: 3000, wide: true,
    steps: (e) => (e.volleys % 2 === 0
      ? [{ lanes: [0, 1, 2, 3, 4], delay: 0, low: true }]
      : [0, 1, 2].map((i) => ({ lanes: [e.lane - 2, e.lane + 2].filter((l) => l >= 0 && l < LANES), delay: i < 2 ? 0.14 : 0 }))),
  },
};

export const NARROW_TYPES = Object.keys(TYPES).filter((k) => !TYPES[k].wide);

export function spawnEnemy(type, lane, difficulty, rng, { power = 1, elite = false, minion = false } = {}) {
  const T = TYPES[type];
  const x = laneX(lane);
  const e = {
    id: newId(),
    poison: 0, poisonT: 0, poisonTick: 0, poisoned: false,
    type, T, lane,
    dir: rng.chance(0.5) ? 1 : -1,
    x, y: -24, prevX: x, prevY: -24,
    r: T.r,
    // Boss minions: fragile, one volley, sit lower so they are easy to reach.
    hp: minion ? 2 : enemyHp(T.hp, difficulty, power, elite),
    elite,
    minion,
    holdY: minion ? 210 : T.holdY,
    t: 0,
    state: 'enter',   // enter -> telegraph -> fire -> rest -> ... -> leave
    stateT: 0,
    step: 0,
    steps: null,
    volleys: 0,
    maxVolleys: minion ? 1 : maxVolleys(T.volleys, difficulty) + (elite ? 1 : 0),
    telegraphLanes: [],
    dead: false,
  };
  e.steps = T.steps(e);
  enemies.push(e);
}

function fire(e, st, d) {
  const s = bulletSpeed(d);
  for (const l of st.lanes) {
    if (st.low) spawn(enemyBullets, laneX(l), e.y + 12, 0, s * 0.8, 10, 1, LOW);
    else spawn(enemyBullets, laneX(l), e.y + 12, 0, s, 5, 1, 0);
  }
}

function startTelegraph(e) {
  e.steps = e.T.steps(e);
  e.state = 'telegraph';
  e.stateT = 0;
  e.telegraphLanes = allSequenceLanes(e);
  sfx.telegraph();
}

// Lanes lit during telegraph: the whole sequence, so the player can plan.
function allSequenceLanes(e) {
  const set = new Set();
  for (const st of e.steps) for (const l of st.lanes) set.add(l);
  return [...set];
}

export function updateEnemies(dt, difficulty) {
  const d = difficulty;
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const T = e.T;
    if (e.type === 'boss') continue; // bosses drive themselves
    const m = timeMul(d) * (e.elite ? 1.15 : 1);
    e.prevX = e.x; e.prevY = e.y;
    e.t += dt;
    e.stateT += dt;
    if (e.hitFlash > 0) e.hitFlash -= dt;
    // Base x: lane centre, or mid-hop for hoppers.
    let baseX = laneX(e.lane);
    if (e.hopT !== undefined && e.hopT < 1) {
      e.hopT = Math.min(1, e.hopT + dt / 0.18);
      const k = 1 - (1 - e.hopT) * (1 - e.hopT);
      baseX = e.hopFromX + (laneX(e.lane) - e.hopFromX) * k;
    }
    // Elite jink: a half-lane sidestep and back. Patterns still fire from the
    // lane centre, so only the player's aim (and shot speed) is tested.
    if (e.jinkT > 0) {
      e.jinkT -= dt;
      const t = 1 - e.jinkT / JINK_TIME;
      e.jinkOff = Math.sin(Math.min(1, t) * Math.PI) * e.jinkDir * LANE_W * 0.45;
    } else e.jinkOff = 0;
    if (e.jinkCd > 0) e.jinkCd -= dt;
    if (e.type !== 'boss') e.x = baseX + (e.jinkOff || 0);

    switch (e.state) {
      case 'enter':
        e.y += 170 * dt;
        if (e.y >= e.holdY) { e.y = e.holdY; startTelegraph(e); }
        break;
      case 'telegraph':
        if (e.stateT >= T.telegraph / m && T.dive) {
          e.state = 'dive'; e.stateT = 0; e.telegraphLanes = [e.lane];
          sfx.dive();
        } else if (e.stateT >= T.telegraph / m) {
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
            if (e.state === 'rest' && T.afterVolley) T.afterVolley(e);
          } else {
            fire(e, e.steps[e.step], d);
            e.telegraphLanes = e.steps.slice(e.step + 1).flatMap((s) => s.lanes);
          }
        }
        break;
      }
      case 'rest':
        if (e.stateT >= T.rest / m) startTelegraph(e);
        break;
      case 'dive':
        e.y += T.dive * m * dt;
        if (Math.random() < 0.6) burst(e.x, e.y - 8, T.color, 1, 40, 0.25, 1.5);
        break;
      case 'leave':
        e.y += LEAVE_SPEED * dt;
        break;
    }
    if (e.y > H + 30) { enemies.splice(i, 1); i--; }
  }
}

// Marks the enemy dead; rewards are handled by the run so every damage
// source (bullets, arcs, frags, poison, EMP) is treated the same.
const JINK_TIME = 0.55;
export function damageEnemy(e, dmg) {
  if (e.dead) return false;
  if (e.elite && !(e.jinkCd > 0) && e.state !== 'enter') {
    e.jinkT = JINK_TIME;
    e.jinkCd = 2.2;
    e.jinkDir = e.lane <= 0 ? 1 : e.lane >= LANES - 1 ? -1 : (Math.random() < 0.5 ? -1 : 1);
  }
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
    const lowLanes = new Set();
    for (const st of e.steps) if (st.low) for (const l of st.lanes) lowLanes.add(l);
    for (const l of e.telegraphLanes) {
      const low = lowLanes.has(l);
      const x = laneX(l);
      const w = LANE_W - 8;
      // Soft lane fill
      ctxFill(x - w / 2, e.y, w, H - e.y, e.T.color, a * 0.18);
      line(x, e.y, x, H, e.T.color, 1 + prog * 2, a * 0.6);
      // Warning glyph at bottom: chevron = move, up-arrow = jump
      const cy = H - 22;
      if (low) strokePoly([x - 8, cy + 4, x, cy - 6, x + 8, cy + 4], e.T.color, 2.5, false);
      else strokePoly([x - 8, cy - 5, x, cy + 4, x + 8, cy - 5], e.T.color, 2.5, false);
      if (e.T.dive) strokePoly([x - 8, cy - 13, x, cy - 4, x + 8, cy - 13], e.T.color, 2.5, false);
    }
    // Hopper: arrow toward the lane it will jump to next
    if (e.type === 'hopper' && e.state !== 'leave') {
      let next = e.lane + e.dir;
      if (next < 0 || next >= LANES) next = e.lane - e.dir;
      const y = e.y + 22, x0 = laneX(e.lane), x1 = laneX(next);
      const d = Math.sign(x1 - x0);
      line(x0 + d * 12, y, x1, y, e.T.color, 1.5, 0.7);
      strokePoly([x1 - d * 6, y - 5, x1, y, x1 - d * 6, y + 5], e.T.color, 1.5, false);
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
    const tele = e.state === 'telegraph' && e.stateT > e.T.telegraph * 0.45 && Math.floor(e.stateT * 16) % 2 === 0;
    const flash = e.hitFlash > 0 ? 0.9 : tele ? 0.7 : 0;
    const t = e.t;

    // Ground shadow sells the "hovering above the track" look
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x + 4, y + r + 6, r * 1.1, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    if (e.elite) {
      ring(x, y, r + 9 + Math.sin(t * 6) * 1.5, PAL.amber, 2, 0.85);
      ring(x, y, r + 13, PAL.amber, 1, 0.35);
    }

    // Live parts under the body
    if (e.type === 'hopper') {
      const hop = e.hopT !== undefined && e.hopT < 1 ? Math.sin(e.hopT * Math.PI) : 0;
      const spread = 1 + hop * 0.5;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const kx = x + sx * 9 * spread, ky = y + sy * 6;
        line(x + sx * 4, y + sy * 3, kx, ky - 3, c, 2, 0.9);
        line(kx, ky - 3, x + sx * 13 * spread, y + sy * 12, c, 1.6, 0.9);
      }
    } else if (e.type === 'kamikaze') {
      const len = e.state === 'dive' ? 16 + Math.random() * 10 : 5 + Math.random() * 3;
      drawGlowDot(x, y - 14 - len * 0.4, PAL.amber, 4, 0.9);
      drawGlowDot(x, y - 14 - len, PAL.red, 3, 0.6);
    }

    const scale = (e.minion ? 0.8 : 1) * (e.type === 'wall' ? 1 : (r / ({ drone: 11, sweeper: 11, crusher: 12, hopper: 11, kamikaze: 10, tank: 16 }[e.type] || r)));
    drawSprite(enemySprite(e.type, c), x, y, { sx: scale, sy: scale, flash });

    // Live parts over the body
    if (e.type === 'drone') {
      for (const [dx, dy] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) {
        const a = t * 22 + dx;
        line(x + dx - Math.cos(a) * 5, y + dy - Math.sin(a) * 5, x + dx + Math.cos(a) * 5, y + dy + Math.sin(a) * 5, '#ffffff', 1, 0.45);
      }
    } else if (e.type === 'tank') {
      const off = (t * 40) % 6;
      for (const tx of [-15, 15]) for (let k = -18 + off; k < 20; k += 6) line(x + tx - 4, y + k, x + tx + 4, y + k, '#5a6a64', 1.2, 0.8);
    } else if (e.type === 'crusher' && e.state === 'telegraph') {
      drawGlowDot(x, y + 14, c, 4 + Math.sin(t * 30) * 1.5, 0.9);
    }
    if (e.poison > 0) drawGlowDot(x, y - r - 7, PAL.acid, 2.5, 0.8);
  }
}

export function clearEnemies() { enemies.length = 0; }
