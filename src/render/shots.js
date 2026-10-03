// Shots and their effects, drawn live from primitives (capsules, circles,
// rounded triangles), solid colours only: no sprite sheets, no glow, no alpha
// fades. Motion and life are shown by size and easing, never by transparency.
// Every shot is ONE flat colour: player shots acid green; enemy shots are magenta
// eyed triangles (high, dodge) and orange dotted waves (low, jump), the same language as the
// obstacles.
import { ctx } from '../core/canvas.js';
import { DIM } from './draw.js';
import { capsule, rtri } from './oled.js';

export const ACID = '#c6ff1a', CORE = '#f4ffd8', AMBER = '#ffd27a', MAG = '#ff2bd6', ORANGE = '#ff6a00';
const TAU = Math.PI * 2;
const easeOut = (k) => 1 - (1 - k) ** 3;

function fill(c) { ctx.globalAlpha = DIM; ctx.fillStyle = c; ctx.fill(); }
function stroke(c, w) { ctx.globalAlpha = DIM; ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke(); }
function dot(x, y, r, c) { if (r <= 0.2) return; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); fill(c); }
function circle(x, y, r, c, w) { if (r <= 0.2 || w <= 0.1) return; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); stroke(c, w); }

// Unit direction of flight from velocity.
function dir(vx, vy) { const s = Math.hypot(vx, vy) || 1; return [vx / s, vy / s]; }

// ---------------------------------------------------------------------------
// Player projectiles
// ---------------------------------------------------------------------------
// Base shot: one flat, plump capsule along its flight; piercing = longer, thinner.
// r already grows with the damage (weapon.js dmgScale); BOLT_K only scales the
// drawing on top of that, so the damage-to-size curve keeps its shape.
const BOLT_K = 1.12;
export function bolt(x, y, vx, vy, r, needle = false) {
  const [dx, dy] = dir(vx, vy);
  r *= BOLT_K;
  const len = r * (needle ? 3 : 1.1), w = r * (needle ? 0.7 : 1.05);
  capsule(x - dx * len, y - dy * len, x + dx * len * 0.25, y + dy * len * 0.25, w); fill(ACID);
}
// Echo / heavy round: a solid ball inside a ring that spins its gap.
export function echo(x, y, r, t) {
  dot(x, y, r * 1.1, ACID);
  ctx.beginPath(); ctx.arc(x, y, r * 1.9, t * 8, t * 8 + TAU * 0.8); stroke(ACID, 1.6);
}
// Rocket: a rounded-triangle nose with three exhaust beads shrinking behind it.
export function rocket(x, y, vx, vy, r, t, i) {
  const [dx, dy] = dir(vx, vy);
  for (let k = 3; k >= 1; k--) {
    const f = 0.85 + 0.15 * Math.sin(t * 40 + i + k);
    dot(x - dx * r * 1.6 * k, y - dy * r * 1.6 * k, r * (0.75 - k * 0.15) * f, ACID);
  }
  rtri(x, y, r * 1.5, Math.atan2(dy, dx) - Math.PI / 2); fill(ACID);
}
// Scatter pellet: a small bead.
export function pellet(x, y, r) { dot(x, y, r * 1.1, ACID); }
// Sine shot: a three-bead segmented larva, head first, wriggling.
export function larvaShot(x, y, vx, vy, r, t, i) {
  const [dx, dy] = dir(vx, vy);
  for (let k = 2; k >= 0; k--) {
    const w = Math.sin(t * 18 + i - k) * r * 0.5;
    dot(x - dx * r * 1.2 * k - dy * w, y - dy * r * 1.2 * k + dx * w, r * (1 - k * 0.22), ACID);
  }
}
// Trait looks: drone round = small triangle, shard = spinning diamond,
// echolet = small ring, fission child = twin beads.
export function traitShot(kind, x, y, vx, vy, r, t, i) {
  const [dx, dy] = dir(vx, vy);
  if (kind === 'drone') { rtri(x, y, r * 1.4, Math.atan2(dy, dx) - Math.PI / 2); fill(ACID); }
  else if (kind === 'shard') { rtri(x, y, r * 1.3, t * 12 + i); fill(ACID); }
  else if (kind === 'echolet') circle(x, y, r * 1.2, ACID, 1.6);
  else { dot(x - dy * r * 0.8, y + dx * r * 0.8, r * 0.7, ACID); dot(x + dy * r * 0.8, y - dx * r * 0.8, r * 0.7, ACID); }
}
// Explosive tag on a shot: a thin amber ring around it.
export function explosiveTag(x, y, r) { circle(x, y, r + 3, AMBER, 1.2); }

// Bone glaive: a four-point shuriken, deliberately sharp (the one weapon
// that cuts), spinning fast. Flat acid.
export function glaive(x, y, r, t, i) {
  const a0 = t * 14 + i, R = r * 1.35, ri = r * 0.38;
  ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = a0 + (k * Math.PI) / 4, rr = k % 2 ? ri : R;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
  ctx.lineJoin = 'miter';
  fill(ACID);
}
// Spore mine: a pod in a ring; armed, its core swells faster as the fuse runs.
export function mine(x, y, r, t, armed, fuse) {
  const beat = armed ? 0.5 + 0.5 * Math.sin(t * (8 + fuse * 10)) : 0.3;
  circle(x, y, r + 2 + beat * 2, ACID, 1.6);
  dot(x, y, r * (0.6 + beat * 0.35), armed && fuse > 1 ? AMBER : ACID);
}
// Larva (BROOD): segmented grub; latched it curls and chews.
export function grub(x, y, rot, t, i, latched) {
  const ang = latched ? t * 3 + i : rot - Math.PI / 2;
  const c = Math.cos(ang), s = Math.sin(ang);
  for (let k = 3; k >= 0; k--) {
    const lx = latched ? Math.cos(k * 0.9) * 4 : -k * 3.2;
    const ly = latched ? Math.sin(k * 0.9) * 4 : Math.sin(t * 16 + k * 1.3 + i) * 1.4;
    dot(x + lx * c - ly * s, y + lx * s + ly * c, 2.6 - k * 0.35, ACID);
  }
}
// Stinger: a needle capsule with a barb; stuck, a fuse arc closes and turns amber.
export function sting(x, y, rot, latched, left) {
  const a = latched ? -Math.PI / 2 : rot - Math.PI / 2;
  const tx = x + (latched ? 0 : 0), ty = y + (latched ? 9 : 0);
  const ex = tx - Math.cos(a) * 14, ey = ty - Math.sin(a) * 14;
  capsule(tx, ty, ex, ey, 1.4); fill(ACID);
  rtri(tx, ty, 3.5, a - Math.PI / 2); fill(ACID);
  if (latched) {
    const hot = 1 - left;
    ctx.beginPath(); ctx.arc(x, y, 9 + 9 * left, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.05, left));
    ctx.lineCap = 'round'; stroke(hot > 0.6 ? AMBER : ACID, 2.2);
  }
}
// Seed mortar: a seed that grows as it arcs toward the camera (no shadow).
export function lob(x, y, r, k) {
  dot(x, y, r * (1 + 0.9 * Math.sin(Math.PI * k)), ACID);
}

// ---------------------------------------------------------------------------
// Enemy projectiles
// ---------------------------------------------------------------------------
// High shot: a flat magenta rounded triangle pointing where it flies, with
// the enemies' pale pupil inside (a tiny enemy) and two beads shrinking
// behind it that show the way it travels. The triangle is the enemy shape
// (the Drone), so it never reads as one of your capsules or a cell. Drawn on
// top of everything.
const PALE_MAG = '#ffbff3';   // MAG mixed 70% towards white, like the enemy pupils
export function enemyOrb(x, y, r, t, i, vx = 0, vy = 1) {
  const [dx, dy] = dir(vx, vy);
  dot(x - dx * r * 2.6, y - dy * r * 2.6, r * 0.6, MAG);
  dot(x - dx * r * 4, y - dy * r * 4, r * 0.38, MAG);
  rtri(x, y, r * 2.3, Math.atan2(dy, dx) - Math.PI / 2);
  fill(MAG);
  dot(x - dx * r * 0.2, y - dy * r * 0.2, r * 0.55, PALE_MAG);
}
// Low wave: a dotted orange row (the same mark as a jump obstacle), rippling.
export function enemyLowWave(x, y, w, t, i) {
  const r = 3.4, n = Math.max(3, Math.round(w / 10));
  const step = (w - r * 2) / (n - 1);
  for (let k = 0; k < n; k++) dot(x - w / 2 + r + k * step, y + Math.sin(t * 10 + k * 0.8 + i) * 1.5, r, ORANGE);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
// Polyline stroke for beams, rails and novas. Every bend is rounded with the
// same generous radius (capped at half of the shorter neighbouring segment),
// so paths turn in soft curves like the rest of the game, never sharp corners.
const BEND = 26;
export function path(pts, color, width) {
  const n = pts.length / 2;
  if (n < 2 || width <= 0.1) return;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) {
    const x0 = pts[i * 2 - 2], y0 = pts[i * 2 - 1], x1 = pts[i * 2], y1 = pts[i * 2 + 1], x2 = pts[i * 2 + 2], y2 = pts[i * 2 + 3];
    const r = Math.min(BEND, Math.hypot(x1 - x0, y1 - y0) / 2, Math.hypot(x2 - x1, y2 - y1) / 2);
    ctx.arcTo(x1, y1, x2, y2, r);
  }
  ctx.lineTo(pts[n * 2 - 2], pts[n * 2 - 1]);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  stroke(color, width);
}
// Beam: one flat acid cord whose width breathes, a round foot at the source.
export function beam(pts, w, a, t) {
  path(pts, ACID, w * a * (1 + Math.sin(t * 22) * 0.08));
  dot(pts[0], pts[1], (4 + w * 0.4) * a, ACID);
}
// Rail flash: a thick acid stroke that thins out, white core.
export function rail(pts, k, w) {
  path(pts, ACID, 12 * k * (0.5 + w * 0.5) + 0.5);
}
// Arc relay: a smooth S-curve between the two enemies that thins as it fades
// (the bow flips each frame, so it crackles without sharp corners).
export function arc(x1, y1, x2, y2, k) {
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, nx = -(y2 - y1) * 0.25, ny = (x2 - x1) * 0.25;
  const f = Math.random() < 0.5 ? 1 : -1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.quadraticCurveTo((x1 + mx) / 2 + nx * f, (y1 + my) / 2 + ny * f, mx, my);
  ctx.quadraticCurveTo((mx + x2) / 2 - nx * f, (my + y2) / 2 - ny * f, x2, y2);
  ctx.lineCap = 'round';
  stroke('#19f0ff', 2.5 * k + 0.3);
}
// Blast ring: opens and thins.
export function blastRing(x, y, r, k) { circle(x, y, r * easeOut(1 - k) + 2, '#e6ff8a', 3 * k + 0.4); }
// Impact flash: a solid disc that shrinks away.
export function flash(x, y, r, c, k) { dot(x, y, r * (0.4 + 0.8 * k), c); }
// Pops: burst (ring + rays), nova (thick ring thinning), sting (four-ray star).
export function pop(kind, x, y, size, k) {
  const e = easeOut(k), s = size * 0.5;
  if (kind === 'burst') {
    circle(x, y, s * (0.3 + 0.7 * e), ACID, 4 * (1 - k) + 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + 0.3;
      const r0 = s * (0.35 + 0.55 * e), r1 = r0 + s * 0.25 * (1 - k);
      capsule(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1, 1.6 * (1 - k) + 0.3); fill(ACID);
    }
  } else if (kind === 'nova') {
    circle(x, y, s * (0.2 + 0.8 * e), ACID, s * 0.35 * (1 - k) + 0.3);
  } else {
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4 + Math.PI / 4, r1 = s * 0.6 * e;
      capsule(x, y, x + Math.cos(a) * r1, y + Math.sin(a) * r1, 1.8 * (1 - k) + 0.3); fill(AMBER);
    }
  }
}
// Trail puddle (acid ground trail): a bead that shrinks with its life.
export function trailBead(x, y, k) { dot(x, y, 2.6 * k + 0.4, '#5e7a12'); }

// Status marks on an enemy (radius rr), primitives only:
//   poison: three acid beads orbiting; brand: a small acid triangle above;
//   freeze: a thick cyan ring; slow: a dashed cyan ring; lock: four corner
//   capsules rotating as a reticle.
export function status(kind, x, y, rr, t, id) {
  if (kind === 'poison') {
    for (let k = 0; k < 3; k++) { const a = t * 3 + id + (k * TAU) / 3; dot(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 2.2, ACID); }
  } else if (kind === 'brand') { rtri(x, y - rr - 6, 4.5, Math.PI); fill(ACID); }
  else if (kind === 'freeze') circle(x, y, rr, '#9ff4ff', 3);
  else if (kind === 'slow') { ctx.setLineDash([3, 5]); circle(x, y, rr, '#19f0ff', 1.6); ctx.setLineDash([]); }
  else if (kind === 'lock') {
    const a0 = t * 2;
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * TAU) / 4;
      const cx = x + Math.cos(a) * (rr + 4), cy = y + Math.sin(a) * (rr + 4);
      capsule(cx - Math.sin(a) * 4, cy + Math.cos(a) * 4, cx + Math.sin(a) * 4, cy - Math.cos(a) * 4, 1.2); fill(ACID);
    }
  }
}
// Cauterize charge: an amber arc closing round the held target.
export function chargeArc(x, y, rr, k) {
  ctx.beginPath(); ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, k));
  ctx.lineCap = 'round'; stroke(AMBER, 3);
}
// Wingman: a small acid bead with two capsule wings that beat.
export function wingman(x, y, t) {
  const b = Math.sin(t * 30) * 0.35;
  for (const sd of [-1, 1]) { capsule(x + sd * 3, y, x + sd * 9, y - 3 + b * 4 * sd, 1.6); fill(ACID); }
  dot(x, y, 3.6, ACID);
}
// Husk shell: an acid arc capsule, stacked per hit point left.
export function husk(x, y, w, n) {
  for (let k = 0; k < n; k++) {
    ctx.beginPath(); ctx.ellipse(x, y - k * 5, w, 6, 0, Math.PI, TAU);
    ctx.lineCap = 'round'; stroke(ACID, 2.2);
  }
}
