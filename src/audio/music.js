// Procedural psytrance / gabber sequencer. 16-step patterns, scheduled ahead
// with the Web Audio clock. In a run it follows the game clock (core/tempo.js).
// ONE style for the whole run, no genre switches: the sound morphs with the
// tempo (`drive`, continuous). At 130 BPM it is psytrance: a tight kick, a
// rolling bass on the three 16ths between kicks, an acid line. As the tempo
// climbs the kick gets harder and more distorted and eats the rolling bass,
// and hoover stabs fade in: by ~220 BPM it is gabber.
// The ARRANGEMENT follows the district (`energy`, from the game's heat): a
// breakdown after each boss (same tempo, kick softer, pad and gate, no acid),
// a build-up through the district, obstacle courses as tension (gated chord,
// snare rolls, risers), fights as groove (acid, rolling bass), the boss
// warning as a riser into a crash, the boss as the peak (gabber kicks, hoover,
// dense hats), and a crash back down into the breakdown when it dies.
import { audioCtx, musicOut, sfxOut, shotRate } from './audio.js';
import { runBpm } from '../core/tempo.js';

const LOOKAHEAD = 0.2;   // s scheduled ahead: survives a slow frame
const TICK_MS = 25;

let timer = null;
let step = 0;
let nextTime = 0;
let bpm = 130;
let mode = 'run';     // 'menu' | 'run' | 'warn' | 'boss'
let drive = 0;        // 0..1, psytrance -> gabber (tempo)
let target = 0;       // 0..1, the district's energy as the game reports it
let energy = 0;       // the same, latched once per bar so changes land on the bar
let kind = 'combat';  // 'combat' | 'course': the current section
let crashDue = false, riserDue = false;
let bossBar0 = null;  // bar the boss arrived on
let bar = 0;
// Menu voices play through their own bus, faded out when a run starts so
// nothing from the menu rings on under the run.
let menuBus = null;
// Run voices go through a lowpass + gain: muffled while the game is frozen
// (item pick, pause, death), and a touch louder for the boss.
let fxIn = null, fxGain = null, fxKey = '';
function dest() {
  if (mode !== 'menu') {
    if (!fxIn) {
      const ac = audioCtx();
      fxIn = ac.createBiquadFilter();
      fxIn.type = 'lowpass';
      fxIn.frequency.value = 20000;
      fxGain = ac.createGain();
      fxIn.connect(fxGain).connect(musicOut());
    }
    return fxIn;
  }
  if (!menuBus) { menuBus = audioCtx().createGain(); menuBus.connect(musicOut()); }
  return menuBus;
}
// Shared effect chains, one set per destination (menu bus / run fx). Notes
// only build their oscillators and envelopes; the costly nodes (distortion,
// fixed filters) exist once. Per-note WaveShapers at 16ths on several voices
// were what made deep runs crackle.
const shared = new Map();
function chains() {
  const d = dest();
  let c = shared.get(d);
  if (c) return c;
  const ac = audioCtx();
  const hp = (freq) => { const n = ac.createBiquadFilter(); n.type = 'highpass'; n.frequency.value = freq; n.connect(d); return n; };
  const grit = (level, out) => { const sh = ac.createWaveShaper(); sh.curve = curve(level); sh.connect(out); return sh; };
  const acidOut = ac.createGain(); acidOut.connect(d);
  const gateOut = ac.createGain(); gateOut.connect(d);
  const gateFlt = ac.createBiquadFilter(); gateFlt.type = 'lowpass'; gateFlt.Q.value = 4;
  gateFlt.connect(grit(4, gateOut));
  c = { hatOpen: hp(6500), hatClosed: hp(8500), acidIn: grit(5, acidOut), acidOut, gateIn: gateFlt, gateFlt, gateOut };
  shared.set(d, c);
  return c;
}

function setFx(now, held) {
  dest();
  const boss = mode === 'boss';
  const key = `${held}|${boss}|${mode === 'menu'}`;
  if (key === fxKey || !fxIn) return;
  fxKey = key;
  fxIn.frequency.setTargetAtTime(held ? 650 : 20000, now, held ? 0.08 : 0.25);
  fxGain.gain.setTargetAtTime((held ? 0.55 : 1) * (boss && !held ? 1.2 : 1), now, held ? 0.08 : boss ? 1.2 : 0.3);
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
// A phrygian (A Bb C D E F G), semitones from A1 = 55 Hz.
const f = (semi) => 55 * Math.pow(2, semi / 12);
// No chord changes (that is house): the whole track sits on A, with the dark
// half step to Bb for the last bar of each 8-bar phrase.
const ROOTS = [0, 0, 0, 0, 0, 0, 0, 1];
// Acid lines (16ths, null = rest, [note, accent]); one every 16 bars. Psy /
// hard techno, not a melody: the root hammered on 16ths, the accent (filter
// and grit, not pitch) doing the work; a rare octave or half step.
const n_ = null;
const ACID = [
  [[0, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 1], [0, 0], [12, 0], [0, 0], [0, 0], [0, 1], [0, 0], [0, 0], [1, 0], [0, 1], [0, 0]],
  [[0, 1], n_, [0, 0], [0, 0], [0, 1], n_, [0, 0], [0, 0], [0, 1], n_, [0, 0], [1, 0], [0, 1], n_, [0, 0], [-12, 0]],
  [[0, 1], [0, 0], [0, 0], [0, 1], [0, 0], [0, 0], [0, 1], [0, 0], [0, 0], [0, 1], [0, 0], [0, 0], [12, 1], [0, 0], [1, 0], [0, 0]],
];
// Hoover riff (16th positions in a 2-bar phrase, semitones).
const HOOVER = [[0, 12], [3, 12], [6, 13], [10, 12], [16, 12], [19, 15], [22, 13], [26, 10]];

let noiseBuf = null;
function noise(ac) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

// Distortion curves, one per drive level (built once).
const curves = [];
function curve(level) {
  if (!curves[level]) {
    const k = 1 + level * 2.2, n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * k) / Math.tanh(k); }
    curves[level] = c;
  }
  return curves[level];
}

// Kick: tight and clicky at low drive, longer, higher-pitched and clipped
// (gabber) at high drive. Never longer than a beat. Three shapes rotate every
// 8 bars when the moment is calm: 0 tight psy, 1 deep and round, 2 punchy
// with a click on top.
function kick(t, beat, vol, kd, shape = 0) {
  const ac = audioCtx();
  const o = ac.createOscillator();
  const sh = ac.createWaveShaper();
  const g = ac.createGain();
  const deep = shape === 1 ? 1 : 0;
  const len = Math.min(beat * 0.92, 0.2 + 0.22 * kd + 0.06 * deep);
  o.type = 'sine';
  o.frequency.setValueAtTime(170 + 110 * kd - 40 * deep + (shape === 2 ? 60 : 0), t);
  o.frequency.exponentialRampToValueAtTime(52 - 6 * kd - 6 * deep, t + 0.05 + 0.04 * kd + 0.03 * deep);
  o.frequency.exponentialRampToValueAtTime(40 - 3 * deep, t + len);
  sh.curve = curve(Math.round(kd * 8));
  // Clipping and the longer hold make a driven kick far louder (+4 dB RMS at
  // kd 0.5, and brighter): this sets it ~3 dB UNDER the clean one by RMS,
  // which is about level once its brightness is counted.
  const lvl = vol / (1 + 2.6 * Math.pow(kd, 0.6));
  g.gain.setValueAtTime(lvl, t);
  g.gain.setValueAtTime(lvl, t + len * (0.25 + 0.45 * kd));
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(sh).connect(g).connect(dest());
  o.start(t); o.stop(t + len + 0.02);
  if (shape === 2) hat(t, false, 0.08 * vol);
}

// Crash: a long bright noise wash. Riser: filtered noise sweeping up.
function crash(t, len, vol) {
  const ac = audioCtx();
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  s.loop = true;
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3500;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  s.connect(hp).connect(g).connect(dest());
  s.start(t); s.stop(t + len + 0.02);
}
function riser(t, len, vol) {
  const ac = audioCtx();
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  s.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(7000, t + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + len);
  g.gain.linearRampToValueAtTime(0.0001, t + len + 0.03);
  s.connect(bp).connect(g).connect(dest());
  s.start(t); s.stop(t + len + 0.05);
}

function hat(t, open = false, vol = 0.12) {
  if (vol < 0.005) return;
  const ac = audioCtx();
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  const g = ac.createGain();
  const dur = open ? 0.12 : 0.03;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  const c = chains();
  s.connect(g).connect(open ? c.hatOpen : c.hatClosed);
  s.start(t); s.stop(t + dur + 0.01);
}

function clap(t, vol) {
  if (vol < 0.005) return;
  const ac = audioCtx();
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1400;
  bp.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  for (let i = 0; i < 3; i++) {          // three quick hits = a clap
    g.gain.setValueAtTime(vol, t + i * 0.009);
    g.gain.exponentialRampToValueAtTime(vol * 0.2, t + i * 0.009 + 0.008);
  }
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
  s.connect(bp).connect(g).connect(dest());
  s.start(t); s.stop(t + 0.15);
}

// Psy rolling bass: one short plucked note per 16th, ducking under the kick.
function roll(t, semi, len, vol) {
  if (vol < 0.005) return;
  const ac = audioCtx();
  const o = ac.createOscillator();
  const flt = ac.createBiquadFilter();
  const g = ac.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f(semi), t);
  flt.type = 'lowpass';
  flt.Q.value = 5;
  flt.frequency.setValueAtTime(260 + 1100 * energy, t);
  flt.frequency.exponentialRampToValueAtTime(110, t + len);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(flt).connect(g).connect(dest());
  o.start(t); o.stop(t + len + 0.02);
}

// 303-style acid: resonant squelch; the cutoff sweeps slowly over 8 bars.
function acid(t, semi, len, accent, vol) {
  if (vol < 0.005) return;
  const ac = audioCtx();
  const o = ac.createOscillator();
  const flt = ac.createBiquadFilter();
  const g = ac.createGain();
  const c = chains();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(f(semi + 12), t);   // A2: low and heavy, not a chime
  const sweep = 0.5 - 0.5 * Math.cos((bar % 8 + step / 16) / 8 * Math.PI * 2);
  const top = 350 + sweep * (700 + 1300 * energy) + (accent ? 700 : 0);
  flt.type = 'lowpass';
  flt.Q.value = accent ? 16 : 10;
  flt.frequency.setValueAtTime(top, t);
  flt.frequency.exponentialRampToValueAtTime(Math.max(140, top * 0.2), t + len);
  // Into the shared grit at full level (so it clips), then the shared output
  // gain sets the volume: clipped is denser, so quieter.
  g.gain.setValueAtTime(accent ? 1.25 : 1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  c.acidOut.gain.setValueAtTime(0.65 * vol, t);
  o.connect(flt).connect(g).connect(c.acidIn);
  o.start(t); o.stop(t + len + 0.02);
}

// Hoover: three detuned saws bending down into the note.
function hoover(t, semi, len, vol) {
  if (vol < 0.005) return;
  const ac = audioCtx();
  const flt = ac.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(3200, t);
  flt.frequency.exponentialRampToValueAtTime(900, t + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + len * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  flt.connect(g).connect(dest());
  for (const det of [-22, 0, 19]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = det;
    o.frequency.setValueAtTime(f(semi + 12) * 1.12, t);
    o.frequency.exponentialRampToValueAtTime(f(semi + 12), t + Math.min(0.08, len * 0.4));
    o.connect(flt);
    o.start(t); o.stop(t + len + 0.02);
  }
}

// Psy "zap": a falling sine at the top of each 8-bar phrase.
function zap(t, len, vol) {
  if (vol < 0.005) return;
  const ac = audioCtx();
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(2400, t);
  o.frequency.exponentialRampToValueAtTime(90, t + len);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  o.connect(g).connect(dest());
  o.start(t); o.stop(t + len + 0.02);
}

// Variations cycle with the bar count, never with difficulty: the track keeps
// changing at any depth, so no pattern tells you "this is the hard part".
// Everything sits on the 16th grid (hat rolls on its 32nds).
// Hats, one pattern per 4 bars. c = closed, o = open, r = 32nd roll, . = rest.
const HATS = [
  '..o...o...o...o.',
  '.co..co..co..co.',
  'ccoccco.ccocccor',
  '..o.c.o...o.c.or',
  '.coc.coc.coc.coc',
  'c.o.c.o.c.occror',
];
// Trance gate on a held chord, one pattern per 8 bars (x = open 16th).
const GATES = [
  'x.x.x.x.x.x.x.x.',
  'xx.xx.xx.xx.x.x.',
  'x.xxx.xxx.xxx.xx',
  'xxx.xx.xxxx.xx.x',
  'x..x..x.x..x..x.',
];
// Which hat patterns the moment allows; the bar count still rotates them.
let hatPool = [0, 1, 2, 3, 4, 5];
const hatAt = (s) => HATS[hatPool[Math.floor(bar / 4) % hatPool.length]][s];
const gateAt = (s) => GATES[Math.floor(bar / 8) % GATES.length][s] === 'x';

// Psy FM zapper, gated on the 16ths: ONE note (no chords), a metallic
// carrier/modulator pair at a non-octave ratio whose brightness snaps shut on
// every hit, driven into grit. The filter breathes with the acid's sweep.
function gate(t, semi, len, vol) {
  if (vol < 0.005) return;
  const ac = audioCtx();
  const car = ac.createOscillator();
  const mod = ac.createOscillator();
  const idx = ac.createGain();
  const g = ac.createGain();
  const c = chains();
  const fc = f(semi + 12);
  car.type = 'triangle';
  car.frequency.value = fc;
  mod.type = 'sine';
  mod.frequency.value = fc * 1.41;
  const sweep = 0.5 - 0.5 * Math.cos((bar % 8 + step / 16) / 8 * Math.PI * 2);
  idx.gain.setValueAtTime(fc * (2 + 4 * sweep), t);
  idx.gain.exponentialRampToValueAtTime(fc * 0.2, t + len);
  c.gateFlt.frequency.setValueAtTime(600 + (600 + 1000 * energy) * sweep, t);
  c.gateOut.gain.setValueAtTime(0.7 * vol, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(1, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  mod.connect(idx).connect(car.frequency);
  car.connect(g).connect(c.gateIn);
  car.start(t); mod.start(t); car.stop(t + len + 0.02); mod.stop(t + len + 0.02);
}

// The player's shots, played on the grid: a dry tick with a little low body,
// through the SFX bus (so it follows the SFX switch, not the music one).
// Denser with the fire rate: offbeat 8ths, all 8ths, all 16ths.
function shotTick(t, vol) {
  const out = sfxOut();
  if (!out) return;
  const ac = audioCtx();
  const s = ac.createBufferSource();
  s.buffer = noise(ac);
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2600;
  bp.Q.value = 1.3;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
  s.connect(bp).connect(g).connect(out);
  s.start(t); s.stop(t + 0.04);
  const o = ac.createOscillator();
  const og = ac.createGain();
  o.type = 'triangle';
  o.frequency.setValueAtTime(f(12), t);
  o.frequency.exponentialRampToValueAtTime(f(5), t + 0.03);
  og.gain.setValueAtTime(vol * 0.7, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
  o.connect(og).connect(out);
  o.start(t); o.stop(t + 0.05);
}
function shots(t, s) {
  const r = shotRate();
  if (r < 1) return;
  const q = s % 4;
  const on = r >= 10 ? true : r >= 5 ? q % 2 === 0 : q === 2;
  if (on) shotTick(t, q === 0 ? 0.05 : 0.07);
}

function hats(t, s, six, vol) {
  const h = hatAt(s);
  if (h === 'o') hat(t, true, 0.09 * vol);
  else if (h === 'c') hat(t, false, 0.07 * vol);
  else if (h === 'r') { hat(t, false, 0.06 * vol); hat(t + six / 2, false, 0.08 * vol); }
}

// Breakdown drone: low saws on A1 and E2 under a slowly opening lowpass,
// no chord, no shimmer. Dark room tone, not a pad.
function pad(t, semi, len, vol) {
  const ac = audioCtx();
  const flt = ac.createBiquadFilter();
  flt.type = 'lowpass';
  flt.Q.value = 5;
  flt.frequency.setValueAtTime(180, t);
  flt.frequency.linearRampToValueAtTime(520, t + len * 0.6);
  flt.frequency.linearRampToValueAtTime(200, t + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + len * 0.3);
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  flt.connect(g).connect(dest());
  for (const [iv, det] of [[0, 0], [7, 0], [12, 6]]) {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f(semi + iv);
    o.detune.value = det;
    o.connect(flt);
    o.start(t); o.stop(t + len + 0.05);
  }
}

// The menu is the run's track in breakdown: same tempo, same acid line and
// rolling bass, no kick. Pressing RUN drops the kick in.
function scheduleMenu(t, s, six) {
  const root = ROOTS[bar % ROOTS.length];
  const q = s % 4;
  if (s === 0 && bar % 2 === 0) pad(t, root, six * 32, 0.05);
  if (q !== 0 && bar % 8 >= 4) roll(t, root, six * 0.7, 0.09);
  if (q !== 0) hats(t, s, six, 0.4);
  const line = ACID[Math.floor(bar / 16) % ACID.length][s];
  if (line && bar % 16 < 12) acid(t, line[0] + root, six * 0.9, line[1], 0.05);
  if (bar % 16 >= 8 && gateAt(s)) gate(t, root, six * 0.9, 0.018);
  if (s === 0 && bar % 8 === 0) zap(t, six * 4, 0.035);
}

function scheduleStep(t, s) {
  const six = 60 / bpm / 4;
  const root = ROOTS[bar % ROOTS.length];
  if (mode === 'menu') { hatPool = [0, 1, 3]; return scheduleMenu(t, s, six); }
  const boss = mode === 'boss', warn = mode === 'warn';
  if (s === 0) energy = target;            // arrangement changes land on the bar
  // One steady climb: 0.1 after a boss -> 0.8 at the checkpoint -> 0.82 while
  // the screen clears -> 0.86 on the warning -> 0.9 as the boss lands, then
  // up to 1 over its first 8 bars. No step anywhere.
  if (boss && bossBar0 === null) bossBar0 = bar;
  const E = boss ? Math.min(1, 0.9 + (bar - bossBar0) * 0.0125) : warn ? 0.86 : energy;
  const dr = drive;
  const course = kind === 'course' && !boss && !warn;
  const calm = E < 0.25;                   // the breakdown after a boss
  // The kick's grit builds with the district, whatever the tempo: clean after
  // a boss, gabber at the boss. Latched per bar, so it climbs bar by bar.
  // Gabber: enters on the stretch before the boss and is full as it lands.
  // Gabber: a SECOND kick layered on the clean one and faded in, not a
  // switch: from ~700 m of the district (E 0.6) up to full as the boss lands
  // (E 0.9), smoothstepped; the clean kick dips to half under it. At full
  // it sits ~4 dB under the clean kick alone by RMS: its brightness does
  // the rest.
  const g0 = clamp01((E - 0.6) / 0.3);
  const gab = g0 * g0 * (3 - 2 * g0);
  const hot = gab > 0.5;
  const q = s % 4;                         // 16th inside the beat
  const fill = E > 0.3 && bar % 8 === 7 && s >= 12;

  if (q === 0 && crashDue) { crashDue = false; crash(t, six * 24, 0.09); zap(t, six * 4, 0.05); }
  if (riserDue) { riserDue = false; riser(t, 2.1, 0.09); }

  // Kick on every beat: the gameplay pulse, never dropped. Fights end every
  // 4th bar (every 2nd for a boss) with a kick roll on the grid: 8ths, 16ths
  // once heated or the drive is up.
  const kd = clamp01(dr * 0.3 * (0.5 + 0.5 * E));
  const shape = hot ? 0 : Math.floor(bar / 8) % 3;
  const every = E > 0.95 ? 2 : 4;
  const kroll = !course && !calm && !warn && ((bar % every === every - 1 && s >= 12) || (E > 0.5 && bar % 16 === 15 && s >= 8));
  const dense = hot || dr > 0.45;
  const kvol = (calm ? 0.55 : 0.72) * (1 - 0.5 * gab);
  const kick2 = (beat, v) => {
    kick(t, beat, v, kd, shape);
    if (gab > 0.01) kick(t, beat, 0.42 * gab * (v / 0.72), 1, 0);   // the gabber layer (kick() divides by 3.6 at kd 1)
  };
  if (q === 0) kick2(six * (kroll ? (dense ? 1 : 2) : 4), kvol);
  else if (kroll && (dense || q === 2)) kick2(six * (dense ? 1 : 2), (0.4 + 0.2 * ((s % 8) / 8)) * (1 - 0.5 * gab));

  // Rolling bass between the kicks; the gabber kick takes its place. Out
  // during the warning, so the crash lands on a gap.
  if (q !== 0 && !kroll) {
    const up = bar % 2 === 1 && s >= 12 && q === 3;   // octave flick closing every other bar
    roll(t, root + (up ? 12 : 0), six * 0.85, 0.26 * (1 - 0.75 * dr) * (0.55 + 0.45 * E));
  }

  if (!held) shots(t, s);

  // Hats: pattern rotates every 4 bars, from the set the moment allows.
  hatPool = calm ? [0] : E < 0.6 ? [0, 1, 3] : E < 0.86 ? [1, 2, 3, 4, 5] : [2, 3, 4, 5];
  if (q !== 0 || hatAt(s) === 'r') hats(t, s, six, 0.5 + 0.5 * E);

  // Claps: 2 and 4 once the district warms up, phrase-end fills; a course
  // builds a 16th snare roll over every 4th bar; the warning rolls all through.
  if (warn) clap(t, 0.05 + 0.11 * (s / 15));
  else if (course && bar % 4 === 3) clap(t, (0.03 + 0.1 * (s / 15)) * (0.5 + 0.5 * E));
  else if (fill) clap(t, 0.05 + 0.1 * E * ((s - 11) / 5));
  else if (E > 0.3 && (s === 4 || s === 12)) clap(t, 0.13 * E);
  if (course && bar % 8 === 4 && s === 0) riser(t, six * 64, 0.03 + 0.03 * E);

  // Leads. Fights: acid for 12 bars of every 16, the gate for the last 8.
  // Courses: the gate carries it, acid in the background. Breakdown: gate
  // and pad only. Boss: both, bright.
  const line = ACID[Math.floor(bar / 16) % ACID.length][s];
  const acidVol = calm ? 0 : 0.075 * clamp01((E - 0.2) / 0.5) * (course ? 0.45 : 1);
  if (line && !fill && (boss || bar % 16 < 12)) acid(t, line[0] + root, six * 0.9, line[1], acidVol);
  if ((calm || course || boss || bar % 16 >= 8) && gateAt(s)) gate(t, root, six * 0.9, calm ? 0.02 : 0.022 + 0.018 * E);
  if (calm && s === 0 && bar % 2 === 0) pad(t, root, six * 32, 0.045);

  // Hoover stabs: tempo and heat both have to be up (always some for bosses).
  const hv = clamp01((E - 0.7) / 0.3) * (0.4 + 0.6 * clamp01((dr - 0.2) / 0.5));
  if (hv > 0) {
    const pos = (bar % 2) * 16 + s;
    for (const [p, semi] of HOOVER) if (p === pos) hoover(t, semi + root, six * 2.6, 0.045 * Math.min(1, hv));
  }
  if (s === 0 && bar % 8 === 0) zap(t, six * 4, 0.05 * E);
}

// The GAME owns the rhythm (it runs muted too); in a run the music follows it.
// syncMusic() is called every frame with the game clock (ticks = eighth notes)
// and the real seconds per tick. The game clock only advances in 1/60 s
// steps, bunched per animation frame (two or three at once on a heavy frame),
// so reading it straight would put every note up to a frame off the grid. The
// music keeps its OWN steady clock instead, phase-locked to the game's: it
// runs at the game's tempo and nudges its speed by at most 2% to close the
// gap (a hit-stop leaves the game 70 ms behind: caught up in ~3 s), smoothed over many frames. Notes stay evenly spaced, the kick still
// lands with the shots. A big gap (start, pause, warp) snaps it into place.
// CHRONO slowing the game slows the music with it. Without a fresh sync
// (menu, pause) the sequencer free-runs on its own tempo.
let follow = null;        // { c, at, tps }: last game clock reading
let lock = null;          // { pos, at, rate, err }: the music clock (ticks, audio s, ticks/s)
let lastStep = -1;        // last 16th (absolute index) scheduled while following
export function syncMusic(clockTicks, secPerTick) {
  const ac = audioCtx();
  if (!ac) return;
  follow = { c: clockTicks, at: ac.currentTime, tps: secPerTick };
  bpm = 60 / (secPerTick * 2);
  tick();
}

function steer(now) {
  const game = follow.c + (now - follow.at) / follow.tps;     // game clock now (noisy)
  const base = 1 / follow.tps;
  if (!lock || Math.abs(game - (lock.pos + (now - lock.at) * lock.rate)) > 3) {
    lock = { pos: game, at: now, rate: base, err: 0 };
    lastStep = -1;
    return;
  }
  const pos = lock.pos + (now - lock.at) * lock.rate;
  lock.err += (game - pos - lock.err) * 0.02;
  const lim = Math.abs(lock.err) > 0.3 ? 0.05 : 0.02;   // a lag spike: catch up faster
  const fix = Math.max(-lim, Math.min(lim, lock.err * 0.5));
  lock.pos = pos; lock.at = now; lock.rate = base * (1 + fix);
}

// The game clock stops while the game is frozen (item pick, pause, death:
// the game says so through holdMusic). The music does not stop with it: its
// own clock keeps running at the same tempo (no gap, no doubled notes),
// muffled. When the game moves again the two clocks no longer agree, so the
// music snaps back onto the game's beat, while still muffled, then opens up.
// A slow frame is NOT a freeze: the music clock just runs on unsteered and
// catches up gently.
let held = false, frozen = false;
export function holdMusic(on) { frozen = on; }
function tick() {
  const ac = audioCtx();
  if (!ac || ac.state !== 'running') return;
  const now = ac.currentTime;
  const fresh = follow && now - follow.at < 0.5;
  if (mode !== 'menu' && (fresh || lock)) {
    if (frozen) held = true;                     // frozen: free-run on the music clock
    else if (fresh) {
      if (held) { held = false; lock = null; }   // back from a freeze: snap
      steer(now);
    }
    if (!lock) { lastStep = -1; lock = { pos: follow ? follow.c : 0, at: now, rate: 2 * bpm / 60, err: 0 }; }
    setFx(now, held);
    const timeOf = (n) => lock.at + (n / 2 - lock.pos) / lock.rate;   // n = 16th index
    let n = lastStep + 1;
    if (lastStep < 0 || timeOf(n) < now - 0.25) n = Math.ceil(lock.pos * 2);
    for (; timeOf(n) < now + LOOKAHEAD; n++) {
      const t = timeOf(n);
      lastStep = n;
      if (t < now - 0.004) continue;      // missed (tab hiccup): skip, never play off the grid
      step = ((n % 16) + 16) % 16;
      bar = Math.floor(n / 16);
      scheduleStep(Math.max(t, now), step);
    }
    nextTime = now + 0.05;
    return;
  }
  lastStep = -1;
  lock = null;
  held = false;
  if (mode !== 'menu') setFx(now, false);
  if (nextTime < now) nextTime = now + 0.05;
  while (nextTime < now + LOOKAHEAD) {
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

// scene: { heat 0..1 through the district, kind 'combat' | 'course', pending: boss checkpoint passed }.
export function setMusic(newMode, difficulty = 0, scene = null) {
  const ac = audioCtx();
  if (newMode !== mode) {
    if (mode === 'menu' && menuBus && ac) {
      menuBus.gain.setTargetAtTime(0, ac.currentTime, 0.08);
      const old = menuBus;
      setTimeout(() => { old.disconnect(); shared.delete(old); }, 1500);
      menuBus = null;
    }
    if (newMode === 'warn') riserDue = true;
    if ((mode === 'warn' && newMode === 'boss') || (mode === 'boss' && newMode === 'run')) crashDue = true;
    if (newMode === 'run' && mode === 'boss') energy = target = 0;   // straight into the breakdown
    if (newMode === 'boss') bossBar0 = null;
    mode = newMode; step = 0;
  }
  // Free-running tempo (menu, or before the first sync); in a run the game clock wins.
  if (mode === 'menu') { bpm = 130; follow = null; drive = 0; return; }
  if (!follow) bpm = runBpm(difficulty);
  // The run's tempo, not the live one: CHRONO slows the music without softening it.
  drive = clamp01((runBpm(difficulty) - 130) / 95);
  if (scene) {
    target = scene.pending ? 0.82 : clamp01(0.1 + 0.7 * scene.heat);
    kind = scene.kind;
  }
}
