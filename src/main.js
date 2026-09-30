import { ctx, W, H } from './core/canvas.js';
import { startLoop } from './core/loop.js';
import { pollInput } from './core/input.js';
import { makeRng, randomSeed } from './core/rng.js';
import { PAL } from './render/palette.js';
import { text, line } from './render/draw.js';
import { applyPost } from './render/post.js';
import { updateFx, drawFx, updateShake, shakeOffset, consumeHitStop } from './render/fx.js';
import { playerBullets, enemyBullets, updatePool, clearPool, kill, drawPlayerBullets, drawEnemyBullets } from './game/bullets.js';
import { makePlayer, updatePlayer, hurtPlayer, drawPlayer, PLAYER_Y } from './game/player.js';
import { enemies, TYPES, spawnEnemy, updateEnemies, damageEnemy, drawEnemies, drawTelegraphs, clearEnemies } from './game/enemies.js';
import { updateWorld, drawWorld, LANES, PX_PER_M } from './game/world.js';
import { drawHud } from './ui/hud.js';

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------
const S = { MENU: 'menu', RUN: 'run', DEAD: 'dead' };
let state = S.MENU;
let run = null;
let menuT = 0;
let best = Number(localStorage.getItem('no.best') || 0);

function newRun() {
  const seed = randomSeed();
  run = {
    seed,
    rng: makeRng(seed),
    player: makePlayer(),
    distance: 0,       // metres
    coins: 0,
    kills: 0,
    time: 0,
    speed: 220,        // px/s scroll
    spawnT: 1.5,
    deadT: 0,
  };
  clearPool(playerBullets);
  clearPool(enemyBullets);
  clearEnemies();
}

// Difficulty 0..∞, grows with distance. Everything scales from this one number.
// 400 m per point: first minute stays gentle so patterns can be learned.
function difficulty(r) { return r.distance / 400; }

// Pick an enemy type unlocked at this distance, weighted toward newer types a bit.
function pickType(r) {
  const pool = Object.keys(TYPES).filter((k) => TYPES[k].unlockAt <= r.distance);
  return r.rng.pick(pool);
}

// Lanes that currently hold an enemy which is still holding position.
function busyLanes() {
  const set = new Set();
  for (const e of enemies) if (e.state !== 'leave') set.add(e.lane);
  return set;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function update(dt) {
  const input = pollInput();
  updateShake(dt);

  if (state === S.MENU) {
    menuT += dt;
    if (input.tap || input.jump) { newRun(); state = S.RUN; }
    return;
  }

  if (state === S.DEAD) {
    run.deadT += dt;
    updateFx(dt, 0);
    if (run.deadT > 0.8 && (input.tap || input.jump)) { newRun(); state = S.RUN; }
    return;
  }

  // RUN
  if (consumeHitStop(dt)) return;
  const r = run;
  const p = r.player;
  const d = difficulty(r);

  r.time += dt;
  r.speed = 220 + Math.min(260, 40 * Math.log1p(d * 2));
  r.distance += (r.speed / PX_PER_M) * dt;
  updateWorld(dt, r.speed);

  updatePlayer(p, input, dt);

  // Spawner: one enemy at a time early on, never two in the same lane,
  // and never more than 3 holding at once.
  r.spawnT -= dt;
  if (r.spawnT <= 0) {
    r.spawnT = Math.max(1.0, 2.4 - d * 0.25);
    const busy = busyLanes();
    const maxActive = 1 + Math.min(2, Math.floor(d));
    if (busy.size < maxActive) {
      const free = [];
      for (let l = 0; l < LANES; l++) if (!busy.has(l)) free.push(l);
      if (free.length) spawnEnemy(pickType(r), r.rng.pick(free), d);
    }
  }

  updateEnemies(dt, d);
  updatePool(playerBullets, dt);
  updatePool(enemyBullets, dt);
  updateFx(dt, r.speed);

  // Player bullets vs enemies
  for (let i = 0; i < playerBullets.n; i++) {
    const bx = playerBullets.x[i], by = playerBullets.y[i], br = playerBullets.r[i];
    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      const rr = e.r + br;
      const dx = e.x - bx, dy = e.y - by;
      if (dx * dx + dy * dy < rr * rr) {
        if (damageEnemy(e, playerBullets.dmg[i])) {
          enemies.splice(j, 1);
          r.kills++;
          r.coins += 1;
        }
        kill(playerBullets, i); i--;
        break;
      }
    }
  }

  // Enemy bullets vs player
  if (p.iframes <= 0) {
    for (let i = 0; i < enemyBullets.n; i++) {
      const dx = enemyBullets.x[i] - p.x, dy = enemyBullets.y[i] - PLAYER_Y;
      const rr = enemyBullets.r[i] + p.r;
      if (dx * dx + dy * dy < rr * rr) {
        kill(enemyBullets, i); i--;
        hurtPlayer(p, 1);
        break;
      }
    }
  }
  // Enemy body vs player
  if (p.iframes <= 0) {
    for (let j = 0; j < enemies.length; j++) {
      const e = enemies[j];
      const dx = e.x - p.x, dy = e.y - PLAYER_Y;
      const rr = e.r + p.r;
      if (dx * dx + dy * dy < rr * rr) {
        damageEnemy(e, 999);
        enemies.splice(j, 1);
        hurtPlayer(p, 1);
        break;
      }
    }
  }

  if (p.dead) {
    state = S.DEAD;
    r.deadT = 0;
    if (r.distance > best) { best = Math.floor(r.distance); localStorage.setItem('no.best', String(best)); }
  }
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(alpha) {
  const sh = shakeOffset();
  ctx.save();
  ctx.translate(sh.x, sh.y);

  if (state === S.MENU) {
    drawWorld(menuT * 60);
    drawMenu();
  } else {
    const r = run;
    drawWorld(r.distance);
    drawTelegraphs();
    drawFx();
    drawEnemies(alpha);
    drawPlayerBullets();
    if (!r.player.dead) drawPlayer(r.player, alpha);
    drawEnemyBullets(); // enemy bullets always on top: readability rule
    drawHud(r.player, r.distance, r.coins);
    if (state === S.DEAD) drawDead();
  }

  ctx.restore();
  applyPost(state === S.RUN ? run.player.glitch : state === S.DEAD ? Math.max(0, 0.6 - run.deadT) : 0);
}

function drawMenu() {
  const pulse = 0.7 + Math.sin(menuT * 4) * 0.3;
  text('NEON', W / 2, H * 0.32, { color: PAL.magenta, size: 52, align: 'center' });
  text('OVERDRIFT', W / 2, H * 0.32 + 48, { color: PAL.cyan, size: 40, align: 'center' });
  line(W * 0.2, H * 0.32 + 78, W * 0.8, H * 0.32 + 78, PAL.acid, 2);
  text('TAP TO RUN', W / 2, H * 0.62, { color: PAL.white, size: 16, align: 'center', alpha: pulse });
  text('SWIPE ◄ ► LANE · ▲ JUMP · ▼ PHASE', W / 2, H * 0.68, { color: PAL.dim, size: 9, align: 'center' });
  if (best > 0) text(`BEST ${best}m`, W / 2, H * 0.9, { color: PAL.acid, size: 12, align: 'center' });
}

function drawDead() {
  const r = run;
  ctx.fillStyle = 'rgba(10,0,8,0.72)';
  ctx.fillRect(0, 0, W, H);
  const jitter = r.deadT < 0.5 ? (Math.random() - 0.5) * 6 : 0;
  text('SIGNAL LOST', W / 2 + jitter, H * 0.36, { color: PAL.red, size: 32, align: 'center' });
  text(`${Math.floor(r.distance)}m`, W / 2, H * 0.46, { color: PAL.cyan, size: 28, align: 'center' });
  text(`KILLS ${r.kills}   ¤${r.coins}`, W / 2, H * 0.52, { color: PAL.acid, size: 12, align: 'center' });
  text(`BEST ${best}m`, W / 2, H * 0.58, { color: PAL.white, size: 12, align: 'center' });
  if (r.deadT > 0.8) {
    const pulse = 0.6 + Math.sin(r.deadT * 5) * 0.4;
    text('TAP TO RETRY', W / 2, H * 0.72, { color: PAL.white, size: 14, align: 'center', alpha: pulse });
  }
}

startLoop({ update, render });
