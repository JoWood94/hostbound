// Player weapon. Reads the final stats object only, so every item combination
// composes without special cases. Also resolves on-hit effects.
import { playerBullets, spawn, kill, BIG, F_EXPLODE, F_WAVE, F_RANGE, F_ROCKET, F_FISSION, F_FISSION2, F_TOXIC, F_SLOW, F_ECHO, F_LATCH, SH_BOLT, SH_GLAIVE, SH_MINE, SH_LARVA, SH_STING, SH_LOB, SHOTS } from './bullets.js';
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
const flashes = [];   // big soft flashes: mine/shell bursts, novas, cauterize, hatching { x, y, r, t, max, c }
const novas = [];     // SUPERNOVA columns { pts, t }
let cautFx = null;    // CAUTERIZE progress on the held target { e, k }
const flash = (x, y, r, c = SHOT, t = 0.3) => flashes.push({ x, y, r, t, max: t, c });

// Per-shot modifiers that depend on the player's state this instant.
//   CHARGE / OVERCHARGE: x1.8 damage, double size (SIEGE rails x2.5 + stun)
//   GHOSTROUND while phasing: x2 damage, pierce everything
//   SKYSHOT in the air: pierce +1/+2 (damage is in currentDamage)
function shotMods(p, stats, consume = true) {
  const charged = p.charged || p.overcharge > 0;
  if (charged && consume) { if (p.overcharge > 0) p.overcharge--; else p.charged = false; p.stillT = 0; }
  const ghost = stats.ghost && p.phaseT > 0;
  const sling = stats.slingshot && p.slingT > 0;      // SLINGSHOT: just after a lane change
  return {
    charged, sling,
    speed: sling ? 1.3 : 1,
    dmg: (charged ? 1.8 : 1) * (ghost ? 2 : 1) * (sling ? 1.3 : 1),
    size: charged ? 2 : 1,
    pierce: (ghost ? 99 : 0) + (stats.skyshot && p.jumpT > 0 ? stats.skyshot : 0),
    flags: ghost && stats.wraith ? F_SLOW : 0,
  };
}

export function currentDamage(p, stats) {
  let d = stats.damage * stats.damageMul;
  if (stats.skyshot && p.jumpT > 0) d *= stats.skyshot > 1 ? 1.9 : 1.5;   // SKYSHOT
  if (stats.adrenaline && p.hearts === 1) d *= 2;
  if (stats.bloodPact) d *= 1 + 0.25 * stats.bloodPact * Math.max(0, stats.maxHearts - p.hearts);
  if (stats.ambush && p.ambushT > 0) d *= 1 + 0.75 * stats.ambush;
  return d;
}

// Isaac tears: a shot's size follows its damage. sqrt keeps it sane: x2 damage
// is x1.41 size, x4 is x2. Clamped so weak side shots stay visible and huge
// builds do not cover the whole lane.
export function dmgScale(dmg) { return Math.max(0.7, Math.min(2.2, Math.sqrt(dmg))); }

// FISSION: the lanes a split goes to (side lanes; a third straight one at 2 stacks).
function forkLanes(lane, stats) {
  const out = [lane - 1, lane + 1];
  if (stats.fission > 1) out.push(lane);
  return out.filter((l) => l >= 0 && l < LANES);
}

// AFTERGLOW: burning trails. Points with a time to live; every 0.1 s anything
// touching one takes a slice of the trail's damage per second.
const trails = [];
const TRAIL_CAP = 420;
function addTrail(pts, ttl, stats, p) {
  const dps = currentDamage(p, stats) * stats.fireRate * (stats.afterglow > 1 ? 0.4 : 0.25);
  const life = ttl * (stats.ribbon ? 2 : 1) * (stats.afterglow > 1 ? 1.7 : 1);
  for (let i = 0; i < pts.length; i += 4) {
    if (trails.length >= TRAIL_CAP) trails.shift();
    trails.push({ x: pts[i], y: pts[i + 1], t: life, max: life, dps });
  }
}
let trailTick = 0;
export function updateTrails(stats, dt, p) {
  if (stats.afterglow && stats.carrier !== 'beam' && stats.carrier !== 'rail') {
    // projectiles drop a point every few frames
    p.trailDrop = (p.trailDrop || 0) - dt;
    if (p.trailDrop <= 0) {
      p.trailDrop = 0.05;
      const pb = playerBullets;
      const pts = [];
      for (let i = 0; i < pb.n; i++) if (pb.shape[i] !== SH_MINE && !(pb.flags[i] & F_LATCH)) pts.push(pb.x[i], pb.y[i], 0, 0);
      addTrail(pts, 0.35, stats, p);
    }
  }
  for (let i = 0; i < trails.length; i++) { trails[i].t -= dt; if (trails[i].t <= 0) { trails.splice(i, 1); i--; } }
  trailTick -= dt;
  if (trailTick > 0 || !trails.length) return;
  trailTick = 0.1;
  for (const e of enemies) {
    if (e.dead) continue;
    let best = 0;
    for (const t of trails) if (t.dps > best && overlaps(e, t.x, t.y, 5)) best = t.dps;
    if (best) { damageEnemy(e, best * 0.1); if (stats.evo.web) e.slowT = Math.max(e.slowT || 0, 0.4); }   // WEB numbs
  }
}
function drawTrails() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const t of trails) {
    ctx.globalAlpha = 0.35 * (t.t / t.max);
    ctx.fillStyle = SHOT;
    ctx.fillRect(t.x - 2.5, t.y - 2.5, 5, 5);
  }
  ctx.restore();
}

// FISSION on a projectile: at the first hit the shot splits toward the side
// lanes (half damage). Children do not split again, except once with CASCADE.
function fission(pb, i, stats, e) {
  const f = pb.flags[i];
  if (!stats.fission || (f & F_FISSION2) || ((f & F_FISSION) && !stats.cascade)) return;
  const lane = Math.max(0, Math.min(LANES - 1, Math.round((pb.x[i] - laneX(0)) / LANE_W)));
  const childFlag = f & F_FISSION ? F_FISSION2 : F_FISSION;
  for (const l of forkLanes(lane, stats)) {
    const vx = (laneX(l) - pb.x[i]) / 0.25;
    const bi = spawn(playerBullets, pb.x[i], pb.y[i] - 6, vx, -480, Math.max(2, pb.r[i] * 0.75), pb.dmg[i] * 0.5, 0, pb.pierce[i]);
    if (bi < 0) continue;
    playerBullets.lane[bi] = l;                       // HYDRA: seekers steer from the new lane
    playerBullets.lastHit[bi] = e.id;
    // MIRV: with rockets every fragment explodes; F_WAVE dropped (it would snap back)
    playerBullets.flags[bi] = ((f & ~F_WAVE & ~F_RANGE & ~F_ROCKET) | childFlag | (stats.mirv ? F_EXPLODE : 0));
    playerBullets.ox[bi] = pb.y[i];
  }
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
      w.fireT += 1 / (stats.fireRate * (stats.squadron || 0.5));
      if (stats.evo.armada && (stats.carrier === 'beam' || stats.carrier === 'rail')) return;   // they ride the beam/rail paths instead
      const rocket = stats.evo.armada && stats.carrier === 'rocket';
      const bi = spawn(playerBullets, w.x, PLAYER_Y - 30, 0, -(rocket ? 180 * stats.shotSpeed : stats.bulletSpeed), rocket ? 4 : 2.4, currentDamage(p, stats) * 0.6 * (rocket ? 1.4 : 1), 0, stats.pierce);
      if (bi >= 0) {
        playerBullets.lane[bi] = l;
        // ARMADA: the drones fire your weapon's traits too
        if (stats.evo.armada) playerBullets.flags[bi] = (stats.hasRocket ? F_EXPLODE : 0) | (rocket ? F_ROCKET : 0);
      }
    }
  });
}
// ARMADA on a beam or a rail: one extra path from every drone.
function armadaSpecs(stats, mul) {
  if (!stats.evo.armada || !stats.wingmen) return [];
  return wingmen.map((w) => ({ lane: Math.max(0, Math.min(LANES - 1, Math.round((w.x - laneX(0)) / LANE_W))), mul, fromX: w.x }));
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
  // METEOR (SKYSHOT + GROUND POUND): three lanes wide, with the air bonus
  const lanes = stats.aftershock || stats.meteor ? [p.lane - 1, p.lane, p.lane + 1] : [p.lane];
  const sky = stats.meteor ? (stats.skyshot > 1 ? 1.9 : 1.5) : 1;
  for (const l of lanes) {
    if (l < 0 || l >= LANES) continue;
    spawn(playerBullets, laneX(l), PLAYER_Y - 10, 0, -620, 6, currentDamage(p, stats) * 2 * stats.groundPound * sky, BIG, 20);
  }
  rings.push({ x: p.x, y: PLAYER_Y, r: 34, t: 0.25 });
}
export function slipBurst(p, stats) {
  // DRIFT (MOMENTUM + SLIPSTREAM): two lane changes within 0.5 s charge the burst
  const lt = p.laneTimes || [];
  const drift = stats.drift && lt.length >= 2 && lt[1] - lt[0] < 0.5;
  const k = drift ? 1.8 : 1;
  for (const sp of [560, 640, 720]) spawn(playerBullets, p.x, PLAYER_Y - 14, 0, -sp, 2.6 * (drift ? 2 : 1), currentDamage(p, stats) * 0.7 * stats.slipstream * k, 0, stats.pierce);
}
// AIR RAID (SKYSHOT + KICKFLIP): landing fires a skyshot into the three lanes around you.
export function airRaid(p, stats) {
  const d = currentDamage(p, stats) * (stats.skyshot > 1 ? 1.9 : 1.5);
  for (const o of [-1, 0, 1]) {
    const l = p.lane + o;
    if (l < 0 || l >= LANES) continue;
    const bi = spawn(playerBullets, laneX(l), PLAYER_Y - 14, 0, -600, stats.bulletSize * 1.4, d, BIG, stats.pierce + stats.skyshot);
    if (bi >= 0) playerBullets.lane[bi] = l;
  }
}
export function addRing(x, y, r) { rings.push({ x, y, r, t: 0.25 }); }
// A short acid flash between two points (REFRACTION shards).
export function flashLine(x1, y1, x2, y2) { rails.push({ pts: [x1, y1, x2, y2], t: 0.15, w: 0.35 }); }

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
const CARRIER_RATE = { bolt: 1, rocket: 0.6, rail: 0.16, glaive: 0.45, mine: 0.5, brood: 0.38, sting: 0.33, mortar: 0.42 };
const BIO = new Set(['glaive', 'mine', 'brood', 'sting', 'mortar']);

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
// SEEKER 2: two lanes away, only when nothing is closer.
function aimLane(p, stats) {
  if (enemiesInLane(p.lane).length || stats.homing <= 0) return p.lane;
  const offs = stats.seekReach > 1 ? [-1, 1, -2, 2] : [-1, 1];
  for (const o of offs) { const l = p.lane + o; if (l >= 0 && l < LANES && enemiesInLane(l).length) return l; }
  return p.lane;
}

// Shot pattern shared by every carrier: a list of "lanes" (straight up a lane,
// bending over from the ship) or "angles" (a cone), each with a damage share.
function pattern(p, stats) {
  const out = [];
  if (stats.hasScatter) {
    const n = (stats.carrier === 'bolt' || stats.carrier === 'rocket' ? 5 : 3) + 2 * stats.split + (stats.buckshot ? 2 : 0);
    const spread = (stats.carrier === 'bolt' || stats.carrier === 'rocket' ? 0.32 : 0.26) + 0.05 * stats.split;
    const share = (stats.carrier === 'bolt' || stats.carrier === 'rocket' ? 0.75 : 0.6) * (stats.modeLv.scatter > 1 ? 1.15 : 1);   // SCATTER x2
    for (let i = 0; i < n; i++) out.push({ angle: -spread + (2 * spread * i) / (n - 1), mul: share });
    return converging(p, stats, out);
  }
  out.push({ lane: aimLane(p, stats), mul: 1 });
  for (let k = 1; k <= stats.split; k++) {
    for (const o of [-k, k]) { const l = p.lane + o; if (l >= 0 && l < LANES) out.push({ lane: l, mul: stats.sideDamage * (stats.carrier === 'bolt' ? 1.5 : 0.8) }); }
  }
  return converging(p, stats, out);
}

// CONVERGENCE: side shots bow out and meet on your aimed lane at the enemy
// line (x2: every other volley; the others open as usual).
export const ENEMY_LINE = 150;
function converging(p, stats, out) {
  if (!stats.converge || out.length < 2) return out;
  if (stats.converge > 1 && p.shotCount % 2 === 1) return out;
  const aim = aimLane(p, stats);
  for (const pt of out) {
    if (pt.angle !== undefined) { pt.bow = Math.sin(pt.angle) * 150; delete pt.angle; pt.lane = aim; pt.conv = true; }
    else if (pt.lane !== aim) { pt.bow = (laneX(pt.lane) - laneX(aim)) * 0.9; pt.lane = aim; pt.conv = true; }
  }
  return out;
}

// SINE shape: sin^3 dwells near the centre (its own lane) and only flicks out
// to the neighbours at the peaks. A pure sine spent most of its time on the
// neighbouring lanes and merely crossed your own.
const weave = (a) => { const s = Math.sin(a); return s * s * s; };
// SINE x2: a plain sine, which spends longer out on the side lanes
let weaveFn = weave;
const weaveWide = (a) => Math.sin(a);

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
      if (Math.abs(el - lane) > (stats.seekReach > 1 || stats.evo.swarmlord ? 2 : 1)) continue;
      const d = Math.abs(el - lane) * 200 + (PLAYER_Y - e.y) * 0.2 + (taken.has(e) ? 500 : 0);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) { spec.target = best; taken.add(best); }
  }
  return specs;
}

function buildPath(p, spec, wave, phase) {
  const x0 = spec.fromX ?? p.x, y0 = PLAYER_Y - 22;
  const pts = [];
  if (spec.target) {
    // Curve onto the locked target, then carry on straight up (for pierce).
    const tx = spec.target.x, ty = spec.target.y;
    const cx = x0, cy = (y0 + ty) / 2;
    for (let t = 0; t <= 1; t += 0.05) {
      const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
      let x = a * x0 + b * cx + c * tx;
      const y = a * y0 + b * cy + c * ty;
      if (wave) x += weaveFn(phase + t * 9) * LANE_W * 0.5 * Math.min(1, t * 3);
      pts.push(x, y);
    }
    for (let y = ty - 12; y > -10; y -= 12) pts.push(tx, y);
    return pts;
  }
  for (let d = 0; d < 700; d += 12) {
    let x, y;
    if (spec.angle !== undefined) { x = x0 + Math.sin(spec.angle) * d; y = y0 - Math.cos(spec.angle) * d; }
    else { const k = Math.min(1, d / 110); x = x0 + (laneX(spec.lane) - x0) * k; y = y0 - d; }
    if (spec.bow) x += spec.bow * Math.sin(Math.PI * Math.min(1, d / Math.max(60, y0 - ENEMY_LINE)));
    if (wave) x += weaveFn(phase + d * 0.026) * LANE_W * Math.min(1, d / 70);
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
  const radius = (24 + 8 * stats.frag + (stats.smartRockets ? 10 : 0)) * (stats.modeLv.rockets > 1 ? 1.25 : 1);
  rings.push({ x, y, r: radius, t: 0.25 });
  flash(x, y, radius * 0.8, '#ffd27a', 0.22);
  burst(x, y, '#ffd27a', 10, 200, 0.35, 2.5);
  sfx.explode();
  for (const o of enemies) if (o !== skip && !o.dead && overlaps(o, x, y, radius)) damageEnemy(o, dmg * 0.45);
}

// HEARTBEAT: a heavy extra volley (beam: a surge; rail: a lighter extra rail).
export function heartbeat(p, stats, hit) {
  if (stats.carrier === 'beam') p.chargeSurgeT = Math.max(p.chargeSurgeT || 0, 0.3);
  else fireAs(stats.carrier, p, stats, hit, true);
  for (const w of wingmen) w.fireT = 0;
  rings.push({ x: p.x, y: PLAYER_Y - 10, r: 26, t: 0.25 });
}

function rateOf(c, stats, rateMul) {
  let rate = stats.fireRate * rateMul * CARRIER_RATE[c] * (c === 'rail' ? stats.shotSpeed * (stats.modeLv.railgun > 1 ? 1.15 : 1) : 1);
  if (stats.hasScatter && !stats.trioOn.barrage) rate *= c === 'rail' ? 0.85 : 0.4;   // BARRAGE already spreads
  return rate;
}
function fireAs(c, p, stats, hit, beat = false) {
  if (c === 'rail') fireRail(p, stats, hit, beat ? 0.4 : stats.trioOn.triad ? 1.5 : 0);   // TRIAD: the rail closes the cycle
  else if (BIO.has(c)) fireBio(p, stats, beat, c);
  else fireProjectiles(p, stats, beat, c);
}

// Fires if the timer allows. `rateMul` is used by OVERDRIVE. `hit` = {rng, onCrit}.
// Carrier pairs: an ALTERNATING pair takes turns (the wait before a volley is
// that carrier's own), a TOGETHER pair fires its second carrier on its own
// timer, both at 60%.
export function updateWeapon(p, stats, dt, rateMul = 1, hit = null) {
  weaveFn = stats.modeLv.sine > 1 ? weaveWide : weave;
  const mul = stats.duo ? (stats.trioOn.powergrid ? 0.7 : 0.6) : 1;   // POWER GRID: both at 70%
  if (stats.duo) {
    p.fireTimer2 = (p.fireTimer2 ?? 0.3) - dt;
    if (p.fireTimer2 <= 0) {
      p.fireTimer2 = Math.max(0, p.fireTimer2 + 1 / rateOf(stats.duo, stats, rateMul * mul));
      fireAs(stats.duo, p, stats, hit);
    }
  }
  if (stats.carrier === 'beam') { updateBeam(p, stats, dt, rateMul * mul, hit); return; }
  beams.length = 0;
  const c = stats.alt ? stats.alt[(p.altI || 0) % stats.alt.length] : stats.carrier;
  const rate = rateOf(c, stats, rateMul * mul);
  p.fireTimer -= dt;
  p.charge = c === 'rail' ? Math.max(0, Math.min(1, 1 - p.fireTimer * rate)) : 0;
  if (p.fireTimer > 0) return;
  p.shotCount++;
  fireAs(c, p, stats, hit);
  if (stats.alt) p.altI = (p.altI || 0) + 1;
  const next = stats.alt ? stats.alt[p.altI % stats.alt.length] : c;
  p.fireTimer = Math.max(0, p.fireTimer + 1 / rateOf(next, stats, rateMul * mul));
}

// ---- projectiles (bolt / rocket carriers) ---------------------------------
function fireProjectiles(p, stats, beat = false, carrier = stats.carrier) {
  const rocket = carrier === 'rocket';
  const mod = shotMods(p, stats, !beat);
  const dmg = currentDamage(p, stats) * (rocket ? 1.4 : 1) * mod.dmg * (beat ? 1.5 : 1);   // HEARTBEAT volleys hit harder
  const speed = (rocket ? 180 * stats.shotSpeed : stats.bulletSpeed) * mod.speed;
  const y = PLAYER_Y - 14;
  let flags = 0;
  if (stats.hasRocket) flags |= F_EXPLODE;
  if (rocket) flags |= F_ROCKET;
  if (stats.hasScatter && !rocket) flags |= F_RANGE;
  if (stats.hasSine) flags |= F_WAVE;
  flags |= mod.flags;

  // TWIN LINK: for a moment after a lane change, the lane you left fires too.
  if (stats.twinlink && p.twinT > 0) {
    const bi = spawn(playerBullets, laneX(p.twinLane), y, 0, -speed, stats.bulletSize * dmgScale(dmg) * mod.size, dmg, 0, stats.pierce + mod.pierce);
    if (bi >= 0) { tagLane(bi, p.twinLane); playerBullets.flags[bi] = flags & ~F_WAVE; playerBullets.ox[bi] = y; }
  }

  // ECHO: every Nth volley is one huge piercing round (RESONANCE: so is a charged one).
  if (!beat && !stats.hasScatter && ((stats.echo && p.shotCount % stats.echo === 0) || (mod.charged && stats.resonance))) {
    const bi = spawn(playerBullets, p.x, y, 0, -stats.bulletSpeed * 0.9, stats.bulletSize * 2.4 * dmgScale(dmg), dmg * stats.echoMul, BIG, stats.pierce + 3);
    if (bi >= 0) { tagLane(bi, p.lane); playerBullets.flags[bi] = (flags & ~F_ROCKET) | (stats.evo.thunderclap ? F_ECHO : 0); }
    sfx.shoot();
    return;
  }

  const travel = (PLAYER_Y - 150) / speed;
  const strands = stats.hasSine && !stats.hasScatter ? (stats.helix ? 3 : 2) : 1;
  const side = rocket ? (p.shotCount % 2 === 0 ? -8 : 8) : 0;
  // SWARMLORD: every side shot hunts its own enemy (within a lane of its lane)
  const hunted = new Set();
  const huntFor = (lane) => {
    let best = null, bd = 1e9;
    for (const e of enemies) {
      if (e.dead || e.y > PLAYER_Y - 30 || hunted.has(e)) continue;
      const dl = Math.abs(laneOf(e) - lane);
      if (dl > 1) continue;
      const d = dl * 200 + (PLAYER_Y - e.y) * 0.2;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) hunted.add(best);
    return best;
  };
  pattern(p, stats).forEach((pt, idx) => {
    let vx, vy;
    if (pt.angle !== undefined) { vx = Math.sin(pt.angle) * speed; vy = -Math.cos(pt.angle) * speed; }
    else { vx = (laneX(pt.lane) - p.x) / travel; vy = -speed; }
    // CONVERGENCE: start bowing outward; updateModeBullets bends it onto the lane
    if (pt.conv) vx += pt.bow * 2.2 / travel;
    const shotDmg = dmg * pt.mul / (strands > 1 ? strands * 0.8 : 1);
    const size = (stats.hasScatter ? 2.4 + stats.bulletSize * 0.25 : stats.bulletSize) * dmgScale(shotDmg) * mod.size * (stats.artillery ? 1.6 : 1);
    const pierce = stats.pierce + (stats.buckshot ? 1 : 0) + mod.pierce;
    for (let k = 0; k < strands; k++) {
      const bi = spawn(playerBullets, p.x + side, y, vx, vy, rocket ? 4 * dmgScale(shotDmg) : size, shotDmg, 0, pierce);
      if (bi < 0) continue;
      tagLane(bi, p.lane);
      playerBullets.flags[bi] = flags;
      playerBullets.ox[bi] = flags & F_WAVE ? p.x + side : y;
      // SINE phase advances every volley: the weave is a function of distance
      // travelled, so with a fixed phase every shot crossed a given height at
      // the same offset and an enemy holding there was never hit.
      playerBullets.aux[bi] = (stats.hasScatter ? idx * Math.PI : (k / strands) * Math.PI * 2) + p.shotCount * 0.9;
      if (flags & F_RANGE) playerBullets.aux[bi] = y;   // pellets remember where they started
      if (pt.conv && !(flags & F_WAVE)) { playerBullets.lane[bi] = -3; playerBullets.aux[bi] = laneX(pt.lane); }
      else if (stats.evo.swarmlord && idx > 0 && pt.lane !== undefined && !(flags & F_WAVE)) {
        const t = huntFor(pt.lane);
        if (t) { playerBullets.lane[bi] = -2; playerBullets.aux[bi] = t.id; }   // chased in updateModeBullets
      }
    }
  });
  // SLINGSHOT x2: one more shot into the lane beyond the one you moved to
  if (mod.sling && stats.slingshot > 1) {
    const l = p.lane + (p.slingDir || 0);
    if (l >= 0 && l < LANES && l !== p.lane) {
      const bi = spawn(playerBullets, p.x, y, (laneX(l) - p.x) / travel, -speed, stats.bulletSize * dmgScale(dmg * 0.5), dmg * 0.5, 0, stats.pierce + mod.pierce);
      if (bi >= 0) { tagLane(bi, l); playerBullets.flags[bi] = flags & ~F_WAVE; playerBullets.ox[bi] = y; }
    }
  }
  if (!rocket) sfx.shoot();
}

// ---- v1.2 carriers: glaive, spore mine, brood, stinger, seed mortar --------
const GLAIVE_TURN = ENEMY_LINE - 50;      // just past the enemy line
const laneFromAngle = (p, a) => Math.max(0, Math.min(LANES - 1, Math.round((p.x + Math.tan(a) * (PLAYER_Y - ENEMY_LINE) - laneX(0)) / LANE_W)));
const countShape = (sh, extra = () => true) => { let n = 0; const pb = playerBullets; for (let i = 0; i < pb.n; i++) if (pb.shape[i] === sh && extra(i)) n++; return n; };
function bodyAt(bi, sh, lane) { if (bi < 0) return -1; playerBullets.shape[bi] = sh; playerBullets.lane[bi] = lane; return bi; }
// Nearest enemy within `reach` lanes of `lane`, the least crowded by larvae first.
function nearTarget(lane, reach, avoid) {
  let best = null, bd = 1e9;
  for (const e of enemies) {
    if (e.dead || e.y > PLAYER_Y - 40) continue;
    const dl = Math.abs(laneOf(e) - lane);
    if (dl > reach) continue;
    const d = dl * 160 + (PLAYER_Y - e.y) * 0.2 + (avoid ? avoid(e) * 120 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function fireBio(p, stats, beat = false, c = stats.carrier) {
  const mod = shotMods(p, stats, !beat);
  const dmg = currentDamage(p, stats) * mod.dmg * (beat ? 1.5 : 1);
  const y = PLAYER_Y - 14;
  const lv = stats.modeLv;
  // ROCKET's blast rides along, unless a rocket pair already reshapes it
  const rocketPair = stats.pairOn.kama || stats.pairOn.claymore || stats.pairOn.carpet;
  const traits = (stats.hasRocket && stats.carrier !== 'rocket' && !rocketPair ? F_EXPLODE : 0) | mod.flags;
  const specs = pattern(p, stats);
  if (stats.twinlink && p.twinT > 0) specs.push({ lane: p.twinLane, mul: 1, fromX: laneX(p.twinLane) });
  const laneOfSpec = (sp) => (sp.lane !== undefined ? sp.lane : laneFromAngle(p, sp.angle));
  if (c === 'glaive') {
    for (const sp of specs) {
      const v0 = 420 * stats.shotSpeed * mod.speed;
      const x0 = sp.fromX ?? p.x;
      const t = (y - GLAIVE_TURN) / v0;
      const vx = sp.angle !== undefined ? Math.sin(sp.angle) * v0 : (laneX(laneOfSpec(sp)) - x0) / t;
      // CHAKRAM and SAWBLADE hit many more times: each cut is lighter
      const d = dmg * 1.2 * sp.mul * (lv.glaive > 1 ? 1.2 : 1) * (stats.trioOn.chakram ? 0.75 : stats.trioOn.sawblade ? 0.55 : 1);
      const bi = bodyAt(spawn(playerBullets, x0, y, vx, -v0, 6 * dmgScale(d) * mod.size, d, 0, 200), SH_GLAIVE, laneOfSpec(sp));
      if (bi < 0) continue;
      playerBullets.flags[bi] = traits | (stats.hasSine ? F_WAVE : 0);
      playerBullets.ox[bi] = x0;
      playerBullets.aux[bi] = p.shotCount * 0.9;
    }
    sfx.shoot();
  } else if (c === 'mine') {
    const cap = 3 + (lv.sporemine > 1 ? 1 : 0);
    for (const sp of specs) {
      if (countShape(SH_MINE) >= cap) break;
      const lane = laneOfSpec(sp);
      const host = enemiesInLane(lane)[0];
      const park = host ? Math.min(host.y + 45, ENEMY_LINE + 60) : ENEMY_LINE + 40;
      const bi = bodyAt(spawn(playerBullets, sp.fromX ?? p.x, y, 0, -380 * stats.shotSpeed, 5, dmg * 2.2 * sp.mul, 0, 0), SH_MINE, -1);
      if (bi < 0) continue;
      playerBullets.vx[bi] = (laneX(lane) - (sp.fromX ?? p.x)) / ((y - park) / (380 * stats.shotSpeed));
      playerBullets.ox[bi] = park;
      playerBullets.aux[bi] = 0;
      playerBullets.flags[bi] = traits;
    }
    sfx.shoot();
  } else if (c === 'brood') {
    if (countShape(SH_LARVA) > 30) return;
    const n = 2 + (specs.length - 1) + (lv.brood > 1 ? 1 : 0);
    const each = dmg * 1.45 * (lv.brood > 1 ? 0.8 : 1) * (specs.length > 1 ? 0.85 : 1);
    const crowd = (e) => countShape(SH_LARVA, (i) => playerBullets.aux[i] === e.id);
    for (let k = 0; k < n; k++) {
      const t = nearTarget(p.lane, 2, crowd);
      const bi = bodyAt(spawn(playerBullets, p.x + (k - (n - 1) / 2) * 6, y, (k - (n - 1) / 2) * 70, -330, 3, each, 0, 0), SH_LARVA, t ? -2 : -1);
      if (bi < 0) continue;
      if (t) playerBullets.aux[bi] = t.id;
      playerBullets.flags[bi] = traits;
    }
    sfx.shoot();
  } else if (c === 'sting') {
    for (const sp of specs) {
      const speed = 300 * stats.shotSpeed * mod.speed;
      const x0 = sp.fromX ?? p.x;
      const travel = (PLAYER_Y - 150) / speed;
      const vx = sp.angle !== undefined ? Math.sin(sp.angle) * speed : (laneX(laneOfSpec(sp)) - x0) / travel;
      const bi = bodyAt(spawn(playerBullets, x0, y, vx, -speed, 3.2 * mod.size, dmg * 3.2 * sp.mul, 0, 0), SH_STING, laneOfSpec(sp));
      if (bi < 0) continue;
      playerBullets.flags[bi] = traits | (stats.hasSine ? F_WAVE : 0);
      playerBullets.ox[bi] = x0;
      playerBullets.aux[bi] = p.shotCount * 0.9;
    }
    sfx.shoot();
  } else if (c === 'mortar') {
    // CARPET (+ ROCKET): every shell splits into three, on three lanes, at 60%
    const shells = [];
    const now = performance.now() / 1000;
    const locked = stats.trioOn.targetlock ? enemies.filter((e) => !e.dead && e.lockUntil > now).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0] : null;
    if (stats.trioOn.barrage) {
      // BARRAGE: lane after lane, sweeping one way then the other
      const dir = p.shotCount % 2 ? 1 : -1;
      for (let k = 0; k < LANES; k++) shells.push({ lane: dir > 0 ? k : LANES - 1 - k, mul: 0.3, delay: k * 0.09 });
    } else if (locked) shells.push({ lane: laneOf(locked), mul: 1.3, target: locked });
    else for (const sp of specs) {
      // CARPET: one shell that splits in three halfway (updateBioShots)
      shells.push({ lane: laneOfSpec(sp), mul: sp.mul * (stats.pairOn.carpet ? 1.8 : 1), fromX: sp.fromX, split: stats.pairOn.carpet });
    }
    for (const sp of shells) {
      const lane = sp.lane;
      // over the front row: the farthest enemy in the lane, else the enemy line
      const row = enemiesInLane(lane);
      const ty = sp.target ? sp.target.y : row.length ? row[row.length - 1].y : ENEMY_LINE;
      const T = 0.6 / Math.sqrt(stats.shotSpeed) + (sp.delay || 0);
      const x0 = sp.fromX ?? p.x;
      const bi = bodyAt(spawn(playerBullets, x0, y, (laneX(lane) - x0) / T, -(y - ty) / T, 4.5 * mod.size, dmg * 2.4 * sp.mul, 0, 0), SH_LOB, -1);
      if (bi < 0) continue;
      playerBullets.ox[bi] = y;
      playerBullets.aux[bi] = ty;
      playerBullets.flags[bi] = traits;
      if (sp.split) playerBullets.kind[bi] |= SPLIT;
    }
    sfx.shoot();
  }
}
const SPLIT = 32;   // kind bit: a CARPET shell that splits in three halfway

// Larvae from a point (HATCHERY, WASP NEST, EGG CLUTCH): each finds an enemy
// within two lanes, the least crowded first.
export function hatch(x, y, n, each, stats) {
  if (countShape(SH_LARVA) > 30) return;
  // an egg sac pops: a pale flash, a green splash
  flash(x, y, 16, '#f4ffd8', 0.25);
  burst(x, y, SHOT, 8, 120, 0.3, 2);
  rings.push({ x, y, r: 14, t: 0.2 });
  const lane = Math.max(0, Math.min(LANES - 1, Math.round((x - laneX(0)) / LANE_W)));
  const crowd = (e) => countShape(SH_LARVA, (i) => playerBullets.aux[i] === e.id);
  for (let k = 0; k < n; k++) {
    const t = nearTarget(lane, 2, crowd);
    const bi = bodyAt(spawn(playerBullets, x, y, (k - (n - 1) / 2) * 90, -200, 3, each, 0, 0), SH_LARVA, t ? -2 : -1);
    if (bi >= 0 && t) playerBullets.aux[bi] = t.id;
  }
}
// A stinger stuck in `e` straight away (HARPOON, QUEEN).
function plant(e, dmg, fuse, flags = 0) {
  const bi = bodyAt(spawn(playerBullets, e.x, e.y, 0, 0, 3, dmg, 0, 0), SH_STING, -1);
  if (bi < 0) return;
  playerBullets.flags[bi] = flags | F_LATCH;
  playerBullets.aux[bi] = e.id;
  playerBullets.ox[bi] = fuse;
  playerBullets.vx[bi] = (Math.random() - 0.5) * 14; playerBullets.vy[bi] = (Math.random() - 0.5) * 10;
}
// FUSE LINE: mines a rail crosses go off at once, 30% harder.
// POWER GRID: the blast runs on through every mine wired to one that went off.
function fuseMines(pts, stats, hit) {
  const pb = playerBullets;
  const hitPath = (i) => { for (let k = 0; k < pts.length; k += 2) if (Math.abs(pts[k] - pb.x[i]) < 14 && Math.abs(pts[k + 1] - pb.y[i]) < 14) return true; return false; };
  const go = [];
  // POWER GRID: a rail only sets off a mine already wired into a grid, so
  // lone mines stay and the grid can grow
  const wired = (i) => { for (let j = 0; j < pb.n; j++) if (j !== i && pb.shape[j] === SH_MINE && pb.vy[j] === 0 && Math.abs(pb.x[j] - pb.x[i]) < LANE_W * 1.5 && Math.abs(pb.x[j] - pb.x[i]) > LANE_W * 0.5 && Math.abs(pb.y[j] - pb.y[i]) < 70) return true; return false; };
  for (let i = 0; i < pb.n; i++) if (pb.shape[i] === SH_MINE && hitPath(i) && (!stats.trioOn.powergrid || (pb.vy[i] === 0 && wired(i)))) go.push(i);
  if (stats.trioOn.powergrid) {
    for (let q = 0; q < go.length; q++) for (let j = 0; j < pb.n; j++) {
      if (pb.shape[j] !== SH_MINE || go.includes(j) || pb.vy[j] !== 0) continue;
      const i = go[q];
      if (Math.abs(pb.x[j] - pb.x[i]) < LANE_W * 1.5 && Math.abs(pb.y[j] - pb.y[i]) < 70) { go.push(j); beams.push({ pts: [pb.x[i], pb.y[i], pb.x[j], pb.y[j]], w: 3, a: 0.9 }); }
    }
  }
  for (const i of go) burstAt(pb.x[i], pb.y[i] - 20, LANE_W * 0.6, pb.dmg[i] * 1.3, stats, hit, pb.flags[i]);
  go.sort((a, b) => b - a).forEach((i) => kill(pb, i));
}
// Stingers stuck in `e` burst now (REAPER x1.3, DEPTH CHARGE).
function popStings(e, mul = 1) {
  const pb = playerBullets;
  for (let i = 0; i < pb.n; i++) if (pb.shape[i] === SH_STING && pb.flags[i] & F_LATCH && pb.aux[i] === e.id && pb.ox[i] > 0) { pb.ox[i] = 0.001; pb.dmg[i] *= mul; }
}
const stingFuse = (stats) => (stats.modeLv.stinger > 1 ? 0.8 : 1);

// Area burst shared by mines and mortar shells: the nearest enemy takes a
// primary hit (crits, frag, arcs), the rest of the area a plain one.
function burstAt(x, y, radius, dmg, stats, hit, flags) {
  rings.push({ x, y, r: radius, t: 0.25 });
  rings.push({ x, y, r: radius * 0.6, t: 0.2 });
  flash(x, y, radius, SHOT, 0.3);
  burst(x, y, SHOT, 18, 220, 0.4, 2.5);
  burst(x, y, '#f4ffd8', 6, 120, 0.25, 2);
  shake(2, 0.08);
  sfx.explode();
  const inside = enemies.filter((e) => !e.dead && overlaps(e, x, y, radius))
    .sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
  inside.forEach((e, k) => { onHit(e, dmg, stats, hit, k === 0, flags & ~F_EXPLODE); if (stats.pairOn.depthcharge) popStings(e); });
  if (flags & F_EXPLODE) blast(x, y, dmg, stats, null);
}

// Per-frame behaviour of the carrier bodies; after the pool moved them.
let tetherTick = 0, wireTick = 0;
const HOLD = 16;   // kind bit: a CHAKRAM glaive hanging at the enemy line
export function updateBioShots(p, stats, dt, hit) {
  const pb = playerBullets;
  tetherTick -= dt; wireTick -= dt;
  if (stats.pairOn.tripwire) tripwires(p, stats, hit);
  for (let i = 0; i < pb.n; i++) {
    const sh = pb.shape[i];
    if (sh === SH_BOLT) continue;
    if (sh === SH_MINE && pb.aux[i] === -9) {
      // CLAYMORE: a launched mine bursts on the first enemy it meets
      const e = enemies.find((o) => !o.dead && overlaps(o, pb.x[i], pb.y[i], 8));
      if (e || pb.y[i] < 20) { burstAt(pb.x[i], pb.y[i], LANE_W * 0.7, pb.dmg[i] * 1.3, stats, hit, pb.flags[i]); kill(pb, i); i--; }
      continue;
    }
    if (sh === SH_GLAIVE && pb.kind[i] & HOLD) {
      // CHAKRAM: hangs at the enemy line sweeping three lanes on its tether
      pb.aux[i] -= dt;
      pb.vx[i] = 0; pb.vy[i] = 0;
      pb.x[i] = pb.ox[i] + Math.sin(pb.aux[i] * 7) * LANE_W;
      if (Math.floor((pb.aux[i] + dt) * 4) !== Math.floor(pb.aux[i] * 4)) pb.lastHit[i] = -1;
      if (pb.aux[i] <= 0) { pb.kind[i] &= ~HOLD; pb.vy[i] = 40; }
      tetherBurn(p, stats, hit, pb.x[i], pb.y[i]);
    }
    if (sh === SH_GLAIVE && stats.trioOn.sawblade && ((pb.flags[i] >> 10) & 7) < 3) {
      // SAWBLADE: full speed between the top edge and the enemy line, three bounces
      const nb = (pb.flags[i] >> 10) & 7;
      const v = 420 * stats.shotSpeed;
      const bounce = () => { pb.flags[i] = (pb.flags[i] & ~(7 << 10)) | ((nb + 1) << 10); pb.lastHit[i] = -1; pb.lane[i] = -1; pb.vx[i] = 0; };
      if (pb.vy[i] < 0 && pb.y[i] < 12) { pb.vy[i] = v; bounce(); }
      else if (pb.vy[i] > 0 && pb.y[i] > ENEMY_LINE + 40 && nb < 2) { pb.vy[i] = -v; bounce(); }
      else if (pb.vy[i] < 0) pb.vy[i] = -v;
      continue;
    }
    if (sh === SH_GLAIVE && pb.kind[i] & HOLD) continue;
    if (sh === SH_GLAIVE) {
      // decelerates to a halt just past the enemy line, then flies home
      const v0 = 420 * stats.shotSpeed;
      const dec = (v0 * v0) / (2 * Math.max(60, PLAYER_Y - 14 - GLAIVE_TURN));
      const before = pb.vy[i];
      pb.vy[i] += dec * dt * (pb.vy[i] > 0 && stats.modeLv.glaive > 1 ? 1.6 : 1);
      if (before < 0 && pb.vy[i] >= 0) {
        pb.lastHit[i] = -1; pb.lane[i] = -1; pb.vx[i] = 0;
        if (stats.trioOn.chakram) { pb.kind[i] |= HOLD; pb.aux[i] = 0.5; pb.ox[i] = pb.x[i]; pb.flags[i] &= ~F_WAVE; pb.vy[i] = 0; }
        // KAMA BOMB: it explodes where it turns; SEEDER: it drops a mine there
        if (stats.pairOn.kama) blast(pb.x[i], pb.y[i], pb.dmg[i] * 0.8, stats, null);
        if (stats.pairOn.seeder && countShape(SH_MINE) < 3) {
          const bi = bodyAt(spawn(playerBullets, pb.x[i], Math.max(pb.y[i], ENEMY_LINE + 20), 0, 0, 5, pb.dmg[i] * 0.35, 0, 0), SH_MINE, -1);
          if (bi >= 0) { playerBullets.ox[bi] = playerBullets.y[bi]; playerBullets.aux[bi] = 0; }
        }
      }
      tetherBurn(p, stats, hit, pb.x[i], pb.y[i]);
      if (pb.vy[i] > 0) {
        if (!(pb.flags[i] & F_WAVE)) pb.vx[i] += ((p.x - pb.x[i]) * 4 - pb.vx[i]) * Math.min(1, dt * 6);
        if (pb.y[i] > PLAYER_Y - 24) { burst(pb.x[i], pb.y[i], SHOT, 3, 60, 0.2, 1.5); kill(pb, i); i--; continue; }
      } else if (pb.vy[i] < 0 && !(pb.flags[i] & F_WAVE) && pb.y[i] < (PLAYER_Y + GLAIVE_TURN) / 2) pb.vx[i] *= 1 - Math.min(1, dt * 3);
    } else if (sh === SH_MINE) {
      if (pb.vy[i] !== 0 && pb.y[i] <= pb.ox[i]) { pb.vy[i] = 0; pb.vx[i] = 0; pb.y[i] = pb.ox[i]; }
      if (pb.vy[i] === 0) {
        pb.aux[i] += dt;
        // NEST: a parked mine hatches a stinging larva every 0.5 s, then bursts at 2 s
        if (stats.trioOn.nest) {
          if (Math.floor((pb.aux[i] - dt) * 2) !== Math.floor(pb.aux[i] * 2)) hatch(pb.x[i], pb.y[i] - 10, 1, pb.dmg[i] * 0.6, stats);
          if (pb.aux[i] < 2) continue;
        }
        const near = enemies.some((e) => !e.dead && Math.abs(e.x - pb.x[i]) < LANE_W * 0.55 && Math.abs(e.y - pb.y[i]) < 70);
        if (stats.pairOn.claymore && enemies.some((e) => !e.dead && e.y < pb.y[i] && Math.abs(e.x - pb.x[i]) < LANE_W * 0.5)) {
          pb.aux[i] = -9; pb.vy[i] = -520; sfx.shoot(); continue;           // CLAYMORE: launch
        }
        if (near || pb.aux[i] >= 2) {
          burstAt(pb.x[i], pb.y[i] - 20, LANE_W * 0.6, pb.dmg[i], stats, hit, pb.flags[i]);
          if (stats.pairOn.eggclutch) hatch(pb.x[i], pb.y[i] - 20, 2, pb.dmg[i] * 0.1, stats);   // EGG CLUTCH
          kill(pb, i); i--; continue;
        }
      }
    } else if (sh === SH_LOB) {
      // CARPET: halfway up, the shell bursts open into three shells for three lanes
      if (pb.kind[i] & SPLIT && (pb.ox[i] - pb.y[i]) / Math.max(1, pb.ox[i] - pb.aux[i]) >= 0.45) {
        const lane = Math.max(0, Math.min(LANES - 1, Math.round((pb.x[i] + pb.vx[i] * 0.2 - laneX(0)) / LANE_W)));
        const tLeft = Math.max(0.1, (pb.y[i] - pb.aux[i]) / -pb.vy[i]);
        flash(pb.x[i], pb.y[i], 18, '#ffd27a', 0.25);
        burst(pb.x[i], pb.y[i], '#ffd27a', 8, 140, 0.25, 2);
        for (const o of [-1, 0, 1]) {
          const l = lane + o;
          if (l < 0 || l >= LANES) continue;
          const bi = bodyAt(spawn(playerBullets, pb.x[i], pb.y[i], (laneX(l) - pb.x[i]) / tLeft, pb.vy[i], pb.r[i] * 0.8, pb.dmg[i] / 3, 0, 0), SH_LOB, -1);
          if (bi < 0) continue;
          playerBullets.ox[bi] = pb.ox[i]; playerBullets.aux[bi] = pb.aux[i]; playerBullets.flags[bi] = pb.flags[i];
        }
        kill(pb, i); i--; continue;
      }
      if (pb.y[i] <= pb.aux[i]) {
        burstAt(pb.x[i], pb.aux[i], LANE_W * 0.55 * (stats.modeLv.mortar > 1 ? 1.2 : 1), pb.dmg[i], stats, hit, pb.flags[i]);
        kill(pb, i); i--; continue;
      }
    } else if (pb.flags[i] & F_LATCH) {
      // larva / stinger stuck in its host (vx, vy = offset from it)
      const e = enemies.find((o) => o.id === pb.aux[i] && !o.dead);
      if (!e) { kill(pb, i); i--; continue; }
      pb.x[i] = e.x + pb.vx[i]; pb.y[i] = e.y + pb.vy[i];
      const before = pb.ox[i];
      pb.ox[i] -= dt;
      if (sh === SH_LARVA) {
        // eats in four bites per second; bosses are half as edible
        if (Math.floor(before * 4) !== Math.floor(pb.ox[i] * 4)) onHit(e, pb.dmg[i] / 8 * (e.type === 'boss' ? 0.5 : 1), stats, hit, false, pb.flags[i] & ~F_EXPLODE);
        if (pb.ox[i] <= 0) { kill(pb, i); i--; continue; }
      } else if (pb.ox[i] <= 0) {
        rings.push({ x: e.x, y: e.y, r: 18, t: 0.2 });
        burst(e.x, e.y, '#ffd27a', 8, 140, 0.25, 2);
        sfx.explode();
        if (stats.trioOn.executioner) e.overkilled = true;     // its leftover becomes a stinger instead
        onHit(e, pb.dmg[i], stats, hit, true, pb.flags[i]);
        if (stats.trioOn.executioner && e.dead) {
          const left = -e.hp / (e.brandMul || 1);
          const t = enemies.filter((o) => !o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 180).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
          if (t) { arcs.push({ x1: e.x, y1: e.y, x2: t.x, y2: t.y, t: 0.15 }); plant(t, Math.max(0, left) * 1.4 + pb.dmg[i] * 0.3, 0.35); flash(e.x, e.y, 18, '#ffd27a', 0.25); }
        }
        kill(pb, i); i--; continue;
      }
    }
  }
  if (tetherTick <= 0) tetherTick = 0.1;
}

// TETHER (+ LASER): a beam from you to a glaive in flight burns what it crosses.
function tetherBurn(p, stats, hit, gx, gy) {
  if (!stats.pairOn.tether) return;
  const seg = [];
  for (let k = 0; k <= 12; k++) seg.push(p.x + (gx - p.x) * k / 12, PLAYER_Y - 22 + (gy - PLAYER_Y + 22) * k / 12);
  beams.push({ pts: seg, w: 2.2, a: 0.55 });
  if (tetherTick <= 0 && hit) for (const h of hitsAlong(seg, 5, 99).hits) onHit(h.e, currentDamage(p, stats) * stats.fireRate * 0.012, stats, hit, false);
}

// TRIPWIRE (LASER + SPORE MINE): parked mines in neighbouring lanes are wired;
// an enemy in the wire's band (the enemy line just above) burns.
function tripwires(p, stats, hit) {
  const pb = playerBullets, mines = [];
  for (let i = 0; i < pb.n; i++) if (pb.shape[i] === SH_MINE && pb.vy[i] === 0 && pb.aux[i] >= 0) mines.push(i);
  const tick = wireTick <= 0;
  for (let a = 0; a < mines.length; a++) for (let b = a + 1; b < mines.length; b++) {
    const i = mines[a], j = mines[b];
    const dx = Math.abs(pb.x[i] - pb.x[j]);
    if (dx < LANE_W * 0.6 || dx > LANE_W * 1.4 || Math.abs(pb.y[i] - pb.y[j]) > 70) continue;
    beams.push({ pts: [pb.x[i], pb.y[i], pb.x[j], pb.y[j]], w: 1.6, a: 0.5 });
    if (!tick || !hit) continue;
    const lo = Math.min(pb.x[i], pb.x[j]), hi = Math.max(pb.x[i], pb.x[j]), wy = (pb.y[i] + pb.y[j]) / 2;
    for (const e of enemies) if (!e.dead && e.x > lo - 6 && e.x < hi + 6 && Math.abs(e.y - (wy - 40)) < 50) onHit(e, currentDamage(p, stats) * stats.fireRate * 0.03, stats, hit, false);
  }
  if (tick) wireTick = 0.1;
}

// ---- rail carrier: instant strikes along every path -----------------------
function fireRail(p, stats, hit, beat = 0) {
  if (!hit) return;
  const mod = shotMods(p, stats, !beat);
  const siege = mod.charged && stats.siege;
  const dmg = currentDamage(p, stats) * 6.5 * (1 + 0.25 * Math.min(4, stats.pierce)) * (siege ? 2.5 / 1.8 : 1) * mod.dmg * (beat || 1);
  const specs = lockTargets(p, stats, pattern(p, stats));
  if (stats.twinlink && p.twinT > 0) specs.push({ lane: p.twinLane, mul: 1, fromX: laneX(p.twinLane) });
  specs.push(...armadaSpecs(stats, 0.35));
  if (stats.overload && p.shotCount % 3 === 0) for (const o of [-1, 1]) specs.push({ lane: aimLane(p, stats) + o, mul: 1 });
  const phase = p.shotCount * 1.7;
  for (const spec of specs) {
    if (spec.lane !== undefined && (spec.lane < 0 || spec.lane >= LANES)) continue;
    const pts = buildPath(p, spec, stats.hasSine, phase);
    const { hits } = hitsAlong(pts, 6 * mod.size, 99);
    if (stats.pairOn.harpoon && spec === specs[0] && hits.length) plant(hits[0].e, dmg * 0.18, stingFuse(stats));   // HARPOON
    if (stats.trioOn.targetlock && spec === specs[0] && hits.length) hits[0].e.lockUntil = performance.now() / 1000 + 3;   // TARGET LOCK: marked
    if (stats.pairOn.fuseline) fuseMines(pts, stats, hit);                                              // FUSE LINE
    let ramp = 1;
    for (const { e } of hits) {
      onHit(e, dmg * spec.mul * ramp, stats, hit, true);
      ramp *= 1 + stats.pierceRamp;                       // PIERCER 3 / BONE LANCE
      if (stats.hasRocket) blast(e.x, e.y, dmg * spec.mul, stats, e);
      if (siege && e.type === 'boss') e.stunT = 0.6;     // SIEGE: the boss reels
    }
    rails.push({ pts, t: 0.2, w: spec.mul * mod.size });
    if (stats.afterglow) addTrail(pts, 0.35, stats, p);
    // RICOCHET: the rail reflects off the top edge back down to the enemy line
    // (x2: into the next lane; PINBALL: once more)
    if (stats.ricochet && pts.length >= 4) {
      let x = pts[pts.length - 2];
      for (let b = 0; b < Math.min(2, stats.bounces); b++) {
        let tx = x;
        if (stats.ricochet > 1) {
          const l = Math.round((x - laneX(0)) / LANE_W);
          const side = [-1, 1].map((o) => l + o).filter((v) => v >= 0 && v < LANES && enemiesInLane(v).length);
          if (side.length) tx = laneX(side[0]);
        }
        const rpts = [];
        for (let yy = 0; yy < ENEMY_LINE + 60; yy += 12) rpts.push(x + (tx - x) * Math.min(1, yy / (ENEMY_LINE - 50)), yy);
        for (const h of hitsAlong(rpts, 6, 99).hits) onHit(h.e, dmg * spec.mul * 0.35, stats, hit, false);
        rails.push({ pts: rpts, t: 0.2, w: spec.mul * 0.4 });
        x = tx;
      }
    }
    // FISSION: from the first target two rails fork into the side lanes.
    if (stats.fission && hits.length && !spec.fork) {
      const f = hits[0].e;
      for (const l of forkLanes(Math.round((f.x - laneX(0)) / LANE_W), stats)) {
        const fpts = [];
        for (let y = f.y; y > -10; y -= 12) fpts.push(f.x + (laneX(l) - f.x) * Math.min(1, (f.y - y) / 90), y);
        for (const h of hitsAlong(fpts, 6, 99).hits) if (h.e !== f) onHit(h.e, dmg * spec.mul * 0.5, stats, hit, false);
        rails.push({ pts: fpts, t: 0.2, w: spec.mul * 0.5 });
      }
    }
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
  const nova = stats.trioOn.supernova;
  if (stats.hasRail && !nova) {
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
  // CHARGE / OVERCHARGE on a beam: a short heavy surge.
  if (p.charged) { p.charged = false; p.stillT = 0; p.chargeSurgeT = 0.4; }
  if (p.chargeSurgeT > 0) { p.chargeSurgeT -= dt; surge *= 1.8; widthMul *= 1.6; }
  if (p.overchargeT > 0) { surge *= 1.8; widthMul *= 1.4; }
  const ghost = stats.ghost && p.phaseT > 0;
  if (ghost) surge *= 2;
  if (stats.slingshot && p.slingT > 0) surge *= 1.3;   // SLINGSHOT
  // LASER x2: holding the beam on one target ramps up to +20% over 2 s
  if (stats.modeLv.laser > 1) {
    const first = enemiesInLane(aimLane(p, stats))[0];
    if (first && first === p.rampE) p.rampT = Math.min(2, (p.rampT || 0) + dt); else { p.rampE = first; p.rampT = 0; }
    surge *= 1 + 0.1 * (p.rampT || 0);
  }
  // SUPERNOVA (LASER + RAIL + ROCKET): a weaker beam while it charges, then a nova
  let novaFire = false;
  const novaEvery = 2 / stats.shotSpeed;
  if (nova) {
    p.novaT = (p.novaT || 0) + dt;
    surge *= 0.7;
    widthMul *= 0.7 + 0.6 * Math.min(1, p.novaT / novaEvery);
    if (p.novaT >= novaEvery) { p.novaT = 0; novaFire = true; }
    // the charge gathers at the maw: a swelling white core, sparks drawn in
    const k = p.novaT / novaEvery;
    flashes.push({ x: p.x, y: PLAYER_Y - 26, r: 4 + 12 * k, t: 0.02, max: 0.02, c: k > 0.85 ? '#ffffff' : SHOT });
    if (Math.random() < k) burst(p.x + (Math.random() - 0.5) * 60, PLAYER_Y - 26 - Math.random() * 40, '#f4ffd8', 1, -80, 0.2, 1.5);
  }
  const dps = stats.fireRate * rateMul * currentDamage(p, stats) * 1.15 * surge;
  const tick = p.laserTick <= 0;
  if (tick) { p.laserTick += 0.1; p.laserCount = (p.laserCount || 0) + 1; }
  const width = (4 + stats.bulletSize * 0.9) * widthMul * dmgScale(currentDamage(p, stats));
  const phase = p.beamT * 5;
  const specs = lockTargets(p, stats, pattern(p, stats));
  if (stats.twinlink && p.twinT > 0) specs.push({ lane: p.twinLane, mul: 0.7, fromX: laneX(p.twinLane) });
  specs.push(...armadaSpecs(stats, 0.35));
  // AFTERGLOW + LASER (SCAR): changing lane leaves the old beam burning.
  if (stats.afterglow && p.ev && p.ev.lane && p.lastBeam) addTrail(p.lastBeam, stats.scar ? 1 : 0.35, stats, p);
  const pierceN = ghost ? 99 : 1 + stats.pierce + (stats.skyshot && p.jumpT > 0 ? stats.skyshot : 0);
  for (const spec of specs) {
    const pts = buildPath(p, spec, stats.hasSine, phase);
    const { hits, end } = hitsAlong(pts, width * 0.5, pierceN);
    const shown = hits.length >= pierceN ? pts.slice(0, end) : pts;
    if (spec === specs[0]) p.lastBeam = shown;
    if (novaFire && spec === specs[0] && hit) {
      const all = hitsAlong(pts, width * 1.6, 99).hits;
      const nd = (dps / 0.7) * novaEvery * 0.85;
      for (const { e } of all) { onHit(e, nd, stats, hit, true); blast(e.x, e.y, nd * 0.5, stats, e); flash(e.x, e.y, 30, '#ffffff', 0.35); }
      novas.push({ pts, t: 0.4 });
      flash(p.x, PLAYER_Y - 26, 34, '#ffffff', 0.3);
      sfx.rail(); shake(6, 0.2);
    }
    beams.push({ pts: shown, w: width * (spec.mul < 1 ? 0.55 : 1), a: Math.min(1, spec.mul + 0.3), white: nova ? p.novaT / novaEvery : 0 });
    // FISSION (FORK): the beam forks at its first targets into the side lanes.
    if (stats.fission) {
      for (const h of hits.slice(0, 2)) {
        const f = h.e;
        for (const l of forkLanes(Math.round((f.x - laneX(0)) / LANE_W), stats)) {
          const fpts = [];
          for (let y = f.y; y > -10; y -= 12) fpts.push(f.x + (laneX(l) - f.x) * Math.min(1, (f.y - y) / 90), y);
          const fh = hitsAlong(fpts, width * 0.3, 1).hits.filter((x) => x.e !== f);
          beams.push({ pts: fh.length ? fpts.slice(0, fh[0].at + 2) : fpts, w: width * 0.6, a: 0.7 });
          if (tick && hit) for (const x of fh) onHit(x.e, dps * 0.05 * spec.mul, stats, hit, false);
        }
      }
    }
    if (tick && hit) {
      let ramp = 1;
      for (const { e } of hits) { onHit(e, dps * 0.1 * spec.mul * ramp, stats, hit, p.laserCount % 3 === 0); ramp *= 1 + stats.pierceRamp; e.beamed = true; }   // HATCHERY reads `beamed`
      // CAUTERIZE (+ STINGER): a second on the same enemy plants a charge
      if (stats.pairOn.cauterize && spec === specs[0]) {
        const f = hits[0] && hits[0].e;
        if (f && f === p.cautE) p.cautT = (p.cautT || 0) + 0.1; else { p.cautE = f; p.cautT = 0; }
        if (f && p.cautT >= 1) { p.cautT = 0; plant(f, currentDamage(p, stats) * 1.4, 0.15); flash(f.x, f.y, 22, '#ffd27a', 0.3); }
        cautFx = f ? { e: f, k: p.cautT } : null;
      }
      const last = hits[hits.length - 1];
      if (last) {
        burst(last.e.x, last.e.y + 8, SHOT, 2, 120, 0.2, 1.5);
        if (stats.hasRocket && !nova && p.laserCount % 4 === 0) blast(last.e.x, last.e.y, dps * 0.4 * spec.mul, stats, last.e);
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
    // CONVERGENCE: bend onto the aimed lane (x = aux) by the enemy line
    if (pb.lane[i] === -3 && pb.vy[i] < 0) {
      const tLeft = Math.max(0.05, (pb.y[i] - ENEMY_LINE) / -pb.vy[i]);
      const want = (pb.aux[i] - pb.x[i]) / tLeft;
      pb.vx[i] += (want - pb.vx[i]) * Math.min(1, dt * 7);
      if (pb.y[i] < ENEMY_LINE) pb.lane[i] = -1;
    }
    // RICOCHET: bounce off the top edge back down (count in flag bits 10-12);
    // PINBALL bounces back up from just below the enemy line too. A shot on its
    // way down never reaches the player row.
    if (stats.ricochet && pb.lane[i] !== -2 && (pb.shape[i] === SH_BOLT || pb.shape[i] === SH_STING) && !(f & F_LATCH)) {
      const nb = (f >> 10) & 7;
      if (pb.vy[i] < 0 && pb.y[i] < 6 && nb < stats.bounces * 2 - 1) {
        pb.vy[i] = Math.abs(pb.vy[i]) * 0.9;
        pb.y[i] = 6;
        pb.lastHit[i] = -1;
        pb.dmg[i] *= 0.45;                               // a bounced shot is spent
        pb.flags[i] = (f & ~(7 << 10)) | (Math.min(7, nb + 1) << 10);
        pb.lane[i] = -1;
        pb.vx[i] = 0;
        // x2: veer into the next lane that holds an enemy (ox = where to come down)
        let tx = pb.x[i];
        if (stats.ricochet > 1) {
          const l = Math.round((pb.x[i] - laneX(0)) / LANE_W);
          const side = [-1, 1].map((o) => l + o).filter((x) => x >= 0 && x < LANES && enemiesInLane(x).length);
          if (side.length) tx = laneX(side[Math.floor(Math.random() * side.length)]);
        }
        pb.ox[i] = tx;
      } else if (pb.vy[i] > 0 && nb > 0) {
        if (!(f & F_WAVE)) pb.vx[i] = Math.max(-400, Math.min(400, (pb.ox[i] - pb.x[i]) * 9));
        if (pb.y[i] > ENEMY_LINE + 70 && nb < stats.bounces * 2 - 1) {
          pb.vy[i] = -Math.abs(pb.vy[i]); pb.lastHit[i] = -1; pb.vx[i] = 0; pb.dmg[i] *= 0.8;
          pb.flags[i] = (f & ~(7 << 10)) | (Math.min(7, nb + 1) << 10);
        } else if (pb.y[i] > ENEMY_LINE + 110) { kill(pb, i); i--; continue; }
      }
    }
    // SHRAPNEL shards chase the enemy they were aimed at (it may be moving).
    if (pb.lane[i] === -2) {
      const t = enemies.find((o) => o.id === pb.aux[i] && !o.dead);
      if (t) {
        const dx = t.x - pb.x[i], dy = t.y - pb.y[i], d = Math.hypot(dx, dy) || 1;
        const sp = pb.shape[i] === SH_LARVA ? 330 : 560;
        pb.vx[i] = (dx / d) * sp; pb.vy[i] = (dy / d) * sp;
      }
    }
    // SCATTER range: measured on the real distance to the enemy line (the
    // screen height follows the phone), so it always reaches enemies holding
    // position; SHOT SPEED only stretches it (slow builds like SLUG still reach).
    const reach = (PLAYER_Y - 60) * Math.max(0.95, Math.min(1.3, 0.75 + 0.25 * stats.shotSpeed)) * (stats.modeLv.scatter > 1 ? 1.12 : 1);
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
      const off = weaveFn(pb.aux[i] + traveled * 0.026 / stats.shotSpeed) * LANE_W * Math.min(1, traveled / 60);
      pb.x[i] = pb.ox[i] + off - pb.vx[i] * dt;
    }
  }
}

// Homing: a bullet tracks enemies in the lane it was fired from or the two
// lanes next to it; with SEEKER x2, two lanes away when nothing is closer.
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
    // BLOODHOUND: toward a branded enemy the reach is two lanes (the one
    // exception to the seeker's one-lane rule).
    const xMin2 = laneX(Math.max(0, lane - 2)) - LANE_W * 0.5;
    const xMax2 = laneX(Math.min(LANES - 1, lane + 2)) + LANE_W * 0.5;
    for (const e of enemies) {
      if (e.dead || e.y > pb.y[i]) continue;
      const wide = stats.bloodhound && e.brandMul;
      const lo = wide ? xMin2 : xMin, hi = wide ? xMax2 : xMax;
      // Big targets (bosses): aim at their closest point inside the allowed lanes.
      const tx = Math.max(lo, Math.min(hi, e.x));
      if (!e.hitboxes && (e.x < lo || e.x > hi)) continue;
      const d = Math.abs(tx - pb.x[i]) + (pb.y[i] - e.y) * 0.3;
      if (d < bd) { bd = d; bestX = tx; found = true; }
    }
    // SEEKER 2: nothing within one lane, look two lanes away (gentler turn)
    let kk = k;
    if (!found && stats.seekReach > 1) {
      for (const e of enemies) {
        if (e.dead || e.y > pb.y[i]) continue;
        const tx = Math.max(xMin2, Math.min(xMax2, e.x));
        if (!e.hitboxes && (e.x < xMin2 || e.x > xMax2)) continue;
        const d = Math.abs(tx - pb.x[i]) + (pb.y[i] - e.y) * 0.3;
        if (d < bd) { bd = d; bestX = tx; found = true; }
      }
      kk = k * 0.7;
    }
    if (!found) continue;
    const want = Math.max(-maxVx, Math.min(maxVx, (bestX - pb.x[i]) * kk));
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
  let crit = false;
  if (primary && stats.crit > 0 && run.rng.next() < stats.crit) {
    crit = true;
    // EXECUTION: crits on a branded enemy hit x5
    d *= stats.execution && e.brandMul ? Math.max(5, stats.critMul) : stats.critMul;
    burst(e.x, e.y, PAL.white, 8, 200, 0.3, 2);
    run.onCrit(e);
  }
  damageEnemy(e, d);
  sfx.hit();
  if (e.dead && stats.overkill) overkill(e, stats, 0);
  // CULL: finish the weak (never bosses; elites only with two stacks)
  if (stats.cull && !e.dead && e.type !== 'boss' && (stats.cull > 1 || !e.elite) && e.hp < e.maxHp * (stats.cull > 1 ? 0.18 : 0.12)) {
    if (damageEnemy(e, e.hp / (e.brandMul || 1) + 0.01)) burst(e.x, e.y, PAL.white, 10, 160, 0.3, 2);
  }
  // PARALYTIC: numbs the schedule (bosses: the run turns it into short stuns)
  if (stats.paralytic && !e.dead) {
    e.numbT = 0.6;
    if (e.type !== 'boss') { e.slowT = Math.max(e.slowT || 0, 0.6); e.slowK = Math.max(e.slowK || 0, 0.25); }
    if (stats.paralytic > 1 && primary && (e.numbHits = (e.numbHits || 0) + 1) >= 5) {
      e.numbHits = 0;
      if (!(e.freezeCd > 0)) { e.freezeCd = 2; if (e.type === 'boss') e.numbFreeze = true; else e.freezeT = 0.5; }
    }
  }
  // BRAND: the first hit marks the enemy
  if (stats.brand && !e.brandMul && !e.dead) e.brandMul = stats.brand > 1 ? 1.35 : 1.2;
  // EXECUTION: a branded enemy killed by a crit passes the brand on
  if (crit && stats.execution && e.dead && e.brandMul) {
    const next = enemies.filter((o) => !o.dead && !o.brandMul).sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];
    if (next) { next.brandMul = e.brandMul; arcs.push({ x1: e.x, y1: e.y, x2: next.x, y2: next.y, t: 0.15 }); }
  }
  if (flags & F_SLOW) { e.slowT = 1; e.slowK = Math.max(e.slowK || 0, 0.3); }   // WRAITH
  if (stats.toxin > 0 || flags & F_TOXIC) {
    const stacks = Math.max(stats.toxin, 1) * (flags & F_TOXIC ? 2 : 1);
    e.poison = Math.min(12, Math.max(e.poison, stacks));
    e.poisonT = 3;
    e.poisoned = true;
  }
  if (flags & F_EXPLODE) blast(e.x, e.y, dmg, stats, e);
  if (!primary) return crit;
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
    // FRAG x2: the blast also reaches the nearest enemy in the next lanes at about the same height
    if (stats.fragReach) {
      for (const o2 of [-1, 1]) {
        const x = e.x + o2 * LANE_W;
        const t = enemies.find((o) => !o.dead && o !== e && Math.abs(o.x - x) < LANE_W * 0.5 && Math.abs(o.y - e.y) < 50 && !overlaps(o, e.x, e.y, radius));
        if (t) { rings.push({ x: t.x, y: t.y, r: 20, t: 0.2 }); damageEnemy(t, dmg * 0.25); }
      }
    }
  }
  if (stats.arc > 0) {
    // CONDUIT: branded enemies are reached first, and one more jump
    const targets = enemies.filter((o) => o !== e && !o.dead && Math.hypot(o.x - e.x, o.y - e.y) < 170)
      .sort((a, b) => (stats.conduit ? (b.brandMul ? 1 : 0) - (a.brandMul ? 1 : 0) : 0) || Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))
      .sort((a, b) => (stats.arcLanes ? (laneOf(a) === laneOf(e) ? 1 : 0) - (laneOf(b) === laneOf(e) ? 1 : 0) : 0))   // ARC 3: other lanes first
      .slice(0, Math.floor(stats.arc) + (stats.conduit ? 1 : 0));
    // STORMCALLER: then on through every branded enemy, nearest first
    if (stats.evo.stormcaller) {
      let last = targets[targets.length - 1] || e;
      const left = enemies.filter((o) => o !== e && !o.dead && o.brandMul && !targets.includes(o));
      while (left.length && targets.length < 12) {
        left.sort((a, b) => Math.hypot(a.x - last.x, a.y - last.y) - Math.hypot(b.x - last.x, b.y - last.y));
        last = left.shift(); targets.push(last);
      }
    }
    let from = e;
    for (const t of targets) {
      arcs.push({ x1: from.x, y1: from.y, x2: t.x, y2: t.y, t: 0.15 });
      damageEnemy(t, dmg * stats.arcMul);
      if (stats.frag > 1) rings.push({ x: t.x, y: t.y, r: 20, t: 0.2 });
      from = t;
    }
    if (targets.length) sfx.arc();
  }
  return crit;
}
const laneOf = (e) => Math.round((e.x - laneX(0)) / LANE_W);

// OVERKILL: what was left over after a kill carries on to the next enemy in
// the lane (x2: half of it to the nearest enemy in each lane beside too).
function overkill(e, stats, depth) {
  const left = -e.hp / (e.brandMul || 1);
  if (left < 0.05 || depth > 3 || e.overkilled) return;
  e.overkilled = true;
  const lane = laneOf(e);
  const nearestIn = (l) => enemies.filter((o) => !o.dead && o !== e && laneOf(o) === l)
    .sort((a, b) => Math.abs(a.y - e.y) - Math.abs(b.y - e.y))[0];
  const hitOne = (t, amt) => {
    arcs.push({ x1: e.x, y1: e.y, x2: t.x, y2: t.y, t: 0.15 });
    if (damageEnemy(t, amt)) overkill(t, stats, depth + 1);
  };
  const t = nearestIn(lane);
  if (t) hitOne(t, left);
  if (stats.overkill > 1) for (const o of [-1, 1]) { const s2 = nearestIn(lane + o); if (s2) hitOne(s2, left * 0.5); }
}

// Player bullets vs all targets (enemies + boss).
export function resolvePlayerHits(stats, run) {
  const pb = playerBullets;
  for (let i = 0; i < pb.n; i++) {
    const sh = pb.shape[i];
    // mines and mortar shells only burst (updateBioShots); stuck bodies are done
    if (sh === SH_MINE || sh === SH_LOB || pb.flags[i] & F_LATCH) continue;
    for (const e of enemies) {
      if (e.dead || pb.lastHit[i] === e.id) continue;
      if (!overlaps(e, pb.x[i], pb.y[i], pb.r[i])) continue;
      if (sh === SH_LARVA || sh === SH_STING) {
        // stick: larvae eat for 2 s, stingers burst after their fuse
        if (sh === SH_STING) onHit(e, pb.dmg[i] * 0.1, stats, run, false, pb.flags[i] & ~F_EXPLODE);
        if (sh === SH_LARVA && stats.pairOn.queen) plant(e, pb.dmg[i] * 0.2, stingFuse(stats));   // QUEEN
        pb.flags[i] = (pb.flags[i] & ~F_WAVE) | F_LATCH;
        pb.lane[i] = -1;                                   // no more chasing or homing
        pb.aux[i] = e.id;
        pb.ox[i] = sh === SH_LARVA ? 2 : stats.modeLv.stinger > 1 ? 0.8 : 1;
        pb.vx[i] = Math.max(-9, Math.min(9, pb.x[i] - e.x)); pb.vy[i] = Math.max(-9, Math.min(9, pb.y[i] - e.y));
        break;
      }
      const crit = onHit(e, pb.dmg[i], stats, run, true, pb.flags[i]);
      if (sh === SH_GLAIVE && pb.vy[i] > 0 && stats.pairOn.reaper) popStings(e, stats.trioOn.triad ? 1.3 : 1.1);   // REAPER
      if (stats.pairOn.waspnest && pb.flags[i] & F_ROCKET) hatch(pb.x[i], pb.y[i], 2, pb.dmg[i] * 0.16, stats);   // WASP NEST
      fission(pb, i, stats, e);
      if (pb.flags[i] & F_ECHO) thunderclap(pb, i, e);
      if (crit && stats.critPierce) pb.pierce[i] = Math.min(255, pb.pierce[i] + stats.critPierce);   // HEADSHOT 3
      if (pb.pierce[i] > 0) {
        pb.pierce[i]--;
        pb.lastHit[i] = e.id;
        pb.dmg[i] *= 1 + stats.pierceRamp;                    // PIERCER 3 / BONE LANCE
      } else {
        kill(pb, i); i--;
      }
      break;
    }
  }
}

// THUNDERCLAP (ECHO + RAPID): an echo round bursts into three smaller echoes.
// The three echoes chase the nearest other enemies (they hold at about the same
// height, so echoes flying straight up would hit nothing); leftovers fly up.
function thunderclap(pb, i, e) {
  pb.flags[i] &= ~F_ECHO;
  const near = enemies.filter((o) => !o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 220)
    .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y));
  [-160, 0, 160].forEach((vx, k) => {
    const t = near[k];
    const bi = spawn(playerBullets, pb.x[i], pb.y[i] - 8, vx, -520, Math.max(3, pb.r[i] * 0.55), pb.dmg[i] * 0.18, BIG, 1);
    if (bi < 0) return;
    playerBullets.lastHit[bi] = e.id;
    if (t) { playerBullets.lane[bi] = -2; playerBullets.aux[bi] = t.id; }
  });
  rings.push({ x: pb.x[i], y: pb.y[i], r: 30, t: 0.25 });
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
  for (let i = 0; i < flashes.length; i++) { flashes[i].t -= dt; if (flashes[i].t <= 0) { flashes.splice(i, 1); i--; } }
  for (let i = 0; i < novas.length; i++) { novas[i].t -= dt; if (novas[i].t <= 0) { novas.splice(i, 1); i--; } }
  if (cautFx && cautFx.e.dead) cautFx = null;
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
  if (trails.length) drawTrails();
  const t = performance.now() / 1000;
  for (const f of flashes) drawGlowDot(f.x, f.y, f.c, f.r * (1.2 - 0.4 * (f.t / f.max)), 0.75 * (f.t / f.max));
  for (const nv of novas) {
    const a = nv.t / 0.4;
    poly(nv.pts, SHOT, 40 * a + 6, 0.35 * a);
    poly(nv.pts, '#ffffff', 14 * a + 2, 0.9 * a);
  }
  // TARGET LOCK: a reticle on the marked enemy
  for (const e of enemies) {
    if (e.dead || !(e.lockUntil > t)) continue;
    const rr = (e.r || 14) + 8;
    ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(t * 2);
    ctx.strokeStyle = SHOT; ctx.lineWidth = 2; ctx.globalAlpha = 0.9;
    for (let k = 0; k < 4; k++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(rr, -5); ctx.lineTo(rr, 0); ctx.lineTo(rr - 5, 0); ctx.stroke(); }
    ctx.restore();
  }
  // CAUTERIZE: the charge filling on the held target
  if (cautFx && !cautFx.e.dead && cautFx.k > 0.05) {
    const e = cautFx.e, rr = (e.r || 14) + 6;
    ctx.save(); ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(e.x, e.y, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, cautFx.k)); ctx.stroke(); ctx.restore();
    drawGlowDot(e.x, e.y, '#ffd27a', 4 + 8 * cautFx.k, 0.3 + 0.4 * cautFx.k);
  }
  for (const b of beams) {
    const flick = 0.85 + Math.random() * 0.15;
    poly(b.pts, SHOT, b.w * 2.2 * flick, 0.22 * b.a);
    if (!texturedBeam(b.pts, b.w * flick, b.a, t)) {
      poly(b.pts, SHOT, b.w * flick, 0.6 * b.a);
      poly(b.pts, '#f4ffd8', Math.max(1, b.w * 0.35), 0.95 * b.a);
    }
    if (b.white) poly(b.pts, '#ffffff', Math.max(1.5, b.w * 0.7 * b.white), 0.85 * b.white);   // SUPERNOVA charging
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

export function clearWeaponFx() { flashes.length = 0; novas.length = 0; cautFx = null; arcs.length = 0; rings.length = 0; wingmen.length = 0; beams.length = 0; rails.length = 0; trails.length = 0; }
