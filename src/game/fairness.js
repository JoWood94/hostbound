// Can a player get through these obstacle rows? Shared by the director (which
// tightens courses at high tiers and must never make one impossible) and by
// scripts/verify-sections.mjs (which checks every authored section).
//
// rows: [{ beat, row: 'BTP..' }] sorted by beat (veils are 'PPPPP').
// Between rows the player may move one lane per beat (a hop is 0.11 s, a beat
// is 0.27 s at 220 BPM). B: cannot be there. T: must jump, two jumps need
// JUMP_BEATS between them. P: must phase, two phases need PHASE_BEATS. A
// phase may follow a jump at once: a swipe down in the air drops and phases.
export const JUMP_BEATS = 3;     // a jump (0.45 s at the start, the same in ticks later) + reaction, at any tempo <= 270 BPM
export const PHASE_BEATS = 8;    // phase cooldown 2 s: 8 beats = 2 s at 240 BPM; above it the cooldown follows the beat
const NEG = -1e9;

export function survivable(rows) {
  let states = new Map();
  for (let l = 0; l < 5; l++) states.set(`${l}|${NEG}|${NEG}`, { l, j: NEG, p: NEG });
  let prev = null;
  for (const { beat, row } of rows) {
    const hops = prev === null ? 4 : Math.max(1, Math.floor(beat - prev));
    const next = new Map();
    for (const s of states.values()) {
      for (let d = -hops; d <= hops; d++) {
        const l = s.l + d;
        if (l < 0 || l > 4) continue;
        const ch = row[l];
        let { j, p } = s;
        if (ch === 'B') continue;
        if (ch === 'T') { if (beat - j < JUMP_BEATS) continue; j = beat; }
        if (ch === 'P') { if (beat - p < PHASE_BEATS) continue; p = beat; }
        next.set(`${l}|${j}|${p}`, { l, j, p });
      }
    }
    states = next;
    prev = beat;
    if (!states.size) return { ok: false, at: beat };
  }
  return { ok: true };
}

// Rows of a section's events (any objects with kind 'row' / 'veil' and beat).
export const rowsOf = (events) => events
  .filter((e) => e.kind === 'row' || e.kind === 'veil')
  .map((e) => ({ beat: e.beat, row: e.kind === 'veil' ? 'PPPPP' : e.row }))
  .sort((a, b) => a.beat - b.beat);
