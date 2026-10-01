// Authored sections: short choreographies played on the enemy metronome.
// The run strings sections together instead of rolling enemies and obstacles
// independently, so the same shapes come back and can be learned. The only
// randomness is which section of the current tier plays and a left/right
// mirror.
//
// Times are in BEATS (1 beat = 2 metronome ticks = 0.42 s at base tempo; the
// tempo steps up once per district). Lanes are 0-4, mirrored as a whole.
//   e(beat, type, lane)   an enemy starts entering on that beat
//   r(beat, 'BT...')      an obstacle row that REACHES YOU on that beat
//                         (B barrier: dodge, T tripwire: jump, . free)
//   v(beat)               a rift veil that reaches you on that beat (phase)
//   c(beat, lane, n)      a coin line, a hint of where to stand
// `from` is the distance (m) where a section joins the pool. Obstacle beats
// are >= 8 so there is time to spawn them at the top of the screen.
// Fairness: every row keeps a non-barrier lane, rows that follow each other
// are at least 2 beats apart, and enemy lanes plus rows never close all five
// lanes at the same moment.

const e = (beat, type, lane) => ({ beat, kind: 'enemy', type, lane });
const r = (beat, row) => ({ beat, kind: 'row', row });
const v = (beat) => ({ beat, kind: 'veil' });
const c = (beat, lane, n = 4) => ({ beat, kind: 'coins', lane, n });

export const SECTIONS = [
  // --- warm-up: one idea at a time ------------------------------------------
  { id: 'lone-drone', from: 0, events: [e(0, 'drone', 2), c(4, 0)] },
  { id: 'drone-pair', from: 0, events: [e(0, 'drone', 0), e(4, 'drone', 4), c(6, 2)] },
  { id: 'first-wire', from: 60, events: [c(2, 2, 3), r(8, '..T..'), r(12, '.TTT.')] },
  { id: 'first-wall', from: 60, events: [r(8, 'B....'), r(11, '...B.'), c(4, 2)] },
  { id: 'drone-wire', from: 150, events: [e(0, 'drone', 1), r(10, 'TTTTT'), c(6, 3)] },
  { id: 'veil-intro', from: 160, events: [c(4, 2, 3), v(10)] },
  // --- sweeper (500 m) ------------------------------------------------------
  { id: 'sweep', from: 500, events: [e(0, 'sweeper', 2), r(12, 'B...B')] },
  { id: 'crossfire', from: 500, events: [e(0, 'drone', 0), e(0, 'drone', 4), r(10, '..T..'), c(4, 2)] },
  { id: 'slalom', from: 500, events: [r(8, 'BB.BB'), r(10, 'B.BBB'), r(12, 'BB.BB'), c(5, 2, 3)] },
  // --- brooder (700 m) ------------------------------------------------------
  { id: 'eggs', from: 700, events: [e(0, 'brooder', 2), e(6, 'drone', 0)] },
  { id: 'egg-gate', from: 700, events: [e(0, 'brooder', 1), r(12, 'BB.BB'), c(8, 2, 3)] },
  { id: 'zipper', from: 800, events: [r(8, 'TBTBT'), r(10, 'BTBTB'), r(12, 'TBTBT'), e(12, 'drone', 2)] },
  // --- crusher (1000 m) -----------------------------------------------------
  { id: 'crusher', from: 1000, events: [e(0, 'crusher', 2), r(14, 'B...B')] },
  { id: 'drums', from: 1000, events: [r(8, 'TTTTT'), r(10, 'BB.BB'), r(12, 'TTTTT'), c(4, 2)] },
  { id: 'veil-sweep', from: 1000, events: [e(0, 'sweeper', 1), v(12), c(14, 3)] },
  // --- stalker (1200 m) -----------------------------------------------------
  { id: 'stalkers', from: 1200, events: [e(0, 'stalker', 1), e(5, 'stalker', 3)] },
  // stalker covers lanes 1-3; the gate's gap is lane 0, out of its reach
  { id: 'stalker-gate', from: 1200, events: [e(0, 'stalker', 2), r(12, '.BBBB'), c(8, 0, 3)] },
  { id: 'pincer', from: 1200, events: [e(0, 'sweeper', 0), e(0, 'sweeper', 4), r(12, '.TTT.')] },
  // --- hopper (1500 m) ------------------------------------------------------
  { id: 'hopper-drums', from: 1500, events: [e(0, 'hopper', 0), r(10, 'TTTTT'), r(14, 'TTTTT')] },
  { id: 'hop-zip', from: 1500, events: [e(0, 'hopper', 4), r(12, 'TBTBT'), r(14, 'BTBTB')] },
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
];

// Mirror a section left/right.
export function mirrorEvent(ev) {
  const out = { ...ev };
  if (ev.lane !== undefined) out.lane = 4 - ev.lane;
  if (ev.row) out.row = [...ev.row].reverse().join('');
  return out;
}
