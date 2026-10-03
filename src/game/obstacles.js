// Runner obstacles, placed in lanes and scrolling with the world.
//   low  : tripwire of orange plasma, jump over it (like low waves)
//   wall : magenta field-line barrier, change lane
//   veil : a rift curtain across ALL lanes, cannot be dodged or jumped: PHASE
//          through it (cyan, the phase colour)
//   rift : the same tear, one lane wide. Usually set in the gap of a barrier
//          row, so the only way through is to phase
// A "gate" is a row of walls with one open lane.
import { H } from '../core/canvas.js';
import { drawWire, drawBarrier, drawRift } from '../render/oled.js';
import { LANES, LANE_W, laneX } from './world.js';

const VARIANTS = { low: 3, wall: 3, veil: 1, rift: 1 };

export const obstacles = [];

export function spawnObstacle(type, lane, y = -30) {
  obstacles.push({ type, lane, x: laneX(lane), y, prevY: y, hit: false, passed: false, jumped: false, dead: false, v: Math.floor(Math.random() * VARIANTS[type]), rot: (Math.random() - 0.5) * 0.3 });
}

export function spawnGate(gapLane, y = -30) {
  for (let l = 0; l < LANES; l++) if (l !== gapLane) spawnObstacle('wall', l, y);
}

export function updateObstacles(dt, speed) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    o.prevY = o.y;
    o.y += speed * dt;
    if (o.y > H + 60 || o.dead) { obstacles.splice(i, 1); i--; }
  }
}

export const OB_H = { low: 14, wall: 30, veil: 10, rift: 12 };

export function spawnVeil(y = -30) {
  spawnObstacle('veil', 2, y);
}

// ---------------------------------------------------------------------------
// Drawing: flat OLED shapes, drawn live (render/oled.js). Orange row that
// hops = jump, boiling magenta mass = dodge, cyan membrane the phase pill
// slips through = phase.
// ---------------------------------------------------------------------------
const VEIL_X0 = laneX(0) - LANE_W / 2, VEIL_X1 = laneX(LANES - 1) + LANE_W / 2;
// Same-type obstacles side by side on one row are drawn as one shape.
const MERGE_INSET = 4;   // each shape stops this far inside its outer lanes
export function drawObstacles(alpha, t = 0) {
  const rows = [];
  for (const o of obstacles) {
    if (o.dead) continue;
    const y = o.prevY + (o.y - o.prevY) * alpha;
    if (o.type === 'veil') { drawRift(VEIL_X0 + 6, VEIL_X1 - 6, y, o.phased ? 0.35 : 1, t); continue; }
    rows.push({ type: o.type, lane: o.lane, y, phased: o.phased });
  }
  rows.sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : a.y - b.y || a.lane - b.lane));
  for (let i = 0; i < rows.length;) {
    const r0 = rows[i];
    let j = i + 1;
    while (j < rows.length && rows[j].type === r0.type && Math.abs(rows[j].y - r0.y) < 2 && rows[j].lane === rows[j - 1].lane + 1) j++;
    const last = rows[j - 1];
    const x0 = laneX(r0.lane) - LANE_W / 2 + MERGE_INSET, x1 = laneX(last.lane) + LANE_W / 2 - MERGE_INSET;
    if (r0.type === 'low') drawWire(x0, x1, r0.y, t);
    else if (r0.type === 'rift') drawRift(x0, x1, r0.y, r0.phased ? 0.35 : 1, t);
    else drawBarrier(x0, x1, r0.y, t);
    i = j;
  }
}

export function clearObstacles() { obstacles.length = 0; }

// Nothing to pre-render any more: the shapes are drawn live.
export function warmObstacleArt() {}
