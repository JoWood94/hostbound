// One run: spawning, collisions, rewards, boss/shop events, actives, achievements.
// Modes: play | pick (item after boss) | shop | pause | dead
import { W, H, SAFE_TOP } from '../core/canvas.js';
import { makeRng, randomSeed } from '../core/rng.js';
import { writeSave } from '../core/save.js';
import { PAL } from '../render/palette.js';
import { burst, shake, updateFx, consumeHitStop } from '../render/fx.js';
import { LOW, BIG, playerBullets, enemyBullets, updatePool, clearPool, kill, spawn } from './bullets.js';
import { makePlayer, updatePlayer, hurtPlayer, isAirborne, isPhased, orbitalPositions, PLAYER_Y } from './player.js';
import { enemies, TYPES, NARROW_TYPES, spawnEnemy, updateEnemies, damageEnemy, clearEnemies, updateCorpses, look } from './enemies.js';
import { updateWorld, LANES, LANE_W, PX_PER_M, DISTRICTS, districtIndex, laneX } from './world.js';
import { obstacles, spawnObstacle, spawnGate, spawnVeil, updateObstacles, clearObstacles, OB_H } from './obstacles.js';
import { pickups, spawnPickup, spawnCoinLine, dropCoins, updatePickups, clearPickups } from './pickups.js';
import { ITEMS, ITEM_BY_ID, computeStats, rollItems, RARITY, powerRatio } from './items.js';
import { activeCombos } from './combos.js';
import * as B from './balance.js';
import { BOARD_BY_ID } from './boards.js';
import { makeBoss, updateBoss, BOSSES } from './boss.js';
import { updateWeapon, steerBullets, resolvePlayerHits, tickPoison, updateWeaponFx, clearWeaponFx, currentDamage, updateWingmen, groundPound, slipBurst, addRing, updateModeBullets } from './weapon.js';
import { checkAchievements, unlockedItems, rewardOf } from './achievements.js';
import { sfx } from '../audio/audio.js';
import { setMusic } from '../audio/music.js';
import { buzz } from '../core/haptics.js';
import { ACTIVE_BTN } from '../ui/hud.js';

export const EVENT_EVERY = 600;       // metres between boss / market checkpoints

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
    spawnT: 2.0, chunkT: 1.5,
    coins: 0, coinFrac: 0,
    rs: { distance: 0, kills: 0, bosses: 0, coins: 0, purchases: 0, phaseDodges: 0, lowJumps: 0,
      obstacles: 0, toxinKills: 0, phases: 0, defItems: 0, bossNoHit: false, boss1Heart: false,
      elites: 0, pureDistance: 0, daily: false },
    mode: 'play',
    nextEvent: EVENT_EVERY, eventIndex: 0, pending: null, warnT: 0,
    boss: null, bossIndex: 0, bossHit: false, pickDelay: 0,
    shopIndex: 0, shopSlots: [], rerollCost: B.REROLL_BASE, freeShop: !!board.freeShop,
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
  // Boss order is shuffled per run (Fisher-Yates on the run seed).
  run.bossOrder = BOSSES.map((_, i) => i);
  for (let i = run.bossOrder.length - 1; i > 0; i--) {
    const j = run.rng.int(0, i);
    [run.bossOrder[i], run.bossOrder[j]] = [run.bossOrder[j], run.bossOrder[i]];
  }

  clearPool(playerBullets);
  clearPool(enemyBullets);
  clearEnemies();
  clearObstacles();
  clearPickups();
  clearWeaponFx();

  // Starting items from the board ('?' = random unlocked non-active item)
  const pool = unlockedItems(save).filter((id) => ITEM_BY_ID[id].cat !== 'active');
  for (const id of board.start) {
    const pick = id === '?' ? run.rng.pick(pool.filter((x) => (run.stacks[x] || 0) < ITEM_BY_ID[x].max)) : id;
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
    if (p.hearts < run.stats.maxHearts) p.hearts++; else p.blueHearts++;
    sfx.heart();
  }
  return true;
}

// ---------------------------------------------------------------------------
// Spawning
// ---------------------------------------------------------------------------
function pickType(run) {
  const pool = Object.keys(TYPES).filter((k) => TYPES[k].unlockAt <= run.distance);
  let t = run.rng.pick(pool);
  if (t === run.lastType && pool.length > 1) t = run.rng.pick(pool);   // fewer repeats
  return t;
}

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

// Lanes a not-yet-spawned enemy would threaten.
const candidateLanes = (type, lane) => threatLanes(type, lane);

const MIN_SAFE = 2;
function safeToAdd(covered, type, lane) {
  const u = new Set(covered);
  for (const l of candidateLanes(type, lane)) if (l >= 0 && l < LANES) u.add(l);
  // The Wall's whole point is the one safe lane under it: allowed only on an
  // otherwise quiet screen.
  const need = TYPES[type].solo && covered.size === 0 ? 1 : MIN_SAFE;
  return LANES - u.size >= need ? u : null;
}

function spawnEnemies(run, dt, d) {
  const busy = new Set();
  for (const e of enemies) if (e.type !== 'boss' && e.state !== 'leave') busy.add(e.lane);
  // A wide enemy was drawn: hold new spawns until the screen is clear, then it
  // enters alone (a short duel). Without this, wide types almost never appear
  // late in the run, when the screen is rarely empty.
  if (run.queuedWide) {
    if (busy.size > 0) { run.spawnT = Math.max(run.spawnT, 0.3); return; }
    run.spawnT -= dt;
    if (run.spawnT > 0) return;
  }
  if (busy.size >= B.maxActive(d)) { run.spawnT = Math.max(run.spawnT, 0.7); return; }
  run.spawnT -= dt;
  if (run.spawnT > 0) return;
  run.spawnT = B.spawnGap(d);
  const free = [];
  for (let l = 0; l < LANES; l++) {
    let ok = true;
    for (const b of busy) if (Math.abs(b - l) < 2) ok = false;
    if (ok) free.push(l);
  }
  if (!free.length) return;

  // Wide patterns only when alone on screen: queue them.
  let type = run.queuedWide || pickType(run);
  if (TYPES[type].wide && busy.size > 0) {
    // Half the time wait for a clear screen (a duel), half the time swap for a
    // narrow enemy so the pressure does not drop.
    if (run.rng.chance(0.5)) { run.queuedWide = type; run.spawnT = 0.4; return; }
    type = run.rng.pick(NARROW_TYPES.filter((k) => TYPES[k].unlockAt <= run.distance));
  }
  run.queuedWide = null;
  const opts = () => ({ power: powerRatio(run.stats), elite: run.rng.chance(B.eliteChance(d)) });

  // Pick a lane that keeps at least MIN_SAFE lanes open; fall back to a drone; else wait.
  let covered = coveredLanes();
  const lanes = [...free].sort(() => run.rng.next() - 0.5);
  let lane = -1;
  for (const l of lanes) { const u = safeToAdd(covered, type, l); if (u) { lane = l; covered = u; break; } }
  if (lane < 0 && type !== 'drone') {
    type = 'drone';
    for (const l of lanes) { const u = safeToAdd(covered, type, l); if (u) { lane = l; covered = u; break; } }
  }
  if (lane < 0) { run.spawnT = 0.5; return; }
  spawnEnemy(type, lane, d, run.rng, opts());
  run.lastType = type;

  // Squads: from ~1000 m, sometimes a second narrow enemy joins, if still safe.
  if (d >= 2.5 && !TYPES[type].wide && busy.size + 2 <= B.maxActive(d) && run.rng.chance(0.3)) {
    const pair = lanes.filter((l) => Math.abs(l - lane) >= 2 && safeToAdd(covered, type, l));
    if (pair.length) spawnEnemy(type, run.rng.pick(pair), d, run.rng, opts());
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
    spawnPickup('corrupt', lane, -20, { itemId: rng.pick(lockedPool).id });
    run.corruptSpawned++;
    return;
  }
  if (p.hearts < run.stats.maxHearts && rng.chance(0.05 + 0.01 * luck)) { spawnPickup('heart', lane, -20); return; }
  if (rng.chance(0.03 + 0.005 * luck)) { spawnPickup('blue', lane, -20); return; }

  if (d >= 3 && roll < 0.12 && enemies.length === 0) {
    const gap = rng.int(0, LANES - 1);
    spawnGate(gap);
    spawnCoinLine(gap, 3, -60);
  } else if (d >= 0.3 && roll < 0.4) {
    spawnObstacle('low', lane);
    spawnCoinLine(lane, 2, -50, 22);
  } else if (d >= 0.15 && roll < 0.65 && LANES - new Set([...coveredLanes(), lane]).size >= MIN_SAFE) {
    spawnObstacle('wall', lane);
    const side = lane === 0 ? 1 : lane === LANES - 1 ? LANES - 2 : lane + (rng.chance(0.5) ? 1 : -1);
    spawnCoinLine(side, B.COIN_LINE - 1);
    if (d >= 1.5 && rng.chance(0.4)) {
      const other = (lane + 2 + rng.int(0, 1)) % LANES;
      if (Math.abs(other - lane) >= 2) {
        const wantWall = rng.chance(0.5) && LANES - new Set([...coveredLanes(), lane, other]).size >= MIN_SAFE;
        spawnObstacle(wantWall ? 'wall' : 'low', other, -60);
      }
    }
  } else if (d >= 0.4 && roll < 0.72 && run.distance - (run.lastVeil ?? -1e9) > 140 && !obstacles.some((o) => o.y < 120)) {
    // Rift veil: nothing else on that row, and never two close together
    // (the phase cooldown must always be ready for it).
    spawnVeil();
    run.lastVeil = run.distance;
  } else {
    spawnCoinLine(lane, B.COIN_LINE);
  }
}

// ---------------------------------------------------------------------------
// Events: boss and black market alternate every EVENT_EVERY metres
// ---------------------------------------------------------------------------
function startBoss(run) {
  run.warnT = 2.2;
  sfx.bossWarn();
  setMusic('boss', difficulty(run));
}

function openShop(run) {
  run.mode = 'shop';
  run.toasts = [];
  if (run.stats.interest) {
    const gain = Math.min(15 * run.stats.interest, Math.floor(run.coins * 0.15 * run.stats.interest));
    if (gain > 0) { run.coins += gain; toast(run, `INTEREST +¤${gain}`, '', PAL.acid, 3); }
  }
  setMusic('shop');
  const items = rollItems(run.rng, unlockedItems(run.save), run.stacks, 3, run.stats.luck);
  const free = run.freeShop;
  const si = run.shopIndex;
  run.shopSlots = [
    ...items.map((it) => ({ kind: 'item', id: it.id, price: free ? 0 : B.itemPrice(it.rarity, si), sold: false })),
    { kind: 'heal', price: B.healPrice(si), sold: false },
    { kind: 'blue', price: B.bluePrice(si), sold: false },
  ];
  run.freeShop = false;
  run.shopIndex++;
}

export function shopBuy(run, i) {
  const s = run.shopSlots[i];
  if (!s || s.sold) return;
  const p = run.player;
  if (s.kind === 'heal' && p.hearts >= run.stats.maxHearts) { sfx.deny(); return; }
  if (run.coins < s.price) { sfx.deny(); return; }
  run.coins -= s.price;
  s.sold = true;
  run.rs.purchases++;
  if (s.kind === 'item') acquire(run, s.id);
  else if (s.kind === 'heal') { p.hearts++; sfx.heart(); }
  else if (s.kind === 'blue') { p.blueHearts++; sfx.heart(); }
  sfx.buy();
}

export function shopReroll(run) {
  if (run.coins < run.rerollCost) { sfx.deny(); return; }
  run.coins -= run.rerollCost;
  run.rerollCost += B.REROLL_STEP;
  const items = rollItems(run.rng, unlockedItems(run.save), run.stacks, 3, run.stats.luck);
  const rest = run.shopSlots.filter((s) => s.kind !== 'item');
  run.shopSlots = [...items.map((it) => ({ kind: 'item', id: it.id, price: B.itemPrice(it.rarity, run.shopIndex - 1), sold: false })), ...rest];
  sfx.select();
}

export function shopLeave(run) {
  run.mode = 'play';
  run.nextEvent += EVENT_EVERY;
  run.pending = null;
  setMusic('run', difficulty(run));
  sfx.select();
}

export function pickItem(run, i) {
  const it = run.pickChoices[i];
  if (!it) return;
  acquire(run, it.id);
  run.pickChoices = [];
  run.mode = 'play';
}

export function skipPick(run) {
  addCoins(run, B.SKIP_COINS);
  run.pickChoices = [];
  run.mode = 'play';
  sfx.coin();
}

function onBossKilled(run, b) {
  run.rs.bosses++;
  if (run.stats.hasScatter) run.rs.scatterBoss = true;
  if (!run.bossHit) run.rs.bossNoHit = true;
  if (run.player.hearts === 1) run.rs.boss1Heart = true;
  if (run.stats.repair && run.player.hearts < run.stats.maxHearts) run.player.hearts++;
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
}

export function onCrit(run) {
  if (run.stats.critCoins && run.rng.chance(0.3)) addCoins(run, 1);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------
function onHurt(run, result) {
  if (result === 'iframe') return;
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
  }

  if (run.pickDelay > 0) {
    run.pickDelay -= dt;
    if (run.pickDelay <= 0) {
      run.pickChoices = rollItems(run.rng, unlockedItems(run.save), run.stacks, 3, st.luck);
      if (run.pickChoices.length) { run.mode = 'pick'; run.toasts = []; sfx.select(); }
    }
  }

  if (run.slowT > 0) run.slowT -= dt;
  if (run.overdriveT > 0) run.overdriveT -= dt;
  if (run.flashT > 0) run.flashT -= dt;
  const ts = run.slowT > 0 ? 0.35 : 1;
  const edt = dt * ts;

  run.time += dt;
  const target = 220 + Math.min(260, 40 * Math.log1p(d * 2));
  run.speed = run.boss || run.warnT > 0 ? target * 0.55 : target;
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
    run.pending = run.eventIndex % 2 === 0 ? 'boss' : 'shop';
    run.eventIndex++;
  }
  if (run.pending && !run.boss && run.warnT <= 0) {
    const clear = enemies.length === 0 && enemyBullets.n === 0 && obstacles.length === 0;
    if (clear) {
      if (run.pending === 'boss') startBoss(run);
      else openShop(run);
      if (run.mode !== 'play') return;
    }
  }
  if (run.warnT > 0) {
    run.warnT -= dt;
    if (run.warnT <= 0) { run.boss = makeBoss(run.bossIndex, run.bossOrder[run.bossIndex % run.bossOrder.length], powerRatio(run.stats)); run.bossHit = false; }
  }

  if (!run.pending && !run.boss && run.pickDelay <= 0) {
    spawnEnemies(run, edt, d);
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
  updateEnemies(edt, d);
  updateCorpses(edt, run.speed);
  if (run.boss) updateBoss(run.boss, edt, d, p.lane);
  updateObstacles(edt, run.speed);
  updateFx(dt, run.speed);
  updateWeaponFx(dt);

  // Hits on enemies
  resolvePlayerHits(st, { rng: run.rng, onCrit: () => onCrit(run) });
  tickPoison(edt);

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
        if (dx * dx + dy * dy < 100) { eaten = true; burst(o.x, o.y, PAL.blue, 4, 80, 0.2, 1.5); break; }
      }
      if (eaten) { kill(eb, i); i--; continue; }
    }
    const dx = eb.x[i] - p.x, dy = eb.y[i] - PLAYER_Y;
    const hit = low
      ? Math.abs(dx) < LANE_W * 0.4 && Math.abs(dy) < 9
      : dx * dx + dy * dy < (eb.r[i] + p.r) ** 2;
    if (!hit) continue;
    if (low && air) {
      if (!eb.pierce[i]) { eb.pierce[i] = 1; run.rs.lowJumps++; }
      continue;
    }
    if (isPhased(p)) {
      run.rs.phaseDodges++;
      if (st.mirror) spawn(playerBullets, eb.x[i], eb.y[i], 0, -480, 4, 2 * st.damageMul * (st.counter ? 3 : 1), 0, 1);
      burst(eb.x[i], eb.y[i], PAL.white, 4, 90, 0.2, 1.5);
      kill(eb, i); i--;
      continue;
    }
    if (p.iframes > 0) continue;
    kill(eb, i); i--;
    onHurt(run, hurtPlayer(p, st));
  }

  // Enemy bodies (drones leaving through the player's row)
  if (p.iframes <= 0) {
    for (const e of enemies) {
      if (e.dead || e.type === 'boss') continue;
      const dx = e.x - p.x, dy = e.y - PLAYER_Y;
      if (dx * dx + dy * dy < (e.r + p.r) ** 2) {
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
    const veil = o.type === 'veil';
    const overlap = (veil || Math.abs(o.x - p.x) < hwLane) && Math.abs(o.y - PLAYER_Y) < OB_H[o.type] / 2 + 6;
    if (overlap && !o.hit) {
      if (veil && (p.phaseT > 0 || o.phased)) { if (!o.phased) { o.phased = true; run.rs.phaseDodges++; burst(p.x, PLAYER_Y, PAL.cyan, 14, 180, 0.35, 2); } }
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
  run.phaseHint = p.phaseT <= 0 && obstacles.some((o) => o.type === 'veil' && !o.dead && o.y < PLAYER_Y && (PLAYER_Y - o.y) / Math.max(1, run.speed) < 0.5);
  if (run.phaseHint) tip(run, 'veil', 'SWIPE DOWN TO PHASE', 'Cyan veils cover every lane: phase through them');
  if (run.jumpHint) tip(run, 'jump', 'SWIPE UP TO JUMP', 'Jump clears orange low waves and barriers only');

  // Pickups
  const got = updatePickups(edt, run.speed, p, PLAYER_Y, st.magnet);
  for (const g of got) {
    if (g.kind === 'coin') { addCoins(run, 1); sfx.coin(); }
    else if (g.kind === 'heart') { if (p.hearts < st.maxHearts) p.hearts++; else p.blueHearts++; sfx.heart(); }
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
    if (e.poisoned) run.rs.toxinKills++;
    if (st.hasBeam) run.rs.laserKills = (run.rs.laserKills || 0) + 1;
    if (st.chain) {
      const radius = (34 + 10 * st.chain) * (st.domino ? 1.5 : 1);
      const dmg = currentDamage(p, st) * 1.2 * st.chain;
      addRing(e.x, e.y, radius);
      for (const o of enemies) if (!o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < radius + o.r) damageEnemy(o, dmg);
      sfx.explode();
    }
    if (st.leech) {
      run.leechKills++;
      const need = st.leech >= 2 ? 22 : 30;
      if (run.leechKills >= need && p.hearts < st.maxHearts) { p.hearts++; run.leechKills = 0; sfx.heart(); toast(run, 'LEECH +1', '', PAL.red, 1.5); }
      else run.leechKills = Math.min(run.leechKills, need);
    }
    const n = 1 + (st.toxinCoins && e.poisoned ? 1 : 0) + (TYPES[e.type].wide ? 1 : 0) + (e.elite ? 2 : 0);
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

  if (p.dead) endRun(run);
}

export function endRun(run) {
  run.mode = 'dead';
  run.deadT = 0;
  sfx.death();
  buzz([120, 60, 180]);
  const s = run.save;
  const rs = run.rs;
  // Run-only achievements already checked live; merge totals then check the rest.
  for (const a of checkAchievements(s, rs)) {
    const rw = rewardOf(a.id);
    if (rw) run.newUnlocks.push(rw.name);
  }
  for (const k of ['kills', 'bosses', 'coins', 'purchases', 'phaseDodges', 'lowJumps', 'obstacles', 'toxinKills', 'elites', 'laserKills']) s.totals[k] += rs[k] || 0;
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
