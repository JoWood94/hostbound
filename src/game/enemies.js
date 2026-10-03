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
import { strokePoly, line, ring, text } from '../render/draw.js';
import { drawEnemyBody, drawEnemyDeath, ATK_S, HIT_S, DEATH_S } from '../render/bestiary.js';
import { drawBossDeath, BOSS_DEATH_S } from '../render/bosses.js';

// Death animations left behind by killed enemies.
const corpses = [];
export function updateCorpses(dt, scroll) {
  for (let i = 0; i < corpses.length; i++) {
    const c = corpses[i];
    c.t += dt;
    if (!c.boss) c.y += scroll * 0.35 * dt;   // a boss dies where it held
    if (c.t > (c.boss ? BOSS_DEATH_S : DEATH_S)) { corpses.splice(i, 1); i--; }
  }
}
export function drawCorpses() {
  for (const c of corpses) {
    if (c.boss) drawBossDeath(c.boss, c.x, c.y, c.color, Math.min(1, c.t / BOSS_DEATH_S));
    else drawEnemyDeath(c.type, c.x, c.y, (c.r || 12) * c.k, c.color || PAL.white, Math.min(1, c.t / DEATH_S));
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

import { timeMul, enemyHp, extraVolleys } from './balance.js';
import { TICK_BASE } from '../core/tempo.js';

// Where a hopper jumps next: its direction, else back the other way, else it
// stays (both sides are a wall or another enemy).
function hopNext(e) {
  const free = (l) => l >= 0 && l < LANES && !enemies.some((o) => o !== e && !o.dead && o.type !== 'boss' && o.lane === l);
  if (free(e.lane + e.dir)) return e.lane + e.dir;
  if (free(e.lane - e.dir)) return e.lane - e.dir;
  return null;
}

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
  // One shot, then hops one lane in its direction (bounces off the walls and
  // off other enemies). An arrow shows the next lane. Teaches: track it, do
  // not follow it.
  hopper: {
    color: PAL.red, r: 11, hp: 3, holdY: 150, rest: 0.9, volleys: 4, unlockAt: 1500,
    steps: (e) => [{ lanes: [e.lane], delay: 0.12 }, { lanes: [e.lane], delay: 0 }],
    afterVolley: (e) => {
      const next = hopNext(e);
      if (next === null) return;
      e.dir = next - e.lane;
      e.hopFromX = e.x;
      e.lane = next;
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

// Trackers: from district 4 elites, from district 6 drones too, step one lane
// toward you between volleys (an arrow shows it during the rest). Movers and
// aimers (hopper, kamikaze, stalker) and the Wall keep their own rules.
const NO_TRACK = new Set(['hopper', 'kamikaze', 'stalker', 'wall']);
let shiftOk = () => true;
export const setShiftGuard = (fn) => { shiftOk = fn; };
function trackNext(e) {
  if (!e.track || look.lane === e.lane) return null;
  const l = e.lane + Math.sign(look.lane - e.lane);
  if (enemies.some((o) => o !== e && !o.dead && o.type !== 'boss' && o.lane === l)) return null;
  return shiftOk(e, l) ? l : null;
}

export function spawnEnemy(type, lane, difficulty, rng, { power = 1, elite = false, minion = false } = {}) {
  const T = TYPES[type];
  const district = Math.floor(difficulty / 2.5);
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
    maxHp: minion ? 2 : enemyHp(T.hp, difficulty, power, elite),
    elite,
    minion,
    holdY: minion ? 210 : T.holdY,
    t: 0,
    state: 'enter',   // enter -> telegraph -> fire -> rest -> ... -> leave
    stateT: 0,
    step: 0,
    steps: null,
    volleys: 0,
    // Fixed per type and tier (elites +1): the same section lasts the same at
    // the same depth, and gains a volley at tiers 3 and 6.
    maxVolleys: minion ? 1 : T.volleys + extraVolleys(Math.floor(difficulty / 2.5)) + (elite ? 1 : 0),
    // From tier 6 elites carry one trait (shown above the amber ring).
    trait: elite && difficulty >= 15 ? rng.pick(['shell', 'nervous', 'prolific']) : null,
    rng,
    track: !minion && !NO_TRACK.has(type) && ((elite && district >= 3) || (type === 'drone' && district >= 5)),
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
// One TICK is half a beat; the tempo climbs slowly and continuously with
// distance (core/tempo.js), like a DJ set creeping up.
// ---------------------------------------------------------------------------
const TICK = TICK_BASE;
// The reaction rule. A lane lights up TELE_TICKS before the first shot leaves,
// and every shot needs travelTicks(d) to reach you, whatever enemy fired it and
// from whatever height (its speed adapts). So "lit lane" always means the same
// time to react: learnable, with or without sound. It shortens slowly as the
// tempo climbs.
export const TELE_TICKS = 4;
// PREMONITION: lanes light up earlier (the enemy fires that much later).
let teleBonus = 0;
export function setTeleBonus(n) { teleBonus = n; }
export const teleBonusNow = () => teleBonus;
// Shots get there faster as the run goes: 7 ticks, 6 from district 3, 5 from
// district 6. Warning + travel: 2.3 s at the start (130 BPM), 1.9 s at 3000 m,
// 1.5 s at 6000 m, 1.0 s at the 270 BPM ceiling (~15600 m).
const travelTicks = (d) => (d >= 15 ? 5 : d >= 7.5 ? 6 : 7);
// Speed of a shot fired at height y: it reaches the player row in travelTicks.
// Bosses use it too, so a boss shoots exactly as fast as the district's mobs.
export const shotSpeed = (y, d) => (PLAYER_Y - y) / (travelTicks(d) * TICK / timeMul(d));
const JUMP_GAP = 0.65;    // s between two low waves in a row: one jump (0.45) + reaction
let clock = 0;            // in ticks
// Every tick at which something must be jumped reaches the player row: low
// waves already fired and wire rows on their way (run.js notes those). Each
// enemy spaces its own waves, but nothing spaced two enemies, or a wave and a
// row: two jumps 0.1-0.4 s apart, too close for two and too far for one.
// Now a new low wave lands on one of them (one jump takes both) or a whole
// jump away; otherwise it waits a tick, its lane still lit.
const jumps = new Map();  // key -> { tick, row }
export function noteJump(key, tick, row = false) { jumps.set(key, { tick: Math.round(tick), row }); }
export function jumpClash(tick, d, { wavesOnly = false } = {}) {
  const gap = Math.ceil(JUMP_GAP / (TICK / timeMul(d)));
  tick = Math.round(tick);
  for (const j of jumps.values()) {
    if (wavesOnly && j.row) continue;
    if (j.tick !== tick && Math.abs(j.tick - tick) < gap) return true;
  }
  return false;
}
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
// `at` is the clock to read it on: the renderer passes the clock interpolated
// between sim steps, so the lane light ramps every frame at 120 Hz too.
const teleProgress = (e, at = clock) => (e.state === 'telegraph' ? Math.max(0, Math.min(1, 1 - (e.fireAt - at) / (TELE_TICKS + teleBonus))) : 1);
let prevClock = 0;
const ticksOf = (sec) => Math.max(1, Math.round(sec / TICK));
// Lane -> { until, color }: lanes stay lit while a fired volley is still on its
// way, so the light means "danger now", not "danger was announced".
// It holds at full strength (no dip when the volley leaves) and then fades
// out over DANGER_FADE instead of snapping off.
const danger = new Map();
const DANGER_FADE = 0.22;
let prevSimT = 0;
const MOUTH = 18;         // shots leave from the creature's mouth, not its belly

function fire(e, st, d) {
  // One speed for every regular enemy shot, high or low: rhythm is readable
  // only if the spacing on screen matches the spacing in time.
  const y = e.y + MOUTH;
  const s = shotSpeed(y, d);
  const travel = (PLAYER_Y + 24 - y) / s;
  for (const l of st.lanes) {
    if (st.low) spawn(enemyBullets, laneX(l), y, 0, s, 10, 1, LOW);
    else spawn(enemyBullets, laneX(l), y, 0, s, 5, 1, 0);
    const prev = danger.get(l);
    if (!prev || prev.until < simT + travel) danger.set(l, { until: simT + travel, color: st.low ? PAL.orange : e.T.color });
  }
  e.muzzle = ATK_S;
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
  e.fireAt = e.teleAt + TELE_TICKS + teleBonus;
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
  prevClock = clock;
  clock += (dt * timeMul(d)) / TICK;
  prevSimT = simT;
  simT += dt;
  for (const [l, v] of danger) if (v.until + DANGER_FADE < simT) danger.delete(l);
  for (const [k, j] of jumps) if (j.tick < clock - 8) jumps.delete(k);
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
    if (e.shellCd > 0) e.shellCd -= dt;
    // WRAITH / PARALYTIC: a slowed enemy's schedule runs slower for a moment
    // (30% / 25%; a PARALYTIC freeze stops it). Its warnings only get longer,
    // never shorter, and low waves still go through the jump ledger when fired.
    if (e.freezeCd > 0) e.freezeCd -= dt;
    if (e.freezeT > 0) { e.freezeT -= dt; e.slowT = Math.max(e.slowT || 0, dt); }
    if (e.slowT > 0) {
      e.slowT -= dt;
      const lag = (e.freezeT > 0 ? 1 : e.slowK || 0.3) * (dt * timeMul(d)) / TICK;
      if (e.slowT <= 0) e.slowK = 0;
      if (e.fireAt !== undefined) e.fireAt += lag;
      if (e.restUntil !== undefined) e.restUntil += lag;
      if (e.teleAt !== undefined) e.teleAt += lag;
    }
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
          const due = e.steps[e.step + 1];
          if (due && due.low && jumpClash(clock + travelTicks(d), d)) { e.fireAt += 1; break; }
          e.step++;
          if (e.step >= e.steps.length) {
            e.volleys++;
            e.telegraphLanes = [];
            e.state = e.volleys >= e.maxVolleys ? 'leave' : 'rest';
            e.stateT = 0;
            // NERVOUS elites rest half as long (the warning itself never shortens)
            e.restUntil = clock + Math.max(1, Math.round(ticksOf(T.rest) * (e.trait === 'nervous' ? 0.5 : 1)));
            if (e.state === 'rest' && T.afterVolley) T.afterVolley(e);
          } else {
            const st = e.steps[e.step];
            fire(e, st, d);
            if (st.low) noteJump({}, clock + travelTicks(d));
            e.telegraphLanes = e.steps.slice(e.step + 1).flatMap((x) => x.lanes);
            // Two low waves back to back need a whole jump between them.
            const next = e.steps[e.step + 1];
            const minT = st.low && next && next.low ? Math.ceil(JUMP_GAP / (TICK / timeMul(d))) : 1;
            e.fireAt += st.delay > 0 ? Math.max(minT, ticksOf(st.delay)) : 0.001;
          }
        }
        break;
      case 'rest':
        if (clock >= e.restUntil) {
          const next = trackNext(e);
          if (next !== null) { e.hopFromX = e.x; e.lane = next; e.hopT = 0; }
          startTelegraph(e);
        }
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
  // SHELL elites shrug off one hit every 1.5 s (big, rare hits beat it).
  if (e.trait === 'shell' && !(e.shellCd > 0) && e.state !== 'enter') {
    e.shellCd = 1.5;
    burst(e.x, e.y, '#c9c2b0', 6, 110, 0.25, 2);
    return false;
  }
  if (e.elite && !(e.jinkCd > 0) && e.state !== 'enter') {
    e.jinkT = JINK_TIME;
    e.jinkCd = 2.2;
    e.jinkDir = e.lane <= 0 ? 1 : e.lane >= LANES - 1 ? -1 : (Math.random() < 0.5 ? -1 : 1);
  }
  e.hp -= dmg * (e.brandMul || 1);          // BRAND: marked enemies take more from everything
  e.hitFlash = HIT_S;
  burst(e.x, e.y, e.T.color, 3, 90, 0.25, 1.5);
  if (e.hp <= 0) {
    e.dead = true;
    corpses.push({ type: e.type, boss: e.type === 'boss' ? e.def.id : null, x: e.x, y: e.y, t: 0, k: e.minion ? 0.8 : 1, r: e.r, color: e.T.color });
    burst(e.x, e.y, e.T.color, 18, 180, 0.5, 2.5);
    burst(e.x, e.y, PAL.white, 6, 90, 0.3, 2);
    shake(3, 0.1);
    // PROLIFIC elites burst into two fragile drones in the free lanes beside them.
    if (e.trait === 'prolific') {
      for (const l of [e.lane - 1, e.lane + 1]) {
        if (l < 0 || l >= LANES || enemies.some((o) => !o.dead && o.lane === l && o.state !== 'leave')) continue;
        const m = spawnEnemy('drone', l, e.d, e.rng, { minion: true });
        m.y = e.y; m.prevY = e.y;
      }
    }
    return true;
  }
  return false;
}

// Lane warnings for telegraphed shots, under everything else: a COMB, short
// ticks slanting inward and up from both lane edges that scroll down toward you, in a
// shade of the threat colour that brightens as the shot nears. The inside of
// the lane stays pure black, so a magenta shot in a magenta lane keeps its full
// contrast; no continuous line, so it never reads as a beam or a laser. No
// countdown (the timing is learned), no fill, no alpha.
// Continuous shade (no brightness steps: a quantized tint jumped visibly while
// the warning ramped). Cached per 1/255 level, i.e. per distinct output colour.
const tintCache = new Map();
function tint(hex, k) {
  const q = Math.round(k * 255);
  const key = hex + q;
  let v = tintCache.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.round((c * q) / 255).toString(16).padStart(2, '0');
    v = `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
    tintCache.set(key, v);
  }
  return v;
}
const COMB_GAP = 20, COMB_DX = 6, COMB_DY = -5, COMB_W = 2, COMB_SPEED = 140;   // px, px/s
// a: 0.25..1, how close the shot is. fade: 0..1 brightness scale, for lanes
// going dark.
export function glowLane(l, color, a, fade = 1) {
  const x0 = laneX(l) - LANE_W / 2 + 3, w = LANE_W - 6;
  const L = x0 + 1.5, R = x0 + w - 1.5;
  const off = ((performance.now() / 1000) * COMB_SPEED) % COMB_GAP;   // wall clock: smooth at any refresh rate
  ctx.globalAlpha = 1;
  ctx.strokeStyle = tint(color, (0.3 + 0.4 * Math.min(1, a)) * fade);
  ctx.lineWidth = COMB_W; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = off - COMB_GAP; y < H; y += COMB_GAP) {
    // slanted inward and up: each pair reads as a chevron pointing up the lane
    ctx.moveTo(L, y); ctx.lineTo(L + COMB_DX, y + COMB_DY);
    ctx.moveTo(R, y); ctx.lineTo(R - COMB_DX, y + COMB_DY);
  }
  ctx.stroke();
}
function rgbaHex(hex, a) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = parseInt(h, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}

export function drawTelegraphs(alpha = 1) {
  const at = prevClock + (clock - prevClock) * alpha;
  // Strongest warning per lane wins; drawn once each.
  const lit = new Map();
  for (const e of enemies) {
    if (e.type === 'boss' || !e.telegraphLanes.length) continue;
    const prog = teleProgress(e, at);
    const a = 0.25 + prog * 0.75;
    for (const l of e.telegraphLanes) if (!lit.has(l) || lit.get(l).a < a) lit.set(l, { a, fade: 1, color: e.T.color });
  }
  // Volleys in flight keep their lanes lit until the shots pass you.
  const now = prevSimT + (simT - prevSimT) * alpha;
  for (const [l, v] of danger) {
    const fade = Math.max(0, Math.min(1, 1 - (now - v.until) / DANGER_FADE));
    const cur = lit.get(l);
    if (!cur || cur.a * cur.fade < fade) lit.set(l, { a: 1, fade, color: v.color });
  }
  for (const [l, { a, fade, color }] of lit) if (fade !== 0) glowLane(l, color, a, fade ?? 1);
  // Trackers resting: an arrow to the lane they will step into.
  for (const e of enemies) {
    if (e.state !== 'rest' || !e.track) continue;
    const next = trackNext(e);
    if (next === null) continue;
    const y = e.y + 24, x0 = laneX(e.lane), x1 = laneX(next);
    const d = Math.sign(x1 - x0);
    line(x0 + d * 12, y, x1, y, e.T.color, 1.5, 1);
    strokePoly([x1 - d * 6, y - 5, x1, y, x1 - d * 6, y + 5], e.T.color, 1.5, false);
  }
  for (const e of enemies) {
    if (e.type === 'boss' || !e.telegraphLanes.length) continue;
    const prog = teleProgress(e, at);
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
    const next = e.type === 'hopper' && e.state !== 'leave' ? hopNext(e) : null;
    if (next !== null) {
      const y = e.y + 22, x0 = laneX(e.lane), x1 = laneX(next);
      const d = Math.sign(x1 - x0);
      line(x0 + d * 12, y, x1, y, e.T.color, 1.5, 1);
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
    const t = e.t;

    // Elite: a solid amber ring, plus the trait mark above.
    if (e.elite) {
      ctx.strokeStyle = PAL.amber; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, r + 11 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2); ctx.stroke();
      if (e.trait) {
        const glyph = { shell: '◆', nervous: '!!', prolific: '+' }[e.trait];
        const col = e.trait === 'shell' ? (e.shellCd > 0 ? PAL.dim : '#d8d0bc') : e.trait === 'nervous' ? PAL.red : PAL.acid;
        text(glyph, x, y - r - 22, { color: col, size: 10, align: 'center', font: 'display' });
      }
    }

    const tp = e.state === 'telegraph' ? teleProgress(e) : 0;
    const hop = e.hopT !== undefined && e.hopT < 1 ? Math.sin(e.hopT * Math.PI) : 0;
    // Sheet rows: idle on the age, the wind-up on telegraph progress, then
    // the shot and the hit as one-shots counted down by muzzle / hitFlash.
    drawEnemyBody(e.type, x, y, r, {
      color: c, t, tele: tp, lookX: look.x, lookY: look.y, dir: e.dir, hop,
      dive: e.state === 'dive', minion: e.minion,
      atk: e.muzzle > 0 ? 1 - e.muzzle / ATK_S : -1,
      hit: e.hitFlash > 0 ? 1 - e.hitFlash / HIT_S : -1,
    });
  }
}

export function clearEnemies() { enemies.length = 0; corpses.length = 0; danger.clear(); jumps.clear(); }
