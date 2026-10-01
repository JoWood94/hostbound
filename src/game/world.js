// Scrolling tunnel with 5 discrete lanes, Subway Surfers style.
// Every DISTRICT_LEN metres the city district changes palette. Enemy bullet
// colours never change (readability rule); only the environment does.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { line, text } from '../render/draw.js';
import { bake, shade, rgba } from '../render/sprites.js';
import { sheet } from '../render/images.js';

// Generated art: one tile of the cosmic current that flows down every lane.
const CURRENT = sheet('current', 144, 219);
const BORDER = sheet('border', 150, 144);

export const LANES = 5;
export const PX_PER_M = 10;
const MARGIN = 16;                         // side walls
export const LANE_W = (W - MARGIN * 2) / LANES;
export const laneX = (i) => MARGIN + LANE_W * (i + 0.5);
export const DISTRICT_LEN = 1000;
const PLAYER_ROW = H * 0.78;

export const DISTRICTS = [
  { name: 'NEON ROW', bg: '#060004', floor: 'rgba(255,43,214,0.025)', sleeper: '#3a1030', rail: '#7b3fd6', wall: '#ff2bd6', wallFill: '#14020f' },
  { name: 'ACID DOCKS', bg: '#020502', floor: 'rgba(182,255,43,0.03)', sleeper: '#1f3512', rail: '#8fd61f', wall: '#b6ff2b', wallFill: '#071205' },
  { name: 'CHROME SPINE', bg: '#020308', floor: 'rgba(61,123,255,0.035)', sleeper: '#18244a', rail: '#3d7bff', wall: '#9ab8ff', wallFill: '#060a18' },
  { name: 'RED SECTOR', bg: '#090102', floor: 'rgba(255,31,75,0.03)', sleeper: '#3d0d16', rail: '#c8183c', wall: '#ff1f4b', wallFill: '#180408' },
  { name: 'THE VOID', bg: '#020003', floor: 'rgba(166,77,255,0.03)', sleeper: '#24103a', rail: '#7d3bd1', wall: '#a64dff', wallFill: '#0b0414' },
];

export const districtIndex = (distance) => Math.floor(distance / DISTRICT_LEN) % DISTRICTS.length;

let scroll = 0;
const TILE_H = 96;

export function updateWorld(dt, speed) {
  scroll = (scroll + speed * dt) % (TILE_H * 100);
}

// One baked track tile per district: deep void, faint dust, and a thin plasma
// field line between lanes. Scrolled vertically. The side borders are art.
function trackTile(di) {
  const D = DISTRICTS[di];
  return bake(`track:${di}`, W, TILE_H, (c) => {
    c.translate(-W / 2, -TILE_H / 2);
    c.fillStyle = D.bg;
    c.fillRect(0, 0, W, TILE_H);
    // Dust and distant stars (deterministic per district)
    let seed = 17 + di * 101;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let k = 0; k < 7; k++) {
      const x = MARGIN + rnd() * (W - MARGIN * 2), y = rnd() * TILE_H, r = 10 + rnd() * 20;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(rnd() < 0.5 ? D.wall : D.rail, 0.035)); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let k = 0; k < 10; k++) {
      c.fillStyle = rgba('#ffffff', 0.12 + rnd() * 0.25);
      c.fillRect(MARGIN + rnd() * (W - MARGIN * 2), rnd() * TILE_H, 1, 1);
    }
    // Dividers: a thin magnetic field line with a soft glow and one knot
    for (let i = 1; i < LANES; i++) {
      const x = MARGIN + i * LANE_W;
      const g = c.createLinearGradient(x - 4, 0, x + 4, 0);
      g.addColorStop(0, rgba(D.rail, 0)); g.addColorStop(0.5, rgba(D.rail, 0.16)); g.addColorStop(1, rgba(D.rail, 0));
      c.fillStyle = g; c.fillRect(x - 4, 0, 8, TILE_H);
      c.fillStyle = rgba('#19f0ff', 0.28); c.fillRect(x - 0.5, 0, 1, TILE_H);
      const sy = TILE_H / 4 + (i % 2) * TILE_H / 2;
      const sg = c.createRadialGradient(x, sy, 0, x, sy, 3.5);
      sg.addColorStop(0, rgba('#ffffff', 0.5)); sg.addColorStop(0.4, rgba('#19f0ff', 0.35)); sg.addColorStop(1, rgba('#19f0ff', 0));
      c.fillStyle = sg; c.fillRect(x - 4, sy - 4, 8, 8);
    }
  });
}

// Side borders: banks of plasma filaments (generated art), mirrored right.
// The bright inner filament sits exactly on the lane edge.
function drawBorders(di) {
  if (!BORDER.ready) return false;
  const w = 110, h = (w * BORDER.cellH) / BORDER.cell;
  const fx = 0.913 * w;                    // inner filament position in the art
  const o = (scroll * 0.9) % h;
  const D = DISTRICTS[di];
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  for (const side of [0, 1]) {
    ctx.save();
    if (side) { ctx.translate(W, 0); ctx.scale(-1, 1); }
    ctx.globalCompositeOperation = 'lighter';
    for (let y = o - h; y < H; y += h) ctx.drawImage(BORDER.img, MARGIN - fx, y, w, h);
    // district tint on top: same plasma, the sector's colour
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = D.wall;
    ctx.fillRect(0, 0, MARGIN - 1, H);
    ctx.restore();
  }
  ctx.restore();
  return true;
}

// activeLane: lane the player is in, lit up so position is always obvious.
export function drawWorld(distance, activeLane = -1) {
  const di = districtIndex(distance);
  const D = DISTRICTS[di];
  const tile = trackTile(di);
  const off = scroll % TILE_H;
  for (let y = off - TILE_H; y < H; y += TILE_H) ctx.drawImage(tile.canvas, 0, y, W, TILE_H);

  // Cosmic currents: one plasma river per lane, flowing a bit faster than the
  // track. Additive and faint: bullets and enemies must stay readable on top.
  if (CURRENT.ready) {
    const w = LANE_W * 1.05;
    const h = (w * CURRENT.cellH) / CURRENT.cell;
    const o = (scroll * 1.25) % h;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < LANES; i++) {
      ctx.globalAlpha = i === activeLane ? 0.3 : 0.13;
      const x = laneX(i) - w / 2;
      // neighbouring lanes flow out of phase so they do not look copy-pasted
      const oi = (o + i * h * 0.37) % h;
      for (let y = oi - h; y < H; y += h) ctx.drawImage(CURRENT.img, x, y, w, h);
    }
    ctx.restore();
  }

  // Active lane: cyan floor glow and edge lights
  if (activeLane >= 0) {
    const x0 = MARGIN + activeLane * LANE_W;
    const g = ctx.createLinearGradient(0, H, 0, 0);
    g.addColorStop(0, 'rgba(25,240,255,0.16)');
    g.addColorStop(1, 'rgba(25,240,255,0.03)');
    ctx.fillStyle = g;
    ctx.fillRect(x0 + 3, 0, LANE_W - 6, H);
    line(x0 + 3, 0, x0 + 3, H, PAL.cyan, 1.5, 0.55);
    line(x0 + LANE_W - 3, 0, x0 + LANE_W - 3, H, PAL.cyan, 1.5, 0.55);
  }

  // Darkness: only the area around the ship is lit; the far track sinks into black.
  {
    const lx = activeLane >= 0 ? laneX(activeLane) : W / 2;
    const g = ctx.createRadialGradient(lx, PLAYER_ROW, 30, lx, PLAYER_ROW - 80, 520);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.3, 'rgba(4,0,3,0.3)');
    g.addColorStop(0.75, 'rgba(4,0,3,0.66)');
    g.addColorStop(1, 'rgba(2,0,2,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawBorders(di);

  // Distance markers every 100 m on the walls
  const step = 100 * PX_PER_M;
  const mOff = (distance * PX_PER_M) % step;
  for (let y = mOff - step; y < H; y += step) {
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
