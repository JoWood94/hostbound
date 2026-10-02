import { ctx, W, H, UI_OFFSET } from './core/canvas.js';
import { startLoop } from './core/loop.js';
import { pollInput, discardGesture, setTapSlop, setEarlyTap } from './core/input.js';
import { loadSave, writeSave } from './core/save.js';
import { beginUi, endUi, hitTest, setUiOffset } from './core/ui.js';
import { applyPost } from './render/post.js';
import { drawFx, updateShake, shakeOffset, fxCount } from './render/fx.js';
let layerDim = 1;
import { drawPlayerBullets, drawEnemyBullets, enemyBullets, playerBullets, LOW } from './game/bullets.js';
import { drawPlayer, drawPlayerDeath } from './game/player.js';
import { drawEnemies, drawTelegraphs, spawnEnemy, enemies, look, drawCorpses } from './game/enemies.js';
import { drawWorld, updateWorld } from './game/world.js';
import { drawObstacles, spawnObstacle, obstacles } from './game/obstacles.js';
import { drawPickups, pickups } from './game/pickups.js';
import { drawBoss, drawBossTelegraph, drawBossBar, makeBoss } from './game/boss.js';
import { drawWeaponFx, drawWingmen } from './game/weapon.js';
import { line as drawLine, drawGlowDot, setDim } from './render/draw.js';
import { PLAYER_Y } from './game/player.js';
import { runBot } from './debug/bot.js';
import { runBench } from './debug/bench.js';
import { PAL } from './render/palette.js';
import { BOARDS } from './game/boards.js';
import { ITEMS, ITEM_BY_ID, rollItems, TRIOS, CARRIER_PAIRS } from './game/items.js';
import { unlockedBoards, unlockedItems } from './game/achievements.js';
import { createRun, updateRun, updateDead, endRun, acquire, coveredLanes, pickItem, skipPick, EVENT_EVERY, drawHusks } from './game/run.js';
import { drawHud } from './ui/hud.js';
import { drawTutorial, finishTutorial } from './game/tutorial.js';
import { drawMenu, drawArchive, archivePages, drawPick, drawPause, drawDead } from './ui/screens.js';
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
let archivePage = 0;

// ?mute: no music, no sound for this session only (automated tests); the
// saved settings are left untouched.
const MUTE = new URLSearchParams(location.search).has('mute');
const audioSettings = () => (MUTE ? { ...save.settings, sfx: false, music: false } : save.settings);
applySettings(audioSettings());
// Logo fonts. Offline the canvas falls back to system fonts.
if (document.fonts) { document.fonts.load('48px "Russo One"').catch(() => {}); document.fonts.load('52px "Train One"', 'HOSTBOUNDホストバウンド').catch(() => {}); document.fonts.load('16px "Racing Sans One"').catch(() => {}); document.fonts.load('16px DotGothic16').catch(() => {}); }

function ensureAudio() {
  unlockAudio();
  applySettings(audioSettings());
  startMusic();
}

// The tutorial plays before the first run (and from the menu's TUTORIAL
// button); never on the daily or on test starts (?from, &items).
function startRun(daily = false, tutorial = false) {
  if (!daily) save.board = BOARDS[boardIdx].id;
  writeSave(save);
  const tut = !daily && (tutorial || (!save.tutorialDone && !START_FROM && !START_ITEMS.length));
  run = createRun(save, { daily, tutorial: tut });
  if (!daily) for (const id of START_ITEMS) acquire(run, id, true);
  if (START_FROM && !daily) warpTo(run, START_FROM);
  else if (START_ITEMS.length && !daily) { run.toasts = []; toastBuild(run); }
  screen = 'run';
  sfx.select();
}

// ?from=5000 (testing): start the run at that distance with a build like one
// you would have there: one level pick per ~600 m and one boss loot per boss
// passed, rolled from the real pools, times FROM_BOOST (default 2: a strong
// run, so the test is about the patterns, not about a weak build; &boost=1
// for an average one). Bosses already passed are counted, so the next boss
// and its speed are the right ones.
const START_FROM = Math.max(0, Number(new URLSearchParams(location.search).get('from')) || 0);
const FROM_BOOST = Math.max(1, Number(new URLSearchParams(location.search).get('boost')) || 2);
// &items=laser,glaive,glaive (testing): start with these items (repeat an id to
// stack it). With it the warp rolls no shot modifiers, so the carrier pair or
// trio you asked for is the one you play.
const START_ITEMS = (new URLSearchParams(location.search).get('items') || '').split(',').map((x) => x.trim()).filter((id) => ITEM_BY_ID[id]);
const NO_MODES = START_ITEMS.length ? ITEMS.filter((it) => it.cat === 'mode').map((it) => it.id) : [];
function warpTo(r, metres) {
  const bossesPassed = Math.floor(metres / EVENT_EVERY);
  const levels = Math.floor(metres / 600);
  const picks = Math.round(levels * FROM_BOOST), loots = Math.round(bossesPassed * FROM_BOOST);
  const unlocked = unlockedItems(save);
  for (let i = 0; i < picks; i++) {
    const it = rollItems(r.rng, unlocked, r.stacks, 1, r.stats.luck, { source: 'level', exclude: NO_MODES })[0];
    if (it) acquire(r, it.id, true);
  }
  for (let i = 0; i < loots; i++) {
    const it = rollItems(r.rng, unlocked, r.stacks, 1, r.stats.luck, { source: 'boss', exclude: NO_MODES })[0];
    if (it) acquire(r, it.id, true);
  }
  r.distance = metres;
  r.level = 1 + levels;
  r.bossIndex = bossesPassed;
  r.eventIndex = bossesPassed;
  r.nextEvent = (bossesPassed + 1) * EVENT_EVERY;
  r.player.hearts = r.stats.maxHearts;
  r.toasts = [];
  toastBuild(r);
}
function toastBuild(r) {
  const names = Object.keys(r.stacks).map((id) => ITEM_BY_ID[id].code + (r.stacks[id] > 1 ? r.stacks[id] : '')).join(' ');
  r.toasts.push({ text: `WARP ${Math.floor(r.distance)}m`, sub: names.slice(0, 60), color: PAL.cyan, t: 4, dur: 4 });
  const fused = [...TRIOS.filter((t) => r.stats.trioOn[t.id]), ...CARRIER_PAIRS.filter((q) => q.id === r.stats.pair && !q.legacy)];
  for (const f of fused) r.toasts.push({ text: f.name, sub: f.desc.slice(0, 60), color: PAL.magenta, t: 5, dur: 5 });
}

async function shareRun(r) {
  const url = `${location.origin}${location.pathname}`;
  const where = r.daily ? ` on the DAILY ${r.dailyKey}` : '';
  const msg = `HOSTBOUND: ${Math.floor(r.distance)}m${where}, ${r.rs.bosses} bosses, ${r.rs.kills} kills. Beat me:`;
  // Both APIs need a secure context (https). Over plain-http LAN testing they are missing.
  if (navigator.share) {
    try { await navigator.share({ title: 'HOSTBOUND', text: msg, url }); } catch { /* cancelled */ }
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
const MODAL_LOCK = 0.45;
let lastMode = null;
let modalT = 0;
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
    else if (id === 'tutorial') startRun(false, true);
    else if (id === 'archive') { screen = 'archive'; sfx.select(); }
    else if (id === 'sfx') { save.settings.sfx = !save.settings.sfx; applySettings(audioSettings()); writeSave(save); sfx.select(); }
    else if (id === 'music') { save.settings.music = !save.settings.music; applySettings(audioSettings()); writeSave(save); sfx.select(); }
    return;
  }

  if (screen === 'archive') {
    if (id === 'back' || input.pause) { screen = 'menu'; sfx.select(); }
    else if (id === 'tabItems' || id === 'tabGoals' || id === 'tabCombos') { archiveTab = id.slice(3).toLowerCase(); archivePage = 0; }
    else if (id === 'pagePrev' || (!id && input.left)) archivePage = Math.max(0, archivePage - 1);
    else if (id === 'pageNext' || (!id && input.right)) archivePage = Math.min(archivePages(save, archiveTab) - 1, archivePage + 1);
    else if (id && id.startsWith('item:')) { archiveSel = id.slice(5); sfx.lane(); }
    return;
  }

  // screen === 'run'
  // Modal screens (pick, pause, dead): when one opens, drop the gesture in
  // progress and ignore input for MODAL_LOCK s, so a swipe meant for the
  // symbiote can never choose a card.
  if (run.mode !== lastMode) {
    if (run.mode !== 'play') { discardGesture(); modalT = 0; run.pickSel = -1; }
    setTapSlop(run.mode === 'play' ? 8 : 14);
    setEarlyTap(run.mode === 'play');
    lastMode = run.mode;
  }
  modalT += dt;
  run.modalT = modalT;
  const locked = run.mode !== 'play' && modalT < MODAL_LOCK;
  switch (run.mode) {
    case 'play':
      updateRun(run, input, dt);
      break;
    case 'pick': {
      if (locked) break;
      // Two taps: the first selects a card, the second (on the same card) takes it.
      const n = run.pickChoices.length;
      if (id && id.startsWith('pick:')) {
        const i = Number(id.slice(5));
        if (run.pickSel === i) pickItem(run, i);
        else { run.pickSel = i; sfx.lane(); }
      } else if (id === 'skip') skipPick(run);
      else if (input.left || input.right) { run.pickSel = run.pickSel < 0 ? 0 : (run.pickSel + (input.right ? 1 : n - 1)) % n; sfx.lane(); }
      else if (id === 'enter' && run.pickSel >= 0) pickItem(run, run.pickSel);
      break;
    }
    case 'pause':
      if (locked) break;
      if (id === 'resume' || id === 'enter' || input.pause) { run.mode = 'play'; sfx.select(); }
      else if (id === 'skipTutorial' && run.tutorial) { finishTutorial(run); run.mode = 'play'; sfx.select(); }
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
    centred(() => drawArchive(save, archiveTab, archiveSel, archivePage));
  } else {
    const r = run;
    look.x = r.player.x; look.y = PLAYER_Y;
    drawWorld(r.distance, r.player.lane);
    drawTelegraphs();
    drawBossTelegraph(r.boss);
    drawObstacles(alpha);
    drawPickups(alpha, r.time);
    // Readability: the more of your own stuff is on screen, the dimmer it is
    // drawn (down to 45%), so enemy shots on top always stand out.
    const busy = playerBullets.n + fxCount() * 0.25;
    layerDim += (Math.max(0.45, Math.min(1, 1 - (busy - 30) / 110)) - layerDim) * 0.1;
    setDim(layerDim);
    drawFx();
    setDim(1);
    drawCorpses();
    drawBoss(r.boss, alpha);
    drawEnemies(alpha);
    setDim(layerDim);
    drawWeaponFx();
    drawPlayerBullets();
    if (r.railT > 0) {
      const a = Math.min(1, r.railT * 3);
      drawLine(r.player.x, PLAYER_Y - 20, r.player.x, 0, PAL.cyan, 10 + Math.random() * 4, 0.35 * a);
      drawLine(r.player.x, PLAYER_Y - 20, r.player.x, 0, '#ffffff', 3, 0.9 * a);
      drawGlowDot(r.player.x, PLAYER_Y - 22, PAL.cyan, 10, a);
    }
    drawWingmen();
    drawHusks(r);
    setDim(1);
    drawEnemyBullets('low');   // low waves under the board: you jump over them
    if (!r.player.dead) drawPlayer(r.player, alpha, r.stats);
    else drawPlayerDeath(r.player, r.deadT);
    drawEnemyBullets('high');  // normal enemy bullets always on top: readability rule
    drawBossBar(r.boss);
    drawHud(r);
    if (r.mode === 'play') drawTutorial(r);
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
    warp: (metres) => warpTo(run, metres),
    acquire: (id) => acquire(run, id),
    spawn: (type, lane, elite = false) => spawnEnemy(type, lane, 1, { chance: () => Math.random() < 0.5 }, { elite }),
    get enemies() { return enemies; },
    get obstacles() { return obstacles; },
    get enemyBullets() { return enemyBullets; },
    playerY: PLAYER_Y,
    // Test player: __game.bot((run) => { run.distance = 6000; }, 60, { log: true })
    bot: (setup, seconds, opts) => runBot(window.__game, setup, seconds, opts),
    // Damage bench: __game.bench(['split', 'converge'], { lanes: [2] }) -> total damage in 10 s
    bench: (ids, opts) => runBench(window.__game, ids, opts),
    get pickups() { return pickups; },
    obstacle: (type, lane, y = 200) => spawnObstacle(type, lane, y),
    boss: (def, index = 0) => { run.boss = makeBoss(index, def, 1); run.nextEvent = 1e9; },
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
    // Draw one frame (registers the buttons), for tests while the tab is hidden.
    draw: () => render(1),
    hit: (x, y) => hitTest(x, y),
    offer: (ids) => { run.pickChoices = ids.map((id) => ITEM_BY_ID[id]); run.mode = 'pick'; },
    god: () => { run.player.hearts = 99; run.stats.maxHearts = 99; run.nextEvent = 1e9; run.sec = null; run.secCalmUntil = 1e12; },
  };
}
