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
  // v1.1 reference builds (DESIGN_V1.1.md B.8)
  ['fission: fission x2, split, homing, rapid', ['fission', 'fission', 'split', 'homing', 'rapid']],
  ['camper: charge x2, echo, railgun, densecore', ['charge', 'charge', 'echo', 'railgun', 'densecore']],
  ['air: skyshot x2, kickflip, pound, adrenal', ['skyshot', 'skyshot', 'kickflip', 'pound', 'adrenal']],
  ['ghost: ghostround, blink, mirror, brand', ['ghostround', 'blink', 'mirror', 'brand']],
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
import { enemyHp, bossHp, eliteChance, timeMul, extraVolleys } from '../src/game/balance.js';
import { TICK_BASE } from '../src/core/tempo.js';

const BY_DISTANCE = [
  [0, []],
  [1000, ['slug']],
  [2000, ['slug', 'split', 'homing']],
  [3000, ['slug', 'split', 'homing', 'rapid', 'densecore']],
  [4000, ['slug', 'split', 'homing', 'rapid', 'slug', 'crit', 'densecore']],
  [6000, ['slug', 'slug', 'split', 'split', 'homing', 'rapid', 'rapid', 'crit', 'echo', 'densecore']],
  [8000, ['slug', 'slug', 'split', 'split', 'homing', 'rapid', 'rapid', 'crit', 'echo', 'densecore', 'densecore', 'fission']],
];

// A drone on screen: glide in (0.65 s), then per volley 4 warning ticks + 2
// shot ticks + its rest (1.6 s ~ 8 ticks). TTK here is at full uptime (always
// in lane, every shot lands), so the ratio is small; what matters is that it
// stays about CONSTANT along the run (0.06-0.10): falling = enemies die before
// their extra volleys, rising = HP tedium.
console.log('\nRUN CURVE (drone, base HP 2)');
console.log('metres', ' power', ' HP', '  TTK', ' onscreen', ' ratio', ' elite%', ' tempo');
for (const [m, items] of BY_DISTANCE) {
  const stacks = {};
  for (const id of items) stacks[id] = Math.min((stacks[id] || 0) + 1, ITEM_BY_ID[id].max);
  const s = computeStats(stock, stacks);
  const dps = effDps(s);
  const power = Math.max(1, dps / 6);
  const d = m / 400;
  const hp = enemyHp(2, d, power);
  const tick = TICK_BASE / timeMul(d);
  const volleys = 2 + extraVolleys(Math.floor(m / 1000));
  const onScreen = 0.65 + volleys * 14 * tick;
  const ttk = hp / dps;
  const ratio = ttk / onScreen;
  const flag = ratio < 0.06 ? ' <' : ratio > 0.1 ? ' >' : '  ';
  console.log(String(m).padStart(6), power.toFixed(2).padStart(6), String(hp).padStart(4), ttk.toFixed(2).padStart(6),
    onScreen.toFixed(2).padStart(9), (ratio.toFixed(2) + flag).padStart(8), (eliteChance(d) * 100).toFixed(0).padStart(6) + '%', ('x' + timeMul(d).toFixed(2)).padStart(6));
}
console.log('\nBOSSES');
for (const [m, i, power, dps] of [[600, 0, 1.35, 8.1], [1800, 1, 3.38, 20.3], [3000, 2, 4.86, 29.2], [4200, 3, 10.2, 61.2]]) {
  const hp = bossHp(i, power);
  console.log(`${String(m).padStart(5)}m boss #${i + 1}: ${String(hp).padStart(4)} HP, ~${(hp / dps).toFixed(0)}s at full uptime`);
}
