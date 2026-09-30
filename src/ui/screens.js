// Menu, archive and in-run overlays. Drawing registers buttons (see core/ui.js);
// main.js maps the returned button ids to actions.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { text, line, strokePoly } from '../render/draw.js';
import { button, area, wrap } from '../core/ui.js';
import { ITEMS, ITEM_BY_ID, RARITY, CAT_COLOR, SYNERGIES } from '../game/items.js';
import { BOARDS } from '../game/boards.js';
import { ACHIEVEMENTS, rewardOf, unlockedItems, unlockedBoards } from '../game/achievements.js';
import { heart } from './hud.js';

const VERSION = 'v0.4';

function dim(a = 0.78) {
  ctx.fillStyle = `rgba(10,0,8,${a})`;
  ctx.fillRect(0, 0, W, H);
}

function itemCard(id, x, y, w, h, it, { price = null, sold = false, afford = true } = {}) {
  area(id, x, y, w, h);
  const rc = RARITY[it.rarity].color;
  const cc = CAT_COLOR[it.cat];
  ctx.fillStyle = 'rgba(20,2,15,0.95)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = sold ? PAL.dim : rc;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // icon
  ctx.strokeStyle = cc;
  ctx.strokeRect(x + 10, y + 10, 40, 40);
  text(it.code, x + 30, y + 30, { color: cc, size: 12, align: 'center' });
  text(it.name, x + 60, y + 18, { color: sold ? PAL.dim : rc, size: 14 });
  text(`${RARITY[it.rarity].name} · ${it.cat.toUpperCase()}`, x + 60, y + 34, { color: PAL.mute, size: 8 });
  const lines = wrap(it.desc, Math.floor((w - 70) / 5.6));
  lines.slice(0, 3).forEach((l, i) => text(l, x + 60, y + 50 + i * 12, { color: PAL.white, size: 9, weight: 'normal', alpha: sold ? 0.4 : 0.9 }));
  if (price !== null) {
    text(sold ? 'SOLD' : price === 0 ? 'FREE' : `¤${price}`, x + w - 10, y + 18, { color: sold ? PAL.dim : afford ? PAL.acid : PAL.red, size: 14, align: 'right' });
  }
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export function drawMenu(save, t, boardIdx) {
  const pulse = 0.7 + Math.sin(t * 4) * 0.3;
  const gl = Math.random() < 0.04 ? (Math.random() - 0.5) * 8 : 0;
  text('NEON', W / 2 + gl, 130, { color: PAL.magenta, size: 52, align: 'center' });
  text('OVERDRIFT', W / 2 - gl, 178, { color: PAL.cyan, size: 40, align: 'center' });
  line(W * 0.2, 206, W * 0.8, 206, PAL.acid, 2);

  // Board selector
  const b = BOARDS[boardIdx];
  const unlocked = unlockedBoards(save).includes(b.id);
  button('boardPrev', 16, 238, 44, 96, '◄', { color: PAL.white, size: 18 });
  button('boardNext', W - 60, 238, 44, 96, '►', { color: PAL.white, size: 18 });
  ctx.strokeStyle = unlocked ? b.color : PAL.dim;
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 238, W - 132, 96);
  text('BOARD', W / 2, 250, { color: PAL.mute, size: 8, align: 'center' });
  text(unlocked ? b.name : `${b.name} [LOCKED]`, W / 2, 266, { color: unlocked ? b.color : PAL.dim, size: 16, align: 'center' });
  const ach = ACHIEVEMENTS.find((a) => a.id === b.unlock);
  const desc = unlocked ? b.desc : `Unlock: ${ach ? ach.desc : '?'}`;
  wrap(desc, 34).slice(0, 4).forEach((l, i) => text(l, W / 2, 286 + i * 12, { color: PAL.white, size: 9, align: 'center', weight: 'normal', alpha: unlocked ? 0.9 : 0.6 }));

  button('run', 60, 356, W - 120, 52, 'RUN', { color: PAL.cyan, size: 20, disabled: !unlocked });
  if (unlocked) text('TAP TO RUN', W / 2, 420, { color: PAL.white, size: 9, align: 'center', alpha: pulse });

  const nUnl = unlockedItems(save).length;
  button('archive', 60, 436, W - 120, 40, 'ARCHIVE', { color: PAL.acid, size: 14, sub: null });
  text(`${nUnl}/${ITEMS.length} ITEMS · ${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length} GOALS`, W / 2, 486, { color: PAL.mute, size: 8, align: 'center' });

  button('sfx', 60, 500, (W - 128) / 2, 34, `SFX ${save.settings.sfx ? 'ON' : 'OFF'}`, { color: save.settings.sfx ? PAL.white : PAL.dim, size: 11 });
  button('music', 68 + (W - 128) / 2, 500, (W - 128) / 2, 34, `MUSIC ${save.settings.music ? 'ON' : 'OFF'}`, { color: save.settings.music ? PAL.white : PAL.dim, size: 11 });

  text('SWIPE ◄ ► LANE · ▲ JUMP · ▼ PHASE · TAP ACTIVE', W / 2, 556, { color: PAL.mute, size: 8, align: 'center' });
  if (save.best > 0) text(`BEST ${save.best}m`, W / 2, 582, { color: PAL.acid, size: 12, align: 'center' });
  text(VERSION, W / 2, H - 14, { color: PAL.dim, size: 8, align: 'center' });
}

// ---------------------------------------------------------------------------
// Archive: items and goals
// ---------------------------------------------------------------------------
export function drawArchive(save, tab, selected) {
  dim(1);
  button('tabItems', 8, 10, 112, 34, 'ITEMS', { color: tab === 'items' ? PAL.cyan : PAL.dim, size: 12 });
  button('tabGoals', 124, 10, 112, 34, 'GOALS', { color: tab === 'goals' ? PAL.acid : PAL.dim, size: 12 });
  button('back', 240, 10, 112, 34, 'BACK', { color: PAL.white, size: 12 });

  const unl = unlockedItems(save);
  if (tab === 'items') {
    const cols = 4, cw = 82, ch = 38, gx = 6;
    const x0 = (W - (cols * cw + (cols - 1) * gx)) / 2;
    ITEMS.forEach((it, i) => {
      const cx = x0 + (i % cols) * (cw + gx);
      const cy = 56 + Math.floor(i / cols) * (ch + 5);
      const known = unl.includes(it.id);
      const seen = save.discovered.includes(it.id);
      area(`item:${it.id}`, cx, cy, cw, ch);
      ctx.strokeStyle = selected === it.id ? PAL.white : known ? CAT_COLOR[it.cat] : PAL.dim;
      ctx.lineWidth = selected === it.id ? 2.5 : 1.5;
      ctx.strokeRect(cx, cy, cw, ch);
      text(known ? it.code : '???', cx + cw / 2, cy + 13, { color: known ? CAT_COLOR[it.cat] : PAL.dim, size: 11, align: 'center' });
      text(known ? it.name : 'LOCKED', cx + cw / 2, cy + 27, { color: known ? PAL.white : PAL.dim, size: 7, align: 'center', alpha: seen ? 1 : 0.6 });
    });
    const it = ITEM_BY_ID[selected];
    const py = 56 + Math.ceil(ITEMS.length / cols) * (ch + 5) + 8;
    ctx.strokeStyle = PAL.dim;
    ctx.strokeRect(12, py, W - 24, H - py - 44);
    if (it) {
      const known = unl.includes(it.id);
      text(known ? it.name : '???', 22, py + 16, { color: known ? RARITY[it.rarity].color : PAL.dim, size: 14 });
      if (known) {
        wrap(it.desc, 52).forEach((l, i) => text(l, 22, py + 36 + i * 12, { color: PAL.white, size: 9, weight: 'normal' }));
        const syn = SYNERGIES.filter((s) => s.req.includes(it.id));
        if (syn.length) text(`SYNERGY: ${syn.map((s) => `${s.name} (+${s.req.filter((r) => r !== it.id).map((r) => ITEM_BY_ID[r].code).join('+')})`).join(', ')}`, 22, py + 76, { color: PAL.magenta, size: 8 });
      } else {
        const a = ACHIEVEMENTS.find((x) => x.id === it.unlock);
        text(`Unlock: ${a ? a.desc : '?'}`, 22, py + 36, { color: PAL.white, size: 9, weight: 'normal' });
        text('Or find it corrupted in a run and beat the next boss.', 22, py + 50, { color: PAL.mute, size: 8, weight: 'normal' });
      }
    } else {
      text('Tap an item for details', W / 2, py + 40, { color: PAL.mute, size: 10, align: 'center' });
    }
    text(`DISCOVERED ${save.discovered.length}/${ITEMS.length}`, W / 2, H - 24, { color: PAL.mute, size: 9, align: 'center' });
  } else {
    let y = 62;
    for (const a of ACHIEVEMENTS) {
      const done = !!save.achievements[a.id];
      const [cur, target] = a.progress(save, null);
      const rw = rewardOf(a.id);
      const col = done ? PAL.acid : PAL.white;
      text(done ? '■' : '□', 14, y, { color: col, size: 10 });
      text(a.name, 28, y - 3, { color: col, size: 10 });
      text(a.desc, 28, y + 8, { color: PAL.mute, size: 7, weight: 'normal' });
      text(done ? 'DONE' : a.runOnly ? 'IN ONE RUN' : `${Math.min(Math.floor(cur), target)}/${target}`, W - 12, y - 3, { color: done ? PAL.acid : PAL.cyan, size: 9, align: 'right' });
      if (rw) text(`+ ${rw.name}`, W - 12, y + 8, { color: rw.kind === 'board' ? PAL.orange : PAL.magenta, size: 7, align: 'right' });
      y += 27;
    }
  }
}

// ---------------------------------------------------------------------------
// In-run overlays
// ---------------------------------------------------------------------------
export function drawPick(run) {
  dim(0.82);
  text('BOSS DOWN', W / 2, 62, { color: PAL.acid, size: 22, align: 'center' });
  text('CHOOSE ONE UPGRADE', W / 2, 88, { color: PAL.white, size: 11, align: 'center' });
  run.pickChoices.forEach((it, i) => itemCard(`pick:${i}`, 20, 112 + i * 120, W - 40, 108, it));
  button('skip', 80, 486, W - 160, 40, 'SKIP', { color: PAL.dim, size: 12, sub: '+10 coins' });
}

export function drawShop(run) {
  dim(0.86);
  text('BLACK MARKET', W / 2, 36, { color: PAL.acid, size: 22, align: 'center' });
  text(`¤${run.coins}`, W / 2, 60, { color: PAL.acid, size: 14, align: 'center' });
  const p = run.player;
  let y = 76;
  run.shopSlots.forEach((s, i) => {
    if (s.kind !== 'item') return;
    itemCard(`buy:${i}`, 16, y, W - 32, 92, ITEM_BY_ID[s.id], { price: s.price, sold: s.sold, afford: run.coins >= s.price });
    y += 98;
  });
  const half = (W - 40) / 2;
  run.shopSlots.forEach((s, i) => {
    if (s.kind === 'heal') {
      const full = p.hearts >= run.stats.maxHearts;
      button(`buy:${i}`, 16, y + 4, half, 50, s.sold ? 'SOLD' : 'REPAIR', { color: PAL.red, disabled: s.sold || full, sub: full ? 'hearts full' : `+1 heart  ¤${s.price}` });
    }
    if (s.kind === 'blue') {
      button(`buy:${i}`, 24 + half, y + 4, half, 50, s.sold ? 'SOLD' : 'ICE', { color: PAL.blue, disabled: s.sold, sub: `+1 blue  ¤${s.price}` });
    }
  });
  button('reroll', 16, y + 62, W - 32, 36, `REROLL ITEMS  ¤${run.rerollCost}`, { color: PAL.cyan, size: 12, disabled: run.coins < run.rerollCost });
  button('leave', 16, y + 106, W - 32, 42, 'LEAVE', { color: PAL.white, size: 16 });
}

export function drawPause(run) {
  dim(0.85);
  text('PAUSED', W / 2, 90, { color: PAL.cyan, size: 30, align: 'center' });
  button('resume', 60, 130, W - 120, 50, 'RESUME', { color: PAL.cyan, size: 18 });
  button('quit', 60, 192, W - 120, 40, 'QUIT RUN', { color: PAL.red, size: 13 });
  text('BUILD', 20, 262, { color: PAL.mute, size: 10 });
  let y = 280;
  for (const id in run.stacks) {
    const it = ITEM_BY_ID[id];
    const n = run.stacks[id];
    text(`${it.code}`, 20, y, { color: CAT_COLOR[it.cat], size: 10 });
    text(`${it.name}${n > 1 ? ' x' + n : ''}`, 60, y, { color: PAL.white, size: 10 });
    y += 16;
    if (y > H - 60) break;
  }
  if (run.synergies.size) {
    const names = SYNERGIES.filter((s) => run.synergies.has(s.id)).map((s) => s.name).join(' · ');
    text(names, W / 2, H - 40, { color: PAL.magenta, size: 10, align: 'center' });
  }
}

export function drawDead(run) {
  dim(0.8);
  const jitter = run.deadT < 0.5 ? (Math.random() - 0.5) * 6 : 0;
  text('SIGNAL LOST', W / 2 + jitter, 110, { color: PAL.red, size: 32, align: 'center' });
  text(`${Math.floor(run.distance)}m`, W / 2, 158, { color: PAL.cyan, size: 30, align: 'center' });
  if (run.newBest) text('NEW BEST', W / 2, 186, { color: PAL.acid, size: 12, align: 'center', alpha: 0.6 + Math.sin(run.deadT * 6) * 0.4 });
  const rs = run.rs;
  text(`KILLS ${rs.kills}   BOSSES ${rs.bosses}   ¤${rs.coins}`, W / 2, 212, { color: PAL.white, size: 11, align: 'center' });
  text(`BEST ${run.save.best}m`, W / 2, 230, { color: PAL.mute, size: 10, align: 'center' });
  if (run.newUnlocks.length) {
    text('UNLOCKED', W / 2, 264, { color: PAL.acid, size: 12, align: 'center' });
    [...new Set(run.newUnlocks)].slice(0, 6).forEach((n, i) => text(n, W / 2, 284 + i * 16, { color: PAL.magenta, size: 11, align: 'center' }));
  }
  if (run.deadT > 0.8) {
    button('retry', 60, 420, W - 120, 50, 'RETRY', { color: PAL.cyan, size: 18 });
    button('menu', 60, 482, W - 120, 40, 'MENU', { color: PAL.white, size: 13 });
  }
}

export { heart };
