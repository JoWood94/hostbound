// Post-processing. OLED style: no ambient scanlines, grain or vignette (they
// light up pixels that should stay off). Only damage gets a brief, clean RGB
// split, so the hit reads as an event against a still screen.
import { ctx, W, H } from '../core/canvas.js';

// glitch: 0..1 intensity, used when player takes damage
export function applyPost(glitch = 0) {
  if (glitch <= 0.01) return;
  const shift = Math.round(2 + glitch * 5);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.3 * glitch;
  ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height, -shift, 0, W, H);
  ctx.drawImage(ctx.canvas, 0, 0, ctx.canvas.width, ctx.canvas.height, shift, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}
