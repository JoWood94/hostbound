// Unifies touch, mouse and keyboard into one-shot intents:
//   left, right : change lane
//   jump        : swipe up / Space
//   phase       : swipe down / Shift
//   tap         : pointer down+up without movement, or Enter
//   pause       : Esc / P / window blur
import { canvas, toLogical } from './canvas.js';
import { gestureTick } from './haptics.js';

const SWIPE_MIN = 22;      // logical px
const SWIPE_MAX_MS = 320;
const TAP_MAX_MOVE = 8;

const state = { left: false, right: false, jump: false, phase: false, tap: false, tapX: -1, tapY: -1, pause: false, down: false, any: false };

let pointerId = null;
let startX = 0;
let startY = 0;
let startT = 0;
let swiped = false;

function onDown(e) {
  if (pointerId !== null) return;
  pointerId = e.pointerId;
  canvas.setPointerCapture(pointerId);
  const p = toLogical(e.clientX, e.clientY);
  startX = p.x; startY = p.y;
  startT = performance.now();
  swiped = false;
  state.down = true;
}

function detectSwipe(p) {
  if (swiped || performance.now() - startT > SWIPE_MAX_MS) return;
  const dx = p.x - startX;
  const dy = p.y - startY;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  if (adx < SWIPE_MIN && ady < SWIPE_MIN) return;
  swiped = true;
  if (adx > ady) { if (dx < 0) state.left = true; else state.right = true; }
  else { if (dy < 0) state.jump = true; else state.phase = true; }
}

function onMove(e) {
  if (e.pointerId !== pointerId) return;
  detectSwipe(toLogical(e.clientX, e.clientY));
}

function onUp(e) {
  if (e.pointerId !== pointerId) return;
  const p = toLogical(e.clientX, e.clientY);
  detectSwipe(p);
  const moved = Math.hypot(p.x - startX, p.y - startY);
  if (!swiped && moved < TAP_MAX_MOVE) { state.tap = true; state.tapX = p.x; state.tapY = p.y; }
  state.any = true;
  pointerId = null;
  state.down = false;
}

canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('pointercancel', onUp);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
// iOS haptics: WebKit treats touchend (not pointerdown/move) as the user
// activation that may toggle the hidden switch, so tick there.
canvas.addEventListener('touchend', gestureTick, { passive: true });

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

// Read and reset one-shot intents. Call once per logic step.
export function pollInput() {
  const out = { ...state };
  state.left = state.right = state.jump = state.phase = state.tap = state.pause = state.any = state.active = state.blur = false;
  return out;
}
