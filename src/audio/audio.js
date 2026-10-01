// Web Audio bootstrap + procedural SFX. No audio files.
// iOS only allows audio after a user gesture: call unlockAudio() on first tap.
let ac = null;
let master, sfxBus, musicBus, noiseBuf;
const settings = { sfx: true, music: true };

export function audioCtx() { return ac; }
export function musicOut() { return musicBus; }

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
// Voices
// ---------------------------------------------------------------------------
function tone(freq, dur, { type = 'square', vol = 0.3, slide = 0, attack = 0.003, delay = 0, out = sfxBus } = {}) {
  if (!ac || !settings.sfx && out === sfxBus) return;
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

function noise(dur, { vol = 0.3, freq = 2000, q = 1, type = 'lowpass', sweep = 0, delay = 0, out = sfxBus } = {}) {
  if (!ac || !settings.sfx && out === sfxBus) return;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource();
  src.buffer = noiseBuf;
  const f = ac.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

// Rate limiter so rapid-fire sounds do not stack into mush.
const lastPlay = {};
function limit(key, ms) {
  const now = performance.now();
  if (lastPlay[key] && now - lastPlay[key] < ms) return false;
  lastPlay[key] = now;
  return true;
}

export const sfx = {
  shoot() { if (limit('shoot', 90)) tone(880, 0.05, { type: 'square', vol: 0.04, slide: 440 }); },
  hit() { if (limit('hit', 40)) noise(0.05, { vol: 0.12, freq: 3000, type: 'highpass' }); },
  kill() {
    if (!limit('kill', 50)) return;
    noise(0.25, { vol: 0.35, freq: 1800, sweep: 120 });
    tone(220, 0.18, { type: 'sawtooth', vol: 0.12, slide: 55 });
  },
  hurt() {
    noise(0.35, { vol: 0.5, freq: 900, sweep: 80, q: 4 });
    tone(140, 0.3, { type: 'sawtooth', vol: 0.3, slide: 40 });
  },
  coin() { if (limit('coin', 45)) { tone(1320, 0.06, { type: 'square', vol: 0.08 }); tone(1760, 0.08, { type: 'square', vol: 0.08, delay: 0.04 }); } },
  jump() { tone(300, 0.14, { type: 'triangle', vol: 0.18, slide: 700 }); },
  land() { noise(0.08, { vol: 0.15, freq: 400 }); },
  lane() { if (limit('lane', 40)) tone(520, 0.04, { type: 'triangle', vol: 0.08, slide: 380 }); },
  phase() { tone(1200, 0.25, { type: 'sine', vol: 0.2, slide: 200 }); noise(0.2, { vol: 0.1, freq: 6000, type: 'highpass' }); },
  telegraph() { if (limit('tele', 120)) tone(1480, 0.07, { type: 'square', vol: 0.05 }); },
  pickup() { [660, 880, 1320].forEach((f, i) => tone(f, 0.1, { type: 'square', vol: 0.12, delay: i * 0.06 })); },
  heart() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.2, delay: i * 0.05 })); },
  select() { tone(740, 0.08, { type: 'square', vol: 0.12 }); tone(1110, 0.1, { type: 'square', vol: 0.1, delay: 0.05 }); },
  deny() { tone(160, 0.15, { type: 'square', vol: 0.15, slide: 110 }); },
  buy() { [880, 1175, 1760].forEach((f, i) => tone(f, 0.09, { type: 'square', vol: 0.12, delay: i * 0.05 })); },
  synergy() { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'sawtooth', vol: 0.12, delay: i * 0.07 })); },
  unlock() { [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.25, { type: 'triangle', vol: 0.2, delay: i * 0.1 })); },
  bossWarn() {
    for (let i = 0; i < 3; i++) {
      tone(440, 0.35, { type: 'sawtooth', vol: 0.18, slide: 880, delay: i * 0.5 });
    }
  },
  bossDie() {
    noise(1.4, { vol: 0.6, freq: 2500, sweep: 60 });
    tone(110, 1.2, { type: 'sawtooth', vol: 0.3, slide: 30 });
  },
  rail() { noise(0.25, { vol: 0.3, freq: 5000, sweep: 300, type: 'bandpass', q: 2 }); tone(1800, 0.2, { type: 'sawtooth', vol: 0.12, slide: 200 }); },
  dive() { tone(900, 0.5, { type: 'sawtooth', vol: 0.15, slide: 120 }); },
  explode() { if (limit('boom', 60)) noise(0.3, { vol: 0.3, freq: 1200, sweep: 90 }); },
  arc() { if (limit('arc', 60)) tone(2400, 0.06, { type: 'sawtooth', vol: 0.06, slide: 900 }); },
  emp() { noise(0.8, { vol: 0.5, freq: 300, sweep: 8000, type: 'bandpass', q: 3 }); tone(60, 0.8, { type: 'sine', vol: 0.5, slide: 30 }); },
  shield() { tone(900, 0.2, { type: 'sine', vol: 0.25, slide: 1800 }); },
  death() {
    noise(1.2, { vol: 0.6, freq: 3000, sweep: 50 });
    tone(330, 1.0, { type: 'sawtooth', vol: 0.3, slide: 40 });
  },
};

export { tone, noise };
