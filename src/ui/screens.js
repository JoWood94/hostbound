// Menu, archive and in-run overlays. Drawing registers buttons (see core/ui.js);
// main.js maps the returned button ids to actions.
import { ctx, W, H, UI_OFFSET } from '../core/canvas.js';

// Screens are laid out for a 640-tall canvas and centred with UI_OFFSET.
const LH = 640;
import { PAL } from '../render/palette.js';
import { text, line, strokePoly, FONT_BODY } from '../render/draw.js';
import { button, area, wrap } from '../core/ui.js';
import { ITEMS, ITEM_BY_ID, RARITY, CAT_COLOR, SYNERGIES, STAT_DEFS, statDelta } from '../game/items.js';
import { BOARDS } from '../game/boards.js';
import { laneX, LANE_W } from '../game/world.js';
import { ACHIEVEMENTS, rewardOf, unlockedItems, unlockedBoards } from '../game/achievements.js';
import { heart } from './hud.js';
import { shipSprite, drawSprite } from '../render/sprites.js';
import { sheet, drawCell } from '../render/images.js';
const MENU_SYM = sheet('symbiote_neon', 128);
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
// Logo: Japanese neon sign. HOST in a cyan tube, BOUND in a pink tube (Train One
// draws its letters as double tubes), the katakana reading underneath, a faint
// RGB split and scanlines. Each word flickers on its own now and then, like
// real signage. Baked once per word when the font has loaded.
// ---------------------------------------------------------------------------
const LOGO_FONT = '"Train One", "Russo One", sans-serif';
const LOGO_W = 360, LOGO_H = 110, LOGO_CY = 44;          // bake canvas, logical px
const LOGO_PARTS = [
  { word: 'HOST', col: '#19f0ff', core: '#d8ffff' },
  { word: 'BOUND', col: '#ff2bd6', core: '#ffe0f8' },
];
const LOGO_KANA = 'ホストバウンド';
let logoBake = null;
const logoFlick = [0, 0];

// One canvas per word (so they can flicker separately) plus one for the kana.
function bakeLogo(k) {
  const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(LOGO_W * k); c.height = Math.round(LOGO_H * k); const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); return [c, x]; };
  const size = 42;
  const [, m] = mk();
  m.font = `${size}px ${LOGO_FONT}`;
  const ws = LOGO_PARTS.map((p) => m.measureText(p.word).width);
  const gap = 6, total = ws[0] + ws[1] + gap;
  const xs = [LOGO_W / 2 - total / 2, LOGO_W / 2 - total / 2 + ws[0] + gap];
  const tube = (x, txt, px, py, col, core) => {
    x.textAlign = 'left'; x.textBaseline = 'middle';
    x.shadowColor = col; x.shadowBlur = 10; x.fillStyle = col; x.fillText(txt, px, py);
    x.shadowBlur = 3; x.shadowColor = core; x.fillStyle = core; x.globalAlpha = 0.85; x.fillText(txt, px, py);
    x.globalAlpha = 1; x.shadowBlur = 0;
    // faint RGB split on the glass
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.25;
    x.fillStyle = '#ff2050'; x.fillText(txt, px + 1.5, py);
    x.fillStyle = '#2050ff'; x.fillText(txt, px - 1.5, py);
    x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
  };
  const words = LOGO_PARTS.map((p, i) => {
    const [c, x] = mk();
    x.font = `${size}px ${LOGO_FONT}`;
    tube(x, p.word, xs[i], LOGO_CY, p.col, p.core);
    x.globalCompositeOperation = 'destination-out'; x.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < LOGO_H; y += 3) x.fillRect(0, y, LOGO_W, 1);
    return c;
  });
  const [kc, kx] = mk();
  kx.font = `13px ${LOGO_FONT}`;
  const kw = kx.measureText(LOGO_KANA).width;
  // kana sign: small pink tube, letter-spaced under BOUND's right edge
  const spacing = 3;
  let px = xs[1] + ws[1] - (kw + spacing * (LOGO_KANA.length - 1));
  for (const ch of LOGO_KANA) { tube(kx, ch, px, LOGO_CY + 33, '#ff2bd6', '#ffe0f8'); px += kx.measureText(ch).width + spacing; }
  return { words, kana: kc, k };
}

function drawLogo(t) {
  const CY = 150;
  // Cosmic current behind the sign.
  ctx.save();
  for (const [col, amp, fr, sp, a] of [[PAL.cyan, 3, 0.045, 1.2, 0.45], [PAL.violet, 4.5, 0.03, -0.8, 0.4]]) {
    ctx.strokeStyle = col; ctx.globalAlpha = a; ctx.lineWidth = 1.5;
    ctx.shadowColor = col; ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 6) {
      const y = CY + 24 + Math.sin(x * fr + t * sp) * amp + Math.sin(x * fr * 2.3 - t * sp * 0.7) * amp * 0.4;
      x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
  const k = ctx.getTransform().a || 1;
  const fontReady = !document.fonts || (document.fonts.check(`42px ${LOGO_FONT}`, 'HOSTBOUND') && document.fonts.check(`13px ${LOGO_FONT}`, LOGO_KANA));
  if (!logoBake || logoBake.k !== k || (!logoBake.final && fontReady)) {
    logoBake = bakeLogo(k);
    logoBake.final = fontReady;
  }
  const ox = W / 2 - LOGO_W / 2, oy = CY - LOGO_CY;
  // Flicker: now and then a word stutters off for a few frames.
  for (let i = 0; i < 2; i++) {
    if (logoFlick[i] > 0) logoFlick[i]--;
    else if (Math.random() < 0.004) logoFlick[i] = 3 + Math.floor(Math.random() * 6);
  }
  ctx.save();
  logoBake.words.forEach((c, i) => {
    const off = logoFlick[i] > 0 && logoFlick[i] % 2 === 0;
    ctx.globalAlpha = off ? 0.25 : 0.94 + Math.sin(t * 3 + i * 2) * 0.06;
    ctx.shadowColor = LOGO_PARTS[i].col; ctx.shadowBlur = off ? 0 : 18;
    ctx.drawImage(c, ox, oy, LOGO_W, LOGO_H);
  });
  ctx.globalAlpha = 0.9; ctx.shadowColor = PAL.magenta; ctx.shadowBlur = 8;
  ctx.drawImage(logoBake.kana, ox, oy, LOGO_W, LOGO_H);
  ctx.restore();
  // Tagline: angular racing type with a VHS look (RGB split, a tracking band,
  // and now and then a torn slice shifted sideways).
  ctx.save();
  ctx.translate(W / 2, 214);
  ctx.rotate(-0.05);
  ctx.font = '16px "Racing Sans One", Impact, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tag = 'RUN · SHOOT · MUTATE';
  const jit = Math.random() < 0.06 ? (Math.random() - 0.5) * 3 : 0;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.7;
  ctx.fillStyle = '#ff2050'; ctx.fillText(tag, -1.6 + jit, 0);
  ctx.fillStyle = '#2050ff'; ctx.fillText(tag, 1.6 + jit, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.shadowColor = PAL.cyan; ctx.shadowBlur = 8;
  ctx.fillStyle = PAL.cyan; ctx.fillText(tag, jit, 0);
  ctx.shadowBlur = 0;
  // torn slice
  if (Math.random() < 0.08) {
    const sy = -8 + Math.random() * 12, sh = 2 + Math.random() * 3;
    ctx.save();
    ctx.beginPath(); ctx.rect(-W / 2, sy, W, sh); ctx.clip();
    ctx.fillStyle = 'rgba(10,0,8,1)'; ctx.fillRect(-W / 2, sy, W, sh);
    ctx.fillStyle = PAL.cyan; ctx.fillText(tag, (Math.random() - 0.5) * 10, 0);
    ctx.restore();
  }
  // scanlines and a slow bright tracking band
  ctx.fillStyle = 'rgba(10,0,8,0.35)';
  for (let y = -9; y < 10; y += 2) ctx.fillRect(-90, y, 180, 1);
  const by = -10 + ((t * 9) % 20);
  ctx.fillStyle = 'rgba(200,255,255,0.12)'; ctx.fillRect(-90, by, 180, 2);
  ctx.restore();
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
  // The protagonist, big and free-floating (generated art; procedural fallback until the sheet loads).
  const bob = Math.sin(t * 2) * 3;
  if (!drawCell(MENU_SYM, 0, Math.floor(t * 10) % 8, W / 2, 292 + bob, 104, { alpha: unlocked ? 1 : 0.4 })) {
    drawSprite(shipSprite(b.id, unlocked ? b.color : PAL.mute), W / 2, 292, { sx: 1.4, sy: 1.4, alpha: unlocked ? 1 : 0.45 });
  }

  button('run', 60, 348, W - 120, 46, 'RUN', { color: PAL.cyan, size: 20, disabled: !unlocked });
  const dBest = save.daily.date === todayKey() ? save.daily.best : 0;
  button('daily', 60, 402, W - 120, 40, 'DAILY RUN', { color: PAL.magenta, size: 13,
    sub: dBest ? `same seed for everyone · today ${dBest}m` : 'same seed for everyone today' });
  const hb = (W - 128) / 2;
  button('archive', 60, 450, hb, 34, 'ARCHIVE', { color: PAL.acid, size: 13 });
  button('tutorial', 68 + hb, 450, hb, 34, 'TUTORIAL', { color: PAL.white, size: 13 });

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
// Archive pages: the lists outgrew one screen.
const ITEM_COLS = 4, ITEM_ROWS = 12, ITEMS_PER = ITEM_COLS * ITEM_ROWS, GOALS_PER = 17, COMBOS_PER = 12;
export function archivePages(save, tab) {
  if (tab === 'items') return Math.ceil(ITEMS.length / ITEMS_PER);
  if (tab === 'goals') return Math.ceil(ACHIEVEMENTS.length / GOALS_PER);
  return Math.max(1, Math.ceil(COMBOS.filter((c) => save.combos && save.combos[c.id]).length / COMBOS_PER));
}

// ◄ 1/3 ► along the bottom, with an optional caption under the page number.
function pager(pg, pages, caption = '') {
  if (pages > 1) {
    button('pagePrev', 14, LH - 46, 70, 32, '◄', { color: PAL.white, size: 14, disabled: pg === 0 });
    button('pageNext', W - 84, LH - 46, 70, 32, '►', { color: PAL.white, size: 14, disabled: pg >= pages - 1 });
    text(`${pg + 1}/${pages}`, W / 2, LH - (caption ? 38 : 30), { color: PAL.white, size: 11, align: 'center' });
  }
  if (caption) text(caption, W / 2, LH - (pages > 1 ? 22 : 24), { color: PAL.mute, size: 9, align: 'center' });
}

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
    const per = COMBOS_PER;
    const pages = archivePages(save, tab);
    const pg = Math.min(page, pages - 1);
    known.slice(pg * per, pg * per + per).forEach((c, i) => {
      const y = 86 + i * 40;
      text(c.name, 14, y, { color: c.evo ? PAL.acid : PAL.magenta, size: 11 });
      text(`${c.evo ? 'MAX ' : ''}${ITEM_BY_ID[c.a].name} + ${ITEM_BY_ID[c.b].name}`, W - 14, y, { color: c.evo ? PAL.acid : PAL.mute, size: 8, align: 'right' });
      text(c.desc, 14, y + 14, { color: PAL.white, size: 8, weight: 'normal' });
    });
    pager(pg, pages);
    return;
  }

  const unl = unlockedItems(save);
  if (tab === 'items') {
    const cols = ITEM_COLS, cw = 82, ch = 31, gx = 6;
    const x0 = (W - (cols * cw + (cols - 1) * gx)) / 2;
    const pages = archivePages(save, tab);
    const pg = Math.min(page, pages - 1);
    ITEMS.slice(pg * ITEMS_PER, (pg + 1) * ITEMS_PER).forEach((it, i) => {
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
    const py = 54 + ITEM_ROWS * (ch + 4) + 2;
    ctx.strokeStyle = PAL.dim;
    ctx.strokeRect(12, py, W - 24, LH - py - 54);
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
        if (line2) wrap(`COMBOS: ${line2}`, 52).slice(0, 2).forEach((l, i) => text(l, 22, py + 74 + i * 11, { color: PAL.magenta, size: 8 }));
      } else {
        const a = ACHIEVEMENTS.find((x) => x.id === it.unlock);
        text(`Unlock: ${a ? a.desc : '?'}`, 22, py + 36, { color: PAL.white, size: 9, weight: 'normal' });
        text('Or find it corrupted in a run and beat the next boss.', 22, py + 50, { color: PAL.mute, size: 8, weight: 'normal' });
      }
    } else {
      text('Tap an item for details', W / 2, py + 40, { color: PAL.mute, size: 10, align: 'center' });
    }
    pager(pg, pages, `DISCOVERED ${save.discovered.filter((id) => ITEM_BY_ID[id]).length}/${ITEMS.length}`);
  } else {
    const pages = archivePages(save, tab);
    const pg = Math.min(page, pages - 1);
    let y = 64;
    for (const a of ACHIEVEMENTS.slice(pg * GOALS_PER, (pg + 1) * GOALS_PER)) {
      const done = !!save.achievements[a.id];
      const [cur, target] = a.progress(save, null);
      const rw = rewardOf(a.id);
      const col = done ? PAL.acid : PAL.white;
      text(done ? '■' : '□', 14, y, { color: col, size: 10 });
      text(a.name, 28, y - 3, { color: col, size: 10 });
      text(a.desc, 28, y + 8, { color: PAL.mute, size: 7, weight: 'normal' });
      text(done ? 'DONE' : a.runOnly ? 'IN ONE RUN' : `${Math.min(Math.floor(cur), target)}/${target}`, W - 12, y - 3, { color: done ? PAL.acid : PAL.cyan, size: 9, align: 'right' });
      if (rw) text(`+ ${rw.name}`, W - 12, y + 8, { color: rw.kind === 'board' ? PAL.orange : PAL.magenta, size: 7, align: 'right' });
      y += 30;
    }
    pager(pg, pages, `${ACHIEVEMENTS.filter((a) => save.achievements[a.id]).length}/${ACHIEVEMENTS.length} DONE`);
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
  if (run.tutorial) {
    const hw = (W - 128) / 2;
    button('skipTutorial', 60, 154, hw, 34, 'TUTORIAL', { color: PAL.white, size: 11, sub: 'skip it' });
    button('quit', 68 + hw, 154, hw, 34, 'QUIT RUN', { color: PAL.red, size: 12 });
  } else button('quit', 60, 154, W - 120, 34, 'QUIT RUN', { color: PAL.red, size: 12 });

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
  text('CONSUMED', W / 2 + jitter, 110, { color: PAL.red, size: 32, align: 'center' });
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
