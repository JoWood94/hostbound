// Achievements unlock items and boards. Each returns [current, target] so the
// archive screen can show progress. `rs` is the live run stats (may be null).
import { ITEMS } from './items.js';
import { BOARDS } from './boards.js';

const T = (save, rs, key) => save.totals[key] + (rs ? rs[key] || 0 : 0);

export const ACHIEVEMENTS = [
  { id: 'dist_1000', name: 'COMMUTER', desc: 'Reach 1000m in one run', progress: (s, r) => [Math.max(s.best, r ? r.distance : 0), 1000] },
  { id: 'dist_2000', name: 'NIGHT SHIFT', desc: 'Reach 2000m in one run', progress: (s, r) => [Math.max(s.best, r ? r.distance : 0), 2000] },
  { id: 'dist_3000', name: 'NO SLEEP', desc: 'Reach 3000m in one run', progress: (s, r) => [Math.max(s.best, r ? r.distance : 0), 3000] },
  { id: 'kills_150', name: 'SCRAPPER', desc: 'Destroy 150 enemies (total)', progress: (s, r) => [T(s, r, 'kills'), 150] },
  { id: 'kills_500', name: 'SCRAPYARD', desc: 'Destroy 500 enemies (total)', progress: (s, r) => [T(s, r, 'kills'), 500] },
  { id: 'runs_5', name: 'HABIT', desc: 'Start 5 runs', progress: (s) => [s.totals.runs, 5] },
  { id: 'runs_10', name: 'ADDICT', desc: 'Start 10 runs', progress: (s) => [s.totals.runs, 10] },
  { id: 'boss_1', name: 'FIRST BLOOD', desc: 'Defeat a boss', progress: (s, r) => [T(s, r, 'bosses'), 1] },
  { id: 'boss_3', name: 'HEADHUNTER', desc: 'Defeat 3 bosses (total)', progress: (s, r) => [T(s, r, 'bosses'), 3] },
  { id: 'boss_2run', name: 'DOUBLE TAP', desc: 'Defeat 2 bosses in one run', progress: (s, r) => [r ? r.bosses : 0, 2], runOnly: true },
  { id: 'boss_nohit', name: 'UNTOUCHABLE', desc: 'Defeat a boss without getting hit', progress: (s, r) => [r && r.bossNoHit ? 1 : 0, 1], runOnly: true },
  { id: 'boss_1heart', name: 'LAST BREATH', desc: 'Defeat a boss on your last heart', progress: (s, r) => [r && r.boss1Heart ? 1 : 0, 1], runOnly: true },
  { id: 'phase_50', name: 'GHOSTING', desc: 'Phase through 50 bullets (total)', progress: (s, r) => [T(s, r, 'phaseDodges'), 50] },
  { id: 'phase_run_25', name: 'SPECTRE', desc: 'Phase 25 times in one run', progress: (s, r) => [r ? r.phases : 0, 25], runOnly: true },
  { id: 'jump_100', name: 'OLLIE', desc: 'Jump over 100 low waves or barriers (total)', progress: (s, r) => [T(s, r, 'lowJumps'), 100] },
  { id: 'obstacles_200', name: 'PARKOUR', desc: 'Pass 200 obstacles (total)', progress: (s, r) => [T(s, r, 'obstacles'), 200] },
  { id: 'def_3', name: 'BUNKER', desc: 'Hold 3 defense items in one run', progress: (s, r) => [r ? r.defItems : 0, 3], runOnly: true },
  { id: 'buy_5', name: 'CUSTOMER', desc: 'Buy 5 things at the black market (total)', progress: (s, r) => [T(s, r, 'purchases'), 5] },
  { id: 'toxin_kills_60', name: 'OUTBREAK', desc: 'Kill 60 poisoned enemies (total)', progress: (s, r) => [T(s, r, 'toxinKills'), 60] },
  { id: 'kills_run_50', name: 'RAMPAGE', desc: 'Destroy 50 enemies in one run', progress: (s, r) => [r ? r.kills : 0, 50], runOnly: true },
  { id: 'elite_10', name: 'GOLD DIGGER', desc: 'Destroy 10 elite enemies (total)', progress: (s, r) => [T(s, r, 'elites'), 10] },
  { id: 'elite_25', name: 'GOLD RUSH', desc: 'Destroy 25 elite enemies (total)', progress: (s, r) => [T(s, r, 'elites'), 25] },
  { id: 'pure_1000', name: 'FLAWLESS', desc: 'Reach 1000m without getting hit', progress: (s, r) => [r ? r.pureDistance : 0, 1000], runOnly: true },
  { id: 'boss_5', name: 'EXECUTIONER', desc: 'Defeat 5 bosses (total)', progress: (s, r) => [T(s, r, 'bosses'), 5] },
  { id: 'coins_run_150', name: 'PAYDAY', desc: 'Collect 150 coins in one run', progress: (s, r) => [r ? r.coins : 0, 150], runOnly: true },
  { id: 'daily_1', name: 'ROUTINE', desc: 'Play a daily run', progress: (s, r) => [s.totals.dailies + (r && r.daily ? 1 : 0), 1] },
  { id: 'discover_18', name: 'COLLECTOR', desc: 'Discover 18 different items', progress: (s) => [s.discovered.length, 18] },
];

// What an achievement unlocks, for display.
export function rewardOf(achId) {
  const it = ITEMS.find((i) => i.unlock === achId);
  if (it) return { kind: 'item', name: it.name, id: it.id };
  const b = BOARDS.find((x) => x.unlock === achId);
  if (b) return { kind: 'board', name: b.name + ' SHIP', id: b.id };
  return null;
}

// Returns newly completed achievements (and marks them in save).
export function checkAchievements(save, rs) {
  const done = [];
  for (const a of ACHIEVEMENTS) {
    if (save.achievements[a.id]) continue;
    const [cur, target] = a.progress(save, rs);
    if (cur >= target) {
      save.achievements[a.id] = true;
      done.push(a);
    }
  }
  return done;
}

export function unlockedItems(save) {
  const extra = save.extraItems || [];
  return ITEMS.filter((i) => !i.unlock || save.achievements[i.unlock] || extra.includes(i.id)).map((i) => i.id);
}

export function unlockedBoards(save) {
  return BOARDS.filter((b) => !b.unlock || save.achievements[b.unlock]).map((b) => b.id);
}
