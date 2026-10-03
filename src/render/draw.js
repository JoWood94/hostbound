// Drawing primitives shared by the UI and the HUD. OLED style: no glow.
import { ctx } from '../core/canvas.js';
import { drawWord, wordWidth } from '../ui/glyphs.js';

// Readability: the player's own layer (shots, beams, sparks) is drawn at DIM
// when the screen gets crowded, so enemy shots always stand out. Every helper
// multiplies by it and leaves globalAlpha at DIM.
export let DIM = 1;
export function setDim(k) { DIM = k; ctx.globalAlpha = k; }


export function strokePoly(points, color, width = 2, close = true) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  if (close) ctx.closePath();
  ctx.stroke();
}

export function fillPoly(points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
  ctx.closePath();
  ctx.fill();
}

export function line(x1, y1, x2, y2, color, width = 1, alpha = 1) {
  ctx.globalAlpha = alpha * DIM;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.globalAlpha = DIM;
}

export function ring(x, y, r, color, width = 2, alpha = 1) {
  ctx.globalAlpha = alpha * DIM;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = DIM;
}

// Type. Display text (titles, buttons, item names, numbers) is drawn in the
// game's own monoline glyphs (ui/glyphs.js), the same hand as the logo. Body
// text is Quicksand: geometric with rounded terminals, the logo's shapes at a
// readable size.
export const FONT_BODY = '"Quicksand", system-ui, sans-serif';
export const FONT_DISPLAY = FONT_BODY;      // only for measuring fallbacks
const CAP = 0.72;                           // glyph height per px of font size
export function text(str, x, y, { color = '#fff', size = 12, align = 'left', alpha = 1, weight = 'normal', font = 'body', maxW = undefined } = {}) {
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (font === 'display') {
    let h = size * CAP;
    if (maxW) { const w = wordWidth(String(str), h); if (w > maxW) h *= maxW / w; }
    drawWord(String(str), x, y - h / 2, h, color, { align, weight: 0.14 });
  } else {
    ctx.fillStyle = color;
    ctx.font = `${weight === 'normal' ? 500 : 600} ${Math.max(9, size)}px ${FONT_BODY}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(str, x, y, maxW);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}
