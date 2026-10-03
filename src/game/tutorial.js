// First-run tutorial: a guided stretch of track before the real run, one idea
// per step. Each step shows its instruction, sends one test and waits for the
// player to pass it. A hit costs nothing: the step says TRY AGAIN and repeats.
// The run director (sections, chunks, distance) is off until the last step,
// then the run starts at 0 m. Shown once (save.tutorialDone); the menu's
// TUTORIAL button plays it again.
import { ctx, W, H, SAFE_TOP } from '../core/canvas.js';
import { writeSave } from '../core/save.js';
import { PAL } from '../render/palette.js';
import { text } from '../render/draw.js';
import { rtri } from '../render/oled.js';
import { burst, shake } from '../render/fx.js';
import { enemyBullets, clearPool } from './bullets.js';
import { enemies, spawnEnemy, clearEnemies, beatClock } from './enemies.js';
import { obstacles, spawnObstacle, spawnVeil, clearObstacles } from './obstacles.js';
import { pickups, spawnPickup } from './pickups.js';
import { LANES, laneX } from './world.js';
import { PLAYER_Y } from './player.js';
import { xpNeed } from './balance.js';
import { ACTIVE_BTN } from '../ui/hud.js';
import { onKeys } from '../core/input.js';

const STEPS = [
  { id: 'move', title: 'SWIPE OR TAP ◄ ►', sub: ['Swipe, or tap the left / right half:', 'one lane per move. Reach the lit lane'], color: PAL.cyan,
    keys: { title: 'PRESS LEFT / RIGHT', sub: ['Arrow keys or A / D:', 'one lane per press. Reach the lit lane'] } },
  { id: 'dodge', title: 'MAGENTA = DODGE', sub: ['Barriers block their lane:', 'move to the gap'], color: PAL.magenta },
  { id: 'jump', title: 'SWIPE UP TO JUMP', sub: ['ORANGE = JUMP', 'Jump over the low wires'], color: PAL.orange,
    keys: { title: 'PRESS UP TO JUMP', sub: ['ORANGE = JUMP (Up arrow or W)', 'Jump over the low wires'] } },
  { id: 'phase', title: 'SWIPE DOWN TO PHASE', sub: ['CYAN = PHASE: cyan tears fill every lane,', 'only phase gets through. Shots: dodge', 'or phase them. Never barriers or wires'], color: PAL.cyan,
    keys: { title: 'PRESS DOWN TO PHASE', sub: ['CYAN = PHASE (Down arrow, S or Shift):', 'cyan tears fill every lane, only phase gets', 'through. Shots: dodge or phase them'] } },
  { id: 'shots', title: 'LIT LANE = SHOT INCOMING', sub: ['When your lane lights up, leave it.', 'You fire on your own: line up to hit'], color: PAL.magenta },
  { id: 'cells', title: 'GRAB THE GREEN CELLS', sub: ['Cells fill the bar on top.', 'Full bar = level up: pick a mutation'], color: PAL.acid },
  { id: 'hearts', title: 'HEARTS', sub: ['Every hit costs one.', 'No hearts left: consumed'], color: PAL.red },
  { id: 'go', title: 'YOU ARE READY', sub: ['The run starts now'], color: PAL.acid },
];

const INTRO = 1.4;        // s the instruction shows before the test arrives
const RETRY = 1.3;        // s of TRY AGAIN before the step repeats
const NICE = 0.9;         // s of NICE before the next step

export function makeTutorial() {
  return { step: 0, phase: 'intro', t: 0, failed: false, allowPick: false, targets: [], wave: 0 };
}

export const tutorialStep = (run) => (run.tutorial ? STEPS[run.tutorial.step] : null);

// A hit in the tutorial: the flash and the sound of a hit, no heart lost.
export function tutorialHit(run, p) {
  if (p.iframes > 0) return 'iframe';
  p.iframes = 1;
  p.glitch = 1;
  shake(6, 0.2);
  burst(p.x, PLAYER_Y, PAL.red, 18, 200, 0.6, 3);
  run.tutorial.failed = true;
  return 'red';
}

function clearTest() {
  clearPool(enemyBullets);
  clearEnemies();
  clearObstacles();
  pickups.length = 0;
}

const farLane = (from) => (from <= 1 ? from + 2 : from >= 3 ? from - 2 : (Math.random() < 0.5 ? 0 : 4));
const obstaclesLeft = () => obstacles.some((o) => !o.dead && !o.passed);

// Sends the test of the current step.
function spawnTest(run) {
  const tu = run.tutorial, lane = run.player.lane;
  tu.failed = false;
  switch (STEPS[tu.step].id) {
    case 'move': {
      const a = farLane(lane);
      tu.targets = [a, a <= 2 ? a + 2 : a - 2];
      break;
    }
    case 'dodge': {
      // two gates, the gap far from where you stand, then back across
      const g1 = farLane(lane), g2 = farLane(g1);
      for (let l = 0; l < LANES; l++) if (l !== g1) spawnObstacle('wall', l, -30);
      for (let l = 0; l < LANES; l++) if (l !== g2) spawnObstacle('wall', l, -330);
      break;
    }
    case 'jump':
      for (let l = 0; l < LANES; l++) spawnObstacle('low', l, -30);
      for (let l = 0; l < LANES; l++) spawnObstacle('low', l, -300);
      break;
    case 'phase':
      spawnVeil(-30);
      break;
    case 'shots':
    {
      // one drone over you, tough enough to fire both volleys while you
      // shoot it (you have to leave its lane); one two lanes away, a normal
      // one to shoot. Three lanes stay safe.
      const tough = spawnEnemy('drone', lane, 0, run.rng, { power: 1 });
      if (tough) tough.hp = tough.maxHp = 400;
      spawnEnemy('drone', farLane(lane), 0, run.rng, { power: 1 });
    }
      break;
    case 'cells': {
      run.xp = Math.max(run.xp, xpNeed(run.level) - 4);
      const cl = lane === 0 ? 1 : lane - 1;
      for (let i = 0; i < 6; i++) spawnPickup('coin', cl, -20 - i * 26);
      tu.picked = false;
      tu.allowPick = true;
      break;
    }
    default: break;
  }
}

// Has the test of the current step been passed? (null = still running)
function passed(run) {
  const tu = run.tutorial, p = run.player;
  switch (STEPS[tu.step].id) {
    case 'move':
      if (p.lane === tu.targets[0]) tu.targets.shift();
      return tu.targets.length ? null : true;
    case 'dodge': case 'jump': case 'phase':
      return obstaclesLeft() ? null : true;
    case 'shots':
      return enemies.some((e) => !e.dead) || enemyBullets.n ? null : true;
    case 'cells':
      if (tu.picked && !run.levelUps) return true;
      // missed some: more cells in the next lane
      if (!run.levelUps && !pickups.some((k) => !k.dead)) {
        const cl = p.lane === LANES - 1 ? p.lane - 1 : p.lane + 1;
        for (let i = 0; i < 6; i++) spawnPickup('coin', cl, -20 - i * 26);
      }
      return null;
    case 'hearts': return tu.t > 3.2 ? true : null;
    case 'go': return tu.t > 2.2 ? true : null;
    default: return true;
  }
}

// Returns true when the tutorial has just ended.
export function updateTutorial(run, dt) {
  const tu = run.tutorial;
  tu.t += dt;
  if (tu.phase === 'intro') {
    if (tu.t < INTRO) return false;
    tu.phase = 'test'; tu.t = 0;
    spawnTest(run);
    return false;
  }
  if (tu.phase === 'test') {
    if (tu.failed) {
      tu.phase = 'retry'; tu.t = 0;
      return false;
    }
    if (passed(run)) {
      tu.allowPick = false;
      if (STEPS[tu.step].id === 'go') return finishTutorial(run);
      tu.phase = 'nice'; tu.t = 0;
    }
    return false;
  }
  if (tu.phase === 'retry') {
    if (tu.t < RETRY) return false;
    clearTest();
    tu.phase = 'intro'; tu.t = INTRO * 0.5;
    return false;
  }
  // nice
  if (tu.t < NICE) return false;
  tu.step++; tu.phase = 'intro'; tu.t = 0;
  return false;
}

// Ends the tutorial (done or skipped): the real run starts here, at 0 m.
export function finishTutorial(run) {
  const s = run.save;
  s.tutorialDone = true;
  s.tips = { ...(s.tips || {}), lanes: true, phase: true, veil: true, jump: true };
  writeSave(s);
  clearTest();
  run.tutorial = null;
  run.wasHit = false;
  run.time = 0;
  run.player.hearts = run.stats.maxHearts;
  run.secCalmUntil = beatClock() + 4;
  run.toasts = [{ text: 'GO!', sub: '', color: PAL.acid, t: 1.6, dur: 1.6 }];
  return true;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
// Highlight: a rounded dashed outline whose dashes crawl round it.
function frame(x, y, w, h, color, t) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 30;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.stroke();
  ctx.restore();
}

export function drawTutorial(run) {
  const tu = run.tutorial;
  if (!tu) return;
  const st = STEPS[tu.step];
  const t = run.time;

  // Step pointers
  if (st.id === 'move' && tu.phase === 'test' && tu.targets.length) {
    // the target spot: a hairline cyan ring on the player row, breathing,
    // under a solid rounded pointer that bobs down onto it
    const x = laneX(tu.targets[0]);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    ctx.strokeStyle = PAL.cyan; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, PLAYER_Y, 24 + pulse * 4, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = PAL.cyan;
    rtri(x, PLAYER_Y - 54 + pulse * 6, 13);
    ctx.fill();
    ctx.restore();
  }
  if (st.id === 'hearts') frame(2, 20 + SAFE_TOP, 20 * run.stats.maxHearts + 4, 24, PAL.red, t);
  if (st.id === 'cells' && tu.phase !== 'intro') frame(4, SAFE_TOP + 1, W - 8, 10, PAL.acid, t);

  // Instruction panel
  const y0 = H * 0.16 + SAFE_TOP;   // above where the tests become readable
  const a = tu.phase === 'intro' ? Math.min(1, tu.t * 4) : 1;
  const say = onKeys() && st.keys ? st.keys : st;   // keys instead of gestures on a computer
  const lines = say.sub.length;
  // a black card outlined in the step's colour
  ctx.save();
  ctx.beginPath(); ctx.roundRect(18.75, y0 - 33.25, W - 37.5, 56.5 + lines * 13, 14);
  ctx.fillStyle = '#000'; ctx.fill();
  ctx.strokeStyle = st.color; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
  text(`TUTORIAL ${tu.step + 1}/${STEPS.length}`, W / 2, y0 - 20, { color: PAL.mute, size: 9, align: 'center', alpha: a, font: 'display' });
  text(say.title, W / 2, y0, { color: st.color, size: 17, align: 'center', alpha: a, font: 'display' });
  say.sub.forEach((l, i) => text(l, W / 2, y0 + 17 + i * 13, { color: PAL.white, size: 11, align: 'center', alpha: a }));

  const yr = y0 + 54 + lines * 13;   // clear of the card's bottom edge
  if (tu.phase === 'retry') {
    const k = Math.min(1, tu.t * 5);
    text('TRY AGAIN', W / 2, yr, { color: PAL.red, size: 20, align: 'center', alpha: k, font: 'display' });
  } else if (tu.phase === 'nice') {
    text('NICE', W / 2, yr, { color: PAL.acid, size: 20, align: 'center', alpha: Math.min(1, tu.t * 5), font: 'display' });
  }
  if (tu.step === 0 && tu.phase !== 'nice') {
    text('To skip it: pause, then SKIP TUTORIAL', W / 2, ACTIVE_BTN.y - 14, { color: PAL.mute, size: 10, align: 'center' });
  }
}
