// One run: spawning, collisions, rewards, levels, bosses, actives, achievements.
// Modes: play | pick (item after a boss or a level-up) | pause | dead
// Coins are 'cells' on screen: they are experience. Every level offers a pick.
import { W, H, SAFE_TOP } from '../core/canvas.js';
import { makeRng, randomSeed } from '../core/rng.js';
import { writeSave } from '../core/save.js';
import { PAL } from '../render/palette.js';
import { burst, shake, updateFx, consumeHitStop } from '../render/fx.js';
import { LOW, BIG, playerBullets, enemyBullets, updatePool, clearPool, kill, spawn, F_EXPLODE, F_TOXIC } from './bullets.js';
import { makePlayer, updatePlayer, hurtPlayer, isAirborne, isPhased, orbitalPositions, PLAYER_Y } from './player.js';
import { enemies, TYPES, spawnEnemy, updateEnemies, damageEnemy, clearEnemies, updateCorpses, look, beatClock, TICK_SEC, setTeleBonus } from './enemies.js';
import { SECTIONS, COURSES, mirrorEvent } from './sections.js';
import { survivable, rowsOf } from './fairness.js';
import { intensity, generateCourse, generateCombat } from './generator.js';
import { updateWorld, LANES, LANE_W, PX_PER_M, DISTRICTS, districtIndex, laneX } from './world.js';
import { obstacles, spawnObstacle, spawnVeil, updateObstacles, clearObstacles, OB_H, warmObstacleArt } from './obstacles.js';
import { pickups, spawnPickup, dropCoins, updatePickups, clearPickups } from './pickups.js';
import { ITEMS, ITEM_BY_ID, computeStats, rollItems, RARITY, powerRatio } from './items.js';
import { activeCombos } from './combos.js';
import * as B from './balance.js';
import { BOARD_BY_ID } from './boards.js';
import { makeBoss, updateBoss, BOSSES } from './boss.js';
import { updateWeapon, steerBullets, resolvePlayerHits, tickPoison, updateWeaponFx, clearWeaponFx, currentDamage, updateWingmen, groundPound, slipBurst, addRing, updateModeBullets, updateTrails, airRaid, flashLine } from './weapon.js';
import { checkAchievements, unlockedItems, rewardOf } from './achievements.js';
import { sfx } from '../audio/audio.js';
import { setMusic, syncMusic } from '../audio/music.js';
import { buzz } from '../core/haptics.js';
import { ACTIVE_BTN } from '../ui/hud.js';

export const EVENT_EVERY = 1000;      // metres between bosses: one at the end of each district

// Daily run: same seed for everyone on the same local date, always STOCK board.
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function createRun(save, opts = {}) {
  const daily = !!opts.daily;
  const dailyKey = daily ? todayKey() : null;
  const seed = daily ? hashSeed(`neon-overdrift:${dailyKey}`) : randomSeed();
  const board = daily ? BOARD_BY_ID.stock : (BOARD_BY_ID[save.board] || BOARD_BY_ID.stock);
  const run = {
    seed, rng: makeRng(seed), save, board, daily, dailyKey,
    wasHit: false, leechKills: 0, slipCd: 0, railT: 0, railTick: 0,
    stacks: {}, stats: null, player: null,
    distance: 0, time: 0, speed: 220,
    chunkT: 1.5, sec: null, secCalmUntil: 0, recentSec: [], lastKind: 'course',
    coins: 0, coinFrac: 0,
    rs: { distance: 0, kills: 0, bosses: 0, coins: 0, purchases: 0, phaseDodges: 0, lowJumps: 0,
      obstacles: 0, toxinKills: 0, phases: 0, defItems: 0, bossNoHit: false, boss1Heart: false,
      elites: 0, pureDistance: 0, daily: false },
    mode: 'play',
    nextEvent: EVENT_EVERY, eventIndex: 0, pending: null, warnT: 0,
    boss: null, bossIndex: 0, bossHit: false, pickDelay: 0,
    level: 1, xp: 0, levelUps: 0, pickKind: 'boss',
    pickChoices: [],
    active: null, overdriveT: 0, slowT: 0, flashT: 0,
    toasts: [], newUnlocks: [],
    synergies: new Set(),
    corrupt: [],               // item ids picked from corrupted drops, unlocked at next boss kill
    corruptSpawned: 0,
    achT: 0, deadT: 0,
    district: 0,
  };
  run.stats = computeStats(board, run.stacks);
  run.player = makePlayer(run.stats, board.color, board.id);
  run.rs.daily = daily;
  // Boss order: the first circle (5 bosses) in a shuffled order, then the
  // second circle (5 more) shuffled; after all ten they come back as MK2.
  const shuffled = (ids) => {
    for (let i = ids.length - 1; i > 0; i--) { const j = run.rng.int(0, i); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    return ids;
  };
  run.bossOrder = [...shuffled([0, 1, 2, 3, 4]), ...shuffled(BOSSES.slice(5).map((_, i) => i + 5))];

  clearPool(playerBullets);
  clearPool(enemyBullets);
  clearEnemies();
  clearObstacles();
  warmObstacleArt();
  clearPickups();
  clearWeaponFx();

  // Starting items from the board ('?' = random unlocked non-active item)
  const pool = unlockedItems(save).filter((id) => ITEM_BY_ID[id].cat !== 'active');
  for (const id of board.start) {
    const pick = id === '?' ? run.rng.pick(pool.filter((x) => (run.stacks[x] || 0) < ITEM_BY_ID[x].max && !(ITEM_BY_ID[x].conflicts || []).length)) : id;
    if (pick) acquire(run, pick, true);
  }

  save.totals.runs++;
  writeSave(save);
  setMusic('run', 0);
  return run;
}

export function difficulty(run) { return run.distance / 400; }

// One-time contextual tutorial tips, remembered in the save.
function tip(run, id, textStr, sub) {
  if (!run.save.tips) run.save.tips = {};
  if (run.save.tips[id]) return;
  run.save.tips[id] = true;
  writeSave(run.save);
  toast(run, textStr, sub, PAL.white, 3.5);
}

function toast(run, textStr, sub = '', color = PAL.cyan, dur = 2.4) {
  run.toasts.push({ text: textStr, sub, color, t: dur, dur });
  if (run.toasts.length > 3) run.toasts.shift();
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------
export function acquire(run, id, silent = false) {
  const it = ITEM_BY_ID[id];
  if (!it) return;
  const p = run.player;
  if (it.cat === 'mode') {
    if (!run.save.modesUsed) run.save.modesUsed = [];
    if (!run.save.modesUsed.includes(id)) run.save.modesUsed.push(id);
  }
  if (it.cat === 'active') {
    if (run.active) delete run.stacks[run.active.id];
    run.active = { id, charge: 0, max: it.active.charge, told: false };
    run.stacks[id] = 1;
  } else {
    run.stacks[id] = (run.stacks[id] || 0) + 1;
  }
  const prevBarrier = run.stats.barrier;
  run.stats = computeStats(run.board, run.stacks);
  if (it.onPick) it.onPick(run);
  p.hearts = Math.min(p.hearts, run.stats.maxHearts);
  if (run.stats.barrier > prevBarrier) p.shield = run.stats.barrier;

  if (!run.save.discovered.includes(id)) { run.save.discovered.push(id); writeSave(run.save); }
  p.items = Object.values(run.stacks).reduce((n, k) => n + k, 0);
  run.rs.defItems = ITEMS.filter((x) => x.cat === 'defense' && run.stacks[x.id] > 0).length;

  if (!silent) {
    sfx.pickup(); buzz(15);
    toast(run, it.name, it.desc.length < 44 ? it.desc : '', RARITY[it.rarity].color);
    if (it.cat === 'active') toast(run, 'ACTIVE ITEM', 'Kills fill the orange button: tap it when full', PAL.orange, 4.5);
  }

  // Combos: first time ever = discovery (named, explained, remembered forever).
  if (!run.save.combos) run.save.combos = {};
  for (const c of activeCombos(run.stacks, run.stats)) {
    if (run.synergies.has(c.id)) continue;
    run.synergies.add(c.id);
    if (!run.save.combos[c.id]) {
      run.save.combos[c.id] = true;
      writeSave(run.save);
      toast(run, `NEW COMBO: ${c.name}`, c.desc, PAL.magenta, 3.6);
      sfx.synergy();
      run.flashT = 0.3;
    } else {
      toast(run, `COMBO: ${c.name}`, '', PAL.magenta, 2);
    }
  }
}

function useActive(run) {
  const a = run.active;
  if (!a || a.charge < a.max) return false;
  a.charge = 0;
  const p = run.player;
  if (a.id === 'emp') {
    clearPool(enemyBullets);
    for (const e of enemies) damageEnemy(e, 8);
    shake(10, 0.35);
    run.flashT = 0.4;
    burst(p.x, PLAYER_Y, PAL.cyan, 40, 400, 0.8, 3);
    sfx.emp();
  } else if (a.id === 'slowmo') {
    run.slowT = 4;
    sfx.phase();
  } else if (a.id === 'overdrive') {
    run.overdriveT = 5;
    sfx.synergy();
  } else if (a.id === 'rail') {
    run.railT = 1.2;
    run.railTick = 0;
    sfx.emp();
    shake(5, 0.3);
  } else if (a.id === 'patch') {
    heal(run, 1, true);
    sfx.heart();
  } else if (a.id === 'blackhole') {
    run.bhT = 1.5;
    if (run.stats.horizon) run.horizonT = 5.5;      // EVENT HORIZON: orbitals eat wider after it
    for (const e of enemies) if (!e.dead && Math.abs(e.x - p.x) < LANE_W * 0.6) damageEnemy(e, 8);
    shake(6, 0.3); sfx.emp();
  } else if (a.id === 'mirrorfield') {
    run.mirrorT = 2;
    sfx.shield();
  } else if (a.id === 'overcharge') {
    p.overcharge = 3; p.overchargeT = 2;
    sfx.synergy();
  } else if (a.id === 'warp') {
    if (run.boss || run.pending || run.warnT > 0) { a.charge = a.max; sfx.deny(); return false; }
    for (const e of enemies) if (e.type !== 'boss') { e.dead = true; e.noReward = true; }
    clearPool(enemyBullets);
    for (const o of obstacles) o.dead = true;
    for (let i = pickups.length - 1; i >= 0; i--) if (!pickups[i].fly) pickups.splice(i, 1);
    run.distance = Math.min(run.nextEvent - 20, run.distance + 120);
    run.sec = null; run.secCalmUntil = beatClock() + 2;
    run.flashT = 0.5; shake(8, 0.3); sfx.emp();
  } else if (a.id === 'molt') {
    heal(run, 2);
    p.shrinkT = 3;
    sfx.heart();
  }
  return true;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Lane safety: never let the screen close every lane. A lane is "covered" if a
// high bullet is in flight in it, an active enemy's pattern targets it, a
// kamikaze or hopper is heading for it, or a wall is approaching in it.
// Low waves do not count: they can always be jumped.
// ---------------------------------------------------------------------------
const laneOfX = (x) => Math.max(0, Math.min(LANES - 1, Math.round((x - laneX(0)) / LANE_W)));

// Every lane an enemy can shoot over its whole cycle (all volleys, both sweep
// directions), so alternating patterns like the tank's are fully accounted for.
function threatLanes(type, lane, dir = null) {
  const T = TYPES[type];
  const out = new Set();
  const probe = { lane, T, type, volleys: 0, dir: 1 };
  for (const d of dir === null ? [1, -1] : [dir]) {
    for (const v of [0, 1]) {
      probe.dir = d; probe.volleys = v;
      for (const st of T.steps(probe)) if (!st.low) for (const l of st.lanes) out.add(l);
    }
  }
  if (T.dive) out.add(lane);
  if (type === 'hopper' || type === 'stalker') { out.add(lane - 1); out.add(lane + 1); }
  return out;
}
function patternLanes(e) { return threatLanes(e.type, e.lane, e.type === 'sweeper' ? e.dir : null); }

export function coveredLanes() {
  const c = new Set();
  for (const e of enemies) {
    if (e.dead || e.type === 'boss' || e.state === 'leave') continue;
    for (const l of patternLanes(e)) c.add(l);
  }
  const eb = enemyBullets;
  for (let i = 0; i < eb.n; i++) if (eb.kind[i] !== LOW && eb.y[i] < PLAYER_Y - 30) c.add(laneOfX(eb.x[i]));
  for (const o of obstacles) if (o.type === 'wall' && !o.dead && o.y > -60 && o.y < PLAYER_Y) c.add(o.lane);
  for (const l of [...c]) if (l < 0 || l >= LANES) c.delete(l);
  return c;
}

// ---------------------------------------------------------------------------
// Cells and obstacles never overlap. Both scroll at the track speed, so their
// relative positions are fixed at spawn: whichever comes second checks the
// other. A cell on a TRIPWIRE is allowed on purpose (jump to grab it: risk).
// ---------------------------------------------------------------------------
const CELL_CLEAR = 46;     // px kept free around a barrier, in its lane
const blockedAt = (lane, y) => obstacles.some((o) => !o.dead && o.type === 'wall' && o.lane === lane && Math.abs(o.y - y) < CELL_CLEAR);

function placeCells(lane, n, y0 = -20, gap = 26) {
  for (let i = 0; i < n; i++) {
    const y = y0 - i * gap;
    if (!blockedAt(lane, y)) spawnPickup('coin', lane, y);
  }
}
function placePickup(kind, lane, extra) {
  if (blockedAt(lane, -20)) return false;
  spawnPickup(kind, lane, -20, extra);
  return true;
}
function placeWall(lane, y = -30) {
  spawnObstacle('wall', lane, y);
  for (let i = pickups.length - 1; i >= 0; i--) {
    const pk = pickups[i];
    if (!pk.fly && pk.lane === lane && Math.abs(pk.y - y) < CELL_CLEAR) pickups.splice(i, 1);
  }
}
// A lane with no barrier just entering the screen: where loose cells go.
function openLane(rng) {
  const lanes = [0, 1, 2, 3, 4].filter((l) => !obstacles.some((o) => !o.dead && o.type === 'wall' && o.lane === l && o.y < 60));
  return lanes.length ? rng.pick(lanes) : -1;
}

const MIN_SAFE = 2;
function safeToEnter(type, lane) {
  const covered = coveredLanes();
  const u = new Set(covered);
  for (const l of threatLanes(type, lane)) if (l >= 0 && l < LANES) u.add(l);
  const need = type === 'wall' && covered.size === 0 ? 1 : MIN_SAFE;   // the Wall's point is its one safe lane
  return LANES - u.size >= need;
}

// ---------------------------------------------------------------------------
// Director: plays authored sections (sections.js) back to back on the enemy
// metronome. A section starts on a beat, its events fire at fixed beats, and
// the next one waits until this one is over (enemies gone, rows passed) plus a
// short breather. Nothing overlaps by accident, so every shape is learnable.
// ---------------------------------------------------------------------------
const BEAT = 2;            // ticks per beat
// Big enemies pay one extra coin.
const BIG_ENEMIES = new Set(['crusher', 'throb', 'weaver', 'wall', 'tank']);

const inRange = (x, dist) => x.from <= dist && (x.to === undefined || dist < x.to);

// Fight, run, fight, run: combat sections and obstacle courses alternate, so
// the run breathes between shooting and reading the track.
// Sections are chosen by INTENSITY (generator.js), which rises with distance
// and has no ceiling. Early on, the authored sections teach one idea at a
// time; later most sections are generated to measure, and an authored one only
// shows up now and then when its rating fits (a familiar shape).
function pickSection(run) {
  const wantCourse = run.lastKind === 'combat';
  run.lastKind = wantCourse ? 'course' : 'combat';
  const I = intensity(run.distance);
  // Sawtooth: right after a boss, the intensity of the previous district.
  const target = B.heat(run.distance) <= 0 ? intensity(Math.max(0, run.distance - 1000)) : I;
  const lib = wantCourse ? COURSES : SECTIONS;
  const authored = lib.filter((x) => inRange(x, run.distance) && !run.recentSec.includes(x.id)
    && x.rating >= target - 1.6 && x.rating <= target + 0.6);
  const useAuthored = authored.length && run.rng.chance(target <= 3 ? 0.75 : 0.25);
  if (useAuthored) return run.rng.pick(authored);
  const events = wantCourse ? generateCourse(run.rng, target) : generateCombat(run.rng, target, run.distance);
  return { id: `gen-${run.lastKind}-${Math.round(run.distance)}`, events, generated: true };
}

// Narrow enemies that can reinforce a combat section at high tiers.
const REINFORCEMENTS = ['drone', 'stalker', 'hopper'];

// Courses at tier 4+: rows come faster (2 beats -> 1.5 beats = 3 ticks) and
// one more row joins at the end. Both changes are kept only if the course is
// still survivable (fairness.js), otherwise the authored version plays.
const TAIL_ROWS = ['TTTTT', '.B.B.', 'B.B.B', 'BB.BB', 'TBTBT'];
function tightenCourse(run, events) {
  const rowEvs = events.filter((x) => x.kind === 'row' || x.kind === 'veil');
  if (!rowEvs.length) return events;
  const first = Math.min(...rowEvs.map((x) => x.beat));
  const squeezed = events.map((x) => (x.kind === 'row' || x.kind === 'veil' || x.kind === 'coins'
    ? { ...x, beat: x.beat <= first ? x.beat : first + (x.beat - first) * 0.75 }
    : x));
  let out = survivable(rowsOf(squeezed)).ok ? squeezed : events;
  const last = Math.max(...rowsOf(out).map((x) => x.beat));
  for (const row of [...TAIL_ROWS].sort(() => run.rng.next() - 0.5)) {
    const withTail = [...out, { beat: last + 2, kind: 'row', row }];
    if (survivable(rowsOf(withTail)).ok) { out = withTail; break; }
  }
  return out;
}

function startSection(run, d) {
  const def = pickSection(run);
  if (!def.generated) run.recentSec = [def.id, ...run.recentSec].slice(0, 4);
  const mirror = run.rng.chance(0.5);
  const T = B.tier(run.distance), h = B.heat(run.distance);
  let events = def.events.map((ev) => (mirror ? mirrorEvent(ev) : { ...ev }));
  if (run.lastKind === 'course' && T >= 4) events = tightenCourse(run, events);
  // Reinforcements: from tier 1 a combat section may get one more narrow enemy
  // (two from tier 4), in a lane two away from every enemy of the section.
  // safeToEnter still guards them when they arrive.
  if (run.lastKind === 'combat' && h > 0 && run.rng.chance(B.reinforceChance(T, h))) {
    const taken = events.filter((x) => x.kind === 'enemy').map((x) => x.lane);
    const n = T >= 4 ? 2 : 1;
    for (let k = 0; k < n; k++) {
      const free = [0, 1, 2, 3, 4].filter((l) => taken.every((t) => Math.abs(t - l) >= 2));
      if (!free.length) break;
      const lane = run.rng.pick(free);
      const type = T >= 3 ? run.rng.pick(REINFORCEMENTS) : 'drone';
      events.push({ beat: k * 4, kind: 'enemy', type, lane, reinforcement: true });
      taken.push(lane);
    }
  }
  const now = beatClock();
  const t0 = Math.ceil(now / BEAT) * BEAT + BEAT;          // on the next beat
  const tickSec = TICK_SEC / B.timeMul(d);
  const travelTicks = ((PLAYER_Y + 30) / Math.max(1, run.speed)) / tickSec;
  const evs = events.map((x) => {
    // rows and veils are timed by ARRIVAL; spawn them early by their travel time
    x.at = t0 + x.beat * BEAT - (x.kind === 'row' || x.kind === 'veil' ? travelTicks : 0);
    return x;
  }).sort((p, q) => p.at - q.at);
  run.sec = { id: def.id, evs, i: 0, enemyIds: [], tier: T };
  run.player.carapace = run.stats.carapace;          // CARAPACE regrows every section
}

function direct(run, d) {
  const now = beatClock();
  if (!run.sec) {
    if (now < run.secCalmUntil) return;
    // A course comes next: wait until the last fight's enemies have left, so
    // barriers never combine with a late volley.
    if (run.lastKind === 'combat' && enemies.some((en) => en.type !== 'boss' && !en.dead && en.state !== 'leave')) return;
    startSection(run, d);
  }
  const sec = run.sec;
  while (sec.i < sec.evs.length && sec.evs[sec.i].at <= now) {
    const ev = sec.evs[sec.i];
    // Guard against the tail of the previous section: an enemy enters only if
    // two lanes stay open (the Wall needs a quiet screen). Otherwise the whole
    // rest of the section slides later together, keeping its shape.
    if (ev.kind === 'enemy' && !safeToEnter(ev.type, ev.lane)) {
      const slide = now - (sec.lastNow ?? now) || 0.5;
      for (let k = sec.i; k < sec.evs.length; k++) sec.evs[k].at += slide;
      break;
    }
    sec.i++;
    if (ev.kind === 'enemy') {
      if (!TYPES[ev.type] || TYPES[ev.type].unlockAt > run.distance + 400) continue;
      const en = spawnEnemy(ev.type, ev.lane, d, run.rng, { power: powerRatio(run.stats), elite: run.rng.chance(B.eliteChance(d, B.heat(run.distance))) });
      if (en) sec.enemyIds.push(en.id);
    } else if (ev.kind === 'row') {
      [...ev.row].forEach((ch, l) => {
        if (ch === 'B') placeWall(l);
        else if (ch === 'T') spawnObstacle('low', l);
        else if (ch === 'P') spawnObstacle('rift', l);
      });
    } else if (ev.kind === 'veil') {
      spawnVeil();
    } else if (ev.kind === 'coins') {
      placeCells(ev.lane, ev.n);
    }
  }
  sec.lastNow = now;
  // Over when every event fired, its enemies are near their last volley (or
  // gone), and its obstacles are past the middle of the screen. The next
  // section's enemies need ~1.5 s to enter and telegraph, so it overlaps only
  // with the tail of this one.
  // Deeper tiers let the next section start earlier (more volleys left).
  const left = B.overlapVolleys(sec.tier);
  const busy = (en) => sec.enemyIds.includes(en.id) && !en.dead && en.state !== 'leave' && en.volleys < en.maxVolleys - left;
  if (sec.i >= sec.evs.length && !enemies.some(busy) && !obstacles.some((o) => !o.dead && o.y < H * 0.45)) {
    run.sec = null;
    run.secCalmUntil = now + B.breathBeats(sec.tier) * BEAT;
  }
}

// Runner chunks: coin lines, barriers, walls, gates.
function spawnChunk(run, d) {
  const luck = run.stats.luck;
  const rng = run.rng;
  const lane = rng.int(0, LANES - 1);
  const p = run.player;
  const lockedPool = ITEMS.filter((it) => !unlockedItems(run.save).includes(it.id) && !run.corrupt.includes(it.id));
  const roll = rng.next();

  // Rare specials
  if (lockedPool.length && run.distance > 250 && run.corruptSpawned < 1 + Math.floor(run.distance / 1500) && rng.chance(0.05 + 0.01 * luck)) {
    if (placePickup('corrupt', lane, { itemId: rng.pick(lockedPool).id })) run.corruptSpawned++;
    return;
  }
  if (p.hearts < run.stats.maxHearts && rng.chance(0.05 + 0.01 * luck)) { placePickup('heart', lane); return; }
  if (rng.chance(0.03 + 0.005 * luck)) { placePickup('blue', lane); return; }

  // Everything dangerous comes from the director; chunks only add coins.
  if (roll < 0.5) { const l = openLane(rng); if (l >= 0) placeCells(l, B.COIN_LINE); }
}

// ---------------------------------------------------------------------------
// Events: a boss every EVENT_EVERY metres (the end of each district)
// ---------------------------------------------------------------------------
function startBoss(run) {
  run.warnT = 2.2;
  sfx.bossWarn();
  setMusic('boss', difficulty(run));
}

export function pickItem(run, i) {
  const it = run.pickChoices[i];
  if (!it) return;
  acquire(run, it.id);
  run.pickChoices = [];
  run.mode = 'play';
}

// Skipping a pick patches you up instead (1 heart if hurt).
export function skipPick(run) {
  const p = run.player;
  if (p.hearts < run.stats.maxHearts && heal(run)) sfx.heart(); else sfx.select();
  run.pickChoices = [];
  run.mode = 'play';
}

function onBossKilled(run, b) {
  run.rs.bosses++;
  if (run.stats.hasScatter) run.rs.scatterBoss = true;
  if (!run.bossHit) run.rs.bossNoHit = true;
  if (run.player.hearts === 1) run.rs.boss1Heart = true;
  if (run.stats.repair) heal(run);
  dropCoins(b.x, b.y, 12 + 4 * run.bossIndex);
  // Corrupted items decrypt: unlocked forever
  for (const id of run.corrupt) {
    if (!run.save.extraItems) run.save.extraItems = [];
    if (!run.save.extraItems.includes(id)) run.save.extraItems.push(id);
    toast(run, `DECRYPTED: ${ITEM_BY_ID[id].name}`, 'Unlocked for future runs', PAL.acid, 3.5);
    run.newUnlocks.push(ITEM_BY_ID[id].name);
    sfx.unlock();
  }
  run.corrupt = [];
  writeSave(run.save);
  burst(b.x, b.y, b.color, 80, 380, 1.2, 4);
  burst(b.x, b.y, PAL.white, 30, 200, 0.8, 3);
  shake(14, 0.6);
  sfx.bossDie();
  buzz([40, 40, 90]);
  clearPool(enemyBullets);
  run.boss = null;
  run.bossIndex++;
  run.pending = null;
  run.nextEvent += EVENT_EVERY;
  run.pickDelay = 1.4;
  setMusic('run', difficulty(run));
}

function addCoins(run, n) {
  run.coinFrac += n * run.stats.coinMul;
  const whole = Math.floor(run.coinFrac);
  run.coinFrac -= whole;
  run.coins += whole;
  run.rs.coins += whole;
  // Cells are experience: fill the bar, queue a pick per level gained.
  run.xp += whole;
  // CELL WALL: cells grow blue hearts (HIVE MIND with GREED: faster)
  if (run.stats.cellWall) {
    run.cellWallN = (run.cellWallN || 0) + whole;
    const need = run.stats.hiveMind ? 15 : run.stats.cellWall > 1 ? 18 : 25;
    while (run.cellWallN >= need) { run.cellWallN -= need; run.player.blueHearts++; toast(run, 'CELL WALL +1', '', PAL.blue, 1.4); }
  }
  while (run.xp >= B.xpNeed(run.level)) {
    run.xp -= B.xpNeed(run.level);
    run.level++;
    run.levelUps++;
  }
}

const LEVEL_WAIT = 25;
const calmBetweenSections = (run) => !run.sec && !run.boss && nothingIncoming();
// No high shot reaching the player row within 0.7 s, no obstacle within ~1 s.
function nothingIncoming() {
  const eb = enemyBullets;
  for (let i = 0; i < eb.n; i++) {
    if (eb.y[i] > PLAYER_Y + 10) continue;
    if ((PLAYER_Y - eb.y[i]) / Math.max(1, eb.vy[i]) < 0.7) return false;
  }
  return !obstacles.some((o) => !o.dead && o.y < PLAYER_Y + 20 && o.y > PLAYER_Y - 340);
}

// Per-frame effects of v1.1 items and actives.
function itemEffects(run, dt) {
  const p = run.player, st = run.stats, eb = enemyBullets;
  // PREMONITION (SIXTH SENSE on the last heart: two ticks)
  setTeleBonus(st.premonition ? (st.sixthSense && p.hearts === 1 ? 2 : 1) : 0);
  // SPORE CLOUD: wipe shots in three lanes; MIASMA also poisons enemies there
  if (run.sporeT > 0) {
    run.sporeT -= dt;
    const lo = laneX(run.sporeLane - 1) - LANE_W / 2, hi = laneX(run.sporeLane + 1) + LANE_W / 2;
    for (let i = 0; i < eb.n; i++) if (eb.x[i] > lo && eb.x[i] < hi && eb.y[i] < PLAYER_Y + 20) { burst(eb.x[i], eb.y[i], PAL.acid, 2, 60, 0.2, 1.5); kill(eb, i); i--; }
    if (st.miasma) for (const e of enemies) if (!e.dead && e.x > lo && e.x < hi) { e.poison = Math.max(e.poison, 3); e.poisonT = 3; e.poisoned = true; }
    if (Math.random() < 0.5) burst(laneX(run.sporeLane) + (Math.random() - 0.5) * LANE_W * 3, PLAYER_Y - Math.random() * 260, PAL.acid, 1, 30, 0.5, 2);
  }
  // SECOND SKIN: a blue heart regrows every 45 s up to the starting count
  if (st.secondSkin) {
    const base = st.blueStart + 2 * (run.stacks.icewall || 0);
    if (p.blueHearts < base) { run.skinT = (run.skinT || 0) + dt; if (run.skinT >= 45) { run.skinT = 0; p.blueHearts++; toast(run, 'SECOND SKIN', '', PAL.blue, 1.4); } }
    else run.skinT = 0;
  }
  // UNDERTOW: phasing pulls every cell (and hearts with 2 stacks)
  if (st.undertow && p.phaseT > 0) for (const pk of pickups) if (pk.kind === 'coin' || (st.undertow > 1 && (pk.kind === 'heart' || pk.kind === 'blue'))) pk.fly = true;
  // MIRROR FIELD, EVENT HORIZON timers
  if (run.mirrorT > 0) run.mirrorT -= dt;
  if (run.horizonT > 0) run.horizonT -= dt;
  // BLACK HOLE: shots are pulled toward your lane and destroyed well above you
  if (run.bhT > 0) {
    run.bhT -= dt;
    for (let i = 0; i < eb.n; i++) {
      eb.x[i] += (p.x - eb.x[i]) * Math.min(1, dt * 4);
      if (eb.y[i] > PLAYER_Y - 120) { burst(eb.x[i], eb.y[i], PAL.violet, 3, 80, 0.2, 1.5); kill(eb, i); i--; }
    }
  }
}

// Death clarity: who fired the shot that hit you (nearest shooter in that lane).
function shooterName(run, x, low) {
  if (run.boss) return `${run.boss.name}${low ? ' (low wave)' : ''}`;
  const lane = Math.round((x - laneX(0)) / LANE_W);
  const e = enemies.filter((o) => !o.dead && o.type !== 'boss' && Math.abs(o.lane - lane) <= 1).sort((a, b) => Math.abs(a.lane - lane) - Math.abs(b.lane - lane))[0];
  const who = e ? e.type.toUpperCase() : 'A STRAY SHOT';
  return low ? `${who} (low wave: jump)` : who;
}

// Every heal goes through here: FEVER halves (or thirds) it. Fractions add up.
function heal(run, n = 1, overflowBlue = false) {
  const p = run.player, st = run.stats;
  run.healAcc = (run.healAcc || 0) + n * (st.healMul ?? 1);
  let healed = false;
  while (run.healAcc >= 1) {
    run.healAcc -= 1;
    if (p.hearts < st.maxHearts) { p.hearts++; healed = true; }
    else if (overflowBlue) { p.blueHearts++; healed = true; }
  }
  return healed;
}

function openPick(run, kind) {
  const n = 3 + (run.stats.extraChoices || 0);
  run.pickChoices = rollItems(run.rng, unlockedItems(run.save), run.stacks, n, run.stats.luck, { source: kind });
  run.pickKind = kind;
  if (run.pickChoices.length) { run.mode = 'pick'; run.toasts = []; sfx.select(); return true; }
  // Pool exhausted: a level-up still pays out a heart.
  heal(run);
  return false;
}

export function onCrit(run) {
  if (run.stats.critCoins && run.rng.chance(0.3)) addCoins(run, 1);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function onHurt(run, result) {
  if (result === 'iframe') return;
  // SPORE CLOUD: real damage releases spores over your lane and the next ones
  if (run.stats.spore && (result === 'red' || result === 'blue')) {
    run.sporeT = run.stats.spore > 1 ? 1.4 : 0.8;
    run.sporeLane = run.player.lane;
  }
  buzz(result === 'shield' ? 25 : 70);
  run.wasHit = true;
  if (run.boss) run.bossHit = true;
  sfx[result === 'shield' ? 'shield' : 'hurt']();
}

export function updateRun(run, input, dt) {
  if (run.mode !== 'play') return;
  if (consumeHitStop(dt)) return;

  const p = run.player;
  const st = run.stats;
  const d = difficulty(run);

  // Pause button (top centre) and active item (tap anywhere else)
  if (input.pause || input.blur || (input.tap && input.tapY >= 0 && input.tapY < 40 + SAFE_TOP && Math.abs(input.tapX - W / 2) < 34)) {
    run.mode = 'pause';
    return;
  }
  // Active item: only the button (or E on keyboard), never a stray tap.
  const B_ = ACTIVE_BTN;
  const onBtn = input.tap && input.tapX >= B_.x - 6 && input.tapX <= B_.x + B_.w + 6 && input.tapY >= B_.y - 6 && input.tapY <= B_.y + B_.h + 6;
  if (onBtn || input.active) {
    if (!useActive(run) && run.active) { sfx.deny(); toast(run, `${run.active.charge}/${run.active.max} KILLS`, 'Kill enemies to charge it', PAL.orange, 1.4); }
  }
  // Tap left/right half of the screen = one lane, same as a swipe.
  else if (input.tap && input.tapX >= 0) {
    if (input.tapX < W / 2) input.left = true; else input.right = true;
    input.fromTap = true;
  }

  if (run.pickDelay > 0) {
    run.pickDelay -= dt;
    // the boss loot owns this frame: a queued level opens after it
    if (run.pickDelay <= 0 && openPick(run, 'boss')) return;
  }
  // Level-ups wait in a queue and open only at a calm moment, never in the
  // middle of a dodge: between two sections (or after the boss loot). If the
  // queue has waited LEVEL_WAIT s, the first moment with no shot about to land
  // and no obstacle near is enough.
  if (run.levelUps > 0) run.levelWaitT = (run.levelWaitT || 0) + dt;
  if (run.levelUps > 0 && run.pickDelay <= 0 && run.warnT <= 0 && !p.dead && (calmBetweenSections(run) || (run.levelWaitT > LEVEL_WAIT && nothingIncoming()))) {
    run.levelUps--;
    if (!run.levelUps) run.levelWaitT = 0;
    if (st.parasite && p.hearts > 1) { p.hearts--; toast(run, 'PARASITE FEEDS', '-1 heart', PAL.red, 1.6); }
    sfx.synergy();
    if (openPick(run, 'level')) return;
  }

  if (run.slowT > 0) run.slowT -= dt;
  if (run.overdriveT > 0) run.overdriveT -= dt;
  if (run.flashT > 0) run.flashT -= dt;
  const ts = run.slowT > 0 ? 0.35 : 1;
  const edt = dt * ts;

  run.time += dt;
  const target = 220 + Math.min(260, 40 * Math.log1p(d * 2));
  run.speed = run.boss || run.warnT > 0 ? target * 0.8 : target;
  if (!run.boss && run.warnT <= 0) run.distance += (run.speed / PX_PER_M) * edt;
  run.rs.distance = run.distance;
  updateWorld(edt, run.speed);
  const di = districtIndex(run.distance);
  if (di !== run.district) {
    run.district = di;
    toast(run, `ENTERING ${DISTRICTS[di].name}`, '', DISTRICTS[di].wall, 2.6);
    sfx.select();
  }

  // Checkpoints
  if (!run.pending && !run.boss && run.distance >= run.nextEvent) {
    run.pending = 'boss';
    run.sec = null;                 // drop the rest of the section; the event takes over
    run.eventIndex++;
  }
  if (run.pending && !run.boss && run.warnT <= 0) {
    const clear = enemies.length === 0 && enemyBullets.n === 0 && obstacles.length === 0;
    if (clear) startBoss(run);
  }
  if (run.warnT > 0) {
    run.warnT -= dt;
    if (run.warnT <= 0) { run.boss = makeBoss(run.bossIndex, run.bossOrder[run.bossIndex % run.bossOrder.length], powerRatio(run.stats)); run.bossHit = false; }
  }

  if (!run.pending && !run.boss && run.pickDelay <= 0) {
    direct(run, d);
    run.chunkT -= edt;
    if (run.chunkT <= 0 && run.distance > 40) {
      run.chunkT = Math.max(1.1, 2.0 - d * 0.08);
      spawnChunk(run, d);
    }
  }

  // Player + weapon
  if (run.time > 0.5) tip(run, 'lanes', 'SWIPE OR TAP LEFT / RIGHT', 'Change lane. Lit lanes are about to be shot');
  if (run.time > 8) tip(run, 'phase', 'SWIPE DOWN TO PHASE', 'Brief invulnerability. In the air: fast fall');
  updatePlayer(p, input, dt, st);
  if (p.ev.jump) sfx.jump();
  if (p.ev.lane) sfx.lane();
  if (p.ev.phase) {
    sfx.phase(); run.rs.phases++;
    if (st.ambush) p.ambushT = 1.5;
    if (st.driftKing && st.slipstream) slipBurst(p, st);
  }
  if (p.ambushT > 0) p.ambushT -= dt;
  if (run.slipCd > 0) run.slipCd -= dt;
  if (p.ev.lane && st.slipstream && run.slipCd <= 0) { slipBurst(p, st); run.slipCd = 0.2; }
  if (p.ev.land && st.groundPound) { groundPound(p, st); sfx.explode(); shake(3, 0.12); }
  if (p.ev.shield) sfx.shield();
  if (p.ev.land && st.airRaid) airRaid(p, st);
  if (p.ev.land) {
    sfx.land();
    if (st.kickflip) {
      const eb = enemyBullets;
      for (let i = 0; i < eb.n; i++) {
        if (Math.abs(eb.x[i] - p.x) < LANE_W * 0.5 && eb.y[i] > PLAYER_Y - 220 && eb.y[i] < PLAYER_Y + 20) {
          burst(eb.x[i], eb.y[i], PAL.cyan, 4, 80, 0.2, 1.5);
          kill(eb, i); i--;
        }
      }
      burst(p.x, PLAYER_Y, PAL.cyan, 14, 160, 0.3, 2);
    }
  }
  updateWeapon(p, st, dt, run.overdriveT > 0 ? 3 : 1, { rng: run.rng, onCrit: () => onCrit(run) });
  if (st.wingmen) updateWingmen(p, st, dt);
  if (run.railT > 0) {
    run.railT -= dt;
    run.railTick -= dt;
    while (run.railTick <= 0) {
      run.railTick += 0.04;
      spawn(playerBullets, p.x, PLAYER_Y - 20, 0, -1000, 6, currentDamage(p, st) * 1.5, BIG, 99);
    }
  }
  if (!run.wasHit) run.rs.pureDistance = run.distance;
  steerBullets(st, dt);

  // World
  updateModeBullets(st, dt);
  updatePool(playerBullets, dt);
  updatePool(enemyBullets, edt);
  look.lane = p.lane;
  const c0 = beatClock();
  updateEnemies(edt, d);
  // The music follows the game clock (real seconds per tick, so CHRONO slows it).
  const dc = beatClock() - c0;
  if (dc > 0) syncMusic(beatClock(), dt / dc);
  updateCorpses(edt, run.speed);
  if (run.boss) updateBoss(run.boss, edt, d, p.lane);
  updateObstacles(edt, run.speed);
  updateFx(dt, run.speed);
  updateWeaponFx(dt);
  updateTrails(st, edt, p);

  // Hits on enemies
  resolvePlayerHits(st, { rng: run.rng, onCrit: () => onCrit(run) });
  tickPoison(edt);

  itemEffects(run, dt);

  // Enemy bullets vs player / orbitals
  const eb = enemyBullets;
  const air = isAirborne(p);
  const orbs = st.orbitals ? orbitalPositions(p, st.orbitals) : null;
  for (let i = 0; i < eb.n; i++) {
    const low = eb.kind[i] === LOW;
    if (orbs && !low) {
      let eaten = false;
      for (const o of orbs) {
        const dx = eb.x[i] - o.x, dy = eb.y[i] - o.y;
        if (dx * dx + dy * dy < (run.horizonT > 0 ? 400 : 100)) { eaten = true; burst(o.x, o.y, PAL.blue, 4, 80, 0.2, 1.5); break; }
      }
      if (eaten) { kill(eb, i); i--; continue; }
    }
    const dx = eb.x[i] - p.x, dy = eb.y[i] - PLAYER_Y;
    const hit = low
      ? Math.abs(dx) < LANE_W * 0.4 && Math.abs(dy) < 9
      : dx * dx + dy * dy < (eb.r[i] + p.r * (p.shrinkT > 0 ? 0.7 : 1)) ** 2;
    if (!hit) continue;
    if (low && air) {
      if (!eb.pierce[i]) { eb.pierce[i] = 1; run.rs.lowJumps++; }
      continue;
    }
    // MIRROR FIELD (active): reflect instead of getting hit
    if (run.mirrorT > 0) {
      spawn(playerBullets, eb.x[i], eb.y[i], 0, -480, 4, 2 * st.damageMul, 0, 1);
      burst(eb.x[i], eb.y[i], PAL.cyan, 4, 90, 0.2, 1.5);
      kill(eb, i); i--;
      continue;
    }
    if (isPhased(p)) {
      run.rs.phaseDodges++;
      // SPECTRE (GHOSTROUND + MIRROR SKIN): reflections are ghost shots
      if (st.mirror) spawn(playerBullets, eb.x[i], eb.y[i], 0, -480, 4, 2 * st.damageMul * (st.counter ? 3 : 1) * (st.spectre ? 2 : 1), 0, st.spectre ? 99 : 1);
      burst(eb.x[i], eb.y[i], PAL.white, 4, 90, 0.2, 1.5);
      kill(eb, i); i--;
      continue;
    }
    if (p.iframes > 0) continue;
    run.lastHit = { what: shooterName(run, eb.x[i], low), x: eb.x[i], y: PLAYER_Y, lane: p.lane, color: low ? PAL.orange : PAL.magenta };
    kill(eb, i); i--;
    onHurt(run, hurtPlayer(p, st));
  }

  // Enemy bodies (drones leaving through the player's row)
  if (p.iframes <= 0) {
    for (const e of enemies) {
      if (e.dead || e.type === 'boss') continue;
      const dx = e.x - p.x, dy = e.y - PLAYER_Y;
      if (dx * dx + dy * dy < (e.r + p.r) ** 2) {
        run.lastHit = { what: e.type.toUpperCase(), x: e.x, y: e.y, lane: p.lane, color: e.T.color };
        damageEnemy(e, 999);
        e.noReward = true;
        onHurt(run, hurtPlayer(p, st));
        break;
      }
    }
  }

  // Obstacles
  const hwLane = LANE_W * 0.45;
  for (const o of obstacles) {
    if (o.dead) continue;
    const veil = o.type === 'veil' || o.type === 'rift';
    const overlap = (o.type === 'veil' || Math.abs(o.x - p.x) < hwLane) && Math.abs(o.y - PLAYER_Y) < OB_H[o.type] / 2 + 6;
    if (overlap && !o.hit) {
      if (veil && (p.phaseT > 0 || o.phased)) { if (!o.phased) { o.phased = true; run.rs.phaseDodges++; run.rs.riftDodges = (run.rs.riftDodges || 0) + 1; burst(p.x, PLAYER_Y, PAL.cyan, 14, 180, 0.35, 2); } }
      else if (o.type === 'low' && air) o.jumped = true;
      else if (o.type === 'low' && st.breakLow) {
        o.dead = true;
        burst(o.x, o.y, PAL.orange, 16, 200, 0.4, 2.5);
        shake(3, 0.1);
        addCoins(run, 1);
        run.rs.obstacles++;
        sfx.explode();
      } else if (p.iframes <= 0) {
        o.hit = true;
        const OB_NAME = { wall: ['BARRIER', PAL.magenta], low: ['WIRE (jump it)', PAL.orange], veil: ['VEIL (phase it)', PAL.cyan], rift: ['TEAR (phase it)', PAL.cyan] };
        run.lastHit = { what: OB_NAME[o.type][0], x: o.x, y: o.y, lane: p.lane, color: OB_NAME[o.type][1] };
        onHurt(run, hurtPlayer(p, st));
      }
    }
    if (!o.passed && o.y > PLAYER_Y + 24) {
      o.passed = true;
      if (!o.hit) run.rs.obstacles++;
      if (o.type === 'low' && o.jumped) run.rs.lowJumps++;
    }
  }

  // Jump hint: a low wave or low barrier in my lane will arrive within ~0.6s.
  run.jumpHint = false;
  if (!air && st.canJump) {
    for (let i = 0; i < eb.n && !run.jumpHint; i++) {
      if (eb.kind[i] !== LOW || Math.abs(eb.x[i] - p.x) > LANE_W * 0.5 || eb.y[i] > PLAYER_Y) continue;
      const t = (PLAYER_Y - eb.y[i]) / Math.max(1, eb.vy[i]);
      if (t < 0.6) run.jumpHint = true;
    }
    for (const o of obstacles) {
      if (o.type !== 'low' || o.dead || o.lane !== p.lane || o.y > PLAYER_Y) continue;
      if ((PLAYER_Y - o.y) / Math.max(1, run.speed) < 0.6) run.jumpHint = true;
    }
  }
  // Phase hint: a veil will reach me within ~0.5s and I am not phased.
  run.phaseHint = p.phaseT <= 0 && obstacles.some((o) => (o.type === 'veil' || (o.type === 'rift' && o.lane === p.lane)) && !o.dead && o.y < PLAYER_Y && (PLAYER_Y - o.y) / Math.max(1, run.speed) < 0.5);
  if (run.phaseHint) tip(run, 'veil', 'SWIPE DOWN TO PHASE', 'Cyan tears cannot be dodged or jumped: phase through them');
  if (run.jumpHint) tip(run, 'jump', 'SWIPE UP TO JUMP', 'Jump clears orange low waves and barriers only');

  // Pickups
  const got = updatePickups(edt, run.speed, p, PLAYER_Y, st.magnet);
  for (const g of got) {
    if (g.kind === 'coin') { addCoins(run, 1); sfx.coin(); }
    else if (g.kind === 'heart') { heal(run, 1, true); sfx.heart(); }
    else if (g.kind === 'blue') { p.blueHearts++; sfx.heart(); }
    else if (g.kind === 'corrupt') {
      run.corrupt.push(g.itemId);
      acquire(run, g.itemId, true);
      toast(run, `CORRUPTED: ${ITEM_BY_ID[g.itemId].name}`, 'Beat the next boss to decrypt it', PAL.magenta, 3.5);
      sfx.synergy();
      run.flashT = 0.25;
    }
  }

  // Rewards for dead enemies
  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.dead) continue;
    enemies.splice(i, 1); i--;
    if (e.type === 'boss') { onBossKilled(run, e); continue; }
    if (e.noReward) continue;
    run.rs.kills++;
    if (p.jumpT > 0) run.rs.airKills = (run.rs.airKills || 0) + 1;
    if (e.poisoned) run.rs.toxinKills++;
    if (st.hasBeam) run.rs.laserKills = (run.rs.laserKills || 0) + 1;
    if (st.chain) {
      const radius = (34 + 10 * st.chain) * (st.domino ? 1.5 : 1);
      const dmg = currentDamage(p, st) * 1.2 * st.chain;
      addRing(e.x, e.y, radius);
      for (const o of enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < radius + o.r) damageEnemy(o, dmg);
      sfx.explode();
    }
    // SHRAPNEL: the kill bursts into acid shards, each aimed at one of the
    // nearest living enemies (they hold at about the same height, so shards
    // flying straight up would hit nothing). Leftovers fan out upward. Shards
    // carry the shot traits: rockets explode (GRENADE with CHAIN too), toxin
    // poisons twice (SPORE BURST). With the LASER they are instant beams
    // (REFRACTION). Capped per kill.
    if (st.shrapnel) {
      const n = Math.min(24, 3 + 2 * (st.shrapnel - 1));
      // part of the dead enemy's toughness rides on every shard, so shrapnel
      // stays meaningful against the HP of any tier and any build
      const dmg = (currentDamage(p, st) * 0.6 + 0.5 * (e.maxHp || 0)) * (1 + 0.5 * (st.shrapnel - 1));
      const targets = enemies.filter((o) => !o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 300)
        .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y));
      const flags = (st.hasRocket || st.grenade ? F_EXPLODE : 0) | (st.sporeBurst ? F_TOXIC : 0);
      for (let k = 0; k < n; k++) {
        const t = targets.length ? targets[k % targets.length] : null;
        if (t && st.hasBeam) {                        // REFRACTION: instant
          flashLine(e.x, e.y, t.x, t.y);
          damageEnemy(t, dmg);
          if (st.sporeBurst || st.toxin) { t.poison = Math.max(t.poison, (st.toxin || 1) * (st.sporeBurst ? 2 : 1)); t.poisonT = 3; t.poisoned = true; }
          continue;
        }
        let vx, vy;
        if (t) { const d = Math.hypot(t.x - e.x, t.y - e.y) || 1; vx = (t.x - e.x) / d * 560; vy = (t.y - e.y) / d * 560; }
        else { const a = -Math.PI / 2 + (k / Math.max(1, n - 1) - 0.5) * 1.6; vx = Math.cos(a) * 520; vy = Math.sin(a) * 520; }
        const bi = spawn(playerBullets, e.x, e.y, vx, vy, 2.4, dmg, 0, st.pierce);
        if (bi < 0) break;
        // lane -2 = a shard chasing enemy `aux` (weapon.js updateModeBullets)
        playerBullets.lane[bi] = t ? -2 : -1; playerBullets.aux[bi] = t ? t.id : 0; playerBullets.flags[bi] = flags; playerBullets.lastHit[bi] = e.id;
      }
    }
    if (st.leech) {
      run.leechKills++;
      const need = st.leech >= 2 ? 22 : 30;
      if (run.leechKills >= need && p.hearts < st.maxHearts) { heal(run); run.leechKills = 0; sfx.heart(); toast(run, 'LEECH +1', '', PAL.red, 1.5); }
      else run.leechKills = Math.min(run.leechKills, need);
    }
    const n = 1 + (st.toxinCoins && e.poisoned ? 1 : 0) + (BIG_ENEMIES.has(e.type) ? 1 : 0) + (e.elite ? 2 : 0);
    if (e.elite) run.rs.elites = (run.rs.elites || 0) + 1;
    dropCoins(e.x, e.y, n);
    if (run.active) {
      run.active.charge = Math.min(run.active.max, run.active.charge + 1);
      if (run.active.charge === run.active.max && !run.active.told) {
        run.active.told = true;
        toast(run, `${ITEM_BY_ID[run.active.id].name} READY`, 'Tap the orange button', PAL.orange, 2.5);
        sfx.select();
      }
    }
    sfx.kill();
  }

  // Achievements (live, throttled)
  run.achT -= dt;
  if (run.achT <= 0) {
    run.achT = 0.5;
    for (const a of checkAchievements(run.save, run.rs)) {
      const rw = rewardOf(a.id);
      toast(run, `UNLOCKED: ${a.name}`, rw ? `+ ${rw.name}` : a.desc, PAL.acid, 3.5);
      if (rw) run.newUnlocks.push(rw.name);
      sfx.unlock();
      writeSave(run.save);
    }
  }

  for (let i = 0; i < run.toasts.length; i++) { run.toasts[i].t -= dt; if (run.toasts[i].t <= 0) { run.toasts.splice(i, 1); i--; } }

  setMusic(run.boss || run.warnT > 0 ? 'boss' : 'run', d);

  // SYMBIONT EGG: once per run, death hatches you again
  if (p.dead && st.egg && !run.eggUsed) {
    run.eggUsed = true;
    p.dead = false; p.hearts = 1; p.iframes = 2;
    clearPool(enemyBullets);
    burst(p.x, PLAYER_Y, PAL.acid, 50, 260, 0.9, 3);
    toast(run, 'THE EGG HATCHES', 'Second life', PAL.acid, 2.5);
    sfx.heart();
  }
  if (p.dead) endRun(run);
}

export function endRun(run) {
  run.mode = 'dead';
  run.deadT = 0;
  sfx.death();
  buzz([120, 60, 180]);
  const s = run.save;
  const rs = run.rs;
  // What kills players: tells us which sections are unfair.
  if (run.lastHit) { if (!s.deathBy) s.deathBy = {}; const k = run.lastHit.what.split(' (')[0]; s.deathBy[k] = (s.deathBy[k] || 0) + 1; }
  // Run-only achievements already checked live; merge totals then check the rest.
  for (const a of checkAchievements(s, rs)) {
    const rw = rewardOf(a.id);
    if (rw) run.newUnlocks.push(rw.name);
  }
  for (const k of ['kills', 'bosses', 'coins', 'purchases', 'phaseDodges', 'lowJumps', 'obstacles', 'toxinKills', 'elites', 'laserKills', 'airKills', 'riftDodges']) s.totals[k] = (s.totals[k] || 0) + (rs[k] || 0);
  if (run.daily) s.totals.dailies++;
  s.totals.distance += Math.floor(rs.distance);
  if (run.daily) {
    if (s.daily.date !== run.dailyKey) s.daily = { date: run.dailyKey, best: 0 };
    run.newDailyBest = rs.distance > s.daily.best;
    if (run.newDailyBest) s.daily.best = Math.floor(rs.distance);
  }
  run.newBest = rs.distance > s.best;
  if (run.newBest) s.best = Math.floor(rs.distance);
  for (const a of checkAchievements(s, null)) {
    const rw = rewardOf(a.id);
    if (rw) run.newUnlocks.push(rw.name);
  }
  writeSave(s);
  setMusic('menu');
}

export function updateDead(run, dt) {
  run.deadT += dt;
  updateFx(dt, 0);
}
