// Image-based sprite sheets (generated art). Everything degrades gracefully:
// until an image has loaded, callers fall back to the procedural sprites.
import { ctx } from '../core/canvas.js';

const cache = {};

export function sheet(name, cell) {
  let s = cache[name];
  if (!s) {
    const img = new Image();
    s = cache[name] = { img, cell, ready: false };
    img.onload = () => { s.ready = true; };
    img.src = `${import.meta.env.BASE_URL}sprites/${name}.png`;
  }
  return s;
}

// Draw one cell (row, col) centred at x,y with logical size `size`.
export function drawCell(s, row, col, x, y, size, { rot = 0, alpha = 1, flash = 0, sx = 1, sy = 1 } = {}) {
  if (!s.ready) return false;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.imageSmoothingEnabled = true;    // generated art is high-res: downscale smoothly
  ctx.globalAlpha = alpha;
  const c = s.cell;
  ctx.drawImage(s.img, col * c, row * c, c, c, -size / 2, -size / 2, size, size);
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * flash;
    ctx.drawImage(s.img, col * c, row * c, c, c, -size / 2, -size / 2, size, size);
  }
  ctx.restore();
  return true;
}
