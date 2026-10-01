// Menu, archive and in-run overlays. Drawing registers buttons (see core/ui.js);
// main.js maps the returned button ids to actions.
import { ctx, W, H } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { text, line, strokePoly } from '../render/draw.js';
import { button, area, wrap } from '../core/ui.js';
import { ITEMS, ITEM_BY_ID, RARITY, CAT_COLOR, SYNERGIES, STAT_DEFS, statDelta } from '../game/items.js';
import { BOARDS } from '../game/boards.js';
import { ACHIEVEMENTS, rewardOf, unlockedItems, unlockedBoards } from '../game/achievements.js';
import { heart } from './hud.js';
import { shipSprite, drawSprite } from '../render/sprites.js';
import { todayKey } from '../game/run.js';
import { COMBOS, offerHints, activeCombos } from '../game/combos.js';
import { SKIP_COINS } from '../game/balance.js';

const VERSION = 'v1.2';

function dim(a = 0.78) {
  ctx.fillStyle = `rgba(10,0,8,${a})`;
  ctx.fillRect(0, 0, W, H);
}

function itemCard(id, x, y, w, h, it, { price = null, sold = false, afford = true, run = null } = {}) {
  area(id, x, y, w, h);
  const rc = RARITY[it.rarity].color;
  const cc = CAT_COLOR[it.cat];
  const hints = run && !sold ? offerHints(it.id, run.stacks, run.save, run.board) : [];
  ctx.fillStyle = 'rgba(20,2,15,0.95)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = sold ? PAL.dim : rc;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  // A resonating item gets a pulsing magenta inner frame.
  if (hints.length) {
    ctx.strokeStyle = PAL.magenta;
    ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 180) * 0.25;
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    ctx.globalAlpha = 1;
  }
  // icon
  ctx.strokeStyle = cc;
  ctx.strokeRect(x + 10, y + 10, 40, 40);
  text(it.code, x + 30, y + 30, { color: cc, size: 12, align: 'center' });
  text(it.name, x + 60, y + 18, { color: sold ? PAL.dim : rc, size: 14 });
  text(`${RARITY[it.rarity].name} · ${it.cat === 'mode' ? 'SHOT' : it.cat.toUpperCase()}`, x + 60, y + 34, { color: PAL.mute, size: 8 });
  // Stat arrows, computed by actually applying the item to this build.
  if (run && !sold) {
    let sx = x + w - 10;
    for (const d of statDelta(run.board, run.stacks, it.id).reverse()) {
      const label = `${d.label}${d.dir > 0 ? '▲' : '▼'}`;
      text(label, sx, y + 34, { color: d.dir > 0 ? PAL.acid : PAL.red, size: 8, align: 'right' });
      sx -= label.length * 5.4 + 6;
    }
  }
  const lines = wrap(it.desc, Math.floor((w - 70) / 5.6));
  const maxLines = hints.length ? 2 : 3;
  lines.slice(0, maxLines).forEach((l, i) => text(l, x + 60, y + 50 + i * 12, { color: PAL.white, size: 9, weight: 'normal', alpha: sold ? 0.4 : 0.9 }));
  if (price !== null) {
    text(sold ? 'SOLD' : price === 0 ? 'FREE' : `¤${price}`, x + w - 10, y + 18, { color: sold ? PAL.dim : afford ? PAL.acid : PAL.red, size: 14, align: 'right' });
  }
  // Combo hint: vague until discovered, explicit afterwards.
  if (hints.length) {
    const known = hints.find((h) => h.known);
    const msg = known
      ? `⟡ ${known.combo.name}: ${known.combo.desc}`
      : `⟡ RESONATES WITH ${hints.map((h) => h.partner.name).slice(0, 2).join(' + ')}`;
    const ml = wrap(msg, Math.floor((w - 70) / 4.9));
    ml.slice(0, 2).forEach((l, i) => text(l, x + 60, y + h - 22 + i * 10, { color: PAL.magenta, size: 8, alpha: known ? 1 : 0.75 + Math.sin(performance.now() / 180) * 0.25 }));
  }
}

// ---------------------------------------------------------------------------
// Logo (direction B: neon script over a chrome block, orange horizon)
// ---------------------------------------------------------------------------
function drawLogo(t) {
  const gl = Math.random() < 0.03 ? (Math.random() - 0.5) * 6 : 0;
  // horizon band
  ctx.fillStyle = 'rgba(29,6,25,0.9)';
  ctx.fillRect(0, 70, W, 110);
  ctx.save();
  ctx.shadowColor = PAL.orange; ctx.shadowBlur = 12;
  ctx.fillStyle = PAL.orange; ctx.fillRect(0, 179, W, 2);
  ctx.restore();
  // OVERDRIFT: chrome block, skewed, stacked shadows
  ctx.save();
  ctx.translate(W / 2 + gl, 196);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  ctx.font = '46px "Russo One", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#2a1640'; ctx.fillText('OVERDRIFT', 0, 6);
  ctx.fillStyle = '#6a4a88'; ctx.fillText('OVERDRIFT', 0, 3);
  const g = ctx.createLinearGradient(0, -22, 0, 22);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.48, '#cfc6dc'); g.addColorStop(0.52, '#8a7aa0'); g.addColorStop(1, '#e9e4f2');
  ctx.fillStyle = g; ctx.fillText('OVERDRIFT', 0, 0);
  ctx.restore();
  // Neon: script, tilted, glowing, flickers now and then
  const flick = Math.random() < 0.02 ? 0.35 : 1;
  ctx.save();
  ctx.translate(W / 2 - 58, 138);
  ctx.rotate(-0.14);
  ctx.font = '72px Yellowtail, cursive';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = flick;
  ctx.shadowColor = PAL.magenta; ctx.shadowBlur = 26;
  ctx.fillStyle = PAL.magenta; ctx.fillText('Neon', 0, 0);
  ctx.shadowBlur = 6; ctx.shadowColor = '#ffffff';
  ctx.fillStyle = '#ffd0f4'; ctx.fillText('Neon', 0, 0);
  ctx.restore();
  // tagline
  text('RUN · SHOOT · MUTATE', W / 2, 228, { color: PAL.cyan, size: 9, align: 'center' });
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export function drawMenu(save, t, boardIdx) {
  dim(0.55);
  drawLogo(t);

  // Board selector
  const b = BOARDS[boardIdx];
  const unlocked = unlockedBoards(save).includes(b.id);
  button('boardPrev', 16, 238, 44, 96, '◄', { color: PAL.white, size: 18 });
  button('boardNext', W - 60, 238, 44, 96, '►', { color: PAL.white, size: 18 });
  ctx.strokeStyle = unlocked ? b.color : PAL.dim;
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 238, W - 132, 96);
  ctx.fillStyle = 'rgba(10,0,8,0.85)';
  ctx.fillRect(66, 238, W - 132, 96);
  drawSprite(shipSprite(b.id, unlocked ? b.color : PAL.mute), 100, 288, { sx: 0.95, sy: 0.95, alpha: unlocked ? 1 : 0.45 });
  text('SHIP', 136, 250, { color: PAL.mute, size: 8 });
  text(unlocked ? b.name : `${b.name} [LOCKED]`, 136, 266, { color: unlocked ? b.color : PAL.mute, size: 15 });
  const ach = ACHIEVEMENTS.find((a) => a.id === b.unlock);
  const desc = unlocked ? b.desc : `Unlock: ${ach ? ach.desc : '?'}`;
  wrap(desc, 25).slice(0, 4).forEach((l, i) => text(l, 136, 284 + i * 11, { color: PAL.white, size: 8, weight: 'normal', alpha: unlocked ? 0.9 : 0.7 }));

  button('run', 60, 348, W - 120, 46, 'RUN', { color: PAL.cyan, size: 20, disabled: !unlocked });
  const dBest = save.daily.date === todayKey() ? save.daily.best : 0;
  button('daily', 60, 402, W - 120, 40, 'DAILY RUN', { color: PAL.magenta, size: 13,
    sub: dBest ? `same seed for everyone · today ${dBest}m` : 'same seed for everyone today' });
  button('archive', 60, 450, W - 120, 34, 'ARCHIVE', { color: PAL.acid, size: 13 });

  const nUnl = unlockedItems(save).length;
  text(`${nUnl}/${ITEMS.length} ITEMS · ${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length} GOALS`, W / 2, 494, { color: PAL.mute, size: 8, align: 'center' });

  const bw = (W - 136) / 3;
  const st = save.settings;
  button('sfx', 60, 506, bw, 30, `SFX ${st.sfx ? 'ON' : 'OFF'}`, { color: st.sfx ? PAL.white : PAL.dim, size: 10 });
  button('music', 68 + bw, 506, bw, 30, `MUSIC ${st.music ? 'ON' : 'OFF'}`, { color: st.music ? PAL.white : PAL.dim, size: 10 });
  button('haptics', 76 + bw * 2, 506, bw, 30, `BUZZ ${st.haptics ? 'ON' : 'OFF'}`, { color: st.haptics ? PAL.white : PAL.dim, size: 10 });

  text('SWIPE ◄ ► LANE · ▲ JUMP · ▼ PHASE / FAST FALL', W / 2, 556, { color: PAL.mute, size: 8, align: 'center' });
  if (save.best > 0) text(`BEST ${save.best}m`, W / 2, 582, { color: PAL.acid, size: 12, align: 'center' });
  text(VERSION, W / 2, H - 14, { color: PAL.dim, size: 8, align: 'center' });
}

// ---------------------------------------------------------------------------
// Archive: items and goals
// ---------------------------------------------------------------------------
export function drawArchive(save, tab, selected, page = 0) {
  dim(1);
  button('tabItems', 6, 10, 84, 34, 'ITEMS', { color: tab === 'items' ? PAL.cyan : PAL.dim, size: 11 });
  button('tabCombos', 94, 10, 84, 34, 'COMBOS', { color: tab === 'combos' ? PAL.magenta : PAL.dim, size: 11 });
  button('tabGoals', 182, 10, 84, 34, 'GOALS', { color: tab === 'goals' ? PAL.acid : PAL.dim, size: 11 });
  button('back', 270, 10, 84, 34, 'BACK', { color: PAL.white, size: 11 });
  if (tab === 'combos') {
    const known = COMBOS.filter((c) => save.combos && save.combos[c.id]);
    text(`DISCOVERED ${known.length}/${COMBOS.length}`, W / 2, 62, { color: PAL.magenta, size: 10, align: 'center' });
    if (!known.length) {
      wrap('Hold two items that work together to discover a combo. Items that resonate with your build glow magenta when offered.', 46)
        .forEach((l, i) => text(l, W / 2, 110 + i * 14, { color: PAL.mute, size: 9, align: 'center', weight: 'normal' }));
      return;
    }
    const per = 12;
    const pages = Math.ceil(known.length / per);
    const pg = Math.min(page, pages - 1);
    known.slice(pg * per, pg * per + per).forEach((c, i) => {
      const y = 86 + i * 40;
      text(c.name, 14, y, { color: PAL.magenta, size: 11 });
      text(`${ITEM_BY_ID[c.a].name} + ${ITEM_BY_ID[c.b].name}`, W - 14, y, { color: PAL.mute, size: 8, align: 'right' });
      text(c.desc, 14, y + 14, { color: PAL.white, size: 8, weight: 'normal' });
    });
    if (pages > 1) {
      button('comboPrev', 14, H - 46, 70, 32, '◄', { color: PAL.white, size: 14, disabled: pg === 0 });
      text(`${pg + 1}/${pages}`, W / 2, H - 30, { color: PAL.mute, size: 10, align: 'center' });
      button('comboNext', W - 84, H - 46, 70, 32, '►', { color: PAL.white, size: 14, disabled: pg >= pages - 1 });
    }
    return;
  }

  const unl = unlockedItems(save);
  if (tab === 'items') {
    const cols = 4, cw = 82, ch = 31, gx = 6;
    const x0 = (W - (cols * cw + (cols - 1) * gx)) / 2;
    ITEMS.forEach((it, i) => {
      const cx = x0 + (i % cols) * (cw + gx);
      const cy = 54 + Math.floor(i / cols) * (ch + 4);
      const known = unl.includes(it.id);
      const seen = save.discovered.includes(it.id);
      area(`item:${it.id}`, cx, cy, cw, ch);
      ctx.strokeStyle = selected === it.id ? PAL.white : known ? CAT_COLOR[it.cat] : PAL.dim;
      ctx.lineWidth = selected === it.id ? 2.5 : 1.5;
      ctx.strokeRect(cx, cy, cw, ch);
      text(known ? it.code : '???', cx + cw / 2, cy + 10, { color: known ? CAT_COLOR[it.cat] : PAL.dim, size: 11, align: 'center' });
      text(known ? it.name : 'LOCKED', cx + cw / 2, cy + 23, { color: known ? PAL.white : PAL.dim, size: 7, align: 'center', alpha: seen ? 1 : 0.6 });
    });
    const it = ITEM_BY_ID[selected];
    const py = 54 + Math.ceil(ITEMS.length / cols) * (ch + 4) + 6;
    ctx.strokeStyle = PAL.dim;
    ctx.strokeRect(12, py, W - 24, H - py - 44);
    if (it) {
      const known = unl.includes(it.id);
      text(known ? it.name : '???', 22, py + 16, { color: known ? RARITY[it.rarity].color : PAL.dim, size: 14 });
      if (known) {
        wrap(it.desc, 52).forEach((l, i) => text(l, 22, py + 36 + i * 12, { color: PAL.white, size: 9, weight: 'normal' }));
        const mine = COMBOS.filter((c) => c.a === it.id || c.b === it.id);
        const known = mine.filter((c) => save.combos && save.combos[c.id]);
        const names = known.map((c) => `${c.name} (+${ITEM_BY_ID[c.a === it.id ? c.b : c.a].code})`).join(', ');
        const hidden = mine.length - known.length;
        const line2 = `${names}${names && hidden ? ' · ' : ''}${hidden ? `${hidden} undiscovered` : ''}`;
        if (line2) wrap(`COMBOS: ${line2}`, 52).slice(0, 2).forEach((l, i) => text(l, 22, py + 76 + i * 11, { color: PAL.magenta, size: 8 }));
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
  run.pickChoices.forEach((it, i) => itemCard(`pick:${i}`, 20, 112 + i * 120, W - 40, 108, it, { run }));
  button('skip', 80, 486, W - 160, 40, 'SKIP', { color: PAL.mute, size: 12, sub: `+${SKIP_COINS} coins` });
}

export function drawShop(run) {
  dim(0.86);
  text('BLACK MARKET', W / 2, 36, { color: PAL.acid, size: 22, align: 'center' });
  text(`¤${run.coins}`, W / 2, 60, { color: PAL.acid, size: 14, align: 'center' });
  const p = run.player;
  let y = 76;
  run.shopSlots.forEach((s, i) => {
    if (s.kind !== 'item') return;
    itemCard(`buy:${i}`, 16, y, W - 32, 92, ITEM_BY_ID[s.id], { price: s.price, sold: s.sold, afford: run.coins >= s.price, run });
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
  dim(0.88);
  text('PAUSED', W / 2, 70, { color: PAL.cyan, size: 28, align: 'center' });
  button('resume', 60, 100, W - 120, 46, 'RESUME', { color: PAL.cyan, size: 18 });
  button('quit', 60, 154, W - 120, 34, 'QUIT RUN', { color: PAL.red, size: 12 });

  // Stats
  const st = run.stats;
  text('STATS', 20, 210, { color: PAL.mute, size: 10 });
  STAT_DEFS.forEach((d, i) => {
    const x = 20 + (i % 3) * 110, y = 228 + Math.floor(i / 3) * 18;
    text(d.label, x, y, { color: PAL.mute, size: 9 });
    text(d.fmt(d.get(st)), x + 44, y, { color: PAL.white, size: 11 });
  });
  text(`SHOT: ${st.carrier.toUpperCase()}${st.hasScatter ? ' · FAN' : ''}${st.hasSine ? ' · WAVE' : ''}${st.hasRocket && st.carrier !== 'rocket' ? ' · BLAST' : ''}`, 20, 270, { color: PAL.cyan, size: 9 });

  text('BUILD', 20, 296, { color: PAL.mute, size: 10 });
  let y = 312;
  let col = 0;
  for (const id in run.stacks) {
    const it = ITEM_BY_ID[id];
    const n = run.stacks[id];
    const x = 20 + col * 165;
    text(it.code, x, y, { color: CAT_COLOR[it.cat], size: 9 });
    text(`${it.name}${n > 1 ? ' x' + n : ''}`, x + 32, y, { color: PAL.white, size: 9 });
    col = (col + 1) % 2;
    if (col === 0) y += 14;
    if (y > 470) break;
  }
  const combos = activeCombos(run.stacks, run.stats);
  if (combos.length) {
    text('COMBOS', 20, 496, { color: PAL.magenta, size: 10 });
    combos.slice(0, 6).forEach((c, i) => text(`${c.name}: ${c.desc}`, 20, 512 + i * 13, { color: PAL.white, size: 8, weight: 'normal' }));
  }
}

export function drawDead(run) {
  dim(0.8);
  const jitter = run.deadT < 0.5 ? (Math.random() - 0.5) * 6 : 0;
  text('SIGNAL LOST', W / 2 + jitter, 110, { color: PAL.red, size: 32, align: 'center' });
  text(`${Math.floor(run.distance)}m`, W / 2, 158, { color: PAL.cyan, size: 30, align: 'center' });
  if (run.daily) text(`DAILY ${run.dailyKey}${run.newDailyBest ? ' · NEW DAILY BEST' : ''}`, W / 2, 134, { color: PAL.magenta, size: 9, align: 'center' });
  if (run.newBest) text('NEW BEST', W / 2, 186, { color: PAL.acid, size: 12, align: 'center', alpha: 0.6 + Math.sin(run.deadT * 6) * 0.4 });
  const rs = run.rs;
  text(`KILLS ${rs.kills}   BOSSES ${rs.bosses}   ¤${rs.coins}`, W / 2, 212, { color: PAL.white, size: 11, align: 'center' });
  text(`BEST ${run.save.best}m`, W / 2, 230, { color: PAL.mute, size: 10, align: 'center' });
  if (run.newUnlocks.length) {
    text('UNLOCKED', W / 2, 264, { color: PAL.acid, size: 12, align: 'center' });
    [...new Set(run.newUnlocks)].slice(0, 6).forEach((n, i) => text(n, W / 2, 284 + i * 16, { color: PAL.magenta, size: 11, align: 'center' }));
  }
  if (run.deadT > 0.8) {
    button('retry', 60, 420, W - 120, 50, run.daily ? 'RETRY DAILY' : 'RETRY', { color: PAL.cyan, size: 18 });
    const hw = (W - 128) / 2;
    button('menu', 60, 482, hw, 40, 'MENU', { color: PAL.white, size: 13 });
    button('share', 68 + hw, 482, hw, 40, run.shareMsg || 'SHARE', { color: PAL.magenta, size: 13 });
  }
}

export { heart };
