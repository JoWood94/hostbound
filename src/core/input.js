// Unifies touch, mouse and keyboard into a small set of intents:
//   moveDelta  : horizontal delta (logical px) accumulated since last read (drag)
//   axis       : -1..1 keyboard horizontal axis
//   jump, dash : one-shot flags (swipe up / down, or keys)
//   tap        : one-shot flag, pointer down+up without significant movement
//   down       : pointer currently pressed
import { canvas, toLogical } from './canvas.js';

const SWIPE_MIN = 28;      // logical px
const SWIPE_MAX_MS = 260;
const TAP_MAX_MOVE = 8;

const state = {
  moveDelta: 0,
  axis: 0,
  jump: false,
  dash: false,
  tap: false,
  down: false,
  pause: false,
  pointer: { x: 0, y: 0 },
};

const keys = new Set();
let pointerId = null;
let lastX = 0;
let startX = 0;
let startY = 0;
let startT = 0;
let swiped = false;

function onDown(e) {
  if (pointerId !== null) return;
  pointerId = e.pointerId;
  canvas.setPointerCapture(pointerId);
  const p = toLogical(e.clientX, e.clientY);
  lastX = startX = p.x;
  startY = p.y;
  startT = performance.now();
  swiped = false;
  state.down = true;
  state.pointer = p;
}

function onMove(e) {
  if (e.pointerId !== pointerId) return;
  const p = toLogical(e.clientX, e.clientY);
  state.pointer = p;
  state.moveDelta += p.x - lastX;
  lastX = p.x;
  if (!swiped && performance.now() - startT < SWIPE_MAX_MS) {
    const dy = p.y - startY;
    const dx = p.x - startX;
    if (Math.abs(dy) > SWIPE_MIN && Math.abs(dy) > Math.abs(dx) * 1.3) {
      swiped = true;
      if (dy < 0) state.jump = true; else state.dash = true;
    }
  }
}

function onUp(e) {
  if (e.pointerId !== pointerId) return;
  const p = toLogical(e.clientX, e.clientY);
  const moved = Math.hypot(p.x - startX, p.y - startY);
  if (!swiped && moved < TAP_MAX_MOVE) state.tap = true;
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
  keys.add(e.code);
  if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') state.jump = true;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyS' || e.code === 'ArrowDown') state.dash = true;
  if (e.code === 'Escape' || e.code === 'KeyP') state.pause = true;
  if (e.code === 'Enter') state.tap = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); state.pause = true; });

// Read and reset one-shot intents. Call once per logic step.
export function pollInput() {
  const left = keys.has('ArrowLeft') || keys.has('KeyA');
  const right = keys.has('ArrowRight') || keys.has('KeyD');
  state.axis = (right ? 1 : 0) - (left ? 1 : 0);
  const out = {
    moveDelta: state.moveDelta,
    axis: state.axis,
    jump: state.jump,
    dash: state.dash,
    tap: state.tap,
    pause: state.pause,
    down: state.down,
    pointer: state.pointer,
  };
  state.moveDelta = 0;
  state.jump = state.dash = state.tap = state.pause = false;
  return out;
}
