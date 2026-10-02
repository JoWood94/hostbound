// The gameplay clock. It runs with the sound off: it is how the game keeps
// time, not a music feature. The clock counts TICKS (0.21 s at base tempo,
// one step faster per district). Every threat is scheduled on it, so the same
// warning always means the same reaction time. The music happens to follow it.
export const BASE_BPM = 140;
// One step up per district (every 1000 m).
export const runBpm = (d) => BASE_BPM + 10 * Math.min(5, Math.floor(d / 2.5));
export const TICK_BASE = 60 / BASE_BPM / 2;   // seconds per tick at base tempo
