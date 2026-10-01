// Player weapon. Reads the final stats object only, so every item combination
// composes without special cases. Also resolves on-hit effects.
import { playerBullets, spawn, kill, BIG, F_EXPLODE, F_WAVE, F_RANGE, F_ROCKET, SHOTS } from './bullets.js';
import { enemies, damageEnemy } from './enemies.js';
import { LANE_W, LANES, laneX } from './world.js';
import { ctx, makeOffscreen } from '../core/canvas.js';
import { enemySprite, drawSprite } from '../render/sprites.js';
import { PLAYER_Y } from './player.js';
import { PAL, COLOR_PLAYER_BULLET as SHOT } from '../render/palette.js';
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

// Isaac tears: a shot's size follows its damage. sqrt keeps it sane: x2 damage
// is x1.41 size, x4 is x2. Clamped so weak side shots stay visible and huge
// builds do not cover the whole lane.
export function dmgScale(dmg) { return Math.max(0.7, Math.min(2.2, Math.sqrt(dmg))); }

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

// ===========================================================================
// SHOT ENGINE
// Every shot modifier is a trait, and traits compose:
//   carrier  : bolt | rocket | rail | beam   (priority beam > rail > rocket > bolt)
//   SCATTER  : the carrier fans out in a cone (bolts->pellets, rails->trident, beam->prism fan)
//   SINE     : the carrier weaves across neighbour lanes (projectiles weave, beams/rails zigzag)
//   ROCKET   : the carrier explodes on impact (if rocket is not already the carrier)
//   RAIL     : a beam carrier pulses with charged surges
//   SPLITTER : extra side lanes; SEEKER bends toward a neighbour lane; PIERCER more targets
// No combination is special-cased: LASER + SCATTER is simply a beam with a fan.
// ===========================================================================
const beams = [];   // beam paths drawn this frame: { pts, w, a }
const rails = [];   // rail flashes: { pts, t, w }
const tagLane = (i, lane) => { if (i >= 0) playerBullets.lane[i] = lane; };
const CARRIER_RATE = { bolt: 1, rocket: 0.6, rail: 0.16 };

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

// Shot pattern shared by every carrier: a list of "lanes" (straight up a lane,
// bending over from the ship) or "angles" (a cone), each with a damage share.
function pattern(p, stats) {
  const out = [];
  if (stats.hasScatter) {
    const n = (stats.carrier === 'bolt' || stats.carrier === 'rocket' ? 5 : 3) + 2 * stats.split + (stats.buckshot ? 2 : 0);
    const spread = (stats.carrier === 'bolt' || stats.carrier === 'rocket' ? 0.32 : 0.26) + 0.05 * stats.split;
    const share = stats.carrier === 'bolt' || stats.carrier === 'rocket' ? 0.75 : 0.6;
    for (let i = 0; i < n; i++) out.push({ angle: -spread + (2 * spread * i) / (n - 1), mul: share });
    return out;
  }
  out.push({ lane: aimLane(p, stats), mul: 1 });
  for (let k = 1; k <= stats.split; k++) {
    for (const o of [-k, k]) { const l = p.lane + o; if (l >= 0 && l < LANES) out.push({ lane: l, mul: stats.sideDamage * (stats.carrier === 'bolt' ? 1.5 : 0.8) }); }
  }
  return out;
}

// Polyline from the ship for beams and rails. `phase` animates SINE.
// SEEKER for beams and rails: give each path its own target, the nearest enemy
// within one lane of where that path would naturally go (lane rule), preferring
// targets no other path has taken yet.
function lockTargets(p, stats, specs) {
  if (stats.homing <= 0) return specs;
  const taken = new Set();
  for (const spec of specs) {
    let lane;
    if (spec.angle !== undefined) {
      const reachX = p.x + Math.tan(spec.angle) * (PLAYER_Y - 150);
      lane = Math.max(0, Math.min(LANES - 1, Math.round((reachX - laneX(0)) / LANE_W)));
    } else lane = spec.lane;
    let best = null, bd = 1e9;
    for (const e of enemies) {
      if (e.dead || e.y > PLAYER_Y - 30) continue;
      const el = Math.round((e.x - laneX(0)) / LANE_W);
      if (Math.abs(el - lane) > 1) continue;
      const d = Math.abs(el - lane) * 200 + (PLAYER_Y - e.y) * 0.2 + (taken.has(e) ? 500 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { spec.target = best; taken.add(best); }
  }
  return specs;
}

function buildPath(p, spec, wave, phase) {
  const x0 = p.x, y0 = PLAYER_Y - 22;
  const pts = [];
  if (spec.target) {
    // Curve onto the locked target, then carry on straight up (for pierce).
    const tx = spec.target.x, ty = spec.target.y;
    const cx = x0, cy = (y0 + ty) / 2;
    for (let t = 0; t <= 1; t += 0.05) {
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      let x = a * x0 + b * cx + c * tx;
      const y = a * y0 + b * cy + c * ty;
      if (wave) x += Math.sin(phase + t * 9) * LANE_W * 0.5 * Math.min(1, t * 3);
      pts.push(x, y);
    }
    for (let y = ty - 12; y > -10; y -= 12) pts.push(tx, y);
    return pts;
  }
  for (let d = 0; d < 700; d += 12) {
    let x, y;
    if (spec.angle !== undefined) { x = x0 + Math.sin(spec.angle) * d; y = y0 - Math.cos(spec.angle) * d; }
    else { const k = Math.min(1, d / 110); x = x0 + (laneX(spec.lane) - x0) * k; y = y0 - d; }
    if (wave) x += Math.sin(phase + d * 0.026) * LANE_W * Math.min(1, d / 70);
    pts.push(x, y);
    if (y < -10 || x < -10 || x > 370) break;
  }
  return pts;
}

// Walk a path and collect enemies it touches, in order. `limit` stops the walk
// (beams stop at their last pierced target; rails never stop).
function hitsAlong(pts, halfW, limit) {
  const hits = [];
  const seen = new Set();
  for (let i = 0; i < pts.length; i += 2) {
    for (const e of enemies) {
      if (e.dead || seen.has(e)) continue;
      if (overlaps(e, pts[i], pts[i + 1], halfW)) {
        seen.add(e);
        hits.push({ e, at: i });
        if (hits.length >= limit) return { hits, end: i + 2 };
      }
    }
  }
  return { hits, end: pts.length };
}

function blast(x, y, dmg, stats, skip) {
  const radius = 24 + 8 * stats.frag + (stats.smartRockets ? 10 : 0);
  rings.push({ x, y, r: radius, t: 0.25 });
  sfx.explode();
  for (const o of enemies) if (o !== skip && !o.dead && overlaps(o, x, y, radius)) damageEnemy(o, dmg * 0.45);
}

// Fires if the timer allows. `rateMul` is used by OVERDRIVE. `hit` = {rng, onCrit}.
export function updateWeapon(p, stats, dt, rateMul = 1, hit = null) {
  if (stats.carrier === 'beam') { updateBeam(p, stats, dt, rateMul, hit); return; }
  beams.length = 0;
  let rate = stats.fireRate * rateMul * CARRIER_RATE[stats.carrier] * (stats.carrier === 'rail' ? stats.shotSpeed : 1);
  if (stats.hasScatter) rate *= stats.carrier === 'rail' ? 0.85 : 0.4;
  p.fireTimer -= dt;
  p.charge = Math.max(0, Math.min(1, 1 - p.fireTimer * rate));
  if (p.fireTimer > 0) return;
  p.fireTimer += 1 / rate;
  if (p.fireTimer < 0) p.fireTimer = 0;
  p.shotCount++;
  if (stats.carrier === 'rail') fireRail(p, stats, hit);
  else fireProjectiles(p, stats);
}

// ---- projectiles (bolt / rocket carriers) ---------------------------------
function fireProjectiles(p, stats) {
  const rocket = stats.carrier === 'rocket';
  const dmg = currentDamage(p, stats) * (rocket ? 1.4 : 1);
  const speed = rocket ? 180 * stats.shotSpeed : stats.bulletSpeed;
  const y = PLAYER_Y - 14;
  let flags = 0;
  if (stats.hasRocket) flags |= F_EXPLODE;
  if (rocket) flags |= F_ROCKET;
  if (stats.hasScatter && !rocket) flags |= F_RANGE;
  if (stats.hasSine) flags |= F_WAVE;

  // ECHO: every Nth volley is one huge piercing round.
  if (!stats.hasScatter && stats.echo && p.shotCount % stats.echo === 0) {
    const bi = spawn(playerBullets, p.x, y, 0, -stats.bulletSpeed * 0.9, stats.bulletSize * 2.4 * dmgScale(dmg), dmg * stats.echoMul, BIG, stats.pierce + 3);
    if (bi >= 0) { tagLane(bi, p.lane); playerBullets.flags[bi] = flags & ~F_ROCKET; }
    sfx.shoot();
    return;
  }

  const travel = (PLAYER_Y - 150) / speed;
  const strands = stats.hasSine && !stats.hasScatter ? (stats.helix ? 3 : 2) : 1;
  const side = rocket ? (p.shotCount % 2 === 0 ? -8 : 8) : 0;
  pattern(p, stats).forEach((pt, idx) => {
    let vx, vy;
    if (pt.angle !== undefined) { vx = Math.sin(pt.angle) * speed; vy = -Math.cos(pt.angle) * speed; }
    else { vx = (laneX(pt.lane) - p.x) / travel; vy = -speed; }
    const shotDmg = dmg * pt.mul / (strands > 1 ? strands * 0.8 : 1);
    const size = (stats.hasScatter ? 2.4 + stats.bulletSize * 0.25 : stats.bulletSize) * dmgScale(shotDmg);
    const pierce = stats.pierce + (stats.buckshot ? 1 : 0);
    for (let k = 0; k < strands; k++) {
      const bi = spawn(playerBullets, p.x + side, y, vx, vy, rocket ? 4 * dmgScale(shotDmg) : size, shotDmg, 0, pierce);
      if (bi < 0) continue;
      tagLane(bi, p.lane);
      playerBullets.flags[bi] = flags;
      playerBullets.ox[bi] = flags & F_WAVE ? p.x + side : y;
      playerBullets.aux[bi] = stats.hasScatter ? idx * Math.PI : (k / strands) * Math.PI * 2;
      if (flags & F_RANGE) playerBullets.aux[bi] = y;   // pellets remember where they started
    }
  });
  if (!rocket) sfx.shoot();
}

// ---- rail carrier: instant strikes along every path -----------------------
function fireRail(p, stats, hit) {
  if (!hit) return;
  const dmg = currentDamage(p, stats) * 6.5 * (1 + 0.25 * stats.pierce);
  const specs = lockTargets(p, stats, pattern(p, stats));
  if (stats.overload && p.shotCount % 3 === 0) for (const o of [-1, 1]) specs.push({ lane: aimLane(p, stats) + o, mul: 1 });
  const phase = p.shotCount * 1.7;
  for (const spec of specs) {
    if (spec.lane !== undefined && (spec.lane < 0 || spec.lane >= LANES)) continue;
    const pts = buildPath(p, spec, stats.hasSine, phase);
    const { hits } = hitsAlong(pts, 6, 99);
    for (const { e } of hits) {
      onHit(e, dmg * spec.mul, stats, hit, true);
      if (stats.hasRocket) blast(e.x, e.y, dmg * spec.mul, stats, e);
    }
    rails.push({ pts, t: 0.2, w: spec.mul });
  }
  sfx.rail();
  shake(2, 0.06);
}

// ---- beam carrier: continuous, ticks 10x/s ---------------------------------
function updateBeam(p, stats, dt, rateMul, hit) {
  beams.length = 0;
  p.laserTick = (p.laserTick || 0) - dt;
  p.beamT = (p.beamT || 0) + dt;
  // Surges: ECHO and/or RAIL turn the beam into charged pulses.
  let surge = 1, widthMul = 1;
  if (stats.hasRail) {
    const cyc = p.beamT % (0.9 / stats.shotSpeed);
    const on = cyc < 0.28;
    surge = on ? 2.6 : 0.65;
    widthMul = on ? 2 : 0.6;
    if (on && cyc < dt * 1.5) { sfx.rail(); shake(1.5, 0.05); }
  }
  if (stats.echo) {
    p.surgeCd = (p.surgeCd || 0) - dt;
    if (p.surgeCd <= 0) { p.surgeCd = 0.3 * stats.echo; p.surgeT = 0.22; }
    p.surgeT = Math.max(0, (p.surgeT || 0) - dt);
    if (p.surgeT > 0) { surge *= stats.echoMul; widthMul *= 1.8; }
  }
  const dps = stats.fireRate * rateMul * currentDamage(p, stats) * 1.15 * surge;
  const tick = p.laserTick <= 0;
  if (tick) { p.laserTick += 0.1; p.laserCount = (p.laserCount || 0) + 1; }
  const width = (4 + stats.bulletSize * 0.9) * widthMul * dmgScale(currentDamage(p, stats));
  const phase = p.beamT * 5;
  for (const spec of lockTargets(p, stats, pattern(p, stats))) {
    const pts = buildPath(p, spec, stats.hasSine, phase);
    const { hits, end } = hitsAlong(pts, width * 0.5, 1 + stats.pierce);
    const shown = hits.length >= 1 + stats.pierce ? pts.slice(0, end) : pts;
    beams.push({ pts: shown, w: width * (spec.mul < 1 ? 0.55 : 1), a: Math.min(1, spec.mul + 0.3) });
    if (tick && hit) {
      for (const { e } of hits) onHit(e, dps * 0.1 * spec.mul, stats, hit, p.laserCount % 3 === 0);
      const last = hits[hits.length - 1];
      if (last) {
        burst(last.e.x, last.e.y + 8, SHOT, 2, 120, 0.2, 1.5);
        if (stats.hasRocket && p.laserCount % 4 === 0) blast(last.e.x, last.e.y, dps * 0.4 * spec.mul, stats, last.e);
      }
    }
  }
  if (tick) sfx.shoot();
}

// Per-frame behaviour of trait-carrying bullets.
export function updateModeBullets(stats, dt) {
  const pb = playerBullets;
  for (let i = 0; i < pb.n; i++) {
    const f = pb.flags[i];
    const reach = 440 * stats.shotSpeed;
    if (f & F_RANGE && pb.aux[i] - pb.y[i] > reach && !(f & F_WAVE)) { kill(pb, i); i--; continue; }
    if (f & F_ROCKET) {
      const sp = Math.hypot(pb.vx[i], pb.vy[i]);
      if (sp < 720 * stats.shotSpeed) { const k = 1 + dt * 2.4; pb.vx[i] *= k; pb.vy[i] *= k; }
      if (Math.random() < 0.5) burst(pb.x[i], pb.y[i] + 6, '#8aa0b0', 1, 20, 0.35, 1.5);
    }
    if (f & F_WAVE) {
      // ox carries the un-weaved path; x = ox + offset (pre-compensated for updatePool).
      pb.ox[i] += pb.vx[i] * dt;
      const traveled = PLAYER_Y - 14 - pb.y[i];
      if (f & F_RANGE && traveled > reach) { kill(pb, i); i--; continue; }
      const off = Math.sin(pb.aux[i] + traveled * 0.026 / stats.shotSpeed) * LANE_W * Math.min(1, traveled / 60);
      pb.x[i] = pb.ox[i] + off - pb.vx[i] * dt;
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
    if (lane < 0 || pb.flags[i] & F_WAVE) continue;
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
function onHit(e, dmg, stats, run, primary, flags = 0) {
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
  if (flags & F_EXPLODE) blast(e.x, e.y, dmg, stats, e);
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
      onHit(e, pb.dmg[i], stats, run, true, pb.flags[i]);
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

function poly(pts, color, width, alpha) {
  if (pts.length < 4) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// Beam texture: the living nerve-fibre slice from the shot sheet, as a
// repeating pattern laid along every segment of the beam's path.
let beamPat = null;
function beamPattern() {
  if (beamPat || !SHOTS.ready) return beamPat;
  const c = SHOTS.cell;
  const { canvas, ctx: g } = makeOffscreen(c, c);
  g.drawImage(SHOTS.img, 5 * c, c, c, c, 0, 0, c, c);
  beamPat = ctx.createPattern(canvas, 'repeat');
  return beamPat;
}
function texturedBeam(pts, w, alpha, t) {
  const pat = beamPattern();
  if (!pat) return false;
  const bw = w * 2.8;                       // the cord fills ~35% of the slice
  const k = bw / SHOTS.cell;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = pat;
  let run = t * 260;                        // pattern flows up the beam
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], dx = pts[i + 2] - x0, dy = pts[i + 3] - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.5) continue;
    ctx.save();
    ctx.translate(x0, y0);
    ctx.rotate(Math.atan2(dx, -dy));
    pat.setTransform(new DOMMatrix().translateSelf(-bw / 2, run).scaleSelf(k, k));
    ctx.fillRect(-bw / 2, -len - 1, bw, len + 2);
    ctx.restore();
    run -= len;
  }
  ctx.restore();
  return true;
}

export function drawWeaponFx() {
  const t = performance.now() / 1000;
  for (const b of beams) {
    const flick = 0.85 + Math.random() * 0.15;
    poly(b.pts, SHOT, b.w * 2.2 * flick, 0.22 * b.a);
    if (!texturedBeam(b.pts, b.w * flick, b.a, t)) {
      poly(b.pts, SHOT, b.w * flick, 0.6 * b.a);
      poly(b.pts, '#f4ffd8', Math.max(1, b.w * 0.35), 0.95 * b.a);
    }
    drawGlowDot(b.pts[0], b.pts[1], SHOT, 4 + b.w * 0.4, 0.9 * b.a);
  }
  for (const r of rails) {
    const a = r.t / 0.2;
    poly(r.pts, SHOT, 14 * a * (0.5 + r.w * 0.5), 0.3 * a);
    poly(r.pts, '#ffffff', 3 * a + 1, a);
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
