// Specimen engine: the protagonist's body is generated from the run seed.
// Every run grows a new alien from the same rules (rounded triangles,
// capsules, circles; one pink, green slit eyes); the daily seed gives everyone
// the same one. The genome is plain data in body units (multiplied by the draw
// size); render/oled.js draws it and animates the arms.
//
// Genome:
//   spine: [[x, y], ...]           capsule chain, top to bottom
//   girth: [r, ...]                one radius per spine segment
//   crown: [[x, y, R, r, rot], ...] rounded triangles on top (rot pi = up);
//                                  r is ignored: corners use oled.ROUND
//   lumps: [[x, y, r], ...]        circles growing off the body
//   eyes:  [[x, y, r], ...]        green iris, black horizontal slit
//   arms:  [[x, y, fan, [len...], r], ...] jointed capsules trailing down
import { makeRng } from '../core/rng.js';

// The hand-made specimen everyone met first; also the fallback.
export const FIRST_SPECIMEN = {
  spine: [[-0.04, -0.72], [0.14, -0.36], [-0.1, -0.02], [0.04, 0.3]],
  girth: [0.35, 0.456, 0.361],
  crown: [[-0.22, -0.7, 0.6, 0.26, Math.PI - 0.45], [0.26, -0.62, 0.42, 0.18, Math.PI + 0.6], [-0.66, -0.32, 0.24, 0.1, Math.PI - 1.4]],
  lumps: [[-0.26, -0.26, 0.361], [0.28, -0.06, 0.209], [0.185, 0.24, 0.129], [0.283, -0.5, 0.152]],
  eyes: [[0, -0.52, 0.228], [-0.297, -0.26, 0.182], [-0.043, 0.06, 0.106]],
  arms: [[-0.34, 0.1, -1.0, [0.26, 0.2], 0.1], [-0.17, 0.3, -0.35, [0.38, 0.32, 0.26], 0.1], [0.02, 0.35, 0.05, [0.22], 0.13],
    [0.23, 0.3, 0.3, [0.32, 0.26], 0.11], [0.42, 0.28, 0.95, [0.2, 0.16], 0.09], [0.36, 0.28, 0.6, [0.14], 0.11]],
};

// Point on the spine at parameter u in 0..1, with the local girth.
function spineAt(g, u) {
  const n = g.girth.length;
  const f = Math.min(n - 1e-6, Math.max(0, u * n));
  const i = Math.floor(f), k = f - i;
  const [x0, y0] = g.spine[i], [x1, y1] = g.spine[i + 1];
  return [x0 + (x1 - x0) * k, y0 + (y1 - y0) * k, g.girth[i]];
}

// Rough silhouette bounds: every part as a circle.
function bounds(g) {
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, mx = 0, m = 0;
  const add = (x, y, r) => {
    x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
    mx += x * r * r; m += r * r;
  };
  g.spine.forEach(([x, y], i) => add(x, y, g.girth[Math.min(i, g.girth.length - 1)]));
  g.crown.forEach(([x, y, R]) => add(x, y, R * 0.8));
  g.lumps.forEach(([x, y, r]) => add(x, y, r));
  for (const [x, y, fan, segs, r] of g.arms) {
    let a = fan, px = x, py = y;
    for (const L of segs) { px += Math.sin(a) * L; py += Math.cos(a) * L; add(px, py, r); }
  }
  return { w: x1 - x0, h: y1 - y0, cx: mx / m, top: y0, bot: y1 };
}

function grow(rng) {
  const r = (a, b) => rng.range(a, b);
  const g = { spine: [], girth: [], crown: [], lumps: [], eyes: [], arms: [] };

  // Spine: 2-4 capsules zig-zagging down, each its own girth. Stubby: the
  // whole body stays about one unit tall.
  const n = rng.int(2, 4);
  const top = -r(0.66, 0.78), bot = r(0.24, 0.34);
  const bw = r(0.3, 0.37);
  const amp = r(0.08, 0.2);
  let side = rng.chance(0.5) ? 1 : -1;
  for (let i = 0; i <= n; i++) {
    const y = top + ((bot - top) * i) / n;
    const x = i === 0 ? r(-0.06, 0.06) : side * amp * r(0.6, 1.1);
    g.spine.push([x, y]);
    side = -side;
  }
  for (let i = 0; i < n; i++) g.girth.push(bw * r(0.85, 1.18));

  // Crown: one big skewed arrowhead, maybe a smaller one splayed the other
  // way, maybe a stub horn lower on a flank.
  const [cx, cy] = g.spine[0];
  const lean = rng.chance(0.5) ? 1 : -1;
  const big = r(0.52, 0.66);
  g.crown.push([cx - lean * r(0.12, 0.26), cy + r(-0.04, 0.02), big, big * r(0.36, 0.44), Math.PI - lean * r(0.3, 0.6)]);
  if (rng.chance(0.75)) {
    const R = big * r(0.55, 0.78);
    g.crown.push([cx + lean * r(0.22, 0.32), cy + r(0.04, 0.12), R, R * r(0.36, 0.44), Math.PI + lean * r(0.5, 0.85)]);
  }
  if (rng.chance(0.55)) {
    const R = r(0.17, 0.26), [hx, hy, hg] = spineAt(g, r(0.15, 0.4)), s = rng.chance(0.5) ? 1 : -1;
    g.crown.push([hx + s * (hg + R * 0.45), hy, R, R * 0.42, Math.PI - s * r(1.1, 1.6)]);
  }

  // Lumps: 1-4 circles stuck on the flanks, at most one big tumour.
  const nl = rng.int(1, 4);
  let tumour = false;
  for (let i = 0; i < nl; i++) {
    const [x, y, gr] = spineAt(g, r(0.2, 0.85));
    const s = rng.chance(0.5) ? 1 : -1;
    const isBig = !tumour && rng.chance(0.6);
    if (isBig) tumour = true;
    const lr = gr * (isBig ? r(0.75, 0.98) : r(0.3, 0.58));
    g.lumps.push([x + s * gr * r(0.75, 1.05), y, lr]);
  }

  // Eyes: the main one near the top; the rest on lumps or down the spine.
  // None may overlap another.
  const [ex, ey, eg] = spineAt(g, r(0.12, 0.28));
  g.eyes.push([ex + r(-0.06, 0.06), ey, eg * r(0.55, 0.7)]);
  const ne = rng.int(0, 3);
  for (let i = 0, tries = 0; i < ne && tries < 20; tries++) {
    let cand;
    const lump = g.lumps[rng.int(0, g.lumps.length - 1)];
    if (rng.chance(0.6) && lump[2] > 0.12) cand = [lump[0] + r(-0.03, 0.03), lump[1] + r(-0.03, 0.03), lump[2] * r(0.42, 0.62)];
    else { const [x, y, gr] = spineAt(g, r(0.35, 0.9)); cand = [x + r(-0.08, 0.08), y, gr * r(0.25, 0.45)]; }
    if (g.eyes.every(([x, y, er]) => Math.hypot(x - cand[0], y - cand[1]) > er + cand[2] + 0.03)) { g.eyes.push(cand); i++; }
  }

  // Arms: 3-7 short fat jointed capsules, mostly from the bottom, some from
  // the flanks of the last segment; the fan follows where the root sits.
  const na = rng.int(4, 7);
  const [lx, ly] = g.spine[n], lg = g.girth[n - 1];
  for (let i = 0; i < na; i++) {
    let x, y;
    if (rng.chance(0.3)) {
      const s = rng.chance(0.5) ? 1 : -1, [fx, fy, fg] = spineAt(g, r(0.65, 0.92));
      x = fx + s * fg * 0.9; y = fy;
    } else { x = lx + r(-0.9, 0.9) * lg; y = ly + r(-0.02, 0.06); }
    const fan = Math.max(-1.1, Math.min(1.1, (x - lx) * r(2.2, 3.2) + r(-0.25, 0.25)));
    const ns = rng.chance(0.15) ? 1 : rng.int(2, 4);
    const segs = [];
    let L = r(0.24, 0.4);
    for (let j = 0; j < ns; j++) { segs.push(L); L *= r(0.7, 0.88); }
    g.arms.push([x, y, fan, segs, r(0.085, 0.13)]);
  }
  return g;
}

// Grows candidates until one passes the silhouette checks: compact, about as
// tall as the first specimen, balanced on its axis.
export function makeSpecimen(seed) {
  const rng = makeRng((seed ^ 0x9e3779b9) >>> 0);   // own stream: never touches the run's rng
  let best = null, bestScore = 1e9;
  for (let k = 0; k < 24; k++) {
    const g = grow(rng);
    const b = bounds(g);
    const score = Math.max(0, b.w - 1.45) * 4 + Math.max(0, b.h - 1.9) * 4 + Math.max(0, 0.9 - b.w) * 3
      + Math.abs(b.cx) * 3 + Math.max(0, b.w / b.h - 1.1) * 2
      + Math.max(0, 0.75 - b.bot) * 3;                    // arms must trail visibly below
    if (score < bestScore) { best = g; bestScore = score; }
    if (score < 0.05) break;
  }
  return best;
}
