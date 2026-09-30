// Immediate-mode buttons. Screens call button() while rendering; the rects are
// kept for the next update, where hitTest() resolves taps.
import { ctx } from './canvas.js';
import { text } from '../render/draw.js';
import { PAL } from '../render/palette.js';

let rects = [];
let nextRects = [];

export function beginUi() { nextRects = []; }
export function endUi() { rects = nextRects; }

export function hitTest(x, y) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
  }
  return null;
}

// Draws a neon button and registers its rect.
export function button(id, x, y, w, h, label, { color = PAL.cyan, size = 14, fill = false, disabled = false, sub = null } = {}) {
  nextRects.push({ id, x, y, w, h });
  const c = disabled ? PAL.dim : color;
  ctx.fillStyle = fill ? c : 'rgba(10,0,8,0.85)';
  ctx.globalAlpha = fill ? 0.25 : 1;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = c;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  if (sub) {
    text(label, x + w / 2, y + h / 2 - 7, { color: c, size, align: 'center' });
    text(sub, x + w / 2, y + h / 2 + 9, { color: disabled ? PAL.dim : PAL.white, size: 9, align: 'center' });
  } else {
    text(label, x + w / 2, y + h / 2 + 1, { color: c, size, align: 'center' });
  }
}

// Registers an invisible hit area (for cards drawn manually).
export function area(id, x, y, w, h) { nextRects.push({ id, x, y, w, h }); }

// Word-wrap helper for small descriptions.
export function wrap(str, maxChars) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
    else cur += ' ' + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}
