// Player weapon. Reads the final stats object only, so every item combination
// composes without special cases. Also resolves on-hit effects.
import { playerBullets, spawn, kill, BIG } from './bullets.js';
import { enemies, damageEnemy } from './enemies.js';
import { LANE_W } from './world.js';
import { PLAYER_Y } from './player.js';
import { PAL } from '../render/palette.js';
import { burst } from '../render/fx.js';
import { line, ring } from '../render/draw.js';
import { sfx } from '../audio/audio.js';

// Short-lived visual effects owned by the weapon (lightning arcs, frag rings).
const arcs = [];
const rings = [];

export function currentDamage(p, stats) {
  let d = stats.damage * stats.damageMul;
  if (stats.adrenaline && p.hearts === 1) d *= 2;
  return d;
}

// Fires if the timer allows. `rateMul` is used by OVERDRIVE.
export function updateWeapon(p, stats, dt, rateMul = 1) {
  p.fireTimer -= dt;
  if (p.fireTimer > 0) return;
  p.fireTimer += 1 / (stats.fireRate * rateMul);
  if (p.fireTimer < 0) p.fireTimer = 0;
  p.shotCount++;

  const dmg = currentDamage(p, stats);
  const speed = stats.bulletSpeed;
  const y = PLAYER_Y - 14;

  if (stats.echo && p.shotCount % stats.echo === 0) {
    spawn(playerBullets, p.x, y, 0, -speed * 0.9, stats.bulletSize * 2.4, dmg * stats.echoMul, BIG, stats.pierce + 3);
  } else {
    spawn(playerBullets, p.x, y, 0, -speed, stats.bulletSize, dmg, 0, stats.pierce);
  }

  // Split: side shots reach k lanes over by the time they are at enemy height.
  if (stats.split > 0) {
    const travel = (PLAYER_Y - 150) / speed;
    for (let k = 1; k <= stats.split; k++) {
      const vx = (LANE_W * k) / travel;
      const sd = dmg * stats.sideDamage;
      spawn(playerBullets, p.x, y, -vx, -speed, stats.bulletSize * 0.85, sd, 0, stats.pierce);
      spawn(playerBullets, p.x, y, vx, -speed, stats.bulletSize * 0.85, sd, 0, stats.pierce);
    }
  }
  sfx.shoot();
}

// Homing: steer toward the nearest target above, but only within `homing`
// lanes of the bullet. Position still matters: you cannot hide in a far lane.
export function steerBullets(stats, dt) {
  if (stats.homing <= 0) return;
  const pb = playerBullets;
  const k = 3.5;
  const maxVx = 200 + 60 * stats.homing;
  const reach = LANE_W * (stats.homing + 0.5);
  for (let i = 0; i < pb.n; i++) {
    let best = null, bd = 1e9;
    for (const e of enemies) {
      if (e.dead || e.y > pb.y[i]) continue;
      if (!e.hw && Math.abs(e.x - pb.x[i]) > reach) continue;
      const d = Math.abs(e.x - pb.x[i]) + (pb.y[i] - e.y) * 0.3;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) continue;
    const want = Math.max(-maxVx, Math.min(maxVx, (best.x - pb.x[i]) * k));
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
function onHit(e, dmg, stats, run, primary) {
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
      onHit(e, pb.dmg[i], stats, run, true);
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
  for (let i = 0; i < arcs.length; i++) { arcs[i].t -= dt; if (arcs[i].t <= 0) { arcs.splice(i, 1); i--; } }
  for (let i = 0; i < rings.length; i++) { rings[i].t -= dt; if (rings[i].t <= 0) { rings.splice(i, 1); i--; } }
}

export function drawWeaponFx() {
  for (const a of arcs) {
    // jagged lightning
    const mx = (a.x1 + a.x2) / 2 + (Math.random() - 0.5) * 20;
    const my = (a.y1 + a.y2) / 2 + (Math.random() - 0.5) * 20;
    line(a.x1, a.y1, mx, my, PAL.cyan, 2, a.t / 0.15);
    line(mx, my, a.x2, a.y2, PAL.cyan, 2, a.t / 0.15);
  }
  for (const r of rings) ring(r.x, r.y, r.r * (1 - r.t * 2), PAL.orange, 2, r.t / 0.25);
}

export function clearWeaponFx() { arcs.length = 0; rings.length = 0; }
