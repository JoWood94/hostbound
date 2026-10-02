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
import { enemySprite, drawSprite, drawEye, EYES } from '../render/sprites.js';
import { sheet, drawCell } from '../render/images.js';

// Generated Brood sheet: 8x7 cells of 128 px. Rows in TYPES order below;
// columns 0-3 idle, 4-5 warning, 6-7 death.
const BROOD = sheet('enemies_brood', 128);
const BROOD2 = sheet('enemies_brood2', 128);
// type -> [sheet, row]. Second sheet: the rhythm teachers.
const ART = {
  drone: [BROOD, 0], sweeper: [BROOD, 1], crusher: [BROOD, 2], hopper: [BROOD, 3], kamikaze: [BROOD, 4], wall: [BROOD, 5], tank: [BROOD, 6],
  brooder: [BROOD2, 0], stalker: [BROOD2, 1], throb: [BROOD2, 2], weaver: [BROOD2, 3],
};
// Idle frames per type (default columns 0-3). The stalker's 2-4 show its body
// side-on without the eye, a different read: it hovers on its front pose.
const IDLE = { stalker: [0] };
const BROOD_SIZE = 64;
// Death animations left behind by killed enemies.
const corpses = [];
export function updateCorpses(dt, scroll) {
  for (let i = 0; i < corpses.length; i++) {
    const c = corpses[i];
    c.t += dt; c.y += scroll * 0.35 * dt;
    if (c.t > 0.5) { corpses.splice(i, 1); i--; }
  }
}
export function drawCorpses() {
  if (!BROOD.ready && !BROOD2.ready) return;
  for (const c of corpses) {
    const col = c.t < 0.14 ? 6 : 7;
    const [sh, row] = ART[c.type];
    if (!sh.ready) continue;
    drawCell(sh, row, col, c.x, c.y, BROOD_SIZE * c.k, { alpha: c.t < 0.14 ? 1 : Math.max(0, 1 - (c.t - 0.14) / 0.36) });
  }
}

// Where creature eyes look (the player's ship), set each frame by main.js.
export const look = { x: 180, y: 500, lane: 2 };
import { enemyBullets, spawn, LOW } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { LANES, LANE_W, laneX } from './world.js';
import { PLAYER_Y } from './player.js';
import { sfx } from '../audio/audio.js';

let nextId = 1;
export const newId = () => nextId++;

export const enemies = [];

import { timeMul, enemyHp } from './balance.js';
import { TICK_BASE } from '../core/tempo.js';

// The enemy's lane and its neighbours, clamped to the track.
const around = (e) => [e.lane - 1, e.lane, e.lane + 1].filter((l) => l >= 0 && l < LANES);

const others = (e) => [0, 1, 2, 3, 4].filter((l) => l !== e.lane && l < LANES);

// steps(e) returns the volley for the current cycle: [{ lanes, delay, low }].
// It is re-evaluated before every telegraph, so patterns may depend on
// e.lane (hopper moves) or e.volleys (tank alternates) and stay deterministic.
export const TYPES = {
  drone: {
    color: PAL.magenta, r: 11, hp: 2, holdY: 160, rest: 1.6, volleys: 2, unlockAt: 0,
    steps: (e) => [
      { lanes: [e.lane], delay: 0.15 },
      { lanes: [e.lane], delay: 0.15 },
      { lanes: [e.lane], delay: 0 },
    ],
  },
  sweeper: {
    color: PAL.orange, r: 11, hp: 4, holdY: 140, rest: 2.0, volleys: 2, unlockAt: 500,
    // From ~1200 m it sweeps there and back: a pendulum to dodge in time.
    steps: (e) => {
      const a = around(e);
      let order = e.dir > 0 ? a : [...a].reverse();
      if (e.d >= 3) order = [...order, ...[...order].reverse().slice(1)];
      return order.map((l, i) => ({ lanes: [l], delay: i < order.length - 1 ? 0.3 : 0 }));
    },
  },
  crusher: {
    color: PAL.acid, r: 12, hp: 6, holdY: 120, rest: 2.4, volleys: 2, unlockAt: 1000,
    steps: (e) => [{ lanes: around(e), delay: 0, low: true }],
  },
  // One shot, then hops one lane in its direction (bounces off the walls).
  // An arrow shows the next lane. Teaches: track it, do not follow it.
  hopper: {
    color: PAL.red, r: 11, hp: 3, holdY: 150, rest: 0.9, volleys: 4, unlockAt: 1500,
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
    color: PAL.amber, r: 10, hp: 3, holdY: 110, rest: 0, volleys: 1, unlockAt: 2000,
    dive: 520,
    steps: (e) => [{ lanes: [e.lane], delay: 0 }],
  },
  // Fires every lane except its own. Teaches: get under it.
  wall: {
    color: PAL.violet, r: 14, hp: 7, holdY: 120, rest: 2.0, volleys: 2, unlockAt: 2500,
    // From ~1600 m it squeezes in rhythm: everything but its lane, then ONLY its
    // lane, then everything else again. Step under it, out, back in.
    steps: (e) => (e.d >= 4
      ? [{ lanes: others(e), delay: 0.42 }, { lanes: [e.lane], delay: 0.42 }, { lanes: others(e), delay: 0 }]
      : [{ lanes: others(e), delay: 0.16 }, { lanes: others(e), delay: 0 }]),
  },
  // Alternates a low wave on every lane (jump) and shots two lanes out.
  tank: {
    color: PAL.mint, r: 16, hp: 14, holdY: 110, rest: 1.8, volleys: 4, unlockAt: 3000,
    // From ~2000 m the low waves come as a drum roll: jump, jump, jump.
    steps: (e) => (e.volleys % 2 === 0
      ? (e.d >= 5
        ? [0, 1, 2].map((i) => ({ lanes: [0, 1, 2, 3, 4], delay: i < 2 ? 0.55 : 0, low: true }))
        : [{ lanes: [0, 1, 2, 3, 4], delay: 0, low: true }])
      : [0, 1, 2].map((i) => ({ lanes: [e.lane - 2, e.lane + 2].filter((l) => l >= 0 && l < LANES), delay: i < 2 ? 0.14 : 0 }))),
  },
};

// --- second wave of the Brood: rhythm teachers -----------------------------
// Lays three eggs down its own lane on a beat: jump, jump, jump (or step out).
TYPES.brooder = {
  color: '#ffd23f', r: 12, hp: 4, holdY: 150, rest: 1.6, volleys: 2, unlockAt: 700,
  steps: (e) => [0, 1, 2].map((i) => ({ lanes: [e.lane], delay: i < 2 ? 0.42 : 0, low: true })),
};
// Locks onto your lane (its own or a neighbour, never further) when the
// telegraph starts, then fires two needles there. Move after the lock.
TYPES.stalker = {
  color: '#ff5c8a', r: 10, hp: 3, holdY: 170, rest: 1.3, volleys: 3, unlockAt: 1200,
  steps: (e) => {
    const t = Math.max(0, e.lane - 1, Math.min(e.lane + 1, e.target ?? e.lane, LANES - 1));
    return [{ lanes: [t], delay: 0.21 }, { lanes: [t], delay: 0 }];
  },
};
// Heartbeat: its lane, then both neighbours, on a steady pulse. Dance in and
// out of the gap, or stay two lanes away.
TYPES.throb = {
  color: PAL.blue, r: 13, hp: 7, holdY: 130, rest: 1.8, volleys: 2, unlockAt: 1800,
  steps: (e) => {
    const side = [e.lane - 1, e.lane + 1].filter((l) => l >= 0 && l < LANES);
    return [[e.lane], side, [e.lane], side].map((lanes, i) => ({ lanes, delay: i < 3 ? 0.4 : 0 }));
  },
};
// Weaves a moving hole through its three lanes, one row per beat.
TYPES.weaver = {
  color: '#ff9cf0', r: 13, hp: 8, holdY: 120, rest: 2.0, volleys: 2, unlockAt: 2300,
  steps: (e) => {
    const win = around(e);
    const path = e.dir > 0 ? [e.lane - 1, e.lane, e.lane + 1, e.lane] : [e.lane + 1, e.lane, e.lane - 1, e.lane];
    return path.map((h, i) => ({ lanes: win.filter((l) => l !== h), delay: i < 3 ? 0.38 : 0 }));
  },
};

export function spawnEnemy(type, lane, difficulty, rng, { power = 1, elite = false, minion = false } = {}) {
  const T = TYPES[type];
  const x = laneX(lane);
  const e = {
    id: newId(),
    poison: 0, poisonT: 0, poisonTick: 0, poisoned: false,
    type, T, lane,
    d: difficulty,          // patterns gain rhythmic variants as the run goes on
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
    // Fixed per type (elites +1): a section always lasts the same, so it can be learned.
    maxVolleys: minion ? 1 : T.volleys + (elite ? 1 : 0),
    telegraphLanes: [],
    dead: false,
  };
  e.steps = T.steps(e);
  enemies.push(e);
  return e;
}

// ---------------------------------------------------------------------------
// Rhythm. Every regular enemy fires on one shared metronome, so shots from
// different enemies land on the same grid and a volley has a steady pulse.
// One TICK is half a beat; the tempo steps up once per district (1000 m), like
// a track changing BPM, instead of drifting continuously.
// ---------------------------------------------------------------------------
const TICK = TICK_BASE;
// The reaction rule. A lane lights up TELE_TICKS before the first shot leaves,
// and every shot needs TRAVEL_TICKS to reach you, whatever enemy fired it and
// from whatever height (its speed adapts). So "lit lane" always means the same
// time to react: learnable, with or without sound. It shortens only when the
// tempo steps up (one step per district).
const TELE_TICKS = 4;
const TRAVEL_TICKS = 8;
const JUMP_GAP = 0.65;    // s between two low waves in a row: one jump (0.45) + reaction
let clock = 0;            // in ticks
let simT = 0;             // seconds, for the danger glow
export const beatClock = () => clock;
// Rhythm-game trick: nudge a shot's speed (a few %) so it reaches the player
// row exactly on a tick, whatever height it was fired from. Shots fired on the
// same tick by different enemies then also LAND together, on the music.
export function onGridSpeed(speed, dist, d) {
  const tickSec = TICK / timeMul(d);
  const ticks = Math.max(1, Math.round(clock + dist / speed / tickSec) - clock);
  return dist / (ticks * tickSec);
}   // ticks; the director schedules on it
export const TICK_SEC = TICK;
// 0 when a lane lights up, 1 when its first shot leaves.
const teleProgress = (e) => (e.state === 'telegraph' ? Math.max(0, Math.min(1, 1 - (e.fireAt - clock) / TELE_TICKS)) : 1);
const ticksOf = (sec) => Math.max(1, Math.round(sec / TICK));
// Lane -> { until, color }: lanes stay lit while a fired volley is still on its
// way, so the light means "danger now", not "danger was announced".
const danger = new Map();
const MOUTH = 18;         // shots leave from the creature's mouth, not its belly

function fire(e, st, d) {
  // One speed for every regular enemy shot, high or low: rhythm is readable
  // only if the spacing on screen matches the spacing in time.
  const y = e.y + MOUTH;
  const s = (PLAYER_Y - y) / (TRAVEL_TICKS * TICK / timeMul(d));
  const travel = (PLAYER_Y + 24 - y) / s;
  for (const l of st.lanes) {
    if (st.low) spawn(enemyBullets, laneX(l), y, 0, s, 10, 1, LOW);
    else spawn(enemyBullets, laneX(l), y, 0, s, 5, 1, 0);
    const prev = danger.get(l);
    if (!prev || prev.until < simT + travel) danger.set(l, { until: simT + travel, color: st.low ? PAL.orange : e.T.color });
  }
  e.muzzle = 0.12;
  burst(e.x, y, st.low ? PAL.orange : e.T.color, 4, 70, 0.18, 1.6);
  sfx.enemyShot();
}

// The warning itself starts on a tick, so every lit lane lasts exactly
// TELE_TICKS: an enemy that arrives between ticks holds still until the next.
function startTelegraph(e) {
  e.state = 'wait';
  e.stateT = 0;
  e.teleAt = Math.ceil(clock);
}
function beginTelegraph(e) {
  e.target = look.lane;            // target lock (stalker), resolved once per volley
  e.steps = e.T.steps(e);
  e.state = 'telegraph';
  e.stateT = 0;
  e.fireAt = e.teleAt + TELE_TICKS;
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
  clock += (dt * timeMul(d)) / TICK;
  simT += dt;
  for (const [l, v] of danger) if (v.until < simT) danger.delete(l);
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    const T = e.T;
    if (e.type === 'boss') continue; // bosses drive themselves
    const m = timeMul(d);   // dive speed; everything else runs on the tick clock
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

    if (e.muzzle > 0) e.muzzle -= dt;
    switch (e.state) {
      case 'enter': {
        // Glide in and settle (ease-out), no hard stop.
        e.enterT = (e.enterT || 0) + dt / 0.65;
        const k = 1 - Math.pow(1 - Math.min(1, e.enterT), 3);
        e.y = -24 + (e.holdY + 24) * k;
        if (e.enterT >= 1) { e.y = e.holdY; startTelegraph(e); }
        break;
      }
      case 'wait':
        if (clock >= e.teleAt) beginTelegraph(e);
        break;
      case 'telegraph':
        if (clock >= e.fireAt && T.dive) {
          e.state = 'dive'; e.stateT = 0; e.telegraphLanes = [e.lane];
          sfx.dive();
        } else if (clock >= e.fireAt) {
          e.state = 'fire'; e.stateT = 0; e.step = -1;
        }
        break;
      case 'fire':
        if (clock >= e.fireAt) {
          e.step++;
          if (e.step >= e.steps.length) {
            e.volleys++;
            e.telegraphLanes = [];
            e.state = e.volleys >= e.maxVolleys ? 'leave' : 'rest';
            e.stateT = 0;
            e.restUntil = clock + ticksOf(T.rest);
            if (e.state === 'rest' && T.afterVolley) T.afterVolley(e);
          } else {
            const st = e.steps[e.step];
            fire(e, st, d);
            e.telegraphLanes = e.steps.slice(e.step + 1).flatMap((x) => x.lanes);
            // Two low waves back to back need a whole jump between them.
            const next = e.steps[e.step + 1];
            const minT = st.low && next && next.low ? Math.ceil(JUMP_GAP / (TICK / timeMul(d))) : 1;
            e.fireAt += st.delay > 0 ? Math.max(minT, ticksOf(st.delay)) : 0.001;
          }
        }
        break;
      case 'rest':
        if (clock >= e.restUntil) startTelegraph(e);
        break;
      case 'dive':
        e.y += T.dive * m * dt;
        if (Math.random() < 0.6) burst(e.x, e.y - 8, T.color, 1, 40, 0.25, 1.5);
        break;
      case 'leave':
        // Done: pull back up and away (ease-in), never drift down through
        // its own bullets.
        e.leaveT = (e.leaveT || 0) + dt;
        e.y -= (40 + 520 * e.leaveT) * dt;
        break;
    }
    if (e.y > H + 30 || (e.state === 'leave' && e.y < -60)) { enemies.splice(i, 1); i--; }
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
    if (ART[e.type]) corpses.push({ type: e.type, x: e.x, y: e.y, t: 0, k: e.minion ? 0.8 : 1 });
    burst(e.x, e.y, e.T.color, 18, 180, 0.5, 2.5);
    burst(e.x, e.y, PAL.white, 6, 90, 0.3, 2);
    shake(3, 0.1);
    return true;
  }
  return false;
}

// Glowing lane strips for telegraphed shots, under everything else.
// Lights a whole lane, top to bottom: a smooth vertical gradient (stronger
// toward the player, who has to read it) and glowing edges. One call per lane
// per frame: callers dedupe, so overlapping warnings never stack into steps.
export function glowLane(l, color, a) {
  const x = laneX(l) - LANE_W / 2 + 3, w = LANE_W - 6;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, rgbaHex(color, a * 0.08));
  g.addColorStop(0.55, rgbaHex(color, a * 0.2));
  g.addColorStop(1, rgbaHex(color, a * 0.32));
  ctx.fillStyle = g;
  ctx.fillRect(x, 0, w, H);
  line(x, 0, x, H, color, 1.5, a * 0.75);
  line(x + w, 0, x + w, H, color, 1.5, a * 0.75);
}
function rgbaHex(hex, a) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

export function drawTelegraphs() {
  // Strongest warning per lane wins; drawn once each.
  const lit = new Map();
  for (const e of enemies) {
    if (e.type === 'boss' || !e.telegraphLanes.length) continue;
    const prog = teleProgress(e);
    const a = 0.25 + prog * 0.75;
    for (const l of e.telegraphLanes) if (!lit.has(l) || lit.get(l).a < a) lit.set(l, { a, color: e.T.color });
  }
  // Volleys in flight keep their lanes lit until the shots pass you.
  for (const [l, v] of danger) if (!lit.has(l) || lit.get(l).a < 0.75) lit.set(l, { a: 0.75, color: v.color });
  for (const [l, { a, color }] of lit) glowLane(l, color, a);
  for (const e of enemies) {
    if (e.type === 'boss' || !e.telegraphLanes.length) continue;
    const prog = teleProgress(e);
    const a = 0.12 + prog * 0.4;
    const lowLanes = new Set();
    for (const st of e.steps) if (st.low) for (const l of st.lanes) lowLanes.add(l);
    for (const l of e.telegraphLanes) {
      const low = lowLanes.has(l);
      const x = laneX(l);
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
    const tele = e.state === 'telegraph' && teleProgress(e) > 0.45 && Math.floor(e.stateT * 16) % 2 === 0;
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
    } else if (e.type === 'tank') {
      for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {
        const sw = Math.sin(t * 9 + k * 2 + (s > 0 ? Math.PI : 0)) * 3;
        line(x + s * 11, y + k * 9, x + s * 19, y + k * 9 + sw, '#3a1a2a', 2.4, 1);
        line(x + s * 19, y + k * 9 + sw, x + s * 22, y + k * 9 + 5 + sw, '#3a1a2a', 1.8, 1);
      }
    } else if (e.type === 'drone') {
      // wing membranes flutter: a faint pulse ring
      ring(x, y, 15 + Math.sin(t * 14) * 1.5, c, 1, 0.18);
    } else if (e.type === 'kamikaze') {
      const len = e.state === 'dive' ? 16 + Math.random() * 10 : 5 + Math.random() * 3;
      drawGlowDot(x, y - 14 - len * 0.4, PAL.amber, 4, 0.9);
      drawGlowDot(x, y - 14 - len, PAL.red, 3, 0.6);
    }

    // Bio-creatures breathe.
    const breathe = 1 + Math.sin(t * 3.2 + e.id) * 0.035;

    // Generated sprite sheet when available
    const art = ART[e.type];
    if (art && art[0].ready) {
      const warn = e.state === 'telegraph' && teleProgress(e) > 0.35;
      const idle = IDLE[e.type];
      const col = warn ? 4 + (Math.floor(e.stateT * 12) % 2) : idle ? idle[Math.floor(t * 6 + e.id) % idle.length] : Math.floor(t * 6 + e.id) % 4;
      if (e.type === 'kamikaze' && e.state === 'dive') {
        drawGlowDot(x, y - 18, PAL.amber, 4, 0.9);
      }
      drawCell(art[0], art[1], col, x, y, BROOD_SIZE * breathe * (e.minion ? 0.8 : 1), { flash: e.hitFlash > 0 ? 0.7 : 0 });
      if (e.muzzle > 0) { drawGlowDot(x, y + MOUTH, c, 7 * (e.muzzle / 0.12) + 2, 0.9); drawGlowDot(x, y + MOUTH, '#ffffff', 2.5, e.muzzle / 0.12); }
      if (e.poison > 0) drawGlowDot(x, y - r - 7, PAL.acid, 2.5, 0.8);
      continue;
    }
    const scale = breathe * (e.minion ? 0.8 : 1) * (e.type === 'wall' ? 1 : (r / ({ drone: 11, sweeper: 11, crusher: 12, hopper: 11, kamikaze: 10, tank: 16 }[e.type] || r)));
    drawSprite(enemySprite(e.type, c), x, y, { sx: scale, sy: scale, flash });

    // Live parts over the body: eyes track the ship, telegraph makes them flare.
    const blink = (Math.sin(t * 0.7 + e.id * 1.7) > 0.985) ? 0.9 : 0;
    const eyeCol = tele ? '#ffffff' : e.elite ? PAL.amber : '#d9c45a';
    for (const [ex, ey, er] of EYES[e.type] || []) drawEye(x + ex * scale, y + ey * scale, er * scale * (tele ? 1.25 : 1), eyeCol, look.x, look.y, blink);
    if (e.muzzle > 0) { drawGlowDot(x, y + MOUTH, c, 7 * (e.muzzle / 0.12) + 2, 0.9); drawGlowDot(x, y + MOUTH, '#ffffff', 2.5, e.muzzle / 0.12); }
    if (e.type === 'crusher' && e.state === 'telegraph') {
      drawGlowDot(x, y + 9, c, 4 + Math.sin(t * 30) * 1.5, 0.9);
    }
    if (e.poison > 0) drawGlowDot(x, y - r - 7, PAL.acid, 2.5, 0.8);
  }
}

export function clearEnemies() { enemies.length = 0; corpses.length = 0; danger.clear(); }
