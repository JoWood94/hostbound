// Logical portrait resolution. Width is fixed; height follows the screen's
// aspect ratio (computed once at startup) so the game fills tall phones edge to
// edge instead of letterboxing. Layouts designed for 640 use UI_OFFSET to centre.
export const W = 360;

// Real screen size in CSS px. innerHeight alone lies on iOS: in a home-screen
// app it can leave out the status bar strip, in Safari the area under the
// collapsed toolbar. Take the largest honest measure.
function probe(css) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;top:0;left:0;width:0;visibility:hidden;height:${css}`;
  document.body.appendChild(d);
  const v = d.getBoundingClientRect().height;
  d.remove();
  return v;
}
export function viewport() {
  const w = window.innerWidth || 360;
  let h = Math.max(window.innerHeight || 0, probe('100lvh') || 0, probe('100dvh') || 0);
  const standalone = navigator.standalone || window.matchMedia?.('(display-mode: standalone)').matches;
  if (standalone && screen.width === w) h = Math.max(h, screen.height);
  return { w, h: h || 640 };
}
const VP = viewport();
const aspect = VP.h / VP.w;
export const H = Math.max(600, Math.min(820, Math.round(W * aspect)));
export const UI_OFFSET = Math.round((H - 640) / 2);

// Notch / status bar / home indicator, in logical pixels. The canvas covers the
// whole screen (viewport-fit=cover), so HUD elements must stay out of these.
function insetPx(side) {
  const d = document.createElement('div');
  d.style.cssText = `position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-${side})`;
  document.body.appendChild(d);
  const v = parseFloat(getComputedStyle(d).paddingTop) || 0;
  d.remove();
  return v;
}
const pxToLogical = H / VP.h;
export const SAFE_TOP = Math.round(insetPx('top') * pxToLogical);
export const SAFE_BOTTOM = Math.round(insetPx('bottom') * pxToLogical);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

let sx = 1, sy = 1;
let dpr = 1;

export function resize() {
  const { w: vw, h: vh } = viewport();
  sx = vw / W; sy = vh / H;
  // H was picked from this aspect ratio, so sx≈sy and the canvas fills the
  // screen edge to edge. If the viewport changed a lot since startup (rotation,
  // browser bars), fall back to uniform scaling rather than distorting.
  if (Math.abs(sx / sy - 1) > 0.08) sx = sy = Math.min(sx, sy);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${Math.round(W * sx)}px`;
  canvas.style.height = `${Math.round(H * sy)}px`;
  canvas.style.left = `${Math.round((vw - W * sx) / 2)}px`;
  canvas.width = Math.round(W * sx * dpr);
  canvas.height = Math.round(H * sy * dpr);
  ctx.setTransform(sx * dpr, 0, 0, sy * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// Convert a client (CSS pixel) coordinate to logical game space.
export function toLogical(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left) * W / r.width, y: (clientY - r.top) * H / r.height };
}

export function makeOffscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { canvas: c, ctx: c.getContext('2d') };
}

window.addEventListener('resize', resize);
resize();

export { canvas, ctx };
