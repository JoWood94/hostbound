// Logical portrait resolution. Everything in the game is drawn in this space.
export const W = 360;
export const H = 640;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

let scale = 1;
let dpr = 1;

export function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  scale = Math.min(vw / W, vh / H);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// Convert a client (CSS pixel) coordinate to logical game space.
export function toLogical(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
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
