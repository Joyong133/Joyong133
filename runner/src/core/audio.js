// Procedural audio: synthesized sound effects, a small generative chiptune
// sequencer with a different song for every world, and ambient beds.
import { rng } from './rng.js';

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],
  phryg: [0, 1, 4, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

const SONGS = {
  lobby: { bpm: 112, root: 60, scale: 'major', prog: [0, 5, 3, 4], lead: 'triangle', drums: 0.6, arp: 0.5, pad: 1 },
  meadow: { bpm: 136, root: 60, scale: 'major', prog: [0, 5, 3, 4], lead: 'square', drums: 1, arp: 0.6, pad: 0.6 },
  candy: { bpm: 150, root: 65, scale: 'major', prog: [0, 3, 4, 0], lead: 'square', drums: 1, arp: 0.8, pad: 0.5 },
  wonder: { bpm: 126, root: 62, scale: 'dorian', prog: [0, 3, 6, 4], lead: 'triangle', drums: 0.8, arp: 0.9, swing: 0.12, pad: 0.8 },
  beanstalk: { bpm: 142, root: 67, scale: 'lydian', prog: [0, 4, 5, 3], lead: 'square', drums: 1, arp: 0.6, pad: 0.8 },
  sea: { bpm: 104, root: 57, scale: 'minor', prog: [0, 5, 3, 4], lead: 'sine', drums: 0.5, arp: 1, pad: 1.2 },
  snow: { bpm: 120, root: 64, scale: 'minor', prog: [0, 3, 5, 4], lead: 'triangle', drums: 0.7, arp: 1, bell: true, pad: 1 },
  oz: { bpm: 140, root: 58, scale: 'major', prog: [0, 3, 0, 4], lead: 'square', drums: 1, arp: 0.6, pad: 0.5 },
  clock: { bpm: 156, root: 60, scale: 'harm', prog: [0, 5, 3, 4], lead: 'square', drums: 1, arp: 0.8, tick: true, pad: 0.6 },
  desert: { bpm: 128, root: 62, scale: 'phryg', prog: [0, 1, 0, 6], lead: 'sawtooth', drums: 0.9, arp: 0.7, pad: 0.7 },
  volcano: { bpm: 168, root: 52, scale: 'minor', prog: [0, 5, 6, 4], lead: 'sawtooth', drums: 1.2, arp: 0.7, pad: 0.6 },
  win: { bpm: 140, root: 60, scale: 'major', prog: [0, 3, 4, 0], lead: 'square', drums: 0.9, arp: 0.8, pad: 0.8 },
};

// Ambient beds: looped filtered noise with a slow sweep, plus occasional
// one-shot details (birdsong, bubbles, lava crackle, crickets).
const AMBIENTS = {
  birds: { type: 'bandpass', freq: 700, q: 0.4, vol: 0.05, lfo: 0.07 },
  breeze: { type: 'bandpass', freq: 650, q: 0.5, vol: 0.04, lfo: 0.09 },
  high: { type: 'bandpass', freq: 1000, q: 1.2, vol: 0.06, lfo: 0.12, depth: 500 },
  wind: { type: 'bandpass', freq: 800, q: 1.4, vol: 0.07, lfo: 0.11, depth: 450 },
  water: { type: 'lowpass', freq: 420, q: 0.8, vol: 0.1, lfo: 0.15, depth: 150 },
  lava: { type: 'lowpass', freq: 170, q: 0.9, vol: 0.16, lfo: 0.2, depth: 60 },
  night: { type: 'lowpass', freq: 380, q: 0.6, vol: 0.035, lfo: 0.05 },
};
const THEME_AMBIENT = { meadow: 'birds', candy: 'breeze', wonder: 'breeze', beanstalk: 'high', sea: 'water', snow: 'wind', oz: 'birds', clock: 'night', desert: 'wind', volcano: 'lava' };

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.sfxOn = true;
    this.song = null;
    this.timer = null;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 3;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.55 : 0;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = this.musicOn ? 0.2 : 0;
    this.musicBus.connect(this.master);
    this.ambBus = ctx.createGain();
    this.ambBus.gain.value = this.sfxOn ? 1 : 0;
    this.ambBus.connect(this.master);
    // shared white noise
    const len = ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // simple echo for the music
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.27;
    const fb = ctx.createGain();
    fb.gain.value = 0.22;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    this.echo = ctx.createGain();
    this.echo.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.musicBus);
    if (this.pending) {
      const p = this.pending;
      this.pending = null;
      this.music(p);
    }
    if (this.pendingAmb) {
      const a = this.pendingAmb;
      this.pendingAmb = null;
      this.ambient(a);
    }
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.1);
  }
  setSfx(on) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
    if (this.ambBus) this.ambBus.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.2);
  }

  // ---------- primitives ----------
  tone(freq, dur, { type = 'square', vol = 0.2, attack = 0.005, slide = 0, when = 0, bus, decay } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (decay ?? dur));
    o.connect(g).connect(bus || this.sfxBus);
    o.start(t);
    o.stop(t + (decay ?? dur) + 0.05);
  }

  noise(dur, { vol = 0.2, freq = 1200, q = 1, type = 'bandpass', slide = 0, when = 0, bus, attack = 0.003 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f).connect(g).connect(bus || this.sfxBus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // soft detuned-saw chord with a slow filter swell
  pad(freqs, dur, { when = 0, vol = 0.03, bus, cutoff = 1200 } = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.6;
    f.frequency.setValueAtTime(cutoff * 0.5, t);
    f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.35, dur * 0.25));
    g.gain.setValueAtTime(vol, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.08);
    f.connect(g).connect(bus || this.musicBus);
    for (const fr of freqs) {
      for (const det of [-8, 8]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur * 1.1);
      }
    }
  }

  kick(when, v, bus) {
    this.tone(165, 0.16, { type: 'sine', slide: 42, vol: 0.55 * v, when, bus });
    this.noise(0.012, { freq: 3500, type: 'highpass', vol: 0.1 * v, when, bus });
  }

  snare(when, v, bus) {
    this.noise(0.16, { freq: 2100, q: 0.6, vol: 0.16 * v, when, bus });
    this.tone(210, 0.08, { type: 'triangle', slide: 150, vol: 0.13 * v, when, bus });
  }

  hat(when, v, bus, open = false) {
    this.noise(open ? 0.15 : 0.03, { freq: 8500, type: 'highpass', vol: (open ? 0.045 : 0.05) * v, when, bus });
  }

  sfx(name, vol = 1) {
    if (!this.ctx || !this.sfxOn) return;
    const v = vol;
    switch (name) {
      case 'jump':
        this.tone(330, 0.14, { slide: 720, vol: 0.12 * v });
        break;
      case 'djump':
        this.tone(520, 0.16, { type: 'triangle', slide: 1250, vol: 0.18 * v });
        this.tone(1568, 0.1, { type: 'sine', vol: 0.08 * v, when: 0.06 });
        break;
      case 'land':
        this.noise(0.09, { freq: 500, type: 'lowpass', vol: 0.18 * v });
        break;
      case 'step':
        this.noise(0.05, { freq: 700 + Math.random() * 500, type: 'lowpass', vol: 0.07 * v });
        this.noise(0.015, { freq: 2500, q: 1, vol: 0.015 * v });
        break;
      case 'stepIce':
        this.noise(0.04, { freq: 4500 + Math.random() * 1500, q: 2, vol: 0.03 * v });
        break;
      case 'stepSoft':
        this.noise(0.08, { freq: 500, type: 'lowpass', vol: 0.06 * v, attack: 0.01 });
        break;
      case 'dash':
        this.noise(0.5, { freq: 500, slide: 3000, q: 2, vol: 0.22 * v });
        this.tone(220, 0.35, { type: 'sawtooth', slide: 660, vol: 0.06 * v });
        break;
      case 'boost':
        this.noise(0.35, { freq: 800, slide: 2600, q: 3, vol: 0.18 * v });
        this.tone(440, 0.25, { type: 'triangle', slide: 880, vol: 0.08 * v });
        break;
      case 'spring':
        this.tone(160, 0.4, { type: 'sine', slide: 900, vol: 0.25 * v });
        this.tone(320, 0.3, { type: 'triangle', slide: 1500, vol: 0.08 * v, when: 0.05 });
        break;
      case 'boing':
        this.tone(220, 0.18, { type: 'sine', slide: 520, vol: 0.14 * v });
        break;
      case 'star':
        this.tone(1318, 0.08, { type: 'square', vol: 0.06 * v });
        this.tone(1976, 0.14, { type: 'square', vol: 0.06 * v, when: 0.06 });
        break;
      case 'item':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.1, { type: 'square', vol: 0.07 * v, when: i * 0.05 }));
        break;
      case 'itemUse':
        this.noise(0.3, { freq: 2000, slide: 400, q: 1.5, vol: 0.15 * v });
        this.tone(880, 0.2, { type: 'triangle', slide: 1760, vol: 0.08 * v });
        break;
      case 'hit':
        this.noise(0.18, { freq: 900, q: 0.8, vol: 0.25 * v });
        this.tone(300, 0.28, { type: 'square', slide: 70, vol: 0.12 * v });
        break;
      case 'bump':
        this.tone(220, 0.12, { type: 'triangle', slide: 140, vol: 0.16 * v });
        break;
      case 'fall':
        this.tone(900, 0.8, { type: 'sine', slide: 140, vol: 0.14 * v });
        break;
      case 'respawn':
        [784, 988, 1318].forEach((f, i) => this.tone(f, 0.12, { type: 'triangle', vol: 0.09 * v, when: i * 0.06 }));
        break;
      case 'count':
        this.tone(660, 0.18, { type: 'square', vol: 0.12 * v });
        break;
      case 'go':
        this.tone(1320, 0.5, { type: 'square', vol: 0.12 * v });
        this.tone(990, 0.5, { type: 'square', vol: 0.06 * v });
        break;
      case 'startDash':
        this.noise(0.6, { freq: 600, slide: 4000, q: 3, vol: 0.2 * v });
        [784, 1046, 1318].forEach((f, i) => this.tone(f, 0.12, { type: 'square', vol: 0.07 * v, when: i * 0.05 }));
        break;
      case 'lap':
        [784, 988, 1175].forEach((f, i) => this.tone(f, 0.16, { type: 'square', vol: 0.08 * v, when: i * 0.08 }));
        break;
      case 'finalLap':
        [659, 784, 988, 1318, 988, 1318].forEach((f, i) => this.tone(f, 0.14, { type: 'square', vol: 0.09 * v, when: i * 0.09 }));
        this.noise(0.8, { freq: 1500, q: 0.5, vol: 0.06 * v, when: 0.2, attack: 0.2 });
        break;
      case 'cheer':
        this.noise(1.6, { freq: 1800, q: 0.4, vol: 0.12 * v, attack: 0.25 });
        this.noise(1.2, { freq: 900, q: 0.6, vol: 0.08 * v, attack: 0.3, when: 0.1 });
        break;
      case 'pop':
        // firework: soft thump, then a crackle tail
        this.noise(0.35, { freq: 220, type: 'lowpass', vol: 0.22 * v });
        for (let i = 0; i < 6; i++) this.noise(0.05, { freq: 3000 + Math.random() * 3000, q: 3, vol: 0.05 * v, when: 0.12 + Math.random() * 0.45 });
        break;
      case 'applause':
        for (let i = 0; i < 46; i++) this.noise(0.05, { freq: 1300 + Math.random() * 1600, q: 1.2, vol: (0.03 + Math.random() * 0.03) * v, when: Math.random() * 2.6 * Math.sqrt(Math.random()) });
        break;
      case 'checkpoint':
        this.tone(880, 0.16, { type: 'sine', vol: 0.15 * v });
        this.tone(1320, 0.3, { type: 'sine', vol: 0.15 * v, when: 0.1 });
        break;
      case 'finish':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, i === 5 ? 0.6 : 0.14, { type: 'square', vol: 0.09 * v, when: i * 0.11 }));
        [262, 330, 392].forEach((f) => this.tone(f, 0.9, { type: 'triangle', vol: 0.08 * v, when: 0.55 }));
        break;
      case 'lose':
        [523, 494, 466, 440].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.1 * v, when: i * 0.2 }));
        break;
      case 'click':
        this.tone(1200, 0.04, { type: 'square', vol: 0.05 * v });
        break;
      case 'select':
        this.tone(660, 0.07, { type: 'square', vol: 0.06 * v });
        this.tone(990, 0.1, { type: 'square', vol: 0.06 * v, when: 0.05 });
        break;
      case 'doorBreak':
        this.noise(0.35, { freq: 700, q: 0.6, vol: 0.3 * v });
        this.tone(120, 0.3, { type: 'triangle', slide: 60, vol: 0.2 * v });
        break;
      case 'doorFake':
        this.tone(140, 0.2, { type: 'square', slide: 90, vol: 0.14 * v });
        this.noise(0.12, { freq: 300, type: 'lowpass', vol: 0.2 * v });
        break;
      case 'zap':
        this.noise(0.4, { freq: 3000, q: 4, vol: 0.2 * v });
        this.tone(1200, 0.3, { type: 'sawtooth', slide: 200, vol: 0.06 * v });
        break;
      case 'freeze':
        [2093, 2637, 3136].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', vol: 0.06 * v, when: i * 0.05 }));
        break;
      case 'shield':
        this.tone(660, 0.4, { type: 'sine', slide: 1320, vol: 0.1 * v });
        break;
      case 'shieldPop':
        this.noise(0.15, { freq: 2500, q: 2, vol: 0.18 * v });
        break;
      case 'honey':
        this.tone(160, 0.25, { type: 'sine', slide: 90, vol: 0.18 * v });
        break;
      case 'boom':
        this.noise(0.6, { freq: 300, type: 'lowpass', vol: 0.3 * v });
        this.tone(90, 0.5, { type: 'sine', slide: 40, vol: 0.25 * v });
        break;
      case 'slam':
        this.tone(80, 0.25, { type: 'sine', slide: 40, vol: 0.3 * v });
        this.noise(0.2, { freq: 400, type: 'lowpass', vol: 0.2 * v });
        break;
      default:
        break;
    }
  }

  // ---------- ambience ----------
  ambient(theme) {
    const kind = theme ? THEME_AMBIENT[theme] || null : null;
    if (!this.ctx) {
      this.pendingAmb = theme;
      return;
    }
    if ((this.amb?.kind ?? null) === kind) return;
    this.stopAmbient();
    const A = AMBIENTS[kind];
    if (!A) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = A.type;
    f.frequency.value = A.freq;
    f.Q.value = A.q;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = A.lfo;
    const depth = ctx.createGain();
    depth.gain.value = A.depth ?? A.freq * 0.3;
    lfo.connect(depth).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(A.vol, t + 1.5);
    src.connect(f).connect(g).connect(this.ambBus);
    src.start(t);
    lfo.start(t);
    this.amb = { kind, src, lfo, g, timer: setInterval(() => this.ambEvent(kind), 120) };
  }

  stopAmbient() {
    const a = this.amb;
    if (!a) return;
    clearInterval(a.timer);
    const t = this.ctx.currentTime;
    a.g.gain.setTargetAtTime(0, t, 0.3);
    a.src.stop(t + 1.6);
    a.lfo.stop(t + 1.6);
    this.amb = null;
  }

  ambEvent(kind) {
    if (!this.sfxOn || document.hidden) return;
    const r = Math.random();
    const bus = this.ambBus;
    if (kind === 'birds' && r < 0.03) {
      const base = 2400 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tone(base * (1 + Math.random() * 0.15), 0.07, { type: 'sine', slide: base * 1.35, vol: 0.022, when: i * 0.11, bus });
    } else if (kind === 'water' && r < 0.07) {
      const f0 = 250 + Math.random() * 350;
      this.tone(f0, 0.08, { type: 'sine', slide: f0 * 2.6, vol: 0.03, bus });
    } else if (kind === 'lava') {
      if (r < 0.14) this.noise(0.02 + Math.random() * 0.03, { freq: 2500 + Math.random() * 3000, q: 2, vol: 0.025 + Math.random() * 0.03, bus });
      if (r < 0.008) this.noise(1.4, { freq: 110, type: 'lowpass', vol: 0.14, bus, attack: 0.4 });
    } else if (kind === 'night' && r < 0.04) {
      for (let i = 0; i < 4; i++) this.tone(4700, 0.03, { type: 'sine', vol: 0.01, when: i * 0.06, bus });
    } else if ((kind === 'wind' || kind === 'high') && r < 0.012) {
      this.noise(2.5, { freq: 500, slide: 1400, q: 2, vol: 0.05, bus, attack: 1 });
    }
  }

  // ---------- music ----------
  music(id) {
    if (!this.ctx) {
      this.pending = id;
      return;
    }
    if (this.song && this.song.id === id) return;
    this.stopMusic();
    const S = SONGS[id] || SONGS.meadow;
    const r = rng(id.length * 131 + id.charCodeAt(0) * 7);
    const scale = SCALES[S.scale];
    // melody: two 4-bar phrases of 8th notes (scale degrees, null = rest)
    const rhythms = [
      [1, 0, 1, 1, 0, 1, 1, 0],
      [1, 1, 0, 1, 1, 0, 1, 1],
      [1, 0, 0, 1, 1, 1, 0, 1],
      [1, 1, 1, 0, 1, 0, 1, 0],
    ];
    const phrase = () => {
      const bars = [];
      let deg = 7 + Math.floor(r() * 3);
      for (let b = 0; b < 4; b++) {
        const rh = rhythms[Math.floor(r() * rhythms.length)];
        const chord = S.prog[b];
        const notes = rh.map((on, i) => {
          if (!on) return null;
          if (i === 0) {
            // land on a chord tone on the downbeat
            const tones = [chord, chord + 2, chord + 4].map((d) => d + 7);
            deg = tones.reduce((a, c) => (Math.abs(c - deg) < Math.abs(a - deg) ? c : a), tones[0]);
          } else {
            deg += Math.floor(r() * 5) - 2;
            deg = Math.max(5, Math.min(14, deg));
          }
          return deg;
        });
        bars.push(notes);
      }
      return bars;
    };
    const A = phrase();
    const B = phrase();
    B[3] = A[3];
    this.song = { id, S, scale, melody: [...A, ...B], step: 0, next: this.ctx.currentTime + 0.1 };
    const tick = () => this.schedule();
    this.timer = setInterval(tick, 25);
    tick();
  }

  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  }

  note(deg, octave = 0) {
    const sc = this.song.scale;
    const o = Math.floor(deg / 7);
    const d = ((deg % 7) + 7) % 7;
    return midi(this.song.S.root + sc[d] + 12 * (o + octave));
  }

  schedule() {
    const song = this.song;
    if (!song || !this.ctx) return;
    const ctx = this.ctx;
    const S = song.S;
    const s16 = 60 / S.bpm / 4;
    while (song.next < ctx.currentTime + 0.15) {
      const st = song.step;
      const bar = Math.floor(st / 16) % 8;
      const pos = st % 16;
      const when = song.next - ctx.currentTime + (pos % 2 === 1 ? (S.swing || 0) * s16 : 0);
      const chord = S.prog[bar % 4];
      const bus = this.musicBus;
      // melody on 8ths (second phrase gets a soft harmony a third below)
      if (pos % 2 === 0) {
        const n = song.melody[bar][pos / 2];
        if (n !== null && n !== undefined) {
          const f = this.note(n);
          const len = s16 * 1.8;
          this.tone(f, len, { type: S.lead, vol: S.lead === 'sawtooth' ? 0.07 : S.lead === 'sine' ? 0.2 : 0.11, bus, decay: len, when });
          this.tone(f, len, { type: 'triangle', vol: 0.04, bus: this.echo, decay: len, when });
          if (bar >= 4) this.tone(this.note(n - 2), len, { type: 'triangle', vol: 0.06, bus, decay: len, when });
          if (S.bell) this.tone(f * 2, s16 * 3, { type: 'sine', vol: 0.05, bus, decay: s16 * 3, when });
        }
      }
      // pad: one chord per bar
      if (S.pad && pos === 0) {
        const fr = [chord, chord + 2, chord + 4].map((d) => this.note(d, -1));
        this.pad(fr, s16 * 16, { when, vol: 0.018 * S.pad, bus });
      }
      // bass
      if (pos === 0 || pos === 8 || (pos === 14 && S.drums > 0.9)) {
        const f = this.note(chord, -2);
        this.tone(pos === 14 ? f * 2 : f, s16 * 3.5, { type: 'triangle', vol: 0.3, bus, decay: s16 * 3.5, when });
      } else if ((pos === 4 || pos === 12) && S.drums >= 1) {
        this.tone(this.note(chord, -1), s16 * 1.5, { type: 'triangle', vol: 0.18, bus, decay: s16 * 1.5, when });
      }
      // arpeggio
      if (S.arp && pos % 2 === 1) {
        const tones = [chord, chord + 2, chord + 4, chord + 7];
        const f = this.note(tones[(pos >> 1) % 4], 0);
        this.tone(f, s16 * 1.2, { type: 'sine', vol: 0.05 * S.arp, bus: this.echo, decay: s16 * 1.2, when });
      }
      // drums, with a snare fill closing every 8 bars and a crash on the loop
      const dv = S.drums;
      if (dv > 0) {
        const fill = bar === 7 && pos >= 12;
        if (pos === 0 || pos === 8 || (dv > 1 && pos === 10)) this.kick(when, Math.min(1, dv), bus);
        if (fill) this.snare(when, dv * (0.5 + (pos - 12) * 0.17), bus);
        else if (pos === 4 || pos === 12) this.snare(when, dv, bus);
        if (!fill && pos % 2 === 0) this.hat(when, S.tick ? dv * 1.6 : dv, bus);
        if (dv >= 1 && (pos === 6 || pos === 14) && !fill) this.hat(when, dv, bus, true);
        if (st === 0) this.noise(1.3, { freq: 6000, type: 'highpass', vol: 0.05 * dv, bus, when });
      }
      song.next += s16;
      song.step = (st + 1) % (16 * 8);
    }
  }
}
