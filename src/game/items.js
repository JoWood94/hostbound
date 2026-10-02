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
  mode: '#ffd27a',
};

export function baseStats() {
  return {
    // weapon
    fireRate: 6, damage: 1, bulletSize: 3, bulletSpeed: 520,
    // SHOT SPEED: projectile speed, pellet reach, wave length, rocket top speed,
    // rail charge time. bulletSpeed is derived from it.
    shotSpeed: 1,
    split: 0, sideDamage: 0.5, pierce: 0, homing: 0, frag: 0, arc: 0, toxin: 0, crit: 0, critMul: 3, echo: 0, echoMul: 2.5,
    // body
    maxHearts: 3, blueStart: 0, barrier: 0, barrierRegen: 6, orbitals: 0,
    phaseCd: 2, phaseTime: 0.45, mirror: false, kickflip: false, jumpTime: 0.45,
    iframeTime: 1, canJump: true, breakLow: false,
    // economy
    magnet: 0, coinMul: 1, luck: 0,
    // SPEED: lane-hop speed and phase recharge (the track scrolls on its own)
    speed: 1,
    // misc
    adrenaline: 0, repair: false, damageMul: 1, toxinCoins: false,
    // movement-driven
    wingmen: 0, groundPound: 0, slipstream: 0, ambush: 0, chain: 0, leech: 0, bloodPact: 0, extraChoices: 0,
    aftershock: false, squadron: false, driftKing: false, domino: false, counter: false,
    // Shot engine: shot modifiers COMPOSE. The carrier is what you fire
    // (beam > rail > rocket > bolt); the rest reshape it.
    hasBeam: false, hasRail: false, hasRocket: false, hasScatter: false, hasSine: false,
    carrier: 'bolt', smartRockets: false, buckshot: false, overload: false, helix: false,
    // v1.1
    fission: 0, shrapnel: 0, brand: 0, charge: 0, skyshot: 0, ghost: false, afterglow: 0, twinlink: false,
    focus: 0, mitosis: false, momentum: 0, premonition: false, carapace: 0, spore: 0, cellWall: 0,
    secondSkin: false, undertow: 0, egg: false, healMul: 1, heartCap: 0, parasite: false,
    // v1.2: stack thresholds, synergy levels, evolutions
    twinTime: 0.6, seekReach: 1, pierceRamp: 0, fragReach: false, arcMul: 0.35, arcLanes: false,
    toxinSpread: 0, critPierce: 0, critCoinsP: 0.3, syn: {}, evo: {},
    // v1.2 traits
    ricochet: 0, bounces: 1, converge: 0, slingshot: 0, paralytic: 0, overkill: 0, husk: 0, cull: 0,
    metabolism: 0, metabCap: 0.35, heartbeat: 0, bloodrush: 0,
    // v1.2 carriers; modeLv = stacks of each shot modifier (x2 = a small extra)
    hasGlaive: false, hasMine: false, hasBrood: false, hasSting: false, hasMortar: false, modeLv: {},
  };
}

// unlock: achievement id that adds the item to the pool (null = starter item).
export const ITEMS = [
  // ---- weapon ----
  { id: 'split', name: 'SPLITTER', code: 'SPL', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'Half-damage side shots angle into neighbouring lanes. Stack: reach 2 lanes.',
    apply: (s, n) => { s.split += n; } },
  { id: 'rapid', name: 'RAPID COIL', code: 'RPD', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: '+25% fire rate, slightly faster shots.',
    apply: (s, n) => { s.fireRate *= 1 + 0.25 * n; s.shotSpeed += 0.08 * n; } },
  { id: 'slug', name: 'SLUG ROUNDS', code: 'SLG', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: '+50% damage, bigger and heavier shots: slower fire and shot speed.',
    apply: (s, n) => { s.damage += 0.5 * n; s.bulletSize += 1 * n; s.fireRate *= Math.pow(0.9, n); s.shotSpeed -= 0.12 * n; } },
  { id: 'magaccel', name: 'MAG ACCELERATOR', code: 'MAX', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: 'SHOT SPEED up: hit moving targets, rails charge faster, pellets reach further.',
    apply: (s, n) => { s.shotSpeed += 0.3 * n; } },
  { id: 'pierce', name: 'PIERCER', code: 'PRC', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: 'Bullets pass through +1 enemy. At 3: every enemy pierced adds +10% damage.',
    apply: (s, n) => { s.pierce += n; } },
  { id: 'homing', name: 'SEEKER CHIP', code: 'SEK', cat: 'weapon', rarity: 1, max: 2, unlock: 'dist_1000',
    desc: 'Bullets bend toward enemies in the lanes next to yours. Stack: two lanes away when nothing is closer.',
    apply: (s, n) => { s.homing += n; } },
  { id: 'frag', name: 'FRAG TIPS', code: 'FRG', cat: 'weapon', rarity: 1, max: 2, unlock: 'kills_150',
    desc: 'Hits explode for 40% damage around the target. Stack: the blast reaches the next lane.',
    apply: (s, n) => { s.frag += n; } },
  { id: 'arc', name: 'ARC RELAY', code: 'ARC', cat: 'weapon', rarity: 1, max: 3, unlock: 'kills_500',
    desc: 'Hits jump to +1 nearby enemy for 35% damage. At 3: 45%, and arcs prefer other lanes.',
    apply: (s, n) => { s.arc += n; } },
  { id: 'toxin', name: 'TOXIN', code: 'TOX', cat: 'weapon', rarity: 0, max: 3, unlock: 'runs_5',
    desc: 'Hits poison: 1 damage per second for 3s. Stacks. At 3: a poisoned death infects a neighbour.',
    apply: (s, n) => { s.toxin += n; } },
  { id: 'crit', name: 'HEADSHOT', code: 'HDS', cat: 'weapon', rarity: 1, max: 3, unlock: 'boss_nohit',
    desc: '+10% chance to deal triple damage. At 3: crits pierce +1.',
    apply: (s, n) => { s.crit += 0.1 * n; } },
  { id: 'echo', name: 'ECHO CHAMBER', code: 'ECH', cat: 'weapon', rarity: 1, max: 2, unlock: 'dist_2000',
    desc: 'Every 5th shot is a huge piercing round (x2.5). Stack: every 4th.',
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
    desc: 'SPEED up. Phase cooldown -25%, phase lasts longer.',
    apply: (s, n) => { s.speed += 0.15 * n; s.phaseCd *= Math.pow(0.75, n); s.phaseTime += 0.1 * n; } },
  { id: 'mirror', name: 'MIRROR SKIN', code: 'MIR', cat: 'defense', rarity: 2, max: 1, unlock: 'phase_50',
    desc: 'Bullets you phase through are reflected back.',
    apply: (s) => { s.mirror = true; } },
  { id: 'kickflip', name: 'KICKFLIP', code: 'KFL', cat: 'defense', rarity: 1, max: 1, unlock: 'jump_100',
    desc: 'Longer jumps. Landing wipes bullets in your lane (every 4 s).',
    apply: (s) => { s.kickflip = true; s.jumpTime *= 1.3; } },
  { id: 'repair', name: 'NANO REPAIR', code: 'NAN', cat: 'defense', rarity: 2, max: 1, unlock: 'def_3',
    desc: 'Heal 1 heart after every boss.',
    apply: (s) => { s.repair = true; } },

  // ---- economy ----
  { id: 'magnet', name: 'MAGNET', code: 'MAG', cat: 'economy', rarity: 0, max: 2, unlock: null,
    desc: 'Pull cells from neighbouring lanes. Stack: 2 lanes.',
    apply: (s, n) => { s.magnet += n; } },
  { id: 'greed', name: 'GREED', code: 'GRD', cat: 'economy', rarity: 0, max: 2, unlock: null,
    desc: '+35% cells: level up faster.',
    apply: (s, n) => { s.coinMul += 0.35 * n; } },
  { id: 'lucky', name: 'LUCKY CHIP', code: 'LCK', cat: 'economy', rarity: 1, max: 2, unlock: 'buy_5',
    desc: 'LUCK +2.',
    apply: (s, n) => { s.luck += 2 * n; } },
  { id: 'thrusters', name: 'AFTERBURNER', code: 'AFB', cat: 'defense', rarity: 0, max: 3, unlock: null,
    desc: 'SPEED up: faster lane changes and phase recharge.',
    apply: (s, n) => { s.speed += 0.25 * n; } },
  { id: 'dice', name: 'LOADED DICE', code: 'DCE', cat: 'economy', rarity: 0, max: 3, unlock: null,
    desc: 'LUCK +1.',
    apply: (s, n) => { s.luck += n; } },

  // ---- risk ----
  { id: 'adrenaline', name: 'ADRENALINE', code: 'ADR', cat: 'risk', rarity: 1, max: 1, unlock: 'boss_1heart',
    desc: 'Double damage while on your last heart.',
    apply: (s) => { s.adrenaline = 1; } },
  { id: 'glass', name: 'GLASS CANNON', code: 'GLS', cat: 'risk', rarity: 2, max: 1, unlock: 'dist_3000',
    desc: 'Damage x2. Max hearts -2 (min 1).',
    apply: (s) => { s.damageMul *= 2; s.maxHearts -= 2; } },

  // ---- movement & lane play ----
  { id: 'wingman', name: 'WINGMAN', code: 'WNG', cat: 'weapon', rarity: 1, max: 2, unlock: 'kills_run_50',
    desc: 'A drone flies in the next lane and fires with you. Stack: one each side.',
    apply: (s, n) => { s.wingmen += n; } },
  { id: 'pound', name: 'GROUND POUND', code: 'GPD', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: 'Landing a jump fires a piercing shockwave up your lane.',
    apply: (s, n) => { s.groundPound += n; } },
  { id: 'slipstream', name: 'SLIPSTREAM', code: 'SLP', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'Every lane change fires a 3-shot burst.',
    apply: (s, n) => { s.slipstream += n; } },
  { id: 'ambush', name: 'AMBUSH', code: 'AMB', cat: 'weapon', rarity: 1, max: 2, unlock: 'elite_10',
    desc: 'After a phase, +75% damage for 1.5s.',
    apply: (s, n) => { s.ambush += n; } },
  { id: 'chain', name: 'CHAIN REACTION', code: 'CHN', cat: 'weapon', rarity: 1, max: 2, unlock: 'elite_25',
    desc: 'Enemies explode when they die, hurting their neighbours.',
    apply: (s, n) => { s.chain += n; } },
  { id: 'leech', name: 'LEECH', code: 'LCH', cat: 'defense', rarity: 2, max: 2, unlock: 'pure_1000',
    desc: 'Heal 1 heart every 30 kills. Stack: every 22.',
    apply: (s, n) => { s.leech += n; } },
  { id: 'blood', name: 'BLOOD PACT', code: 'BLD', cat: 'risk', rarity: 1, max: 2, unlock: 'boss_5',
    desc: '+25% damage for every red heart you are missing.',
    apply: (s, n) => { s.bloodPact += n; } },
  { id: 'interest', name: 'MUTAGEN', code: 'MUT', cat: 'economy', rarity: 1, max: 2, unlock: 'coins_run_150',
    desc: 'Level-ups and boss loot offer one more choice. Stack: two more.',
    apply: (s, n) => { s.extraChoices += n; } },

  // ---- shot modifiers: they all combine with each other ----
  // A second copy (boss loot) adds a small extra, never a second weapon.
  { id: 'laser', name: 'LASER', code: 'LSR', cat: 'mode', rarity: 1, max: 2, unlock: null,
    desc: 'Your shots become a continuous beam. x2: holding it on one target ramps up to +20%.',
    apply: (s, n) => { s.hasBeam = true; s.modeLv.laser = n; } },
  { id: 'scatter', name: 'SCATTER', code: 'SCT', cat: 'mode', rarity: 0, max: 2, unlock: null,
    desc: 'Your shots fan out in a cone. Fewer volleys, more of them. x2: pellets hit 15% harder and reach further.',
    apply: (s, n) => { s.hasScatter = true; s.modeLv.scatter = n; } },
  { id: 'railgun', name: 'RAIL CANNON', code: 'RLG', cat: 'mode', rarity: 1, max: 2, unlock: 'laser_100',
    desc: 'Your shots charge up and strike instantly through everything. x2: charges 15% faster.',
    apply: (s, n) => { s.hasRail = true; s.modeLv.railgun = n; } },
  { id: 'rockets', name: 'ROCKET POD', code: 'RKT', cat: 'mode', rarity: 1, max: 2, unlock: 'scatter_boss',
    desc: 'Your shots become rockets, or explode if they are something else. x2: blasts 25% wider.',
    apply: (s, n) => { s.hasRocket = true; s.modeLv.rockets = n; } },
  { id: 'sine', name: 'SINE WAVE', code: 'SIN', cat: 'mode', rarity: 1, max: 2, unlock: 'modes_3',
    desc: 'Your shots weave across your lane and both neighbours. x2: they linger on the side lanes.',
    apply: (s, n) => { s.hasSine = true; s.modeLv.sine = n; } },
  // v1.2 carriers (DESIGN_V1.2.md part 1). Every one reaches the enemy line.
  { id: 'glaive', name: 'BONE GLAIVE', code: 'GLV', cat: 'mode', rarity: 1, max: 2, unlock: null,
    desc: 'Your shots become a bone blade that flies past the enemy line and comes back, cutting both ways. x2: faster return, +20%.',
    apply: (s, n) => { s.hasGlaive = true; s.modeLv.glaive = n; } },
  { id: 'sporemine', name: 'SPORE MINE', code: 'SPM', cat: 'mode', rarity: 1, max: 2, unlock: null,
    desc: 'Your shots become mines that park under the enemy line and burst when an enemy is near (or after 2 s). x2: one more mine.',
    apply: (s, n) => { s.hasMine = true; s.modeLv.sporemine = n; } },
  { id: 'brood', name: 'BROOD', code: 'BRO', cat: 'mode', rarity: 1, max: 2, unlock: null,
    desc: 'Your shots become larvae that find an enemy up to two lanes away and eat it. Weak on bosses. x2: one more larva.',
    apply: (s, n) => { s.hasBrood = true; s.modeLv.brood = n; } },
  { id: 'stinger', name: 'STINGER', code: 'STG', cat: 'mode', rarity: 1, max: 2, unlock: null,
    desc: 'Your shots become slow needles that stick and burst 1 s later; needles add up. x2: they burst after 0.8 s.',
    apply: (s, n) => { s.hasSting = true; s.modeLv.stinger = n; } },
  { id: 'mortar', name: 'SEED MORTAR', code: 'MRT', cat: 'mode', rarity: 1, max: 2, unlock: null,
    desc: 'Your shots arc over the front row and burst on the enemy line, one lane wide. x2: wider burst.',
    apply: (s, n) => { s.hasMortar = true; s.modeLv.mortar = n; } },

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
  { id: 'rail', name: 'RAIL STRIKE', code: 'RAL', cat: 'active', rarity: 1, max: 1, unlock: 'daily_1',
    desc: 'ACTIVE: a piercing beam down your lane for 1.2s. 10 kills to charge.',
    active: { charge: 10 } },
  { id: 'patch', name: 'PATCH KIT', code: 'PAT', cat: 'active', rarity: 1, max: 1, unlock: 'obstacles_200',
    desc: 'ACTIVE: heal 1 heart. 18 kills to charge.',
    active: { charge: 18 } },

  // =====================================================================
  // v1.1 (DESIGN_V1.1.md part B)
  // ---- shot modifiers: each one composes with all four carriers ----
  { id: 'fission', name: 'FISSION', code: 'FIS', cat: 'weapon', rarity: 1, max: 2, unlock: 'dist_5000',
    desc: 'On its first hit a shot splits into two half-damage shots toward the side lanes. Stack: three.',
    apply: (s, n) => { s.fission += n; } },
  { id: 'shrapnel', name: 'SHRAPNEL', code: 'SHR', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: 'Kills burst into 3 acid shards that fly up their lane and the next ones. Stack: +2 shards, +50% damage.',
    apply: (s, n) => { s.shrapnel += n; } },
  { id: 'brand', name: 'BRAND', code: 'BRD', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'Your first hit brands an enemy: branded enemies take +20% damage from everything. Stack: +35%.',
    apply: (s, n) => { s.brand += n; } },
  { id: 'charge', name: 'CHARGE', code: 'CHG', cat: 'weapon', rarity: 1, max: 2, unlock: 'kills_run_100',
    desc: 'Staying 1 s in the same lane charges your next shot: double size, x1.8 damage. Stack: 0.7 s.',
    apply: (s, n) => { s.charge += n; } },
  { id: 'skyshot', name: 'SKYSHOT', code: 'SKY', cat: 'weapon', rarity: 0, max: 2, unlock: 'air_kills_50',
    desc: 'Shots fired mid-jump deal +50% damage and pierce +1. Stack: +90%, +2.',
    apply: (s, n) => { s.skyshot += n; } },
  { id: 'ghostround', name: 'GHOSTROUND', code: 'GHO', cat: 'weapon', rarity: 1, max: 1, unlock: 'rift_30',
    desc: 'Shots fired while phasing pass through everything and deal double damage.',
    apply: (s) => { s.ghost = true; } },
  { id: 'afterglow', name: 'AFTERGLOW', code: 'AFG', cat: 'weapon', rarity: 1, max: 2, unlock: 'kills_1000',
    desc: 'Shots leave an acid trail for 0.35 s that burns what touches it. Stack: 0.6 s, stronger.',
    apply: (s, n) => { s.afterglow += n; } },
  { id: 'twinlink', name: 'TWIN LINK', code: 'TWN', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'For 0.6 s after each lane change you also fire from the lane you left. Stack: 1 s.',
    apply: (s, n) => { s.twinlink = true; s.twinTime = n > 1 ? 1 : 0.6; } },
  // ---- stat modifiers ----
  { id: 'densecore', name: 'DENSE CORE', code: 'DNC', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: 'DMG +0.35, no drawbacks.',
    apply: (s, n) => { s.damage += 0.35 * n; } },
  { id: 'adrenal', name: 'ADRENAL GLAND', code: 'ADG', cat: 'weapon', rarity: 0, max: 3, unlock: null,
    desc: 'RATE +15%.',
    apply: (s, n) => { s.fireRate *= 1 + 0.15 * n; } },
  { id: 'hollow', name: 'HOLLOW BONES', code: 'HLW', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'SHOT SPEED +25%, but you blink for less time after a hit.',
    apply: (s, n) => { s.shotSpeed += 0.25 * n; s.iframeTime -= 0.15 * n; } },
  { id: 'keratin', name: 'KERATIN', code: 'KRT', cat: 'defense', rarity: 1, max: 2, unlock: null,
    desc: '+1 max heart and heal 1. SPEED -8%.',
    apply: (s, n) => { s.maxHearts += n; s.speed -= 0.08 * n; }, onPick: (run) => { run.player.hearts += 1; } },
  { id: 'synapse', name: 'SYNAPSE', code: 'SYN', cat: 'defense', rarity: 0, max: 3, unlock: null,
    desc: 'SPEED +12%, LUCK +1.',
    apply: (s, n) => { s.speed += 0.12 * n; s.luck += n; } },
  { id: 'focus', name: 'FOCUS LENS', code: 'FCL', cat: 'weapon', rarity: 1, max: 2, unlock: 'boss_10',
    desc: 'Crits deal +1x more. Without HEADSHOT: +5% crit chance.',
    apply: (s, n) => { s.focus += n; } },
  { id: 'mitosis', name: 'MITOSIS', code: 'MIT', cat: 'economy', rarity: 2, max: 1, unlock: 'level_12',
    desc: 'Every COMMON weapon item can stack one more time.',
    apply: (s) => { s.mitosis = true; } },
  { id: 'momentum', name: 'MOMENTUM', code: 'MOM', cat: 'defense', rarity: 0, max: 2, unlock: null,
    desc: 'SPEED +10%. Every lane change recharges the phase 0.15 s faster.',
    apply: (s, n) => { s.speed += 0.1 * n; s.momentum += n; } },
  // ---- power-ups ----
  { id: 'premonition', name: 'PREMONITION', code: 'PRE', cat: 'defense', rarity: 1, max: 1, unlock: 'dist_4000',
    desc: 'Lanes light up one tick earlier: more time to react.',
    apply: (s) => { s.premonition = true; } },
  { id: 'carapace', name: 'CARAPACE', code: 'CRP', cat: 'defense', rarity: 1, max: 1, unlock: null,
    desc: 'Ignore the first hit of every section; the shell grows back for the next.',
    apply: (s) => { s.carapace = Math.max(s.carapace, 1); } },
  { id: 'sporecloud', name: 'SPORE CLOUD', code: 'SPC', cat: 'defense', rarity: 0, max: 2, unlock: null,
    desc: 'Getting hit releases spores that wipe enemy shots in your lane and the next ones for 0.8 s. Stack: 1.4 s.',
    apply: (s, n) => { s.spore += n; } },
  { id: 'cellwall', name: 'CELL WALL', code: 'CLW', cat: 'economy', rarity: 0, max: 2, unlock: 'cells_run_300',
    desc: 'Every 25 cells you collect grow a blue heart. Stack: every 18.',
    apply: (s, n) => { s.cellWall = n; } },
  { id: 'secondskin', name: 'SECOND SKIN', code: 'SSK', cat: 'defense', rarity: 1, max: 1, unlock: null,
    desc: 'A lost blue heart grows back every 45 s (up to what you started with).',
    apply: (s) => { s.secondSkin = true; } },
  { id: 'undertow', name: 'UNDERTOW', code: 'UND', cat: 'economy', rarity: 0, max: 2, unlock: null,
    desc: 'While phasing you pull cells from the lanes next to yours. Stack: two lanes away.',
    apply: (s, n) => { s.undertow += n; } },
  { id: 'egg', name: 'SYMBIONT EGG', code: 'EGG', cat: 'defense', rarity: 2, max: 1, unlock: 'boss_3run',
    desc: 'Once per run, death hatches you again with 1 heart.',
    apply: (s) => { s.egg = true; } },
  // ---- risk ----
  // LEAD WEIGHTS is off while the game is balanced around the stock moveset
  // (it takes the jump away). Uncomment, with ARTILLERY in combos.js, to restore.
  // { id: 'leadweights', name: 'LEAD WEIGHTS', code: 'LDW', cat: 'risk', rarity: 1, max: 1, unlock: 'jump_300',
  //   desc: 'You can no longer jump. DMG +60%.', conflicts: ['kickflip', 'pound', 'skyshot'],
  //   apply: (s) => { s.canJump = false; s.damageMul *= 1.6; } },
  { id: 'fever', name: 'FEVER', code: 'FVR', cat: 'risk', rarity: 1, max: 2, unlock: 'kills_run_150',
    desc: 'RATE +30%, but every heal is halved. Stack: +55%, heals a third.',
    apply: (s, n) => { s.fireRate *= 1 + (n > 1 ? 0.55 : 0.3); s.healMul = n > 1 ? 1 / 3 : 0.5; } },
  { id: 'double', name: 'DOUBLE OR NOTHING', code: 'DBL', cat: 'risk', rarity: 2, max: 1, unlock: 'cells_run_500',
    desc: 'Cells x2. Max hearts fixed at 2.',
    apply: (s) => { s.coinMul *= 2; s.heartCap = 2; } },
  { id: 'parasite', name: 'PARASITE', code: 'PRS', cat: 'risk', rarity: 1, max: 1, unlock: 'level_15', conflicts: ['glass'],
    desc: 'Every level costs a heart (never the last). Level-ups offer two more choices.',
    apply: (s) => { s.parasite = true; s.extraChoices += 2; } },
  // =====================================================================
  // v1.2 (DESIGN_V1.2.md part 2): traits. Stack 2 changes the shape.
  // ---- trajectory ----
  { id: 'ricochet', name: 'RICOCHET', code: 'RCO', cat: 'weapon', rarity: 1, max: 2, unlock: null,
    desc: 'Shots that miss bounce off the top edge and come back down through the enemies. Stack: the bounce veers into the next lane.',
    apply: (s, n) => { s.ricochet += n; } },
  { id: 'converge', name: 'CONVERGENCE', code: 'CNV', cat: 'weapon', rarity: 0, max: 2, unlock: null, needs: ['split', 'scatter'],
    desc: 'Side shots converge on your lane at the enemy line. Stack: one volley converges, the next opens.',
    apply: (s, n) => { s.converge += n; } },
  { id: 'slingshot', name: 'SLINGSHOT', code: 'SLS', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'Shots fired just after a lane change are 30% faster and stronger. Stack: one more shot into the lane beyond.',
    apply: (s, n) => { s.slingshot += n; } },
  // ---- on hit ----
  { id: 'paralytic', name: 'PARALYTIC', code: 'PRL', cat: 'weapon', rarity: 1, max: 2, unlock: null,
    desc: 'Hits numb: enemies wait 25% longer between attacks (bosses half). Stack: 5 hits freeze an enemy for 0.5 s.',
    apply: (s, n) => { s.paralytic += n; } },
  { id: 'overkill', name: 'OVERKILL', code: 'OVK', cat: 'weapon', rarity: 1, max: 2, unlock: null,
    desc: 'Damage beyond a kill carries on to the next enemy in the lane. Stack: half of it to the lanes beside too.',
    apply: (s, n) => { s.overkill += n; } },
  { id: 'husk', name: 'HUSK', code: 'HSK', cat: 'defense', rarity: 0, max: 2, unlock: null,
    desc: 'A kill leaves a husk in its lane that blocks 1 enemy shot for 3 s. Stack: 2 shots.',
    apply: (s, n) => { s.husk += n; } },
  { id: 'cull', name: 'CULL', code: 'CUL', cat: 'weapon', rarity: 1, max: 2, unlock: null,
    desc: 'Enemies under 12% health die at once (not elites, never bosses). Stack: 18%, elites too.',
    apply: (s, n) => { s.cull += n; } },
  // ---- rhythm ----
  { id: 'metabolism', name: 'METABOLISM', code: 'MTB', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'Firing without being hit builds up to +35% RATE in 3 s; a hit resets it. Stack: a hit only halves it.',
    apply: (s, n) => { s.metabolism += n; } },
  { id: 'heartbeat', name: 'HEARTBEAT', code: 'HRT', cat: 'weapon', rarity: 1, max: 2, unlock: null,
    desc: 'Every 2 s a heavy beat: an extra volley from you and your drones. Stack: every 1.6 s.',
    apply: (s, n) => { s.heartbeat += n; } },
  { id: 'bloodrush', name: 'BLOODRUSH', code: 'BRS', cat: 'weapon', rarity: 0, max: 2, unlock: null,
    desc: 'Kills less than 1 s apart build up to +40% RATE; it fades when you stop. Stack: fades half as fast.',
    apply: (s, n) => { s.bloodrush += n; } },

  // ---- actives (boss loot) ----
  { id: 'blackhole', name: 'BLACK HOLE', code: 'BLH', cat: 'active', rarity: 1, max: 1, unlock: 'elite_50',
    desc: 'ACTIVE: for 1.5 s enemy shots are sucked in and destroyed above you; 8 damage to your lane. 12 kills.',
    active: { charge: 12 } },
  { id: 'mirrorfield', name: 'MIRROR FIELD', code: 'MRF', cat: 'active', rarity: 1, max: 1, unlock: 'phase_run_40',
    desc: 'ACTIVE: for 2 s every enemy shot that reaches you is reflected. 10 kills.',
    active: { charge: 10 } },
  { id: 'overcharge', name: 'OVERCHARGE', code: 'OVC', cat: 'active', rarity: 1, max: 1, unlock: 'boss_7',
    desc: 'ACTIVE: your next 3 volleys (or 2 s of beam) are charged. 8 kills.',
    active: { charge: 8 } },
  { id: 'warp', name: 'WARP', code: 'WRP', cat: 'active', rarity: 2, max: 1, unlock: 'dist_6000',
    desc: 'ACTIVE: jump 120 m ahead, clearing the screen. Not during bosses. 14 kills.',
    active: { charge: 14 } },
  { id: 'molt', name: 'MOLT', code: 'MLT', cat: 'active', rarity: 1, max: 1, unlock: 'level_10',
    desc: 'ACTIVE: heal 2 hearts and shrink for 3 s (smaller hitbox). 16 kills.',
    active: { charge: 16 } },
];

export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

// Named synergies: announced on screen when first formed.
// A synergy has a LEVEL: the lowest stack among its items (max 2). Level 2 is
// about +60% of the level-1 effect, never double. `k` = 1 or 1.6.
const K = (lvl) => (lvl > 1 ? 1.6 : 1);
export const SYNERGIES = [
  { id: 'swarm', name: 'SWARM', req: ['split', 'homing'], desc: 'Bullets turn even harder.',
    apply: (s, l) => { s.homing += K(l); } },
  { id: 'railgun', name: 'RAILGUN', req: ['slug', 'pierce'], desc: 'Faster bullets, +1 pierce.',
    apply: (s, l) => { s.shotSpeed += 0.5 * K(l); s.pierce += 1; } },
  { id: 'storm', name: 'STORM', req: ['frag', 'arc'], desc: 'Arcs explode too.',
    apply: (s, l) => { s.arc += 1; s.frag += K(l); } },
  { id: 'plague', name: 'PLAGUE', req: ['toxin', 'frag'], desc: 'Explosions poison.',
    apply: (s, l) => { s.toxin += K(l); } },
  { id: 'halo', name: 'HALO', req: ['orbital', 'mirror'], desc: '+1 orbital, faster spin.',
    apply: (s) => { s.orbitals += 1; } },
  { id: 'burst', name: 'BURST FIRE', req: ['rapid', 'echo'], desc: 'Echo every 3rd shot.',
    apply: (s) => { s.echo = 3; } },
  { id: 'jackpot', name: 'JACKPOT', req: ['greed', 'lucky'], desc: 'Crits drop cells.',
    apply: (s, l) => { s.critCoins = true; s.critCoinsP = 0.3 * K(l); } },
];

SYNERGIES.push(
  { id: 'smartrockets', name: 'SMART ROCKETS', req: ['rockets', 'homing'], desc: 'Rockets hunt harder, bigger blasts.',
    apply: (s, l) => { s.smartRockets = true; s.homing += K(l); } },
  { id: 'meltdown', name: 'MELTDOWN', req: ['laser', 'toxin'], desc: 'The beam poisons twice as hard.',
    apply: (s, l) => { s.toxin += 2 * K(l); } },
  { id: 'buckshot', name: 'BUCKSHOT', req: ['scatter', 'slug'], desc: '+2 pellets, pellets pierce.',
    apply: (s) => { s.buckshot = true; } },
  { id: 'overload', name: 'OVERLOAD', req: ['railgun', 'echo'], desc: 'Every 3rd rail hits 3 lanes.',
    apply: (s) => { s.overload = true; } },
  { id: 'helix', name: 'HELIX', req: ['sine', 'split'], desc: 'A third strand joins the wave.',
    apply: (s) => { s.helix = true; } },
  { id: 'aftershock', name: 'AFTERSHOCK', req: ['pound', 'kickflip'], desc: 'Ground pound hits 3 lanes.',
    apply: (s) => { s.aftershock = true; } },
  { id: 'squadron', name: 'SQUADRON', req: ['wingman', 'split'], desc: 'Wingmen fire 50% faster.',
    apply: (s, l) => { s.squadron = l > 1 ? 0.9 : 0.75; } },
  { id: 'driftking', name: 'DRIFT KING', req: ['slipstream', 'blink'], desc: 'Phasing fires a burst too.',
    apply: (s) => { s.driftKing = true; } },
  { id: 'domino', name: 'DOMINO', req: ['chain', 'frag'], desc: 'Death blasts are bigger.',
    apply: (s, l) => { s.domino = l > 1 ? 1.8 : 1.5; } },
  { id: 'counter', name: 'COUNTERSTRIKE', req: ['ambush', 'mirror'], desc: 'Reflected bullets deal triple.',
    apply: (s) => { s.counter = true; } },
);

export const synergyLevel = (sy, stacks) => Math.min(2, ...sy.req.map((id) => stacks[id] || 0));
export function activeSynergies(stacks) {
  return SYNERGIES.filter((sy) => sy.req.every((id) => stacks[id] > 0));
}

// Evolutions: an item at its max stack + its partner = the item evolves, at
// once. It keeps its slot and adds a new behaviour (and incorporates the combo
// the two already formed). Effects are flags read by the weapon and the run.
export const EVOLUTIONS = [
  { id: 'bonelance', name: 'BONE LANCE', base: 'pierce', partner: 'slug',
    desc: 'Shots pierce everything; every enemy pierced adds +15% damage.',
    apply: (s) => { s.pierce = Math.max(s.pierce, 40); s.pierceRamp = 0.15; } },
  { id: 'pandemic', name: 'PANDEMIC', base: 'toxin', partner: 'frag',
    desc: 'Every poisoned death spreads its poison to everything near it.',
    apply: (s) => { s.toxinSpread = 99; } },
  { id: 'swarmlord', name: 'SWARMLORD', base: 'split', partner: 'homing',
    desc: 'Side shots each hunt a different enemy.',
    apply: () => {} },
  { id: 'thunderclap', name: 'THUNDERCLAP', base: 'echo', partner: 'rapid',
    desc: 'Echo rounds burst into three smaller echoes on impact.',
    apply: () => {} },
  { id: 'stormcaller', name: 'STORMCALLER', base: 'arc', partner: 'brand',
    desc: 'Arcs jump through every branded enemy, no limit.',
    apply: () => {} },
  { id: 'corona', name: 'CORONA', base: 'orbital', partner: 'mirror',
    desc: 'Orbitals throw the shots they catch back as yours.',
    apply: () => {} },
  { id: 'armada', name: 'ARMADA', base: 'wingman', partner: 'split',
    desc: 'Wingmen fire your weapon: its traits, its rockets, its beam or rail.',
    apply: () => {} },
  { id: 'web', name: 'WEB', base: 'afterglow', partner: 'sine',
    desc: 'Trails weave into a web that numbs what touches it.',
    apply: () => {} },
  { id: 'maelstrom', name: 'MAELSTROM', base: 'undertow', partner: 'magnet', partnerMin: 2,
    desc: 'Phasing pulls everything on screen, hearts too.',
    apply: () => {} },
  { id: 'pinball', name: 'PINBALL', base: 'ricochet', partner: 'pierce',
    desc: 'Shots bounce up to 3 times between the top edge and the enemy line.',
    apply: (s) => { s.bounces = 3; } },
  { id: 'hypermetabolism', name: 'HYPERMETABOLISM', base: 'metabolism', partner: 'fever',
    desc: 'METABOLISM builds up to +60% RATE and a hit only halves it.',
    apply: (s) => { s.metabCap = 0.6; } },
];
export const EVO_BY_ID = Object.fromEntries(EVOLUTIONS.map((e) => [e.id, e]));
const evoReady = (ev, stacks) => (stacks[ev.base] || 0) >= maxOf(ITEM_BY_ID[ev.base], stacks)
  && (stacks[ev.partner] || 0) >= (ev.partnerMin || 1);
export function activeEvolutions(stacks) { return EVOLUTIONS.filter((ev) => ITEM_BY_ID[ev.base] && evoReady(ev, stacks)); }

export function computeStats(board, stacks) {
  const s = baseStats();
  board.apply(s);
  for (const id in stacks) {
    const it = ITEM_BY_ID[id];
    if (it && it.apply && stacks[id] > 0) it.apply(s, stacks[id]);
  }
  for (const sy of activeSynergies(stacks)) { const l = synergyLevel(sy, stacks); s.syn[sy.id] = l; sy.apply(s, l); }
  // v1.2 stack thresholds: the top stack of a behaviour item adds a new shape
  const n = (id) => stacks[id] || 0;
  s.seekReach = n('homing') >= 2 ? 2 : 1;
  if (n('pierce') >= 3) s.pierceRamp = 0.1;
  if (n('frag') >= 2) s.fragReach = true;
  if (n('arc') >= 3) { s.arcMul = 0.45; s.arcLanes = true; }
  if (n('toxin') >= 3) s.toxinSpread = 1;
  if (n('crit') >= 3) s.critPierce = 1;
  for (const ev of activeEvolutions(stacks)) { s.evo[ev.id] = true; ev.apply(s); }
  // v1.1 pair effects (named in combos.js, applied by the shot engine and run)
  const has = (...ids) => ids.every((id) => stacks[id] > 0);
  s.cascade = has('fission', 'split');
  s.mirv = has('fission', 'rockets');
  s.grenade = has('shrapnel', 'chain');
  s.sporeBurst = has('shrapnel', 'toxin');
  s.execution = has('brand', 'crit');
  s.conduit = has('brand', 'arc');
  s.bloodhound = has('brand', 'homing');
  s.siege = has('charge', 'railgun');
  s.resonance = has('charge', 'echo');
  s.airRaid = has('skyshot', 'kickflip');
  s.meteor = has('skyshot', 'pound');
  s.spectre = has('ghostround', 'mirror');
  s.wraith = has('ghostround', 'blink');
  s.ribbon = has('afterglow', 'sine');
  s.scar = has('afterglow', 'laser');
  s.sixthSense = has('premonition', 'adrenaline');
  s.hiveMind = has('cellwall', 'greed');
  s.horizon = has('blackhole', 'orbital');
  s.artillery = has('leadweights', 'slug');
  s.miasma = has('sporecloud', 'toxin');
  s.drift = has('momentum', 'slipstream');
  if (has('carapace', 'plating')) s.carapace = 2;          // EXOSKELETON
  if (s.wraith) s.phaseTime += 0.2;
  if (s.artillery) s.shotSpeed += 0.12 * (stacks.slug || 0); // SLUG's slowdown cancelled
  // Carrier = what you fire. Priority beam > rail > mortar > stinger > glaive
  // > rocket > brood > mine > bolt; the others reshape it (pairs: DESIGN_V1.2).
  s.carrier = s.hasBeam ? 'beam' : s.hasRail ? 'rail' : s.hasMortar ? 'mortar' : s.hasSting ? 'sting'
    : s.hasGlaive ? 'glaive' : s.hasRocket ? 'rocket' : s.hasBrood ? 'brood' : s.hasMine ? 'mine' : 'bolt';
  s.shotSpeed = Math.max(0.5, Math.min(2.5, s.shotSpeed));
  s.bulletSpeed = 520 * s.shotSpeed;
  // Derived from SPEED and LUCK, so every source of them counts.
  s.speed = Math.max(0.6, Math.min(2.2, s.speed));
  s.phaseCd /= s.speed;
  s.crit += 0.03 * s.luck;
  // FOCUS LENS: bigger crits; a little crit chance when there is none to boost.
  s.critMul += s.focus;
  if (s.focus && !(stacks.crit > 0)) s.crit += 0.05 * s.focus;
  if (s.heartCap) s.maxHearts = Math.min(s.maxHearts, s.heartCap);
  s.iframeTime = Math.max(0.5, s.iframeTime);
  s.maxHearts = Math.max(1, s.maxHearts);
  s.fireRate = Math.min(20, s.fireRate);
  s.crit = Math.min(0.75, s.crit);
  return s;
}

// Weighted pick of `n` distinct items from the unlocked pool.
// Two sources of items, two roles:
//   'level' (every level-up): frequent and small. COMMON and RARE only, no fire
//            modes, no actives. Items you already own come back more often, so
//            level-ups build a stack, Vampire Survivors style.
//   'boss'  (boss loot): rare and transformative. Fire modes, actives and EPICs
//            only drop here; COMMONs are unlikely; at least one card is RARE+;
//            with no fire mode yet, one card is a fire mode (the pivot).
const BOSS_ONLY = new Set(['mode', 'active']);
const SOURCE_WEIGHT = {
  level: [60, 30, 0],
  boss: [12, 30, 22],
};
// Stack cap: MITOSIS lets every COMMON weapon item stack once more.
// An active you already hold can come back once from a boss: OVERCLOCK.
export const maxOf = (it, stacks) => (it.cat === 'active' ? (stacks[it.id] ? 2 : 1) : it.max)
  + (stacks.mitosis && it.rarity === 0 && it.cat === 'weapon' ? 1 : 0);
// Items that exclude each other (either side may declare it).
const conflicting = (it, stacks) => (it.conflicts || []).some((c) => stacks[c] > 0)
  || ITEMS.some((o) => stacks[o.id] > 0 && (o.conflicts || []).includes(it.id));

export function rollItems(rng, unlocked, stacks, n, luck = 0, { source = 'boss', exclude = [] } = {}) {
  const pool = ITEMS.filter((it) => unlocked.includes(it.id)
    && (stacks[it.id] || 0) < maxOf(it, stacks)
    && !conflicting(it, stacks)
    && (!it.needs || it.needs.some((id) => stacks[id] > 0))
    && !exclude.includes(it.id)
    && (source === 'boss' || !BOSS_ONLY.has(it.cat))
    && SOURCE_WEIGHT[source][it.rarity] > 0);
  const weight = (it) => SOURCE_WEIGHT[source][it.rarity]
    * (it.rarity > 0 ? 1 + luck * 0.3 : 1)
    * (source === 'level' && stacks[it.id] ? 1.6 : 1);
  const take = (cands) => {
    const ws = cands.map(weight);
    let r = rng.next() * ws.reduce((x, y) => x + y, 0);
    let i = 0;
    while (i < ws.length - 1 && r > ws[i]) { r -= ws[i]; i++; }
    return cands[i];
  };
  const out = [];
  const grab = (filter) => {
    const cands = pool.filter((it) => !out.includes(it) && filter(it));
    if (cands.length && out.length < n) out.push(take(cands));
  };
  // Level-ups build: with ~76 items, one card is always something you already
  // hold and can still stack (when there is one), or builds never close.
  if (source === 'level') grab((it) => stacks[it.id] > 0);
  if (source === 'boss') {
    const hasMode = ITEMS.some((it) => it.cat === 'mode' && stacks[it.id]);
    if (!hasMode) grab((it) => it.cat === 'mode');
    if (!out.some((it) => it.rarity > 0)) grab((it) => it.rarity > 0);
  }
  // At most one fire mode per offer: the other cards stay varied.
  const oneMode = (it) => it.cat !== 'mode' || !out.some((o) => o.cat === 'mode');
  while (out.length < n) {
    const before = out.length;
    grab(oneMode);
    if (out.length === before) grab(() => true);   // tiny pools: take anything left
    if (out.length === before) break;
  }
  // the guaranteed cards must not always sit on top
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

// Expected single-target damage per second, as a multiple of a fresh STOCK board.
// Used by the run to scale enemy HP partially with player power, and by
// scripts/balance.mjs to print the balance report.
export const BASE_DPS = 6;
export function effectiveDps(s) {
  const dmg = s.damage * s.damageMul;
  // CONVERGENCE lands the side shots on the target (every other volley at x2)
  const sideHit = s.converge ? (s.converge > 1 ? 0.75 : 1) : s.homing > 0 ? Math.min(1, 0.5 + 0.25 * s.homing) : 0;
  let perShot = dmg + 2 * s.split * dmg * s.sideDamage * sideHit;
  if (s.echo) perShot += (dmg * s.echoMul - dmg) / s.echo;
  if (s.echo && s.evo.thunderclap) perShot += dmg * s.echoMul * 0.3 / s.echo;   // the three small echoes, on other targets
  perShot *= 1 + s.crit * (s.critMul - 1);
  const CARRIER_DPS = { bolt: 1, beam: 1.15, rail: 1.05, rocket: 1, glaive: 1.1, mine: 1, brood: 0.95, sting: 1.05, mortar: 1 };
  let m = CARRIER_DPS[s.carrier] ?? 1;
  if (s.carrier === 'rail') m *= s.shotSpeed * (s.modeLv.railgun > 1 ? 1.15 : 1);   // shot speed = rail charge rate
  if (s.carrier === 'beam' && s.modeLv.laser > 1) m *= 1.12;
  if (s.hasScatter && s.modeLv.scatter > 1) m *= 1.15;   // ramp-up, at a typical hold
  if (s.carrier === 'glaive' && s.modeLv.glaive > 1) m *= 1.2;
  if (s.hasScatter) m *= 0.85;
  if (s.hasSine) m *= 0.9;
  if (s.hasRocket && s.carrier !== 'rocket') m *= 1.1;
  // v1.1 damage that does not come from the direct shot (rough shares, so
  // enemy HP scales with these builds too instead of falling behind them)
  if (s.fission) m *= 1 + 0.35 * s.fission;               // fragments on the first hit
  if (s.brand) m *= s.brand > 1 ? 1.3 : 1.17;             // branded targets take more
  if (s.afterglow) m *= 1 + (s.afterglow > 1 ? 0.3 : 0.18);
  if (s.skyshot) m *= 1 + 0.12 * s.skyshot;              // only in the air: a small share
  if (s.charge) m *= 1.12;
  // v1.2 traits (rough shares at a typical uptime)
  if (s.ricochet) m *= s.carrier === 'rail' ? 1.3 : 1 + 0.06 * s.bounces;
  if (s.slingshot) m *= 1.05;
  if (s.overkill) m *= 1.04 + 0.03 * (s.overkill - 1);
  if (s.cull) m *= s.cull > 1 ? 1.12 : 1.07;
  if (s.metabolism) m *= 1 + s.metabCap * (s.metabolism > 1 || s.metabCap > 0.35 ? 0.8 : 0.6);
  if (s.heartbeat) m *= (s.heartbeat > 1 ? 1.16 : 1.12) * (s.carrier === 'rail' ? 1.08 : 1);
  if (s.bloodrush) m *= s.bloodrush > 1 ? 1.2 : 1.14;
  let dps = s.fireRate * perShot * m + s.toxin;
  if (s.shrapnel) dps += dmg * 1.2 * (3 + 2 * (s.shrapnel - 1)) * 0.3;   // ~0.3 kills/s, shards carry enemy HP too
  return dps;
}
export function powerRatio(s) { return Math.max(1, effectiveDps(s) / BASE_DPS); }

// The four stats shown to the player (pause panel, arrows on item cards).
export const STAT_DEFS = [
  { id: 'dmg', label: 'DMG', get: (s) => s.damage * s.damageMul, fmt: (v) => v.toFixed(2) },
  { id: 'rate', label: 'RATE', get: (s) => s.fireRate, fmt: (v) => v.toFixed(1) },
  { id: 'speed', label: 'SPEED', get: (s) => s.speed, fmt: (v) => v.toFixed(2) },
  { id: 'shot', label: 'SHOT SPD', get: (s) => s.shotSpeed, fmt: (v) => v.toFixed(2) },
  { id: 'luck', label: 'LUCK', get: (s) => s.luck, fmt: (v) => String(Math.round(v)) },
  { id: 'hearts', label: 'HP', get: (s) => s.maxHearts, fmt: (v) => String(v) },
];

// Which stats an item would change for this build: [{label, dir: 1|-1}]
export function statDelta(board, stacks, id) {
  const before = computeStats(board, stacks);
  const next = { ...stacks, [id]: (stacks[id] || 0) + 1 };
  const after = computeStats(board, next);
  const out = [];
  for (const d of STAT_DEFS) {
    const a = d.get(before), b = d.get(after);
    if (Math.abs(b - a) > 1e-6) out.push({ label: d.label, dir: b > a ? 1 : -1 });
  }
  return out;
}

export const STARTER_ITEMS = ITEMS.filter((i) => !i.unlock).map((i) => i.id);
