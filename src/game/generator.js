// Procedural sections (Isaac-style rooms, made to measure). The director asks
// for a combat section or an obstacle course at an INTENSITY that keeps rising
// with distance and has no ceiling; the output uses the same event format as
// the authored sections in sections.js, so the director plays both the same way.
//
// Fairness is built in, not hoped for:
//   - courses walk a safe path first and fill the other lanes around it, then
//     the result is checked with fairness.js (jumps 3 beats apart, phases 8)
//     and regenerated if it fails;
//   - combat waves keep the lanes their enemies threaten to three at most, so
//     two stay open; the director's safeToEnter still guards them at runtime.
import { survivable, rowsOf, JUMP_BEATS, PHASE_BEATS } from './fairness.js';
import { TYPES } from './enemies.js';

// Intensity: 2.4 at 1000 m, 5.3 at 3000, 9.6 at 6000, 18 at 12000. No cap.
export const intensity = (m) => 1 + m / 700;

// Lanes an enemy threatens with its shots (low waves are jumpable: none).
function threat(type, lane) {
  const at = (...o) => o.map((d) => lane + d).filter((l) => l >= 0 && l < 5);
  switch (type) {
    case 'drone': case 'kamikaze': return at(0);
    case 'brooder': case 'crusher': return [];
    case 'tank': return at(-2, 2);
    case 'wall': return [0, 1, 2, 3, 4].filter((l) => l !== lane);
    default: return at(-1, 0, 1);       // sweeper, stalker, hopper, throb, weaver
  }
}
// How much an enemy weighs in a wave (rough danger per volley).
const WEIGHT = { drone: 1, kamikaze: 1.2, brooder: 1.2, hopper: 1.6, sweeper: 1.8, stalker: 1.8, crusher: 1.8, throb: 2.4, weaver: 2.6, wall: 3, tank: 3 };

// ---------------------------------------------------------------------------
// Obstacle rows
// ---------------------------------------------------------------------------
// One row around a safe lane: the safe lane is free (or a wire / a tear when
// the row asks for a move), the others are filled by density.
function makeRow(rng, safe, I, canJump, canPhase) {
  const pB = Math.min(0.92, 0.42 + I * 0.035);
  const pT = Math.min(0.5, 0.15 + I * 0.02);
  const row = [];
  for (let l = 0; l < 5; l++) {
    if (l === safe) row.push('.');
    else {
      const r = rng.next();
      row.push(r < pB ? 'B' : r < pB + pT ? 'T' : '.');
    }
  }
  // Sometimes the way through itself asks for a move.
  const r = rng.next();
  if (canPhase && r < Math.min(0.3, 0.04 * I)) row[safe] = 'P';
  else if (canJump && r < Math.min(0.55, 0.08 * I)) row[safe] = 'T';
  return row.join('');
}

// A course: a random walk of safe lanes, one row every `gap` beats.
export function generateCourse(rng, I, startBeat = 8) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const n = Math.min(16, 4 + Math.floor(I * 0.55));
    const gap = I >= 9 ? 1.5 : I >= 5 ? 2 : 2.5;
    let safe = rng.int(0, 4);
    let lastJump = -99, lastPhase = -99;
    const events = [];
    let beat = startBeat;
    for (let i = 0; i < n; i++) {
      const row = makeRow(rng, safe, I * (attempt > 6 ? 0.7 : 1), beat - lastJump >= JUMP_BEATS, beat - lastPhase >= PHASE_BEATS && I >= 3);
      if (row[safe] === 'T') lastJump = beat;
      if (row[safe] === 'P') lastPhase = beat;
      // a full-width veil now and then, in place of a row
      if (I >= 5 && beat - lastPhase >= PHASE_BEATS && rng.chance(Math.min(0.15, 0.015 * I))) {
        events.push({ beat, kind: 'veil' });
        lastPhase = beat;
      } else events.push({ beat, kind: 'row', row });
      // the safe lane drifts by at most one lane per beat of gap
      const step = rng.int(-Math.floor(gap), Math.floor(gap));
      safe = Math.max(0, Math.min(4, safe + step));
      beat += gap;
    }
    // a trail of cells along the first safe lane
    events.push({ beat: startBeat - 3, kind: 'coins', lane: events[0].row ? events[0].row.indexOf('.') >= 0 ? events[0].row.indexOf('.') : 2 : 2, n: 3 });
    if (survivable(rowsOf(events)).ok) return events;
  }
  return [{ beat: startBeat, kind: 'row', row: 'TTTTT' }];
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
// Waves of enemies, more and denser as intensity rises; from intensity 3
// obstacle rows weave between the waves.
export function generateCombat(rng, I, distance) {
  const pool = Object.keys(TYPES).filter((t) => TYPES[t].unlockAt <= distance);
  const waves = Math.min(9, 2 + Math.floor(I / 2.5));
  const spacing = Math.max(2, 7 - I * 0.35);            // beats between waves
  const budget = 1 + I * 0.32;                           // weight per wave
  const events = [];
  let beat = 0;
  for (let w = 0; w < waves; w++) {
    const used = new Set();
    let weight = 0;
    const lanes = [0, 1, 2, 3, 4].sort(() => rng.next() - 0.5);
    for (let tries = 0; tries < 8 && weight < budget; tries++) {
      // heavier enemies become likelier as intensity rises
      const cands = pool.filter((t) => WEIGHT[t] <= budget - weight + 0.6 && t !== 'wall');
      if (!cands.length) break;
      const weighted = cands.flatMap((t) => Array(Math.max(1, Math.round(1 + (WEIGHT[t] - 1) * Math.min(1, I / 8) * 2))).fill(t));
      const type = rng.pick(weighted);
      const lane = lanes.find((l) => {
        const u = new Set(used);
        for (const x of threat(type, l)) u.add(x);
        return u.size <= 3 && !events.some((e) => e.kind === 'enemy' && e.beat === beat && e.lane === l);
      });
      if (lane === undefined) continue;
      for (const x of threat(type, lane)) used.add(x);
      events.push({ beat: beat + (weight > 0 ? rng.int(0, 2) : 0), kind: 'enemy', type, lane });
      weight += WEIGHT[type];
    }
    // the Wall: alone, now and then
    if (pool.includes('wall') && w === waves - 1 && rng.chance(Math.min(0.25, I * 0.02))) {
      events.push({ beat: beat + spacing, kind: 'enemy', type: 'wall', lane: rng.int(1, 3) });
    }
    beat += spacing;
  }
  // obstacle rows threaded through the fight
  if (I >= 3 && rng.chance(Math.min(0.85, 0.2 + I * 0.05))) {
    const course = generateCourse(rng, I * 0.6, 8);
    const keep = Math.min(course.length - 1, 2 + Math.floor(I / 4));
    for (const e of course.slice(0, keep)) if (e.kind !== 'coins') events.push({ ...e, beat: e.beat + rng.int(0, 4) });
    // re-check: rows moved, fairness must still hold
    if (!survivable(rowsOf(events)).ok) return events.filter((e) => e.kind !== 'row' && e.kind !== 'veil');
  }
  return events;
}
