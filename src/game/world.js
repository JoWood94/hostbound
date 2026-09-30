// Scrolling tunnel background with 5 lanes.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { line } from '../render/draw.js';

export const LANES = 5;
export const PX_PER_M = 10;
export const LANE_W = W / LANES;
export const laneX = (i) => LANE_W * (i + 0.5);

let scroll = 0;

export function updateWorld(dt, speed) {
  scroll = (scroll + speed * dt) % 80;
}

export function drawWorld(distance) {
  ctx.fillStyle = PAL.bg;
  ctx.fillRect(0, 0, W, H);

  // Lane dividers
  for (let i = 1; i < LANES; i++) {
    line(i * LANE_W, 0, i * LANE_W, H, PAL.dim, 1, 0.7);
  }
  // Horizontal rungs scrolling down, perspective-less but rhythmic
  for (let y = scroll - 80; y < H; y += 80) {
    line(0, y, W, y, PAL.dim, 1, 0.5);
  }
  // Tunnel walls
  line(1, 0, 1, H, PAL.magenta, 2, 0.6);
  line(W - 1, 0, W - 1, H, PAL.magenta, 2, 0.6);
  // Distance markers every 100m
  const m = 100;
  const px = PX_PER_M;
  const off = (distance * px) % (m * px);
  for (let y = off - m * px; y < H; y += m * px) {
    line(0, y, 12, y, PAL.cyan, 2, 0.8);
    line(W - 12, y, W, y, PAL.cyan, 2, 0.8);
  }
}
