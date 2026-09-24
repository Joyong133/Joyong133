// Fully procedural audio: every sound effect is synthesized into an
// AudioBuffer at startup, and the music is a small generative sequencer.
import * as THREE from 'three';

const TAU = Math.PI * 2;

function rnd(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
}

// Chamberlin state-variable filter
class SVF {
  constructor() { this.low = 0; this.band = 0; }
  run(x, cutoff, q, sr) {
    const f = 2 * Math.sin((Math.PI * Math.min(cutoff, sr * 0.2)) / sr);
    this.low += f * this.band;
    const high = x - this.low - q * this.band;
    this.band += f * high;
    return { low: this.low, band: this.band, high };
  }
}

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.zone = 'town';
    this.buffers = {};
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.sr = ctx.sampleRate;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 1;
    this.sfx.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.5;
    this.amb.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.4);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.28;
    this.reverb.connect(this.revGain).connect(this.master);
    this.sfx.connect(this.reverb);
    this.musicBus.connect(this.reverb);
    this._synthAll();
    this._startAmbience();
    this._startMusic();
  }

  _impulse(sec) {
    const n = Math.floor(this.sr * sec);
    const b = this.ctx.createBuffer(2, n, this.sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      const r = rnd(7 + c);
      for (let i = 0; i < n; i++) d[i] = r() * Math.pow(1 - i / n, 3.2);
    }
    return b;
  }

  _buf(sec, fn) {
    const n = Math.max(1, Math.floor(this.sr * sec));
    const b = this.ctx.createBuffer(1, n, this.sr);
    const d = b.getChannelData(0);
    fn(d, this.sr, n);
    // normalize softly
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
    if (peak > 0.95) for (let i = 0; i < n; i++) d[i] *= 0.95 / peak;
    return b;
  }

  _synthAll() {
    const B = this.buffers;
    const noiseSweep = (dur, f0, f1, f2, amp, q = 0.7, seed = 1) =>
      this._buf(dur, (d, sr, n) => {
        const r = rnd(seed);
        const f = new SVF();
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const cut = t < 0.5 ? f0 + (f1 - f0) * (t * 2) : f1 + (f2 - f1) * ((t - 0.5) * 2);
          const env = Math.pow(Math.sin(Math.PI * t), 1.6);
          d[i] = f.run(r(), cut, q, sr).band * env * amp;
        }
      });
    B.swing = [noiseSweep(0.3, 500, 2400, 700, 2.2, 0.6, 3), noiseSweep(0.26, 700, 2800, 900, 2.2, 0.5, 5), noiseSweep(0.34, 400, 2000, 600, 2.2, 0.7, 9)];
    B.hit = this._buf(0.45, (d, sr, n) => {
      const r = rnd(11);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fr = 60 + 120 * Math.exp(-t * 18);
        ph += (TAU * fr) / sr;
        let s = Math.sin(ph) * Math.exp(-t * 16) * 0.9;
        s += f.run(r(), 1800, 0.8, sr).low * Math.exp(-t * 35) * 0.8;
        for (const [hz, a] of [[1240, 0.16], [1873, 0.12], [2790, 0.09], [3960, 0.06]]) s += Math.sin(TAU * hz * t) * a * Math.exp(-t * 11);
        d[i] = s;
      }
    });
    B.crit = this._buf(0.9, (d, sr, n) => {
      const r = rnd(13);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const fr = 50 + 160 * Math.exp(-t * 14);
        ph += (TAU * fr) / sr;
        let s = Math.sin(ph) * Math.exp(-t * 10);
        s += f.run(r(), 3000, 0.6, sr).band * Math.exp(-t * 18) * 1.2;
        for (const [hz, a] of [[1567, 0.2], [2349, 0.16], [3135, 0.12], [4698, 0.08]]) s += Math.sin(TAU * hz * t + Math.sin(t * 40) * 0.3) * a * Math.exp(-t * 5);
        d[i] = s;
      }
    });
    B.shatter = this._buf(1.4, (d, sr, n) => {
      const r = rnd(17);
      const pings = [];
      for (let k = 0; k < 70; k++) pings.push([Math.abs(r()) * 0.55, 2200 + Math.abs(r()) * 5200, 0.05 + Math.abs(r()) * 0.1, 18 + Math.abs(r()) * 30]);
      const f = new SVF();
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let s = f.run(r(), 6000, 0.5, sr).high * Math.exp(-t * 6) * 0.5;
        s += Math.sin(TAU * 90 * t) * Math.exp(-t * 20) * 0.6;
        for (const [t0, hz, a, k] of pings) {
          if (t >= t0) s += Math.sin(TAU * hz * (t - t0)) * a * Math.exp(-(t - t0) * k);
        }
        d[i] = s;
      }
    });
    B.hurt = this._buf(0.45, (d, sr, n) => {
      const r = rnd(19);
      const f = new SVF();
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const saw = ((t * 85) % 1) * 2 - 1;
        let s = Math.tanh(saw * 3) * 0.5 * Math.exp(-t * 7);
        s += f.run(r(), 900, 0.7, sr).low * Math.exp(-t * 12) * 1.2;
        d[i] = s;
      }
    });
    const chime = (notes, spacing, decay, dur, bright = 0.3) =>
      this._buf(dur, (d, sr, n) => {
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          let s = 0;
          notes.forEach((hz, k) => {
            const t0 = k * spacing;
            if (t < t0) return;
            const tt = t - t0;
            const env = Math.min(1, tt * 200) * Math.exp(-tt * decay);
            s += (Math.sin(TAU * hz * tt) + Math.sin(TAU * hz * 2 * tt) * bright + Math.sin(TAU * hz * 3.01 * tt) * bright * 0.4) * env * 0.35;
          });
          d[i] = s;
        }
      });
    B.menuOpen = chime([1318.5, 1975.5], 0.065, 9, 0.5, 0.25);
    B.menuClose = chime([1975.5, 1318.5], 0.055, 11, 0.45, 0.25);
    B.click = chime([2349], 0, 40, 0.12, 0.1);
    B.select = chime([1760, 2637], 0.04, 14, 0.35, 0.2);
    B.coin = chime([2637, 3520], 0.07, 12, 0.5, 0.15);
    B.levelup = chime([523.3, 659.3, 784, 1046.5, 1318.5, 1568], 0.085, 2.6, 2.2, 0.35);
    B.quest = chime([392, 523.3, 659.3, 784, 1046.5], 0.11, 2.2, 2.0, 0.5);
    B.deny = this._buf(0.25, (d, sr, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        d[i] = (((t * 180) % 1) * 2 - 1) * 0.25 * Math.exp(-t * 10);
      }
    });
    B.potion = this._buf(0.9, (d, sr, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let s = 0;
        for (let k = 0; k < 5; k++) {
          const t0 = k * 0.08;
          if (t < t0) continue;
          const tt = t - t0;
          s += Math.sin(TAU * (500 + k * 140 + tt * 900) * tt) * Math.exp(-tt * 25) * 0.3;
        }
        s += Math.sin(TAU * 1568 * t) * Math.exp(-Math.abs(t - 0.45) * 12) * 0.2 + Math.sin(TAU * 2093 * t) * Math.exp(-Math.abs(t - 0.55) * 12) * 0.15;
        d[i] = s;
      }
    });
    B.teleport = this._buf(1.8, (d, sr, n) => {
      const r = rnd(23);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const u = t / 1.8;
        const env = Math.sin(Math.PI * u);
        const cut = 300 + 5000 * u * u;
        let s = f.run(r(), cut, 0.4, sr).band * env * 1.2;
        ph += (TAU * (220 + 660 * u * u)) / sr;
        s += Math.sin(ph) * env * 0.25 + Math.sin(ph * 1.5) * env * 0.15;
        d[i] = s;
      }
    });
    B.charge = this._buf(0.55, (d, sr, n) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const u = t / 0.55;
        ph += (TAU * (300 + 900 * u)) / sr;
        d[i] = Math.sin(ph) * (0.5 + 0.5 * Math.sin(TAU * 24 * t)) * Math.min(1, u * 4) * (1 - u * 0.3) * 0.35;
      }
    });
    B.skill = this._buf(0.8, (d, sr, n) => {
      const r = rnd(29);
      const f = new SVF();
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const u = t / 0.8;
        let s = f.run(r(), 800 + 5000 * Math.sin(Math.PI * Math.min(1, u * 1.5)), 0.4, sr).band * Math.sin(Math.PI * u) * 1.6;
        for (const hz of [880, 1318.5, 1760]) s += Math.sin(TAU * hz * t) * 0.12 * Math.exp(-t * 4);
        d[i] = s;
      }
    });
    B.grunt = this._buf(0.5, (d, sr, n) => {
      const r = rnd(31);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.sin(Math.PI * Math.min(1, t / 0.5)) * (0.6 + 0.4 * Math.sin(TAU * 22 * t));
        ph += (TAU * (95 + 30 * Math.sin(t * 9))) / sr;
        const saw = ((ph / TAU) % 1) * 2 - 1;
        d[i] = (f.run(saw + r() * 0.6, 700, 0.5, sr).low * 1.3) * env;
      }
    });
    B.growl = this._buf(0.9, (d, sr, n) => {
      const r = rnd(37);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.sin(Math.PI * t / 0.9) * (0.7 + 0.3 * Math.sin(TAU * 31 * t));
        ph += (TAU * (120 + 25 * Math.sin(t * 13))) / sr;
        const saw = ((ph / TAU) % 1) * 2 - 1;
        d[i] = f.run(saw * 0.8 + r() * 0.5, 1100, 0.3, sr).low * env * 1.2;
      }
    });
    B.roar = this._buf(1.8, (d, sr, n) => {
      const r = rnd(41);
      const f = new SVF();
      const ph = [0, 0, 0];
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const u = t / 1.8;
        const env = Math.pow(Math.sin(Math.PI * u), 0.6);
        let s = 0;
        [55, 58.7, 82.4].forEach((hz, k) => {
          ph[k] += (TAU * hz * (1 + 0.15 * Math.sin(t * 7 + k))) / sr;
          s += (((ph[k] / TAU) % 1) * 2 - 1) * 0.4;
        });
        d[i] = Math.tanh(f.run(s + r() * 0.7, 600 + 500 * env, 0.4, sr).low * 2.2) * env * 0.8;
      }
    });
    B.linkstart = this._buf(6.5, (d, sr, n) => {
      const r = rnd(43);
      const f = new SVF();
      const ph = [0, 0, 0, 0];
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const u = t / 6.5;
        const env = Math.min(1, t * 1.5) * (u < 0.92 ? 1 : (1 - u) / 0.08);
        let s = f.run(r(), 200 + 7000 * u * u, 0.35, sr).band * env * 0.9;
        [110, 165, 220, 330].forEach((hz, k) => {
          ph[k] += (TAU * hz * (1 + u * 2.5)) / sr;
          s += Math.sin(ph[k]) * 0.08 * env;
        });
        d[i] = s;
      }
    });
    B.death = chime([659.3, 523.3, 440, 329.6], 0.22, 1.8, 2.4, 0.2);
    B.fanfare = chime([523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5, 1568, 2093], 0.12, 1.6, 2.8, 0.45);
    B.chest = chime([784, 987.8, 1174.7, 1568], 0.06, 5, 1.1, 0.3);
    B.giggle = chime([1568, 1760, 1568, 1975.5, 1760], 0.07, 18, 0.6, 0.15);
    B.moo = this._buf(1.3, (d, sr, n) => {
      const r = rnd(71);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const u = t / 1.3;
        const env = Math.pow(Math.sin(Math.PI * u), 0.7);
        ph += (TAU * (110 + 35 * Math.sin(u * Math.PI) - 25 * u)) / sr;
        const saw = ((ph / TAU) % 1) * 2 - 1;
        d[i] = Math.tanh(f.run(saw + r() * 0.25, 500 + 700 * Math.sin(u * Math.PI), 0.25, sr).low * 2) * env * 0.8;
      }
    });
    B.buzz = this._buf(0.7, (d, sr, n) => {
      const r = rnd(73);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.sin(Math.PI * t / 0.7);
        ph += (TAU * (190 + 30 * Math.sin(t * 40))) / sr;
        const saw = ((ph / TAU) % 1) * 2 - 1;
        d[i] = f.run(saw + r() * 0.3, 2400, 0.3, sr).band * env * 1.1;
      }
    });
    B.slam = this._buf(1.2, (d, sr, n) => {
      const r = rnd(79);
      const f = new SVF();
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        ph += (TAU * (38 + 90 * Math.exp(-t * 9))) / sr;
        let s = Math.sin(ph) * Math.exp(-t * 3.5) * 1.1;
        s += f.run(r(), 700, 0.5, sr).low * Math.exp(-t * 4) * 1.6;
        d[i] = Math.tanh(s * 1.4);
      }
    });
    B.anvil = this._buf(0.8, (d, sr, n) => {
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        let s = 0;
        for (const [hz, a, k] of [[1320, 0.3, 7], [2210, 0.22, 9], [3380, 0.16, 12], [4870, 0.1, 16], [640, 0.2, 10]]) s += Math.sin(TAU * hz * t) * a * Math.exp(-t * k);
        d[i] = s * Math.min(1, t * 3000);
      }
    });
    B.splash = this._buf(0.6, (d, sr, n) => {
      const r = rnd(83);
      const f = new SVF();
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        d[i] = f.run(r(), 1400 + 2500 * Math.exp(-t * 8), 0.6, sr).band * Math.exp(-t * 7) * 1.6;
      }
    });
    B.reel = this._buf(0.12, (d, sr, n) => {
      const r = rnd(89);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const tick = (t * 90) % 1 < 0.08 ? 1 : 0;
        d[i] = r() * tick * 0.5 * (1 - t / 0.12);
      }
    });
    B.bubble = this._buf(0.5, (d, sr, n) => {
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const k = Math.floor(t / 0.08);
        const tt = t - k * 0.08;
        ph += (TAU * (500 + k * 120 + tt * 4000)) / sr;
        d[i] = Math.sin(ph) * Math.exp(-tt * 40) * 0.35;
      }
    });
    B.gate = this._buf(3.0, (d, sr, n) => {
      const r = rnd(97);
      const f = new SVF();
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const u = t / 3;
        const clank = Math.max(0, Math.sin(t * 14)) ** 12;
        d[i] = (f.run(r(), 300, 0.4, sr).low * 1.4 + r() * clank * 0.15) * Math.sin(Math.PI * u);
      }
    });
    B.bird = [0, 1, 2].map((k) =>
      this._buf(0.5, (d, sr, n) => {
        const r = rnd(50 + k);
        const base = 2800 + Math.abs(r()) * 1800;
        const chirps = 2 + Math.floor(Math.abs(r()) * 4);
        let ph = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const c = Math.floor(t / 0.09);
          const tt = t - c * 0.09;
          if (c >= chirps) { d[i] = 0; continue; }
          ph += (TAU * (base + 1400 * Math.sin(tt * 55))) / sr;
          d[i] = Math.sin(ph) * Math.sin(Math.PI * Math.min(1, tt / 0.07)) * 0.18;
        }
      })
    );
  }

  play(name, { vol = 1, rate = 1, pos = null, variant = -1 } = {}) {
    if (!this.ctx) return;
    let buf = this.buffers[name];
    if (!buf) return;
    if (Array.isArray(buf)) buf = variant >= 0 ? buf[variant % buf.length] : buf[Math.floor(Math.random() * buf.length)];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 2;
      p.rolloffFactor = 1.1;
      p.maxDistance = 80;
      if (p.positionX) {
        p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p).connect(this.sfx);
    } else {
      g.connect(this.sfx);
    }
    src.start();
    return src;
  }

  updateListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    camera.getWorldPosition(p);
    camera.getWorldQuaternion(q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.02);
      l.positionY.setTargetAtTime(p.y, t, 0.02);
      l.positionZ.setTargetAtTime(p.z, t, 0.02);
      l.forwardX.setTargetAtTime(f.x, t, 0.02);
      l.forwardY.setTargetAtTime(f.y, t, 0.02);
      l.forwardZ.setTargetAtTime(f.z, t, 0.02);
      l.upX.setTargetAtTime(u.x, t, 0.02);
      l.upY.setTargetAtTime(u.y, t, 0.02);
      l.upZ.setTargetAtTime(u.z, t, 0.02);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  }

  // ---------------------------------------------------------------- ambience
  _startAmbience() {
    const ctx = this.ctx;
    const n = this.sr * 4;
    const b = ctx.createBuffer(1, n, this.sr);
    const d = b.getChannelData(0);
    const r = rnd(99);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += (r() - lp) * 0.02;
      d[i] = lp * 3;
    }
    // crossfade the loop seam
    for (let i = 0; i < 2000; i++) {
      const k = i / 2000;
      d[i] = d[i] * k + d[n - 2000 + i] * (1 - k);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.18;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.08;
    lfo.connect(lfoG).connect(this.windGain.gain);
    lfo.start();
    src.connect(this.windGain).connect(this.amb);
    src.start();
    this._birdTimer = setInterval(() => {
      if (!this.ctx || this.ctx.state !== 'running') return;
      if (this.zone === 'dungeon') {
        // water drips in the labyrinth
        if (Math.random() < 0.5 && this.listenerPos) {
          const a = Math.random() * TAU;
          this.play('click', { vol: 0.25, rate: 0.35 + Math.random() * 0.2, pos: this.listenerPos.clone().add(new THREE.Vector3(Math.sin(a) * 8, 3, Math.cos(a) * 8)) });
        }
        return;
      }
      if (Math.random() < (this.zone === 'field' ? 0.55 : 0.3)) {
        const a = Math.random() * TAU;
        const pos = this.listenerPos ? this.listenerPos.clone().add(new THREE.Vector3(Math.sin(a) * 15, 6, Math.cos(a) * 15)) : null;
        this.play('bird', { vol: 0.5, rate: 0.9 + Math.random() * 0.3, pos });
      }
    }, 2200);
  }

  // fountain / portal loops at fixed world positions
  addLoop(kind, pos) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const n = this.sr * 3;
    const b = ctx.createBuffer(1, n, this.sr);
    const d = b.getChannelData(0);
    const r = rnd(kind === 'water' ? 61 : 67);
    const f = new SVF();
    for (let i = 0; i < n; i++) {
      const t = i / this.sr;
      if (kind === 'water') d[i] = f.run(r(), 1800 + 900 * Math.sin(t * 3.1), 0.9, this.sr).band * 0.9;
      else d[i] = (Math.sin(TAU * 110 * t) * 0.4 + Math.sin(TAU * 165 * t) * 0.25 + Math.sin(TAU * 220.5 * t) * 0.15) * (0.7 + 0.3 * Math.sin(TAU * 0.667 * t)) * 0.5;
    }
    for (let i = 0; i < 3000; i++) {
      const k = i / 3000;
      d[i] = d[i] * k + d[n - 3000 + i] * (1 - k);
    }
    const src = ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = kind === 'water' ? 3 : 4;
    p.rolloffFactor = 1.4;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    const g = ctx.createGain();
    const vol = kind === 'water' ? 0.35 : 0.3;
    g.gain.value = vol;
    src.connect(g).connect(p).connect(this.amb);
    src.start();
    const handle = { g, vol, set: (on) => g.gain.setTargetAtTime(on ? vol : 0, ctx.currentTime, 0.3) };
    return handle;
  }

  setZone(zone) {
    if (zone === this.zone) return;
    this.zone = zone;
    if (this.windGain) this.windGain.gain.setTargetAtTime(zone === 'field' ? 0.3 : zone === 'dungeon' ? 0.07 : 0.14, this.ctx.currentTime, 1.5);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.4);
  }

  // ---------------------------------------------------------------- music
  _startMusic() {
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.3;
    this.melodyIdx = 4;
    this.curTheme = this.zone;
    this._musicTimer = setInterval(() => this._schedule(), 60);
  }

  _theme() {
    if (this.curTheme === 'dungeon') {
      return {
        bpm: 70,
        // Em - C - Am - B (dark, sparse)
        chords: [[52, 55, 59], [48, 52, 55], [45, 48, 52], [47, 51, 54]],
        bass: [28, 24, 33, 35],
        scale: [52, 54, 55, 57, 59, 60, 63, 64, 66],
        drums: false,
        sparse: true,
      };
    }
    if (this.curTheme === 'town2') {
      return {
        bpm: 96,
        // F - Dm - Bb - C (bright, pastoral)
        chords: [[65, 69, 72, 77], [62, 65, 69, 74], [58, 62, 65, 72], [60, 64, 67, 74]],
        bass: [41, 38, 34, 36],
        scale: [65, 67, 69, 70, 72, 74, 76, 77, 79, 81],
        drums: false,
      };
    }
    if (this.curTheme === 'field2') {
      return {
        bpm: 112,
        // G - Em - C - D
        chords: [[67, 71, 74], [64, 67, 71], [60, 64, 67], [62, 66, 69]],
        bass: [43, 40, 36, 38],
        scale: [67, 69, 71, 72, 74, 76, 78, 79, 81, 83],
        drums: true,
      };
    }
    if (this.curTheme === 'game') {
      return {
        bpm: 138,
        // C - G - Am - F (upbeat mini-game)
        chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]],
        bass: [36, 31, 33, 29],
        scale: [60, 62, 64, 67, 69, 72, 74, 76, 79],
        drums: true,
      };
    }
    if (this.curTheme === 'field') {
      return {
        bpm: 104,
        // Dm - Bb - C - Am
        chords: [[62, 65, 69], [58, 62, 65], [60, 64, 67], [57, 60, 64]],
        bass: [38, 34, 36, 33],
        scale: [62, 64, 65, 67, 69, 70, 72, 74, 76, 77],
        drums: true,
      };
    }
    if (this.curTheme === 'boss') {
      return {
        bpm: 128,
        chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]],
        bass: [33, 29, 31, 28],
        scale: [57, 59, 60, 62, 64, 65, 68, 69, 71, 72],
        drums: true,
        intense: true,
      };
    }
    return {
      bpm: 82,
      // D - Bm - G - A (with added 9ths in the arpeggio)
      chords: [[62, 66, 69, 76], [59, 62, 66, 73], [55, 59, 62, 69], [57, 61, 64, 71]],
      bass: [38, 35, 31, 33],
      scale: [62, 64, 66, 69, 71, 74, 76, 78, 81],
      drums: false,
    };
  }

  _schedule() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ahead = this.ctx.currentTime + 0.25;
    while (this.nextTime < ahead) {
      if (this.step % 8 === 0 && this.zoneQueued) {
        this.curTheme = this.zoneQueued;
        this.zoneQueued = null;
        this.step = 0;
      }
      const th = this._theme();
      const eighth = 60 / th.bpm / 2;
      const s = this.step % 64; // 4 bars of 8 eighths x 2
      const bar = Math.floor(s / 8) % 4;
      const beat = s % 8;
      const chord = th.chords[bar];
      const t = this.nextTime;
      if (beat === 0) {
        this._pad(chord, t, eighth * 8, th.intense ? 0.05 : 0.07);
        this._bass(th.bass[bar], t, eighth * 3.5);
      }
      if (beat === 4) this._bass(th.bass[bar] + (th.drums ? 0 : 7), t, eighth * 3);
      // harp arpeggio
      const arp = chord[(beat * (th.drums ? 1 : 2)) % chord.length] + (beat >= 4 ? 12 : 0);
      if (!th.sparse || beat % 2 === 0) this._pluck(arp, t, th.drums ? 0.05 : th.sparse ? 0.045 : 0.06);
      // melody: random walk on the scale with phrasing
      const phrasePos = s % 16;
      if (phrasePos < 12 && Math.random() < (beat % 2 === 0 ? (th.sparse ? 0.35 : 0.7) : th.sparse ? 0.08 : 0.25)) {
        this.melodyIdx = Math.max(0, Math.min(th.scale.length - 1, this.melodyIdx + Math.round((Math.random() - 0.5) * 3.2)));
        if (beat === 0) {
          // land on a chord tone at bar starts
          let best = this.melodyIdx, bd = 99;
          th.scale.forEach((nn, i) => {
            const d = Math.min(...chord.map((c) => Math.abs(((nn - c) % 12 + 12) % 12)));
            if (d === 0 && Math.abs(i - this.melodyIdx) < bd) { bd = Math.abs(i - this.melodyIdx); best = i; }
          });
          this.melodyIdx = best;
        }
        const len = beat % 2 === 0 && Math.random() < 0.5 ? eighth * 2 : eighth;
        this._lead(th.scale[this.melodyIdx] + 12, t, len * 1.6, th.intense ? 0.06 : 0.07);
      }
      if (th.drums) {
        if (beat === 0 || beat === 4 || (th.intense && beat === 6)) this._kick(t);
        if (beat === 2 || beat === 6) this._snare(t, th.intense ? 0.12 : 0.07);
        this._hat(t, beat % 2 ? 0.02 : 0.035);
      }
      this.nextTime += eighth;
      this.step++;
    }
  }

  // short melody played over the music (the bard's song, fanfares)
  jingle(notes, step = 0.2, vol = 0.09) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + 0.05;
    notes.forEach((n, i) => {
      if (n === null) return;
      this._lead(n, t0 + i * step, step * 1.6, vol);
      if (i % 2 === 0) this._pluck(n - 12, t0 + i * step, vol * 0.8);
    });
  }

  setTheme(theme) {
    this.zoneQueued = theme === this.curTheme ? null : theme;
  }

  _hz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  _env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _pad(chord, t, dur, vol) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
    g.gain.setValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.1);
    lp.connect(g).connect(this.musicBus);
    for (const n of chord.slice(0, 3)) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = this._hz(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(t);
        o.stop(t + dur * 1.15);
      }
    }
  }

  _bass(n, t, dur) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = this._hz(n);
    const g = this.ctx.createGain();
    this._env(g, t, 0.02, dur, 0.22);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.1);
  }

  _pluck(n, t, vol) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = this._hz(n);
    const o2 = this.ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = this._hz(n) * 2;
    const g = this.ctx.createGain();
    this._env(g, t, 0.005, 1.1, vol);
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(this.musicBus);
    o.start(t); o2.start(t);
    o.stop(t + 1.3); o2.stop(t + 1.3);
  }

  _lead(n, t, dur, vol) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = this._hz(n);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.2;
    const vg = ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg).connect(o.detune);
    const o3 = ctx.createOscillator();
    o3.type = 'triangle';
    o3.frequency.value = this._hz(n);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol * 0.8, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.15);
    const g3 = ctx.createGain();
    g3.gain.value = 0.35;
    o.connect(g);
    o3.connect(g3).connect(g);
    g.connect(this.musicBus);
    for (const x of [o, o3, vib]) { x.start(t); x.stop(t + dur + 0.2); }
  }

  _kick(t) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, 0.22, 0.45);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.3);
  }

  _noiseBuf() {
    if (this._nb) return this._nb;
    const n = this.sr * 0.5;
    const b = this.ctx.createBuffer(1, n, this.sr);
    const d = b.getChannelData(0);
    const r = rnd(5);
    for (let i = 0; i < n; i++) d[i] = r();
    this._nb = b;
    return b;
  }

  _snare(t, vol) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    const g = this.ctx.createGain();
    this._env(g, t, 0.003, 0.16, vol);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t);
    s.stop(t + 0.25);
  }

  _hat(t, vol) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf();
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    this._env(g, t, 0.002, 0.05, vol);
    s.connect(f).connect(g).connect(this.musicBus);
    s.start(t, Math.random() * 0.3);
    s.stop(t + 0.08);
  }
}
