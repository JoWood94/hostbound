// The gameplay clock. It runs with the sound off: it is how the game keeps
// time, not a music feature. The clock counts TICKS (0.21 s at base tempo,
// one step faster per district). Every threat is scheduled on it, so the same
// warning always means the same reaction time. The music happens to follow it.
export const BASE_BPM = 140;
// Starts slow (130 BPM, psytrance territory) and climbs smoothly, 9 BPM per
// 1000 m with no steps: ~157 at 3000 m, ~184 at 6000 m, gabber speeds (~220)
// past 10000 m, top 270 at ~15600 m. 270 is the fairness ceiling: jumps last
// the same in ticks at any tempo and fairness.js assumes <= 270 BPM for them;
// above 240 the phase cooldown shrinks with the beat (player.js) so 8 phase
// beats still cover it. `d` = metres / 400.
export const MAX_BPM = 270;
export const runBpm = (d) => Math.min(MAX_BPM, 130 + 3.6 * d);
export const TICK_BASE = 60 / BASE_BPM / 2;   // seconds per tick at base tempo
