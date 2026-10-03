import { rrPath } from '../core/ui.js';
import { ctx, W, H, SAFE_TOP, SAFE_BOTTOM } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { text, fillPoly, strokePoly, ring } from '../render/draw.js';
import { xpNeed } from '../game/balance.js';
import { ITEM_BY_ID } from '../game/items.js';
import { heartShape } from '../game/pickups.js';
import { PLAYER_Y } from '../game/player.js';

// y follows the live safe area (it can settle after launch).
export const ACTIVE_BTN = { x: 8, get y() { return H - 82 - SAFE_BOTTOM; }, w: 74, h: 46 };
// Pause: bottom-right, mirroring the active button, in reach of the thumb.
export const PAUSE_BTN = { x: W - 8 - 44, get y() { return H - 82 - SAFE_BOTTOM; }, w: 44, h: 46 };

// Heart: the pickup's shape (two circles on a rounded triangle). An empty
// heart is the same shape in a dark shade of its colour: no outlines.
const EMPTY = { [PAL.red]: '#3a0a14', [PAL.blue]: '#14204a' };
export function heart(x, y, color, filled, s = 1) {
  ctx.fillStyle = filled ? color : EMPTY[color] || '#2a1f30';
  heartShape(x, y - 1 * s, 8 * s);
}

export function drawHud(run) {
  const p = run.player;
  const st = run.stats;
  const y = 20 + SAFE_TOP;
  let hx = 14;
  for (let i = 0; i < st.maxHearts; i++) { heart(hx, y, PAL.red, i < p.hearts); hx += 20; }
  for (let i = 0; i < p.blueHearts; i++) { heart(hx, y, PAL.blue, true); hx += 20; }
  for (let i = 0; i < st.barrier; i++) ring(14 + i * 12, y + 18, 4, i < p.shield ? PAL.blue : '#1c2a55', 2, 1);

  // CARAPACE shell around the symbiote while it holds
  if (p.carapace > 0 && !p.dead) {
    ctx.save(); ctx.strokeStyle = '#8a8478'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.arc(p.x, PLAYER_Y, 30, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
  // Experience: a capsule track across the very top that fills with acid.
  const need = xpNeed(run.level);
  const bx = 8, bw = W - 16, by = SAFE_TOP + 2;
  const k = Math.min(1, run.xp / need);
  ctx.fillStyle = '#1d2606';
  ctx.beginPath(); ctx.roundRect(bx, by, bw, 4, 2); ctx.fill();
  // A level is queued (it opens at the next calm moment): the fill pulses white.
  ctx.fillStyle = run.levelUps > 0 && Math.sin(run.time * 10) > 0 ? PAL.white : PAL.acid;
  if (k > 0.01) { ctx.beginPath(); ctx.roundRect(bx, by, Math.max(4, bw * k), 4, 2); ctx.fill(); }
  if (run.levelUps > 0) {
    text(`LEVEL UP ×${run.levelUps}`, W / 2, by + 34, { color: PAL.acid, size: 9, align: 'center', font: 'display' });
  }

  text(`${Math.floor(run.distance)}m`, W - 10, y, { color: PAL.cyan, size: 16, align: 'right', font: 'display' });
  text(`LV ${run.level}`, W - 10, y + 16, { color: PAL.acid, size: 12, align: 'right', font: 'display' });
  if (run.tutorial) text('TUTORIAL', W - 10, y + 30, { color: PAL.cyan, size: 9, align: 'right', alpha: 0.8, font: 'display' });
  else if (!run.boss && run.warnT <= 0) {
    const left = Math.max(0, Math.ceil(run.nextEvent - run.distance));
    text(run.pending ? 'BOSS INCOMING' : `BOSS ${left}m`, W - 10, y + 30, { color: PAL.magenta, size: 9, align: 'right', alpha: 0.8, font: 'display' });
  }

  // Pause button: a rounded square (the cards' 14 radius) with two capsule bars.
  {
    const { x: bx, y: by, w: bw, h: bh } = PAUSE_BTN;
    const cx = bx + bw / 2, cy = by + bh / 2;
    ctx.save();
    rrPath(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5, 14);
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.strokeStyle = PAL.white; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = PAL.white;
    rrPath(cx - 6.5, cy - 7, 4.5, 14, 2.25); ctx.fill();
    rrPath(cx + 2, cy - 7, 4.5, 14, 2.25); ctx.fill();
    ctx.restore();
  }

  // Active item: a real button, bottom-left. Fills up with kills; tap it when full.
  if (run.active) {
    const it = ITEM_BY_ID[run.active.id];
    const ready = run.active.charge >= run.active.max;
    const { x: bx, y: by, w: bw, h: bh } = ACTIVE_BTN;
    const pulse = ready ? 0.5 + Math.sin(run.time * 9) * 0.5 : 0;
    // Rounded plate that fills up from the bottom with kills (solid, no alpha).
    ctx.save();
    rrPath(bx, by, bw, bh, 12);
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.clip();
    const fillH = bh * (run.active.charge / run.active.max);
    ctx.fillStyle = ready ? PAL.orange : '#3a1d08';
    ctx.fillRect(bx, by + bh - fillH, bw, fillH);
    ctx.restore();
    rrPath(bx + 0.75, by + 0.75, bw - 1.5, bh - 1.5, 12);
    ctx.strokeStyle = ready ? PAL.orange : PAL.mute;
    ctx.lineWidth = ready ? 2 + pulse : 1.5;
    ctx.stroke();
    text(it.code, bx + bw / 2, by + 15, { color: ready ? '#000' : PAL.orange, size: 13, align: 'center', font: 'display' });
    text(ready ? 'TAP' : `${run.active.charge}/${run.active.max} KILLS`, bx + bw / 2, by + 33, { color: ready ? '#000' : PAL.mute, size: ready ? 11 : 8, align: 'center' });
  }

  if (run.player.ambushT > 0) {
    text('AMBUSH', run.player.x, 470, { color: PAL.amber, size: 9, align: 'center', alpha: Math.min(1, run.player.ambushT * 2) });
  }

  // Jump hint: something low is about to reach you in your lane.
  if (run.jumpHint && !run.player.dead) {
    const a = 0.55 + Math.sin(run.time * 20) * 0.45;
    const px = run.player.x;
    strokePoly([px - 9, 452, px, 442, px + 9, 452], PAL.orange, 3, false);
    text('JUMP', px, 432, { color: PAL.orange, size: 10, align: 'center', alpha: a, font: 'display' });
  }

  if (run.phaseHint && !run.player.dead) {
    const a = 0.55 + Math.sin(run.time * 20) * 0.45;
    const px = run.player.x;
    strokePoly([px - 9, 434, px, 444, px + 9, 434], PAL.cyan, 3, false);
    text('PHASE', px, 424, { color: PAL.cyan, size: 10, align: 'center', alpha: a, font: 'display' });
  }

  // Toasts
  let ty = 110 + SAFE_TOP;
  for (const t of run.toasts) {
    const a = Math.min(1, t.t * 3, (t.dur - t.t) * 6);
    text(t.text, W / 2, ty, { color: t.color, size: 14, align: 'center', alpha: a, font: 'display' });
    if (t.sub) text(t.sub, W / 2, ty + 14, { color: PAL.white, size: 9, align: 'center', alpha: a * 0.8 });
    ty += 34;
  }

  // Boss warning
  if (run.warnT > 0) {
    const a = 0.5 + Math.sin(run.warnT * 14) * 0.5;
    ctx.fillStyle = `rgba(255,31,75,${0.12 * a})`;
    ctx.fillRect(0, 0, W, H);
    text('WARNING', W / 2, H * 0.4, { color: PAL.red, size: 40, align: 'center', alpha: a, font: 'display' });
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
