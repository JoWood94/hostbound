// Web Audio bootstrap + procedural SFX. No audio files.
// iOS only allows audio after a user gesture: call unlockAudio() on first tap.
let ac = null;
let master, sfxBus, musicBus, noiseBuf, grit;
const settings = { sfx: true, music: true };

export function audioCtx() { return ac; }
export function musicOut() { return musicBus; }
export function sfxOut() { return settings.sfx ? sfxBus : null; }

// Shots are not sounded one by one (autofire runs off the beat): each one is
// reported here, and the music sequencer plays them as a layer on its grid.
const shotTimes = [];
export function shotRate() {
  const now = performance.now();
  while (shotTimes.length && now - shotTimes[0] > 500) shotTimes.shift();
  return shotTimes.length * 2;   // shots per second over the last 0.5 s
}

export function unlockAudio() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master = ac.createGain();
    master.gain.value = 0.8;
    sfxBus = ac.createGain();
    musicBus = ac.createGain();
    sfxBus.connect(comp);
    // Shared soft clipper for the gritty voices (one node, not one per sound).
    grit = ac.createWaveShaper();
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; c[i] = Math.tanh(x * 4) / Math.tanh(4); }
    grit.curve = c;
    grit.connect(sfxBus);
    musicBus.connect(comp);
    comp.connect(master);
    master.connect(ac.destination);
    // 1s of white noise, reused by all noise voices
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    applySettings(settings);
  }
  if (ac.state === 'suspended') ac.resume();
}

export function applySettings(s) {
  settings.sfx = s.sfx;
  settings.music = s.music;
  if (!ac) return;
  sfxBus.gain.value = s.sfx ? 0.55 : 0;
  musicBus.gain.value = s.music ? 0.32 : 0;
}

export function suspendAudio() { if (ac && ac.state === 'running') ac.suspend(); }
export function resumeAudio() { if (ac && ac.state === 'suspended') ac.resume(); }

// ---------------------------------------------------------------------------
// Voices. The palette matches the music: dark, dry, acid, tuned to A
// phrygian. No melodies, no chiptune squares, no water: bodies are sine
// thuds, impacts are short noise crunches, rewards are surges (noise opening
// up over a swelling sub) landing on a crunch.
// ---------------------------------------------------------------------------
const on = (out) => ac && (settings.sfx || out !== sfxBus);

function tone(freq, dur, { type = 'sine', vol = 0.3, slide = 0, attack = 0.003, delay = 0, out = sfxBus } = {}) {
  if (!on(out)) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.3, freq = 2000, q = 1, type = 'lowpass', sweep = 0, delay = 0, attack = 0, out = sfxBus } = {}) {
  if (!on(out)) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); }
  else g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// Acid squelch: a saw through a resonant lowpass whose cutoff sweeps from
// `from` to `to`, optionally pitch-sliding, into the shared grit.
function squelch(freq, dur, { vol = 0.15, from = 2400, to = 200, q = 5, slide = 0, delay = 0, type = 'sawtooth', dirty = true } = {}) {
  if (!on(sfxBus)) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator();
  const f = ac.createBiquadFilter();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(dirty ? grit : sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Body: a sine that drops in pitch. Kicks, heartbeats, landings.
const thud = (from, to, dur, vol, delay = 0) => tone(from, dur, { vol, slide: to, attack: 0.002, delay });

// Surge: energy pulled into the body. Noise under a lowpass that opens from
// dark to bright, with a sub swelling under it. No synth, no melody.
function surge(dur, vol, { from = 180, to = 6000, sub = 45, delay = 0 } = {}) {
  noise(dur, { vol, freq: from, sweep: to, q: 1.2, attack: dur * 0.8, delay });
  tone(sub, dur, { vol: vol * 1.6, slide: sub * 2, attack: dur * 0.7, delay });
}

// Crunch: a short dense noise hit with a low body. The full stop after a surge.
function crunch(vol, { freq = 2600, body = 120, delay = 0 } = {}) {
  noise(0.06, { vol, freq, sweep: freq * 0.3, q: 0.9, delay });
  thud(body, body * 0.4, 0.08, vol * 1.3, delay);
}

// A phrygian, semitones from A3 (220 Hz).
const A = (semi) => 220 * Math.pow(2, semi / 12);

// Rate limiter so rapid-fire sounds do not stack into mush.
const lastPlay = {};
function limit(key, ms) {
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < ms) return false;
  lastPlay[key] = now;
  return true;
}

// Cells come in lines. Each is a percussive "chk" (a noise snap and a tiny
// sub tick), not a note: within a quick streak the snap gets brighter and
// tighter, so a whole line accelerates in brightness, no melody. The streak
// resets after a pause.
let cellN = 0, cellAt = 0;

export const sfx = {
  // Fired constantly: counted, and played in time by the music (see shotRate).
  shoot() { shotTimes.push(performance.now()); if (shotTimes.length > 64) shotTimes.shift(); },
  hit() { if (limit('hit', 40)) noise(0.03, { vol: 0.09, freq: 1800, type: 'highpass' }); },
  // A kill: a short acid snap down, a hard crunch and a thump.
  kill() {
    if (!limit('kill', 50)) return;
    squelch(A(-12), 0.16, { vol: 0.15, from: 3000, to: 150, q: 5, slide: A(-24) });
    noise(0.12, { vol: 0.22, freq: 2200, sweep: 300, q: 1 });
    thud(130, 42, 0.16, 0.3);
  },
  hurt() {
    thud(110, 30, 0.35, 0.5);
    squelch(A(-23), 0.35, { vol: 0.2, from: 900, to: 60, q: 4, slide: 40 });
    noise(0.3, { vol: 0.35, freq: 900, sweep: 80, q: 2 });
  },
  coin() {
    if (!limit('coin', 35)) return;
    const now = performance.now();
    cellN = now - cellAt < 600 ? Math.min(cellN + 1, 8) : 0;
    cellAt = now;
    const k = cellN / 8;
    noise(0.035 - 0.012 * k, { vol: 0.11, freq: 1500 + 3500 * k, type: 'bandpass', q: 1.4 });
    noise(0.012, { vol: 0.06, freq: 5000, type: 'highpass' });
    thud(150 + 40 * k, 60, 0.03, 0.12);
  },
  jump() { noise(0.16, { vol: 0.12, freq: 350, sweep: 1600, type: 'bandpass', q: 1.5, attack: 0.03 }); tone(110, 0.14, { vol: 0.12, slide: 220 }); },
  land() { thud(95, 40, 0.1, 0.22); noise(0.07, { vol: 0.1, freq: 500 }); },
  lane() { if (limit('lane', 40)) noise(0.06, { vol: 0.06, freq: 900, sweep: 2200, type: 'bandpass', q: 1.2 }); },
  // Phase: the body goes ghostly: a dark beating pair sinking, air rushing out.
  phase() {
    tone(A(0), 0.25, { vol: 0.11, slide: A(-12), type: 'triangle' });
    tone(A(1), 0.25, { vol: 0.09, slide: A(-11), type: 'triangle' });
    noise(0.28, { vol: 0.1, freq: 6000, sweep: 500, type: 'bandpass', q: 1.5 });
  },
  enemyShot() { if (limit('eshot', 60)) { squelch(A(-17), 0.08, { vol: 0.06, from: 1400, to: 200, q: 4, slide: A(-24) }); noise(0.04, { vol: 0.04, freq: 800 }); } },
  // Warning ping: a tritone, clear and wrong.
  telegraph() { if (limit('tele', 120)) { tone(A(24), 0.07, { vol: 0.045 }); tone(A(30), 0.07, { vol: 0.035 }); } },
  // Taking an item: a surge into a crunch.
  pickup() { surge(0.28, 0.13); crunch(0.14, { delay: 0.27 }); },
  // Heart: a heartbeat, lub-dub.
  heart() { thud(75, 40, 0.14, 0.45); thud(70, 38, 0.12, 0.32, 0.17); },
  select() { noise(0.02, { vol: 0.07, freq: 3000, type: 'bandpass', q: 1.5 }); thud(140, 80, 0.03, 0.1); },
  deny() { squelch(A(-24), 0.09, { vol: 0.14, from: 500, to: 120, q: 3, type: 'square' }); squelch(A(-24), 0.09, { vol: 0.12, from: 500, to: 120, q: 3, type: 'square', delay: 0.11 }); },
  buy() { surge(0.18, 0.11, { to: 4500 }); crunch(0.13, { delay: 0.17 }); },
  // Synergy: a longer surge, then three crunches on a 16th grid, each harder.
  synergy() {
    surge(0.4, 0.14, { to: 7000, sub: 40 });
    [0, 1, 2].forEach((i) => crunch(0.1 + 0.04 * i, { freq: 2000 + 900 * i, body: 110 - 15 * i, delay: 0.39 + i * 0.09 }));
  },
  unlock() {
    surge(0.7, 0.15, { to: 8000, sub: 35 });
    crunch(0.18, { freq: 3000, body: 90, delay: 0.68 });
    tone(A(-24), 0.9, { vol: 0.16, attack: 0.05, delay: 0.68 });
  },
  bossWarn() {
    for (let i = 0; i < 3; i++) {
      squelch(A(-12), 0.38, { vol: 0.14, from: 300, to: 2500, q: 5, slide: A(0), delay: i * 0.5 });
      squelch(A(-11), 0.38, { vol: 0.1, from: 300, to: 2500, q: 5, slide: A(1), delay: i * 0.5 });
    }
  },
  bossDie() {
    thud(120, 25, 1.0, 0.55);
    squelch(A(-12), 1.2, { vol: 0.2, from: 4000, to: 60, q: 5, slide: A(-36) });
    noise(1.4, { vol: 0.45, freq: 2500, sweep: 60 });
  },
  // Rail: a dry heavy hit. A sharp crack on top, a deep sub drop under it.
  rail() {
    if (!limit('rail', 70)) return;
    noise(0.04, { vol: 0.22, freq: 3500, type: 'highpass' });
    noise(0.07, { vol: 0.16, freq: 1800, sweep: 600, q: 0.8 });
    thud(170, 34, 0.24, 0.42);
  },
  // The beam's rail surges: the same, as a low pulse only (they repeat).
  railPulse() { if (limit('railp', 120)) { thud(120, 40, 0.16, 0.22); noise(0.03, { vol: 0.06, freq: 3000, type: 'highpass' }); } },
  dive() { squelch(A(0), 0.5, { vol: 0.13, from: 2500, to: 150, q: 5, slide: A(-24) }); },
  explode() { if (limit('boom', 60)) { noise(0.3, { vol: 0.28, freq: 1000, sweep: 70 }); thud(100, 35, 0.2, 0.3); } },
  arc() { if (limit('arc', 60)) { noise(0.03, { vol: 0.08, freq: 5000, type: 'highpass' }); noise(0.03, { vol: 0.06, freq: 4000, type: 'highpass', delay: 0.035 }); } },
  emp() { noise(0.8, { vol: 0.45, freq: 250, sweep: 6000, type: 'bandpass', q: 2 }); thud(70, 28, 0.8, 0.5); },
  // Shield: a hard membrane flexing.
  shield() { tone(A(-12), 0.18, { vol: 0.2, slide: A(0), type: 'triangle' }); noise(0.05, { vol: 0.1, freq: 3000, type: 'highpass' }); },
  death() {
    thud(140, 22, 1.2, 0.5);
    squelch(A(-5), 1.1, { vol: 0.2, from: 3000, to: 50, q: 5, slide: A(-36) });
    noise(1.2, { vol: 0.5, freq: 2500, sweep: 50 });
  },
};

export { tone, noise };
