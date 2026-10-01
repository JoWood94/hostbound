// Persistent meta progress in localStorage. Versioned so future changes can migrate.
const KEY = 'neon-overdrift.save';
const VERSION = 1;

function fresh() {
  return {
    v: VERSION,
    best: 0,
    totals: {
      runs: 0, kills: 0, bosses: 0, distance: 0, coins: 0, purchases: 0,
      phaseDodges: 0, lowJumps: 0, obstacles: 0, toxinKills: 0, elites: 0, dailies: 0, laserKills: 0,
    },
    achievements: {},      // id -> true
    discovered: [],        // item ids ever picked up
    extraItems: [],        // items unlocked by decrypting corrupted drops
    modesUsed: [],         // fire modes ever equipped
    board: 'stock',
    settings: { sfx: true, music: true, haptics: true },
    daily: { date: '', best: 0 },
  };
}

function migrate(data) {
  const base = fresh();
  if (!data || typeof data !== 'object') return base;
  // Shallow-merge so new fields added in later versions get defaults.
  const out = { ...base, ...data };
  out.totals = { ...base.totals, ...(data.totals || {}) };
  out.settings = { ...base.settings, ...(data.settings || {}) };
  out.daily = { ...base.daily, ...(data.daily || {}) };
  out.achievements = { ...(data.achievements || {}) };
  out.discovered = Array.isArray(data.discovered) ? data.discovered : [];
  out.extraItems = Array.isArray(data.extraItems) ? data.extraItems : [];
  out.modesUsed = Array.isArray(data.modesUsed) ? data.modesUsed : [];
  out.v = VERSION;
  return out;
}

export function loadSave() {
  let data = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) data = JSON.parse(raw);
  } catch { /* private mode or corrupted: start fresh */ }
  const s = migrate(data);
  // Carry over the best distance from v0 builds.
  try {
    const old = Number(localStorage.getItem('no.best') || 0);
    if (old > s.best) s.best = old;
  } catch { /* ignore */ }
  return s;
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage full or blocked */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('no.best'); } catch { /* ignore */ }
  return fresh();
}
