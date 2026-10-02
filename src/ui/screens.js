// Menu, archive and in-run overlays. Drawing registers buttons (see core/ui.js);
// main.js maps the returned button ids to actions.
import { ctx, W, H, UI_OFFSET } from '../core/canvas.js';

// Screens are laid out for a 640-tall canvas and centred with UI_OFFSET.
const LH = 640;
import { PAL } from '../render/palette.js';
import { text, line, strokePoly, ring, FONT_BODY } from '../render/draw.js';
import { button, area, wrap } from '../core/ui.js';
import { ITEMS, ITEM_BY_ID, RARITY, CAT_COLOR, SYNERGIES, STAT_DEFS, statDelta } from '../game/items.js';
import { BOARDS } from '../game/boards.js';
import { laneX, LANE_W } from '../game/world.js';
import { ACHIEVEMENTS, rewardOf, unlockedItems, unlockedBoards } from '../game/achievements.js';
import { heart } from './hud.js';
import { shipSprite, drawSprite } from '../render/sprites.js';
import { sheet, drawCell } from '../render/images.js';
const MENU_SYM = sheet('symbiote', 128);
import { todayKey } from '../game/run.js';
import { COMBOS, offerHints, activeCombos } from '../game/combos.js';
import { version } from '../../package.json';

// Shown on the menu; single source of truth is package.json.
const VERSION = `v${version}`;

function dim(a = 0.78) {
  ctx.fillStyle = `rgba(10,0,8,${a})`;
  ctx.fillRect(0, -UI_OFFSET, W, H);   // screens are drawn shifted by UI_OFFSET: cover the whole canvas
}

// Wrap by measured width (the body font is not monospaced).
function wrapPx(str, maxW, size) {
  ctx.font = `normal ${Math.round(size * 1.08)}px ${FONT_BODY}`;
  const lines = [];
  let cur = '';
  for (const w of str.split(' ')) {
    const next = cur ? `${cur} ${w}` : w;
    if (cur && ctx.measureText(next).width > maxW) { lines.push(cur); cur = w; }
    else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Card text sizes: `fs` is the description size, the rest scale with it.
function cardLayout(it, w, run, fs, compact = false) {
  const hints = run ? offerHints(it.id, run.stacks, run.save, run.board) : [];
  const tw = w - 78;
  const desc = wrapPx(it.desc, tw, fs);
  let hint = [];
  let known = null;
  if (hints.length) {
    const evo = hints.find((h) => h.evo);
    known = evo ? (evo.known ? evo : null) : hints.find((h) => h.known);
    const msg = evo
      ? (known ? `⟡ EVOLVES: ${known.combo.name}: ${known.combo.desc}` : `⟡ EVOLVES WITH ${evo.partner.name}`)
      : known
        ? `⟡ ${known.combo.name}: ${known.combo.desc}`
        : `⟡ RESONATES WITH ${hints.map((h) => h.partner.name).slice(0, 2).join(' + ')}`;
    hint = wrapPx(msg, tw, fs - 1);
  }
  const lh = Math.round(fs * 1.35), hlh = Math.round((fs - 1) * 1.3);
  const hd = compact ? 44 : 56;
  const body = hd + desc.length * lh + (hint.length ? 4 + hint.length * hlh : 0);
  return { hints, desc, hint, known, fs, lh, hlh, hd, compact, h: Math.max(compact ? 64 : 76, body + 10) };
}

function itemCard(id, x, y, w, it, L, { run = null, selected = false } = {}) {
  const { hints, desc, hint, known, fs, lh, hlh, hd, compact, h } = L;
  const ic = compact ? 34 : 44, ny = compact ? 16 : 20, my = compact ? 33 : 40;
  area(id, x, y, w, h);
  const rc = RARITY[it.rarity].color;
  const cc = CAT_COLOR[it.cat];
  ctx.fillStyle = selected ? 'rgba(40,6,32,0.98)' : 'rgba(20,2,15,0.95)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = selected ? PAL.white : rc;
  ctx.lineWidth = selected ? 3 : 2;
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
  ctx.strokeRect(x + 10, y + 10, ic, ic);
  text(it.code, x + 10 + ic / 2, y + 10 + ic / 2, { color: cc, size: compact ? 11 : 13, align: 'center' });
  text(it.name, x + 64, y + ny, { color: rc, size: compact ? 15 : 17 });
  text(`${RARITY[it.rarity].name} · ${it.cat === 'mode' ? 'SHOT' : it.cat.toUpperCase()}`, x + 64, y + my, { color: PAL.mute, size: 10 });
  // Stat arrows, computed by actually applying the item to this build.
  if (run) {
    let sx = x + w - 10;
    for (const d of statDelta(run.board, run.stacks, it.id).reverse()) {
      const label = `${d.label}${d.dir > 0 ? '▲' : '▼'}`;
      text(label, sx, y + my, { color: d.dir > 0 ? PAL.acid : PAL.red, size: 10, align: 'right' });
      sx -= ctx.measureText(label).width + 8;
    }
  }
  const ty = y + hd + 2 + lh / 2;
  desc.forEach((l, i) => text(l, x + 64, ty + i * lh, { color: PAL.white, size: fs, weight: 'normal', alpha: 0.92 }));
  // Combo hint: vague until discovered, explicit afterwards.
  const hy = ty + desc.length * lh + 4 + (hlh - lh) / 2;
  hint.forEach((l, i) => text(l, x + 64, hy + i * hlh, { color: PAL.magenta, size: fs - 1, alpha: known ? 1 : 0.75 + Math.sin(performance.now() / 180) * 0.25 }));
}

// ---------------------------------------------------------------------------
// Logo (direction B: neon script over a chrome block, orange horizon)
// ---------------------------------------------------------------------------
function drawLogo(t) {
  const gl = Math.random() < 0.03 ? (Math.random() - 0.5) * 6 : 0;
  // horizon line only (no band behind the script)
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
  if (BOARDS.length > 1) {
    button('boardPrev', 16, 238, 44, 96, '◄', { color: PAL.white, size: 18 });
    button('boardNext', W - 60, 238, 44, 96, '►', { color: PAL.white, size: 18 });
  }
  ctx.strokeStyle = unlocked ? b.color : PAL.dim;
  ctx.lineWidth = 2;
  ctx.strokeRect(66, 238, W - 132, 96);
  ctx.fillStyle = 'rgba(10,0,8,0.85)';
  ctx.fillRect(66, 238, W - 132, 96);
  // The symbiote (generated art); the procedural ship until the sheet loads.
  ring(100, 288, 26, unlocked ? b.color : PAL.mute, 1.5, 0.5);
  if (!drawCell(MENU_SYM, 0, Math.floor(t * 10) % 8, 100, 288, 58, { alpha: unlocked ? 1 : 0.4 })) {
    drawSprite(shipSprite(b.id, unlocked ? b.color : PAL.mute), 100, 288, { sx: 0.95, sy: 0.95, alpha: unlocked ? 1 : 0.45 });
  }
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

  const bw = (W - 128) / 2;
  const st = save.settings;
  button('sfx', 60, 506, bw, 30, `SFX ${st.sfx ? 'ON' : 'OFF'}`, { color: st.sfx ? PAL.white : PAL.dim, size: 10 });
  button('music', 68 + bw, 506, bw, 30, `MUSIC ${st.music ? 'ON' : 'OFF'}`, { color: st.music ? PAL.white : PAL.dim, size: 10 });

  text('SWIPE OR TAP ◄ ► LANE · ▲ JUMP · ▼ PHASE', W / 2, 556, { color: PAL.mute, size: 8, align: 'center' });
  if (save.best > 0) text(`BEST ${save.best}m`, W / 2, 582, { color: PAL.acid, size: 12, align: 'center' });
  text(VERSION, W / 2, LH - 14, { color: PAL.dim, size: 8, align: 'center' });
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
      text(c.name, 14, y, { color: c.evo ? PAL.acid : PAL.magenta, size: 11 });
      text(`${c.evo ? 'MAX ' : ''}${ITEM_BY_ID[c.a].name} + ${ITEM_BY_ID[c.b].name}`, W - 14, y, { color: c.evo ? PAL.acid : PAL.mute, size: 8, align: 'right' });
      text(c.desc, 14, y + 14, { color: PAL.white, size: 8, weight: 'normal' });
    });
    if (pages > 1) {
      button('comboPrev', 14, LH - 46, 70, 32, '◄', { color: PAL.white, size: 14, disabled: pg === 0 });
      text(`${pg + 1}/${pages}`, W / 2, LH - 30, { color: PAL.mute, size: 10, align: 'center' });
      button('comboNext', W - 84, LH - 46, 70, 32, '►', { color: PAL.white, size: 14, disabled: pg >= pages - 1 });
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
      text(known ? it.name : 'LOCKED', cx + cw / 2, cy + 23, { color: known ? PAL.white : PAL.dim, size: 9, align: 'center', alpha: seen ? 1 : 0.6, maxW: cw - 6 });
    });
    const it = ITEM_BY_ID[selected];
    const py = 54 + Math.ceil(ITEMS.length / cols) * (ch + 4) + 6;
    ctx.strokeStyle = PAL.dim;
    ctx.strokeRect(12, py, W - 24, LH - py - 44);
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
    text(`DISCOVERED ${save.discovered.length}/${ITEMS.length}`, W / 2, LH - 24, { color: PAL.mute, size: 9, align: 'center' });
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
  const lvl = run.pickKind === 'level';
  text(lvl ? `LEVEL ${run.level}` : 'BOSS DOWN', W / 2, 56, { color: lvl ? PAL.acid : PAL.magenta, size: 22, align: 'center', font: 'display' });
  text(lvl ? 'THE MASS MUTATES · CHOOSE ONE' : 'CHOOSE ONE UPGRADE', W / 2, 82, { color: PAL.white, size: 11, align: 'center' });
  const n = run.pickChoices.length;
  // Cards size to their text; shrink the type only if they would not fit.
  const top = 110, bottom = LH + UI_OFFSET - 56, cw = W - 28;
  let gap = 10, Ls;
  for (const [fs, compact] of [[12, false], [11, false], [11, true], [10, true]]) {
    Ls = run.pickChoices.map((it) => cardLayout(it, cw, run, fs, compact));
    gap = n > 3 ? 8 : 12;
    if (Ls.reduce((a, L) => a + L.h, 0) + gap * (n - 1) <= bottom - top) break;
  }
  // Cards slide in while input is locked (main.js MODAL_LOCK): the wait reads
  // as an animation, not as an unresponsive screen.
  const t = run.modalT || 0;
  let cy = top;
  run.pickChoices.forEach((it, i) => {
    const k = Math.min(1, Math.max(0, (t - i * 0.05) / 0.3));
    const off = (1 - k) * (1 - k) * 70;
    ctx.save(); ctx.globalAlpha = k;
    itemCard(`pick:${i}`, 14, cy + off, cw, it, Ls[i], { run, selected: run.pickSel === i });
    ctx.restore();
    cy += Ls[i].h + gap;
  });
  if (run.pickSel >= 0) text('TAP AGAIN TO TAKE IT', W / 2, 100, { color: PAL.acid, size: 11, align: 'center', alpha: 0.6 + Math.sin(performance.now() / 120) * 0.4 });
  else if (t > 0.45) text('TAP A CARD TO SELECT', W / 2, 100, { color: PAL.mute, size: 10, align: 'center' });
  const full = run.player.hearts >= run.stats.maxHearts;
  button('skip', 80, cy - gap + 10, W - 160, 40, 'SKIP', { color: PAL.mute, size: 12, sub: full ? 'nothing' : '+1 heart' });
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
  // Freeze frame: for 0.6 s the world stays visible with what killed you
  // circled and your lane lit, then the screen fades in.
  const k = run.lastHit;
  if (k && run.deadT < 1.4) {
    ctx.save();
    ctx.translate(0, -UI_OFFSET);                      // world coordinates
    const a = Math.min(1, 1.4 - run.deadT);
    ctx.globalAlpha = 0.18 * a; ctx.fillStyle = k.color;
    ctx.fillRect(laneX(k.lane) - LANE_W / 2, 0, LANE_W, H);
    ctx.globalAlpha = a; ctx.strokeStyle = k.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(k.x, k.y, 22 + Math.sin(run.deadT * 14) * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  dim(Math.min(0.8, Math.max(0, run.deadT - 0.6) * 1.4));
  const jitter = run.deadT < 0.5 ? (Math.random() - 0.5) * 6 : 0;
  text('SIGNAL LOST', W / 2 + jitter, 110, { color: PAL.red, size: 32, align: 'center' });
  text(`${Math.floor(run.distance)}m`, W / 2, 158, { color: PAL.cyan, size: 30, align: 'center' });
  if (run.daily) text(`DAILY ${run.dailyKey}${run.newDailyBest ? ' · NEW DAILY BEST' : ''}`, W / 2, 134, { color: PAL.magenta, size: 9, align: 'center' });
  if (run.newBest) text('NEW BEST', W / 2, 186, { color: PAL.acid, size: 12, align: 'center', alpha: 0.6 + Math.sin(run.deadT * 6) * 0.4 });
  const rs = run.rs;
  text(`KILLS ${rs.kills}   BOSSES ${rs.bosses}   LV ${run.level}`, W / 2, 212, { color: PAL.white, size: 11, align: 'center' });
  text(`BEST ${run.save.best}m`, W / 2, 230, { color: PAL.mute, size: 10, align: 'center' });
  if (k && run.deadT > 0.6) text(`KILLED BY: ${k.what}`, W / 2, 248, { color: k.color, size: 10, align: 'center' });
  if (run.newUnlocks.length) {
    text('UNLOCKED', W / 2, 272, { color: PAL.acid, size: 12, align: 'center' });
    [...new Set(run.newUnlocks)].slice(0, 6).forEach((n, i) => text(n, W / 2, 292 + i * 16, { color: PAL.magenta, size: 11, align: 'center' }));
  }
  if (run.deadT > 0.8) {
    button('retry', 60, 420, W - 120, 50, run.daily ? 'RETRY DAILY' : 'RETRY', { color: PAL.cyan, size: 18 });
    const hw = (W - 128) / 2;
    button('menu', 60, 482, hw, 40, 'MENU', { color: PAL.white, size: 13 });
    button('share', 68 + hw, 482, hw, 40, run.shareMsg || 'SHARE', { color: PAL.magenta, size: 13 });
  }
}

export { heart };
