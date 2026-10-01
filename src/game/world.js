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

// One baked track tile per district: panels, seams, guide dashes, metal rails
// with studs, walls with windows and signs. Scrolled vertically.
function trackTile(di) {
  const D = DISTRICTS[di];
  return bake(`track:${di}`, W, TILE_H, (c) => {
    c.translate(-W / 2, -TILE_H / 2);
    c.fillStyle = D.bg;
    c.fillRect(0, 0, W, TILE_H);
    // Lane panels: recessed, darker at the edges
    for (let i = 0; i < LANES; i++) {
      const x0 = MARGIN + i * LANE_W + 3, w = LANE_W - 6;
      const g = c.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, shade(D.rail, -0.93));
      g.addColorStop(0.5, shade(D.rail, -0.84));
      g.addColorStop(1, shade(D.rail, -0.93));
      c.fillStyle = g;
      c.fillRect(x0, 0, w, TILE_H);
      // seams with a lit lower lip
      for (const sy of [0, TILE_H / 2]) {
        c.fillStyle = 'rgba(0,0,0,0.6)'; c.fillRect(x0, sy, w, 1.5);
        c.fillStyle = rgba(D.rail, 0.12); c.fillRect(x0, sy + 1.5, w, 1);
      }
      // bolts in the panel corners
      c.fillStyle = rgba(D.rail, 0.22);
      for (const sy of [5, TILE_H / 2 + 5]) for (const bx of [x0 + 4, x0 + w - 4]) { c.beginPath(); c.arc(bx, sy, 0.9, 0, Math.PI * 2); c.fill(); }
      // centre guide dashes
      const cx = x0 + w / 2;
      c.fillStyle = rgba(D.rail, 0.16);
      c.fillRect(cx - 1, 14, 2, 18);
      c.fillRect(cx - 1, TILE_H / 2 + 14, 2, 18);
      // inner rails the ship "rides"
      for (const rx of [cx - LANE_W * 0.3, cx + LANE_W * 0.3]) {
        c.fillStyle = rgba(D.rail, 0.1); c.fillRect(rx - 1.5, 0, 3, TILE_H);
        c.fillStyle = rgba(D.rail, 0.24); c.fillRect(rx - 0.4, 0, 0.8, TILE_H);
      }
    }
    // Filth: rust streaks, oil stains, the odd dried blood smear (deterministic per district)
    let seed = 17 + di * 101;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let k = 0; k < 9; k++) {
      const x = MARGIN + rnd() * (W - MARGIN * 2), y = rnd() * TILE_H, r = 4 + rnd() * 12;
      const kind = rnd();
      const col = kind < 0.25 ? 'rgba(90,8,14,0.35)' : kind < 0.6 ? 'rgba(70,40,20,0.3)' : 'rgba(0,0,0,0.45)';
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(x, y, r, r * (0.4 + rnd() * 0.8), rnd() * 3, 0, Math.PI * 2); c.fill();
      if (kind < 0.25) { c.fillStyle = 'rgba(90,8,14,0.3)'; c.fillRect(x - 0.6, y, 1.2, 6 + rnd() * 14); }
    }
    // Dividers: raised metal rails with a neon strip and glowing studs
    for (let i = 0; i <= LANES; i++) {
      const x = MARGIN + i * LANE_W;
      const g = c.createLinearGradient(x - 3, 0, x + 3, 0);
      g.addColorStop(0, '#07060a'); g.addColorStop(0.5, shade(D.rail, -0.55)); g.addColorStop(1, '#07060a');
      c.fillStyle = g;
      c.fillRect(x - 3, 0, 6, TILE_H);
      c.fillStyle = rgba(D.rail, 0.4);
      c.fillRect(x - 0.5, 0, 1, TILE_H);
      // one dim stud per tile: present, but never competing with bullets
      const sy = TILE_H / 4;
      const sg = c.createRadialGradient(x, sy, 0, x, sy, 3);
      sg.addColorStop(0, rgba('#ffffff', 0.6)); sg.addColorStop(0.4, rgba(D.rail, 0.45)); sg.addColorStop(1, rgba(D.rail, 0));
      c.fillStyle = sg; c.beginPath(); c.arc(x, sy, 3, 0, Math.PI * 2); c.fill();
    }
    // Walls: building facades with lit windows, pipes and a neon edge
    for (const side of [0, 1]) {
      const x0 = side ? W - MARGIN + 3 : 0, w = MARGIN - 3;
      c.fillStyle = D.wallFill; c.fillRect(x0, 0, w, TILE_H);
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(x0 + (side ? 1 : w - 3), 0, 2, TILE_H);   // pipe
      for (let k = 0; k < 6; k++) {
        const wy = 6 + k * 15;
        const lit = (k * 7 + side * 3 + di) % 3 === 0;
        c.fillStyle = lit ? rgba(k % 3 === 0 ? D.wall : '#d8b060', 0.35) : 'rgba(255,255,255,0.03)';
        c.fillRect(x0 + 3, wy, w - 7, 6);
      }
      // sign
      c.fillStyle = rgba(D.wall, 0.9);
      c.fillRect(x0 + (side ? 2 : 3), TILE_H / 2 - 9, 2, 18);
    }
  });
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

  // Overhead tunnel lights sweeping past: sells speed
  const gap = 230;
  const lo = scroll % gap;
  for (let y = lo - gap; y < H; y += gap) {
    const g = ctx.createLinearGradient(0, y - 26, 0, y + 26);
    g.addColorStop(0, rgba(D.wall, 0));
    g.addColorStop(0.5, rgba(D.wall, 0.045));
    g.addColorStop(1, rgba(D.wall, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 26, W, 52);
    line(0, y, MARGIN, y, D.wall, 3, 0.9);
    line(W - MARGIN, y, W, y, D.wall, 3, 0.9);
  }

  // Speed streaks on the panels
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  for (let k = 0; k < 6; k++) {
    const sx = MARGIN + ((k * 97 + 31) % (W - MARGIN * 2));
    const sy = ((scroll * 1.6 + k * 151) % (H + 80)) - 40;
    ctx.fillRect(sx, sy, 1, 26);
  }
  ctx.globalAlpha = 1;

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
