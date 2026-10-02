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
import { survivable, rowsOf as rowsOfEvents } from '../src/game/fairness.js';

const rowsOf = (sec, mirror) => rowsOfEvents(sec.events.map((e) => (mirror ? mirrorEvent(e) : e)));
const survives = survivable;

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
