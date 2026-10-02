// Particles, screen shake, hit-stop.
import { drawGlowDot } from './draw.js';

const MAX = 400;
const px = new Float32Array(MAX);
const py = new Float32Array(MAX);
const vx = new Float32Array(MAX);
const vy = new Float32Array(MAX);
const life = new Float32Array(MAX);
const maxLife = new Float32Array(MAX);
const size = new Float32Array(MAX);
const colors = new Array(MAX);
let count = 0;

export function burst(x, y, color, n = 10, speed = 120, lifeS = 0.5, sz = 2) {
  if (count > MAX * 0.5) n = Math.ceil(n / 2);   // a crowded screen gets fewer sparks
  for (let i = 0; i < n && count < MAX; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    px[count] = x; py[count] = y;
    vx[count] = Math.cos(a) * s; vy[count] = Math.sin(a) * s;
    life[count] = maxLife[count] = lifeS * (0.6 + Math.random() * 0.4);
    size[count] = sz;
    colors[count] = color;
    count++;
  }
}

export function updateFx(dt, scrollSpeed) {
  for (let i = 0; i < count; i++) {
    life[i] -= dt;
    if (life[i] <= 0) {
      count--;
      px[i] = px[count]; py[i] = py[count]; vx[i] = vx[count]; vy[i] = vy[count];
      life[i] = life[count]; maxLife[i] = maxLife[count]; size[i] = size[count]; colors[i] = colors[count];
      i--;
      continue;
    }
    px[i] += vx[i] * dt;
    py[i] += (vy[i] + scrollSpeed * 0.5) * dt;
    vx[i] *= 0.96; vy[i] *= 0.96;
  }
}

export const fxCount = () => count;
export function drawFx() {
  for (let i = 0; i < count; i++) {
    const t = life[i] / maxLife[i];
    drawGlowDot(px[i], py[i], colors[i], size[i] * t + 0.5, t);
  }
}

// Screen shake
let shakeT = 0;
let shakeAmp = 0;
export function shake(amp = 6, dur = 0.2) {
  shakeAmp = Math.max(shakeAmp, amp);
  shakeT = Math.max(shakeT, dur);
}
export function updateShake(dt) {
  if (shakeT > 0) { shakeT -= dt; if (shakeT <= 0) shakeAmp = 0; }
}
export function shakeOffset() {
  if (shakeT <= 0) return { x: 0, y: 0 };
  return { x: (Math.random() - 0.5) * 2 * shakeAmp, y: (Math.random() - 0.5) * 2 * shakeAmp };
}

// Hit-stop: freezes logic for a few ms
let stopT = 0;
export function hitStop(s = 0.06) { stopT = Math.max(stopT, s); }
export function consumeHitStop(dt) {
  if (stopT <= 0) return false;
  stopT -= dt;
  return true;
}
