// Scrolling tunnel with 5 discrete lanes, Subway Surfers style.
// Every DISTRICT_LEN metres the city district changes palette. Enemy bullet
// colours never change (readability rule); only the environment does.
import { ctx, W, H } from '../core/canvas.js';
import { text } from '../render/draw.js';

export const LANES = 5;
export const PX_PER_M = 10;
const MARGIN = 16;                         // side walls
export const LANE_W = (W - MARGIN * 2) / LANES;
export const laneX = (i) => MARGIN + LANE_W * (i + 0.5);
export const DISTRICT_LEN = 1000;
const PLAYER_ROW = H * 0.8;   // = player.js PLAYER_Y

export const DISTRICTS = [
  { name: 'NEON ROW', bg: '#060004', floor: 'rgba(255,43,214,0.025)', sleeper: '#3a1030', rail: '#7b3fd6', wall: '#ff2bd6', wallFill: '#14020f' },
  { name: 'ACID DOCKS', bg: '#020502', floor: 'rgba(182,255,43,0.03)', sleeper: '#1f3512', rail: '#8fd61f', wall: '#b6ff2b', wallFill: '#071205' },
  { name: 'CHROME SPINE', bg: '#020308', floor: 'rgba(61,123,255,0.035)', sleeper: '#18244a', rail: '#3d7bff', wall: '#9ab8ff', wallFill: '#060a18' },
  { name: 'RED SECTOR', bg: '#090102', floor: 'rgba(255,31,75,0.03)', sleeper: '#3d0d16', rail: '#c8183c', wall: '#ff1f4b', wallFill: '#180408' },
  { name: 'THE VOID', bg: '#020003', floor: 'rgba(166,77,255,0.03)', sleeper: '#24103a', rail: '#7d3bd1', wall: '#a64dff', wallFill: '#0b0414' },
];

export const districtIndex = (distance) => Math.floor(distance / DISTRICT_LEN) % DISTRICTS.length;

let scroll = 0;

export function updateWorld(dt, speed) {
  scroll = (scroll + speed * dt) % 96000;   // long period: wall flesh and stars don't visibly repeat
}

// OLED track, alien and organic like the player, solid colours only:
//   stars  - three parallax layers of tiny dots drifting past underneath
//   walls  - banks of breathing flesh: overlapping circles in a dark shade of
//            the district colour, brighter nodules, now and then a small
//            green eye (the player's own iris and slit)
//   lanes  - no dividers; the lane you enter glows faintly, then fades
const shadeCache = new Map();
function dark(hex, k) {           // solid mix of hex towards black
  const key = hex + k;
  let v = shadeCache.get(key);
  if (!v) {
    const n = parseInt(hex.slice(1), 16);
    const f = (c) => Math.round(c * k).toString(16).padStart(2, '0');
    v = `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
    shadeCache.set(key, v);
  }
  return v;
}
// Deterministic hash -> 0..1, so the flesh at a given track position is
// always the same while it scrolls.
function hash(i, k) {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x27d4eb2f, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

// Stars: fixed positions, each layer scrolls at its own fraction of the track.
const STARS = [];
{
  let sd = 7;
  const rnd = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const layers = [[0.12, '#2c2a38', 1, 34], [0.28, '#5a5670', 1, 22], [0.5, '#a8a4c4', 1.4, 12]];
  for (const [sp, col, r, n] of layers) for (let i = 0; i < n; i++) STARS.push({ x: rnd() * W, y: rnd() * H, sp, col, r });
}
function drawStars() {
  for (const st of STARS) {
    const y = (st.y + scroll * st.sp) % H;
    ctx.fillStyle = st.col;
    ctx.fillRect(st.x, y, st.r, st.r);
  }
}

// Side walls: 'line' (a thin neon edge, on trial) or 'flesh' (organic banks).
const WALLS = 'line';

// One bank of flesh. side 0 = left, 1 = right.
const BLOB = 15;                  // spacing of the flesh lumps along the wall
function drawFlesh(side, D, t) {
  const body = dark(D.wall, 0.34), nod = dark(D.wall, 0.5);   // nodules stay dim: never read as enemy shots
  const i0 = Math.floor(-scroll / BLOB) - 2, i1 = i0 + Math.ceil(H / BLOB) + 4;
  const sx = (x) => (side ? W - x : x);
  // body lumps: big overlapping circles hugging the wall
  ctx.fillStyle = body;
  for (let i = i0; i <= i1; i++) {
    const y = i * BLOB + scroll;
    const h = hash(i, side);
    const r = (7 + h * 7) * (1 + Math.sin(t * 1.8 + i * 0.9) * 0.06);
    const x = MARGIN - 10 + hash(i, side + 7) * 5;
    ctx.beginPath(); ctx.arc(sx(x), y, r, 0, Math.PI * 2); ctx.fill();
  }
  // nodules and the odd eye
  for (let i = i0; i <= i1; i++) {
    const h = hash(i, side + 13);
    if (h > 0.45) continue;
    const y = i * BLOB + scroll + 4;
    const x = MARGIN - 6 + hash(i, side + 21) * 5;
    if (h < 0.05) {
      const r = 3.4;
      ctx.fillStyle = '#c6ff1a'; ctx.beginPath(); ctx.arc(sx(x), y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect(sx(x) - r * 0.65, y - r * 0.2, r * 1.3, r * 0.4, r * 0.2); ctx.fill();
    } else {
      ctx.fillStyle = nod;
      ctx.beginPath(); ctx.arc(sx(x), y, 1.5 + h * 4, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// Lane glow: when the player enters a lane it lights up and fades out.
let glowLane = -1, glowT = 0, lastLane = -1, lastNow = 0;
function laneGlow(activeLane) {
  const now = performance.now() / 1000;
  const dt = Math.min(0.1, now - lastNow);
  lastNow = now;
  if (activeLane !== lastLane) { if (lastLane >= 0 && activeLane >= 0) { glowLane = activeLane; glowT = 1; } lastLane = activeLane; }
  if (glowT <= 0 || glowLane < 0) return;
  glowT = Math.max(0, glowT - dt / 0.45);
  const k = glowT * glowT;                         // ease out
  ctx.fillStyle = dark('#19f0ff', 0.13 * k);
  const x0 = MARGIN + glowLane * LANE_W;
  ctx.beginPath(); ctx.roundRect(x0 + 3, 0, LANE_W - 6, H, 12); ctx.fill();
}

export function drawWorld(distance, activeLane = -1) {
  const di = districtIndex(distance);
  const D = DISTRICTS[di];
  const t = performance.now() / 1000;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  drawStars();
  laneGlow(activeLane);
  if (WALLS === 'flesh') { drawFlesh(0, D, t); drawFlesh(1, D, t); }
  else {
    // Trial: just a thin neon line on each lane edge.
    ctx.fillStyle = D.wall;
    ctx.fillRect(MARGIN - 1.5, 0, 1.5, H);
    ctx.fillRect(W - MARGIN, 0, 1.5, H);
  }

  // District border: a string of small circles that reaches the board
  // exactly when the district switches.
  const next = (Math.floor(distance / DISTRICT_LEN) + 1) * DISTRICT_LEN;
  const yb = PLAYER_ROW - (next - distance) * PX_PER_M;
  if (yb > -20 && yb < H) {
    const N = DISTRICTS[districtIndex(next)];
    ctx.fillStyle = N.wall;
    for (let x = MARGIN + 6; x < W - MARGIN; x += 12) { ctx.beginPath(); ctx.arc(x, yb, 2, 0, Math.PI * 2); ctx.fill(); }
    text(N.name, W / 2, yb - 12, { color: N.wall, size: 11, align: 'center', font: 'display' });
  }
}
