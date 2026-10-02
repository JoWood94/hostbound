// Immediate-mode buttons. Screens call button() while rendering; the rects are
// kept for the next update, where hitTest() resolves taps.
import { ctx } from './canvas.js';
import { text } from '../render/draw.js';
import { PAL } from '../render/palette.js';

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

// Katakana/kanji tags printed on buttons, like Tokyo shop signs.
const KANA = {
  RUN: '走れ', 'DAILY RUN': '日替わり', ARCHIVE: '記録', RETRY: '再挑戦', 'RETRY DAILY': '再挑戦',
  MENU: 'メニュー', SHARE: '共有', RESUME: '再開', 'QUIT RUN': '終了', SKIP: 'スキップ',
  LEAVE: '出口', REPAIR: '修理', ICE: '氷', BACK: '戻る', ITEMS: '品', GOALS: '目標', COMBOS: '共鳴',
};
const kanaFor = (label) => KANA[label] || KANA[label.split(' ')[0]] || null;

// Draws a neon sign button: a slanted dark plate, a glowing tube along its left
// and bottom edges, the label in the logo's block letters, a Japanese tag.
export function button(id, x, y, w, h, label, { color = PAL.cyan, size = 14, fill = false, disabled = false, sub = null } = {}) {
  nextRects.push({ id, x, y: y + offY, w, h });
  const c = disabled ? PAL.dim : color;
  const k = Math.min(10, h * 0.28);          // slant
  const t = performance.now() / 1000;
  const flicker = !disabled && Math.sin(t * 13 + x) > 0.995 ? 0.35 : 1;
  ctx.save();
  // plate
  ctx.beginPath();
  ctx.moveTo(x + k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, fill ? 'rgba(40,10,40,0.9)' : 'rgba(18,6,20,0.88)');
  g.addColorStop(1, 'rgba(6,2,8,0.92)');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1; ctx.stroke();
  // neon tube: left edge + bottom edge
  ctx.globalAlpha = flicker;
  ctx.shadowColor = c; ctx.shadowBlur = disabled ? 0 : 10;
  ctx.strokeStyle = c; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(x + k, y + 2); ctx.lineTo(x + 1, y + h - 1); ctx.lineTo(x + w - k - 2, y + h - 1); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x + k, y + 2); ctx.lineTo(x + 1, y + h - 1); ctx.lineTo(x + w - k - 2, y + h - 1); ctx.stroke();
  ctx.restore();
  const kana = kanaFor(label);
  const ty = sub ? y + h / 2 - 7 : y + h / 2 + 1;
  text(label, x + w / 2, ty, { color: c, size, align: 'center', font: 'display', alpha: flicker });
  if (sub) text(sub, x + w / 2, y + h / 2 + 9, { color: disabled ? PAL.dim : PAL.white, size: 10, align: 'center' });
  if (kana && h >= 30) text(kana, x + w - k - 5, y + 8, { color: c, size: 8, align: 'right', alpha: 0.75 * flicker });
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
