// Neon primitives. Glow is pre-rendered to offscreen sprites and blitted, since
// live shadowBlur is too slow on mobile.
import { ctx, makeOffscreen } from '../core/canvas.js';

const glowCache = new Map();

// Returns an offscreen canvas holding a glowing disc of the given colour.
export function glowSprite(color, radius, blur = radius * 1.5) {
  const key = `${color}|${radius}|${blur}`;
  let s = glowCache.get(key);
  if (s) return s;
  const pad = Math.ceil(blur * 2);
  const size = Math.ceil(radius * 2 + pad * 2);
  const off = makeOffscreen(size, size);
  const c = off.ctx;
  c.shadowColor = color;
  c.shadowBlur = blur;
  c.fillStyle = color;
  c.beginPath();
  c.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  c.fill();
  c.fill(); // double fill = stronger glow
  s = { canvas: off.canvas, size, half: size / 2 };
  glowCache.set(key, s);
  return s;
}

export function drawGlowDot(x, y, color, radius, alpha = 1) {
  // Quantize to 0.5px so the sprite cache stays small (particles shrink every frame).
  const r = Math.max(0.5, Math.round(radius * 2) / 2);
  const s = glowSprite(color, r);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.drawImage(s.canvas, x - s.half, y - s.half);
  if (alpha !== 1) ctx.globalAlpha = 1;
}

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
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  if (alpha !== 1) ctx.globalAlpha = 1;
}

export function ring(x, y, r, color, width = 2, alpha = 1) {
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  if (alpha !== 1) ctx.globalAlpha = 1;
}

export function text(str, x, y, { color = '#fff', size = 12, align = 'left', alpha = 1, weight = 'bold' } = {}) {
  if (alpha !== 1) ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(str, x, y);
  if (alpha !== 1) ctx.globalAlpha = 1;
}
