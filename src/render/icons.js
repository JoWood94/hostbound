// Item icons from primitives: capsule strokes with round caps, solid and
// hollow circles, rounded triangles (oled.ROUND). One stroke weight for every
// icon, always one neutral colour: on item cards colour means rarity only.
// A weapon's icon shows the shot it makes, so the icon teaches the effect.
// Icons live in a unit box (-0.5..0.5), drawn at size s centred on (x, y).
import { ctx } from '../core/canvas.js';
import { rtri } from './oled.js';

const TAU = Math.PI * 2;
let S = 1;                       // current icon size, set by drawIcon
// Stroke from (x1,y1) to (x2,y2) with round caps.
function L(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1 * S, y1 * S); ctx.lineTo(x2 * S, y2 * S); ctx.stroke(); }
// Polyline.
function P(...pts) { ctx.beginPath(); ctx.moveTo(pts[0] * S, pts[1] * S); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * S, pts[i + 1] * S); ctx.stroke(); }
// Filled dot and hollow ring.
function D(x, y, r) { ctx.beginPath(); ctx.arc(x * S, y * S, r * S, 0, TAU); ctx.fill(); }
function O(x, y, r, a0 = 0, a1 = TAU) { ctx.beginPath(); ctx.arc(x * S, y * S, r * S, a0, a1); ctx.stroke(); }
// Rounded triangle, rot 0 = pointing down, PI = up.
function T(x, y, R, rot) { rtri(x * S, y * S, R * S, rot); ctx.fill(); }
// Rounded square outline, a heart (two dots on a triangle), a dashed stroke.
function R(x, y, hw, r) { ctx.beginPath(); ctx.roundRect((x - hw) * S, (y - hw) * S, hw * 2 * S, hw * 2 * S, r * S); ctx.stroke(); }
function HEART(x, y, s) { D(x - s * 0.5, y - s * 0.2, s * 0.52); D(x + s * 0.5, y - s * 0.2, s * 0.52); T(x, y + s * 0.08, s * 1.05, DOWN); }
function dashed(f) { ctx.setLineDash([0.01 * S, 0.11 * S]); f(); ctx.setLineDash([]); }
const UP = Math.PI, DOWN = 0, RIGHT = -Math.PI / 2, LEFT = Math.PI / 2;

const ICONS = {
  // ---- carriers (what you shoot) ----
  laser: () => { L(0, -0.42, 0, 0.22); D(0, 0.32, 0.12); },
  scatter: () => { D(0, 0.34, 0.08); for (const a of [-0.55, 0, 0.55]) D(Math.sin(a) * 0.5, 0.34 - Math.cos(a) * 0.62, 0.1); },
  railgun: () => { ctx.lineWidth *= 1.9; L(0, -0.4, 0, 0.4); ctx.lineWidth /= 1.9; L(-0.26, -0.15, -0.26, 0.25); L(0.26, -0.15, 0.26, 0.25); },
  rockets: () => { T(0, -0.14, 0.24, UP); D(0, 0.18, 0.09); D(0, 0.36, 0.06); },
  sine: () => { for (let k = 0; k < 5; k++) D(Math.sin(k * 1.4) * 0.22, 0.38 - k * 0.19, 0.075); },
  glaive: () => { for (let k = 0; k < 3; k++) { const a = (k * TAU) / 3 - Math.PI / 2; T(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.2, a - Math.PI / 2); } D(0, 0, 0.1); },
  sporemine: () => { O(0, 0, 0.3); D(0, 0, 0.14); },
  brood: () => { D(0.2, -0.2, 0.13); D(0.02, -0.02, 0.11); D(-0.14, 0.14, 0.09); D(-0.27, 0.27, 0.07); },
  stinger: () => { L(-0.28, 0.32, 0.18, -0.18); T(0.22, -0.22, 0.13, Math.PI * 0.75); },
  mortar: () => { for (let k = 0; k < 5; k++) { const u = k / 4; D(-0.36 + u * 0.6, 0.3 - Math.sin(u * Math.PI) * 0.55, 0.05); } D(0.32, 0.3, 0.13); },
  // ---- actives ----
  emp: () => { O(0, 0, 0.17); for (let k = 0; k < 4; k++) { const a = (k * TAU) / 4 + Math.PI / 4; L(Math.cos(a) * 0.28, Math.sin(a) * 0.28, Math.cos(a) * 0.4, Math.sin(a) * 0.4); } },
  slowmo: () => { O(0, 0, 0.36); L(0, 0, 0, -0.2); L(0, 0, 0.14, 0.08); },
  overdrive: () => { P(-0.26, 0.04, 0, -0.2, 0.26, 0.04); P(-0.26, 0.3, 0, 0.06, 0.26, 0.3); },
  rail: () => { ctx.lineWidth *= 1.9; L(0, -0.4, 0, 0.2); ctx.lineWidth /= 1.9; D(0, 0.34, 0.1); },
  patch: () => { ctx.lineWidth *= 1.5; L(0, -0.3, 0, 0.3); L(-0.3, 0, 0.3, 0); },
  blackhole: () => { O(0, 0, 0.38); O(0, 0, 0.24); D(0, 0, 0.11); },
  mirrorfield: () => { O(-0.5, 0, 0.5, -0.6, 0.6); O(0.5, 0, 0.5, Math.PI - 0.6, Math.PI + 0.6); },
  overcharge: () => { P(0.08, -0.4, -0.16, 0.04, 0.12, 0.02, -0.08, 0.4); },
  warp: () => { D(-0.28, 0.28, 0.1); D(0.28, -0.28, 0.1); ctx.setLineDash([0.01 * S, 0.12 * S]); L(-0.14, 0.14, 0.14, -0.14); ctx.setLineDash([]); },
  molt: () => { O(0, 0, 0.36); D(0.06, 0.06, 0.18); },
  // ---- weapon modifiers ----
  split: () => { L(0, 0.38, 0, 0.04); L(0, 0.04, -0.24, -0.34); L(0, 0.04, 0.24, -0.34); },
  rapid: () => { L(0, -0.38, 0, -0.2); L(0, -0.08, 0, 0.1); L(0, 0.22, 0, 0.4); },
  slug: () => { ctx.lineWidth *= 2.4; L(0, -0.16, 0, 0.16); },
  pierce: () => { O(0, 0, 0.2); L(0, -0.42, 0, 0.42); },
  homing: () => { O(-0.1, 0.4, 0.5, -Math.PI / 2 - 0.2, -0.2); D(0.38, 0.3, 0.08); T(0.16, -0.16, 0.12, Math.PI * 0.8); },
  frag: () => { D(0, 0, 0.13); for (let k = 0; k < 4; k++) { const a = (k * TAU) / 4 + Math.PI / 4; D(Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.07); } },
  arc: () => { P(-0.3, -0.38, 0.06, -0.08, -0.08, 0.08, 0.3, 0.38); },
  toxin: () => { D(0, 0.1, 0.24); T(0, -0.18, 0.17, UP); },
  crit: () => { O(0, 0, 0.26); for (let k = 0; k < 4; k++) { const a = (k * TAU) / 4; L(Math.cos(a) * 0.32, Math.sin(a) * 0.32, Math.cos(a) * 0.44, Math.sin(a) * 0.44); } D(0, 0, 0.06); },
  echo: () => { D(0, 0, 0.11); O(0, 0, 0.25); O(0, 0, 0.4, -Math.PI * 0.8, -Math.PI * 0.2); O(0, 0, 0.4, Math.PI * 0.2, Math.PI * 0.8); },
  wingman: () => { D(0, 0, 0.13); L(-0.14, 0, -0.38, -0.14); L(0.14, 0, 0.38, -0.14); },
  fission: () => { D(0, 0.28, 0.11); L(0, 0.16, 0, 0); L(0, 0, -0.26, -0.28); L(0, 0, 0.26, -0.28); D(-0.3, -0.34, 0.07); D(0.3, -0.34, 0.07); },
  ricochet: () => { P(-0.34, 0.36, 0.08, -0.06, -0.18, -0.36); },
  chain: () => { O(-0.17, 0, 0.17); O(0.17, 0, 0.17); },
  charge: () => { O(0, 0, 0.34, -Math.PI / 2, Math.PI); D(0, 0, 0.12); },
  twinlink: () => { L(-0.14, -0.36, -0.14, 0.36); L(0.14, -0.36, 0.14, 0.36); },
  // ---- more weapon modifiers ----
  magaccel: () => { L(0, -0.38, 0, 0.04); P(-0.15, 0.18, 0, 0.06, 0.15, 0.18); P(-0.15, 0.36, 0, 0.24, 0.15, 0.36); },
  pound: () => { L(0, -0.4, 0, 0.02); T(0, 0.08, 0.14, DOWN); L(-0.36, 0.34, 0.36, 0.34); },
  slipstream: () => { L(-0.36, -0.2, 0.2, -0.2); L(-0.2, 0, 0.36, 0); L(-0.36, 0.2, 0.1, 0.2); },
  ambush: () => { P(-0.36, -0.18, -0.36, -0.36, -0.18, -0.36); P(0.36, -0.18, 0.36, -0.36, 0.18, -0.36); P(-0.36, 0.18, -0.36, 0.36, -0.18, 0.36); P(0.36, 0.18, 0.36, 0.36, 0.18, 0.36); D(0, 0, 0.1); },
  shrapnel: () => { D(0, 0, 0.1); for (let k = 0; k < 5; k++) { const a = (k * TAU) / 5 - Math.PI / 2; T(Math.cos(a) * 0.32, Math.sin(a) * 0.32, 0.1, a - Math.PI / 2); } },
  brand: () => { O(0, 0.12, 0.24); T(0, -0.32, 0.12, DOWN); },
  skyshot: () => { O(0, 0.62, 0.42, Math.PI * 1.2, Math.PI * 1.8); L(0, 0.12, 0, -0.26); T(0, -0.3, 0.12, UP); },
  ghostround: () => { dashed(() => L(0, -0.4, 0, 0.4)); O(0, 0, 0.18); },
  afterglow: () => { D(0, -0.28, 0.12); D(0, -0.02, 0.09); D(0, 0.2, 0.065); D(0, 0.36, 0.045); },
  densecore: () => { O(0, 0, 0.36); D(0, 0, 0.2); },
  adrenal: () => { O(0, 0.04, 0.3); L(0, -0.1, 0, 0.18); L(-0.14, 0.04, 0.14, 0.04); },
  hollow: () => { L(-0.2, 0.2, 0.2, -0.2); D(-0.3, 0.18, 0.09); D(-0.18, 0.3, 0.09); D(0.3, -0.18, 0.09); D(0.18, -0.3, 0.09); },
  focus: () => { O(-0.2, 0, 0.36, -0.95, 0.95); O(0.2, 0, 0.36, Math.PI - 0.95, Math.PI + 0.95); D(0, 0, 0.06); },
  converge: () => { L(-0.34, 0.36, 0, -0.24); L(0, 0.36, 0, -0.24); L(0.34, 0.36, 0, -0.24); D(0, -0.34, 0.08); },
  slingshot: () => { L(0, 0.4, 0, 0.06); L(0, 0.06, -0.24, -0.28); L(0, 0.06, 0.24, -0.28); D(0, -0.36, 0.08); },
  paralytic: () => { O(0, 0, 0.36); P(-0.12, -0.22, 0.06, -0.02, -0.06, 0.04, 0.12, 0.22); },
  overkill: () => { D(0, 0, 0.14); for (let k = 0; k < 8; k++) { const a = (k * TAU) / 8; L(Math.cos(a) * 0.26, Math.sin(a) * 0.26, Math.cos(a) * 0.4, Math.sin(a) * 0.4); } },
  cull: () => { O(0.06, 0.02, 0.3, -Math.PI * 0.95, -Math.PI * 0.25); L(0.16, -0.24, -0.26, 0.38); },
  metabolism: () => { O(0, 0, 0.3, 0.4, Math.PI * 1.75); T(0.27, -0.12, 0.11, 0.2); },
  heartbeat: () => { HEART(0, -0.04, 0.24); P(-0.42, 0.34, -0.18, 0.34, -0.08, 0.2, 0.04, 0.42, 0.14, 0.34, 0.42, 0.34); },
  bloodrush: () => { HEART(0.08, 0, 0.26); L(-0.42, -0.1, -0.26, -0.1); L(-0.46, 0.08, -0.3, 0.08); },
  // ---- more defense ----
  thrusters: () => { ctx.lineWidth *= 1.6; L(0, -0.38, 0, 0.0); ctx.lineWidth /= 1.6; T(0, 0.22, 0.16, DOWN); },
  keratin: () => { O(-0.16, 0.04, 0.16, Math.PI, TAU); O(0.16, 0.04, 0.16, Math.PI, TAU); O(0, 0.28, 0.16, Math.PI, TAU); },
  synapse: () => { D(-0.3, 0.22, 0.1); D(0.3, -0.22, 0.1); P(-0.2, 0.15, -0.04, -0.06, 0.06, 0.08, 0.2, -0.14); },
  momentum: () => { P(-0.32, -0.24, -0.08, 0, -0.32, 0.24); P(0.02, -0.24, 0.26, 0, 0.02, 0.24); },
  premonition: () => { O(0, 0.42, 0.56, -Math.PI * 0.78, -Math.PI * 0.22); O(0, -0.42, 0.56, Math.PI * 0.22, Math.PI * 0.78); D(0, 0, 0.1); },
  carapace: () => { O(0, 0.22, 0.36, Math.PI, TAU); L(-0.36, 0.22, 0.36, 0.22); L(0, -0.14, 0, 0.22); },
  sporecloud: () => { D(-0.2, 0, 0.1); D(0.05, -0.13, 0.12); D(0.2, 0.08, 0.1); D(-0.02, 0.17, 0.08); D(-0.26, -0.24, 0.06); D(0.28, -0.26, 0.06); },
  secondskin: () => { O(0, 0, 0.24); dashed(() => O(0, 0, 0.4)); },
  egg: () => { D(0, 0.08, 0.26); T(0, -0.1, 0.25, UP); },
  husk: () => { O(0, 0.34, 0.36, Math.PI, TAU); O(0, 0.12, 0.28, Math.PI, TAU); O(0, -0.08, 0.2, Math.PI, TAU); },
  // ---- economy ----
  greed: () => { D(-0.13, 0.17, 0.14); D(0.13, 0.17, 0.14); D(0, -0.06, 0.14); D(0, -0.3, 0.07); },
  lucky: () => { D(-0.15, 0, 0.13); D(0.15, 0, 0.13); D(0, -0.15, 0.13); D(0, 0.15, 0.13); L(0.06, 0.12, 0.2, 0.4); },
  dice: () => { R(0, 0, 0.34, 0.12); D(-0.15, -0.15, 0.06); D(0, 0, 0.06); D(0.15, 0.15, 0.06); },
  interest: () => { const a = [], b = []; for (let k = 0; k <= 8; k++) { const y = -0.4 + k * 0.1; a.push(Math.sin(k * 0.8) * 0.22, y); b.push(-Math.sin(k * 0.8) * 0.22, y); } P(...a); P(...b); },
  mitosis: () => { O(-0.13, 0, 0.22); O(0.13, 0, 0.22); },
  cellwall: () => { O(0, 0, 0.38); O(0, 0, 0.24); },
  undertow: () => { const a = [], b = []; for (let k = 0; k <= 8; k++) { const x = -0.4 + k * 0.1; a.push(x, -0.1 + Math.sin(k * 0.9) * 0.08); b.push(x, 0.16 + Math.sin(k * 0.9 + 1) * 0.08); } P(...a); P(...b); },
  // ---- risk ----
  adrenaline: () => { P(-0.42, 0.04, -0.2, 0.04, -0.1, -0.28, 0.06, 0.32, 0.16, 0.04, 0.42, 0.04); },
  glass: () => { O(0, 0, 0.32); P(-0.06, -0.32, 0.04, -0.06, -0.08, 0.08, 0.06, 0.32); },
  blood: () => { D(-0.14, 0.14, 0.15); T(-0.14, -0.05, 0.12, UP); D(0.16, 0.04, 0.15); T(0.16, -0.15, 0.12, UP); },
  leadweights: () => { T(0, 0.1, 0.32, UP); O(0, -0.3, 0.1); },
  fever: () => { L(0, -0.38, 0, 0.12); D(0, 0.26, 0.15); },
  double: () => { O(0, 0, 0.34); L(0, -0.34, 0, 0.34); D(-0.15, 0, 0.08); },
  parasite: () => { D(0.12, 0.1, 0.24); D(-0.2, -0.2, 0.09); D(-0.31, -0.06, 0.075); D(-0.35, 0.08, 0.06); },
  // ---- defense ----
  plating: () => { O(0, 0.36, 0.42, -Math.PI * 0.85, -Math.PI * 0.15); O(0, 0.56, 0.42, -Math.PI * 0.85, -Math.PI * 0.15); },
  barrier: () => { ctx.lineWidth *= 1.6; O(0, 0, 0.32); },
  icewall: () => { for (let k = -1; k <= 1; k++) O(k * 0.26, 0, 0.12); },
  orbital: () => { O(0, 0, 0.3); D(0, 0, 0.1); D(0.3, 0, 0.08); },
  blink: () => { D(-0.3, 0, 0.11); ctx.setLineDash([0.01 * S, 0.12 * S]); L(-0.12, 0, 0.14, 0); ctx.setLineDash([]); D(0.3, 0, 0.11); },
  mirror: () => { L(0, -0.38, 0, 0.38); P(-0.32, -0.2, -0.12, 0, -0.32, 0.2); },
  kickflip: () => { O(0, 0.1, 0.3, Math.PI, Math.PI * 1.85); T(0.24, -0.08, 0.12, DOWN + 0.4); },
  repair: () => { O(0, 0, 0.38); L(0, -0.18, 0, 0.18); L(-0.18, 0, 0.18, 0); },
  magnet: () => { O(0, -0.04, 0.24, 0, Math.PI); L(-0.24, -0.04, -0.24, -0.34); L(0.24, -0.04, 0.24, -0.34); },
  leech: () => { D(0, -0.06, 0.2); T(0, 0.26, 0.14, DOWN); },
};

export const hasIcon = (id) => !!ICONS[id];

// Draws item `id` at (x, y), size s, in `color`. Returns false when the item
// has no icon yet (the caller then shows its code).
export function drawIcon(id, x, y, s, color = '#ece6f2') {
  const f = ICONS[id];
  if (!f) return false;
  S = s;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.4, s * 0.085);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  f();
  ctx.restore();
  return true;
}
