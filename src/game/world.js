// Scrolling tunnel with 5 discrete lanes, Subway Surfers style.
// Every DISTRICT_LEN metres the city district changes palette. Enemy bullet
// colours never change (readability rule); only the environment does.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { line, text } from '../render/draw.js';

export const LANES = 5;
export const PX_PER_M = 10;
const MARGIN = 16;                         // side walls
export const LANE_W = (W - MARGIN * 2) / LANES;
export const laneX = (i) => MARGIN + LANE_W * (i + 0.5);
export const DISTRICT_LEN = 1000;
const PLAYER_ROW = H * 0.78;

export const DISTRICTS = [
  { name: 'NEON ROW', bg: '#0a0008', floor: 'rgba(255,43,214,0.025)', sleeper: '#3a1030', rail: '#ff2bd6', wall: '#ff2bd6', wallFill: '#14020f' },
  { name: 'ACID DOCKS', bg: '#030a04', floor: 'rgba(182,255,43,0.03)', sleeper: '#1f3512', rail: '#8fd61f', wall: '#b6ff2b', wallFill: '#071205' },
  { name: 'CHROME SPINE', bg: '#03050d', floor: 'rgba(61,123,255,0.035)', sleeper: '#18244a', rail: '#3d7bff', wall: '#9ab8ff', wallFill: '#060a18' },
  { name: 'RED SECTOR', bg: '#0d0203', floor: 'rgba(255,31,75,0.03)', sleeper: '#3d0d16', rail: '#c8183c', wall: '#ff1f4b', wallFill: '#180408' },
  { name: 'THE VOID', bg: '#040006', floor: 'rgba(166,77,255,0.03)', sleeper: '#24103a', rail: '#7d3bd1', wall: '#a64dff', wallFill: '#0b0414' },
];

export const districtIndex = (distance) => Math.floor(distance / DISTRICT_LEN) % DISTRICTS.length;

let scroll = 0;

export function updateWorld(dt, speed) {
  scroll = (scroll + speed * dt) % 48;
}

// activeLane: lane the player is in, lit up so position is always obvious.
export function drawWorld(distance, activeLane = -1) {
  const D = DISTRICTS[districtIndex(distance)];
  ctx.fillStyle = D.bg;
  ctx.fillRect(0, 0, W, H);

  // Lane floors
  for (let i = 0; i < LANES; i++) {
    const x0 = MARGIN + i * LANE_W;
    ctx.fillStyle = i === activeLane ? 'rgba(25,240,255,0.06)' : D.floor;
    ctx.fillRect(x0 + 4, 0, LANE_W - 8, H);
  }

  // Sleepers (rungs) scrolling down inside each lane, like track ties
  ctx.strokeStyle = D.sleeper;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  for (let y = scroll - 48; y < H; y += 48) {
    for (let i = 0; i < LANES; i++) {
      const x0 = MARGIN + i * LANE_W;
      ctx.moveTo(x0 + 8, y);
      ctx.lineTo(x0 + LANE_W - 8, y);
    }
  }
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Rails: two per lane
  for (let i = 0; i < LANES; i++) {
    const cx = laneX(i);
    const col = i === activeLane ? PAL.cyan : D.rail;
    const a = i === activeLane ? 0.55 : 0.28;
    const rx = LANE_W * 0.3;
    line(cx - rx, 0, cx - rx, H, col, 1.5, a);
    line(cx + rx, 0, cx + rx, H, col, 1.5, a);
  }

  // Lane dividers
  for (let i = 1; i < LANES; i++) {
    const x = MARGIN + i * LANE_W;
    line(x, 0, x, H, D.sleeper, 1, 0.9);
  }

  // Walls
  ctx.fillStyle = D.wallFill;
  ctx.fillRect(0, 0, MARGIN, H);
  ctx.fillRect(W - MARGIN, 0, MARGIN, H);
  line(MARGIN, 0, MARGIN, H, D.wall, 2, 0.8);
  line(W - MARGIN, 0, W - MARGIN, H, D.wall, 2, 0.8);

  // Distance markers every 100 m on the walls
  const step = 100 * PX_PER_M;
  const off = (distance * PX_PER_M) % step;
  for (let y = off - step; y < H; y += step) {
    line(4, y, MARGIN - 4, y, PAL.cyan, 3, 0.9);
    line(W - MARGIN + 4, y, W - 4, y, PAL.cyan, 3, 0.9);
  }

  // District border: a bright gate line that reaches the board exactly when
  // the district switches.
  const next = (Math.floor(distance / DISTRICT_LEN) + 1) * DISTRICT_LEN;
  const yb = PLAYER_ROW - (next - distance) * PX_PER_M;
  if (yb > -20 && yb < H) {
    const N = DISTRICTS[districtIndex(next)];
    line(0, yb, W, yb, N.wall, 3, 0.9);
    line(0, yb + 4, W, yb + 4, N.wall, 1, 0.5);
    text(N.name, W / 2, yb - 10, { color: N.wall, size: 10, align: 'center', alpha: 0.9 });
  }
}
