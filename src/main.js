import { ctx, W, H, UI_OFFSET } from './core/canvas.js';
import { startLoop } from './core/loop.js';
import { pollInput, discardGesture, setTapSlop, setEarlyTap, pointer, takeWheel, keyHeld } from './core/input.js';
import { loadSave, writeSave } from './core/save.js';
import { beginUi, endUi, hitTest, setUiOffset } from './core/ui.js';
import { applyPost } from './render/post.js';
import { drawFx, updateShake, shakeOffset, fxCount } from './render/fx.js';
let layerDim = 1;
import { drawPlayerBullets, drawEnemyBullets, enemyBullets, playerBullets, LOW } from './game/bullets.js';
import { drawPlayer, symRadius } from './game/player.js';
import { drawLiquidMorph, drawRegrow } from './render/oled.js';
import { drawEnemies, drawTelegraphs, spawnEnemy, enemies, look, drawCorpses } from './game/enemies.js';
import { drawWorld, updateWorld } from './game/world.js';
import { drawObstacles, spawnObstacle, obstacles } from './game/obstacles.js';
import { drawPickups, pickups } from './game/pickups.js';
import { drawBoss, drawBossTelegraph, drawBossBar, makeBoss } from './game/boss.js';
import { drawWeaponFx, drawWingmen } from './game/weapon.js';
import { setDim } from './render/draw.js';
import { path as shotPath } from './render/shots.js';
const railPath = [0, 0, 0, 0];
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
import { makeSpecimen } from './render/specimen.js';
import { MENU_SYM, menuBob, REGROW_S, regrowFade } from './ui/screens.js';
import { randomSeed } from './core/rng.js';
import { drawMenu, drawArchive, ARCH, archiveTab, archiveSelect, tickArchive, drawPick, drawPause, drawDead, END_HOLD } from './ui/screens.js';
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

// ?mute: no music, no sound for this session only (automated tests); the
// saved settings are left untouched.
const MUTE = new URLSearchParams(location.search).has('mute');
const audioSettings = () => (MUTE ? { ...save.settings, sfx: false, music: false } : save.settings);
applySettings(audioSettings());
// Logo fonts. Offline the canvas falls back to system fonts.
if (document.fonts) { document.fonts.load('500 16px "Quicksand"').catch(() => {}); document.fonts.load('600 16px "Quicksand"').catch(() => {}); }

function ensureAudio() {
  unlockAudio();
  applySettings(audioSettings());
  startMusic();
}

// The tutorial plays before the first run (and from the menu's TUTORIAL
// button); never on the daily or on test starts (?from, &items).
// Alien body for the next run: new on every launch and after every start.
let nextSpecimen = makeSpecimen(randomSeed());

function startRun(daily = false, tutorial = false, fromMenu = false) {
  if (!daily) save.board = BOARDS[boardIdx].id;
  writeSave(save);
  const tut = !daily && (tutorial || (!save.tutorialDone && !START_FROM && !START_ITEMS.length));
  run = createRun(save, { daily, tutorial: tut });
  // The alien shown on the menu is the one you play; a new one grows at once
  // for the next run (retry or back to the menu). Purely cosmetic.
  run.player.specimen = nextSpecimen;
  nextSpecimen = makeSpecimen(randomSeed());
  // From the menu, the alien first flies down from its menu pose to the
  // start of the run, shrinking; the run waits for it (see update/render).
  if (fromMenu) {
    run.intro = { t: 0, start: performance.now(), t0: menuT, dur: 1.25, x0: W / 2, y0: UI_OFFSET + MENU_SYM.y + menuBob(menuT), R0: MENU_SYM.R };
    run.player.oled = MENU_SYM.state;          // keep the springs: no pop
  }
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

function toggleSetting(id) {
  save.settings[id] = !save.settings[id];
  applySettings(audioSettings()); writeSave(save); sfx.select();
}

// From the death screen the menu alien grows out of the goo (drawRegrow).
let menuMorph = null;
function toMenu(morph = null) {
  screen = 'menu';
  menuMorph = morph;
  MENU_SYM.state = {};
  menuT = 0;   // the logo traces itself in again
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
    else if ((id === 'run' || id === 'enter' || input.jump) && unlocked) startRun(false, false, true);
    else if (id === 'daily') startRun(true, false, true);
    else if (id === 'tutorial') startRun(false, true, true);
    else if (id === 'archive') { screen = 'archive'; archiveTab('items'); sfx.select(); }
    else if (id === 'sfx' || id === 'music') toggleSetting(id);
    return;
  }

  if (screen === 'archive') {
    const TABS = ['items', 'combos', 'goals'];
    if (id === 'back' || input.pause) { screen = 'menu'; sfx.select(); }
    else if (id === 'tabItems' || id === 'tabGoals' || id === 'tabCombos') { archiveTab(id.slice(3).toLowerCase()); sfx.lane(); }
    else if (!id && (input.left || input.right)) {   // horizontal swipe flips tabs
      const i = TABS.indexOf(ARCH.tab) + (input.right ? 1 : -1);
      if (i >= 0 && i < TABS.length) { archiveTab(TABS[i]); sfx.lane(); }
    }
    // a tap that only stopped a fling selects nothing
    else if (id && id.startsWith('item:') && ARCH.grabV < 250) { archiveSelect(id.slice(5)); sfx.lane(); }
    return;
  }

  // screen === 'run'
  // RUN transition: the world scrolls, nothing else runs until the alien lands.
  if (run.intro) {
    const k = Math.min(1, (performance.now() - run.intro.start) / (run.intro.dur * 1000));
    updateWorld(dt, 60 + 160 * k);
    if (k >= 1) run.intro = null;
    return;
  }
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
    case 'pause': {
      // END RUN is a hold: it fills while the finger that pressed it stays
      // on it, and drains when it lets go, so a stray tap never ends a run.
      const p = pointer();
      const holding = !locked && ((p.down && !p.consumed && hitTest(p.startX, p.startY) === 'endRun' && hitTest(p.x, p.y) === 'endRun') || keyHeld('KeyQ'));
      run.holdT = holding ? (run.holdT || 0) + dt : Math.max(0, (run.holdT || 0) - dt * 3);
      run.holdHint = Math.max(0, (run.holdHint || 0) - dt);
      if (run.holdT >= END_HOLD) { run.holdT = 0; run.quit = true; run.player.dead = true; endRun(run); run.deadT = 0.8; break; }
      if (locked) break;
      if (id === 'resume' || id === 'enter' || input.pause) { run.mode = 'play'; run.holdT = 0; sfx.select(); }
      else if (id === 'skipTutorial' && run.tutorial) { finishTutorial(run); run.mode = 'play'; sfx.select(); }
      else if (id === 'sfx' || id === 'music') toggleSetting(id);
      else if (id === 'endRun') { run.holdHint = 1.4; sfx.deny(); }   // a tap: say it needs a hold
      break;
    }
    case 'dead':
      updateDead(run, dt);
      if (run.deadT > 0.8) {
        // The goo becomes the next specimen (already grown, so its shape
        // is known) in one move, onto the track or back to the menu spot.
        const from = run.deadPose || { x: W / 2, y: H / 2, R: 50 }, oldG = run.player.specimen;
        if (id === 'retry' || id === 'enter' || input.jump) {
          startRun(run.daily);
          run.intro = { regrow: true, start: performance.now(), dur: REGROW_S.retry, from, oldG };
        } else if (id === 'menu') {
          toMenu({ start: performance.now(), from: { ...from, y: from.y - UI_OFFSET }, oldG });
          sfx.select();
        } else if (id === 'share') shareRun(run);
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

// RUN transition: the alien melts part by part and flows from its menu pose
// to the run start, re-forming the same body at run size (oled.drawLiquidMorph).
// Timed on real time, so it is as smooth as the display refresh.
function drawIntro(r) {
  const it = r.intro, p = r.player;
  const now = performance.now(), u = Math.min(1, (now - it.start) / (it.dur * 1000));
  if (it.regrow) {
    // RETRY: the death screen's black fades off the track while the goo
    // becomes the next specimen at the run start
    const f = regrowFade(u);
    if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(0, 0, W, H); }
    drawRegrow(it.oldG, p.specimen, u, it.from, { x: p.x, y: PLAYER_Y + 2, R: symRadius(p) }, now / 1000);
  } else drawLiquidMorph(p.specimen, u, it.x0, it.y0, it.R0, p.x, PLAYER_Y + 2, symRadius(p), it.t0);
}

function render(alpha) {
  beginUi();
  const sh = shakeOffset();
  ctx.save();
  ctx.translate(sh.x, sh.y);

  if (screen === 'menu') {
    drawWorld(menuT * 6, -1);
    centred(() => drawMenu(save, menuT, boardIdx, nextSpecimen, menuMorph));
  } else if (screen === 'archive') {
    tickArchive(pointer(), takeWheel());
    drawArchive(save);
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
    // OLED: no translucent layers; enemy shots stay readable by being drawn last.
    layerDim = 1;
    setDim(layerDim);
    drawFx();
    setDim(1);
    drawCorpses();
    drawBoss(r.boss, alpha);
    drawEnemies(alpha);
    setDim(layerDim);
    drawWeaponFx();
    drawPlayerBullets(alpha);
    if (r.railT > 0) {
      const a = Math.min(1, r.railT * 3);
      // RAIL STRIKE: one flat cyan column with a round foot, thinning as it ends
      railPath[0] = r.player.x; railPath[1] = PLAYER_Y - 20; railPath[2] = r.player.x; railPath[3] = -10;
      shotPath(railPath, PAL.cyan, 12 * a + 1);
      ctx.fillStyle = PAL.cyan; ctx.beginPath(); ctx.arc(r.player.x, PLAYER_Y - 20, 6 + 4 * a, 0, Math.PI * 2); ctx.fill();
    }
    drawWingmen();
    drawHusks(r);
    setDim(1);
    drawEnemyBullets('low', alpha);   // low waves under the board: you jump over them
    if (r.intro) { if (!r.intro.regrow) drawIntro(r); }   // the regrow is drawn over the HUD, below
    else if (!r.player.dead) drawPlayer(r.player, alpha, r.stats);   // dead: drawDead melts it into goo
    drawEnemyBullets('high', alpha);  // normal enemy bullets always on top: readability rule
    drawBossBar(r.boss);
    drawHud(r);
    if (r.intro && r.intro.regrow) drawIntro(r);   // over the HUD: its fade covers it too
    if (r.mode === 'play') drawTutorial(r);
    if (r.mode === 'pick') centred(() => drawPick(r));
    else if (r.mode === 'pause') drawPause(r, save);
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
