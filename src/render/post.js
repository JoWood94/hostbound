// Post-processing: scanlines, animated grain, vignette, damage glitch.
import { ctx, W, H, makeOffscreen } from '../core/canvas.js';

// Scanlines are static: draw once to an offscreen canvas.
const scan = makeOffscreen(W, H);
{
  const c = scan.ctx;
  c.fillStyle = 'rgba(0,0,0,0.28)';
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
}

// Grain: a few pre-rendered noise tiles, cycled each frame.
const GRAIN_TILES = 6;
const grain = [];
for (let i = 0; i < GRAIN_TILES; i++) {
  const g = makeOffscreen(W, H);
  const img = g.ctx.createImageData(W, H);
  const d = img.data;
  for (let p = 0; p < d.length; p += 4) {
    const v = Math.random() * 255;
    d[p] = d[p + 1] = d[p + 2] = v;
    d[p + 3] = Math.random() < 0.12 ? 40 : 0;
  }
  g.ctx.putImageData(img, 0, 0);
  grain.push(g.canvas);
}

// Vignette
const vig = makeOffscreen(W, H);
{
  const c = vig.ctx;
  const gr = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.65)');
  c.fillStyle = gr;
  c.fillRect(0, 0, W, H);
}

let frame = 0;

// glitch: 0..1 intensity, used when player takes damage
export function applyPost(glitch = 0) {
  frame++;
  if (glitch > 0.01) {
    // chromatic aberration + horizontal slice offsets
    const shift = Math.round(2 + glitch * 6);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * glitch;
    ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height, -shift, 0, W, H);
    ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height, shift, 0, W, H);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const slices = 3 + Math.floor(glitch * 6);
    for (let i = 0; i < slices; i++) {
      const y = Math.random() * H;
      const h = 2 + Math.random() * 14;
      const dx = (Math.random() - 0.5) * 40 * glitch;
      ctx.drawImage(ctx.canvas, 0, y * (ctx.canvas.height / H), ctx.canvas.width, h * (ctx.canvas.height / H), dx, y, W, h);
    }
  }
  ctx.drawImage(scan.canvas, 0, 0);
  ctx.globalAlpha = 0.5;
  ctx.drawImage(grain[frame % GRAIN_TILES], 0, 0);
  ctx.globalAlpha = 1;
  ctx.drawImage(vig.canvas, 0, 0);
}
