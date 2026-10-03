// Menu, archive and in-run overlays. Drawing registers buttons (see core/ui.js);
// main.js maps the returned button ids to actions.
import { ctx, W, H, UI_OFFSET, SAFE_TOP, SAFE_BOTTOM } from '../core/canvas.js';

// Screens are laid out for a 640-tall canvas and centred with UI_OFFSET.
const LH = 640;
import { PAL } from '../render/palette.js';
import { text, line, strokePoly, FONT_BODY } from '../render/draw.js';
import { button, area, wrap, toggle, segmented, rrPath, holdButton } from '../core/ui.js';
import { drawWord, wordWidth } from './glyphs.js';
import { drawIcon } from '../render/icons.js';
import { ITEMS, ITEM_BY_ID, RARITY, SYNERGIES, STAT_DEFS, statDelta, computeStats } from '../game/items.js';
import { BOARDS } from '../game/boards.js';
import { laneX, LANE_W } from '../game/world.js';
import { PLAYER_Y, symRadius } from '../game/player.js';
import { ACHIEVEMENTS, rewardOf, unlockedItems, unlockedBoards } from '../game/achievements.js';
import { heart } from './hud.js';
import { drawSymbiote, drawGoo, drawRegrow } from '../render/oled.js';
import { todayKey } from '../game/run.js';
import { COMBOS, offerHints, activeCombos } from '../game/combos.js';
import { version } from '../../package.json';

// Shown on the menu; single source of truth is package.json.
const VERSION = `v${version}`;
const easeInOut = (q) => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);
// Primary UI colour: the symbiote's pink (RUN, RESUME, RETRY, selection).
const PINK = '#d83cd8';

// Modal backdrop. OLED: menus sit on true black (a < 1 only while fading in).
function dim(a = 1) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.fillRect(0, -H, W, H * 3);   // centred or not, cover the whole canvas
}

// Wrap by measured width, in the same font text() uses.
function wrapPx(str, maxW, size) {
  ctx.font = `500 ${Math.max(9, size)}px ${FONT_BODY}`;
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

// Card grid. Everything hangs off one padding P:
//   chip  at (P, P), size IC
//   text column at TX = P + IC + GAP: name, meta, then the body below the chip
//   right edge at w - P (wrap width, stat arrows, resonance dot)
//   height = last body line + P
// `fs` is the body size; compact shrinks the grid when four cards must fit.
function cardGrid(fs, compact) {
  const P = compact ? 10 : 14, IC = compact ? 34 : 42, GAP = 12;
  const nameS = compact ? 15 : 17, metaS = 10;
  return {
    P, IC, TX: P + IC + GAP, nameS, metaS,
    nameY: P + nameS * 0.36,                 // glyph top (0.72 em tall) sits on the chip's top edge
    metaY: P + IC - metaS * 0.6,              // meta baseline sits on the chip's bottom edge
    bodyTop: P + IC + (compact ? 8 : 10),     // body starts under the chip
    lh: Math.round(fs * 1.4), hlh: Math.round((fs - 1) * 1.4),
  };
}

function cardLayout(it, w, run, fs, compact = false) {
  const hints = run ? offerHints(it.id, run.stacks, run.save, run.board) : [];
  const g = cardGrid(fs, compact);
  const tw = w - g.TX - g.P;
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
  const body = desc.length * g.lh + (hint.length ? 6 + hint.length * g.hlh : 0);
  return { hints, desc, hint, known, fs, g, compact, h: g.bodyTop + body + g.P - 2 };
}

function itemCard(id, x, y, w, it, L, { run = null, selected = false } = {}) {
  const { hints, desc, hint, fs, g, compact, h } = L;
  area(id, x, y, w, h);
  const rc = RARITY[it.rarity].color;
  // Minimal card: black, a thin rarity outline, white when selected.
  rrPath(x + 1, y + 1, w - 2, h - 2, 14);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.strokeStyle = selected ? PINK : rc;
  ctx.lineWidth = selected ? 2.5 : 1.5;
  ctx.stroke();
  // A resonating item gets a magenta dot that beats in the top-right corner.
  if (hints.length) {
    const k = 3.5 + Math.sin(performance.now() / 160) * 1.2;
    ctx.beginPath(); ctx.arc(x + w - g.P - 4, y + g.P + 4, k, 0, Math.PI * 2);
    ctx.fillStyle = PAL.magenta; ctx.fill();
  }
  // Icon: no frame, centred vertically on the card in the left column.
  const icx = x + g.P + g.IC / 2, icy = y + h / 2;
  if (!drawIcon(it.id, icx, icy, g.IC * 0.66)) {
    text(it.code, icx, icy + 1, { color: PAL.white, size: compact ? 11 : 13, align: 'center', font: 'display' });
  }
  text(it.name, x + g.TX, y + g.nameY, { color: rc, size: g.nameS, font: 'display', maxW: w - g.TX - g.P - (hints.length ? 14 : 0) });
  text(`${RARITY[it.rarity].name} · ${it.cat === 'mode' ? 'SHOT' : it.cat.toUpperCase()}`, x + g.TX, y + g.metaY, { color: PAL.mute, size: g.metaS });
  // Stat arrows, computed by actually applying the item to this build.
  if (run) {
    let sx = x + w - g.P;
    for (const d of statDelta(run.board, run.stacks, it.id).reverse()) {
      const label = `${d.label}${d.dir > 0 ? '▲' : '▼'}`;
      text(label, sx, y + g.metaY, { color: d.dir > 0 ? PAL.acid : PAL.red, size: g.metaS, align: 'right' });
      sx -= ctx.measureText(label).width + 8;
    }
  }
  const ty = y + g.bodyTop + g.lh / 2;
  desc.forEach((l, i) => text(l, x + g.TX, ty + i * g.lh, { color: '#ece6f2', size: fs }));
  // Combo hint: vague until discovered, explicit afterwards.
  const hy = ty + desc.length * g.lh + 6 + (g.hlh - g.lh) / 2;
  hint.forEach((l, i) => text(l, x + g.TX, hy + i * g.hlh, { color: PAL.magenta, size: fs - 1 }));
}

// ---------------------------------------------------------------------------
// Logo: HOST in neon green, BOUND in the symbiote's pink, spelled in monoline
// primitive glyphs (ui/glyphs.js). It traces itself in when the menu opens;
// the tagline follows in neon green.
// ---------------------------------------------------------------------------
const LOGO_SIZE = 34, TAG_SIZE = 9;
function drawLogo(t) {
  const p = Math.min(1, t / 1.1);
  const e = 1 - (1 - p) ** 3;
  const wH = wordWidth('HOST', LOGO_SIZE), wB = wordWidth('BOUND', LOGO_SIZE), gap = LOGO_SIZE * 0.42;
  const x0 = W / 2 - (wH + gap + wB) / 2, y0 = 128;
  drawWord('HOST', x0, y0, LOGO_SIZE, PAL.acid, { weight: 0.12, progress: e });
  drawWord('BOUND', x0 + wH + gap, y0, LOGO_SIZE, '#d83cd8', { weight: 0.12, progress: Math.max(0, e * 1.2 - 0.2) });
  const tp = Math.max(0, Math.min(1, (t - 0.8) / 0.8));
  drawWord('RUN · SHOOT · MUTATE', W / 2, y0 + LOGO_SIZE + 22, TAG_SIZE, PAL.acid, { weight: 0.16, align: 'center', progress: 1 - (1 - tp) ** 3 });
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
// Where the menu shows the alien (menu coordinates) and its spring state, so
// the RUN transition can take over from exactly this pose.
export const MENU_SYM = { y: 276, R: 46, state: {} };
export const menuBob = (t) => Math.sin(t * 2) * 3;
// Death screen -> RETRY / MENU: the goo turns into the next specimen in one
// move (oled.drawRegrow) while the black death screen fades out.
export const REGROW_S = { retry: 1.0, menu: 0.9 };
export function regrowFade(u) { const k = 1 - Math.min(1, u / 0.55); return k * k * (3 - 2 * k); }

export function drawMenu(save, t, boardIdx, specimen, morph = null) {
  dim(0.55);
  drawLogo(t);

  // Board selector
  const b = BOARDS[boardIdx];
  const unlocked = unlockedBoards(save).includes(b.id);
  if (BOARDS.length > 1) {
    button('boardPrev', 16, 250, 40, 64, '‹', { size: 20 });
    button('boardNext', W - 56, 250, 40, 64, '›', { size: 20 });
  }
  // One primary action; everything else is an outline.
  const bx = 48, bw = W - 96;
  button('run', bx, 352, bw, 54, 'RUN', { color: '#d83cd8', fill: true, size: 22, disabled: !unlocked });
  const dBest = save.daily.date === todayKey() ? save.daily.best : 0;
  button('daily', bx, 416, bw, 44, 'DAILY RUN', { color: PAL.acid, size: 15, sub: dBest ? `today ${dBest}m` : null });
  const hb = (bw - 10) / 2;
  button('archive', bx, 470, hb, 40, 'ARCHIVE', { color: PAL.white, size: 14 });
  button('tutorial', bx + hb + 10, 470, hb, 40, 'TUTORIAL', { color: PAL.white, size: 14 });

  const st = save.settings;
  toggle('sfx', bx + 6, 522, hb - 16, 30, 'SFX', st.sfx);
  toggle('music', bx + hb + 20, 522, hb - 16, 30, 'MUSIC', st.music);

  const nUnl = unlockedItems(save).length;
  if (save.best > 0) text(`BEST ${save.best}m`, W / 2, 572, { color: PAL.acid, size: 12, align: 'center', font: 'display' });
  text(`${nUnl}/${ITEMS.length} ITEMS · ${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length} GOALS`, W / 2, 592, { color: '#4a3a55', size: 9, align: 'center' });
  text(VERSION, W / 2, LH - 14, { color: '#3a2a40', size: 9, align: 'center' });

  // The protagonist, big and free-floating, drawn live: this run's specimen.
  // On RUN it flies from here to the start of the run (main.js run.intro).
  // Back from death it grows out of the goo while the black fades away.
  const now = performance.now();
  const mu = morph ? (now - morph.start) / (REGROW_S.menu * 1000) : 1;
  const ay = MENU_SYM.y + menuBob(t);
  if (mu < 1) {
    const f = regrowFade(mu);
    if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, -H, W, H * 3); }
    drawRegrow(morph.oldG, specimen, mu, morph.from, { x: W / 2, y: ay, R: MENU_SYM.R }, now / 1000);
  } else drawSymbiote(W / 2, ay, { R: MENU_SYM.R, bank: Math.sin(t * 0.8) * 0.12, t, hit: false, genome: specimen, state: MENU_SYM.state });
}

// ---------------------------------------------------------------------------
// Archive: items, combos and goals as one scrolling list per tab, in the
// home's language: glyph headings, pink for selection, acid for progress,
// no card grid. Drawn in real screen coordinates (not centred), so the list
// uses the whole height and the header sits under the notch.
// ---------------------------------------------------------------------------
// Locked placeholders: a darker shade of the rarity colour (no alpha on OLED).
const RARITY_DARK = ['#55505e', '#0f5d66', '#45307a'];
const TRACK = '#241a2a';

// Scroll and selection state; main.js feeds taps, tickArchive() the physics.
export const ARCH = { tab: 'items', sel: null, selK: 1, scroll: 0, vel: 0, max: 0, dragY: null, grabV: 0, last: 0 };

export function archiveTab(tab) {
  ARCH.tab = tab; ARCH.sel = null; ARCH.scroll = 0; ARCH.vel = 0;
}
export function archiveSelect(id) {
  ARCH.sel = ARCH.sel === id ? null : id;
  ARCH.selK = 0;
}

// Drag, fling and rubber band, on real time so it is smooth at any refresh.
export function tickArchive(p, wheel) {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - (ARCH.last || now - 16)) / 1000));
  ARCH.last = now;
  const A = ARCH, over = A.scroll < 0 ? A.scroll : A.scroll > A.max ? A.scroll - A.max : 0;
  if (p.down && !p.consumed) {
    if (A.dragY === null) { A.dragY = p.y; A.grabV = Math.abs(A.vel); A.vel = 0; }
    const dy = p.y - A.dragY;
    A.dragY = p.y;
    A.scroll -= dy * (over ? 0.4 : 1);
    A.vel = A.vel * 0.5 + (-dy / dt) * 0.5;
  } else {
    A.dragY = null;
    A.scroll += A.vel * dt;
    A.vel *= Math.exp(-dt * 3.4);
    if (over) { A.scroll -= over * (1 - Math.exp(-dt * 16)); A.vel *= Math.exp(-dt * 20); }
    if (Math.abs(A.vel) < 4) A.vel = 0;
  }
  if (wheel) { A.scroll = Math.max(0, Math.min(A.max, A.scroll + wheel)); A.vel = 0; }
  A.selK += (1 - A.selK) * (1 - Math.exp(-dt * 14));
}

const HEAD_H = 64;
function archView() {
  const top = SAFE_TOP + 12;
  return { top, listTop: top + HEAD_H, listBot: H - SAFE_BOTTOM - 6 };
}

// One detail block, used for items under their row. Returns its full height.
function itemDetail(it, save, unl, x, y, w, draw) {
  const known = unl.includes(it.id);
  let h = 6;
  const at = (dy) => y + h + dy;
  // the row above already names a known item; a locked one is only a dot
  if (!known) {
    if (draw) text('LOCKED', x, at(8), { color: PINK, size: 15, font: 'display', maxW: w });
    h += 24;
  }
  if (draw) text(`${RARITY[it.rarity].name} · ${it.cat === 'mode' ? 'SHOT' : it.cat.toUpperCase()}`, x, at(0), { color: PAL.mute, size: 10 });
  h += 18;
  if (known) {
    const desc = wrapPx(it.desc, w, 12);
    desc.forEach((l, i) => { if (draw) text(l, x, at(i * 17), { color: '#ece6f2', size: 12 }); });
    h += desc.length * 17;
    const mine = COMBOS.filter((c) => c.a === it.id || c.b === it.id);
    const found = mine.filter((c) => save.combos && save.combos[c.id]);
    const hidden = mine.length - found.length;
    const parts = found.map((c) => `${c.name} with ${ITEM_BY_ID[c.a === it.id ? c.b : c.a].name}`);
    if (hidden) parts.push(`${hidden} combo${hidden > 1 ? 's' : ''} still hidden`);
    if (parts.length) {
      h += 6;
      wrapPx(parts.join(' · '), w, 11).forEach((l, i) => { if (draw) text(l, x, at(i * 15), { color: PINK, size: 11 }); h += 15; });
    }
  } else {
    const a = ACHIEVEMENTS.find((q) => q.id === it.unlock);
    const lines = [...wrapPx(`Unlock: ${a ? a.desc : '?'}`, w, 12)];
    lines.forEach((l, i) => { if (draw) text(l, x, at(i * 17), { color: '#ece6f2', size: 12 }); });
    h += lines.length * 17;
    const more = wrapPx('Or find it corrupted in a run and beat the next boss.', w, 11);
    more.forEach((l, i) => { if (draw) text(l, x, at(i * 15), { color: PAL.mute, size: 11 }); });
    h += more.length * 15;
  }
  return h + 12;
}

// Small padlock-free placeholder for a locked item: a hollow circle.
function lockedDot(x, y, rarity, sel) {
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2);
  ctx.strokeStyle = sel ? PINK : RARITY_DARK[rarity]; ctx.lineWidth = sel ? 2.5 : 1.5; ctx.stroke();
}

function drawItemsList(save, y0, V) {
  const unl = unlockedItems(save);
  const M = 20, cols = 2, gx = 10, cw = (W - M * 2 - gx) / cols, rh = 40;
  const vis = (y, h) => y + h > V.listTop && y < V.listBot;
  const hit = (id, x, y, w, h) => {
    const a = Math.max(y, V.listTop), b = Math.min(y + h, V.listBot);
    if (b > a) area(id, x, a, w, b - a);
  };
  let y = y0;
  for (let r = 0; r < RARITY.length; r++) {
    const all = ITEMS.filter((it) => it.rarity === r);
    const open = all.filter((it) => unl.includes(it.id));
    const shut = all.filter((it) => !unl.includes(it.id));
    if (vis(y, 30)) {
      text(RARITY[r].name, M, y + 12, { color: RARITY[r].color, size: 13, font: 'display' });
      text(`${open.length}/${all.length}`, W - M, y + 12, { color: PAL.mute, size: 11, font: 'display', align: 'right' });
    }
    y += 32;
    // Rows of unlocked items, two per row; the detail opens under its row.
    const detail = (it) => {
      const full = itemDetail(it, save, unl, M + 8, 0, W - M * 2 - 16, false);
      const h = full * ARCH.selK;
      // while it opens, bring the whole detail into view
      if (ARCH.selK < 0.97 && ARCH.dragY === null) {
        const over = y + full - (V.listBot - 12);
        if (over > 0) ARCH.scroll += Math.min(over, y - V.listTop - 60) * 0.18;
      }
      if (vis(y, h)) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, y, W, h); ctx.clip();
        itemDetail(it, save, unl, M + 8, y, W - M * 2 - 16, true);
        ctx.restore();
      }
      y += h;
    };
    for (let i = 0; i < open.length; i += cols) {
      const row = open.slice(i, i + cols);
      if (vis(y, rh)) row.forEach((it, j) => {
        const x = M + j * (cw + gx), cy = y + rh / 2, sel = ARCH.sel === it.id;
        hit(`item:${it.id}`, x, y, cw, rh);
        if (sel) { rrPath(x + 1, y + 3, cw - 2, rh - 6, (rh - 6) / 2); ctx.strokeStyle = PINK; ctx.lineWidth = 2; ctx.stroke(); }
        if (!drawIcon(it.id, x + 20, cy, 20)) text(it.code, x + 20, cy + 1, { color: PAL.white, size: 9, align: 'center', font: 'display', maxW: 24 });
        text(it.name, x + 38, cy + 1, { color: sel ? PINK : PAL.white, size: 11, font: 'display', maxW: cw - 50 });
      });
      y += rh;
      const s = row.find((it) => it.id === ARCH.sel);
      if (s) detail(s);
    }
    // Locked: hollow circles, no text. Tap one to see how to unlock it.
    if (shut.length) {
      y += 8;
      if (vis(y, 18)) text(`${shut.length} LOCKED · TAP ONE TO SEE HOW TO GET IT`, M, y + 6, { color: PAL.mute, size: 9, font: 'display', maxW: W - M * 2 });
      y += 16;
      const step = 26, per = Math.floor((W - M * 2) / step);
      for (let i = 0; i < shut.length; i += per) {
        const row = shut.slice(i, i + per);
        if (vis(y, step)) row.forEach((it, j) => {
          const x = M + 13 + j * step;
          hit(`item:${it.id}`, x - 13, y, step, step);
          lockedDot(x, y + step / 2, r, ARCH.sel === it.id);
        });
        y += step;
        const s = row.find((it) => it.id === ARCH.sel);
        if (s) detail(s);
      }
    }
    y += 22;
  }
  return y - y0;
}

function drawCombosList(save, y0, V) {
  const M = 20, known = COMBOS.filter((c) => save.combos && save.combos[c.id]);
  const vis = (y, h) => y + h > V.listTop && y < V.listBot;
  const tx = M + 74, tw = W - tx - M;
  let y = y0;
  for (const c of known) {
    const desc = wrapPx(c.desc, tw, 11);
    const h = 26 + desc.length * 15 + 16;
    if (vis(y, h)) {
      const col = c.evo ? PAL.acid : PINK;
      const iy = y + 12;
      if (!drawIcon(c.a, M + 11, iy, 20)) text(ITEM_BY_ID[c.a].code, M + 11, iy, { color: PAL.white, size: 9, align: 'center', font: 'display', maxW: 22 });
      text('+', M + 33, iy + 1, { color: PAL.mute, size: 11, align: 'center', font: 'display' });
      if (!drawIcon(c.b, M + 55, iy, 20)) text(ITEM_BY_ID[c.b].code, M + 55, iy, { color: PAL.white, size: 9, align: 'center', font: 'display', maxW: 22 });
      text(c.name, tx, iy + 1, { color: col, size: 12, font: 'display', maxW: tw - (c.evo ? 44 : 0) });
      if (c.evo) text('MAX', W - M, iy + 1, { color: PAL.acid, size: 9, font: 'display', align: 'right' });
      desc.forEach((l, i) => text(l, tx, y + 32 + i * 15, { color: '#ece6f2', size: 11 }));
    }
    y += h;
  }
  const hidden = COMBOS.length - known.length;
  if (hidden) {
    y += known.length ? 8 : 0;
    if (vis(y, 120)) {
      text(`${hidden} STILL HIDDEN`, M, y + 10, { color: PAL.mute, size: 12, font: 'display' });
      wrapPx('Hold two items that work together. An offered item that resonates with your build shows a beating dot.', W - M * 2, 12)
        .forEach((l, i) => text(l, M, y + 34 + i * 17, { color: PAL.mute, size: 12 }));
    }
    y += 100;
  }
  return y - y0;
}

function drawGoalsList(save, y0, V) {
  const M = 20, tx = M + 22, rw = 74, tw = W - tx - M - rw;
  const vis = (y, h) => y + h > V.listTop && y < V.listBot;
  const goals = [...ACHIEVEMENTS.filter((a) => !save.achievements[a.id]), ...ACHIEVEMENTS.filter((a) => save.achievements[a.id])];
  let y = y0;
  for (const a of goals) {
    const done = !!save.achievements[a.id];
    const [cur, target] = a.progress(save, null);
    const rw_ = rewardOf(a.id);
    const desc = wrapPx(a.desc, tw, 11);
    const bar = !done && !a.runOnly && target > 1;
    const h = 22 + desc.length * 15 + (bar ? 12 : 0) + 14;
    if (vis(y, h)) {
      const cy = y + 9;
      ctx.beginPath(); ctx.arc(M + 6, cy, 6, 0, Math.PI * 2);
      if (done) { ctx.fillStyle = PAL.acid; ctx.fill(); } else { ctx.strokeStyle = RARITY_DARK[0]; ctx.lineWidth = 1.5; ctx.stroke(); }
      text(a.name, tx, cy + 1, { color: done ? PAL.acid : PAL.white, size: 12, font: 'display', maxW: tw });
      text(done ? 'DONE' : a.runOnly ? 'ONE RUN' : `${Math.min(Math.floor(cur), target)}/${target}`, W - M, cy + 1, { color: done ? PAL.acid : PAL.white, size: 11, font: 'display', align: 'right' });
      desc.forEach((l, i) => text(l, tx, y + 28 + i * 15, { color: PAL.mute, size: 11 }));
      if (rw_) text(`+ ${rw_.name}`, W - M, y + 28, { color: rw_.kind === 'board' ? PAL.orange : PINK, size: 10, align: 'right', maxW: rw - 6 });
      if (bar) {
        const by = y + 22 + desc.length * 15 + 4, bw = W - tx - M;
        rrPath(tx, by, bw, 3, 1.5); ctx.fillStyle = TRACK; ctx.fill();
        const k = Math.max(0, Math.min(1, cur / target));
        if (k > 0) { rrPath(tx, by, Math.max(3, bw * k), 3, 1.5); ctx.fillStyle = PAL.acid; ctx.fill(); }
      }
    }
    y += h;
  }
  return y - y0;
}

export function drawArchive(save) {
  dim(1);
  const V = archView(), A = ARCH;
  // the list, clipped under the header
  ctx.save();
  ctx.beginPath(); ctx.rect(0, V.listTop, W, V.listBot - V.listTop); ctx.clip();
  const y0 = V.listTop + 8 - A.scroll;
  const h = A.tab === 'items' ? drawItemsList(save, y0, V) : A.tab === 'combos' ? drawCombosList(save, y0, V) : drawGoalsList(save, y0, V);
  ctx.restore();
  A.max = Math.max(0, h + 24 - (V.listBot - V.listTop));
  // scroll position: a thin capsule on the right edge while there is more
  if (A.max > 0) {
    const vh = V.listBot - V.listTop, th = Math.max(28, vh * vh / (vh + A.max));
    const k = Math.max(0, Math.min(1, A.scroll / A.max));
    rrPath(W - 5, V.listTop + 4 + (vh - 8 - th) * k, 3, th, 1.5); ctx.fillStyle = TRACK; ctx.fill();
  }
  // header on top of the list: tabs, back, one counter
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, V.listTop);
  const tabId = { items: 'tabItems', combos: 'tabCombos', goals: 'tabGoals' }[A.tab];
  segmented(12, V.top, 240, 36, [['tabItems', 'ITEMS'], ['tabCombos', 'COMBOS'], ['tabGoals', 'GOALS']], tabId);
  button('back', W - 16 - 80, V.top, 80, 36, 'BACK', { color: PAL.white, size: 12 });
  const count = A.tab === 'items' ? `${unlockedItems(save).length}/${ITEMS.length} UNLOCKED`
    : A.tab === 'combos' ? `${COMBOS.filter((c) => save.combos && save.combos[c.id]).length}/${COMBOS.length} FOUND`
      : `${Object.keys(save.achievements).length}/${ACHIEVEMENTS.length} DONE`;
  text(count, 20, V.top + 52, { color: PAL.acid, size: 10, font: 'display' });
}

// ---------------------------------------------------------------------------
// In-run overlays
// ---------------------------------------------------------------------------
export function drawPick(run) {
  dim();
  const lvl = run.pickKind === 'level';
  text(lvl ? `LEVEL ${run.level}` : 'BOSS DOWN', W / 2, 56, { color: lvl ? PAL.acid : PINK, size: 22, align: 'center', font: 'display' });
  text(lvl ? 'THE MASS MUTATES · CHOOSE ONE' : 'CHOOSE ONE UPGRADE', W / 2, 82, { color: PAL.white, size: 11, align: 'center', font: 'display' });
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
  if (run.pickSel >= 0) text('TAP AGAIN TO TAKE IT', W / 2, 100, { color: PINK, size: 11, align: 'center', font: 'display' });
  else if (t > 0.45) text('TAP A CARD TO SELECT', W / 2, 100, { color: PAL.mute, size: 11, align: 'center', font: 'display' });
  const full = run.player.hearts >= run.stats.maxHearts;
  button('skip', 90, cy - gap + 14, W - 180, 40, 'SKIP', { color: PAL.mute, size: 12, sub: full ? 'nothing' : '+1 heart' });
}

// The build as icons in centred rows: a rarity capsule under each icon and
// the stack count at its shoulder. Shared by pause and death.
const BUILD_CS = 38;
function buildIcons(stacks, ids, y, rows, per = Math.floor((W - 40) / BUILD_CS), cs = BUILD_CS) {
  ids.slice(0, rows * per).forEach((id, i) => {
    const it = ITEM_BY_ID[id], n = stacks[id];
    const inRow = Math.min(per, ids.length - Math.floor(i / per) * per);
    const x = W / 2 + ((i % per) - (inRow - 1) / 2) * cs, cy = y + Math.floor(i / per) * cs + 14;
    if (!drawIcon(id, x, cy, 20)) text(it.code, x, cy + 1, { color: PAL.white, size: 9, align: 'center', font: 'display', maxW: 26 });
    rrPath(x - 7, cy + 15, 14, 3, 1.5); ctx.fillStyle = RARITY[it.rarity].color; ctx.fill();
    if (n > 1) text(`${n}`, x + 13, cy - 10, { color: RARITY[it.rarity].color, size: 9, align: 'center', font: 'display' });
  });
}

// Pause: the home's composition. Your alien in the middle, where you are in
// the run above it, the build under it, and the home's buttons at the bottom:
// RESUME (primary), HOLD TO END RUN (fills red under the finger), SFX/MUSIC.
// Drawn in real screen coordinates so the buttons hug the bottom edge.
export const END_HOLD = 0.8;
export function drawPause(run, save) {
  dim();
  const top = SAFE_TOP, bot = H - SAFE_BOTTOM;
  const t = performance.now() / 1000;
  const st = run.stats, p = run.player;

  // Bottom block, anchored to the bottom edge like the home's buttons.
  const bx = 48, bw = W - 96, hb = (bw - 10) / 2;
  const ty = bot - 48;
  toggle('sfx', bx + 6, ty, hb - 16, 30, 'SFX', save.settings.sfx);
  toggle('music', bx + hb + 20, ty, hb - 16, 30, 'MUSIC', save.settings.music);
  const ey = ty - 58;
  const k = Math.min(1, (run.holdT || 0) / END_HOLD);
  const label = k > 0 ? 'KEEP HOLDING' : run.holdHint > 0 ? 'HOLD IT DOWN' : 'HOLD TO END RUN';
  holdButton('endRun', bx, ey, bw, 44, label, k, { color: PAL.red, size: 13 });
  const ry = ey - 66;
  button('resume', bx, ry, bw, 54, 'RESUME', { color: PINK, fill: true, size: 22 });
  let floor = ry - 20;
  if (run.tutorial) { button('skipTutorial', bx + 40, ry - 46, bw - 80, 34, 'SKIP TUTORIAL', { color: PAL.white, size: 11 }); floor = ry - 64; }

  // Lay out the upper block first, then centre it in the space left.
  const ids = Object.keys(run.stacks).filter((id) => ITEM_BY_ID[id]);
  const cs = BUILD_CS, per = Math.floor((W - 40) / cs);
  const HEAD = 236;                       // title, status, hearts, alien
  const base = computeStats(run.board, {});
  const parts = [];
  for (const d of STAT_DEFS) {
    const a = d.get(base), b = d.get(st);
    if (Math.abs(b - a) > 1e-6) parts.push({ s: `${d.label} ${d.fmt(b)}`, c: b > a ? PAL.acid : PAL.red, w: wordWidth(`${d.label} ${d.fmt(b)}`, 10 * 0.72) + 18 });
  }
  const statLines = [[]];
  let lw = 0;
  for (const q of parts) {
    if (lw + q.w > W - 48 && statLines[statLines.length - 1].length) { statLines.push([]); lw = 0; }
    statLines[statLines.length - 1].push(q); lw += q.w;
  }
  const nStat = parts.length ? statLines.length : 0;
  const comboLines = wrapPx(activeCombos(run.stacks, run.stats).map((c) => c.name).join(' · '), W - 64, 12).filter(Boolean);
  const room = floor - top;
  let rows = Math.ceil(ids.length / per);
  const bodyH = (r) => ids.length ? r * cs + 10 + 22 + nStat * 20 + (comboLines.length ? 4 + comboLines.length * 17 : 0) : 40;
  while (rows > 1 && HEAD + bodyH(rows) > room) rows--;
  const used = HEAD + bodyH(rows);
  const y0 = top + Math.max(0, (room - used) * 0.4);

  text('PAUSED', W / 2, y0 + 46, { color: PAL.white, size: 22, align: 'center', font: 'display' });
  text(`${Math.floor(run.distance)}m · LV ${run.level}`, W / 2, y0 + 76, { color: PAL.acid, size: 12, align: 'center', font: 'display' });
  const nh = st.maxHearts + p.blueHearts;
  for (let i = 0; i < nh; i++) {
    const hx = W / 2 - (nh - 1) * 10 + i * 20;
    if (i < st.maxHearts) heart(hx, y0 + 100, PAL.red, i < p.hearts); else heart(hx, y0 + 100, PAL.blue, true);
  }
  // The alien you are playing, big and alive.
  const sy = y0 + 166;
  run.pauseSym = run.pauseSym || {};
  run.pausePose = { x: W / 2, y: sy + Math.sin(t * 2) * 3, R: 36 };   // where the goo starts if the run ends here
  drawSymbiote(W / 2, sy + Math.sin(t * 2) * 3, { R: 36, bank: Math.sin(t * 0.8) * 0.12, t, hit: false, genome: p.specimen, state: run.pauseSym });

  let y = y0 + HEAD;
  if (!ids.length) {
    wrapPx('No mutations yet. Collect cells to level up, then choose one.', W - 96, 12)
      .forEach((l, i) => text(l, W / 2, y + 8 + i * 17, { color: PAL.mute, size: 12, align: 'center' }));
    return;
  }
  buildIcons(run.stacks, ids, y, rows, per, cs);
  y += rows * cs + 10;
  // Shot, then only the stats this build moved (green up, red down).
  const shot = `${st.carrier}${st.hasScatter ? ' · fan' : ''}${st.hasSine ? ' · wave' : ''}${st.hasRocket && st.carrier !== 'rocket' ? ' · blast' : ''}`.toUpperCase();
  text(`SHOT ${shot}`, W / 2, y, { color: PAL.white, size: 11, align: 'center', font: 'display' });
  y += 22;
  if (nStat) for (const ln of statLines) {
    let x = W / 2 - ln.reduce((s, q) => s + q.w, 0) / 2;
    for (const q of ln) { text(q.s, x + q.w / 2, y, { color: q.c, size: 10, align: 'center', font: 'display' }); x += q.w; }
    y += 20;
  }
  // Active combos: names in pink.
  if (comboLines.length) {
    y += 4;
    for (const l of comboLines) {
      if (y > floor) break;
      text(l, W / 2, y, { color: PINK, size: 12, align: 'center' });
      y += 17;
    }
  }
}

// Death: same composition as pause. What killed you, how far you got, the
// build you died with, then RETRY (primary pink) and MENU / SHARE pinned to
// the bottom like the home's buttons. Real screen coordinates.
export function drawDead(run) {
  // Freeze frame: for 0.6 s the world stays visible with what killed you
  // circled and your lane lit, then the screen fades to solid black.
  // Ending the run from pause skips it: straight from the black pause to the
  // black death screen, no flash of the track in between.
  const k = run.quit ? null : run.lastHit;
  if (k && run.deadT < 1.4) {
    const a = Math.min(1, 1.4 - run.deadT);
    ctx.save();
    ctx.globalAlpha = 0.18 * a; ctx.fillStyle = k.color;
    ctx.fillRect(laneX(k.lane) - LANE_W / 2, 0, LANE_W, H);
    ctx.globalAlpha = a; ctx.strokeStyle = k.color; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(k.x, k.y, 22 + Math.sin(run.deadT * 14) * 3, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  dim(run.quit ? 1 : Math.min(1, Math.max(0, run.deadT - 0.6) * 1.6));
  const top = SAFE_TOP, bot = H - SAFE_BOTTOM, rs = run.rs;

  // Bottom block first, so the upper block can centre in what is left.
  const bx = 48, bw = W - 96, hw = (bw - 10) / 2;
  const py = bot - 62, ry = py - 64;
  if (run.deadT > 0.8) {
    button('retry', bx, ry, bw, 54, run.daily ? 'RETRY DAILY' : 'RETRY', { color: PINK, fill: true, size: 22 });
    button('menu', bx, py, hw, 44, 'MENU', { color: PAL.white, size: 14 });
    button('share', bx + hw + 10, py, hw, 44, run.shareMsg || 'SHARE', { color: PAL.acid, size: 14 });
  }
  const floor = ry - 20;

  const ids = Object.keys(run.stacks).filter((id) => ITEM_BY_ID[id]);
  const per = Math.floor((W - 40) / BUILD_CS);
  const unl = [...new Set(run.newUnlocks)];
  const HEAD = 292;   // titles, distance, stats, the dead goo
  let rows = Math.ceil(ids.length / per);
  const bodyH = (r) => (ids.length ? 20 + r * BUILD_CS : 0) + (unl.length ? 30 + Math.min(unl.length, 6) * 18 : 0);
  while (rows > 1 && HEAD + bodyH(rows) > floor - top) rows--;
  const y0 = top + Math.max(0, (floor - top - HEAD - bodyH(rows)) * 0.4);

  // This run's alien, dead: from right where it was (on the track, or the
  // pause screen's alien when the run was ended from pause) it slumps into
  // goo WHILE it slides to its spot on the death screen, one move, at its
  // own size (no zoom). It keeps simmering there; on RETRY / MENU the goo
  // itself becomes the next specimen (main.js, drawRegrow).
  const now = performance.now(), tt = now / 1000, p = run.player;
  if (!run.gooStart) {
    run.gooStart = now;
    run.gooFrom = (run.quit ? run.pausePose : null) || { x: p.x, y: PLAYER_Y + 2, R: symRadius(p) };
  }
  const from = run.gooFrom, GOO_S = 0.9;
  const to = run.deadPose = { x: W / 2, y: y0 + 250, R: from.R };
  const since = (now - run.gooStart) / 1000;
  const q = easeInOut(Math.min(1, since / GOO_S));
  const gx = from.x + (to.x - from.x) * q;
  const gy = from.y + (to.y - from.y) * q - Math.sin(Math.PI * q) * 14;   // a soft lift on the way
  drawGoo(p.specimen, since / (GOO_S * 1.35), gx, gy, from.R, tt);   // still slumping as it arrives
  if (run.deadT < 0.6) return;   // the freeze frame: only the goo so far

  const jitter = !run.quit && run.deadT < 0.9 ? (Math.random() - 0.5) * 5 : 0;
  text('CONSUMED', W / 2 + jitter, y0 + 50, { color: PAL.red, size: 30, align: 'center', font: 'display' });
  if (k) text(`BY ${k.what}`, W / 2, y0 + 80, { color: k.color, size: 11, align: 'center', font: 'display', maxW: W - 64 });
  text(`${Math.floor(run.distance)}m`, W / 2, y0 + 120, { color: PAL.white, size: 34, align: 'center', font: 'display' });
  // one line under the distance: a new record, or the record to beat
  const rec = run.newBest ? 'NEW BEST' : run.daily && run.newDailyBest ? 'NEW DAILY BEST' : `BEST ${run.save.best}m`;
  text(rec, W / 2, y0 + 150, { color: run.newBest || run.newDailyBest ? PAL.acid : PAL.mute, size: 12, align: 'center', font: 'display' });
  text(`${rs.kills} KILLS · ${rs.bosses} BOSSES · LV ${run.level}${run.daily ? ` · DAILY ${run.dailyKey}` : ''}`, W / 2, y0 + 176, { color: PAL.white, size: 10, align: 'center', font: 'display', maxW: W - 48 });

  let y = y0 + HEAD;
  if (ids.length) {
    y += 8;
    buildIcons(run.stacks, ids, y, rows, per);
    y += rows * BUILD_CS + 12;
  }
  if (unl.length) {
    y += 10;
    text('UNLOCKED', W / 2, y, { color: PAL.acid, size: 12, align: 'center', font: 'display' });
    y += 22;
    for (const n of unl.slice(0, 6)) {
      if (y > floor) break;
      text(n, W / 2, y, { color: PINK, size: 12, align: 'center', font: 'display', maxW: W - 64 });
      y += 18;
    }
  }
}

export { heart };
