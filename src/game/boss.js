// Bosses. Same rules as regular enemies: every attack is a fixed, telegraphed
// lane pattern cycled in order, so fights are learnable. Three phases each,
// switched at 2/3 and 1/3 HP. A safe option (lane, jump or phase) always exists.
import { ctx, W, H, SAFE_TOP } from '../core/canvas.js';
import { PAL } from '../render/palette.js';
import { strokePoly, drawGlowDot, line, text, ring } from '../render/draw.js';
import { bossSprite, prismEmitterSprite, drawSprite, drawEye } from '../render/sprites.js';
import { look, glowLane, beatClock, shotSpeed, TELE_TICKS, TICK_SEC, teleBonusNow } from './enemies.js';
import { sheet, drawCell } from '../render/images.js';

// Generated boss sheet: 4x5 cells of 256x128, cropped to content by
// import-sheet.py --fit (no cuts). Columns: 0-1 idle, 2 warning, 3 wounded.
const BROOD_BOSSES = sheet('bosses_brood', 256, 128);
const BROOD_BOSSES2 = sheet('bosses_brood2', 256, 128);
// boss id -> [sheet, row]
const BOSS_ART = {
  sentinel: [BROOD_BOSSES, 0], hive: [BROOD_BOSSES, 1], hunter: [BROOD_BOSSES, 2], prism: [BROOD_BOSSES, 3], warden: [BROOD_BOSSES, 4],
  maw: [BROOD_BOSSES2, 0], choir: [BROOD_BOSSES2, 1], mother: [BROOD_BOSSES2, 2], spine: [BROOD_BOSSES2, 3], eclipse: [BROOD_BOSSES2, 4],
};
const PLAYER_ROW = H * 0.78;
import { enemyBullets, spawn, LOW } from './bullets.js';
import { burst, shake } from '../render/fx.js';
import { LANES, LANE_W, laneX } from './world.js';
import { enemies, newId } from './enemies.js';
import { obstacles, spawnObstacle, spawnVeil } from './obstacles.js';
import { sfx } from '../audio/audio.js';
import { bossHp, bossSpeed, bossLayer, timeMul } from './balance.js';

const ALL = [0, 1, 2, 3, 4];
// Below the status bar and the health bar (name + bar end ~66 px under SAFE_TOP).
const holdY = () => 150 + SAFE_TOP;

// Attack parts: volley (n shots per lane), sweep (lanes in order), low (jumpable wave),
// beam (dense stream for `dur`).
const v = (lanes, shots = 3) => ({ kind: 'volley', lanes, shots });
const sw = (lanes, gap = 0.22) => ({ kind: 'sweep', lanes, gap });
const low = (lanes) => ({ kind: 'low', lanes });
const beam = (lanes, dur = 0.7) => ({ kind: 'beam', lanes, dur });
const beamSweep = (lanes, gap = 0.3, dur = 0.25) => ({ kind: 'beamsweep', lanes, gap, dur });
// `tele` is kept as authored but no longer sets the warning: every boss attack
// lights its lanes TELE_TICKS before it fires, like any enemy (see teleTime).
const atk = (parts, tele = 0.9, rest = 0.9) => ({ parts, tele, rest });

// RHYTHM rows: one row of the track per beat, all moving at the same speed so
// they arrive at the same cadence they were fired. 'x' = shot, 'L' = low wave
// (jump), '.' = safe. Every row leaves at least one lane, and consecutive safe
// lanes are at most one hop apart, so a beat is always enough to answer.
const rows = (rs, beat = 0.5) => ({ kind: 'rows', rows: rs, beat });
const R = (rs, beat = 0.5, tele = 0.8, rest = 0.7) => atk([rows(rs, beat)], tele, rest);
// OBSTACLE rows fired by the boss down the track: 'B' barrier, 'T' wire,
// 'P' tear, 'PPPPP' a full veil, '.' free. They scroll at track speed.
const O = (rs, beat = 0.6, tele = 0.9, rest = 0.7) => atk([{ kind: 'obs', rows: rs, beat }], tele, rest);
const FAN_OUT = (g) => [sw([2, 1, 0], g), sw([2, 3, 4], g)];   // from the mouth outward
const FAN_IN = (g) => [sw([0, 1, 2], g), sw([4, 3, 2], g)];
const hole = (...safe) => ALL.map((l) => (safe.includes(l) ? '.' : 'x')).join('');
const corridor = (path, w = 1) => path.map((l) => hole(...Array.from({ length: w }, (_, i) => l + i)));
// Safe lane walking one lane per beat between lo and hi, bouncing at the ends.
function bounce(start, dir, n, lo = 0, hi = 4) {
  const out = [];
  let l = Math.max(lo, Math.min(hi, start)), d = dir;
  for (let i = 0; i < n; i++) {
    out.push(l);
    if (l + d < lo || l + d > hi) d = -d;
    l += d;
  }
  return out;
}
// Alternating march: stand between two shots, step aside every beat.
const MARCH = (n) => Array.from({ length: n }, (_, i) => (i % 2 ? '.x.x.' : 'x.x.x'));
// Chase: the hole starts on your lane (target lock) and runs away from the centre.
const chase = (n) => (pl) => corridor(bounce(pl, pl < 2 ? 1 : pl > 2 ? -1 : 1, n));

// Lanes may be a function of the player's lane, resolved ONCE when the
// telegraph starts ("target lock"): the pattern is still fixed and fair.
const clampL = (ls) => [...new Set(ls.filter((l) => l >= 0 && l < LANES))];
const at = (dl) => (pl) => clampL(dl.map((o) => pl + o));
const except = (dl) => (pl) => ALL.filter((l) => !dl.map((o) => pl + o).includes(l));

export const BOSSES = [
  {
    // March: alternating rows on a steady beat, then sweeps. Learn to step.
    id: 'sentinel', name: 'SENTINEL', color: PAL.magenta,
    hit: [{ x: 0, y: 0, hw: 52, hh: 26 }, { x: -78, y: 0, hw: 26, hh: 13 }, { x: 78, y: 0, hw: 26, hh: 13 }],
    phases: [
      [atk([v([0, 2, 4])], 0.9, 0.6), R(MARCH(6), 0.55), atk([v([1, 3]), low([0, 4])]), atk([sw([0, 1, 2, 3, 4], 0.25)], 0.9)],
      [R(MARCH(6), 0.5), atk([sw([0, 1, 2, 3, 4])], 0.9), atk([v([0, 1, 3, 4], 4)], 0.8), atk([sw([4, 3, 2, 1, 0])], 0.9)],
      [R(MARCH(8), 0.42, 0.8, 0.5), atk([low(ALL)], 0.9, 0.4),
        R(['x.x.x', 'LLLLL', 'x.x.x', 'LLLLL', '.x.x.', 'LLLLL', '.x.x.'], 0.5), atk([sw([0, 1, 2, 3, 4], 0.16)], 0.8)],
    ],
    // MK2: battle march. Crossing sweeps, marches broken by jumps.
    mk2: [
      [R(MARCH(6), 0.45), atk([v([0, 2, 4]), low([1, 3])], 0.9), atk([sw([0, 1, 2, 3, 4], 0.18), sw([4, 3, 2, 1, 0], 0.18)], 1.0)],
      [R(['x.x.x', '.x.x.', 'LLLLL', 'x.x.x', '.x.x.', 'LLLLL'], 0.42), atk([v([0, 1, 3, 4], 4), low([2])], 0.8), R(MARCH(8), 0.38)],
      [R(['x.x.x', 'LxLxL', '.x.x.', 'xLxLx', 'x.x.x'], 0.5), atk([sw([0, 1, 2, 3, 4], 0.14)], 0.7), R(chase(10), 0.36)],
    ],
  },
  {
    // Swarm: stings down the edges, a wandering hole through spore walls inside.
    id: 'hive', name: 'HIVE', color: PAL.acid,
    hit: [{ x: -62, y: 0, r: 23 }, { x: 0, y: 0, r: 27 }, { x: 62, y: 0, r: 23 }],
    phases: [
      // Stings hit the outer lanes, so corridors stay in lanes 1-3.
      [atk([v([0, 4])], 0.6, 1.0), R(corridor(bounce(1, 1, 6, 1, 3)), 0.55), atk([v([1, 3]), low([2])]), atk([sw([1, 2, 3], 0.25)], 0.9)],
      [atk([v([0, 4])], 0.6, 1.0), R(corridor(bounce(2, 1, 8, 1, 3)), 0.5), atk([v([2]), low([0, 1, 3, 4])], 0.9), atk([sw([1, 2, 3])])],
      [atk([v([0, 4])], 0.6, 0.8), R(corridor(bounce(1, 1, 11, 1, 3)), 0.4, 0.8, 0.5), atk([low(ALL)], 0.9),
        atk([v([1, 3], 4)], 0.7), atk([sw([3, 2, 1], 0.18)], 0.9)],
    ],
    // MK2: plague swarm. Longer wandering corridors, a low wave down the middle.
    mk2: [
      [atk([v([0, 4])], 0.6, 0.8), R(corridor(bounce(2, 1, 10, 1, 3)), 0.4), atk([v([1, 3], 4), low([2])], 0.8)],
      [atk([v([0, 4])], 0.6, 0.6), R(corridor(bounce(1, 1, 12, 1, 3)), 0.36), atk([low(ALL)], 0.8), atk([sw([1, 2, 3], 0.15), sw([3, 2, 1], 0.15)], 0.9)],
      [atk([v([0, 4])], 0.5, 0.5), R(corridor(bounce(2, -1, 14, 1, 3)), 0.34), atk([beam([2], 0.6), low([1, 3])], 0.9)],
    ],
  },
  {
    // Chase: locks onto your lane when the telegraph starts. Its corridors begin
    // under you and run, so you must keep moving with it.
    id: 'hunter', name: 'HUNTER', color: PAL.red,
    hit: [{ x: 0, y: -2, hw: 40, hh: 22 }, { x: -65, y: 2, hw: 9, hh: 18 }, { x: 65, y: 2, hw: 9, hh: 18 }],
    phases: [
      [atk([v(at([0]), 4)], 0.8), R(chase(5), 0.55), atk([v(at([-1, 1]), 3)], 0.8)],
      [atk([v(at([0]), 4)], 0.7), R(chase(8), 0.45), atk([low(at([-1, 0, 1]))], 0.8), atk([v(at([-2, 0, 2]), 3)], 0.7)],
      [R(chase(10), 0.38, 0.7, 0.4), atk([beam(at([0]), 0.6), low(except([0]))], 0.9), atk([v(at([-1, 0, 1]), 3)], 0.6),
        R(chase(10), 0.36, 0.7, 0.4), atk([sw([0, 1, 2, 3, 4], 0.16)], 0.8)],
    ],
    // MK2: pack hunter. Long chases, locked beams between them.
    mk2: [
      [R(chase(8), 0.45), atk([v(at([0]), 5)], 0.7), atk([low(at([-1, 0, 1])), v(at([-2, 2]), 3)], 0.8)],
      [R(chase(12), 0.38), atk([beam(at([0]), 0.5)], 0.6), R(chase(10), 0.36)],
      [atk([beam(at([0]), 0.6), low(except([0]))], 0.8), R(chase(14), 0.34), atk([v(at([-1, 1]), 4), v(at([0]), 2)], 0.6)],
    ],
  },
  {
    // Staircase: beams plus zigzag holes that climb across the whole track.
    id: 'prism', name: 'PRISM', color: '#ff9cf0',
    hit: [{ x: 0, y: -2, hw: 22, hh: 22 }],
    phases: [
      [atk([beamSweep([0, 1, 2, 3])], 1.0), R(corridor([0, 1, 2, 3, 4]), 0.55), atk([beam([0, 2, 4], 0.5)], 0.9), atk([beamSweep([4, 3, 2, 1])], 1.0)],
      [atk([beam([0, 2, 4], 0.45)], 0.8, 0.4), R(corridor(bounce(0, 1, 9)), 0.42), atk([beam([1, 3], 0.45)], 0.7, 0.6),
        atk([low(ALL)], 0.9), atk([beamSweep([1, 2, 3, 4], 0.26)], 0.9)],
      [atk([beamSweep([0, 1, 2, 3], 0.24)], 0.9, 0.4), R(corridor(bounce(4, -1, 13)), 0.34, 0.8, 0.4),
        atk([beamSweep([4, 3, 2, 1], 0.24)], 0.8), atk([beam([1, 3], 0.5), low([0, 2, 4])], 1.0)],
    ],
    // MK2: kaleidoscope. Fast staircases between alternating beams.
    mk2: [
      [R(corridor(bounce(0, 1, 12)), 0.38), atk([beam([0, 2, 4], 0.5)], 0.8, 0.4), atk([beam([1, 3], 0.5)], 0.6, 0.4)],
      [atk([beamSweep([0, 1, 2, 3], 0.2)], 0.8, 0.3), R(corridor(bounce(4, -1, 14)), 0.32), atk([beam([1, 3], 0.5), low([0, 2, 4])], 0.9)],
      [R(corridor(bounce(2, 1, 16)), 0.3), atk([beamSweep([4, 3, 2, 1], 0.18)], 0.7), atk([beam([0, 2, 4], 0.45), low([1, 3])], 0.8)],
    ],
  },
  {
    // Drums: low waves on the beat. Jump in time, shift lanes in the air.
    id: 'warden', name: 'WARDEN', color: PAL.orange,
    hit: [{ x: 0, y: 0, hw: 88, hh: 24 }],
    phases: [
      [atk([beam([0, 1]), low([3, 4])], 1.0), R(['LLLLL', 'LxLxL', 'LLLLL', 'xLxLx'], 0.7), atk([beam([3, 4]), low([0, 1])], 1.0)],
      [atk([beam([2]), low([0, 1, 3, 4])], 1.0), R(['LxLxL', 'LLLLL', 'xLxLx', 'LLLLL', 'LxLxL'], 0.6),
        atk([beam([0, 4]), v([2])], 0.9), atk([beam([1, 3])], 0.9)],
      [atk([beam([0, 2, 4])], 0.9, 0.5), R(['LxLxL', 'xLxLx', 'LxLxL', 'xLxLx', 'LLLLL', 'x.x.x', 'LLLLL', '.x.x.'], 0.56, 0.8, 0.5),
        atk([low(ALL), beam([2], 0.5)], 1.0), atk([sw([0, 1, 2, 3, 4], 0.16)], 0.8)],
    ],
    // MK2: war drums. Jumps and lane changes back to back.
    mk2: [
      [R(['LLLLL', 'x.x.x', 'LLLLL', '.x.x.', 'LLLLL'], 0.6), atk([beam([0, 1]), beam([3, 4], 0.5)], 1.0)],
      [R(['LxLxL', 'xLxLx', 'LxLxL', 'xLxLx', 'LLLLL', 'x.x.x'], 0.5), atk([beam([2]), low([0, 1, 3, 4])], 0.9), atk([beam([0, 4]), v([1, 3])], 0.9)],
      [R(['LxLxL', 'xLxLx', 'LLLLL', 'x.x.x', 'LLLLL', '.x.x.', 'LxLxL'], 0.45), atk([low(ALL), beam([1, 3], 0.5)], 1.0), atk([sw([0, 1, 2, 3, 4], 0.14)], 0.7)],
    ],
  },
  // ---- second circle (districts 6-10): new Brood bosses -------------------
  {
    // Inhales, then spits: fans from the mouth outward, low waves on a beat.
    id: 'maw', name: 'MAW', color: '#ff7aa8',
    hit: [{ x: 0, y: 0, hw: 72, hh: 40 }],
    phases: [
      [atk(FAN_OUT(0.25), 1.1), R(['LLLLL', 'LLLLL', 'LLLLL'], 0.7), atk([v([1, 3], 3)], 0.8)],
      [atk(FAN_IN(0.2), 0.9), R(['LxLxL', 'LLLLL', 'xLxLx'], 0.6), atk([v([0, 2, 4], 3), low([1, 3])], 0.9)],
      [atk(FAN_OUT(0.16), 0.8, 0.4), atk(FAN_IN(0.16), 0.8, 0.4), R(['LxLxL', 'xLxLx', 'LLLLL', 'LxLxL'], 0.5)],
    ],
    mk2: [
      [R(MARCH(6), 0.42), atk(FAN_OUT(0.2), 0.9), R(['LLLLL', 'x.x.x', 'LLLLL', '.x.x.'], 0.55)],
      [atk([...FAN_IN(0.18), low([0, 4])], 0.9), R(['xLxLx', 'LxLxL', 'xLxLx', 'LLLLL'], 0.45), atk(FAN_OUT(0.14), 0.7)],
      [atk(FAN_OUT(0.14), 0.7, 0.3), R(chase(10), 0.36), atk([...FAN_IN(0.14), low([2])], 0.7)],
    ],
  },
  {
    // Sings in canon: beams alternate between the even and the odd lanes.
    id: 'choir', name: 'CHOIR', color: '#ffb000',
    hit: [{ x: 0, y: -12, hw: 26, hh: 24 }, { x: -58, y: -2, r: 22 }, { x: 58, y: -2, r: 22 }, { x: -92, y: 16, r: 18 }, { x: 92, y: 16, r: 18 }],
    phases: [
      [atk([beam([0, 2, 4], 0.5)], 0.9), atk([beam([1, 3], 0.5)], 0.8), R(MARCH(4), 0.55)],
      [atk([beamSweep([0, 2, 4], 0.3, 0.3)], 0.9), atk([beam([1, 3], 0.5), low([0, 2, 4])], 0.8),
        atk([beamSweep([4, 2, 0], 0.3, 0.3)], 0.9), R(MARCH(6), 0.45)],
      [R(MARCH(6), 0.38), atk([beam([1, 3], 0.45), low([0, 2, 4])], 0.9), atk([beamSweep([0, 1, 2, 3], 0.2)], 0.8)],
    ],
    mk2: [
      [atk([beam([0, 2, 4], 0.4)], 0.7, 0.3), atk([beam([1, 3], 0.4)], 0.6, 0.3), R(MARCH(8), 0.36)],
      [atk([beamSweep([0, 1, 2, 3], 0.18)], 0.7), atk([beamSweep([4, 3, 2, 1], 0.18)], 0.7), atk([beam([0, 4], 0.5), low([1, 2, 3])], 0.8)],
      [R(corridor(bounce(0, 1, 12)), 0.32), atk([beam([1, 3], 0.4), low([0, 2, 4])], 0.7), R(MARCH(8), 0.32)],
    ],
  },
  {
    // The brood queen: rows of eggs to jump, spit between them.
    id: 'mother', name: 'MOTHER', color: '#ffd23f',
    hit: [{ x: 0, y: 0, hw: 44, hh: 38 }],
    phases: [
      [atk([v([0, 4])], 0.6, 1.0), R(['LLLLL', 'xLxLx', 'LLLLL', 'LxLxL'], 0.65), atk([v([1, 3], 3), low([2])], 0.8)],
      [atk([v([1, 3])], 0.6, 0.9), R(['LxLxL', 'LLLLL', 'xLxLx', 'LLLLL'], 0.6), atk([low([0, 2, 4]), v([1, 3], 3)], 0.8)],
      [atk([v([0, 2, 4])], 0.5, 0.8), R(['LLLLL', 'LxLxL', 'LLLLL', 'xLxLx', 'LLLLL'], 0.6), atk([low(ALL)], 0.8),
        atk([v([0, 4], 3), low([1, 2, 3])], 0.8)],
    ],
    mk2: [
      [atk([v([0, 2, 4])], 0.5, 0.8), R(['LLLLL', 'LxLxL', 'LLLLL', 'xLxLx'], 0.55), atk([v([1, 3], 4)], 0.7)],
      [atk([v([1, 3])], 0.5, 0.6), R(corridor(bounce(2, 1, 8, 1, 3)), 0.4), atk([low(ALL)], 0.7), R(['LLLLL', 'LLLLL', 'LLLLL'], 0.55)],
      [atk([v([0, 2, 4])], 0.4, 0.6), R(['LxLxL', 'LLLLL', 'xLxLx', 'LLLLL', 'LxLxL'], 0.45), atk([low([1, 3]), v([2], 3)], 0.7)],
    ],
  },
  {
    // A centipede across the track: its body comes down as rows of barriers
    // with gaps between the segments.
    id: 'spine', name: 'SPINE', color: '#e8d6a8',
    hit: [{ x: -92, y: 16, r: 18 }, { x: -50, y: 0, r: 19 }, { x: 0, y: -8, r: 20 }, { x: 50, y: 0, r: 19 }, { x: 92, y: 16, r: 18 }],
    phases: [
      [O(['BB.BB', 'B.BBB', 'BB.BB'], 0.6), atk([v([0, 4], 3)], 0.8), O(['BBB.B', 'BB.BB', 'B.BBB', '.BBBB'], 0.55)],
      [O(['B.BBB', 'BTBBB', 'B.BBB', 'BB.BB'], 0.6), atk([sw([0, 1, 2, 3, 4], 0.2)], 0.9), O(['.BBBB', 'B.BBB', 'BB.BB', 'BBB.B', 'BBBB.'], 0.5)],
      [O(['BB.BB', 'BT.TB', 'B.B.B', '.B.B.', 'B.B.B'], 0.45), atk([v([1, 3], 4)], 0.7), O(['B.BBB', '.BBBB', 'B.BBB', 'BB.BB', 'BBB.B'], 0.42)],
    ],
    mk2: [
      [O(['BB.BB', 'B.BBB', '.BBBB', 'B.BBB', 'BB.BB', 'BBB.B'], 0.45), atk([v([0, 4], 4)], 0.7)],
      [O(['B.B.B', '.B.B.', 'B.B.B', '.B.B.', 'BB.BB'], 0.42), atk([sw([0, 1, 2, 3, 4], 0.16), low([2])], 0.8)],
      [O(['BB.BB', 'BT.TB', '.BBBB', 'B.BBB', 'BB.BB', 'BBB.B', 'BBBB.'], 0.38), atk([v([1, 3], 4)], 0.6)],
    ],
  },
  {
    // The void eye: veils and tears to phase through, volleys between them.
    // Phase obstacles are kept >= 2.3 s apart across attacks (see fireEvent).
    id: 'eclipse', name: 'ECLIPSE', color: '#a64dff',
    hit: [{ x: 0, y: 0, r: 46 }],
    phases: [
      [O(['PPPPP'], 0.8), atk([v([0, 2, 4], 3)], 0.9), atk([v([1, 3], 3)], 0.8)],
      [O(['BBPBB'], 0.8), atk([beam([0, 1]), beam([3, 4], 0.5)], 0.9), O(['PPPPP'], 0.8), atk([sw([4, 3, 2, 1, 0], 0.18)], 0.8)],
      [O(['PPPPP'], 0.7), atk([beam([1, 3], 0.5), low([0, 2, 4])], 0.9), O(['BPBBB'], 0.7), atk([sw([0, 1, 2, 3, 4], 0.15)], 0.7)],
    ],
    mk2: [
      [O(['PPPPP'], 0.7), R(MARCH(6), 0.4), O(['BBPBB'], 0.7), atk([v([0, 4], 4)], 0.7)],
      [O(['BPBBB'], 0.6), atk([beam([2, 3, 4], 0.5)], 0.7), O(['PPPPP'], 0.6), R(chase(8), 0.38)],
      [O(['PPPPP'], 0.6), atk([sw([4, 3, 2, 1, 0], 0.13), low([2])], 0.7), O(['BBBPB'], 0.6), R(MARCH(8), 0.34)],
    ],
  },
];

// index: how many bosses this run has beaten; defIndex: which boss (run order).
export function makeBoss(index, defIndex, power = 1) {
  const def = BOSSES[defIndex % BOSSES.length];
  const loop = Math.floor(index / BOSSES.length);   // elite loops
  const hp = bossHp(index, power);
  const b = {
    id: newId(),
    type: 'boss',
    def,
    name: loop > 0 ? `${def.name} MK${loop + 1}` : def.name,
    loop,
    color: def.color,
    T: { color: def.color },
    x: W / 2, y: -90, prevX: W / 2, prevY: -90,
    hw: LANE_W * 1.6, hh: 26, r: 40,
    hitboxes: def.hit,   // collision follows the art, not a lane-wide box
    hp, maxHp: hp,
    phase: 0,
    atkIndex: 0,
    state: 'enter',
    stateT: 0,
    speed: bossSpeed(index),
    playerLane: 2,
    events: [],       // scheduled fire events for the current attack
    teleParts: [],
    t: 0,
    poison: 0, poisonT: 0, poisonTick: 0,
    dead: false,
    hitFlash: 0,
    phaseFlash: 0,
  };
  enemies.push(b);
  return b;
}

function currentAttack(b) {
  // Phase 3 is the MK2+ frenzy: phase 2's attacks with volleys layered on top.
  // Second loop and later: the MK2 patterns (rewritten, not just faster).
  const phases = b.loop >= 1 && b.def.mk2 ? b.def.mk2 : b.def.phases;
  let list = phases[Math.min(2, b.phase)];
  return list[b.atkIndex % list.length];
}

// Aim: an attack written on fixed lanes is placed on you when its telegraph
// starts, as one block: mirrored and/or slid sideways until it hits the lane
// you are in (its first row, for rhythm rows). Whatever a slide pushes off the
// track is dropped, so a placed attack is the authored one or an easier copy,
// never a harder one. Obstacle rows are only mirrored (a veil must stay whole).
// Attacks already aimed (target lock: HUNTER, chases) are left alone, and the
// placement keeps as many lanes free beside other enemies as the authored
// attack would.
const placeLane = (l, mirror, k) => (mirror ? LANES - 1 - l : l) + k;
function placeRow(r, mirror, k) {
  const out = Array(LANES).fill('.');
  [...r].forEach((c, l) => { const t = placeLane(l, mirror, k); if (t >= 0 && t < LANES) out[t] = c; });
  return out.join('');
}
function placeParts(parts, mirror, k) {
  return parts.map((p) => {
    const q = { ...p, lanes: p.lanes.map((l) => placeLane(l, mirror, k)).filter((l) => l >= 0 && l < LANES) };
    if (p.rows) q.rows = p.rows.map((r) => placeRow(r, mirror, k));
    return q;
  });
}
const partCells = (ps) => ps.reduce((n, p) => n + p.lanes.length + (p.rows ? p.rows.join('').replace(/\./g, '').length : 0), 0);
function aimParts(b, a, parts) {
  if (a.parts.some((p) => typeof p.lanes === 'function' || typeof p.rows === 'function')) return parts;
  const pl = b.playerLane;
  // Rhythm rows hit you if any row reaches your lane; a placement may not add
  // a lane that every row leaves free (a place to wait the attack out).
  const rowsOf = (ps) => ps.filter((p) => p.kind === 'rows').flatMap((p) => p.rows);
  const quiet = (ps) => { const rs = rowsOf(ps); return rs.length ? ALL.filter((l) => rs.every((r) => r[l] === '.')).length : 0; };
  const hits = (ps) => (rowsOf(ps).length
    ? rowsOf(ps).some((r) => r[pl] !== '.')
    : ps.some((p) => p.lanes.includes(pl)));
  if (hits(parts)) return parts;
  const busy = new Set();
  for (const e of others()) for (const l of addLanes(e)) if (l >= 0 && l < LANES) busy.add(l);
  const freeWith = (ps) => {
    const U = new Set(busy);
    for (const p of ps) if (!['low', 'obs', 'rows'].includes(p.kind) && !p.tele) for (const l of p.lanes) U.add(l);
    return LANES - U.size;
  };
  const need = Math.min(2, freeWith(parts));
  const slide = !parts.some((p) => p.kind === 'obs');
  const cells = partCells(parts);
  let best = null, bestScore = Infinity;
  for (const mirror of [false, true]) {
    for (let k = slide ? -(LANES - 1) : 0; k <= (slide ? LANES - 1 : 0); k++) {
      if (!mirror && k === 0) continue;
      const ps = placeParts(parts, mirror, k);
      if (!hits(ps) || freeWith(ps) < need || quiet(ps) > quiet(parts)) continue;
      // fewest cells dropped, then the smallest move
      const score = (cells - partCells(ps)) * 10 + Math.abs(k) + (mirror ? 0.5 : 0);
      if (score < bestScore) { best = ps; bestScore = score; }
    }
  }
  return best || parts;
}

function resolveParts(b, a) {
  const out = aimParts(b, a, a.parts.flatMap((p) => {
    // Obstacle rows: the telegraph lights the barrier lanes of the first row.
    if (p.kind === 'obs') {
      const first = p.rows[0];
      return [{ ...p, lanes: [...first].flatMap((c, l) => (c === 'B' ? [l] : [])) }];
    }
    if (p.kind !== 'rows') {
      const r = { ...p, lanes: typeof p.lanes === 'function' ? p.lanes(b.playerLane) : p.lanes };
      // layer: one more shot per volley every two layers
      if (p.kind === 'volley') r.shots = p.shots + Math.min(3, Math.floor(b.layer / 2));
      return [r];
    }
    let rs = typeof p.rows === 'function' ? p.rows(b.playerLane) : p.rows;
    // MK3+ and every two layers: two more rows, repeating the last two (same
    // transitions, still fair).
    const pairs = (b.loop >= 2 ? 1 : 0) + Math.min(3, Math.floor(b.layer / 2));
    for (let k = 0; k < pairs && rs.length >= 2; k++) rs = [...rs, rs[rs.length - 2], rs[rs.length - 1]];
    // Telegraph shows the first row: shots in the boss colour, lows in orange.
    const first = [...rs[0]];
    const shots = first.flatMap((c, l) => (c === 'x' ? [l] : []));
    const lows = first.flatMap((c, l) => (c === 'L' ? [l] : []));
    const out = [{ ...p, rows: rs, lanes: shots }];
    if (lows.length) out.push({ kind: 'low', lanes: lows, tele: true });
    return out;
  }));
  // Layer 2+: a volley or beam attack also sends low waves down the lanes it
  // leaves free: you jump inside the gap instead of resting in it.
  if (b.layer >= 2 && out.every((p) => p.kind === 'volley' || p.kind === 'beam')) {
    const hit = new Set(out.flatMap((p) => p.lanes));
    const free = ALL.filter((l) => !hit.has(l));
    if (free.length) out.push({ kind: 'low', lanes: free });
  }
  return out;
}

const ROW_SHOT = { kind: 'rowshot' }, ROW_LOW = { kind: 'rowlow' }, OBS_ROW = { kind: 'obsrow' };

// Boss rhythm lives on the game's tick grid too: an interval written in
// seconds (at base tempo) becomes a whole number of ticks, shortened by the
// boss speed, then converted back to seconds at the current tempo.
const tickNow = () => TICK_SEC / timeMul(bossD);
let bossD = 0;
const JUMP_GAP = 0.65;   // s between two jumpable rows: one jump + reaction
function onTicks(sec, b, min = 1) {
  const ticks = Math.max(min, Math.round(sec / b.speed / TICK_SEC));
  return ticks * tickNow();
}

function buildEvents(b, parts) {
  const ev = [];
  for (const p of parts) {
    if (p.kind === 'volley') for (let i = 0; i < p.shots; i++) ev.push({ t: i * 0.14, part: p, lanes: p.lanes });
    else if (p.kind === 'sweep') p.lanes.forEach((l, i) => { const t = i * sweepGap(p.gap, b); ev.push({ t, part: p, lanes: [l] }); ev.push({ t: t + 0.07, part: p, lanes: [l] }); });
    else if (p.kind === 'low' && !p.tele) ev.push({ t: 0, part: p, lanes: p.lanes });
    else if (p.kind === 'beam') for (let t = 0; t < p.dur; t += 0.045) ev.push({ t, part: p, lanes: p.lanes });
    else if (p.kind === 'beamsweep') p.lanes.forEach((l, i) => { for (let t = 0; t < p.dur; t += 0.045) ev.push({ t: i * sweepGap(p.gap, b) + t, part: p, lanes: [l] }); });
    else if (p.kind === 'obs') {
      // Obstacles scroll at the (slowed) boss track speed, ~250-290 px/s, so rows
      // must be spaced in TIME, not beats: a barrier fills ~42 px of track and
      // a lane change needs room. 0.65 s between rows (~120 px), on the tick
      // grid; that also covers a whole jump for wires.
      const beat = Math.max(onTicks(p.beat, b, 2), Math.ceil(OBS_GAP / tickNow()) * tickNow());
      p.rows.forEach((r, i) => ev.push({ t: i * beat, part: OBS_ROW, lanes: [], row: r }));
    }
    else if (p.kind === 'rows') {
      // A row needs at least a beat to answer; rows with low waves need a whole
      // jump (0.45 s) plus a margin, or two in a row cannot both be cleared.
      const hasLow = p.rows.some((r) => r.includes('L'));
      const beat = Math.max(onTicks(p.beat, b, 2), hasLow ? Math.ceil(JUMP_GAP / tickNow()) * tickNow() : 0);
      p.rows.forEach((r, i) => {
        const shots = [], lows = [];
        [...r].forEach((c, l) => { if (c === 'x') shots.push(l); else if (c === 'L') lows.push(l); });
        if (shots.length) ev.push({ t: i * beat, part: ROW_SHOT, lanes: shots });
        if (lows.length) ev.push({ t: i * beat, part: ROW_LOW, lanes: lows });
      });
    }
  }
  ev.sort((x, y) => x.t - y.t);
  return ev;
}

// The warning: TELE_TICKS at the current tempo, as for every enemy.
const teleTime = () => (TELE_TICKS + teleBonusNow()) * tickNow();

const PHASE_GAP = 2.3;   // s between two phase obstacles (phase cooldown 2 s)
const OBS_GAP = 0.65;    // s between two obstacle rows fired by a boss
// A sweep is dodged by stepping into the lane it has just hit: consecutive
// lanes must be at least a hop (0.11 s) plus reaction apart, at any tempo.
const SWEEP_MIN = 0.3;
const sweepGap = (sec, b) => Math.max(onTicks(sec, b), Math.ceil(SWEEP_MIN / tickNow()) * tickNow());
function fireEvent(b, e, difficulty) {
  const p = e.part;
  const y = b.y + b.hh;
  if (p.kind === 'obsrow') {
    const phase = e.row.includes('P');
    // a phase obstacle too close to the previous one waits (never unfair)
    if (phase && b.t - (b.lastPhaseAt ?? -99) < PHASE_GAP) {
      b.events.push({ ...e, t: b.stateT + PHASE_GAP - (b.t - b.lastPhaseAt) });
      b.events.sort((x, z) => x.t - z.t);
      return;
    }
    if (phase) b.lastPhaseAt = b.t;
    if (e.row === 'PPPPP') { spawnVeil(y); return; }
    [...e.row].forEach((c, l) => {
      if (c === 'B') spawnObstacle('wall', l, y);
      else if (c === 'T') spawnObstacle('low', l, y);
      else if (c === 'P') spawnObstacle('rift', l, y);
    });
    return;
  }
  for (const l of e.lanes) {
    const x = laneX(l);
    // Row parts share one speed so their spacing on screen is the beat itself.
    // Every shot (rows, volleys, sweeps, low waves) travels like a mob's in this
    // district: same speed, so the boss is never slower than the stretch before.
    if (p.kind === 'rowlow' || p.kind === 'low') spawn(enemyBullets, x, y, 0, shotSpeed(y, bossD), 10, 1, LOW);
    else if (p.kind === 'beam' || p.kind === 'beamsweep') spawn(enemyBullets, x, y, 0, Math.max(460, shotSpeed(y, bossD)), 5, 1, 0);
    else spawn(enemyBullets, x, y, 0, shotSpeed(y, bossD), 5, 1, 0);
  }
}

// Other enemies still on the boss's screen (bosses summon none; this guards
// against anything left over).
const others = () => enemies.filter((e) => e.type !== 'boss' && !e.dead && e.state !== 'leave');
const addLanes = (e) => (e.type === 'stalker' || e.type === 'hopper' ? [e.lane - 1, e.lane, e.lane + 1] : [e.lane]);
// Lanes an attack hits with shots that cannot be jumped.
function highLanes(b, a) {
  const out = new Set();
  for (const p of a.parts) {
    if (p.kind === 'low' || p.kind === 'obs' || p.kind === 'rows') continue;
    for (const l of typeof p.lanes === 'function' ? p.lanes(b.playerLane) : p.lanes) out.add(l);
  }
  return out;
}
const isRowAttack = (a) => a.parts.some((p) => p.kind === 'rows' || p.kind === 'obs');
// An attack waits for the others on screen when they would close it:
// - a row attack (rhythm or obstacle rows) until other enemies,
//   frenzy and flank volleys have fired: their shots could sit in the
//   lane the rows leave free. Fired before the telegraph, they land before the
//   first row;
// - any other attack while, together with them, it would leave fewer than two
//   free lanes (or fewer than it leaves alone).
function attackMustWait(b, a) {
  const rest = others();
  if (isRowAttack(a)) return !!b.frenzyShot || !!(b.frenzyQueue && b.frenzyQueue.length) || rest.length > 0;
  if (!rest.length) return false;
  const A = highLanes(b, a), U = new Set(A);
  for (const e of rest) for (const l of addLanes(e)) if (l >= 0 && l < LANES) U.add(l);
  return LANES - U.size < Math.min(2, LANES - A.size);
}
// Returns true while the boss is alive and fighting.
export function updateBoss(b, dt, difficulty, playerLane = 2) {
  bossD = difficulty;
  if (b.layer === undefined) b.layer = bossLayer(difficulty);
  b.playerLane = playerLane;
  b.prevX = b.x; b.prevY = b.y;
  b.t += dt;
  b.stateT += dt;
  if (b.hitFlash > 0) b.hitFlash -= dt;
  if (b.phaseFlash > 0) b.phaseFlash -= dt;
  b.x = W / 2 + Math.sin(b.t * 0.8) * 4;

  // Phase change by HP
  const want = b.loop >= 1 && b.hp < b.maxHp * 0.15 ? 3 : b.hp < b.maxHp / 3 ? 2 : b.hp < (b.maxHp * 2) / 3 ? 1 : 0;
  if (want > b.phase && b.state !== 'enter') {
    b.phase = want;
    b.atkIndex = 0;
    b.state = 'rest';
    b.stateT = -0.6;        // short breather on phase change
    b.events = [];
    b.teleParts = [];
    b.phaseFlash = 0.6;
    shake(6, 0.3);
    burst(b.x, b.y, b.color, 30, 260, 0.7, 3);
    sfx.bossWarn();
  }

  // SIEGE: a charged rail makes the boss reel (its schedule pauses)
  if (b.stunT > 0) { b.stunT -= dt; b.stateT -= dt; }
  if ((b.phase === 3 || b.flank) && b.state !== 'enter') frenzy(b, difficulty);

  const a = currentAttack(b);
  const m = b.speed;
  switch (b.state) {
    case 'enter':
      b.y += 90 * dt;
      if (b.y >= holdY()) { b.y = holdY(); b.state = 'rest'; b.stateT = 0.3; }
      break;
    case 'rest':
      if (b.stateT >= a.rest / m / (1 + 0.1 * b.layer) && !attackMustWait(b, a)) {
        b.state = 'telegraph';
        b.stateT = 0;
        b.teleParts = resolveParts(b, a);   // target lock happens here
        sfx.telegraph();
      }
      break;
    case 'telegraph':
      // Armed: the attack starts on the next tick of the shared metronome.
      if (b.stateT >= teleTime() && beatClock() >= Math.ceil(b.armAt ?? (b.armAt = beatClock()))) {
        b.state = 'fire';
        b.stateT = 0;
        b.armAt = undefined;
        b.events = buildEvents(b, b.teleParts);
      }
      break;
    case 'fire':
      while (b.events.length && b.events[0].t <= b.stateT) fireEvent(b, b.events.shift(), difficulty);
      if (!b.events.length) {
        b.state = 'rest';
        b.stateT = 0;
        b.teleParts = [];
        b.atkIndex++;
      }
      break;
  }
  return !b.dead;
}

// Frenzy (MK2+, under 15% HP) and flank volleys (district 4+): a 3-shot
// volley is layered on one lane that nothing else threatens, with the same 4-tick warning as any
// enemy. Only when at least 3 lanes are free, so 2 always stay open.
function frenzy(b, difficulty) {
  const now = beatClock();
  // queued shots of a volley already fired
  if (b.frenzyQueue && b.frenzyQueue.length && b.t >= b.frenzyQueue[0].t) {
    fireEvent(b, b.frenzyQueue.shift(), difficulty);
  }
  if (b.frenzyShot) {
    if (now >= b.frenzyShot.at) {
      const l = b.frenzyShot.lane;
      b.frenzyQueue = [0, 1, 2].map((k) => ({ t: b.t + k * 0.12, part: { kind: 'volley' }, lanes: [l] }));
      b.frenzyShot = null;
    }
    return;
  }
  if (now < (b.frenzyNext ?? 0)) return;
  // Never over a rhythm-row or obstacle-row attack: its free lane moves every
  // beat and a volley could land right in it.
  if (currentAttack(b).parts.some((p) => p.kind === 'rows' || p.kind === 'obs')) return;
  // Flank volleys (district 4+, where mobs used to join the fight) come every
  // 6-8 beats, sooner as the boss layer grows; the frenzy every 4.
  b.frenzyNext = Math.ceil(now) + (b.phase === 3 ? 8 : Math.max(12, 16 - 2 * (b.layer ?? 0)));
  const busy = new Set();
  const eb = enemyBullets;
  for (let i = 0; i < eb.n; i++) if (eb.kind[i] !== LOW && eb.y[i] < PLAYER_ROW) busy.add(Math.round((eb.x[i] - laneX(0)) / LANE_W));
  for (const p of b.teleParts) for (const l of p.lanes || []) busy.add(l);
  // nor while barriers are on their way: the volley could fill their gap
  if (obstacles.some((o) => !o.dead && o.y < PLAYER_ROW)) return;
  const free = [0, 1, 2, 3, 4].filter((l) => !busy.has(l));
  if (free.length < 3) return;
  // Into your lane when it is one of the free ones, else the free lane
  // nearest to you: the gap the attack leaves is no place to rest.
  const lane = free.sort((x, y) => Math.abs(x - b.playerLane) - Math.abs(y - b.playerLane))[0];
  b.frenzyShot = { lane, at: Math.ceil(now) + 4 };
}

export function drawBossTelegraph(b) {
  if (b && b.frenzyShot) glowLane(b.frenzyShot.lane, b.color, 0.9);
  if (!b || !b.teleParts.length) return;
  const prog = b.state === 'telegraph' ? Math.min(1, b.stateT / teleTime()) : 1;
  for (const p of b.teleParts) {
    const c = p.kind === 'low' ? PAL.orange : p.kind === 'obs' ? PAL.magenta : b.color;
    if (!p.lanes.length) continue;
    // Rhythm rows: once firing, the bullets themselves are the read; drop the glow.
    if (b.state === 'fire' && (p.kind === 'rows' || p.tele)) continue;
    for (const l of p.lanes) {
      const x = laneX(l);
      glowLane(l, c, (0.25 + prog * 0.75) * (p.kind === 'beam' ? 1.3 : 1));
      const cy = H - 22;
      if (p.kind === 'low') strokePoly([x - 8, cy + 4, x, cy - 6, x + 8, cy + 4], c, 2.5, false);
      else strokePoly([x - 8, cy - 5, x, cy + 4, x + 8, cy - 5], c, 2.5, false);
    }
    if (p.kind === 'sweep' || p.kind === 'beamsweep') {
      const y = b.y + 44;
      const x0 = laneX(p.lanes[0]), x1 = laneX(p.lanes[p.lanes.length - 1]);
      const dir = Math.sign(x1 - x0) || 1;
      line(x0, y, x1, y, c, 2, 0.4 + prog * 0.5);
      strokePoly([x1 - dir * 8, y - 6, x1, y, x1 - dir * 8, y + 6], c, 2, false);
    }
  }
}

export function drawBoss(b, alpha) {
  if (!b || b.dead) return;
  const x = b.prevX + (b.x - b.prevX) * alpha;
  const y = b.prevY + (b.y - b.prevY) * alpha;
  const tele = b.state === 'telegraph' && Math.floor(b.stateT * 14) % 2 === 0;
  const flash = b.hitFlash > 0 ? 0.8 : b.phaseFlash > 0 ? 1 : tele ? 0.5 : 0;
  const hw = b.hw, hh = b.hh;
  const id = b.def.id;
  const t = b.t;

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(x + 6, y + hh + 14, hw * 0.8, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  const art = BOSS_ART[id];
  if (art && art[0].ready) {
    const col = b.state === 'telegraph' ? 2 : b.phase >= 2 ? 3 : Math.floor(t * 2) % 2;
    // MAW inhales while it telegraphs: motes drift into the mouth
    if (id === 'maw' && b.state === 'telegraph' && Math.random() < 0.6) {
      const a = Math.random() * Math.PI * 2;
      burst(x + Math.cos(a) * 110, y + Math.sin(a) * 50, b.color, 1, 0, 0.3, 1.5);
    }
    drawCell(art[0], art[1], col, x, y, 236, { flash: b.hitFlash > 0 ? 0.6 : b.phaseFlash > 0 ? 0.9 : 0 });
    if (id === 'hunter') {   // keep the aim telegraph: it is gameplay information
      const tx = laneX(b.playerLane);
      const aim = b.state === 'telegraph' ? 0.9 : 0.25;
      line(x + 30, y, tx, H - 30, b.color, 1.2, aim * 0.6);
      ring(tx, PLAYER_ROW, 16 + Math.sin(t * 10) * 2, b.color, 1.5, aim);
    }
    if (b.poison > 0) drawGlowDot(x + hw * 0.8, y - hh - 6, PAL.acid, 3);
    return;
  }
  if (!['sentinel', 'hive', 'hunter', 'prism', 'warden'].includes(id)) {
    // art still loading: a glowing core so the fight stays readable
    drawGlowDot(x, y, b.color, 40, 0.6);
    drawGlowDot(x, y, '#ffffff', 8, 0.9);
    return;
  }
  if (id === 'prism') {
    drawSprite(prismEmitterSprite(b.color, hw), x, y + hh * 0.6, { flash });
    drawSprite(bossSprite(id, b.color, hw, hh), x, y - 2, { rot: Math.sin(t * 0.9) * 0.25, flash });
    drawGlowDot(x, y + 2, b.color, 7 + Math.sin(t * 5) * 1.5);
  } else {
    drawSprite(bossSprite(id, b.color, hw, hh), x, y, { flash });
  }

  // Live details
  const eyeCol = b.state === 'telegraph' ? '#ffffff' : '#d9c45a';
  if (id === 'sentinel') {
    drawEye(x, y, 13 + Math.sin(t * 3) * 0.8, eyeCol, look.x, look.y, b.hitFlash > 0 ? 0.5 : 0);
  } else if (id === 'hive') {
    for (const [cx, k] of [[-62, 0], [0, 1], [62, 2]]) {
      drawGlowDot(x + cx, y, b.color, 5 + Math.sin(t * 6 + k * 2) * 2, 0.9);
      drawGlowDot(x + cx + Math.cos(t * 3 + k) * 6, y + Math.sin(t * 3 + k) * 6, PAL.white, 1.6, 0.8);
    }
  } else if (id === 'hunter') {
    const tx = laneX(b.playerLane);
    const aim = b.state === 'telegraph' ? 0.9 : 0.25;
    line(x, y, tx, H - 30, b.color, 1.2, aim * 0.6);
    ring(tx, PLAYER_ROW, 16 + Math.sin(t * 10) * 2, b.color, 1.5, aim);
    drawEye(x, y - 4, 10, eyeCol, tx, PLAYER_ROW, 0);
  } else if (id === 'warden') {
    // beating heart: double pulse
    const beat = Math.max(0, Math.sin(t * 7)) ** 6 + Math.max(0, Math.sin(t * 7 - 0.9)) ** 6 * 0.6;
    drawGlowDot(x, y - 4, PAL.red, 6 + beat * 4);
    drawGlowDot(x, y - 4, '#ffffff', 2 + beat * 1.5, 0.8);
  }
  if (b.poison > 0) drawGlowDot(x + hw * 0.8, y - hh - 6, PAL.acid, 3);
}

export function drawBossBar(b) {
  if (!b || b.dead) return;
  const x = 16, y = 60 + SAFE_TOP, w = W - 32;
  text(b.name, W / 2, y - 6, { color: b.color, size: 10, align: 'center' });
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x, y, w, 5);
  ctx.fillStyle = b.color;
  ctx.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 5);
  for (const f of [1 / 3, 2 / 3]) line(x + w * f, y - 1, x + w * f, y + 6, PAL.bg, 2);
}
