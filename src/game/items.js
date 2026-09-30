// Item registry. Items are data: each one mutates a stats object. The weapon,
// player and run read only the final stats, so any combination composes.
import { PAL } from '../render/palette.js';

export const RARITY = [
  { name: 'COMMON', color: PAL.white, weight: 60 },
  { name: 'RARE', color: PAL.cyan, weight: 30 },
  { name: 'EPIC', color: PAL.magenta, weight: 10 },
];

export const CAT_COLOR = {
  weapon: PAL.cyan,
  defense: PAL.blue,
  economy: PAL.acid,
  active: PAL.orange,
  risk: PAL.red,
};

export function baseStats() {
  return {
    // weapon
    fireRate: 6, damage: 1, bulletSize: 3, bulletSpeed: 520,
    split: 0, pierce: 0, homing: 0, frag: 0, arc: 0, toxin: 0, crit: 0, critMul: 3, echo: 0,
    // body
    maxHearts: 3, blueStart: 0, barrier: 0, barrierRegen: 6, orbitals: 0,
    phaseCd: 2, phaseTime: 0.25, mirror: false, kickflip: false, jumpTime: 0.45,
    iframeTime: 1, canJump: true, breakLow: false,
    // economy
    magnet: 0, coinMul: 1, luck: 0,
    // misc
    adrenaline: 0, repair: false, damageMul: 1, toxinCoins: false,
  };
}

// unlock: achievement id that adds the item to the pool (null = starter item).
export const ITEMS = [
  // ---- weapon ----
  { id: 'split', name: 'SPLITTER', code: 'SPL', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'Extra shots angle into neighbouring lanes. Stack: reach 2 lanes.',
    apply: (s, n) => { s.split += n; } },
  { id: 'rapid', name: 'RAPID COIL', code: 'RPD', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: '+35% fire rate.',
    apply: (s, n) => { s.fireRate *= 1 + 0.35 * n; } },
  { id: 'slug', name: 'SLUG ROUNDS', code: 'SLG', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: '+1 damage, bigger bullets, -15% fire rate.',
    apply: (s, n) => { s.damage += n; s.bulletSize += 1.2 * n; s.fireRate *= Math.pow(0.85, n); } },
  { id: 'pierce', name: 'PIERCER', code: 'PRC', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: 'Bullets pass through +1 enemy.',
    apply: (s, n) => { s.pierce += n; } },
  { id: 'homing', name: 'SEEKER CHIP', code: 'SEK', cat: 'weapon', rarity: 1, max: 2, unlock: 'dist_1000',
    desc: 'Bullets curve toward enemies in other lanes.',
    apply: (s, n) => { s.homing += n; } },
  { id: 'frag', name: 'FRAG TIPS', code: 'FRG', cat: 'weapon', rarity: 1, max: 2, unlock: 'kills_150',
    desc: 'Hits explode, damaging nearby enemies.',
    apply: (s, n) => { s.frag += n; } },
  { id: 'arc', name: 'ARC RELAY', code: 'ARC', cat: 'weapon', rarity: 1, max: 3, unlock: 'kills_500',
    desc: 'Hits jump to +1 nearby enemy for half damage.',
    apply: (s, n) => { s.arc += n; } },
  { id: 'toxin', name: 'TOXIN', code: 'TOX', cat: 'weapon', rarity: 0, max: 3, unlock: 'runs_5',
    desc: 'Hits poison: 1 damage per second for 3s. Stacks.',
    apply: (s, n) => { s.toxin += n; } },
  { id: 'crit', name: 'HEADSHOT', code: 'HDS', cat: 'weapon', rarity: 1, max: 3, unlock: 'boss_nohit',
    desc: '+15% chance to deal triple damage.',
    apply: (s, n) => { s.crit += 0.15 * n; } },
  { id: 'echo', name: 'ECHO CHAMBER', code: 'ECH', cat: 'weapon', rarity: 1, max: 2, unlock: 'dist_2000',
    desc: 'Every 5th shot is a huge piercing round. Stack: every 4th.',
    apply: (s, n) => { s.echo = n === 1 ? 5 : 4; } },

  // ---- defense ----
  { id: 'plating', name: 'PLATING', code: 'PLT', cat: 'defense', rarity: 0, max: 4, unlock: null,
    desc: '+1 max heart and heal 1.',
    apply: (s, n) => { s.maxHearts += n; } , onPick: (run) => { run.player.hearts += 1; } },
  { id: 'icewall', name: 'ICE WALL', code: 'ICE', cat: 'defense', rarity: 0, max: 9, unlock: null,
    desc: '+2 blue hearts. They absorb hits first.',
    apply: () => {}, onPick: (run) => { run.player.blueHearts += 2; } },
  { id: 'barrier', name: 'BARRIER', code: 'BAR', cat: 'defense', rarity: 1, max: 2, unlock: 'boss_1',
    desc: 'Energy shield blocks 1 hit, recharges after 6s untouched.',
    apply: (s, n) => { s.barrier += n; } },
  { id: 'orbital', name: 'ORBITAL', code: 'ORB', cat: 'defense', rarity: 1, max: 3, unlock: 'boss_3',
    desc: 'A sphere orbits you and eats enemy bullets.',
    apply: (s, n) => { s.orbitals += n; } },
  { id: 'blink', name: 'BLINK DRIVE', code: 'BLK', cat: 'defense', rarity: 0, max: 2, unlock: null,
    desc: 'Phase cooldown -40%, phase lasts longer.',
    apply: (s, n) => { s.phaseCd *= Math.pow(0.6, n); s.phaseTime += 0.1 * n; } },
  { id: 'mirror', name: 'MIRROR SKIN', code: 'MIR', cat: 'defense', rarity: 2, max: 1, unlock: 'phase_50',
    desc: 'Bullets you phase through are reflected back.',
    apply: (s) => { s.mirror = true; } },
  { id: 'kickflip', name: 'KICKFLIP', code: 'KFL', cat: 'defense', rarity: 1, max: 1, unlock: 'jump_100',
    desc: 'Longer jumps. Landing wipes bullets in your lane.',
    apply: (s) => { s.kickflip = true; s.jumpTime *= 1.3; } },
  { id: 'repair', name: 'NANO REPAIR', code: 'NAN', cat: 'defense', rarity: 2, max: 1, unlock: 'def_3',
    desc: 'Heal 1 heart after every boss.',
    apply: (s) => { s.repair = true; } },

  // ---- economy ----
  { id: 'magnet', name: 'MAGNET', code: 'MAG', cat: 'economy', rarity: 0, max: 2, unlock: null,
    desc: 'Pull coins from neighbouring lanes. Stack: 2 lanes.',
    apply: (s, n) => { s.magnet += n; } },
  { id: 'greed', name: 'GREED', code: 'GRD', cat: 'economy', rarity: 0, max: 2, unlock: null,
    desc: '+50% coins.',
    apply: (s, n) => { s.coinMul += 0.5 * n; } },
  { id: 'lucky', name: 'LUCKY CHIP', code: 'LCK', cat: 'economy', rarity: 1, max: 2, unlock: 'buy_5',
    desc: 'Rare items show up more. +5% crit.',
    apply: (s, n) => { s.luck += n; s.crit += 0.05 * n; } },

  // ---- risk ----
  { id: 'adrenaline', name: 'ADRENALINE', code: 'ADR', cat: 'risk', rarity: 1, max: 1, unlock: 'boss_1heart',
    desc: 'Double damage while on your last heart.',
    apply: (s) => { s.adrenaline = 1; } },
  { id: 'glass', name: 'GLASS CANNON', code: 'GLS', cat: 'risk', rarity: 2, max: 1, unlock: 'dist_3000',
    desc: 'Damage x2. Max hearts -2 (min 1).',
    apply: (s) => { s.damageMul *= 2; s.maxHearts -= 2; } },

  // ---- actives (one slot, tap to use) ----
  { id: 'emp', name: 'EMP', code: 'EMP', cat: 'active', rarity: 0, max: 1, unlock: null,
    desc: 'ACTIVE: clear all enemy bullets, 8 damage to everything. 10 kills to charge.',
    active: { charge: 10 } },
  { id: 'slowmo', name: 'CHRONO', code: 'CHR', cat: 'active', rarity: 1, max: 1, unlock: 'runs_10',
    desc: 'ACTIVE: slow time to 35% for 4s. 8 kills to charge.',
    active: { charge: 8 } },
  { id: 'overdrive', name: 'OVERDRIVE', code: 'OVD', cat: 'active', rarity: 1, max: 1, unlock: 'boss_2run',
    desc: 'ACTIVE: triple fire rate for 5s. 8 kills to charge.',
    active: { charge: 8 } },
  { id: 'patch', name: 'PATCH KIT', code: 'PAT', cat: 'active', rarity: 1, max: 1, unlock: 'obstacles_200',
    desc: 'ACTIVE: heal 1 heart. 18 kills to charge.',
    active: { charge: 18 } },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// Named synergies: announced on screen when first formed.
export const SYNERGIES = [
  { id: 'swarm', name: 'SWARM', req: ['split', 'homing'], desc: 'Side shots home harder.',
    apply: (s) => { s.homing += 1; } },
  { id: 'railgun', name: 'RAILGUN', req: ['slug', 'pierce'], desc: 'Faster bullets, +1 pierce.',
    apply: (s) => { s.bulletSpeed *= 1.5; s.pierce += 1; } },
  { id: 'storm', name: 'STORM', req: ['frag', 'arc'], desc: 'Arcs explode too.',
    apply: (s) => { s.arc += 1; s.frag += 1; } },
  { id: 'plague', name: 'PLAGUE', req: ['toxin', 'frag'], desc: 'Explosions poison.',
    apply: (s) => { s.toxin += 1; } },
  { id: 'halo', name: 'HALO', req: ['orbital', 'mirror'], desc: '+1 orbital, faster spin.',
    apply: (s) => { s.orbitals += 1; } },
  { id: 'burst', name: 'BURST FIRE', req: ['rapid', 'echo'], desc: 'Echo every 3rd shot.',
    apply: (s) => { s.echo = 3; } },
  { id: 'jackpot', name: 'JACKPOT', req: ['greed', 'lucky'], desc: 'Crits drop coins.',
    apply: (s) => { s.critCoins = true; } },
];

export function activeSynergies(stacks) {
  return SYNERGIES.filter((sy) => sy.req.every((id) => stacks[id] > 0));
}

export function computeStats(board, stacks) {
  const s = baseStats();
  board.apply(s);
  for (const id in stacks) {
    const it = ITEM_BY_ID[id];
    if (it && it.apply && stacks[id] > 0) it.apply(s, stacks[id]);
  }
  for (const sy of activeSynergies(stacks)) sy.apply(s);
  s.maxHearts = Math.max(1, s.maxHearts);
  s.fireRate = Math.min(20, s.fireRate);
  s.crit = Math.min(0.75, s.crit);
  return s;
}

// Weighted pick of `n` distinct items from the unlocked pool.
export function rollItems(rng, unlocked, stacks, n, luck = 0, exclude = []) {
  const pool = ITEMS.filter((it) => unlocked.includes(it.id)
    && (stacks[it.id] || 0) < it.max
    && !exclude.includes(it.id));
  const out = [];
  while (out.length < n && pool.length) {
    const weights = pool.map((it) => RARITY[it.rarity].weight * (it.rarity > 0 ? 1 + luck * 0.6 : 1));
    let total = weights.reduce((a, b) => a + b, 0);
    let r = rng.next() * total;
    let idx = 0;
    while (r > weights[idx]) { r -= weights[idx]; idx++; }
    out.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return out;
}

export const STARTER_ITEMS = ITEMS.filter((i) => !i.unlock).map((i) => i.id);
