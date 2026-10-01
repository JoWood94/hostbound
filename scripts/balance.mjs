// Balance report: player damage output for typical builds vs enemy/boss HP.
// Run: node scripts/balance.mjs
// "Effective DPS" = damage per second on ONE target in or near your lane,
// counting side shots only when homing can bend them onto it.
import { computeStats, ITEM_BY_ID, effectiveDps as effDps } from '../src/game/items.js';
import { BOARD_BY_ID } from '../src/game/boards.js';

const stock = BOARD_BY_ID.stock;

const BUILDS = [
  ['base', []],
  ['boss1: slug', ['slug']],
  ['boss1 + shop1: slug, split, homing', ['slug', 'split', 'homing']],
  ['2 bosses + shop: slug, split, homing, rapid', ['slug', 'split', 'homing', 'rapid']],
  ['3 bosses + 2 shops', ['slug', 'split', 'homing', 'rapid', 'slug', 'crit']],
  ['late: 9 items', ['slug', 'slug', 'split', 'split', 'homing', 'rapid', 'rapid', 'crit', 'echo']],
];

const base = effDps(computeStats(stock, {}));
console.log('\nPLAYER OUTPUT');
console.log('build'.padEnd(46), 'rate', ' dmg', '  DPS', ' x base');
for (const [name, items] of BUILDS) {
  const stacks = {};
  for (const id of items) stacks[id] = Math.min((stacks[id] || 0) + 1, ITEM_BY_ID[id].max);
  const s = computeStats(stock, stacks);
  const d = effDps(s);
  console.log(name.padEnd(46), s.fireRate.toFixed(1).padStart(4), (s.damage * s.damageMul).toFixed(1).padStart(4), d.toFixed(1).padStart(5), (d / base).toFixed(2).padStart(6));
}

// ---------------------------------------------------------------------------
// Enemy and boss toughness along a typical run
// ---------------------------------------------------------------------------
import { enemyHp, bossHp, maxActive, eliteChance, timeMul } from '../src/game/balance.js';

const BY_DISTANCE = [
  [0, []],
  [600, ['slug']],
  [1200, ['slug', 'split', 'homing']],
  [1800, ['slug', 'split', 'homing', 'rapid']],
  [2400, ['slug', 'split', 'homing', 'rapid', 'slug', 'crit']],
  [4000, ['slug', 'slug', 'split', 'split', 'homing', 'rapid', 'rapid', 'crit', 'echo']],
];

console.log('\nRUN CURVE (drone base HP 2; TTK = seconds to kill while in its lane)');
console.log('metres', ' power', ' drone HP', ' TTK', ' elite%', ' max', ' speed');
for (const [m, items] of BY_DISTANCE) {
  const stacks = {};
  for (const id of items) stacks[id] = Math.min((stacks[id] || 0) + 1, ITEM_BY_ID[id].max);
  const s = computeStats(stock, stacks);
  const dps = effDps(s);
  const power = Math.max(1, dps / 6);
  const d = m / 400;
  const hp = enemyHp(2, d, power);
  console.log(String(m).padStart(6), power.toFixed(2).padStart(6), String(hp).padStart(9), (hp / dps).toFixed(2).padStart(5),
    (eliteChance(d) * 100).toFixed(0).padStart(6) + '%', String(maxActive(d)).padStart(4), ('x' + timeMul(d).toFixed(2)).padStart(6));
}
console.log('\nBOSSES');
for (const [m, i, power, dps] of [[600, 0, 1.35, 8.1], [1800, 1, 3.38, 20.3], [3000, 2, 4.86, 29.2], [4200, 3, 10.2, 61.2]]) {
  const hp = bossHp(i, power);
  console.log(`${String(m).padStart(5)}m boss #${i + 1}: ${String(hp).padStart(4)} HP, ~${(hp / dps).toFixed(0)}s at full uptime`);
}
