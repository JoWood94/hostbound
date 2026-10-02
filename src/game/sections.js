// Authored sections: short choreographies played on the gameplay clock.
// SECTIONS are combat (enemies, sometimes with a few obstacles); COURSES are
// obstacle runs. The director alternates them: fight, run, fight, run.
// The run strings sections together instead of rolling enemies and obstacles
// independently, so the same shapes come back and can be learned. The only
// randomness is which section of the current tier plays and a left/right
// mirror.
//
// Times are in BEATS (1 beat = 2 metronome ticks = 0.42 s at base tempo; the
// tempo steps up once per district). Lanes are 0-4, mirrored as a whole.
//   e(beat, type, lane)   an enemy starts entering on that beat
//   r(beat, 'BTP..')      an obstacle row that REACHES YOU on that beat
//                         (B barrier: dodge, T tripwire: jump, P rift: phase, . free)
//   v(beat)               a rift veil that reaches you on that beat (phase)
//   c(beat, lane, n)      a coin line, a hint of where to stand
// `from` is the distance (m) where a section joins the pool; `to` retires the
// intro sections once they would be trivial. Obstacle beats
// are >= 8 so there is time to spawn them at the top of the screen.
// Fairness (checked by scripts/verify-sections.mjs): every row keeps a
// non-barrier lane, rows are at least 2 beats apart, two rows that both need a
// jump on the path are at least 3 beats apart, phase obstacles (P, veils) at
// least 8 beats apart, and enemy lanes plus rows never close all five lanes.

const e = (beat, type, lane) => ({ beat, kind: 'enemy', type, lane });
const r = (beat, row) => ({ beat, kind: 'row', row });
const v = (beat) => ({ beat, kind: 'veil' });
const c = (beat, lane, n = 4) => ({ beat, kind: 'coins', lane, n });

export const SECTIONS = [
  // --- warm-up: one idea at a time ------------------------------------------
  { id: 'lone-drone', to: 1500, from: 0, events: [e(0, 'drone', 2), c(4, 0)] },
  { id: 'drone-pair', to: 1500, from: 0, events: [e(0, 'drone', 0), e(4, 'drone', 4), c(6, 2)] },
  { id: 'drone-wire', to: 2500, from: 150, events: [e(0, 'drone', 1), r(10, 'TTTTT'), c(6, 3)] },
  // --- sweeper (500 m) ------------------------------------------------------
  { id: 'sweep', from: 500, events: [e(0, 'sweeper', 2), r(12, 'B...B')] },
  { id: 'crossfire', from: 500, events: [e(0, 'drone', 0), e(0, 'drone', 4), r(10, '..T..'), c(4, 2)] },
  // --- brooder (700 m) ------------------------------------------------------
  { id: 'eggs', from: 700, events: [e(0, 'brooder', 2), e(6, 'drone', 0)] },
  { id: 'egg-gate', from: 700, events: [e(0, 'brooder', 1), r(12, 'BB.BB'), c(8, 2, 3)] },
  { id: 'zipper', from: 800, events: [r(8, 'TBTBT'), r(11, 'BTBTB'), r(14, 'TBTBT'), e(14, 'drone', 2)] },
  // --- crusher (1000 m) -----------------------------------------------------
  { id: 'crusher', from: 1000, events: [e(0, 'crusher', 2), r(14, 'B...B')] },
  { id: 'veil-sweep', from: 1000, events: [e(0, 'sweeper', 1), v(12), c(14, 3)] },
  // --- stalker (1200 m) -----------------------------------------------------
  { id: 'stalkers', from: 1200, events: [e(0, 'stalker', 1), e(5, 'stalker', 3)] },
  // stalker covers lanes 1-3; the gate's gap is lane 0, out of its reach
  { id: 'stalker-gate', from: 1200, events: [e(0, 'stalker', 2), r(12, '.BBBB'), c(8, 0, 3)] },
  { id: 'pincer', from: 1200, events: [e(0, 'sweeper', 0), e(0, 'sweeper', 4), r(12, '.TTT.')] },
  // --- hopper (1500 m) ------------------------------------------------------
  { id: 'hopper-drums', from: 1500, events: [e(0, 'hopper', 0), r(10, 'TTTTT'), r(14, 'TTTTT')] },
  { id: 'hop-zip', from: 1500, events: [e(0, 'hopper', 4), r(12, 'TBTBT'), r(15, 'BTBTB')] },
  // --- throb (1800 m) -------------------------------------------------------
  { id: 'heartbeat', from: 1800, events: [e(0, 'throb', 2), c(4, 0)] },
  { id: 'heart-walls', from: 1800, events: [e(0, 'throb', 2), r(12, 'B...B'), r(15, 'B...B')] },
  // --- kamikaze (2000 m) ----------------------------------------------------
  { id: 'dive-trio', from: 2000, events: [e(0, 'kamikaze', 0), e(3, 'kamikaze', 2), e(6, 'kamikaze', 4)] },
  { id: 'dive-veil', from: 2000, events: [e(0, 'kamikaze', 2), v(12), e(8, 'drone', 0)] },
  // --- weaver (2300 m) ------------------------------------------------------
  { id: 'weave', from: 2300, events: [e(0, 'weaver', 2), r(14, 'T...T')] },
  { id: 'weave-veil', from: 2300, events: [e(0, 'weaver', 1), v(14)] },
  // --- wall (2500 m) --------------------------------------------------------
  { id: 'under-the-wall', from: 2500, events: [e(0, 'wall', 2), c(6, 2, 3)] },
  // --- tank (3000 m) and the late mixes ------------------------------------
  { id: 'tank', from: 3000, events: [e(0, 'tank', 2)] },
  { id: 'barrage', from: 3000, events: [e(0, 'drone', 0), e(2, 'drone', 2), e(4, 'drone', 4), r(14, 'TTTTT')] },
  { id: 'gauntlet', from: 3000, events: [e(0, 'stalker', 2), v(10), r(13, 'T.T.T'), r(16, 'BB.BB')] },
  { id: 'storm', from: 3500, events: [e(0, 'sweeper', 0), e(0, 'brooder', 4), r(10, 'BB.BB'), r(12, 'B.BBB'), r(14, 'TTTTT')] },
  // --- deep tiers (3500 m +): denser, and mixed with obstacle rows ---------
  // Threat lanes add up (stalker/sweeper/throb/weaver cover 3, drone/kamikaze 1,
  // wall 4): pairs are chosen so two lanes stay open, else safeToEnter slides them.
  { id: 'trident', from: 3500, events: [e(0, 'stalker', 0), e(0, 'stalker', 4), r(10, 'B.T.B'), r(14, '.BTB.')] },
  { id: 'hive-mind', from: 3500, events: [e(0, 'brooder', 0), e(0, 'brooder', 4), r(10, 'BB.BB'), r(14, '.BBB.')] },
  { id: 'pulse', from: 4000, events: [e(0, 'throb', 2), v(12), r(16, 'TBTBT')] },
  { id: 'net', from: 4000, events: [e(0, 'weaver', 0), e(0, 'weaver', 4), r(16, 'B.T.B')] },
  { id: 'firing-squad', from: 4500, events: [e(0, 'drone', 0), e(0, 'drone', 4), e(2, 'drone', 1), r(10, 'BBPBB')] },
  { id: 'stampede', from: 4500, events: [e(0, 'kamikaze', 1), e(2, 'kamikaze', 2), e(4, 'kamikaze', 3), r(12, 'TTTTT')] },
  { id: 'siege', from: 5000, events: [e(0, 'tank', 2), r(14, 'B.B.B'), r(18, '.B.B.')] },
  { id: 'brood-wall', from: 5000, events: [e(0, 'wall', 2), e(8, 'brooder', 0), e(8, 'brooder', 4)] },
  { id: 'rift-fight', from: 5500, events: [e(0, 'sweeper', 1), v(10), e(10, 'drone', 4), r(16, 'BTBTB')] },
  { id: 'the-works', from: 6000, events: [e(0, 'weaver', 2), r(12, 'TBPBT'), e(16, 'kamikaze', 0), v(21), r(25, 'BB.BB')] },
];

// --- COURSES: obstacle-only sections, many lanes blocked, played in between
// combat sections (the director alternates the two). Read the track, weave
// through it. Rows at least 2 beats apart; the free lane moves at most one
// lane per beat; phase obstacles (P rows, veils) at least 8 beats apart, so
// the phase is always recharged (2 s) even at the top tempo (220 BPM). No course leaves
// the centre lane free all the way. Cells trace the line.
export const COURSES = [
  { id: 'c-first-wire', to: 1500, from: 60, events: [c(2, 2, 3), r(8, '..T..'), r(12, '.TTT.')] },
  { id: 'c-first-wall', to: 1500, from: 60, events: [r(8, '..B..'), r(11, '.B...'), c(4, 0)] },
  { id: 'c-veil-intro', to: 1500, from: 160, events: [c(4, 2, 3), v(10)] },
  { id: 'c-first-rift', to: 2500, from: 300, events: [c(4, 2, 3), r(9, 'BBPBB')] },
  { id: 'c-gates', to: 3000, from: 300, events: [c(4, 0, 3), r(8, '.BBBB'), r(12, 'BBBB.'), c(9, 4, 3)] },
  { id: 'c-wire-stairs', to: 3000, from: 300, events: [r(8, 'TT...'), r(10, '.TT..'), r(12, '..TT.'), r(14, '...TT'), c(6, 4, 3)] },
  { id: 'c-checker', from: 500, events: [r(8, 'B.B.B'), r(10, '.B.B.'), r(12, 'B.B.B'), r(14, '.B.B.'), c(5, 1, 3)] },
  { id: 'c-slalom', from: 500, events: [r(8, 'BB.BB'), r(10, 'B.BBB'), r(12, 'BB.BB'), r(14, 'BBB.B'), c(5, 2, 3)] },
  { id: 'c-tunnel', from: 800, events: [r(8, 'B.BBB'), r(10, 'BTBBB'), r(12, 'B.BBB'), r(14, 'BBT.B'), c(5, 1, 4)] },
  { id: 'c-zipper', from: 800, events: [r(8, 'TBTBT'), r(11, 'BTBTB'), r(14, 'TBTBT'), r(17, 'BTBTB')] },
  { id: 'c-veil-gate', from: 1000, events: [r(8, 'BBB.B'), v(11), r(14, '.BBB.'), c(5, 3, 3)] },
  { id: 'c-drums', from: 1000, events: [r(8, 'TTTTT'), r(10, 'B.BBB'), r(12, 'TTTTT'), r(14, 'B.B.B'), r(16, 'TTTTT')] },
  // jump or phase: the outer lanes jump, the middle one phases
  { id: 'c-rift-zip', from: 1200, events: [r(8, 'TBTBT'), r(11, 'BTBTB'), r(14, 'TBPBT'), r(17, 'BTBTB')] },
  { id: 'c-snake', from: 1500, events: [r(8, '.BBBB'), r(10, 'B.BBB'), r(12, 'BB.BB'), r(14, 'BBB.B'), r(16, 'BBBB.'), c(5, 0, 3)] },
  { id: 'c-split', from: 1500, events: [r(8, 'BB.BB'), r(10, '.BBB.'), r(12, '.BTB.'), r(14, 'B.B.B'), c(5, 2, 3)] },
  // jump, dodge, phase: the three moves in one breath
  { id: 'c-triad', from: 1500, events: [r(8, 'TBTBT'), r(11, 'BTBTB'), r(14, 'BPBBB'), r(17, '.BBB.'), c(5, 1, 3)] },
  { id: 'c-gauntlet', from: 2000, events: [r(8, 'TBTBT'), r(11, 'BTBTB'), v(14), r(17, 'BB.BB'), r(20, 'TTTTT')] },
  { id: 'c-phase-run', from: 2000, events: [r(8, 'BBPBB'), r(10, 'BTTTB'), r(12, 'B.BBB'), r(16, 'BBBPB'), r(19, 'TTTTT')] },
  { id: 'c-rift-snake', from: 2500, events: [r(8, 'B.BBB'), r(10, '.BBBB'), v(12), r(14, 'BB.BB'), r(16, 'BBB.B'), v(20), r(23, 'TTTTT')] },
  { id: 'c-storm', from: 3000, events: [r(8, 'TBTBT'), r(10, 'BB.BB'), r(12, 'B.T.B'), v(14), r(16, '.BBB.'), r(18, 'BTTTB'), r(22, 'BBPBB')] },
  { id: 'c-chaos', from: 3500, events: [r(8, 'PBTBP'), r(11, 'BTBTB'), r(14, 'TBTBT'), r(17, 'BBPBB'), r(20, '.TBT.')] },
  // --- deep tiers ----------------------------------------------------------
  { id: 'c-fast-checker', from: 4000, events: [r(8, 'B.B.B'), r(9.5, '.B.B.'), r(11, 'B.B.B'), r(12.5, '.B.B.'), r(14, 'B.B.B')] },
  { id: 'c-double-snake', from: 4500, events: [r(8, '.BBBB'), r(10, 'B.BBB'), r(12, 'BB.BB'), r(14, 'BBB.B'), r(16, 'BBBBP'), r(18, 'BBB.B'), r(20, 'BB.BB'), r(22, 'B.BBB'), r(24, '.BBBB')] },
  { id: 'c-phase-ladder', from: 5000, events: [r(8, 'BBPBB'), r(12, 'TTTTT'), r(16, 'BPBBB'), r(20, 'TTTTT'), r(24, 'BBBPB')] },
  { id: 'c-blender', from: 5500, events: [r(8, 'TBTBT'), r(11, 'BTBTB'), r(13, 'B.B.B'), r(15, '.B.B.'), v(18), r(21, 'TTTTT'), r(23, '.BBBB'), r(25, 'B.BBB'), r(27, 'BB.BB')] },
  { id: 'c-no-rest', from: 6000, events: [r(8, 'B.BBB'), r(9.5, '.BBBB'), r(11, 'TB.BB'), r(12.5, 'B.B.B'), r(14, '.B.B.'), r(16, 'BPBBB'), r(17.5, 'B.B.B'), v(24), r(26, 'TBTBT')] },
];

// Mirror a section left/right.
export function mirrorEvent(ev) {
  const out = { ...ev };
  if (ev.lane !== undefined) out.lane = 4 - ev.lane;
  if (ev.row) out.row = [...ev.row].reverse().join('');
  return out;
}
