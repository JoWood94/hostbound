// Player weapon. Reads the final stats object only, so every item combination
// composes without special cases. Also resolves on-hit effects.
import { playerBullets, spawn, kill, BIG, PELLET, ROCKET, SINE } from './bullets.js';
import { enemies, damageEnemy } from './enemies.js';
import { LANE_W, LANES, laneX } from './world.js';
import { enemySprite, drawSprite } from '../render/sprites.js';
import { PLAYER_Y } from './player.js';
import { PAL } from '../render/palette.js';
import { burst, shake } from '../render/fx.js';
import { line, ring, drawGlowDot } from '../render/draw.js';
import { sfx } from '../audio/audio.js';

// Short-lived visual effects owned by the weapon (lightning arcs, frag rings).
const arcs = [];
const rings = [];

export function currentDamage(p, stats) {
  let d = stats.damage * stats.damageMul;
  if (stats.adrenaline && p.hearts === 1) d *= 2;
  if (stats.bloodPact) d *= 1 + 0.25 * stats.bloodPact * Math.max(0, stats.maxHearts - p.hearts);
  if (stats.ambush && p.ambushT > 0) d *= 1 + 0.75 * stats.ambush;
  return d;
}

// ---------------------------------------------------------------------------
// Wingmen: friendly drones in neighbouring lanes
// ---------------------------------------------------------------------------
const wingmen = [];
export function updateWingmen(p, stats, dt) {
  const lanes = [];
  for (const o of [-1, 1, -2, 2]) {
    const l = p.lane + o;
    if (l >= 0 && l < LANES && lanes.length < stats.wingmen) lanes.push(l);
  }
  while (wingmen.length < lanes.length) wingmen.push({ x: p.x, fireT: 0.3, t: Math.random() * 6 });
  wingmen.length = lanes.length;
  lanes.forEach((l, i) => {
    const w = wingmen[i];
    w.t += dt;
    w.x += (laneX(l) - w.x) * Math.min(1, dt * 12);
    w.fireT -= dt;
    if (w.fireT <= 0) {
      w.fireT += 1 / (stats.fireRate * (stats.squadron ? 0.75 : 0.5));
      const bi = spawn(playerBullets, w.x, PLAYER_Y - 30, 0, -stats.bulletSpeed, 2.4, currentDamage(p, stats) * 0.6, 0, stats.pierce);
      if (bi >= 0) playerBullets.lane[bi] = l;
    }
  });
}
export function drawWingmen() {
  for (const w of wingmen) {
    const y = PLAYER_Y - 16 + Math.sin(w.t * 4) * 2;
    drawSprite(enemySprite('drone', PAL.cyan), w.x, y, { sx: 0.55, sy: 0.55 });
    for (const dx of [-6, 6]) line(w.x + dx - Math.cos(w.t * 30) * 3, y - 6, w.x + dx + Math.cos(w.t * 30) * 3, y - 6, PAL.white, 1, 0.5);
  }
}

// Movement-driven shots
export function groundPound(p, stats) {
  const lanes = stats.aftershock ? [p.lane - 1, p.lane, p.lane + 1] : [p.lane];
  for (const l of lanes) {
    if (l < 0 || l >= LANES) continue;
    spawn(playerBullets, laneX(l), PLAYER_Y - 10, 0, -620, 6, currentDamage(p, stats) * 2 * stats.groundPound, BIG, 20);
  }
  rings.push({ x: p.x, y: PLAYER_Y, r: 34, t: 0.25 });
}
export function slipBurst(p, stats) {
  for (const sp of [560, 640, 720]) spawn(playerBullets, p.x, PLAYER_Y - 14, 0, -sp, 2.6, currentDamage(p, stats) * 0.7 * stats.slipstream, 0, stats.pierce);
}
export function addRing(x, y, r) { rings.push({ x, y, r, t: 0.25 }); }

// Shots per second relative to stats.fireRate, per fire mode.
const MODE_RATE = { bolt: 1, scatter: 0.35, railgun: 0.16, rockets: 0.6, sine: 1 };

// Fires if the timer allows. `rateMul` is used by OVERDRIVE. `hit` = {rng, onCrit}.
export function updateWeapon(p, stats, dt, rateMul = 1, hit = null) {
  const mode = stats.fireMode;
  if (mode === 'laser') { updateLaser(p, stats, dt, rateMul, hit); return; }
  const rate = stats.fireRate * rateMul * (MODE_RATE[mode] ?? 1);
  p.fireTimer -= dt;
  p.charge = Math.max(0, Math.min(1, 1 - p.fireTimer * rate));
  if (p.fireTimer > 0) return;
  p.fireTimer += 1 / rate;
  if (p.fireTimer < 0) p.fireTimer = 0;
  p.shotCount++;
  if (mode === 'scatter') { fireScatter(p, stats); return; }
  if (mode === 'railgun') { fireRail(p, stats, hit); return; }
  if (mode === 'rockets') { fireRocket(p, stats); return; }
  if (mode === 'sine') { fireSine(p, stats); return; }

  const dmg = currentDamage(p, stats);
  const speed = stats.bulletSpeed;
  const y = PLAYER_Y - 14;

  const tag = (i) => { if (i >= 0) playerBullets.lane[i] = p.lane; };
  if (stats.echo && p.shotCount % stats.echo === 0) {
    tag(spawn(playerBullets, p.x, y, 0, -speed * 0.9, stats.bulletSize * 2.4, dmg * stats.echoMul, BIG, stats.pierce + 3));
  } else {
    tag(spawn(playerBullets, p.x, y, 0, -speed, stats.bulletSize, dmg, 0, stats.pierce));
  }

  // Split: side shots reach k lanes over by the time they are at enemy height.
  if (stats.split > 0) {
    const travel = (PLAYER_Y - 150) / speed;
    for (let k = 1; k <= stats.split; k++) {
      const vx = (LANE_W * k) / travel;
      const sd = dmg * stats.sideDamage;
      tag(spawn(playerBullets, p.x, y, -vx, -speed, stats.bulletSize * 0.85, sd, 0, stats.pierce));
      tag(spawn(playerBullets, p.x, y, vx, -speed, stats.bulletSize * 0.85, sd, 0, stats.pierce));
    }
  }
  sfx.shoot();
}

// ---------------------------------------------------------------------------
// Fire modes. All read the same stats (damage, rate, split, pierce, homing...)
// so every other item keeps working, just expressed differently.
// ---------------------------------------------------------------------------
const beams = [];   // laser segments drawn this frame
const rails = [];   // railgun flashes
const tagLane = (i, lane) => { if (i >= 0) playerBullets.lane[i] = lane; };

// Enemies whose body crosses lane `l`, nearest to the player first.
function enemiesInLane(l) {
  const x = laneX(l);
  const out = [];
  for (const e of enemies) {
    if (e.dead || e.y > PLAYER_Y) continue;
    if (e.hitboxes) { if (e.hitboxes.some((h) => Math.abs(e.x + h.x - x) < (h.r ?? h.hw))) out.push(e); }
    else if (Math.abs(e.x - x) < LANE_W * 0.5) out.push(e);
  }
  return out.sort((a, b) => b.y - a.y);
}
// Lane to aim at: own lane if it has a target, else (with SEEKER) a neighbour.
function aimLane(p, stats) {
  if (enemiesInLane(p.lane).length || stats.homing <= 0) return p.lane;
  for (const o of [-1, 1]) { const l = p.lane + o; if (l >= 0 && l < LANES && enemiesInLane(l).length) return l; }
  return p.lane;
}

// LASER: continuous beam. Damage ticks 10x/s. Pierce = more enemies per beam,
// SPLITTER = side beams, SEEKER = bends into a neighbour lane, ECHO = surges.
function updateLaser(p, stats, dt, rateMul, hit) {
  beams.length = 0;
  p.laserTick = (p.laserTick || 0) - dt;
  p.surgeT = Math.max(0, (p.surgeT || 0) - dt);
  if (stats.echo) {
    p.surgeCd = (p.surgeCd || 0) - dt;
    if (p.surgeCd <= 0) { p.surgeCd = 0.3 * stats.echo; p.surgeT = 0.22; }
  }
  const surge = p.surgeT > 0 ? stats.echoMul : 1;
  const dps = stats.fireRate * rateMul * currentDamage(p, stats) * 1.15 * surge;
  const tick = p.laserTick <= 0;
  if (tick) { p.laserTick += 0.1; p.laserCount = (p.laserCount || 0) + 1; }
  const width = (4 + stats.bulletSize * 0.9) * (surge > 1 ? 1.8 : 1);
  const fire = (lane, mul, w) => {
    const targets = enemiesInLane(lane).slice(0, 1 + stats.pierce);
    const x0 = p.x, y0 = PLAYER_Y - 22;
    const last = targets[targets.length - 1];
    const tx = lane === p.lane ? p.x : laneX(lane);
    const y1 = last ? last.y : -10;
    // Off-lane beams bend: angle over into the lane, then run straight up it.
    const ym = lane === p.lane ? y0 : Math.max(y1, PLAYER_Y - 120);
    beams.push({ x0, y0, xm: tx, ym, x1: tx, y1, w, a: mul });
    if (tick && hit) {
      for (const e of targets) onHit(e, dps * 0.1 * mul, stats, hit, p.laserCount % 3 === 0);
      if (last) burst(tx, last.y + 8, PAL.cyan, 2, 120, 0.2, 1.5);
    }
  };
  fire(aimLane(p, stats), 1, width);
  for (let k = 1; k <= stats.split; k++) {
    for (const o of [-k, k]) { const l = p.lane + o; if (l >= 0 && l < LANES) fire(l, 0.4, width * 0.45); }
  }
  if (tick) sfx.shoot();
}

// SCATTER: a cone of short-range pellets.
function fireScatter(p, stats) {
  const n = 5 + 2 * stats.split + (stats.buckshot ? 2 : 0);
  const spread = 0.32 + 0.06 * stats.split;
  const dmg = currentDamage(p, stats) * 0.75;
  for (let i = 0; i < n; i++) {
    const a = -spread + (2 * spread * i) / (n - 1);
    const sp = stats.bulletSpeed * (0.92 + Math.random() * 0.16);
    const bi = spawn(playerBullets, p.x, PLAYER_Y - 16, Math.sin(a) * sp, -Math.cos(a) * sp, 2.4 + stats.bulletSize * 0.25, dmg, PELLET, stats.pierce + (stats.buckshot ? 1 : 0));
    if (bi >= 0) { tagLane(bi, p.lane); playerBullets.ox[bi] = PLAYER_Y - 16; }
  }
  sfx.shoot();
}

// RAILGUN: periodic instant beam through EVERY enemy in the lane.
// Pierce adds damage (it already pierces), SPLITTER adds side lanes,
// SEEKER auto-aims a neighbour lane, OVERLOAD (with ECHO) hits 3 lanes every 3rd shot.
function fireRail(p, stats, hit) {
  if (!hit) return;
  const dmg = currentDamage(p, stats) * 6.5 * (1 + 0.25 * stats.pierce);
  const main = aimLane(p, stats);
  const lanes = [[main, 1]];
  for (let k = 1; k <= stats.split; k++) for (const o of [-k, k]) lanes.push([p.lane + o, 0.4]);
  if (stats.overload && p.shotCount % 3 === 0) for (const o of [-1, 1]) lanes.push([main + o, 1]);
  for (const [l, mul] of lanes) {
    if (l < 0 || l >= LANES) continue;
    for (const e of enemiesInLane(l)) onHit(e, dmg * mul, stats, hit, true);
    rails.push({ x0: p.x, x1: laneX(l), t: 0.2, w: mul });
  }
  sfx.rail();
  shake(2, 0.06);
}

// ROCKET POD: alternating rockets that accelerate and explode. They only home
// with SEEKER (SMART ROCKETS synergy makes them home harder).
function fireRocket(p, stats) {
  const side = p.shotCount % 2 === 0 ? -1 : 1;
  const dmg = currentDamage(p, stats) * 1.4;
  const shots = [[side * 8, 0]];
  for (let k = 1; k <= stats.split; k++) shots.push([side * 8, -side * 70 * k]);
  for (const [ox, vx] of shots) {
    const bi = spawn(playerBullets, p.x + ox, PLAYER_Y - 10, vx, -180, 4, dmg, ROCKET, stats.pierce);
    tagLane(bi, p.lane);
  }
}

// SINE WAVE: two strands (three with HELIX) weaving across your lane and its
// neighbours.
function fireSine(p, stats) {
  const strands = stats.helix ? 3 : 2;
  const dmg = currentDamage(p, stats) * (stats.helix ? 0.42 : 0.5);
  for (let k = 0; k < strands; k++) {
    const bi = spawn(playerBullets, p.x, PLAYER_Y - 14, 0, -stats.bulletSpeed * 0.85, 2.6, dmg, SINE, stats.pierce);
    if (bi >= 0) { playerBullets.ox[bi] = p.x; playerBullets.aux[bi] = (k / strands) * Math.PI * 2; }
  }
  sfx.shoot();
}

// Per-frame behaviour of special bullets.
export function updateModeBullets(stats, dt) {
  const pb = playerBullets;
  for (let i = 0; i < pb.n; i++) {
    const kind = pb.kind[i];
    if (kind === SINE) {
      const traveled = PLAYER_Y - 14 - pb.y[i];
      pb.x[i] = pb.ox[i] + Math.sin(pb.aux[i] + traveled * 0.026) * LANE_W * Math.min(1, traveled / 60);
    } else if (kind === PELLET) {
      if (pb.ox[i] - pb.y[i] > 440) { kill(pb, i); i--; }
    } else if (kind === ROCKET) {
      const sp = Math.hypot(pb.vx[i], pb.vy[i]);
      if (sp < 720) { const k = 1 + dt * 2.4; pb.vx[i] *= k; pb.vy[i] *= k; }
      if (Math.random() < 0.5) burst(pb.x[i], pb.y[i] + 6, '#8aa0b0', 1, 20, 0.35, 1.5);
    }
  }
}

// Homing: a bullet only tracks enemies in the lane it was fired from or the
// two lanes next to it. Stacks make the turn sharper, never the range wider.
export function steerBullets(stats, dt) {
  if (stats.homing <= 0) return;
  const pb = playerBullets;
  const k = 2.5 + 1.5 * stats.homing;
  const maxVx = 200 + 60 * stats.homing;
  for (let i = 0; i < pb.n; i++) {
    const lane = pb.lane[i];
    if (lane < 0 || pb.kind[i] === SINE) continue;
    const xMin = laneX(Math.max(0, lane - 1)) - LANE_W * 0.5;
    const xMax = laneX(Math.min(LANES - 1, lane + 1)) + LANE_W * 0.5;
    let bestX = 0, bd = 1e9, found = false;
    for (const e of enemies) {
      if (e.dead || e.y > pb.y[i]) continue;
      // Big targets (bosses): aim at their closest point inside the allowed lanes.
      const tx = Math.max(xMin, Math.min(xMax, e.x));
      if (!e.hitboxes && (e.x < xMin || e.x > xMax)) continue;
      const d = Math.abs(tx - pb.x[i]) + (pb.y[i] - e.y) * 0.3;
      if (d < bd) { bd = d; bestX = tx; found = true; }
    }
    if (!found) continue;
    const want = Math.max(-maxVx, Math.min(maxVx, (bestX - pb.x[i]) * k));
    pb.vx[i] += (want - pb.vx[i]) * Math.min(1, dt * 6);
  }
}

function overlaps(e, x, y, r) {
  if (e.hitboxes) {
    for (const h of e.hitboxes) {
      const hx = e.x + h.x, hy = e.y + h.y;
      if (h.r !== undefined) {
        const dx = hx - x, dy = hy - y, rr = h.r + r;
        if (dx * dx + dy * dy < rr * rr) return true;
      } else if (Math.abs(hx - x) < h.hw + r && Math.abs(hy - y) < h.hh + r) return true;
    }
    return false;
  }
  if (e.hw) return Math.abs(e.x - x) < e.hw + r && Math.abs(e.y - y) < e.hh + r;
  const rr = e.r + r;
  const dx = e.x - x, dy = e.y - y;
  return dx * dx + dy * dy < rr * rr;
}

// Applies all on-hit effects. `ctx` gives access to rng and run callbacks.
function onHit(e, dmg, stats, run, primary, kind = 0) {
  let d = dmg;
  if (primary && stats.crit > 0 && run.rng.next() < stats.crit) {
    d *= stats.critMul;
    burst(e.x, e.y, PAL.white, 8, 200, 0.3, 2);
    run.onCrit(e);
  }
  damageEnemy(e, d);
  sfx.hit();
  if (stats.toxin > 0) {
    e.poison = Math.min(12, Math.max(e.poison, stats.toxin));
    e.poisonT = 3;
    e.poisoned = true;
  }
  if (kind === ROCKET) {
    const radius = 26 + 8 * stats.frag + (stats.smartRockets ? 10 : 0);
    rings.push({ x: e.x, y: e.y, r: radius, t: 0.25 });
    sfx.explode();
    for (const o of enemies) if (o !== e && !o.dead && overlaps(o, e.x, e.y, radius)) damageEnemy(o, dmg * 0.45);
  }
  if (!primary) return;
  if (stats.frag > 0) {
    const radius = 26 + 12 * stats.frag;
    rings.push({ x: e.x, y: e.y, r: radius, t: 0.25 });
    sfx.explode();
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      if (overlaps(o, e.x, e.y, radius)) {
        damageEnemy(o, dmg * 0.4);
        if (stats.toxin > 0) { o.poison = Math.max(o.poison, stats.toxin); o.poisonT = 3; o.poisoned = true; }
      }
    }
  }
  if (stats.arc > 0) {
    const targets = enemies.filter((o) => o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 170)
      .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))
      .slice(0, stats.arc);
    let from = e;
    for (const t of targets) {
      arcs.push({ x1: from.x, y1: from.y, x2: t.x, y2: t.y, t: 0.15 });
      damageEnemy(t, dmg * 0.35);
      if (stats.frag > 1) rings.push({ x: t.x, y: t.y, r: 20, t: 0.2 });
      from = t;
    }
    if (targets.length) sfx.arc();
  }
}

// Player bullets vs all targets (enemies + boss).
export function resolvePlayerHits(stats, run) {
  const pb = playerBullets;
  for (let i = 0; i < pb.n; i++) {
    for (const e of enemies) {
      if (e.dead || pb.lastHit[i] === e.id) continue;
      if (!overlaps(e, pb.x[i], pb.y[i], pb.r[i])) continue;
      onHit(e, pb.dmg[i], stats, run, true, pb.kind[i]);
      if (pb.pierce[i] > 0) {
        pb.pierce[i]--;
        pb.lastHit[i] = e.id;
      } else {
        kill(pb, i); i--;
      }
      break;
    }
  }
}

// Poison ticks: 2 ticks per second.
export function tickPoison(dt) {
  for (const e of enemies) {
    if (e.dead || e.poison <= 0) continue;
    e.poisonT -= dt;
    e.poisonTick -= dt;
    if (e.poisonTick <= 0) {
      e.poisonTick = 0.5;
      damageEnemy(e, e.poison * 0.5);
      e.killedByPoison = e.dead;
    }
    if (e.poisonT <= 0) e.poison = 0;
  }
}

export function updateWeaponFx(dt) {
  for (let i = 0; i < rails.length; i++) { rails[i].t -= dt; if (rails[i].t <= 0) { rails.splice(i, 1); i--; } }
  for (let i = 0; i < arcs.length; i++) { arcs[i].t -= dt; if (arcs[i].t <= 0) { arcs.splice(i, 1); i--; } }
  for (let i = 0; i < rings.length; i++) { rings[i].t -= dt; if (rings[i].t <= 0) { rings.splice(i, 1); i--; } }
}

export function drawWeaponFx() {
  for (const b of beams) {
    const flick = 0.85 + Math.random() * 0.15;
    const segs = b.ym !== b.y0 ? [[b.x0, b.y0, b.xm, b.ym], [b.xm, b.ym, b.x1, b.y1]] : [[b.x0, b.y0, b.x1, b.y1]];
    for (const [ax, ay, bx, by] of segs) {
      line(ax, ay, bx, by, PAL.cyan, b.w * 2.2 * flick, 0.22 * b.a);
      line(ax, ay, bx, by, PAL.cyan, b.w * flick, 0.6 * b.a);
      line(ax, ay, bx, by, '#ffffff', Math.max(1, b.w * 0.35), 0.95 * b.a);
    }
    drawGlowDot(b.x0, b.y0, PAL.cyan, 4 + b.w * 0.4, 0.9 * b.a);
  }
  for (const r of rails) {
    const a = r.t / 0.2;
    line(r.x1, PLAYER_Y - 20, r.x1, 0, PAL.cyan, 14 * a * (0.5 + r.w * 0.5), 0.3 * a);
    line(r.x1, PLAYER_Y - 20, r.x1, 0, '#ffffff', 3 * a + 1, a);
  }
  for (const a of arcs) {
    // jagged lightning
    const mx = (a.x1 + a.x2) / 2 + (Math.random() - 0.5) * 20;
    const my = (a.y1 + a.y2) / 2 + (Math.random() - 0.5) * 20;
    line(a.x1, a.y1, mx, my, PAL.cyan, 2, a.t / 0.15);
    line(mx, my, a.x2, a.y2, PAL.cyan, 2, a.t / 0.15);
  }
  for (const r of rings) ring(r.x, r.y, r.r * (1 - r.t * 2), PAL.orange, 2, r.t / 0.25);
}

export function clearWeaponFx() { arcs.length = 0; rings.length = 0; wingmen.length = 0; beams.length = 0; rails.length = 0; }
