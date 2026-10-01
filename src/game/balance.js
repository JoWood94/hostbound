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

// Enemy timing: telegraph/rest shrink and bullets speed up, both capped.
export const timeMul = (d) => 1 + Math.min(0.65, d * 0.065);
// Enemy bullets must always outrun enemies (enter 170, leave 140 px/s) and the
// track scroll (220+), otherwise a shooter overtakes its own bullets.
export const bulletSpeed = (d) => 260 + Math.min(150, d * 12);
export const LEAVE_SPEED = 140;

// How many enemies may hold position at once, and how often new ones come.
export const maxActive = (d) => (d < 1.5 ? 1 : d < 4 ? 2 : 3);
export const spawnGap = (d) => Math.max(0.8, 2.1 - d * 0.14);
export const maxVolleys = (base, d) => Math.min(base + 3, base + Math.floor(d / 2.5));

// Elites: tougher, faster, one extra volley, more coins. Start around 1000 m.
export const eliteChance = (d) => Math.max(0, Math.min(0.4, (d - 2.5) * 0.06));

// Economy
export const COIN_LINE = 4;
export const itemPrice = (rarity, shopIndex) => Math.round([22, 36, 55][rarity] * (1 + 0.3 * shopIndex));
export const healPrice = (shopIndex) => Math.round(12 * (1 + 0.3 * shopIndex));
export const bluePrice = (shopIndex) => Math.round(16 * (1 + 0.3 * shopIndex));
export const REROLL_BASE = 8;
export const REROLL_STEP = 5;
export const SKIP_COINS = 8;
