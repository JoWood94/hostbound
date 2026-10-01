// Player weapon. Reads the final stats object only, so every item combination
// composes without special cases. Also resolves on-hit effects.
import { playerBullets, spawn, kill, BIG } from './bullets.js';
import { enemies, damageEnemy } from './enemies.js';
import { LANE_W, LANES, laneX } from './world.js';
import { enemySprite, drawSprite } from '../render/sprites.js';
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

// Homing: a bullet only tracks enemies in the lane it was fired from or the
// two lanes next to it. Stacks make the turn sharper, never the range wider.
export function steerBullets(stats, dt) {
  if (stats.homing <= 0) return;
  const pb = playerBullets;
  const k = 2.5 + 1.5 * stats.homing;
  const maxVx = 200 + 60 * stats.homing;
  for (let i = 0; i < pb.n; i++) {
    const lane = pb.lane[i];
    if (lane < 0) continue;
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

export function clearWeaponFx() { arcs.length = 0; rings.length = 0; wingmen.length = 0; }
