// Procedural darksynth sequencer. 16-step patterns, scheduled ahead with the
// Web Audio clock. BPM follows difficulty; bosses switch to a harsher pattern.
import { audioCtx, musicOut } from './audio.js';

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

let timer = null;
let step = 0;
let nextTime = 0;
let bpm = 112;
let mode = 'run';     // 'menu' | 'run' | 'boss' | 'shop'
let intensity = 0;    // 0..1, adds layers
let bar = 0;

// A minor-ish acid bassline, semitone offsets from root (A1 = 55Hz). null = rest.
const BASS_RUN = [0, null, 0, 12, 0, null, 3, 0, 0, null, 0, 10, 0, 7, null, 5];
const BASS_BOSS = [0, 0, 12, 0, 1, 0, 13, 0, 0, 0, 12, 0, 1, 13, 1, 12];
const BASS_MENU = [0, null, null, null, 0, null, null, 7, 0, null, null, null, 3, null, 5, null];
const ROOTS = [0, 0, -4, -2];     // bar progression: Am Am F G (offsets)
const ARP = [12, 15, 19, 24, 19, 15, 12, 15];

const f = (semi) => 55 * Math.pow(2, semi / 12);

function kick(t) {
  const ac = audioCtx();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.9, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(musicOut());
  o.start(t); o.stop(t + 0.32);
}

let noiseBuf = null;
function hat(t, open = false, vol = 0.12) {
  const ac = audioCtx();
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const g = ac.createGain();
  const dur = open ? 0.18 : 0.04;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(hp).connect(g).connect(musicOut());
  s.start(t); s.stop(t + dur + 0.01);
}

function snare(t) {
  const ac = audioCtx();
  hat(t, true, 0.25);
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(110, t + 0.1);
  g.gain.setValueAtTime(0.3, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  o.connect(g).connect(musicOut());
  o.start(t); o.stop(t + 0.14);
}

function bass(t, semi, len, accent) {
  const ac = audioCtx();
  const o = ac.createOscillator();
  const flt = ac.createBiquadFilter();
  const g = ac.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f(semi), t);
  flt.type = 'lowpass';
  flt.Q.value = accent ? 14 : 8;
  const peak = 300 + intensity * 1600 + (accent ? 900 : 0);
  flt.frequency.setValueAtTime(peak, t);
  flt.frequency.exponentialRampToValueAtTime(120, t + len);
  g.gain.setValueAtTime(0.28, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(flt).connect(g).connect(musicOut());
  o.start(t); o.stop(t + len + 0.02);
}

function lead(t, semi, len, vol = 0.05) {
  const ac = audioCtx();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(f(semi + 24), t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(musicOut());
  o.start(t); o.stop(t + len + 0.02);
}

function pad(t, semi, len) {
  const ac = audioCtx();
  for (const det of [-8, 8]) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sawtooth';
    o.detune.value = det;
    o.frequency.value = f(semi + 24);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.035, t + len * 0.3);
    g.gain.linearRampToValueAtTime(0.0001, t + len);
    o.connect(flt).connect(g).connect(musicOut());
    o.start(t); o.stop(t + len + 0.05);
  }
}

function scheduleStep(t, s) {
  const sixteenth = 60 / bpm / 4;
  const root = ROOTS[bar % ROOTS.length];
  if (mode === 'menu') {
    if (s === 0) pad(t, root, sixteenth * 16);
    const b = BASS_MENU[s];
    if (b !== null) bass(t, b + root, sixteenth * 1.8, false);
    if (s % 4 === 2) hat(t, false, 0.05);
    return;
  }
  if (mode === 'shop') {
    if (s === 0) pad(t, root, sixteenth * 16);
    if (s % 2 === 0) lead(t, ARP[(s / 2) % ARP.length] + root, sixteenth * 1.5, 0.03);
    if (s % 8 === 0) kick(t);
    return;
  }
  const boss = mode === 'boss';
  // Drums
  if (s % 4 === 0) kick(t);
  if (s === 4 || s === 12) snare(t);
  if (s % 2 === 1) hat(t, false, 0.08);
  if (boss && s % 4 === 3) hat(t, true, 0.1);
  // Bass
  const pat = boss ? BASS_BOSS : BASS_RUN;
  const b = pat[s];
  if (b !== null) bass(t, b + root, sixteenth * (boss ? 0.9 : 1.6), s % 4 === 2);
  // Layers with intensity
  if (s === 0 && intensity > 0.2) pad(t, root, sixteenth * 16);
  if (intensity > 0.5 || boss) {
    if (s % 2 === 0) lead(t, ARP[(s / 2 + bar) % ARP.length] + root, sixteenth * 1.2, boss ? 0.045 : 0.03);
  }
}

function tick() {
  const ac = audioCtx();
  if (!ac || ac.state !== 'running') return;
  if (nextTime < ac.currentTime) nextTime = ac.currentTime + 0.05;
  while (nextTime < ac.currentTime + LOOKAHEAD) {
    scheduleStep(nextTime, step);
    step = (step + 1) % 16;
    if (step === 0) bar++;
    nextTime += 60 / bpm / 4;
  }
}

export function startMusic() {
  if (timer || !audioCtx()) return;
  nextTime = audioCtx().currentTime + 0.1;
  timer = setInterval(tick, TICK_MS);
}

export function setMusic(newMode, difficulty = 0) {
  if (newMode !== mode) { mode = newMode; step = 0; }
  const base = mode === 'menu' ? 96 : mode === 'shop' ? 100 : mode === 'boss' ? 138 : 112;
  bpm = mode === 'run' ? Math.min(150, base + difficulty * 5) : base;
  intensity = Math.min(1, difficulty / 6);
}
