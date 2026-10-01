import { ctx, W, H, SAFE_TOP, SAFE_BOTTOM } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { text, fillPoly, strokePoly, ring } from '../render/draw.js';
import { ITEM_BY_ID, CAT_COLOR } from '../game/items.js';

export const ACTIVE_BTN = { x: 8, y: H - 82 - SAFE_BOTTOM, w: 74, h: 46 };

export function heart(x, y, color, filled, s = 1) {
  const pts = [x, y - 4 * s, x + 5 * s, y - 8 * s, x + 9 * s, y - 4 * s, x, y + 6 * s, x - 9 * s, y - 4 * s, x - 5 * s, y - 8 * s];
  if (filled) fillPoly(pts, color);
  strokePoly(pts, color, 1.5);
}

export function drawHud(run) {
  const p = run.player;
  const st = run.stats;
  const y = 18 + SAFE_TOP;
  let hx = 14;
  for (let i = 0; i < st.maxHearts; i++) { heart(hx, y, PAL.red, i < p.hearts); hx += 20; }
  for (let i = 0; i < p.blueHearts; i++) { heart(hx, y, PAL.blue, true); hx += 20; }
  for (let i = 0; i < st.barrier; i++) ring(14 + i * 12, y + 18, 4, PAL.blue, 2, i < p.shield ? 1 : 0.25);

  text(`${Math.floor(run.distance)}m`, W - 10, y, { color: PAL.cyan, size: 16, align: 'right' });
  text(`¤${run.coins}`, W - 10, y + 16, { color: PAL.acid, size: 12, align: 'right' });
  if (!run.boss && run.warnT <= 0) {
    const left = Math.max(0, Math.ceil(run.nextEvent - run.distance));
    const next = run.eventIndex % 2 === 0 ? 'BOSS' : 'MARKET';
    text(run.pending ? `${next} INCOMING` : `${next} ${left}m`, W - 10, y + 30, { color: run.eventIndex % 2 === 0 ? PAL.magenta : PAL.acid, size: 9, align: 'right', alpha: 0.8 });
  }

  // Pause button
  ctx.strokeStyle = PAL.dim;
  ctx.lineWidth = 2;
  const py = 6 + SAFE_TOP;
  ctx.strokeRect(W / 2 - 14, py, 28, 22);
  fillPoly([W / 2 - 6, py + 5, W / 2 - 2, py + 5, W / 2 - 2, py + 17, W / 2 - 6, py + 17], PAL.white);
  fillPoly([W / 2 + 2, py + 5, W / 2 + 6, py + 5, W / 2 + 6, py + 17, W / 2 + 2, py + 17], PAL.white);

  // Active item: a real button, bottom-left. Fills up with kills; tap it when full.
  if (run.active) {
    const it = ITEM_BY_ID[run.active.id];
    const ready = run.active.charge >= run.active.max;
    const { x: bx, y: by, w: bw, h: bh } = ACTIVE_BTN;
    const pulse = ready ? 0.5 + Math.sin(run.time * 9) * 0.5 : 0;
    ctx.fillStyle = 'rgba(10,0,8,0.88)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = PAL.orange;
    ctx.globalAlpha = ready ? 0.3 + pulse * 0.3 : 0.22;
    const fillH = bh * (run.active.charge / run.active.max);
    ctx.fillRect(bx, by + bh - fillH, bw, fillH);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ready ? PAL.orange : PAL.mute;
    ctx.lineWidth = ready ? 2.5 + pulse : 1.5;
    ctx.strokeRect(bx, by, bw, bh);
    text(it.code, bx + bw / 2, by + 15, { color: ready ? PAL.white : PAL.orange, size: 13, align: 'center' });
    text(ready ? 'TAP!' : `${run.active.charge}/${run.active.max} KILLS`, bx + bw / 2, by + 33, { color: ready ? PAL.orange : PAL.mute, size: ready ? 11 : 8, align: 'center' });
  }

  if (run.player.ambushT > 0) {
    text('AMBUSH', run.player.x, 470, { color: PAL.amber, size: 9, align: 'center', alpha: Math.min(1, run.player.ambushT * 2) });
  }

  // Jump hint: something low is about to reach you in your lane.
  if (run.jumpHint && !run.player.dead) {
    const a = 0.55 + Math.sin(run.time * 20) * 0.45;
    const px = run.player.x;
    strokePoly([px - 9, 452, px, 442, px + 9, 452], PAL.orange, 3, false);
    text('JUMP', px, 432, { color: PAL.orange, size: 10, align: 'center', alpha: a });
  }

  // Held items strip
  let ix = 8;
  for (const id in run.stacks) {
    const it = ITEM_BY_ID[id];
    if (!it || it.cat === 'active') continue;
    const n = run.stacks[id];
    const label = n > 1 ? `${it.code}${n}` : it.code;
    text(label, ix, H - 26 - SAFE_BOTTOM, { color: CAT_COLOR[it.cat], size: 8, alpha: 0.75 });
    ix += label.length * 5.2 + 6;
    if (ix > W - 30) break;
  }

  // Toasts
  let ty = 110 + SAFE_TOP;
  for (const t of run.toasts) {
    const a = Math.min(1, t.t * 3, (t.dur - t.t) * 6);
    text(t.text, W / 2, ty, { color: t.color, size: 14, align: 'center', alpha: a });
    if (t.sub) text(t.sub, W / 2, ty + 14, { color: PAL.white, size: 9, align: 'center', alpha: a * 0.8 });
    ty += 34;
  }

  // Boss warning
  if (run.warnT > 0) {
    const a = 0.5 + Math.sin(run.warnT * 14) * 0.5;
    ctx.fillStyle = `rgba(255,31,75,${0.12 * a})`;
    ctx.fillRect(0, 0, W, H);
    text('WARNING', W / 2, H * 0.4, { color: PAL.red, size: 40, align: 'center', alpha: a });
    text('HOSTILE SIGNAL APPROACHING', W / 2, H * 0.4 + 30, { color: PAL.white, size: 10, align: 'center' });
  }

  if (run.slowT > 0) {
    ctx.fillStyle = 'rgba(61,123,255,0.08)';
    ctx.fillRect(0, 0, W, H);
  }
  if (run.flashT > 0) {
    ctx.fillStyle = `rgba(255,255,255,${run.flashT * 0.6})`;
    ctx.fillRect(0, 0, W, H);
  }
}
