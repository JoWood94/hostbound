import { ctx, W, H, UI_OFFSET } from './core/canvas.js';
import { startLoop } from './core/loop.js';
import { pollInput } from './core/input.js';
import { loadSave, writeSave } from './core/save.js';
import { beginUi, endUi, hitTest, setUiOffset } from './core/ui.js';
import { applyPost } from './render/post.js';
import { drawFx, updateShake, shakeOffset } from './render/fx.js';
import { drawPlayerBullets, drawEnemyBullets, enemyBullets, LOW } from './game/bullets.js';
import { drawPlayer, drawPlayerDeath } from './game/player.js';
import { drawEnemies, drawTelegraphs, spawnEnemy, enemies, look, drawCorpses } from './game/enemies.js';
import { drawWorld, updateWorld } from './game/world.js';
import { drawObstacles, spawnObstacle, obstacles } from './game/obstacles.js';
import { drawPickups, pickups } from './game/pickups.js';
import { drawBoss, drawBossTelegraph, drawBossBar, makeBoss } from './game/boss.js';
import { drawWeaponFx, drawWingmen } from './game/weapon.js';
import { line as drawLine, drawGlowDot } from './render/draw.js';
import { PLAYER_Y } from './game/player.js';
import { PAL } from './render/palette.js';
import { BOARDS } from './game/boards.js';
import { ITEM_BY_ID } from './game/items.js';
import { unlockedBoards } from './game/achievements.js';
import { createRun, updateRun, updateDead, endRun, acquire, coveredLanes, pickItem, skipPick } from './game/run.js';
import { drawHud } from './ui/hud.js';
import { drawMenu, drawArchive, drawPick, drawPause, drawDead } from './ui/screens.js';
import { unlockAudio, applySettings, sfx, suspendAudio, resumeAudio } from './audio/audio.js';
import { setHaptics, buzz } from './core/haptics.js';
import { startMusic, setMusic } from './audio/music.js';

// ---------------------------------------------------------------------------
// Top-level state: menu | archive | run
// ---------------------------------------------------------------------------
const save = loadSave();
let screen = 'menu';
let run = null;
let menuT = 0;
let boardIdx = Math.max(0, BOARDS.findIndex((b) => b.id === save.board));
let archiveTab = 'items';
let archiveSel = null;
let comboPage = 0;

applySettings(save.settings);
setHaptics(save.settings.haptics);
// Logo fonts (direction B). Offline the canvas falls back to system fonts.
if (document.fonts) { document.fonts.load('64px Yellowtail').catch(() => {}); document.fonts.load('48px "Russo One"').catch(() => {}); document.fonts.load('16px DotGothic16').catch(() => {}); }

function ensureAudio() {
  unlockAudio();
  applySettings(save.settings);
  startMusic();
}

function startRun(daily = false) {
  if (!daily) save.board = BOARDS[boardIdx].id;
  writeSave(save);
  run = createRun(save, { daily });
  screen = 'run';
  sfx.select();
}

async function shareRun(r) {
  const url = `${location.origin}${location.pathname}`;
  const where = r.daily ? ` on the DAILY ${r.dailyKey}` : '';
  const msg = `NEON OVERDRIFT: ${Math.floor(r.distance)}m${where}, ${r.rs.bosses} bosses, ${r.rs.kills} kills. Beat me:`;
  // Both APIs need a secure context (https). Over plain-http LAN testing they are missing.
  if (navigator.share) {
    try { await navigator.share({ title: 'NEON OVERDRIFT', text: msg, url }); } catch { /* cancelled */ }
    return;
  }
  try { await navigator.clipboard.writeText(`${msg} ${url}`); r.shareMsg = 'COPIED'; }
  catch { r.shareMsg = 'NEEDS HTTPS'; sfx.deny(); }
}

function toMenu() {
  screen = 'menu';
  run = null;
  setMusic('menu');
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (run && run.mode === 'play') run.mode = 'pause';
    suspendAudio();
  } else {
    resumeAudio();
  }
});

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  const input = pollInput();
  if (input.any) ensureAudio();
  updateShake(dt);
  const id = input.tap ? (input.tapX >= 0 ? hitTest(input.tapX, input.tapY) : 'enter') : null;

  if (screen === 'menu') {
    menuT += dt;
    updateWorld(dt, 60);
    const unlocked = unlockedBoards(save).includes(BOARDS[boardIdx].id);
    if (id === 'boardPrev' || input.left) { boardIdx = (boardIdx + BOARDS.length - 1) % BOARDS.length; sfx.lane(); }
    else if (id === 'boardNext' || input.right) { boardIdx = (boardIdx + 1) % BOARDS.length; sfx.lane(); }
    else if ((id === 'run' || id === 'enter' || input.jump) && unlocked) startRun();
    else if (id === 'daily') startRun(true);
    else if (id === 'archive') { screen = 'archive'; sfx.select(); }
    else if (id === 'sfx') { save.settings.sfx = !save.settings.sfx; applySettings(save.settings); writeSave(save); sfx.select(); }
    else if (id === 'music') { save.settings.music = !save.settings.music; applySettings(save.settings); writeSave(save); sfx.select(); }
    else if (id === 'haptics') { save.settings.haptics = !save.settings.haptics; setHaptics(save.settings.haptics); writeSave(save); buzz(30); sfx.select(); }
    return;
  }

  if (screen === 'archive') {
    if (id === 'back' || input.pause) { screen = 'menu'; sfx.select(); }
    else if (id === 'tabItems') archiveTab = 'items';
    else if (id === 'tabGoals') archiveTab = 'goals';
    else if (id === 'tabCombos') { archiveTab = 'combos'; comboPage = 0; }
    else if (id === 'comboPrev') comboPage = Math.max(0, comboPage - 1);
    else if (id === 'comboNext') comboPage++;
    else if (id && id.startsWith('item:')) { archiveSel = id.slice(5); sfx.lane(); }
    return;
  }

  // screen === 'run'
  switch (run.mode) {
    case 'play':
      updateRun(run, input, dt);
      break;
    case 'pick':
      if (id && id.startsWith('pick:')) pickItem(run, Number(id.slice(5)));
      else if (id === 'skip') skipPick(run);
      break;
    case 'pause':
      if (id === 'resume' || id === 'enter' || input.pause) { run.mode = 'play'; sfx.select(); }
      else if (id === 'quit') { run.player.dead = true; endRun(run); run.deadT = 0.8; }
      break;
    case 'dead':
      updateDead(run, dt);
      if (run.deadT > 0.8) {
        if (id === 'retry' || id === 'enter' || input.jump) startRun(run.daily);
        else if (id === 'menu') toMenu();
        else if (id === 'share') shareRun(run);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
// Screens designed for a 640-tall canvas, centred on taller screens.
function centred(fn) {
  setUiOffset(UI_OFFSET);
  ctx.save();
  ctx.translate(0, UI_OFFSET);
  fn();
  ctx.restore();
  setUiOffset(0);
}

function render(alpha) {
  beginUi();
  const sh = shakeOffset();
  ctx.save();
  ctx.translate(sh.x, sh.y);

  if (screen === 'menu') {
    drawWorld(menuT * 6, -1);
    centred(() => drawMenu(save, menuT, boardIdx));
  } else if (screen === 'archive') {
    centred(() => drawArchive(save, archiveTab, archiveSel, comboPage));
  } else {
    const r = run;
    look.x = r.player.x; look.y = PLAYER_Y;
    drawWorld(r.distance, r.player.lane);
    drawTelegraphs();
    drawBossTelegraph(r.boss);
    drawObstacles(alpha);
    drawPickups(alpha, r.time);
    drawFx();
    drawCorpses();
    drawBoss(r.boss, alpha);
    drawEnemies(alpha);
    drawWeaponFx();
    drawPlayerBullets();
    if (r.railT > 0) {
      const a = Math.min(1, r.railT * 3);
      drawLine(r.player.x, PLAYER_Y - 20, r.player.x, 0, PAL.cyan, 10 + Math.random() * 4, 0.35 * a);
      drawLine(r.player.x, PLAYER_Y - 20, r.player.x, 0, '#ffffff', 3, 0.9 * a);
      drawGlowDot(r.player.x, PLAYER_Y - 22, PAL.cyan, 10, a);
    }
    drawWingmen();
    drawEnemyBullets('low');   // low waves under the board: you jump over them
    if (!r.player.dead) drawPlayer(r.player, alpha, r.stats);
    else drawPlayerDeath(r.player, r.deadT);
    drawEnemyBullets('high');  // normal enemy bullets always on top: readability rule
    drawBossBar(r.boss);
    drawHud(r);
    if (r.mode === 'pick') centred(() => drawPick(r));
    else if (r.mode === 'pause') centred(() => drawPause(r));
    else if (r.mode === 'dead') centred(() => drawDead(r));
  }

  ctx.restore();
  endUi();
  const glitch = screen === 'run'
    ? (run.mode === 'dead' ? Math.max(0, 0.6 - run.deadT) : run.player.glitch)
    : 0;
  applyPost(glitch);
}

setMusic('menu');
startLoop({ update, render });

// Offline + "Add to Home Screen". Only in production builds, so dev reloads stay fresh.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
}

// Debug handle for testing: open with ?debug to reach run state from the console.
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = {
    get run() { return run; },
    save,
    start: () => startRun(),
    acquire: (id) => acquire(run, id),
    spawn: (type, lane, elite = false) => spawnEnemy(type, lane, 1, { chance: () => Math.random() < 0.5 }, { elite }),
    get enemies() { return enemies; },
    get obstacles() { return obstacles; },
    get pickups() { return pickups; },
    obstacle: (type, lane, y = 200) => spawnObstacle(type, lane, y),
    boss: (def) => { run.boss = makeBoss(0, def, 1); run.nextEvent = 1e9; },
    covered: () => [...coveredLanes()],
    // Lanes where a high bullet reaches the player row within 0.5 s.
    hot: () => {
      const hot = new Set();
      const eb = enemyBullets;
      for (let i = 0; i < eb.n; i++) {
        if (eb.kind[i] === LOW || eb.y[i] > PLAYER_Y + 10) continue;
        const t = (PLAYER_Y - eb.y[i]) / Math.max(1, eb.vy[i]);
        if (t >= 0 && t < 0.5) hot.add(Math.round((eb.x[i] - 47.2) / 65.6));
      }
      return [...hot];
    },
    // Advance the simulation synchronously (background tabs pause rAF).
    tick: (frames = 1) => { for (let i = 0; i < frames; i++) update(1 / 60); },
    offer: (ids) => { run.pickChoices = ids.map((id) => ITEM_BY_ID[id]); run.mode = 'pick'; },
    god: () => { run.player.hearts = 99; run.stats.maxHearts = 99; run.nextEvent = 1e9; run.sec = null; run.secCalmUntil = 1e12; },
  };
}
