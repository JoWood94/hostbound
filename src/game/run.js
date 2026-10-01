// One run: spawning, collisions, rewards, boss/shop events, actives, achievements.
// Modes: play | pick (item after boss) | shop | pause | dead
import { W, H } from '../core/canvas.js';
import { makeRng, randomSeed } from '../core/rng.js';
import { writeSave } from '../core/save.js';
import { PAL } from '../render/palette.js';
import { burst, shake, updateFx, consumeHitStop } from '../render/fx.js';
import { LOW, playerBullets, enemyBullets, updatePool, clearPool, kill, spawn } from './bullets.js';
import { makePlayer, updatePlayer, hurtPlayer, isAirborne, isPhased, orbitalPositions, PLAYER_Y } from './player.js';
import { enemies, TYPES, NARROW_TYPES, spawnEnemy, updateEnemies, damageEnemy, clearEnemies } from './enemies.js';
import { updateWorld, LANES, LANE_W, PX_PER_M } from './world.js';
import { obstacles, spawnObstacle, spawnGate, updateObstacles, clearObstacles, OB_H } from './obstacles.js';
import { pickups, spawnPickup, spawnCoinLine, dropCoins, updatePickups, clearPickups } from './pickups.js';
import { ITEMS, ITEM_BY_ID, computeStats, rollItems, activeSynergies, RARITY } from './items.js';
import { BOARD_BY_ID } from './boards.js';
import { makeBoss, updateBoss } from './boss.js';
import { updateWeapon, steerBullets, resolvePlayerHits, tickPoison, updateWeaponFx, clearWeaponFx } from './weapon.js';
import { checkAchievements, unlockedItems, rewardOf } from './achievements.js';
import { sfx } from '../audio/audio.js';
import { setMusic } from '../audio/music.js';

export const EVENT_EVERY = 600;       // metres between boss / market checkpoints
const PRICE = [18, 30, 45];

export function createRun(save) {
  const seed = randomSeed();
  const board = BOARD_BY_ID[save.board] || BOARD_BY_ID.stock;
  const run = {
    seed, rng: makeRng(seed), save, board,
    stacks: {}, stats: null, player: null,
    distance: 0, time: 0, speed: 220,
    spawnT: 2.0, chunkT: 1.5,
    coins: 0, coinFrac: 0,
    rs: { distance: 0, kills: 0, bosses: 0, coins: 0, purchases: 0, phaseDodges: 0, lowJumps: 0,
      obstacles: 0, toxinKills: 0, phases: 0, defItems: 0, bossNoHit: false, boss1Heart: false },
    mode: 'play',
    nextEvent: EVENT_EVERY, eventIndex: 0, pending: null, warnT: 0,
    boss: null, bossIndex: 0, bossHit: false, pickDelay: 0,
    shopIndex: 0, shopSlots: [], rerollCost: 6, freeShop: !!board.freeShop,
    pickChoices: [],
    active: null, overdriveT: 0, slowT: 0, flashT: 0,
    toasts: [], newUnlocks: [],
    synergies: new Set(),
    corrupt: [],               // item ids picked from corrupted drops, unlocked at next boss kill
    corruptSpawned: 0,
    achT: 0, deadT: 0,
  };
  run.stats = computeStats(board, run.stacks);
  run.player = makePlayer(run.stats, board.color);

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
  if (it.cat === 'active') {
    if (run.active) delete run.stacks[run.active.id];
    run.active = { id, charge: 0, max: it.active.charge };
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
  run.rs.defItems = ITEMS.filter((x) => x.cat === 'defense' && run.stacks[x.id] > 0).length;

  if (!silent) { sfx.pickup(); toast(run, it.name, it.desc.length < 44 ? it.desc : '', RARITY[it.rarity].color); }

  for (const sy of activeSynergies(run.stacks)) {
    if (run.synergies.has(sy.id)) continue;
    run.synergies.add(sy.id);
    toast(run, `SYNERGY: ${sy.name}`, sy.desc, PAL.magenta, 3.2);
    sfx.synergy();
    run.flashT = 0.3;
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
  return run.rng.pick(pool);
}

function spawnEnemies(run, dt, d) {
  const busy = new Set();
  for (const e of enemies) if (e.type !== 'boss' && e.state !== 'leave') busy.add(e.lane);
  const maxActive = d < 2 ? 1 : d < 5 ? 2 : 3;
  if (busy.size >= maxActive) { run.spawnT = Math.max(run.spawnT, 0.8); return; }
  run.spawnT -= dt;
  if (run.spawnT > 0) return;
  run.spawnT = Math.max(1.2, 2.2 - d * 0.1);
  const free = [];
  for (let l = 0; l < LANES; l++) {
    let ok = true;
    for (const b of busy) if (Math.abs(b - l) < 2) ok = false;
    if (ok) free.push(l);
  }
  // Wide patterns only when alone on screen, so a safe option always exists.
  let type = pickType(run);
  if (busy.size > 0 && TYPES[type].wide) {
    const narrow = NARROW_TYPES.filter((k) => TYPES[k].unlockAt <= run.distance);
    type = run.rng.pick(narrow);
  }
  if (free.length) spawnEnemy(type, run.rng.pick(free), d, run.rng);
}

// Runner chunks: coin lines, barriers, walls, gates.
function spawnChunk(run, d) {
  const rng = run.rng;
  const lane = rng.int(0, LANES - 1);
  const p = run.player;
  const lockedPool = ITEMS.filter((it) => !unlockedItems(run.save).includes(it.id) && !run.corrupt.includes(it.id));
  const roll = rng.next();

  // Rare specials
  if (lockedPool.length && run.distance > 250 && run.corruptSpawned < 1 + Math.floor(run.distance / 1500) && rng.chance(0.05)) {
    spawnPickup('corrupt', lane, -20, { itemId: rng.pick(lockedPool).id });
    run.corruptSpawned++;
    return;
  }
  if (p.hearts < run.stats.maxHearts && rng.chance(0.05)) { spawnPickup('heart', lane, -20); return; }
  if (rng.chance(0.03)) { spawnPickup('blue', lane, -20); return; }

  if (d >= 3 && roll < 0.12 && enemies.length === 0) {
    const gap = rng.int(0, LANES - 1);
    spawnGate(gap);
    spawnCoinLine(gap, 4, -60);
  } else if (d >= 0.3 && roll < 0.4) {
    spawnObstacle('low', lane);
    spawnCoinLine(lane, 3, -50, 22);
  } else if (d >= 0.15 && roll < 0.65) {
    spawnObstacle('wall', lane);
    const side = lane === 0 ? 1 : lane === LANES - 1 ? LANES - 2 : lane + (rng.chance(0.5) ? 1 : -1);
    spawnCoinLine(side, 5);
    if (d >= 1.5 && rng.chance(0.4)) {
      const other = (lane + 2 + rng.int(0, 1)) % LANES;
      if (Math.abs(other - lane) >= 2) spawnObstacle(rng.chance(0.5) ? 'wall' : 'low', other, -60);
    }
  } else {
    spawnCoinLine(lane, 6);
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
  setMusic('shop');
  const items = rollItems(run.rng, unlockedItems(run.save), run.stacks, 3, run.stats.luck);
  const mul = 1 + 0.25 * run.shopIndex;
  const free = run.freeShop;
  run.shopSlots = [
    ...items.map((it) => ({ kind: 'item', id: it.id, price: free ? 0 : Math.round(PRICE[it.rarity] * mul), sold: false })),
    { kind: 'heal', price: Math.round(10 * mul), sold: false },
    { kind: 'blue', price: Math.round(14 * mul), sold: false },
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
  run.rerollCost += 4;
  const items = rollItems(run.rng, unlockedItems(run.save), run.stacks, 3, run.stats.luck);
  const mul = 1 + 0.25 * (run.shopIndex - 1);
  const rest = run.shopSlots.filter((s) => s.kind !== 'item');
  run.shopSlots = [...items.map((it) => ({ kind: 'item', id: it.id, price: Math.round(PRICE[it.rarity] * mul), sold: false })), ...rest];
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
  addCoins(run, 10);
  run.pickChoices = [];
  run.mode = 'play';
  sfx.coin();
}

function onBossKilled(run, b) {
  run.rs.bosses++;
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
  if (input.pause || input.blur || (input.tap && input.tapY >= 0 && input.tapY < 40 && Math.abs(input.tapX - W / 2) < 34)) {
    run.mode = 'pause';
    return;
  }
  if ((input.tap && input.tapY >= 40) || input.active) useActive(run);

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
    if (run.warnT <= 0) { run.boss = makeBoss(run.bossIndex); run.bossHit = false; }
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
  updatePlayer(p, input, dt, st);
  if (p.ev.jump) sfx.jump();
  if (p.ev.lane) sfx.lane();
  if (p.ev.phase) { sfx.phase(); run.rs.phases++; }
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
  updateWeapon(p, st, dt, run.overdriveT > 0 ? 3 : 1);
  steerBullets(st, dt);

  // World
  updatePool(playerBullets, dt);
  updatePool(enemyBullets, edt);
  updateEnemies(edt, d);
  if (run.boss) updateBoss(run.boss, edt, d);
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
      if (st.mirror) spawn(playerBullets, eb.x[i], eb.y[i], 0, -480, 4, 2 * st.damageMul, 0, 1);
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
    const overlap = Math.abs(o.x - p.x) < hwLane && Math.abs(o.y - PLAYER_Y) < OB_H[o.type] / 2 + 6;
    if (overlap && !o.hit) {
      if (o.type === 'low' && air) o.jumped = true;
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
    const n = 1 + (st.toxinCoins && e.poisoned ? 1 : 0) + (e.type !== 'drone' ? 1 : 0);
    dropCoins(e.x, e.y, n);
    if (run.active) run.active.charge = Math.min(run.active.max, run.active.charge + 1);
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
  const s = run.save;
  const rs = run.rs;
  // Run-only achievements already checked live; merge totals then check the rest.
  for (const a of checkAchievements(s, rs)) {
    const rw = rewardOf(a.id);
    if (rw) run.newUnlocks.push(rw.name);
  }
  for (const k of ['kills', 'bosses', 'coins', 'purchases', 'phaseDodges', 'lowJumps', 'obstacles', 'toxinKills']) s.totals[k] += rs[k];
  s.totals.distance += Math.floor(rs.distance);
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
