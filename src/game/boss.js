// Bosses. Same rules as regular enemies: every attack is a fixed, telegraphed
// lane pattern cycled in order, so fights are learnable. Three phases each,
// switched at 2/3 and 1/3 HP. A safe option (lane, jump or phase) always exists.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, drawGlowDot, line, text, ring } from '../render/draw.js';
import { bossSprite, prismEmitterSprite, drawSprite, drawEye } from '../render/sprites.js';
import { look } from './enemies.js';
const PLAYER_ROW = H * 0.78;
import { enemyBullets, spawn, LOW } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { LANES, LANE_W, laneX } from './world.js';
import { enemies, spawnEnemy, newId } from './enemies.js';
import { sfx } from '../audio/audio.js';
import { bossHp, bossSpeed } from './balance.js';

const ALL = [0, 1, 2, 3, 4];
const HOLD_Y = 140;

// Attack parts: volley (n shots per lane), sweep (lanes in order), low (jumpable wave),
// beam (dense stream for `dur`), summon (drones in lanes).
const v = (lanes, shots = 3) => ({ kind: 'volley', lanes, shots });
const sw = (lanes, gap = 0.22) => ({ kind: 'sweep', lanes, gap });
const low = (lanes) => ({ kind: 'low', lanes });
const beam = (lanes, dur = 0.7) => ({ kind: 'beam', lanes, dur });
const summon = (lanes) => ({ kind: 'summon', lanes });
const beamSweep = (lanes, gap = 0.3, dur = 0.25) => ({ kind: 'beamsweep', lanes, gap, dur });
const atk = (parts, tele = 0.9, rest = 0.9) => ({ parts, tele, rest });

// Lanes may be a function of the player's lane, resolved ONCE when the
// telegraph starts ("target lock"): the pattern is still fixed and fair.
const clampL = (ls) => [...new Set(ls.filter((l) => l >= 0 && l < LANES))];
const at = (dl) => (pl) => clampL(dl.map((o) => pl + o));
const except = (dl) => (pl) => ALL.filter((l) => !dl.map((o) => pl + o).includes(l));

export const BOSSES = [
  {
    id: 'sentinel', name: 'SENTINEL', color: PAL.magenta,
    hit: [{ x: 0, y: 0, hw: 52, hh: 26 }, { x: -78, y: 0, hw: 26, hh: 13 }, { x: 78, y: 0, hw: 26, hh: 13 }],
    phases: [
      [atk([v([0, 2, 4])]), atk([v([1, 3])])],
      [atk([v([0, 2, 4])]), atk([sw([0, 1, 2, 3, 4])], 1.0), atk([v([1, 3])]), atk([sw([4, 3, 2, 1, 0])], 1.0)],
      [atk([v([0, 1, 3, 4], 4)]), atk([low(ALL)], 1.0), atk([sw([0, 1, 2, 3, 4], 0.18)], 1.0), atk([v([0, 2, 4]), low([1, 3])], 1.1)],
    ],
  },
  {
    id: 'hive', name: 'HIVE', color: PAL.acid,
    hit: [{ x: -62, y: 0, r: 23 }, { x: 0, y: 0, r: 27 }, { x: 62, y: 0, r: 23 }],
    phases: [
      // Drones always land in the outer lanes, so lane 2 stays readable as the safe spot.
      [atk([summon([0, 4])], 0.6, 1.8), atk([v([1, 3])])],
      [atk([summon([0, 4])], 0.6, 1.2), atk([v([2]), low([0, 1, 3, 4])], 1.0), atk([sw([1, 2, 3])])],
      [atk([summon([0, 4])], 0.6, 1.2), atk([low(ALL)], 1.0), atk([v([1, 3], 4)]), atk([sw([3, 2, 1], 0.18)], 1.0)],
    ],
  },
  {
    // Locks onto your lane when the telegraph starts, then fires there.
    id: 'hunter', name: 'HUNTER', color: PAL.red,
    hit: [{ x: 0, y: -2, hw: 40, hh: 22 }, { x: -65, y: 2, hw: 9, hh: 18 }, { x: 65, y: 2, hw: 9, hh: 18 }],
    phases: [
      [atk([v(at([0]), 4)], 0.8), atk([v(at([-1, 1]), 3)], 0.8)],
      [atk([v(at([0]), 4)], 0.7), atk([low(at([-1, 0, 1]))], 0.9), atk([v(at([-2, 0, 2]), 3)], 0.8)],
      [atk([beam(at([0]), 0.6), low(except([0]))], 1.0), atk([v(at([-1, 0, 1]), 3)], 0.7), atk([sw([0, 1, 2, 3, 4], 0.16)], 0.8)],
    ],
  },
  {
    // Beams sweeping across 4 lanes; the 5th lane is always safe (telegraphed).
    id: 'prism', name: 'PRISM', color: '#ff9cf0',
    hit: [{ x: 0, y: -2, hw: 22, hh: 22 }],
    phases: [
      [atk([beamSweep([0, 1, 2, 3])], 1.0), atk([beam([0, 2, 4], 0.5)], 0.9), atk([beamSweep([4, 3, 2, 1])], 1.0)],
      [atk([beam([0, 2, 4], 0.45)], 0.8, 0.4), atk([beam([1, 3], 0.45)], 0.7, 0.6), atk([low(ALL)], 0.9), atk([beamSweep([1, 2, 3, 4], 0.26)], 0.9)],
      [atk([beamSweep([0, 1, 2, 3], 0.24)], 0.9, 0.4), atk([beamSweep([4, 3, 2, 1], 0.24)], 0.8), atk([beam([1, 3], 0.5), low([0, 2, 4])], 1.0)],
    ],
  },
  {
    id: 'warden', name: 'WARDEN', color: PAL.orange,
    hit: [{ x: 0, y: 0, hw: 88, hh: 24 }],
    phases: [
      [atk([beam([0, 1])], 1.0), atk([beam([3, 4])], 1.0)],
      [atk([beam([2]), low([0, 1, 3, 4])], 1.1), atk([beam([0, 4]), v([2])], 1.0), atk([beam([1, 3])], 1.0)],
      [atk([beam([0, 2, 4])], 1.0, 0.6), atk([beam([1, 3])], 0.8, 0.6), atk([low(ALL), beam([2], 0.5)], 1.1), atk([sw([0, 1, 2, 3, 4], 0.16)], 0.9)],
    ],
  },
];

// index: how many bosses this run has beaten; defIndex: which boss (run order).
export function makeBoss(index, defIndex, power = 1) {
  const def = BOSSES[defIndex % BOSSES.length];
  const loop = Math.floor(index / BOSSES.length);   // elite loops
  const hp = bossHp(index, power);
  const b = {
    id: newId(),
    type: 'boss',
    def,
    name: loop > 0 ? `${def.name} MK${loop + 1}` : def.name,
    color: def.color,
    T: { color: def.color },
    x: W / 2, y: -90, prevX: W / 2, prevY: -90,
    hw: LANE_W * 1.6, hh: 26, r: 40,
    hitboxes: def.hit,   // collision follows the art, not a lane-wide box
    hp, maxHp: hp,
    phase: 0,
    atkIndex: 0,
    state: 'enter',
    stateT: 0,
    speed: bossSpeed(index),
    playerLane: 2,
    events: [],       // scheduled fire events for the current attack
    teleParts: [],
    t: 0,
    poison: 0, poisonT: 0, poisonTick: 0,
    dead: false,
    hitFlash: 0,
    phaseFlash: 0,
  };
  enemies.push(b);
  return b;
}

function currentAttack(b) {
  const list = b.def.phases[b.phase];
  return list[b.atkIndex % list.length];
}

function resolveParts(b, a) {
  return a.parts.map((p) => ({ ...p, lanes: typeof p.lanes === 'function' ? p.lanes(b.playerLane) : p.lanes }));
}

function buildEvents(b, parts) {
  const ev = [];
  for (const p of parts) {
    if (p.kind === 'volley') for (let i = 0; i < p.shots; i++) ev.push({ t: i * 0.14, part: p, lanes: p.lanes });
    else if (p.kind === 'sweep') p.lanes.forEach((l, i) => { ev.push({ t: i * p.gap, part: p, lanes: [l] }); ev.push({ t: i * p.gap + 0.07, part: p, lanes: [l] }); });
    else if (p.kind === 'low') ev.push({ t: 0, part: p, lanes: p.lanes });
    else if (p.kind === 'beam') for (let t = 0; t < p.dur; t += 0.045) ev.push({ t, part: p, lanes: p.lanes });
    else if (p.kind === 'summon') ev.push({ t: 0, part: p, lanes: p.lanes });
    else if (p.kind === 'beamsweep') p.lanes.forEach((l, i) => { for (let t = 0; t < p.dur; t += 0.045) ev.push({ t: i * p.gap + t, part: p, lanes: [l] }); });
  }
  ev.sort((x, y) => x.t - y.t);
  return ev;
}

function fireEvent(b, e, difficulty) {
  const p = e.part;
  const y = b.y + b.hh;
  for (const l of e.lanes) {
    const x = laneX(l);
    if (p.kind === 'low') spawn(enemyBullets, x, y, 0, 230, 10, 1, LOW);
    else if (p.kind === 'beam' || p.kind === 'beamsweep') spawn(enemyBullets, x, y, 0, 460, 5, 1, 0);
    else if (p.kind === 'summon') {
      // Never stack minions: skip a lane that already has a living one.
      if (!enemies.some((e) => e.minion && !e.dead && e.lane === l && e.state !== 'leave')) {
        spawnEnemy('drone', l, difficulty, { chance: () => false }, { minion: true });
      }
    }
    else spawn(enemyBullets, x, y, 0, 270 + b.speed * 25, 5, 1, 0);
  }
}

// Returns true while the boss is alive and fighting.
export function updateBoss(b, dt, difficulty, playerLane = 2) {
  b.playerLane = playerLane;
  b.prevX = b.x; b.prevY = b.y;
  b.t += dt;
  b.stateT += dt;
  if (b.hitFlash > 0) b.hitFlash -= dt;
  if (b.phaseFlash > 0) b.phaseFlash -= dt;
  b.x = W / 2 + Math.sin(b.t * 0.8) * 4;

  // Phase change by HP
  const want = b.hp < b.maxHp / 3 ? 2 : b.hp < (b.maxHp * 2) / 3 ? 1 : 0;
  if (want > b.phase && b.state !== 'enter') {
    b.phase = want;
    b.atkIndex = 0;
    b.state = 'rest';
    b.stateT = -0.6;        // short breather on phase change
    b.events = [];
    b.teleParts = [];
    b.phaseFlash = 0.6;
    shake(6, 0.3);
    burst(b.x, b.y, b.color, 30, 260, 0.7, 3);
    sfx.bossWarn();
  }

  const a = currentAttack(b);
  const m = b.speed;
  switch (b.state) {
    case 'enter':
      b.y += 90 * dt;
      if (b.y >= HOLD_Y) { b.y = HOLD_Y; b.state = 'rest'; b.stateT = 0.3; }
      break;
    case 'rest':
      if (b.stateT >= a.rest / m) {
        b.state = 'telegraph';
        b.stateT = 0;
        b.teleParts = resolveParts(b, a);   // target lock happens here
        sfx.telegraph();
      }
      break;
    case 'telegraph':
      if (b.stateT >= a.tele / m) {
        b.state = 'fire';
        b.stateT = 0;
        b.events = buildEvents(b, b.teleParts);
      }
      break;
    case 'fire':
      while (b.events.length && b.events[0].t <= b.stateT) fireEvent(b, b.events.shift(), difficulty);
      if (!b.events.length) {
        b.state = 'rest';
        b.stateT = 0;
        b.teleParts = [];
        b.atkIndex++;
      }
      break;
  }
  return !b.dead;
}

export function drawBossTelegraph(b) {
  if (!b || !b.teleParts.length) return;
  const prog = b.state === 'telegraph' ? Math.min(1, b.stateT / (currentAttack(b).tele / b.speed)) : 1;
  for (const p of b.teleParts) {
    const c = p.kind === 'low' ? PAL.orange : p.kind === 'summon' ? PAL.magenta : b.color;
    for (const l of p.lanes) {
      const x = laneX(l);
      const w = LANE_W - 8;
      ctx.globalAlpha = (0.05 + prog * 0.14) * (p.kind === 'beam' ? 1.6 : 1);
      ctx.fillStyle = c;
      ctx.fillRect(x - w / 2, b.y, w, H - b.y);
      ctx.globalAlpha = 1;
      line(x, b.y, x, H, c, 1 + prog * 2, 0.2 + prog * 0.4);
      const cy = H - 22;
      if (p.kind === 'low') strokePoly([x - 8, cy + 4, x, cy - 6, x + 8, cy + 4], c, 2.5, false);
      else if (p.kind === 'summon') { line(x - 6, cy, x + 6, cy, c, 2.5); line(x, cy - 6, x, cy + 6, c, 2.5); }
      else strokePoly([x - 8, cy - 5, x, cy + 4, x + 8, cy - 5], c, 2.5, false);
    }
    if (p.kind === 'sweep' || p.kind === 'beamsweep') {
      const y = b.y + 44;
      const x0 = laneX(p.lanes[0]), x1 = laneX(p.lanes[p.lanes.length - 1]);
      const dir = Math.sign(x1 - x0) || 1;
      line(x0, y, x1, y, c, 2, 0.4 + prog * 0.5);
      strokePoly([x1 - dir * 8, y - 6, x1, y, x1 - dir * 8, y + 6], c, 2, false);
    }
  }
}

export function drawBoss(b, alpha) {
  if (!b || b.dead) return;
  const x = b.prevX + (b.x - b.prevX) * alpha;
  const y = b.prevY + (b.y - b.prevY) * alpha;
  const tele = b.state === 'telegraph' && Math.floor(b.stateT * 14) % 2 === 0;
  const flash = b.hitFlash > 0 ? 0.8 : b.phaseFlash > 0 ? 1 : tele ? 0.5 : 0;
  const hw = b.hw, hh = b.hh;
  const id = b.def.id;
  const t = b.t;

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x + 6, y + hh + 14, hw * 0.8, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  if (id === 'prism') {
    drawSprite(prismEmitterSprite(b.color, hw), x, y + hh * 0.6, { flash });
    drawSprite(bossSprite(id, b.color, hw, hh), x, y - 2, { rot: Math.sin(t * 0.9) * 0.25, flash });
    drawGlowDot(x, y + 2, b.color, 7 + Math.sin(t * 5) * 1.5);
  } else {
    drawSprite(bossSprite(id, b.color, hw, hh), x, y, { flash });
  }

  // Live details
  const eyeCol = b.state === 'telegraph' ? '#ffffff' : '#d9c45a';
  if (id === 'sentinel') {
    drawEye(x, y, 13 + Math.sin(t * 3) * 0.8, eyeCol, look.x, look.y, b.hitFlash > 0 ? 0.5 : 0);
  } else if (id === 'hive') {
    for (const [cx, k] of [[-62, 0], [0, 1], [62, 2]]) {
      drawGlowDot(x + cx, y, b.color, 5 + Math.sin(t * 6 + k * 2) * 2, 0.9);
      drawGlowDot(x + cx + Math.cos(t * 3 + k) * 6, y + Math.sin(t * 3 + k) * 6, PAL.white, 1.6, 0.8);
    }
  } else if (id === 'hunter') {
    const tx = laneX(b.playerLane);
    const aim = b.state === 'telegraph' ? 0.9 : 0.25;
    line(x, y, tx, H - 30, b.color, 1.2, aim * 0.6);
    ring(tx, PLAYER_ROW, 16 + Math.sin(t * 10) * 2, b.color, 1.5, aim);
    drawEye(x, y - 4, 10, eyeCol, tx, PLAYER_ROW, 0);
  } else if (id === 'warden') {
    // beating heart: double pulse
    const beat = Math.max(0, Math.sin(t * 7)) ** 6 + Math.max(0, Math.sin(t * 7 - 0.9)) ** 6 * 0.6;
    drawGlowDot(x, y - 4, PAL.red, 6 + beat * 4);
    drawGlowDot(x, y - 4, '#ffffff', 2 + beat * 1.5, 0.8);
  }
  if (b.poison > 0) drawGlowDot(x + hw * 0.8, y - hh - 6, PAL.acid, 3);
}

export function drawBossBar(b) {
  if (!b || b.dead) return;
  const x = 16, y = 60, w = W - 32;
  text(b.name, W / 2, y - 6, { color: b.color, size: 10, align: 'center' });
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = b.color;
  ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 5);
  for (const f of [1 / 3, 2 / 3]) line(x + w * f, y - 1, x + w * f, y + 6, PAL.bg, 2);
}
