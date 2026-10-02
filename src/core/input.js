// Unifies touch, mouse and keyboard into one-shot intents:
//   left, right : change lane
//   jump        : swipe up / Space
//   phase       : swipe down / Shift
//   tap         : pointer down+up without movement, or Enter
//   pause       : Esc / P / window blur
import { canvas, toLogical } from './canvas.js';

const SWIPE_MIN = 14;      // logical px: a swipe fires as soon as the finger has clearly moved
const SWIPE_MAX_MS = 320;
let tapSlop = 8;           // max movement for a tap; screens with choices raise it
// In play a tap fires EARLY: once the finger has rested EARLY_MS without
// moving, instead of waiting for it to lift (that wait was the whole tap
// latency, 80-120 ms on a phone). Menus and choice screens keep tap-on-release.
const EARLY_MS = 45;
const EARLY_SLOP = 5;
let earlyTaps = true;
let tapped = false;          // this gesture already fired its early tap
let tapT = 0;
// A finger that rests EARLY_MS and THEN swipes up or down fired an early tap
// (a lane change) it never meant: a vertical swipe this soon after it takes
// the lane change back.
const UNTAP_MS = 150;
let lastX = 0, lastY = 0;
let earlyTimer = 0;
export function setEarlyTap(on) { earlyTaps = on; }

const state = { untap: false, left: false, right: false, jump: false, phase: false, tap: false, tapX: -1, tapY: -1, pause: false, down: false, any: false };

let pointerId = null;
let startX = 0;
let startY = 0;
let startT = 0;
let swiped = false;
let consumed = false;      // the gesture in progress belongs to the previous screen

function onDown(e) {
  if (pointerId !== null) return;
  pointerId = e.pointerId;
  canvas.setPointerCapture(pointerId);
  const p = toLogical(e.clientX, e.clientY);
  startX = p.x; startY = p.y;
  startT = performance.now();
  swiped = false;
  consumed = false;
  tapped = false;
  lastX = p.x; lastY = p.y;
  state.down = true;
  clearTimeout(earlyTimer);
  if (earlyTaps) earlyTimer = setTimeout(() => {
    if (pointerId === null || swiped || consumed || tapped) return;
    if (Math.hypot(lastX - startX, lastY - startY) > EARLY_SLOP) return;
    tapped = true;
    tapT = performance.now();
    state.tap = true; state.tapX = startX; state.tapY = startY;
  }, EARLY_MS);
}

function detectSwipe(p) {
  if (consumed || swiped || performance.now() - startT > SWIPE_MAX_MS) return;
  const dx = p.x - startX;
  const dy = p.y - startY;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < SWIPE_MIN && ady < SWIPE_MIN) return;
  // after an early tap (which already moved a lane) a sideways drag is the
  // same gesture, not a second command
  if (tapped && adx > ady) { swiped = true; return; }
  swiped = true;
  if (tapped && ady >= adx && performance.now() - tapT < UNTAP_MS) state.untap = true;
  if (adx > ady) { if (dx < 0) state.left = true; else state.right = true; }
  else { if (dy < 0) state.jump = true; else state.phase = true; }
}

function onMove(e) {
  if (e.pointerId !== pointerId) return;
  // every sample the device took since the last event, not just the latest:
  // the swipe fires on the first one past the threshold
  const samples = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
  for (const ev of samples.length ? samples : [e]) {
    const p = toLogical(ev.clientX, ev.clientY);
    lastX = p.x; lastY = p.y;
    detectSwipe(p);
    if (swiped) break;
  }
}

function onUp(e) {
  if (e.pointerId !== pointerId) return;
  const p = toLogical(e.clientX, e.clientY);
  detectSwipe(p);
  const moved = Math.hypot(p.x - startX, p.y - startY);
  if (!consumed && !swiped && !tapped && moved < tapSlop) { state.tap = true; state.tapX = p.x; state.tapY = p.y; }
  clearTimeout(earlyTimer);
  state.any = true;
  pointerId = null;
  state.down = false;
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  state.any = true;
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': state.left = true; break;
    case 'ArrowRight': case 'KeyD': state.right = true; break;
    case 'ArrowUp': case 'KeyW': case 'Space': state.jump = true; break;
    case 'ArrowDown': case 'KeyS': case 'ShiftLeft': case 'ShiftRight': state.phase = true; break;
    case 'Escape': case 'KeyP': state.pause = true; break;
    case 'Enter': state.tap = true; state.tapX = -1; state.tapY = -1; break;
    case 'KeyE': state.active = true; break;
    default: return;
  }
  e.preventDefault();
});
// Losing focus only ever pauses; it must never toggle a paused game back on.
window.addEventListener('blur', () => { state.blur = true; });

// A modal screen just opened: the finger already on the glass was steering the
// symbiote, so nothing it does until it lifts may count on the new screen.
export function discardGesture() {
  if (pointerId !== null) consumed = true;
  state.left = state.right = state.jump = state.phase = state.tap = state.untap = false;
}
// Choice screens use a larger tap tolerance, so a short swipe is never a tap.
export function setTapSlop(px) { tapSlop = px; }

// Read and reset one-shot intents. Call once per logic step.
export function pollInput() {
  const out = { ...state };
  state.left = state.right = state.jump = state.phase = state.tap = state.untap = state.pause = state.any = state.active = state.blur = false;
  return out;
}
