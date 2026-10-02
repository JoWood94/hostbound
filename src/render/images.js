// Image-based sprite sheets (generated art). Everything degrades gracefully:
// until an image has loaded, callers fall back to the procedural sprites.
import { ctx } from '../core/canvas.js';
import { DIM } from './draw.js';

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
// `insetTop` trims source pixels off the top of the cell only (for sheets where
// the sprite of the row above bleeds into this cell). The bottom is untouched.
export function drawCell(s, row, col, x, y, size, { rot = 0, alpha = 1, flash = 0, sx = 1, sy = 1, insetTop = 0 } = {}) {
  if (!s.ready) return false;
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.imageSmoothingEnabled = true;    // generated art is high-res: downscale smoothly
  ctx.globalAlpha = alpha * DIM;
  const c = s.cell, ch = s.cellH - insetTop;
  const fullH = (size * s.cellH) / c;
  const h = (size * ch) / c;
  const srcY = row * s.cellH + insetTop;
  const dy = -fullH / 2 + (fullH - h);      // keep the sprite where it was: only the top is cut
  ctx.drawImage(s.img, col * c, srcY, c, ch, -size / 2, dy, size, h);
  if (flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * DIM * Math.min(1, flash);
    ctx.drawImage(s.img, col * c, srcY, c, ch, -size / 2, dy, size, h);
  }
  ctx.restore();
  return true;
}
