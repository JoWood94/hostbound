// Enemy bodies from primitives (rounded triangles, capsules, circles), flat
// colour, fixed designs: unlike the player, every enemy always looks and moves
// the same so it can be learned. Each silhouette tells its move:
//   drone    lens with wings, shoots its lane
//   sweeper  long body, its head points where it sweeps
//   crusher  heavy mass with teeth down: low wave
//   hopper   four jointed legs that spread on the hop
//   kamikaze an arrowhead that dives
//   wall     a wide shield bar
//   tank     double body on six walking legs
//   brooder  a sac with three eggs pulsing in order
//   stalker  slim body, a needle nose, two antennae, a big locking eye
//   throb    a core inside rings that beat like a heart
//   weaver   a spindle whose arms turn
//
// Sprite sheets in code: every type has five rows of poses sampled at 60 fps,
// built once at load (SHEETS). A pose is a handful of numbers (offsets,
// scales, phases) that the type's draw function turns into primitives, so
// the shapes stay sharp at any resolution and never vary between instances.
//   idle   loop, played on the enemy's age
//   tele   the wind-up, indexed by telegraph progress 0..1
//   atk    the shot / dive kick, played once (ATK_S seconds)
//   hit    white squash when a bullet lands (HIT_S seconds)
//   death  collapse + ring (DEATH_S seconds)
// The pupil is the only live part: it is drawn over the sheet and tracks
// the player. While telegraphing it swells and turns white.
import { ctx } from '../core/canvas.js';
import { DIM } from './draw.js';
import { capsule, rtri } from './oled.js';

const TAU = Math.PI * 2;
const FPS = 60;
export const ATK_S = 0.25, HIT_S = 0.1, DEATH_S = 0.5;
const ease = (k) => 1 - (1 - k) ** 3;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
// Loop-safe sine: whole cycles over p in 0..1, so idle rows wrap cleanly.
const sn = (p, n = 1, ph = 0) => Math.sin((p * n + ph) * TAU);
// Swell envelope shared by every telegraph: full at 35% of the wind-up.
const teEnv = (p) => ease(clamp01(p / 0.35));
const bump = (p, at, w) => Math.exp(-(((p - at) / w) ** 2));

function fill(c) { ctx.globalAlpha = DIM; ctx.fillStyle = c; ctx.fill(); }
function stroke(c, w) { ctx.globalAlpha = DIM; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }
function dot(x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); fill(c); }
function ringS(x, y, r, c, w) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); stroke(c, w); }

const paleCache = new Map();
function pale(hex) {           // the colour mixed 70% towards white: the pupil
  let v = paleCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.round(c + (255 - c) * 0.7).toString(16).padStart(2, '0');
    v = `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
    paleCache.set(hex, v);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Type definitions. base: the neutral pose. idle(p) / tele(p) / atk(p) return
// offsets added to it (p is 0..1 through the row). draw(x, y, s, P, c, d)
// fills the body and returns the eye sockets as [x, y, r, ...].
// Every pose has k (scale, base 1), dy (body lift, in s units), mz (muzzle
// ring progress, 0 = none).
// ---------------------------------------------------------------------------
const DEFS = {
  drone: {
    idleN: 60,
    base: { wing: 0.32 },
    idle: (p) => ({ wing: sn(p) * 0.22, k: sn(p, 2) * 0.02 }),
    tele: (p) => ({ wing: teEnv(p) * 0.25 + sn(p, 8) * 0.05 * p }),
    atk: (p) => ({ wing: -0.35 * (1 - p) ** 2, dy: -3 * (1 - p) ** 2 }),
    muzzleY: 9,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      for (const side of [-1, 1]) {
        const a = side * P.wing;
        const x1 = x + side * 6 * s, y1 = y - 3 * s, len = 12 * s;
        capsule(x1, y1, x1 + side * Math.cos(a) * len, y1 - Math.sin(Math.abs(a)) * len * 0.9, 2.6 * s); fill(c);
      }
      rtri(x, y, 13 * s * P.k, 0); fill(c);
      return [x, y - 3 * s, 4 * s * P.k];
    },
  },
  sweeper: {
    idleN: 60,
    base: { head: 0, legs: 0 },
    idle: (p) => ({ legs: sn(p, 2), head: sn(p, 1, 0.25) * 0.6 }),
    tele: (p) => ({ head: -4 * teEnv(p) + sn(p, 10) * 0.6 * p, legs: sn(p, 6) * 1.5 }),
    atk: (p) => ({ head: 5 * (1 - p) ** 2 }),
    muzzleY: 12,
    draw(x, y, s, P, c, d) {
      y += P.dy * s;
      const k = P.k;
      capsule(x - 13 * s * k, y, x + 13 * s * k, y, 7 * s * k); fill(c);
      rtri(x + d * (15 + P.head) * s * k, y + 1 * s, 8 * s * k, d > 0 ? -Math.PI / 2 : Math.PI / 2); fill(c);
      for (const sd of [-1, 1]) {
        capsule(x + sd * 8 * s, y + 5 * s, x + (sd * 11 + P.legs * sd * 2) * s, y + (13 - P.legs * sd) * s, 2 * s); fill(c);
      }
      return [x - d * 3 * s, y - 1 * s, 4 * s * k];
    },
  },
  crusher: {
    idleN: 60,
    base: { bite: 0, sq: 0 },
    idle: (p) => ({ bite: (sn(p, 1) * 0.5 + 0.5) * 1.6, dy: sn(p, 1, 0.25) * 0.6 }),
    tele: (p) => ({ bite: 4 * teEnv(p), dy: -3 * teEnv(p) }),
    atk: (p) => ({ dy: 3 * (1 - p) ** 2, sq: 0.25 * (1 - p) ** 2 }),
    muzzleY: 14,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      const k = P.k;
      for (let i = -1; i <= 1; i++) { rtri(x + i * 8 * s, y + (10 + P.bite) * s, 6 * s, 0); fill(c); }
      ctx.beginPath(); ctx.ellipse(x, y - 1 * s, 13 * s * k * (1 + P.sq), 13 * s * k * (1 - P.sq * 0.6), 0, 0, TAU); fill(c);
      return [x, y - 3 * s, 5 * s * k];
    },
  },
  hopper: {
    idleN: 60,
    base: { tw: 0, crouch: 0, spread: 0 },
    idle: (p) => ({ tw: sn(p, 2) }),
    tele: (p) => ({ crouch: 3 * teEnv(p), tw: sn(p, 8) * 0.6 * p }),
    atk: (p) => ({ spread: 0.5 * (1 - p) ** 2, crouch: -2 * (1 - p) ** 2 }),
    muzzleY: 10,
    draw(x, y, s, P, c, d, hop) {
      y += (P.dy + P.crouch) * s;
      const sp = 1 + (hop + P.spread) * 0.6, fold = P.crouch * 0.6;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const tw = P.tw * sx * sy;
        const kx = x + sx * 10 * s * sp, ky = y + sy * 4 * s - (4 + fold) * s + tw * s;
        capsule(x + sx * 4 * s, y + sy * 3 * s, kx, ky, 1.9 * s); fill(c);
        capsule(kx, ky, x + sx * 14 * s * sp, y + sy * 11 * s - P.crouch * s, 1.6 * s); fill(c);
      }
      dot(x, y, 8 * s * P.k, c);
      return [x, y, 4 * s * P.k];
    },
  },
  kamikaze: {
    idleN: 60,
    base: { sw: 0, stretch: 0, shake: 0 },
    idle: (p) => ({ sw: p }),
    tele: (p) => ({ stretch: -0.5 * teEnv(p), shake: sn(p, 12) * 0.9 * p }),
    atk: (p) => ({ stretch: 1 - (1 - p) ** 2 * 0.5 }),
    muzzleY: 12,
    draw(x, y, s, P, c, d, hop, dive) {
      x += P.shake * s; y += P.dy * s;
      const st = dive ? Math.max(1, P.stretch) : P.stretch;
      for (let kk = 3; kk >= 1; kk--) {
        const ox = Math.sin((P.sw - kk * 0.12) * TAU) * kk * 0.9 * s;
        dot(x + ox, y - (6 + kk * (5 + st * 4)) * s, (3.4 - kk * 0.7) * s * (1 + Math.max(0, st) * 0.3), c);
      }
      rtri(x, y + 2 * s, 13 * s * P.k, 0); fill(c);
      return [x, y - 1 * s, 3.6 * s * P.k];
    },
  },
  wall: {
    idleN: 60,
    base: { spike: 0, wide: 0 },
    idle: (p) => ({ spike: sn(p) * 1.5 }),
    tele: (p) => ({ wide: 3 * teEnv(p), spike: 3 * teEnv(p) + sn(p, 10) * 0.5 * p }),
    atk: (p) => ({ dy: -2 * (1 - p) ** 2, spike: 2 * (1 - p) ** 2 }),
    muzzleY: 12,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      const k = P.k, half = 18 + P.wide;
      capsule(x - half * s, y, x + half * s, y, 8 * s * k); fill(c);
      for (const sd of [-1, 1]) { rtri(x + sd * (half + 6 + P.spike) * s, y, 7 * s * k, sd > 0 ? -Math.PI / 2 : Math.PI / 2); fill(c); }
      return [x, y, 5 * s * k];
    },
  },
  tank: {
    idleN: 60,
    base: { walk: 0, amp: 1 },
    idle: (p) => ({ walk: p }),
    tele: (p) => ({ amp: -0.7 * teEnv(p), dy: -1.5 * teEnv(p) }),
    atk: (p) => ({ dy: -3 * (1 - p) ** 2 }),
    muzzleY: 20,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      const k = P.k;
      for (const sd of [-1, 1]) for (let kk = -1; kk <= 1; kk++) {
        const sw = Math.sin((P.walk * 2 + kk / 3 + (sd > 0 ? 0.5 : 0)) * TAU) * 3 * s * P.amp;
        capsule(x + sd * 11 * s, y + kk * 8 * s, x + sd * 21 * s, y + kk * 8 * s + 4 * s + sw, 2 * s); fill(c);
      }
      capsule(x, y - 8 * s, x, y + 8 * s, 12 * s * k); fill(c);
      return [x, y - 5 * s, 4.5 * s * k, x, y + 6 * s, 3 * s * k];
    },
  },
  brooder: {
    idleN: 60,
    base: { e0: 0, e1: 0, e2: 0, drop: 0 },
    idle: (p) => ({ e0: Math.max(0, sn(p)), e1: Math.max(0, sn(p, 1, -0.19)), e2: Math.max(0, sn(p, 1, -0.38)) }),
    tele: (p) => { const e = teEnv(p) * 1.4; return { e0: e, e1: e, e2: e }; },
    atk: (p) => ({ drop: 4 * (1 - p) ** 2 }),
    muzzleY: 16,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      const eg = [P.e0, P.e1, P.e2];
      for (let i = 0; i < 3; i++) dot(x + (i - 1) * 7 * s, y + (11 + P.drop * (i === 1 ? 1 : 0.5)) * s, (3 + eg[i] * 1.5) * s, c);
      dot(x, y - 1 * s, 11 * s * P.k, c);
      return [x, y - 2 * s, 4.5 * s * P.k];
    },
  },
  stalker: {
    idleN: 60,
    base: { ant: 0, fold: 0, needle: 0 },
    idle: (p) => ({ ant: p }),
    tele: (p) => ({ fold: teEnv(p), needle: 3 * teEnv(p) }),
    atk: (p) => ({ needle: 5 * (1 - p) ** 2 }),
    muzzleY: 16,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      const k = P.k;
      for (const sd of [-1, 1]) {
        const sway = Math.sin((P.ant + (sd > 0 ? 0.3 : 0)) * TAU) * 1.5 * (1 - P.fold);
        const tx = x + sd * (9 + P.fold * 4) * s, ty = y - (17 - P.fold * 6) * s + sway * s;
        capsule(x + sd * 3 * s, y - 8 * s, tx, ty, 1.3 * s); fill(c);
      }
      rtri(x, y + (11 + P.needle) * s, 6 * s, 0); fill(c);
      capsule(x, y - 6 * s, x, y + 5 * s, 6.5 * s * k); fill(c);
      return [x, y - 2 * s, 4.8 * s * k];
    },
  },
  throb: {
    idleN: 60,
    base: { beat: 0, burst: 0 },
    idle: (p) => ({ beat: bump(p, 0.12, 0.06) + bump(p, 0.32, 0.06) * 0.6 }),   // lub-dub, then rest
    tele: (p) => ({ beat: Math.max(0, sn(p, 4)) ** 4 * teEnv(p) }),
    atk: (p) => ({ burst: ease(p) * 6 * (1 - p) }),
    muzzleY: 0,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      const b = P.beat, k = P.k;
      ringS(x, y, (17 + b * 4 + P.burst) * s * k, c, 2.2 * s);
      ringS(x, y, (13 + b * 2 + P.burst * 0.5) * s * k, c, 1.6 * s);
      dot(x, y, (8.5 + b * 1.5) * s * k, c);
      return [x, y, 4 * s * k];
    },
  },
  weaver: {
    idleN: 80,
    base: { rot: 0, reach: 0 },
    idle: (p) => ({ rot: p * TAU / 3 }),            // a third of a turn: the 3 arms loop
    tele: (p) => ({ rot: ease(p) * TAU / 6, reach: 4 * teEnv(p) }),
    atk: (p) => ({ reach: 5 * (1 - p) ** 2 }),
    muzzleY: 12,
    draw(x, y, s, P, c) {
      y += P.dy * s;
      const k = P.k, L = (17 + P.reach) * s;
      for (let i = 0; i < 3; i++) {
        const a = P.rot + (i * TAU) / 3 - Math.PI / 2;
        capsule(x, y, x + Math.cos(a) * L, y + Math.sin(a) * L, 2.2 * s); fill(c);
        dot(x + Math.cos(a) * L, y + Math.sin(a) * L, 3.2 * s, c);
      }
      dot(x, y, 9 * s * k, c);
      return [x, y, 4.2 * s * k];
    },
  },
};

// Every row starts from these; a type's base adds its own keys.
const COMMON = { k: 1, dy: 0, mz: 0, white: 0, ring: 0 };
const commonTele = (p) => ({ k: teEnv(p) * 0.12 });
const commonAtk = (p) => ({ mz: p });
const commonHit = (p) => ({ k: 0.1 * (1 - p), dy: -1 * (1 - p), white: p < 0.7 ? 1 : 0 });
// Death: the silhouette pops white, then collapses while a ring opens.
const commonDeath = (p) => ({
  k: p < 0.1 ? 0.15 * (p / 0.1) : Math.max(0, 1.15 * (1 - (p - 0.1) / 0.4)) - 1,
  white: p < 0.12 ? 1 : 0, ring: p,
});

function row(n, loop, fn, extra) {
  const out = [];
  for (let f = 0; f < n; f++) {
    const p = loop ? f / n : f / (n - 1);
    const a = fn ? fn(p) : {};
    out.push(extra ? addKeys(extra(p), a) : a);
  }
  return out;
}
function addKeys(a, b) { const o = { ...b }; for (const k in a) o[k] = (o[k] || 0) + a[k]; return o; }

export const SHEETS = {};
for (const [type, D] of Object.entries(DEFS)) {
  SHEETS[type] = {
    base: { ...COMMON, ...D.base },
    idle: row(D.idleN, true, D.idle),
    tele: row(FPS, false, D.tele, commonTele),
    atk: row(Math.round(ATK_S * FPS), false, D.atk, commonAtk),
    hit: row(Math.round(HIT_S * FPS), false, null, commonHit),
    death: row(Math.round(DEATH_S * FPS), false, null, commonDeath),
  };
}

// The live pose: base + one frame of each active row, summed into a scratch.
const scratch = {};
function pose(S, rows) {
  for (const k in S.base) scratch[k] = S.base[k];
  for (const fr of rows) if (fr) for (const k in fr) scratch[k] += fr[k];
  return scratch;
}
const at = (rowA, k) => rowA[Math.min(rowA.length - 1, Math.max(0, Math.floor(k * rowA.length)))];

function eyes(E, o, te) {
  for (let i = 0; i < E.length; i += 3) {
    const x = E[i], y = E[i + 1], er = E[i + 2];
    dot(x, y, er, '#000');
    const dx = o.lookX - x, dy = o.lookY - y, l = Math.hypot(dx, dy) || 1;
    const pr = er * (0.42 + te * 0.25);
    dot(x + (dx / l) * (er - pr - 0.4), y + (dy / l) * (er - pr - 0.4), pr, te > 0.5 ? '#ffffff' : pale(o.color));
  }
}

// o: { color, t (age s), tele (0..1 telegraph progress), atk (0..1 since the
//      shot, or -1), hit (0..1 since the last hit, or -1), lookX, lookY,
//      dir, hop, dive, minion }
export function drawEnemyBody(type, x, y, r, o) {
  const S = SHEETS[type], D = DEFS[type];
  if (!S) { dot(x, y, r, o.color); return; }
  const fi = Math.floor((o.t || 0) * FPS) % S.idle.length;
  const tele = o.tele > 0 ? at(S.tele, o.tele) : null;
  const atk = o.atk >= 0 ? at(S.atk, o.atk) : null;
  const hit = o.hit >= 0 ? at(S.hit, o.hit) : null;
  const P = pose(S, [S.idle[fi], tele, atk, hit]);
  const s = (r / 11) * (o.minion ? 0.8 : 1);
  const c = P.white > 0.5 ? '#ffffff' : o.color;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const E = D.draw(x, y, s, P, c, o.dir || 1, o.hop || 0, !!o.dive);
  eyes(E, o, teEnv(o.tele || 0));
  if (P.mz > 0 && P.mz < 1) ringS(x, y + (D.muzzleY + P.dy) * s, (2 + P.mz * 8) * s, '#ffffff', 1.5 * (1 - P.mz) + 0.2);
  ctx.restore();
  ctx.globalAlpha = DIM;
}

// Death row: the type's own silhouette pops and collapses, a ring opens and
// thins. k is 0..1 through DEATH_S.
export function drawEnemyDeath(type, x, y, r, color, k) {
  const S = SHEETS[type], D = DEFS[type];
  if (!S) return;
  const P = pose(S, [S.idle[0], at(S.death, k)]);
  const s = r / 11;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (P.k > 0.02) {
    const c = P.white > 0.5 ? '#ffffff' : color;
    ctx.translate(x, y); ctx.scale(P.k, P.k);
    const E = D.draw(0, 0, s, { ...P, k: 1 }, c, 1, 0, false);
    for (let i = 0; i < E.length; i += 3) dot(E[i], E[i + 1], E[i + 2], '#000');
  }
  ctx.restore();
  ctx.save();
  const e = ease(P.ring);
  ringS(x, y, r * 0.7 + e * r * 1.8, color, 2.5 * (1 - P.ring) + 0.3);
  ctx.restore();
  ctx.globalAlpha = DIM;
}
