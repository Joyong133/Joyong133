// Procedural audio: synthesized sound effects and a small generative
// chiptune sequencer with a different song for every world.
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
  lobby: { bpm: 112, root: 60, scale: 'major', prog: [0, 5, 3, 4], lead: 'triangle', drums: 0.6, arp: 0.5 },
  meadow: { bpm: 136, root: 60, scale: 'major', prog: [0, 5, 3, 4], lead: 'square', drums: 1, arp: 0.6 },
  candy: { bpm: 150, root: 65, scale: 'major', prog: [0, 3, 4, 0], lead: 'square', drums: 1, arp: 0.8 },
  wonder: { bpm: 126, root: 62, scale: 'dorian', prog: [0, 3, 6, 4], lead: 'triangle', drums: 0.8, arp: 0.9, swing: 0.12 },
  beanstalk: { bpm: 142, root: 67, scale: 'lydian', prog: [0, 4, 5, 3], lead: 'square', drums: 1, arp: 0.6 },
  sea: { bpm: 104, root: 57, scale: 'minor', prog: [0, 5, 3, 4], lead: 'sine', drums: 0.5, arp: 1 },
  snow: { bpm: 120, root: 64, scale: 'minor', prog: [0, 3, 5, 4], lead: 'triangle', drums: 0.7, arp: 1, bell: true },
  oz: { bpm: 140, root: 58, scale: 'major', prog: [0, 3, 0, 4], lead: 'square', drums: 1, arp: 0.6 },
  clock: { bpm: 156, root: 60, scale: 'harm', prog: [0, 5, 3, 4], lead: 'square', drums: 1, arp: 0.8, tick: true },
  desert: { bpm: 128, root: 62, scale: 'phryg', prog: [0, 1, 0, 6], lead: 'sawtooth', drums: 0.9, arp: 0.7 },
  volcano: { bpm: 168, root: 52, scale: 'minor', prog: [0, 5, 6, 4], lead: 'sawtooth', drums: 1.2, arp: 0.7 },
  win: { bpm: 140, root: 60, scale: 'major', prog: [0, 3, 4, 0], lead: 'square', drums: 0.9, arp: 0.8 },
};

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
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.2 : 0, this.ctx.currentTime, 0.1);
  }
  setSfx(on) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(on ? 0.55 : 0, this.ctx.currentTime, 0.05);
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
        this.noise(0.04, { freq: 900, type: 'lowpass', vol: 0.05 * v });
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
      // melody on 8ths
      if (pos % 2 === 0) {
        const n = song.melody[bar][pos / 2];
        if (n !== null && n !== undefined) {
          const f = this.note(n);
          const len = s16 * 1.8;
          this.tone(f, len, { type: S.lead, vol: S.lead === 'sawtooth' ? 0.07 : S.lead === 'sine' ? 0.2 : 0.11, bus, decay: len });
          this.tone(f, len, { type: 'triangle', vol: 0.04, bus: this.echo, decay: len });
          if (S.bell) this.tone(f * 2, s16 * 3, { type: 'sine', vol: 0.05, bus, decay: s16 * 3 });
        }
      }
      // bass
      if (pos === 0 || pos === 8 || (pos === 14 && S.drums > 0.9)) {
        const f = this.note(chord, -2);
        this.tone(pos === 14 ? f * 2 : f, s16 * 3.5, { type: 'triangle', vol: 0.3, bus, decay: s16 * 3.5 });
      } else if ((pos === 4 || pos === 12) && S.drums >= 1) {
        this.tone(this.note(chord, -1), s16 * 1.5, { type: 'triangle', vol: 0.18, bus, decay: s16 * 1.5 });
      }
      // arpeggio
      if (S.arp && pos % 2 === 1) {
        const tones = [chord, chord + 2, chord + 4, chord + 7];
        const f = this.note(tones[(pos >> 1) % 4], 0);
        this.tone(f, s16 * 1.2, { type: 'sine', vol: 0.05 * S.arp, bus: this.echo, decay: s16 * 1.2 });
      }
      // drums
      const dv = S.drums;
      if (dv > 0) {
        if (pos === 0 || pos === 8 || (dv > 1 && pos === 10)) this.tone(150, 0.12, { type: 'sine', slide: 45, vol: 0.5 * Math.min(1, dv), bus });
        if (pos === 4 || pos === 12) this.noise(0.12, { freq: 1800, q: 0.7, vol: 0.16 * dv, bus });
        if (pos % 2 === 0) this.noise(0.03, { freq: 8000, type: 'highpass', vol: (S.tick ? 0.09 : 0.05) * dv, bus });
      }
      song.next += s16;
      song.step = (st + 1) % (16 * 8);
    }
  }
}
