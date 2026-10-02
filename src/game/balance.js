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

// HP stops inflating past ~3000 m (d 7.5): beyond that more HP is tedium, not
// danger. Danger comes from tempo, volleys, density and elites instead.
export const enemyHpMul = (d, power) => (1 + 0.28 * Math.min(d, 7.5) + 0.08 * Math.max(0, d - 7.5)) * Math.pow(power, POWER_EXP);
export const enemyHp = (base, d, power, elite = false) => Math.max(1, Math.round(base * enemyHpMul(d, power) * (elite ? 2.2 : 1)));

export const bossHp = (index, power) => Math.round(120 * (1 + 0.5 * index) * Math.pow(power, POWER_EXP) * (index >= 5 ? 1.25 : 1));
// Bosses speed up more than regular enemies: they are the run's exams.
export const bossSpeed = (index) => Math.min(2.2, 1 + 0.12 * index);

// Enemy timing follows the gameplay clock's tempo (core/tempo.js): one step per district.
export const timeMul = (d) => runBpm(d) / BASE_BPM;

// Elites: tougher, faster, one extra volley, more cells. Start around 1000 m.
export const eliteChance = (d, h = 1) => Math.max(0, Math.min(0.7, (d - 2.5) * 0.06)) * (0.6 + 0.4 * h);
// Extra volleys per enemy: the cheapest real danger (same pattern, once more).
export const extraVolleys = (t) => (t >= 3 ? 1 : 0) + (t >= 6 ? 1 : 0);
// Beats of calm between sections, and how early the next section may start
// (volleys left on the current enemies).
export const breathBeats = (t) => (t <= 2 ? 2 : t <= 5 ? 1 : 0);
export const overlapVolleys = (t) => (t >= 7 ? 3 : t >= 4 ? 2 : 1);
// Chance a combat section gets reinforcements (from tier 2, lightly).
export const reinforceChance = (t, h) => (t < 2 ? 0 : Math.min(1, 0.2 * (t - 1) + 0.3 * h));

// Economy
export const COIN_LINE = 4;
// Levels: cells (the currency) are experience. Cells needed to go from
// `level` to the next: quick early level-ups, then a steady climb.
// Slightly quadratic so late runs (more cells, GREED, boss drops) still level
// every 35-50 s rather than every 20.
export const xpNeed = (level) => Math.round(10 + 7 * (level - 1) + 0.5 * (level - 1) ** 2);
