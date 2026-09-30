// Bosses. Same rules as regular enemies: every attack is a fixed, telegraphed
// lane pattern cycled in order, so fights are learnable. Three phases each,
// switched at 2/3 and 1/3 HP. A safe option (lane, jump or phase) always exists.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, drawGlowDot, line, text, ring } from '../render/draw.js';
import { enemyBullets, spawn, LOW } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { LANES, LANE_W, laneX } from './world.js';
import { enemies, spawnEnemy, newId } from './enemies.js';
import { sfx } from '../audio/audio.js';

const ALL = [0, 1, 2, 3, 4];
const HOLD_Y = 140;

// Attack parts: volley (n shots per lane), sweep (lanes in order), low (jumpable wave),
// beam (dense stream for `dur`), summon (drones in lanes).
const v = (lanes, shots = 3) => ({ kind: 'volley', lanes, shots });
const sw = (lanes, gap = 0.22) => ({ kind: 'sweep', lanes, gap });
const low = (lanes) => ({ kind: 'low', lanes });
const beam = (lanes, dur = 0.7) => ({ kind: 'beam', lanes, dur });
const summon = (lanes) => ({ kind: 'summon', lanes });
const atk = (parts, tele = 0.9, rest = 0.9) => ({ parts, tele, rest });

export const BOSSES = [
  {
    id: 'sentinel', name: 'SENTINEL', color: PAL.magenta,
    phases: [
      [atk([v([0, 2, 4])]), atk([v([1, 3])])],
      [atk([v([0, 2, 4])]), atk([sw([0, 1, 2, 3, 4])], 1.0), atk([v([1, 3])]), atk([sw([4, 3, 2, 1, 0])], 1.0)],
      [atk([v([0, 1, 3, 4], 4)]), atk([low(ALL)], 1.0), atk([sw([0, 1, 2, 3, 4], 0.18)], 1.0), atk([v([0, 2, 4]), low([1, 3])], 1.1)],
    ],
  },
  {
    id: 'hive', name: 'HIVE', color: PAL.acid,
    phases: [
      // Drones always land in the outer lanes, so lane 2 stays readable as the safe spot.
      [atk([summon([0, 4])], 0.6, 1.8), atk([v([1, 3])])],
      [atk([summon([0, 4])], 0.6, 1.2), atk([v([2]), low([0, 1, 3, 4])], 1.0), atk([sw([1, 2, 3])])],
      [atk([summon([0, 4])], 0.6, 1.2), atk([low(ALL)], 1.0), atk([v([1, 3], 4)]), atk([sw([3, 2, 1], 0.18)], 1.0)],
    ],
  },
  {
    id: 'warden', name: 'WARDEN', color: PAL.orange,
    phases: [
      [atk([beam([0, 1])], 1.0), atk([beam([3, 4])], 1.0)],
      [atk([beam([2]), low([0, 1, 3, 4])], 1.1), atk([beam([0, 4]), v([2])], 1.0), atk([beam([1, 3])], 1.0)],
      [atk([beam([0, 2, 4])], 1.0, 0.6), atk([beam([1, 3])], 0.8, 0.6), atk([low(ALL), beam([2], 0.5)], 1.1), atk([sw([0, 1, 2, 3, 4], 0.16)], 0.9)],
    ],
  },
];

export function makeBoss(index) {
  const def = BOSSES[index % BOSSES.length];
  const loop = Math.floor(index / BOSSES.length);   // elite loops
  const hp = Math.round(90 * (1 + 0.9 * index) * (loop > 0 ? 1.3 : 1));
  const b = {
    id: newId(),
    type: 'boss',
    def,
    name: loop > 0 ? `${def.name} MK${loop + 1}` : def.name,
    color: def.color,
    T: { color: def.color },
    x: W / 2, y: -90, prevX: W / 2, prevY: -90,
    hw: LANE_W * 1.6, hh: 26, r: 40,
    hp, maxHp: hp,
    phase: 0,
    atkIndex: 0,
    state: 'enter',
    stateT: 0,
    speed: 1 + loop * 0.15,
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

function buildEvents(b, a) {
  const ev = [];
  for (const p of a.parts) {
    if (p.kind === 'volley') for (let i = 0; i < p.shots; i++) ev.push({ t: i * 0.14, part: p, lanes: p.lanes });
    else if (p.kind === 'sweep') p.lanes.forEach((l, i) => { ev.push({ t: i * p.gap, part: p, lanes: [l] }); ev.push({ t: i * p.gap + 0.07, part: p, lanes: [l] }); });
    else if (p.kind === 'low') ev.push({ t: 0, part: p, lanes: p.lanes });
    else if (p.kind === 'beam') for (let t = 0; t < p.dur; t += 0.045) ev.push({ t, part: p, lanes: p.lanes });
    else if (p.kind === 'summon') ev.push({ t: 0, part: p, lanes: p.lanes });
  }
  ev.sort((x, y) => x.t - y.t);
  return ev;
}

function fireEvent(b, e, difficulty) {
  const p = e.part;
  const y = b.y + b.hh;
  for (const l of e.lanes) {
    const x = laneX(l);
    if (p.kind === 'low') spawn(enemyBullets, x, y, 0, 200, 10, 1, LOW);
    else if (p.kind === 'beam') spawn(enemyBullets, x, y, 0, 460, 5, 1, 0);
    else if (p.kind === 'summon') spawnEnemy('drone', l, difficulty, { chance: () => false });
    else spawn(enemyBullets, x, y, 0, 230 + b.speed * 20, 5, 1, 0);
  }
}

// Returns true while the boss is alive and fighting.
export function updateBoss(b, dt, difficulty) {
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
        b.teleParts = a.parts;
        sfx.telegraph();
      }
      break;
    case 'telegraph':
      if (b.stateT >= a.tele / m) {
        b.state = 'fire';
        b.stateT = 0;
        b.events = buildEvents(b, a);
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
    if (p.kind === 'sweep') {
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
  const flash = (b.state === 'telegraph' && Math.floor(b.stateT * 14) % 2 === 0) || b.hitFlash > 0 || b.phaseFlash > 0;
  const c = flash ? PAL.white : b.color;
  const hw = b.hw, hh = b.hh;
  const spin = b.t;
  if (b.def.id === 'sentinel') {
    strokePoly([x - hw, y, x - hw * 0.5, y - hh, x + hw * 0.5, y - hh, x + hw, y, x + hw * 0.5, y + hh, x - hw * 0.5, y + hh], c, 3);
    ring(x, y, 16 + Math.sin(spin * 4) * 2, c, 2);
    drawGlowDot(x, y, PAL.orange, 6);
    for (let k = -2; k <= 2; k++) drawGlowDot(x + k * LANE_W * 0.55, y + hh - 4, b.color, 2.5);
  } else if (b.def.id === 'hive') {
    for (let k = -1; k <= 1; k++) {
      const cx = x + k * hw * 0.62;
      const pts = [];
      for (let i = 0; i < 6; i++) { const a = spin * (k === 0 ? 1 : -1) + (i / 6) * Math.PI * 2; pts.push(cx + Math.cos(a) * 22, y + Math.sin(a) * 22); }
      strokePoly(pts, c, 2.5);
      drawGlowDot(cx, y, b.color, 4);
    }
  } else {
    strokePoly([x - hw, y - hh, x + hw, y - hh, x + hw * 0.8, y + hh, x - hw * 0.8, y + hh], c, 3);
    for (let k = -2; k <= 2; k++) {
      const ex = x + k * LANE_W * 0.55;
      line(ex, y + hh - 8, ex, y + hh + 4, c, 3);
    }
    drawGlowDot(x, y - 4, PAL.red, 5 + Math.sin(spin * 6) * 1.5);
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
