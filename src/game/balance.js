import { runBpm, BASE_BPM } from '../core/tempo.js';
// All difficulty and economy curves in one place (pure, no DOM), shared by the
// game and scripts/balance.mjs. `d` = difficulty = metres / 400.
// `power` = player effective DPS / base DPS (see items.js powerRatio).
//
// Design: distance raises the floor; player power raises enemy HP only by
// sqrt(power), so upgrades still feel strong but never trivialise the run.

export const POWER_EXP = 0.5;

export const enemyHpMul = (d, power) => (1 + 0.28 * d) * Math.pow(power, POWER_EXP);
export const enemyHp = (base, d, power, elite = false) => Math.max(1, Math.round(base * enemyHpMul(d, power) * (elite ? 2.2 : 1)));

export const bossHp = (index, power) => Math.round(120 * (1 + 0.5 * index) * Math.pow(power, POWER_EXP) * (index >= 5 ? 1.25 : 1));
// Bosses speed up more than regular enemies: they are the run's exams.
export const bossSpeed = (index) => Math.min(1.75, 1 + 0.12 * index);

// Enemy timing follows the gameplay clock's tempo (core/tempo.js): one step per district.
export const timeMul = (d) => runBpm(d) / BASE_BPM;

// Elites: tougher, faster, one extra volley, more cells. Start around 1000 m.
export const eliteChance = (d) => Math.max(0, Math.min(0.4, (d - 2.5) * 0.06));

// Economy
export const COIN_LINE = 4;
// Levels: cells (the currency) are experience. Cells needed to go from
// `level` to the next: quick early level-ups, then a steady climb.
// Slightly quadratic so late runs (more cells, GREED, boss drops) still level
// every 35-50 s rather than every 20.
export const xpNeed = (level) => Math.round(10 + 7 * (level - 1) + 0.5 * (level - 1) ** 2);
