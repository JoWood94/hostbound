import { ctx, W, H } from './core/canvas.js';
import { startLoop } from './core/loop.js';
import { pollInput } from './core/input.js';
import { loadSave, writeSave } from './core/save.js';
import { beginUi, endUi, hitTest } from './core/ui.js';
import { applyPost } from './render/post.js';
import { drawFx, updateShake, shakeOffset } from './render/fx.js';
import { drawPlayerBullets, drawEnemyBullets } from './game/bullets.js';
import { drawPlayer } from './game/player.js';
import { drawEnemies, drawTelegraphs } from './game/enemies.js';
import { drawWorld, updateWorld } from './game/world.js';
import { drawObstacles } from './game/obstacles.js';
import { drawPickups } from './game/pickups.js';
import { drawBoss, drawBossTelegraph, drawBossBar } from './game/boss.js';
import { drawWeaponFx } from './game/weapon.js';
import { BOARDS } from './game/boards.js';
import { unlockedBoards } from './game/achievements.js';
import { createRun, updateRun, updateDead, endRun, pickItem, skipPick, shopBuy, shopReroll, shopLeave } from './game/run.js';
import { drawHud } from './ui/hud.js';
import { drawMenu, drawArchive, drawPick, drawShop, drawPause, drawDead } from './ui/screens.js';
import { unlockAudio, applySettings, sfx, suspendAudio, resumeAudio } from './audio/audio.js';
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

applySettings(save.settings);

function ensureAudio() {
  unlockAudio();
  applySettings(save.settings);
  startMusic();
}

function startRun() {
  save.board = BOARDS[boardIdx].id;
  writeSave(save);
  run = createRun(save);
  screen = 'run';
  sfx.select();
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
    else if (id === 'archive') { screen = 'archive'; sfx.select(); }
    else if (id === 'sfx') { save.settings.sfx = !save.settings.sfx; applySettings(save.settings); writeSave(save); sfx.select(); }
    else if (id === 'music') { save.settings.music = !save.settings.music; applySettings(save.settings); writeSave(save); sfx.select(); }
    return;
  }

  if (screen === 'archive') {
    if (id === 'back' || input.pause) { screen = 'menu'; sfx.select(); }
    else if (id === 'tabItems') archiveTab = 'items';
    else if (id === 'tabGoals') archiveTab = 'goals';
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
    case 'shop':
      if (id && id.startsWith('buy:')) shopBuy(run, Number(id.slice(4)));
      else if (id === 'reroll') shopReroll(run);
      else if (id === 'leave') shopLeave(run);
      break;
    case 'pause':
      if (id === 'resume' || id === 'enter' || input.pause) { run.mode = 'play'; sfx.select(); }
      else if (id === 'quit') { run.player.dead = true; endRun(run); run.deadT = 0.8; }
      break;
    case 'dead':
      updateDead(run, dt);
      if (run.deadT > 0.8) {
        if (id === 'retry' || id === 'enter' || input.jump) startRun();
        else if (id === 'menu') toMenu();
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(alpha) {
  beginUi();
  const sh = shakeOffset();
  ctx.save();
  ctx.translate(sh.x, sh.y);

  if (screen === 'menu') {
    drawWorld(menuT * 6, -1);
    drawMenu(save, menuT, boardIdx);
  } else if (screen === 'archive') {
    drawArchive(save, archiveTab, archiveSel);
  } else {
    const r = run;
    drawWorld(r.distance, r.player.lane);
    drawTelegraphs();
    drawBossTelegraph(r.boss);
    drawObstacles(alpha);
    drawPickups(alpha, r.time);
    drawFx();
    drawBoss(r.boss, alpha);
    drawEnemies(alpha);
    drawWeaponFx();
    drawPlayerBullets();
    if (!r.player.dead) drawPlayer(r.player, alpha, r.stats);
    drawEnemyBullets(); // enemy bullets always on top: readability rule
    drawBossBar(r.boss);
    drawHud(r);
    if (r.mode === 'pick') drawPick(r);
    else if (r.mode === 'shop') drawShop(r);
    else if (r.mode === 'pause') drawPause(r);
    else if (r.mode === 'dead') drawDead(r);
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

// Debug handle for testing: open with ?debug to reach run state from the console.
if (new URLSearchParams(location.search).has('debug')) {
  window.__game = { get run() { return run; }, save };
}
