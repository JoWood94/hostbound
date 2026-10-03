// OLED style: everything drawn live as flat neon geometry on true black.
// Language: iOS-like primitives (squircles, capsules, circles, rounded
// triangles), solid fills, no blur. Motion comes from springs and easing
// evaluated every frame, never from baked frames, so it is as smooth as the
// display refresh. True black (#000) is deliberate: on OLED those pixels are off.
import { ctx } from '../core/canvas.js';
import { DIM } from './draw.js';
import { FIRST_SPECIMEN } from './specimen.js';

export const BLACK = '#000';

// The pink of the original symbiote sprite.
export const SYM_BODY = '#d83cd8';
const SYM_IRIS = '#c6ff1a';
const CYAN = '#19f0ff';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
function fill(color, a = 1) { ctx.globalAlpha = a * DIM; ctx.fillStyle = color; ctx.fill(); }
function stroke(color, w, a = 1) { ctx.globalAlpha = a * DIM; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke(); }

// Capsule from (x1,y1) to (x2,y2) with radius r.
export function capsule(x1, y1, x2, y2, r) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.arc(x2, y2, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.arc(x1, y1, r, a + Math.PI / 2, a + Math.PI * 1.5);
  ctx.closePath();
}

// Rounded rectangle centred on (x, y).
function rrect(x, y, hw, hh, r) {
  r = Math.min(r, hw, hh);
  ctx.beginPath();
  ctx.moveTo(x - hw + r, y - hh);
  ctx.arcTo(x + hw, y - hh, x + hw, y + hh, r);
  ctx.arcTo(x + hw, y + hh, x - hw, y + hh, r);
  ctx.arcTo(x - hw, y + hh, x - hw, y - hh, r);
  ctx.arcTo(x - hw, y - hh, x + hw, y - hh, r);
  ctx.closePath();
}

// Corner rounding shared by every triangle in the game (player crown, enemies,
// obstacles, hints): corner radius = ROUND x circumradius. One ratio keeps
// all the shapes equally soft.
export const ROUND = 0.4;
// Rounded triangle pointing along `rot` (0 = down), circumradius R.
const TV = new Float32Array(6);
// `round` overrides ROUND for small UI glyphs (a play icon), where 0.4 would
// melt the triangle into a dot.
export function rtri(x, y, R, rot = 0, round = ROUND) {
  const r = R * round;
  for (let i = 0; i < 3; i++) {
    const a = rot + Math.PI / 2 + (i * Math.PI * 2) / 3;
    TV[i * 2] = x + Math.cos(a) * R; TV[i * 2 + 1] = y + Math.sin(a) * R;
  }
  ctx.beginPath();
  ctx.moveTo((TV[4] + TV[0]) / 2, (TV[5] + TV[1]) / 2);
  ctx.arcTo(TV[0], TV[1], TV[2], TV[3], r);
  ctx.arcTo(TV[2], TV[3], TV[4], TV[5], r);
  ctx.arcTo(TV[4], TV[5], TV[0], TV[1], r);
  ctx.closePath();
}

const ease = (k) => 1 - (1 - k) ** 3;

// Frame-rate independent spring step on obj[key] toward target.
function spring(o, key, target, dt, k = 260, damp = 18) {
  const v = key + 'V';
  o[v] = (o[v] || 0) + ((target - (o[key] || 0)) * k - (o[v] || 0) * damp) * dt;
  o[key] = (o[key] || 0) + o[v] * dt;
  return o[key];
}

// ---------------------------------------------------------------------------
// Player symbiote: a mutated alien in one opaque pink, built from the Drone's
// vocabulary (rounded triangles, capsules, circles). Its shape is a genome
// grown per run (render/specimen.js). The arms trail behind on springs, so a
// lane change swings them out and they settle with an eased overshoot.
// ---------------------------------------------------------------------------
// pose: { R, bank, squash, jh, phase, hit, t, state, genome, spin, phaseColor, air }
const MENU_STATE = {};

export function drawSymbiote(x, y, pose) {
  const { R, bank = 0, jh = 0, phase = false, hit = false, t } = pose;
  const st = pose.state || MENU_STATE;
  const dt = Math.min(0.05, Math.max(0.001, t - (st.lastT ?? t - 1 / 60)));
  st.lastT = t;

  // Springs, evaluated every frame: the body tilts with the bank, the arms
  // swing against the motion; in the air the body rolls into a SPHERE, in
  // phase it folds into a tall PILL. Both are springs, so any genome morphs
  // smoothly into the same shape and back.
  const vx = st.px === undefined ? 0 : (x - st.px) / dt;
  st.px = x;
  const tilt = spring(st, 'tilt', bank * 0.9, dt, 220, 17);
  const swing = spring(st, 'swing', Math.max(-1, Math.min(1, -vx / 900)), dt, 120, 9);
  const ball = Math.max(0, Math.min(1, spring(st, 'ball', pose.air ? 1 : 0, dt, 520, 38)));
  const pill = Math.max(0, Math.min(1, spring(st, 'pill', phase ? 1 : 0, dt, 520, 38)));
  const fold = Math.max(ball, pill);          // how far the genome folds away
  const color = hit ? '#ffffff' : phase ? (pose.phaseColor || CYAN) : SYM_BODY;
  const sc = R * (1 + jh * 0.3);
  const P = sc * (1 - 0.85 * fold);          // positions collapse to the centre
  const Q = sc * (1 - 0.5 * fold);           // radii shrink less: parts sink into the shape

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt + (pose.spin || 0));
  ctx.fillStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.globalAlpha = DIM;

  // The same shape for every alien: a sphere in the air, a tall pill in phase.
  // It grows as the genome folds into it.
  if (ball > 0.01) { ctx.beginPath(); ctx.arc(0, 0, sc * 0.78 * ball, 0, Math.PI * 2); ctx.fill(); }
  if (pill > 0.01) { capsule(0, -sc * 1.0 * pill, 0, sc * 1.0 * pill, sc * 0.5 * pill); ctx.fill(); }

  // The body comes from the run's genome (render/specimen.js), in body units.
  const g = pose.genome || FIRST_SPECIMEN;
  for (const [cx, cy, cR, , rot] of g.crown) { rtri(cx * P, cy * P, cR * Q, rot); ctx.fill(); }
  for (let i = 0; i < g.girth.length; i++) {
    capsule(g.spine[i][0] * P, g.spine[i][1] * P, g.spine[i + 1][0] * P, g.spine[i + 1][1] * P, g.girth[i] * Q);
    ctx.fill();
  }
  for (const [lx, ly, lr] of g.lumps) { ctx.beginPath(); ctx.arc(lx * P, ly * P, lr * Q, 0, Math.PI * 2); ctx.fill(); }

  // Arms: jointed capsules; each segment follows the previous with extra lag,
  // so the motion eases from root to tip. They retract into the sphere.
  if (fold < 0.98) {
    for (let k = 0; k < g.arms.length; k++) {
      const [rx, ry, fan0, segs, rr] = g.arms[k];
      let x0 = rx * P, y0 = ry * P;
      let a = fan0 * (1 - fold * 0.6);
      for (let j = 0; j < segs.length; j++) {
        a += swing * (0.55 - j * 0.08) + Math.sin(t * 3.2 + k * 1.7 - j * 1.1) * (0.12 + j * 0.06);
        const L = sc * segs[j] * (1 - fold);
        const x1 = x0 + Math.sin(a) * L, y1 = y0 + Math.cos(a) * L;
        capsule(x0, y0, x1, y1, sc * rr * (1 - j * 0.16) * (1 - fold * 0.5));
        ctx.fill();
        x0 = x1; y0 = y1;
      }
    }
  }

  // Eyes: green iris, black horizontal slit that leans with the tilt. Hidden
  // in phase (a pure silhouette), carried on the sphere in the air.
  if (!phase) {
    const lean = Math.max(-1, Math.min(1, tilt * 3));
    for (const [gx, gy, gr] of g.eyes) {
      const ex = gx * P, ey = gy * P, ir = gr * sc * (1 - 0.35 * ball);
      ctx.beginPath(); ctx.arc(ex, ey, ir, 0, Math.PI * 2);
      ctx.fillStyle = hit ? '#ffffff' : SYM_IRIS; ctx.fill();
      const px = ex + lean * ir * 0.15, pw = ir * 0.7, ph = ir * 0.22;
      capsule(px - pw + ph, ey, px + pw - ph, ey, ph);
      ctx.fillStyle = '#000'; ctx.fill();
    }
  }

  ctx.restore();
  ctx.globalAlpha = DIM;
}

// Death: the silhouette bursts into solid droplets that fly out and shrink.
export function drawSymbioteDeath(x, y, R, deadT) {
  if (deadT > 0.75) return false;
  const k = deadT / 0.75, e = ease(k);
  ctx.save();
  ctx.globalAlpha = DIM;
  ctx.fillStyle = k < 0.08 ? '#ffffff' : SYM_BODY;
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996 + 0.4;
    const d = R * (0.3 + e * (1.8 + (i % 3) * 0.6));
    const r = R * (0.36 - (i % 4) * 0.05) * (1 - k);
    if (r < 0.4) continue;
    ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  return true;
}

// ---------------------------------------------------------------------------
// Obstacles: one primitive family each, and the shape carries the meaning:
//   magenta = dodge: SOLID capsule (it blocks)
//   orange = jump  : DOTTED row of solid circles (low, step over it)
//   cyan = phase   : HOLLOW capsule (you pass through it)
// Each draw spans x0..x1: neighbours of the same type on the same row are
// merged by the caller into one longer shape. A passed phase obstacle turns
// dark cyan, never transparent.
// ---------------------------------------------------------------------------
const ORANGE = '#ff6a00', MAG = '#ff2bd6', CYAN_DIM = '#0b4a50';

export function drawWire(x0, x1, y) {
  const r = 3.4, gap = 10;
  const n = Math.max(2, Math.round((x1 - x0 - r * 2) / gap));
  const step = (x1 - x0 - r * 2) / n;
  ctx.fillStyle = ORANGE;
  ctx.globalAlpha = DIM;
  for (let i = 0; i <= n; i++) { ctx.beginPath(); ctx.arc(x0 + r + i * step, y, r, 0, Math.PI * 2); ctx.fill(); }
}

export function drawBarrier(x0, x1, y) {
  capsule(x0 + 9, y, x1 - 9, y, 9);
  fill(MAG);
}

export function drawRift(x0, x1, y, a = 1) {
  capsule(x0 + 8, y, x1 - 8, y, 8);
  stroke(a < 1 ? CYAN_DIM : CYAN, 2);
}

// ---------------------------------------------------------------------------
// Liquid morph (the menu -> run transition), per frame from real time.
// The melt and the fall start together: the genome turns to slime while it
// is already sliding down, trailing sticky strands; it splats on the run
// start, rings out, and the parts grow back out at run size.
// ---------------------------------------------------------------------------
function genomeParts(g, t) {
  const parts = [];
  for (const [cx, cy, cR, , rot] of g.crown) parts.push({ k: 'tri', x: cx, y: cy, R: cR, rot, e: cR * 0.62 });
  for (let i = 0; i < g.girth.length; i++) {
    const [ax, ay] = g.spine[i], [bx, by] = g.spine[i + 1];
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    parts.push({ k: 'cap', x: mx, y: my, dx: (bx - ax) / 2, dy: (by - ay) / 2, r: g.girth[i], e: g.girth[i] + Math.hypot(bx - ax, by - ay) * 0.22 });
  }
  for (const [lx, ly, lr] of g.lumps) parts.push({ k: 'dot', x: lx, y: ly, r: lr, e: lr });
  g.arms.forEach(([rx, ry, fan0, segs, rr], k) => {
    let x0 = rx, y0 = ry, a = fan0;
    segs.forEach((L, j) => {
      a += Math.sin(t * 3.2 + k * 1.7 - j * 1.1) * (0.12 + j * 0.06);
      const x1 = x0 + Math.sin(a) * L, y1 = y0 + Math.cos(a) * L, r = rr * (1 - j * 0.16);
      parts.push({ k: 'cap', x: (x0 + x1) / 2, y: (y0 + y1) / 2, dx: (x1 - x0) / 2, dy: (y1 - y0) / 2, r, e: r + L * 0.2 });
      x0 = x1; y0 = y1;
    });
  });
  const eyes = g.eyes.map(([x, y, r]) => ({ k: 'eye', x, y, r, e: r }));
  return { parts, eyes };
}

function drawPart(p, cx, cy, s, f) {
  if (f <= 0.01) return;
  if (p.k === 'tri') rtri(cx, cy, p.R * s * f, p.rot);
  else if (p.k === 'cap') capsule(cx - p.dx * s * f, cy - p.dy * s * f, cx + p.dx * s * f, cy + p.dy * s * f, p.r * s * f);
  else { ctx.beginPath(); ctx.arc(cx, cy, p.r * s * f, 0, Math.PI * 2); }
  ctx.fill();
}

const easeIO = (q) => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);
// Slime: an irregular body whose outline is a slow, lumpy wobble (a few
// travelling harmonics, about 160 vertices), with sticky strands stretched
// behind it. Every piece overlaps the next and shares one colour, so it reads
// as one mass that never comes apart.
const clamp01 = (q) => Math.max(0, Math.min(1, q));
const SLIME_N = 160;
function slime(cx, cy, r, sx, sy, amp, ph) {
  ctx.beginPath();
  for (let i = 0; i < SLIME_N; i++) {
    const a = (i / SLIME_N) * Math.PI * 2;
    const k = 1 + amp * (0.55 * Math.sin(2 * a + ph * 1.3 + 0.7) + 0.35 * Math.sin(3 * a - ph * 1.9 + 2.1)
      + 0.22 * Math.sin(5 * a + ph * 2.6) + 0.12 * Math.sin(7 * a - ph * 3.4));
    // the underside sags: liquid gathers low
    const sag = 1 + 0.12 * Math.max(0, Math.sin(a));
    const x = cx + Math.cos(a) * r * k * sx, y = cy + Math.sin(a) * r * k * sy * sag;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}
// a tapered sticky strand along a bent curve, with round ends
function strand(x0, y0, r0, x1, y1, r1, bend) {
  const n = Math.max(12, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
  const mx = (x0 + x1) / 2 + bend, my = (y0 + y1) / 2;
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, w = 1 - s;
    const x = w * w * x0 + 2 * w * s * mx + s * s * x1, y = w * w * y0 + 2 * w * s * my + s * s * y1;
    const tx = 2 * w * (mx - x0) + 2 * s * (x1 - mx), ty = 2 * w * (my - y0) + 2 * s * (y1 - my);
    const tl = Math.hypot(tx, ty) || 1;
    // thins faster near the tip, like a string of slime
    const r = r1 + (r0 - r1) * (1 - s) ** 1.6;
    L.push(x - ty / tl * r, y + tx / tl * r); R.push(x + ty / tl * r, y - tx / tl * r);
  }
  ctx.beginPath();
  ctx.moveTo(L[0], L[1]);
  for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
  for (let i = R.length - 2; i >= 0; i -= 2) ctx.lineTo(R[i], R[i + 1]);
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(x1, y1, r1, 0, Math.PI * 2); ctx.fill();
}

// Parts stay tied to the mass by a capsule while they melt in or grow out;
// melting parts also slump downward, like wax.
function tiedParts(list, cx, cy, R, k, slump) {
  for (const p of list) {
    const e = easeIO(clamp01(k * 1.3 - (1 - p.y) * 0.15));
    if (e >= 0.995) continue;
    const x = cx + p.x * R * (1 - e), y = cy + p.y * R * (1 - e) + slump * R * e * (1 - e) * (1.2 - p.y * 0.3);
    const r = p.e * R * (0.55 + 0.45 * (1 - e));
    capsule(cx, cy, x, y, r * 0.75); ctx.fill();
    drawPart(p, x, y, R, 1 - e);
  }
}

// timeline (u = 0..1): the melt and the fall start together
const MELT = 0.42, LAND = 0.6, OUT0 = 0.7;
export function drawLiquidMorph(genome, u, ax, ay, aR, bx, by, bR, t) {
  const g = genome || FIRST_SPECIMEN;
  const { parts, eyes } = genomeParts(g, t);
  const melt = easeIO(clamp01(u / MELT));
  const out = easeIO(clamp01((u - OUT0) / (1 - OUT0)));
  const q = clamp01(u / LAND);                               // the fall
  const fall = q * q * (1.6 - 0.6 * q);                      // eases off the menu, hits hard
  const vel = 3.2 * q - 1.8 * q * q;                         // d(fall)/dq, the speed
  const R0 = aR * 0.72, R1 = bR * 1.05;
  const R = (R0 + (R1 - R0) * easeIO(q)) * (0.6 + 0.4 * melt);
  const ground = by + R1 * 0.95;
  const cx = ax + (bx - ax) * fall + Math.sin(q * Math.PI) * R * 0.35;
  const cy = ay + (ground - R1 - ay) * fall;
  const ph = u * 14;

  // after impact: a splat that rings out (damped), the strands snap back in
  const land = Math.max(0, u - LAND) * 1.3;
  const ring = u > LAND ? Math.exp(-land * 7) : 0;
  // flattens hard, rebounds only a little (a tall rebound would read as a ball)
  const osc = ring * Math.cos(land * 24);
  const splat = osc > 0 ? osc * 1.25 : osc * 0.35;
  const stretch = u < LAND ? 0.25 * vel : 0;             // long while falling fast
  const sx = (1 + splat) / Math.sqrt(1 + stretch), sy = (1 + stretch) / (1 + splat);
  const amp = 0.09 + 0.1 * Math.sin(Math.min(1, u / LAND) * Math.PI) + 0.3 * ring;
  const k = 1 - out;                                          // the mass hands over to the parts

  ctx.save();
  ctx.globalAlpha = DIM;
  ctx.fillStyle = SYM_BODY;
  const by0 = u > LAND ? ground - R1 * sy * 1.12 : cy;      // sits on the floor after impact
  if (k > 0) {
    // sticky strands trailing behind the fall, snapping back after impact
    const tail = u < LAND ? R * (0.4 + 2.4 * q * q) * melt : R1 * 2.8 * ring ** 4;
    if (tail > 1) {
      const wv = Math.sin(ph * 1.7) * R * 0.25;
      strand(cx, by0, R * 0.55 * k, cx - R * 0.2 + wv, by0 - R * sy - tail, R * 0.1, -R * 0.5);
      strand(cx + R * 0.2, by0, R * 0.4 * k, cx + R * 0.45 - wv * 0.6, by0 - R * sy - tail * 0.62, R * 0.09, R * 0.4);
    }
    slime(cx, by0, R * (0.45 + 0.55 * k), sx, sy, amp, ph);
    // splat: two flat tongues shoot out along the floor and are sucked back
    if (u > LAND) {
      const reach = R1 * 3.2 * Math.min(1, land * 14) * ring ** 3;
      const th = Math.min(1, reach / R1);                     // thins as it is sucked back
      if (th > 0.05) {
        const fy = ground - R1 * 0.28;
        strand(cx - R1 * 0.4, fy, R1 * 0.5 * th, cx - R1 * th - reach, fy + R1 * 0.12, R1 * 0.24 * th, -R1 * 0.05);
        strand(cx + R1 * 0.4, fy, R1 * 0.5 * th, cx + R1 * th + reach * 0.85, fy + R1 * 0.1, R1 * 0.2 * th, R1 * 0.05);
      }
    }
    // a heavy drip hanging under the mass while it sags off the menu
    if (u < LAND) {
      const d = Math.sin(clamp01(u / 0.5) * Math.PI) * R * 0.7;
      if (d > 1) strand(cx - R * 0.25, by0 + R * sy * 0.6, R * 0.35, cx - R * 0.3, by0 + R * sy * 0.75 + d, R * 0.22, R * 0.1);
    }
  }
  if (u < MELT) tiedParts(parts, cx, cy, aR + (R1 - aR) * fall, melt, 0.6);
  if (out > 0) tiedParts(parts, bx, by, bR, 1 - out, 0);

  // eyes: green beads that sink into the mass and ride it, then surface and
  // slit back on the new body
  const eyeK = out > 0 ? 1 - out : melt;
  const Rp = aR + (R1 - aR) * fall;
  for (const p of eyes) {
    let px, py, ir;
    if (out > 0) { px = bx + p.x * bR * out + p.x * R1 * 0.35 * (1 - out); py = by + p.y * bR * out; ir = p.r * bR * (0.55 + 0.45 * out); }
    else {
      px = cx + p.x * (Rp * (1 - melt) + R * 0.38 * sx * melt);
      py = by0 + p.y * (Rp * (1 - melt) + R * 0.3 * sy * melt) - R * 0.1 * melt;
      ir = p.r * Rp * (1 - 0.45 * melt);
    }
    ctx.fillStyle = SYM_IRIS; ctx.beginPath(); ctx.arc(px, py, ir, 0, Math.PI * 2); ctx.fill();
    const f = 1 - eyeK;
    if (f > 0.05) { const pw = ir * 0.7 * f, ph2 = ir * 0.22 * f; capsule(px - pw + ph2, py, px + pw - ph2, py, ph2); ctx.fillStyle = '#000'; ctx.fill(); }
  }
  ctx.restore();
  ctx.globalAlpha = DIM;
}
