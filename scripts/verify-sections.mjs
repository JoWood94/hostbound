// Fairness check for every authored section, normal and mirrored.
// Run: node scripts/verify-sections.mjs   (exit code 1 on any failure)
//
// A path through the rows is a sequence of lanes. Between two rows the player
// may move at most one lane per beat (a hop is 0.11 s, a beat is 0.27 s at the
// top tempo of 220 BPM). On a row:
//   B  barrier: cannot be there
//   T  tripwire: must jump; two jumps need >= JUMP_BEATS between them
//   P  rift / veil: must phase; two phases need >= PHASE_BEATS between them
//   .  free
// Rules checked:
//   1. some path survives every row (reachability with jump/phase cooldowns)
//   2. no course leaves the centre lane free all the way (it must ask for a move)
import { SECTIONS, COURSES, mirrorEvent } from '../src/game/sections.js';

const JUMP_BEATS = 3;     // a jump (0.45 s) + reaction fits in 3 beats at any tempo <= 270 BPM
const PHASE_BEATS = 8;    // phase cooldown 2 s: 8 beats = 2.18 s at 220 BPM
const NEG = -1e9;

function rowsOf(sec, mirror) {
  const evs = sec.events.map((e) => (mirror ? mirrorEvent(e) : e));
  return evs
    .filter((e) => e.kind === 'row' || e.kind === 'veil')
    .map((e) => ({ beat: e.beat, row: e.kind === 'veil' ? 'PPPPP' : e.row }))
    .sort((a, b) => a.beat - b.beat);
}

// State: lane + beat of the last jump + beat of the last phase.
function survives(rows) {
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

const problems = [];
for (const [lib, isCourse] of [[SECTIONS, false], [COURSES, true]]) {
  for (const sec of lib) {
    for (const mirror of [false, true]) {
      const rows = rowsOf(sec, mirror);
      if (!rows.length) continue;
      const res = survives(rows);
      if (!res.ok) problems.push(`${sec.id}${mirror ? ' (mirror)' : ''}: no safe path at beat ${res.at}`);
    }
    const rows = rowsOf(sec, false);
    if (isCourse && rows.length && rows.every((r) => r.row[2] === '.')) problems.push(`${sec.id}: centre lane free all the way`);
  }
}
if (problems.length) {
  console.log('FAIL\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`OK: ${SECTIONS.length} combat sections, ${COURSES.length} courses`);
