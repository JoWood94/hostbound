import { runBpm, BASE_BPM } from '../core/tempo.js';
// All difficulty and economy curves in one place (pure, no DOM), shared by the
// game and scripts/balance.mjs. `d` = difficulty = metres / 400.
// `power` = player effective DPS / base DPS (see items.js powerRatio).
//
// Design: distance raises the floor; player power raises enemy HP only by
// sqrt(power), so upgrades still feel strong but never trivialise the run.

export const POWER_EXP = 0.5;

// Difficulty is pressure on attention per second, not HP. Every lever reads the
// district TIER (steps you can feel) and the HEAT inside the district: 0 for
// the first 150 m after a boss (a breather to read the new tempo), rising to 1
// near the end of the district (sawtooth: the boss is the exam).
export const tier = (m) => Math.floor(m / 1000);
export const heat = (m) => Math.max(0, Math.min(1, ((m % 1000) - 150) / 700));

// Enemy HP keeps kill time / time on screen about constant along the run
// (scripts/balance.mjs, column "ratio"): enemies must live long enough to fire
// the extra volleys that make deep tiers dangerous, and no longer. Player power
// counts a bit more than for bosses (0.6 vs 0.5) because late builds otherwise
// erase regular enemies before they shoot.
export const ENEMY_POWER_EXP = 0.6;
export const enemyHpMul = (d, power) => (1 + 0.28 * d) * Math.pow(power, ENEMY_POWER_EXP);
export const enemyHp = (base, d, power, elite = false) => Math.max(1, Math.round(base * enemyHpMul(d, power) * (elite ? 2.2 : 1)));

export const bossHp = (index, power) => Math.round(120 * (1 + 0.5 * index) * Math.pow(power, POWER_EXP) * (index >= 5 ? 1.25 : 1));
// Bosses speed up more than regular enemies: they are the run's exams.
export const bossSpeed = (index) => Math.min(2.2, 1 + 0.12 * index);

// Enemy timing follows the gameplay clock's tempo (core/tempo.js): one step per district.
export const timeMul = (d) => runBpm(d) / BASE_BPM;

// Elites: tougher, faster, one extra volley, more cells. Start around 1000 m.
export const eliteChance = (d, h = 1) => Math.max(0, Math.min(0.9, (d - 1.5) * 0.07)) * (0.6 + 0.4 * h);
// Extra volleys per enemy: the cheapest real danger (same pattern, once more).
// No ceiling: past district 7 one more every 3 districts.
export const extraVolleys = (t) => (t >= 2 ? 1 : 0) + (t >= 4 ? 1 : 0) + (t >= 7 ? 1 : 0) + Math.max(0, Math.floor((t - 7) / 3));
// Beats of calm between sections, and how early the next section may start
// (volleys left on the current enemies).
export const breathBeats = (t) => (t <= 1 ? 2 : t <= 3 ? 1 : 0);
export const overlapVolleys = (t) => (t >= 6 ? 3 : t >= 3 ? 2 : 1);
// Chance a combat section gets reinforcements (from tier 1).
export const reinforceChance = (t, h) => (t < 1 ? 0 : Math.min(1, 0.2 * t + 0.3 * h));

// Economy
export const COIN_LINE = 4;
// Levels: cells (the currency) are experience. Cells needed to go from
// `level` to the next: quick early level-ups, then a steady climb.
// Slightly quadratic so late runs (more cells, GREED, boss drops) still level
// every 35-50 s rather than every 20.
export const xpNeed = (level) => Math.round(10 + 7 * (level - 1) + 0.5 * (level - 1) ** 2);
