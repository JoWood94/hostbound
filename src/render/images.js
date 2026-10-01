// Image-based sprite sheets (generated art). Everything degrades gracefully:
// until an image has loaded, callers fall back to the procedural sprites.
import { ctx } from '../core/canvas.js';

const cache = {};

export function sheet(name, cell, cellH = cell) {
  let s = cache[name];
  if (!s) {
    const img = new Image();
    s = cache[name] = { img, cell, cellH, ready: false };
    img.onload = () => { s.ready = true; };
    img.src = `${import.meta.env.BASE_URL}sprites/${name}.png`;
  }
  return s;
}

// Draw one cell (row, col) centred at x,y; `size` is the logical width
// (height follows the cell's aspect ratio).
// `inset` trims source pixels off the top and bottom of the cell (for sheets
// where a sprite bleeds into the row above or below).
export function drawCell(s, row, col, x, y, size, { rot = 0, alpha = 1, flash = 0, sx = 1, sy = 1, inset = 0 } = {}) {
  if (!s.ready) return false;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.imageSmoothingEnabled = true;    // generated art is high-res: downscale smoothly
  ctx.globalAlpha = alpha;
  const c = s.cell, ch = s.cellH - inset * 2;
  const h = (size * ch) / c;
  const srcY = row * s.cellH + inset;
  ctx.drawImage(s.img, col * c, srcY, c, ch, -size / 2, -h / 2, size, h);
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * Math.min(1, flash);
    ctx.drawImage(s.img, col * c, srcY, c, ch, -size / 2, -h / 2, size, h);
  }
  ctx.restore();
  return true;
}
