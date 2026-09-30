// Scrolling tunnel with 5 discrete lanes, Subway Surfers style.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { line } from '../render/draw.js';

export const LANES = 5;
export const PX_PER_M = 10;
const MARGIN = 16;                         // side walls
export const LANE_W = (W - MARGIN * 2) / LANES;
export const laneX = (i) => MARGIN + LANE_W * (i + 0.5);

let scroll = 0;

export function updateWorld(dt, speed) {
  scroll = (scroll + speed * dt) % 48;
}

// activeLane: lane the player is in, lit up so position is always obvious.
export function drawWorld(distance, activeLane = -1) {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);

  // Lane floors
  for (let i = 0; i < LANES; i++) {
    const x0 = MARGIN + i * LANE_W;
    ctx.fillStyle = i === activeLane ? 'rgba(25,240,255,0.06)' : 'rgba(255,43,214,0.025)';
    ctx.fillRect(x0 + 4, 0, LANE_W - 8, H);
  }

  // Sleepers (rungs) scrolling down inside each lane, like track ties
  ctx.strokeStyle = PAL.dim;
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
    const col = i === activeLane ? PAL.cyan : PAL.magenta;
    const a = i === activeLane ? 0.55 : 0.28;
    const rx = LANE_W * 0.3;
    line(cx - rx, 0, cx - rx, H, col, 1.5, a);
    line(cx + rx, 0, cx + rx, H, col, 1.5, a);
  }

  // Lane dividers
  for (let i = 1; i < LANES; i++) {
    const x = MARGIN + i * LANE_W;
    line(x, 0, x, H, PAL.dim, 1, 0.9);
  }

  // Walls
  ctx.fillStyle = PAL.bg2;
  ctx.fillRect(0, 0, MARGIN, H);
  ctx.fillRect(W - MARGIN, 0, MARGIN, H);
  line(MARGIN, 0, MARGIN, H, PAL.magenta, 2, 0.8);
  line(W - MARGIN, 0, W - MARGIN, H, PAL.magenta, 2, 0.8);

  // Distance markers every 100 m on the walls
  const step = 100 * PX_PER_M;
  const off = (distance * PX_PER_M) % step;
  for (let y = off - step; y < H; y += step) {
    line(4, y, MARGIN - 4, y, PAL.cyan, 3, 0.9);
    line(W - MARGIN + 4, y, W - 4, y, PAL.cyan, 3, 0.9);
  }
}
