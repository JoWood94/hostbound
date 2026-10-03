// Boss bodies from primitives, flat colour, fixed designs. Each body tells its
// attack, and each phase (0, 1, 2) grows or opens a part, so the fight
// visibly escalates:
//   SENTINEL  a capsule core with two pods; pods grow spikes, then spin them
//   HIVE      a cluster of cells; more cells bud with each phase
//   HUNTER    a body with two claws and an aim line; claws open wider
//   PRISM     two counter-rotating triangles over an emitter; a third joins
//   WARDEN    a long drum body with drum rings round a beating heart
//   MAW       a mouth with teeth that opens as it inhales; more teeth
//   CHOIR     five singing heads, mouths opening in canon
//   MOTHER    a brood queen with a crown and an egg sac that fills up
//   SPINE     a centipede head and segments with walking legs
//   ECLIPSE   a void disc eclipsed by black, a corona of rays grows
//
// Sprite sheets in code, like the enemies (bestiary.js): one sheet per boss
// per phase, so a boss has three: pristine, damaged, wrecked. Damage is cut
// out of the body in black (cracks that lengthen, chips bitten from the rim,
// one broken part in the last phase) and shows in the motion (a tremor, then
// a lurch). Frenzy (phase 3) plays the wrecked sheet at double speed.
// Rows, sampled at 60 fps and built once at load (BOSS_SHEETS):
//   idle  loop, 2 s
//   tele  the charge, indexed by telegraph progress 0..1
//   atk   the release when the attack fires (BOSS_ATK_S)
//   hit   white squash on a hit (HIT_S, shared with the enemies)
//   death (one row per boss, from the wrecked body, BOSS_DEATH_S): a white
//         jolt, the cracks run across the whole body while it shakes, then
//         it splits into its own pieces that fly out, spin and shrink inside
//         two opening rings. Over before the loot cards (run.pickDelay).
// The pupils are the only live part: they track the player (HUNTER: its aim).
import { ctx } from '../core/canvas.js';
import { DIM } from './draw.js';
import { capsule, rtri } from './oled.js';
import { HIT_S } from './bestiary.js';

const TAU = Math.PI * 2;
const FPS = 60, IDLE_N = 120;
export const BOSS_ATK_S = 0.4, BOSS_DEATH_S = 1.3;
const ease = (k) => 1 - (1 - k) ** 3;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const sn = (p, n = 1, ph = 0) => Math.sin((p * n + ph) * TAU);
const bump = (p, at, w) => Math.exp(-(((p - at) / w) ** 2));
const teEnv = (p) => ease(clamp01(p / 0.35));

function fill(c) { ctx.globalAlpha = DIM; ctx.fillStyle = c; ctx.fill(); }
function stroke(c, w) { ctx.globalAlpha = DIM; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }
function dot(x, y, r, c) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); fill(c); }
function ringS(x, y, r, c, w) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); stroke(c, w); }
function cap(x1, y1, x2, y2, r, c) { capsule(x1, y1, x2, y2, r); fill(c); }
function tri(x, y, R, rot, c) { rtri(x, y, R, rot); fill(c); }

// ---------------------------------------------------------------------------
// Boss definitions. idle/tele/atk(p, ph) return offsets on top of the common
// pose; draw(x, y, P, c, ph) fills the body and returns its eyes [x, y, r...].
// anchors: the solid masses damage is cut into, [x, y, r] from the centre
// (and the death pieces come from, unless pieceAnchors says otherwise).
// P.cyc is the idle phase 0..1: oscillations use whole cycles of it.
// ---------------------------------------------------------------------------
const DEFS = {
  sentinel: {
    anchors: [[0, 0, 40], [-78, 0, 16], [78, 0, 16]],
    tele: (p) => ({ pod: -8 * teEnv(p) }),
    atk: (p) => ({ pod: 10 * (1 - p) ** 2, spin: ease(p) * 0.5 }),
    draw(x, y, P, c, ph) {
      const E = [];
      for (const sd of [-1, 1]) {
        const px = x + sd * (78 + P.pod);
        cap(x + sd * 30, y, px, y, 5, c);
        if (ph >= 1) for (let i = 0; i < 4; i++) {
          if (ph >= 2 && sd < 0 && i === 1) continue;          // broken spike
          const a = (ph >= 2 ? (P.cyc * 0.5 + P.spin) * TAU * sd : 0) + (i * TAU) / 4 + Math.PI / 4;
          tri(px + Math.cos(a) * 18, y + Math.sin(a) * 18, 7, a - Math.PI / 2, c);
        }
        dot(px, y, 16 * P.k, c);
        E.push(px, y, 6);
      }
      cap(x - 26 * P.k, y, x + 26 * P.k, y, 26 * P.k, c);
      E.push(x, y, 13 * P.k);
      return E;
    },
  },
  hive: {
    anchors: [[-62, 0, 24], [0, 0, 26], [62, 0, 24]],
    tele: (p) => ({ puff: teEnv(p) * 0.08 + Math.max(0, sn(p, 6)) * 0.04 * p }),
    atk: (p) => ({ puff: -0.12 * (1 - p) ** 2 + 0.1 * bump(p, 0.3, 0.15) }),
    draw(x, y, P, c, ph) {
      const cells = [[-62, 0, 24], [0, 0, 26], [62, 0, 24], [-31, -22, 14], [31, -22, 14]];
      if (ph >= 1) cells.push([-31, 22, 13], [31, 22, 13]);
      if (ph >= 2) cells.push([-92, -12, 11], [92, -12, 11], [0, -34, 11]);
      cells.forEach(([cx, cy, r], i) => {
        const rr = r * P.k * (1 + P.puff + sn(P.cyc, 2, i * 0.27) * 0.05);
        if (ph >= 2 && i === 4) ringS(x + cx, y + cy, rr - 1.5, c, 3);   // a burst cell
        else dot(x + cx, y + cy, rr, c);
      });
      const E = [];
      for (const [cx, , r] of cells.slice(0, 3)) E.push(x + cx, y, r * 0.38);
      return E;
    },
  },
  hunter: {
    lookAim: true,
    anchors: [[-16, -2, 22], [16, -2, 22]],
    tele: (p) => ({ open: 0.15 * teEnv(p) }),
    atk: (p) => ({ open: -0.45 * (1 - p) ** 2, dy: -4 * (1 - p) ** 2 }),
    draw(x, y, P, c, ph, o) {
      if (!o.dead) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(o.aimX, o.aimY - 20); stroke(o.color, o.tele > 0 ? 1.6 : 1);
        ringS(o.aimX, o.aimY, 16 + sn(P.cyc, 3) * 2, o.color, o.tele > 0 ? 2 : 1.2);
      }
      const open = 0.25 + ph * 0.18 + P.open;
      for (const sd of [-1, 1]) {
        const ax = x + sd * 56, ay = y - 6;
        cap(x + sd * 30, y, ax, ay, 6, c);
        const a = Math.PI / 2 - sd * open;
        const ex = ax + Math.cos(a) * 30, ey = ay + Math.sin(a) * 30;
        cap(ax, ay, ex, ey, 5, c);
        if (!(ph >= 2 && sd > 0)) tri(ex + Math.cos(a) * 4, ey + Math.sin(a) * 4, 7, a - Math.PI / 2, c);   // right claw tip snapped
      }
      cap(x - 20 * P.k, y - 2, x + 20 * P.k, y - 2, 22 * P.k, c);
      return [x, y - 4, 10];
    },
  },
  prism: {
    anchors: [[0, 30, 9]],
    pieceAnchors: [[0, -2, 30], [0, 30, 9]],   // the spinning triangle breaks too
    tele: (p) => ({ spin: ease(p) * 0.6 }),
    atk: (p) => ({ spin: 0.6 + ease(p) * 0.4, k: 0.08 * (1 - p) ** 2 }),
    draw(x, y, P, c, ph) {
      cap(x - 14, y + 30, x + 14, y + 30, 6, c);
      const a1 = (P.cyc / 3 + P.spin / 3) * TAU, a2 = -(P.cyc * 2 / 3 + P.spin * 2 / 3) * TAU + Math.PI;
      tri(x, y - 2, 34 * P.k, a1, c);
      if (ph >= 2) {                                      // a corner chipped off
        const va = a1 + Math.PI / 2;
        dot(x + Math.cos(va) * 34 * P.k, y - 2 + Math.sin(va) * 34 * P.k, 8, '#000');
      }
      tri(x, y - 2, 20 * P.k, a2, '#000');
      if (ph >= 1) tri(x, y - 2, 11 * P.k, (P.cyc * 2 / 3 + P.spin) * TAU, c);
      if (ph >= 2) for (let i = 0; i < 3; i++) { const a = (P.cyc / 3) * TAU + (i * TAU) / 3; dot(x + Math.cos(a) * 46, y - 2 + Math.sin(a) * 46, 5, c); }
      return [];
    },
  },
  warden: {
    anchors: [[-44, 0, 24], [44, 0, 24]],
    tele: (p) => ({ beat: Math.max(0, sn(p, 6)) ** 4 * teEnv(p) }),
    atk: (p) => ({ beat: 1.4 * (1 - p) ** 2 }),
    draw(x, y, P, c, ph, o) {
      cap(x - 64, y, x + 64, y, 24 * P.k, c);
      const b0 = Math.max(0, sn(P.cyc, 2)) ** 6 + Math.max(0, sn(P.cyc, 2, -0.14)) ** 6 * 0.6;
      const beat = b0 + P.beat;
      const drums = ph >= 1 ? [-60, -30, 30, 60] : [-44, 44];
      drums.forEach((dx, i) => {
        if (ph >= 2 && i === 3) return;                   // a drum ring torn off
        ringS(x + dx, y, (10 + beat * (ph >= 2 ? 5 : 3)) * (i % 2 ? 0.85 : 1), '#000', 3);
      });
      dot(x, y - 4, 9 + beat * 4, '#000');
      dot(x, y - 4, 6 + beat * 3, P.white > 0.5 ? '#ffffff' : '#ff1f4b');
      return [];
    },
  },
  maw: {
    anchors: [[-38, -24, 16], [38, -24, 16], [0, -30, 12]],
    tele: (p) => ({ open: ease(p) * 0.65 }),
    atk: (p) => ({ open: 0.65 * (1 - p) + 0.5 * (1 - p) ** 3, dy: 3 * bump(p, 0.15, 0.12) }),
    draw(x, y, P, c, ph) {
      const open = 0.35 + ph * 0.15 + P.open + sn(P.cyc, 1) * 0.04;
      cap(x - 42, y, x + 42, y, 40 * P.k, c);
      const mh = 6 + 20 * Math.min(1, open);
      cap(x - 44, y + 6, x + 44, y + 6, mh, '#000');
      const n = 4 + ph * 2;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, tx = x - 44 + u * 88;
        if (!(ph >= 2 && (i === 2 || i === n - 2))) tri(tx, y + 6 - mh + 6, 6, 0, c);   // two teeth knocked out
        tri(tx, y + 6 + mh - 6, 6, Math.PI, c);
      }
      return [x - 30, y - 26, 6, x + 30, y - 26, 6];
    },
  },
  choir: {
    anchors: [[0, -12, 26], [-58, -2, 22], [58, -2, 22], [-92, 16, 18], [92, 16, 18]],
    tele: (p) => ({ hush: teEnv(p) }),
    atk: (p) => ({ sing: 1.4 * (1 - p) ** 2, hush: -1 + p }),
    draw(x, y, P, c, ph) {
      const heads = [[0, -12, 26], [-58, -2, 22], [58, -2, 22], [-92, 16, 18], [92, 16, 18]];
      const E = [];
      heads.forEach(([hx, hy, r], i) => {
        const sing = Math.max(0, sn(P.cyc, 2, -i * 0.14 + ph * 0.16)) * (1 - clamp01(P.hush)) + Math.max(0, P.sing);
        dot(x + hx, y + hy, r * P.k, c);
        cap(x + hx - r * 0.3, y + hy + r * 0.35, x + hx + r * 0.3, y + hy + r * 0.35, 1.5 + sing * r * 0.25 * (1 + ph * 0.3), '#000');
        if (ph >= 2 && i === 4) cap(x + hx - r * 0.3, y + hy - r * 0.25, x + hx + r * 0.3, y + hy - r * 0.25, 1.6, '#000');   // a head gone blind
        else E.push(x + hx, y + hy - r * 0.25, r * 0.28);
      });
      return E;
    },
  },
  mother: {
    anchors: [[0, 4, 40]],
    tele: (p) => ({ egg: 3 * teEnv(p) }),
    atk: (p) => ({ egg: -2 * (1 - p) ** 2, drop: 8 * ease(p) * (1 - p) }),
    draw(x, y, P, c, ph) {
      const eggs = 3 + ph * 2;
      for (let i = 0; i < eggs; i++) {
        const u = eggs === 1 ? 0.5 : i / (eggs - 1), a = Math.PI * (0.15 + 0.7 * u);
        dot(x + Math.cos(a) * 52, y + Math.sin(a) * 40 + P.drop, 7 + sn(P.cyc, 2, i * 0.16) * 1 + P.egg, c);
      }
      for (let i = -2; i <= 2; i++) {
        if (ph >= 2 && i === 1) continue;                 // a crown spike broken off
        tri(x + i * 15, y - 40 - (2 - Math.abs(i)) * 4, 8, Math.PI, c);
      }
      dot(x, y, 40 * P.k, c);
      return [x, y - 6, 12];
    },
  },
  spine: {
    anchors: [[0, 0, 18]],
    tele: (p) => ({ coil: teEnv(p) }),
    atk: (p) => ({ coil: -0.6 * (1 - p) ** 2, ripple: ease(p) }),
    draw(x, y, P, c, ph) {
      const segs = 4 + ph * 2;
      for (let i = segs; i >= 1; i--) {
        const side = i % 2 ? 1 : -1, lx = x + side * Math.ceil(i / 2) * 26 * (1 - P.coil * 0.25);
        const sy = y + sn(P.cyc, 2, -i * 0.11 + P.ripple) * 4;
        if (!(ph >= 2 && i >= segs - 1)) for (const sd of [-1, 1]) cap(lx, sy, lx + sn(P.cyc, 3, i * 0.16) * 4, sy + sd * 18, 2.2, c);   // last segments lost their legs
        dot(lx, sy, 12, c);
      }
      dot(x, y, 18 * P.k, c);
      for (const sd of [-1, 1]) tri(x + sd * 8, y + 18 + P.coil * 3, 6, 0, c);
      return [x, y - 3, 7];
    },
  },
  eclipse: {
    anchors: [[-22, 14, 16], [-26, -16, 12]],
    tele: (p) => ({ cover: ease(p), ray: -6 * teEnv(p) }),
    atk: (p) => ({ cover: 1 - ease(p), ray: 14 * (1 - p) ** 2 }),
    draw(x, y, P, c, ph) {
      const rays = 6 + ph * 3;
      for (let i = 0; i < rays; i++) {
        if (ph >= 2 && (i === 2 || i === 3)) continue;   // a gap torn in the corona
        const a = (P.cyc / 3) * TAU + (i * TAU) / rays, r0 = 46;
        const r1 = 58 + P.ray + (ph >= 2 ? sn(P.cyc, 4, i * 0.1) * 6 : 0);
        cap(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, 3, c);
      }
      dot(x, y, 40 * P.k, c);
      const sx = x + 10 * Math.cos(P.cyc * TAU) * (1 - P.cover), sy = y - 6 * (1 - P.cover);
      dot(sx, sy, (30 + P.cover * 8) * P.k, '#000');
      return [sx, sy, 10];
    },
  },
};

// Damage cut into the anchors: cracks (zigzags from the rim inward) and chips
// (bites out of the rim). Placed once from a per-boss seed; phase 2 keeps
// phase 1's marks and lengthens them, so the wear reads as the same wounds
// getting worse.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hash(str) { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function makeDamage(id, anchors) {
  const r = rng(hash(id)), cracks = [], chips = [];
  for (let n = 0; n < 5; n++) {
    const [ax, ay, ar] = anchors[n % anchors.length];
    const a = r() * TAU, pts = [[ax + Math.cos(a) * ar, ay + Math.sin(a) * ar]];
    let x = pts[0][0], y = pts[0][1];
    for (let j = 0; j < 4; j++) {
      const da = a + Math.PI + (j % 2 ? 0.6 : -0.6) * (0.6 + r() * 0.6);
      const len = ar * (0.18 + r() * 0.12);
      x += Math.cos(da) * len; y += Math.sin(da) * len; pts.push([x, y]);
    }
    cracks.push(pts);
    const b = r() * TAU;
    chips.push([ax + Math.cos(b) * ar, ay + Math.sin(b) * ar, ar * (0.2 + r() * 0.1)]);
  }
  // phase -> [cracks shown, segments per crack, chips shown, crack width]
  return { cracks, chips, by: [[0, 0, 0, 0], [2, 2, 1, 1.8], [5, 4, 3, 2.4]] };
}
function drawDamage(DM, x, y, ph, k) {
  const [nc, seg, nch, w] = DM.by[ph];
  for (let i = 0; i < nc; i++) {
    const pts = DM.cracks[i];
    for (let j = 0; j < Math.min(seg, pts.length - 1); j++) {
      cap(x + pts[j][0] * k, y + pts[j][1] * k, x + pts[j + 1][0] * k, y + pts[j + 1][1] * k, w * (1 - j * 0.15) / 2 + 0.3, '#000');
    }
  }
  for (let i = 0; i < nch; i++) { const [cx, cy, cr] = DM.chips[i]; dot(x + cx * k, y + cy * k, cr * k, '#000'); }
}

// Rows. Common keys: k (scale), dy, sh (shake x), white, cyc (idle phase).
const COMMON = { crack: 0, split: 0, ring: 0, k: 1, dy: 0, sh: 0, white: 0, cyc: 0, pod: 0, spin: 0, puff: 0, open: 0, beat: 0, sing: 0, hush: 0, egg: 0, drop: 0, coil: 0, ripple: 0, cover: 0, ray: 0 };
// Wear in the idle: a tremor once damaged, a lurch once wrecked.
function idleRow(ph) {
  return (p) => ({
    cyc: p,
    k: sn(p, 1) * 0.025,
    sh: ph >= 1 ? sn(p, 9) * 0.5 * ph : 0,
    dy: ph >= 2 ? bump(p, 0.55, 0.04) * 3 - bump(p, 0.62, 0.04) * 1.5 : 0,
  });
}
// The charge shakes harder the more worn the boss is.
const teleCommon = (ph) => (p) => ({ k: teEnv(p) * 0.06, sh: sn(p, 14) * p * (0.6 + ph * 0.6) });
const atkCommon = (p) => ({ k: 0.05 * (1 - p) ** 2, dy: -3 * (1 - p) ** 2 });
const hitCommon = (p) => ({ k: 0.04 * (1 - p), white: p < 0.7 ? 1 : 0 });

function row(n, loop, ...fns) {
  const out = [];
  for (let f = 0; f < n; f++) {
    const p = loop ? f / n : f / (n - 1);
    const o = {};
    for (const fn of fns) { const d = fn(p); for (const key in d) o[key] = (o[key] || 0) + d[key]; }
    out.push(o);
  }
  return out;
}

// Death pose: jolt (0-0.12), cracks spread and the body shakes (to 0.4),
// then split: the pieces fly (0.4-1), rings open from the split.
const SPLIT = 0.4;
function deathRow(p) {
  const pre = clamp01(p / SPLIT);
  return {
    k: bump(p, 0.05, 0.05) * 0.1 - pre * 0.03,
    white: p < 0.12 ? 1 : 0,
    sh: p < SPLIT ? sn(p, 18) * (1 + pre * 4) : 0,
    dy: p < SPLIT ? sn(p, 11, 0.2) * pre * 2 : 0,
    crack: p < 0.12 ? 0 : ease(clamp01((p - 0.12) / (SPLIT - 0.12))),
    split: p < SPLIT ? 0 : ease((p - SPLIT) / (1 - SPLIT)),
    ring: p < SPLIT ? 0 : (p - SPLIT) / (1 - SPLIT),
  };
}
// The pieces a boss breaks into: discs and shards spread over its anchors,
// seeded per boss so every death of it is the same.
function makePieces(id, anchors) {
  const r = rng(hash(id) ^ 0x9e3779b9), out = [];
  for (let i = 0; i < 16; i++) {
    const [ax, ay, ar] = anchors[i % anchors.length];
    const a = r() * TAU, d = Math.sqrt(r()) * ar * 0.8;
    const x = ax + Math.cos(a) * d, y = ay + Math.sin(a) * d;
    const out_a = Math.atan2(y + 0.001, x + 0.001 * (i % 2 ? 1 : -1));
    out.push({ x, y, size: ar * (0.32 + r() * 0.22), dir: out_a + (r() - 0.5) * 0.6, dist: 40 + r() * 60, spin: (r() - 0.5) * 6, shard: i % 3 === 0 });
  }
  return out;
}

export const BOSS_SHEETS = {};
for (const [id, D] of Object.entries(DEFS)) {
  D.dmg = makeDamage(id, D.anchors);
  D.pieces = makePieces(id, D.pieceAnchors || D.anchors);
  BOSS_SHEETS[id] = [0, 1, 2].map((ph) => ({
    idle: row(IDLE_N, true, idleRow(ph)),
    tele: row(FPS, false, D.tele, teleCommon(ph)),
    atk: row(Math.round(BOSS_ATK_S * FPS), false, D.atk, atkCommon),
    hit: row(Math.round(HIT_S * FPS), false, hitCommon),
  }));
  BOSS_SHEETS[id].death = row(Math.round(BOSS_DEATH_S * FPS), false, deathRow);
}
export const BOSS_IDS = Object.keys(DEFS);

const scratch = {};
const at = (r, k) => r[Math.min(r.length - 1, Math.max(0, Math.floor(k * r.length)))];

function eyes(E, lx, ly, hot, color) {
  for (let i = 0; i < E.length; i += 3) {
    const x = E[i], y = E[i + 1], er = E[i + 2];
    dot(x, y, er, '#000');
    const dx = lx - x, dy = ly - y, l = Math.hypot(dx, dy) || 1;
    const pr = er * (hot ? 0.6 : 0.42);
    dot(x + (dx / l) * (er - pr - 1), y + (dy / l) * (er - pr - 1), pr, hot ? '#ffffff' : color);
  }
}

// o: { phase (0..3), t (age s), tele (0..1 or 0), atk (0..1 or -1),
//      hit (0..1 or -1), white (phase-change flash), color,
//      lookX, lookY, aimX, aimY }
export function drawBossSheet(id, x, y, o) {
  const D = DEFS[id];
  if (!D) { dot(x, y, 40, o.color); return; }
  const ph = Math.min(2, o.phase || 0), frenzy = o.phase >= 3;
  const S = BOSS_SHEETS[id][ph];
  const fi = Math.floor((o.t || 0) * FPS * (frenzy ? 2 : 1)) % S.idle.length;
  for (const key in COMMON) scratch[key] = COMMON[key];
  for (const fr of [S.idle[fi], o.tele > 0 ? at(S.tele, o.tele) : null, o.atk >= 0 ? at(S.atk, o.atk) : null, o.hit >= 0 ? at(S.hit, o.hit) : null]) {
    if (fr) for (const key in fr) scratch[key] += fr[key];
  }
  if (o.white) scratch.white = 1;
  const P = scratch;
  const c = P.white > 0.5 ? '#ffffff' : o.color;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const bx = x + P.sh, by = y + P.dy;
  const E = D.draw(bx, by, P, c, ph, o);
  drawDamage(D.dmg, bx, by, ph, P.k);
  const hot = o.tele > 0;
  eyes(E, D.lookAim ? o.aimX : o.lookX, D.lookAim ? o.aimY : o.lookY, hot, id === 'eclipse' ? o.color : '#ffffff');
  ctx.restore();
  ctx.globalAlpha = DIM;
}

// Game entry: maps the boss state onto the sheet rows.
export function drawBossBody(b, x, y, t, o) {
  drawBossSheet(b.def.id, x, y, {
    ...o, phase: b.phase || 0, t, color: b.color,
    tele: b.state === 'telegraph' ? Math.max(0.001, o.teleProg || 0) : 0,
    atk: b.state === 'fire' && b.stateT < BOSS_ATK_S ? b.stateT / BOSS_ATK_S : -1,
    hit: b.hitFlash > 0 ? 1 - b.hitFlash / HIT_S : -1,
    white: b.phaseFlash > 0,
  });
}

// Death: k is 0..1 through BOSS_DEATH_S. Before the split the wrecked body
// (frozen on its first idle frame) shakes while the cracks spread; after it,
// only the pieces and the rings.
export function drawBossDeath(id, x, y, color, k) {
  const D = DEFS[id];
  if (!D) return;
  const fr = at(BOSS_SHEETS[id].death, k);
  for (const key in COMMON) scratch[key] = COMMON[key];
  for (const fr2 of [BOSS_SHEETS[id][2].idle[0], fr]) for (const key in fr2) scratch[key] += fr2[key];
  const P = scratch;
  const c = P.white > 0.5 ? '#ffffff' : color;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (P.split <= 0) {
    const bx = x + P.sh, by = y + P.dy;
    const E = D.draw(bx, by, P, c, 2, { color, tele: 0, dead: true });
    drawDamage(D.dmg, bx, by, 2, P.k);
    if (P.crack > 0) {
      // The wounds run on: every crack grows past its end, chips widen.
      const DM = D.dmg, w = 2.4 + P.crack * 1.6;
      for (const pts of DM.cracks) {
        const n = pts.length - 1, a = pts[n], b = pts[n - 1];
        const dx = a[0] - b[0], dy = a[1] - b[1];
        cap(bx + a[0], by + a[1], bx + a[0] + dx * 2.5 * P.crack, by + a[1] + dy * 2.5 * P.crack, w / 2, '#000');
      }
      for (const [cx, cy, cr] of DM.chips) dot(bx + cx, by + cy, cr * (1 + P.crack * 0.6), '#000');
    }
    // eyes go dark, pupils roll up
    for (let i = 0; i < E.length; i += 3) { dot(E[i], E[i + 1], E[i + 2], '#000'); dot(E[i], E[i + 1] - E[i + 2] * 0.45, E[i + 2] * 0.3, '#ffffff'); }
  } else {
    // Pieces fly out fast and slow down (split eases), but shrink on the
    // linear clock, so they stay readable most of the way.
    const sp = P.split, lin = P.ring;
    for (const pc of D.pieces) {
      const d = pc.dist * sp, s = pc.size * (1 - lin ** 1.6);
      if (s < 0.4) continue;
      const px = x + pc.x + Math.cos(pc.dir) * d, py = y + pc.y + Math.sin(pc.dir) * d;
      if (pc.shard) tri(px, py, s * 1.3, pc.spin * sp, sp < 0.08 ? '#ffffff' : color);
      else dot(px, py, s, sp < 0.08 ? '#ffffff' : color);
    }
    const e = ease(P.ring);
    ringS(x, y, 30 + e * 140, color, 5 * (1 - P.ring) + 0.3);
    if (P.ring > 0.15) { const e2 = ease((P.ring - 0.15) / 0.85); ringS(x, y, 20 + e2 * 90, color, 3 * (1 - P.ring) + 0.3); }
  }
  ctx.restore();
  ctx.globalAlpha = DIM;
}
