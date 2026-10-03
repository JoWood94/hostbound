// Immediate-mode buttons. Screens call button() while rendering; the rects are
// kept for the next update, where hitTest() resolves taps.
import { ctx } from './canvas.js';
import { text } from '../render/draw.js';
import { PAL } from '../render/palette.js';
import { rtri } from '../render/oled.js';

let rects = [];
let nextRects = [];
// Screens laid out for a 640-tall canvas are drawn shifted down by this much;
// hit rects must shift with them.
let offY = 0;
export function setUiOffset(v) { offY = v; }

export function beginUi() { nextRects = []; }
export function endUi() { rects = nextRects; }

export function hitTest(x, y) {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i];
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.id;
  }
  return null;
}

// Rounded rectangle path (iOS-style corners).
export function rrPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Neon capsule buttons: every button is a capsule outlined in its neon
// colour, so it reads as tappable; the primary action (`fill`) has a heavier
// outline and a bigger label. No glow, no fill.
export function button(id, x, y, w, h, label, { color = PAL.white, size = 14, fill = false, disabled = false, sub = null } = {}) {
  nextRects.push({ id, x, y: y + offY, w, h });
  const c = disabled ? PAL.dim : color;
  ctx.save();
  rrPath(x + 1, y + 1, w - 2, h - 2, h / 2);
  ctx.strokeStyle = c; ctx.lineWidth = fill ? 2.5 : 1.5; ctx.stroke();
  ctx.restore();
  const ty = sub ? y + h / 2 - 6 : y + h / 2 + 1;
  text(label, x + w / 2, ty, { color: c, size, align: 'center', font: 'display' });
  if (sub) text(sub, x + w / 2, y + h / 2 + 9, { color: PAL.mute, size: 10, align: 'center' });
}

// Square icon button: radius 14 like the rest, neon outline; `filled` turns it
// solid with the icon knocked out in black. Icons: 'play' (a softly rounded
// triangle, like the system play glyph) and 'x' (two capsules).
export function iconButton(id, x, y, s, icon, color, { filled = false } = {}) {
  nextRects.push({ id, x, y: y + offY, w: s, h: s });
  ctx.save();
  rrPath(x + 1, y + 1, s - 2, s - 2, 14);
  if (filled) { ctx.fillStyle = color; ctx.fill(); }
  else { ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke(); }
  const ink = filled ? '#000' : color, cx = x + s / 2, cy = y + s / 2;
  ctx.fillStyle = ink; ctx.strokeStyle = ink;
  if (icon === 'play') { rtri(cx + s * 0.05, cy, s * 0.27, -Math.PI / 2, 0.18); ctx.fill(); }
  else {
    const d = s * 0.16;
    ctx.lineWidth = s * 0.075; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d); ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d); ctx.stroke();
  }
  ctx.restore();
}

// Hold-to-confirm capsule: a white outline that fills from the left with
// `color` while the finger stays on it (k 0..1); the label flips to black
// where the fill has reached it.
export function holdButton(id, x, y, w, h, label, k, { color = PAL.red, size = 13 } = {}) {
  nextRects.push({ id, x, y: y + offY, w, h });
  const ty = y + h / 2 + 1;
  ctx.save();
  rrPath(x + 1, y + 1, w - 2, h - 2, h / 2);
  ctx.strokeStyle = k > 0 ? color : PAL.white; ctx.lineWidth = 1.5; ctx.stroke();
  text(label, x + w / 2, ty, { color: PAL.white, size, align: 'center', font: 'display' });
  if (k > 0) {
    // clip to the capsule (rebuilt: text() left the glyph strokes as the
    // current path), then to the filled part
    rrPath(x + 1, y + 1, w - 2, h - 2, h / 2); ctx.clip();
    ctx.beginPath(); ctx.rect(x, y, w * Math.min(1, k), h); ctx.clip();
    ctx.fillStyle = color; ctx.fillRect(x, y, w, h);
    text(label, x + w / 2, ty, { color: '#000', size, align: 'center', font: 'display' });
  }
  ctx.restore();
}

// iOS-style switch: label on the left, a capsule track with a round knob.
export function toggle(id, x, y, w, h, label, on, { color = PAL.acid } = {}) {
  nextRects.push({ id, x, y: y + offY, w, h });
  text(label, x, y + h / 2 + 1, { color: PAL.white, size: 12, font: 'display' });
  const tw = 38, th = 22, tx = x + w - tw, ty = y + (h - th) / 2;
  ctx.save();
  rrPath(tx, ty, tw, th, th / 2);
  ctx.fillStyle = on ? color : '#241a2a'; ctx.fill();
  ctx.beginPath(); ctx.arc(on ? tx + tw - th / 2 : tx + th / 2, ty + th / 2, th / 2 - 3, 0, Math.PI * 2);
  ctx.fillStyle = on ? '#000' : PAL.mute; ctx.fill();
  ctx.restore();
}

// Tabs: neon labels; the selected one is lit and underlined by a short capsule.
// items: [[id, label], ...]
export function segmented(x, y, w, h, items, selected, { color = PAL.acid } = {}) {
  const sw = w / items.length;
  items.forEach(([id, label], i) => {
    const sx = x + i * sw, on = id === selected;
    nextRects.push({ id, x: sx, y: y + offY, w: sw, h });
    text(label, sx + sw / 2, y + h / 2, { color: on ? color : '#7a6a86', size: 11, align: 'center', font: 'display' });
    if (on) { rrPath(sx + sw / 2 - 12, y + h - 5, 24, 3, 1.5); ctx.fillStyle = color; ctx.fill(); }
  });
}

// Registers an invisible hit area (for cards drawn manually).
export function area(id, x, y, w, h) { nextRects.push({ id, x, y: y + offY, w, h }); }

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
