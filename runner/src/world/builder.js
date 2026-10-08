// Course builder: map scripts call segment methods (straight, curve, ramp,
// gap, obstacles…) and the builder lays them out along a centreline,
// producing visuals, colliders, the AI path and checkpoints.
import * as THREE from 'three';
import { World, box, cyl } from './physics.js';
import { GeoBuilder, ribbon, boxQuads, toon, part, merge, vcolMaterial } from './geom.js';
import { texture, animatedTexture } from './textures.js';
import { rng, clamp, lerp, rightX, rightZ } from '../core/rng.js';
import * as OB from './obstacles.js';

const DEG = Math.PI / 180;

function arcAt(x0, z0, h0, L, dh, l) {
  if (Math.abs(dh) < 1e-6) return { x: x0 + Math.sin(h0) * l, z: z0 + Math.cos(h0) * l, h: h0 };
  const R = L / dh;
  const h = h0 + l / R;
  return { x: x0 + R * (Math.cos(h0) - Math.cos(h)), z: z0 + R * (Math.sin(h) - Math.sin(h0)), h };
}

const SURFACE_MAT = { normal: 'floor', ice: 'ice', sand: 'sand', conveyor: 'conveyor', bouncy: 'jelly' };

export class CourseBuilder {
  constructor(theme, seed = 1) {
    this.theme = theme;
    this.r = rng(seed);
    this.world = new World();
    this.group = new THREE.Group();
    this.cur = { x: 0, y: 0, z: 0, h: 0 };
    this.s = 0;
    this.W = 10;
    this.rails = theme.rails ?? true;
    this.thick = theme.thick ?? 1.4;
    this.path = [];
    this.run = null;
    this.runs = [];
    this.gaps = [];
    this.hints = [];
    this.sections = [];
    this.checkpoints = [];
    this.hazards = [];
    this.dynamics = [];
    this.triggers = [];
    this.stars = [];
    this.itemBoxes = [];
    this.avoid = [];
    this.buckets = new Map();
    this.animTex = [];
    this.grid = [];
    this.goalS = 0;
    this.mats = this.makeMaterials();
    this.ctx = { group: this.group, mats: this.mats, world: this.world, course: this, r: this.r };
    // remember which segment covers which stretch (debugging / tests)
    this.segs = [];
    const SEGS = ['straight', 'curve', 'ramp', 'curveRamp', 'ice', 'sand', 'jelly', 'conveyor', 'gap', 'jumpPad', 'stairs', 'stones', 'movers', 'discs', 'tiles', 'spinBars', 'hammers', 'pushers', 'rollers', 'crushers', 'bumpers', 'doors', 'wind', 'meteors'];
    for (const name of SEGS) {
      const fn = this[name].bind(this);
      this[name] = (...args) => {
        const s0 = this.s;
        const res = fn(...args);
        this.segs.push({ name, s0, s1: this.s });
        return res;
      };
    }
  }

  segAt(s) {
    let best = null;
    for (const g of this.segs) if (s >= g.s0 - 0.5 && s <= g.s1 + 0.5 && (!best || g.s1 - g.s0 < best.s1 - best.s0)) best = g;
    return best ? best.name : '?';
  }

  makeMaterials() {
    const t = this.theme;
    const conveyor = animatedTexture('conveyor');
    const boost = animatedTexture('boost');
    this.animTex.push({ tex: conveyor, v: 0.6 }, { tex: boost, v: -1.5 });
    const m = {
      floor: toon({ map: texture(t.floor) }),
      side: toon({ map: texture(t.side) }),
      plat: toon({ map: texture(t.plat || t.floor) }),
      platSide: toon({ map: texture(t.platSide || t.side) }),
      rail: toon({ color: t.rail ?? 0xffffff }),
      ice: toon({ map: texture('ice') }),
      sand: toon({ map: texture('sand'), color: 0xe8c890 }),
      conveyor: toon({ map: conveyor }),
      jelly: toon({ map: texture('jelly'), color: t.jelly ?? 0xffffff, emissive: 0x113322 }),
      boost: new THREE.MeshBasicMaterial({ map: boost, transparent: true, opacity: 0.95 }),
      hazard: toon({ color: t.hazard?.[0] ?? 0xe0533d }),
      hazard2: toon({ color: t.hazard?.[1] ?? 0xffffff }),
      metal: toon({ color: t.metal ?? 0x8a93a6 }),
      accent: toon({ color: t.accent ?? 0xffc93c }),
      glow: new THREE.MeshBasicMaterial({ color: t.glow ?? 0xfff3a0 }),
      itembox: toon({ map: texture('itembox'), emissive: 0x332255 }),
      finish: toon({ map: texture('finish') }),
      vcol: vcolMaterial(),
      warn: new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.5, depthWrite: false }),
    };
    return m;
  }

  bucket(key) {
    if (!this.buckets.has(key)) this.buckets.set(key, new GeoBuilder());
    return this.buckets.get(key);
  }

  // ---------------- path helpers ----------------
  _pushSamples(samples, extra = {}) {
    for (const s of samples) {
      const last = this.path[this.path.length - 1];
      if (last && Math.abs(last.s - s.s) < 1e-4) {
        // keep the more restrictive flags at joins
        if (extra.gap === false && last.gap) Object.assign(last, extra);
        continue;
      }
      this.path.push({ x: s.x, y: s.y, z: s.z, h: s.h, w: s.w, s: s.s, gap: false, kind: 'floor', aiOff: null, ...extra });
    }
  }

  _sampleArc(len, dh, dy, w0, w1, step = 1.5) {
    const { x, y, z, h } = this.cur;
    const n = Math.max(1, Math.ceil(len / step));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = arcAt(x, z, h, len, dh, len * t);
      out.push({ x: p.x, y: y + dy * t, z: p.z, h: p.h, w: lerp(w0, w1, t), s: this.s + len * t });
    }
    return out;
  }

  _advance(len, dh, dy) {
    const p = arcAt(this.cur.x, this.cur.z, this.cur.h, len, dh, len);
    this.cur = { x: p.x, y: this.cur.y + dy, z: p.z, h: p.h };
    this.s += len;
    this.minY = Math.min(this.minY ?? 0, this.cur.y);
    this.maxY = Math.max(this.maxY ?? 0, this.cur.y);
  }

  // Interpolated centreline at distance s.
  pointAt(s, out = {}) {
    const P = this.path;
    if (s <= P[0].s) return Object.assign(out, P[0], { s });
    const last = P[P.length - 1];
    if (s >= last.s) return Object.assign(out, last, { s });
    let lo = 0;
    let hi = P.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (P[mid].s <= s) lo = mid;
      else hi = mid;
    }
    const a = P[lo];
    const b = P[hi];
    const t = (s - a.s) / (b.s - a.s || 1);
    out.x = lerp(a.x, b.x, t);
    out.y = lerp(a.y, b.y, t);
    out.z = lerp(a.z, b.z, t);
    out.h = a.h + (((b.h - a.h + Math.PI) % (Math.PI * 2)) - Math.PI) * t;
    out.w = lerp(a.w, b.w, t);
    out.s = s;
    out.gap = a.gap && b.gap;
    out.kind = a.kind;
    out.aiOff = a.aiOff;
    out.i = lo;
    return out;
  }

  // ---------------- floors ----------------
  _floor(len, dh, dy, o = {}) {
    const w0 = o.w ?? this.W;
    const w1 = o.w1 ?? w0;
    const surface = o.surface || 'normal';
    const samples = this._sampleArc(len, dh, dy, w0, w1);
    const s0 = this.s;
    this._pushSamples(samples, { surface, aiOff: o.aiOff ?? null });

    // visuals: continue the current ribbon run when compatible
    const matKey = o.mat || SURFACE_MAT[surface] || 'floor';
    const run = this.run;
    if (run && run.mat === matKey && Math.abs(run.samples[run.samples.length - 1].s - s0) < 1e-4 && run.samples[run.samples.length - 1].w === w0 && run.thick === (o.thick ?? this.thick)) {
      run.samples.push(...samples.slice(1));
    } else {
      this.run = { mat: matKey, samples: samples.slice(), thick: o.thick ?? this.thick, side: o.side || 'side' };
      this.runs.push(this.run);
    }

    // colliders
    const curved = Math.abs(dh) > 1e-6;
    const R = curved ? len / dh : Infinity;
    const pieces = curved ? Math.max(Math.ceil(Math.abs(dh) / (8 * DEG)), Math.ceil(len / 4)) : w0 !== w1 ? Math.ceil(len / 3) : 1;
    const slope = dy / len;
    const thick = o.thick ?? this.thick;
    const rails = o.rails ?? this.rails;
    for (let p = 0; p < pieces; p++) {
      const lm = ((p + 0.5) / pieces) * len;
      const pl = len / pieces;
      const c = arcAt(this.cur.x, this.cur.z, this.cur.h, len, dh, lm);
      const w = lerp(w0, w1, lm / len);
      const hz = curved ? (pl / 2) * (1 + w / 2 / Math.abs(R)) + 0.05 : pl / 2 + 0.02;
      const ym = this.cur.y + dy * (lm / len);
      const col = box({
        x: c.x,
        z: c.z,
        yaw: c.h,
        hx: w / 2,
        hz,
        top0: ym - slope * hz,
        top1: ym + slope * hz,
        thick,
        surface,
        conv: o.conv || 0,
      });
      this.world.addStatic(col);
      if (rails) {
        for (const side of [-1, 1]) {
          const off = (w / 2 + 0.16) * side;
          this.world.addStatic(
            box({
              x: c.x + rightX(c.h) * off,
              z: c.z + rightZ(c.h) * off,
              yaw: c.h,
              hx: 0.16,
              hz,
              top0: ym - slope * hz + 1.0,
              top1: ym + slope * hz + 1.0,
              bot: Math.min(ym - slope * hz, ym + slope * hz) - thick,
              floor: false,
            })
          );
        }
      }
    }
    if (rails) {
      for (const side of [-1, 1]) {
        const rs = samples.map((s) => ({ ...s, y: s.y + 1.0, w: 0.32 }));
        const g = this.bucket('rail');
        ribbon(rs, g, g, { thick: 1.0 + thick, ox: (side * (w0 + w1)) / 4 + 0.16 * side, caps: true, tile: 2 });
      }
    }
    this._advance(len, dh, dy);
    this._extras(s0, this.s, o);
    return samples;
  }

  // Stars, item boxes, boost pads and checkpoints placed over [s0, s1].
  _extras(s0, s1, o) {
    const len = s1 - s0;
    if (o.cp) this._checkpointAt(s0 + 1);
    if (o.stars) {
      const n = Math.floor((len - 6) / 2.6);
      for (let i = 0; i < n; i++) {
        const s = s0 + 3 + i * 2.6;
        const p = this.pointAt(s);
        let lat = 0;
        const k = i / Math.max(1, n - 1);
        if (o.stars === 'wave') lat = Math.sin(k * Math.PI * 2) * p.w * 0.28;
        else if (o.stars === 'left') lat = -p.w * 0.3;
        else if (o.stars === 'right') lat = p.w * 0.3;
        else if (o.stars === 'zig') lat = (Math.floor(i / 3) % 2 ? 1 : -1) * p.w * 0.25;
        this._star(p, lat);
      }
    }
    if (o.items) {
      const p = this.pointAt(s0 + len * (o.itemsAt ?? 0.5));
      const n = p.w >= 8 ? 4 : p.w >= 5 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const lat = (i - (n - 1) / 2) * Math.min(2.4, (p.w - 1.5) / n);
        this.itemBoxes.push({
          x: p.x + rightX(p.h) * lat,
          y: p.y + 1.1,
          z: p.z + rightZ(p.h) * lat,
          s: p.s,
          lat,
        });
      }
    }
    if (o.boost) {
      const at = o.boost === true ? [0.5] : o.boost;
      for (const f of at) this._boostPad(s0 + len * f, o.boostLat ?? 0, o.boostW);
    }
  }

  _star(p, lat) {
    this.stars.push({ x: p.x + rightX(p.h) * lat, y: p.y + 1.0, z: p.z + rightZ(p.h) * lat, s: p.s, lat });
  }

  _boostPad(s, lat = 0, w) {
    const p = this.pointAt(s);
    const pw = w ?? Math.min(4, p.w - 1);
    const x = p.x + rightX(p.h) * lat;
    const z = p.z + rightZ(p.h) * lat;
    const pad = box({ x, z, yaw: p.h, hx: pw / 2, hz: 1.6, top: p.y + 0.03, thick: 0.02 });
    boxQuads(pad, this.bucket('boost'), null, 3.2);
    this.triggers.push({ kind: 'boost', col: pad, y: p.y, h: p.h, s });
  }

  // ---------------- public segments ----------------
  setWidth(w) {
    this.W = w;
    return this;
  }

  straight(len, o = {}) {
    return this._floor(len, 0, 0, o);
  }

  // deg > 0 turns right
  curve(deg, r = 16, o = {}) {
    const len = Math.abs(deg * DEG) * r;
    return this._floor(len, -deg * DEG, 0, o);
  }

  ramp(len, rise, o = {}) {
    return this._floor(len, 0, rise, o);
  }

  curveRamp(deg, r, rise, o = {}) {
    const len = Math.abs(deg * DEG) * r;
    return this._floor(len, -deg * DEG, rise, o);
  }

  ice(len, o = {}) {
    return this._floor(len, 0, 0, { ...o, surface: 'ice' });
  }

  sand(len, o = {}) {
    return this._floor(len, 0, 0, { ...o, surface: 'sand' });
  }

  jelly(len, o = {}) {
    return this._floor(len, 0, 0, { ...o, surface: 'bouncy' });
  }

  conveyor(len, speed = -4, o = {}) {
    const samples = this._floor(len, 0, 0, { ...o, surface: 'conveyor', conv: speed });
    this.animTex[0].v = -speed / 4; // texture tile is 4 m, so the stripes move with the belt
    return samples;
  }

  gap(len, o = {}) {
    const dy = o.dy || 0;
    const s0 = this.s;
    const samples = this._sampleArc(len, 0, dy, this.W, this.W);
    this._pushSamples(samples.slice(1, -1), { gap: true, kind: 'gap' });
    this.gaps.push({ s0, s1: s0 + len, dy, y0: this.cur.y, y1: this.cur.y + dy });
    this.run = null;
    this._advance(len, 0, dy);
    this._warnEdge(samples[0]);
    return this;
  }

  // Yellow/black warning strip at a jump edge.
  _warnEdge(p) {
    const c = box({ x: p.x - Math.sin(p.h) * 0.4, z: p.z - Math.cos(p.h) * 0.4, yaw: p.h, hx: p.w / 2, hz: 0.4, top: p.y + 0.015, thick: 0.01 });
    boxQuads(c, this.bucket('accent'), null, 4);
  }

  jumpPad(gapLen, o = {}) {
    const dy = o.dy || 0;
    const p = this.pointAt(this.s - 1.6);
    const vy = o.power ?? 15;
    const g = 32 * (this.theme.gravity ?? 1);
    // time until we come back down to the landing height (dy relative to here)
    const tAir = (vy + Math.sqrt(Math.max(g, vy * vy - 2 * g * dy))) / g;
    const speed = (gapLen + 5) / tAir;
    const pad = box({ x: p.x, z: p.z, yaw: p.h, hx: p.w / 2 - 0.3, hz: 1.4, top: p.y + 0.05, thick: 0.05 });
    this.world.addStatic(pad);
    OB.jumpPadVisual(this.ctx, p, p.w - 0.6);
    this.triggers.push({ kind: 'jump', col: pad, y: p.y, h: p.h, vy, speed, s: p.s });
    this.hints.push({ s: p.s, type: 'pad' });
    this.gap(gapLen, { dy });
    this.gaps[this.gaps.length - 1].pad = true;
    return this;
  }

  stairs(n, rise, run = 2, o = {}) {
    const w = o.w ?? this.W;
    for (let i = 0; i < n; i++) {
      const top = this.cur.y + rise;
      const p = arcAt(this.cur.x, this.cur.z, this.cur.h, run, 0, run / 2);
      const c = box({ x: p.x, z: p.z, yaw: this.cur.h, hx: w / 2, hz: run / 2 + 0.01, top, thick: rise + this.thick });
      this.world.addStatic(c);
      boxQuads(c, this.bucket('floor'), this.bucket('side'));
      const samples = this._sampleArc(run, 0, 0, w, w);
      samples.forEach((s) => (s.y = top));
      this._pushSamples(samples, { kind: 'stairs' });
      if (rise > 0.42) this.hints.push({ s: this.s, type: 'jump' });
      this._advance(run, 0, rise);
    }
    this.run = null;
    return this;
  }

  checkpoint() {
    this._checkpointAt(this.s);
    return this;
  }

  _checkpointAt(s) {
    const p = this.pointAt(s);
    this.checkpoints.push({ idx: this.checkpoints.length, s, x: p.x, y: p.y, z: p.z, h: p.h, w: p.w });
    OB.archVisual(this.ctx, p, p.w, this.theme.cpColor ?? 0x46c4ff, 'cp');
  }

  start() {
    const W = this.W;
    this.straight(18, { rails: true });
    const p0 = this.pointAt(0);
    this.startS = 12;
    this.checkpoints.push({ idx: 0, s: 6, x: p0.x, y: p0.y, z: p0.z, h: p0.h, w: W });
    // 2 rows x 4 grid
    this.grid = [];
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 4; col++) {
        const s = 10 - row * 3;
        const p = this.pointAt(s);
        const lat = (col - 1.5) * (W / 4.3);
        this.grid.push({ x: p.x + rightX(p.h) * lat, y: p.y, z: p.z + rightZ(p.h) * lat, h: p.h, s });
      }
    }
    OB.archVisual(this.ctx, this.pointAt(12), W, 0xff6a3d, 'start');
    return this;
  }

  goal() {
    this.straight(10);
    this.goalS = this.s;
    OB.archVisual(this.ctx, this.pointAt(this.s), this.W, 0xffd23f, 'goal');
    const line = box({ x: this.cur.x, z: this.cur.z, yaw: this.cur.h, hx: this.W / 2, hz: 0.7, top: this.cur.y + 0.02, thick: 0.01 });
    boxQuads(line, this.bucket('finish'), null, this.W / 4);
    this.straight(30, { rails: true });
    // end wall so nobody runs off the far end
    const p = this.cur;
    const wall = box({ x: p.x, z: p.z, yaw: p.h, hx: this.W / 2 + 0.4, hz: 0.5, top: p.y + 3, thick: 3 + this.thick });
    this.world.addStatic(wall);
    boxQuads(wall, this.bucket('rail'), null);
    return this;
  }

  // ---------- platform sections ----------
  _sectionStart(kind) {
    // a checkpoint right before a platform section, unless one is close behind
    const last = this.checkpoints[this.checkpoints.length - 1];
    if (!last || this.s - last.s > 40) this._checkpointAt(this.s - 3);
    this.run = null;
    const sec = { kind, s0: this.s, steps: [] };
    this.sections.push(sec);
    return sec;
  }

  _sectionPath(len, kind, w) {
    const samples = this._sampleArc(len, 0, 0, w ?? this.W, w ?? this.W);
    this._pushSamples(samples.slice(1, -1), { gap: true, kind });
    this._advance(len, 0, 0);
  }

  stones(n, o = {}) {
    const size = o.size ?? 3;
    const gap = o.gap ?? 2.6;
    const amp = o.amp ?? 2.5;
    const sec = this._sectionStart('steps');
    const base = { ...this.cur };
    let y = base.y;
    for (let i = 0; i < n; i++) {
      const along = gap + size / 2 + i * (size + gap);
      let lat = 0;
      if (o.pattern === 'random') lat = this.r.range(-amp, amp);
      else if (o.pattern === 'line') lat = 0;
      else lat = (i % 2 ? 1 : -1) * amp;
      y += o.rise ?? 0;
      const p = arcAt(base.x, base.z, base.h, 1, 0, along);
      const x = p.x + rightX(base.h) * lat;
      const z = p.z + rightZ(base.h) * lat;
      const c = o.round
        ? cyl({ x, z, r: size / 2, top: y, thick: 1.2 })
        : box({ x, z, yaw: base.h, hx: size / 2, hz: size / 2, top: y, thick: 1.2 });
      this.world.addStatic(c);
      if (o.round) OB.roundStoneVisual(this.ctx, x, y, z, size / 2);
      else boxQuads(c, this.bucket('plat'), this.bucket('platSide'), 3);
      sec.steps.push({ col: c, s: this.s + along, lat, static: true, half: size / 2 });
    }
    const total = n * (size + gap) + gap;
    this._sectionPath(total, 'steps', o.w);
    this.cur.y = y;
    sec.s1 = this.s;
    return this;
  }

  movers(n, o = {}) {
    const size = o.size ?? 3.6;
    const gap = o.gap ?? 2.4;
    const sec = this._sectionStart('steps');
    const base = { ...this.cur };
    for (let i = 0; i < n; i++) {
      const along = gap + size / 2 + i * (size + gap);
      const p = arcAt(base.x, base.z, base.h, 1, 0, along);
      const m = new OB.Mover(this.ctx, {
        x: p.x,
        y: base.y,
        z: p.z,
        h: base.h,
        sx: o.sx ?? size,
        sz: size,
        axis: o.axis ?? 'x',
        amp: o.amp ?? 3,
        period: o.period ?? 3.2,
        phase: (o.phase ?? 0.5) * i * Math.PI + (o.phase0 ?? 0),
        look: o.look,
      });
      this.dynamics.push(m);
      sec.steps.push({ col: m.col, s: this.s + along, lat: 0, mover: m, half: size / 2 });
    }
    this._sectionPath(n * (size + gap) + gap, 'steps', o.w);
    sec.s1 = this.s;
    return this;
  }

  discs(n, o = {}) {
    const r = o.r ?? 3.6;
    const gap = o.gap ?? 1.6;
    const sec = this._sectionStart('steps');
    const base = { ...this.cur };
    for (let i = 0; i < n; i++) {
      const along = gap + r + i * (2 * r + gap);
      const p = arcAt(base.x, base.z, base.h, 1, 0, along);
      const d = new OB.Disc(this.ctx, { x: p.x, y: base.y, z: p.z, r, speed: (o.speed ?? 1.1) * (i % 2 ? -1 : 1) });
      this.dynamics.push(d);
      sec.steps.push({ col: d.col, s: this.s + along, lat: 0, disc: d, half: r * 0.7 });
    }
    this._sectionPath(n * (2 * r + gap) + gap, 'steps', o.w);
    sec.s1 = this.s;
    return this;
  }

  tiles(len, o = {}) {
    const w = o.w ?? this.W;
    const t = new OB.Tiles(this.ctx, { ...this.cur, len, w, size: o.size ?? 2.4 });
    t.s0 = this.s - 2;
    t.s1 = this.s + len;
    this.dynamics.push(t);
    this.hazards.push(t);
    const samples = this._sampleArc(len, 0, 0, w, w);
    this._pushSamples(samples, { kind: 'tiles' });
    this.run = null;
    this._advance(len, 0, 0);
    return this;
  }

  // ---------- obstacle segments (build their own floor) ----------
  spinBars(len, n = 2, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, 0, { ...o, rails: o.rails ?? true });
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(s0 + (len * (i + 0.5)) / n);
      const hz = new OB.SpinBar(this.ctx, { ...p, len: p.w / 2 - 0.15, speed: (o.speed ?? 1.7) * (i % 2 ? -1 : 1), phase: i * 1.3, s: p.s, double: o.double });
      this.hazards.push(hz);
      this.avoid.push({ x: p.x, z: p.z, r: 0.6, s: p.s });
    }
    return this;
  }

  hammers(len, n = 2, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, 0, { ...o, rails: o.rails ?? this.rails });
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(s0 + (len * (i + 0.5)) / n);
      this.hazards.push(new OB.Hammer(this.ctx, { ...p, speed: o.speed ?? 2.0, phase: i * 1.7 + (o.phase ?? 0), s: p.s }));
    }
    return this;
  }

  pushers(len, n = 3, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, 0, { ...o, rails: false });
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(s0 + (len * (i + 0.5)) / n);
      this.hazards.push(new OB.Pusher(this.ctx, { ...p, side: i % 2 ? 1 : -1, period: o.period ?? 2.8, phase: i * 0.9, s: p.s, reach: o.reach }));
    }
    return this;
  }

  rollers(len, rise, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, rise, o);
    this.hazards.push(new OB.Rollers(this.ctx, { s0, s1: this.s, interval: o.interval ?? 1.3, speed: o.speed ?? 9, radius: o.radius ?? 0.8, color: this.theme.roller ?? 0x9a8f88, style: this.theme.rollerStyle }));
    return this;
  }

  crushers(len, n = 2, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, 0, o);
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(s0 + (len * (i + 0.5)) / n);
      const lanes = o.lanes ?? 3;
      for (let k = 0; k < lanes; k++) {
        const lat = (k - (lanes - 1) / 2) * (p.w / lanes);
        this.hazards.push(
          new OB.Crusher(this.ctx, {
            x: p.x + rightX(p.h) * lat,
            y: p.y,
            z: p.z + rightZ(p.h) * lat,
            h: p.h,
            sx: p.w / lanes - 0.25,
            sz: 2.6,
            period: o.period ?? 3.2,
            phase: (k * 0.37 + i * 0.5) % 1,
            s: p.s,
          })
        );
      }
    }
    return this;
  }

  bumpers(len, n = 4, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, 0, o);
    for (let i = 0; i < n; i++) {
      const p = this.pointAt(s0 + 4 + ((len - 8) * (i + 0.5)) / n);
      const lat = (i % 2 ? 1 : -1) * this.r.range(0.5, p.w / 2 - 2.2);
      const x = p.x + rightX(p.h) * lat;
      const z = p.z + rightZ(p.h) * lat;
      const r = 1.1;
      this.world.addStatic(cyl({ x, z, r, top: p.y + 1.3, thick: 1.4, bounce: 13, floor: false }));
      OB.bumperVisual(this.ctx, x, p.y, z, r, this.theme);
      this.avoid.push({ x, z, r: r + 0.4, s: p.s });
    }
    return this;
  }

  doors(o = {}) {
    this._floor(5, 0, 0, o);
    const p = this.pointAt(this.s);
    const d = new OB.Doors(this.ctx, { ...p, n: o.n ?? 4, fake: o.fake ?? 2, s: p.s });
    this.hazards.push(d);
    this.sections.push({ kind: 'doors', s0: p.s - 6, s1: p.s + 1, doors: d });
    this._floor(7, 0, 0, o);
    return this;
  }

  wind(len, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, 0, { ...o, rails: o.rails ?? false });
    this.hazards.push(new OB.Wind(this.ctx, { s0, s1: this.s, force: o.force ?? 13, period: o.period ?? 3.5, dir: o.dir ?? 0 }));
    return this;
  }

  meteors(len, o = {}) {
    const s0 = this.s;
    this._floor(len, 0, 0, o);
    this.hazards.push(new OB.Meteors(this.ctx, { s0, s1: this.s, interval: o.interval ?? 0.75 }));
    return this;
  }

  // ---------------- finalize ----------------
  finalize() {
    const T = this.theme;
    for (const run of this.runs) {
      if (run.samples.length < 2) continue;
      ribbon(run.samples, this.bucket(run.mat), this.bucket(run.side), { thick: run.thick, tile: 4 });
    }
    for (const [key, gb] of this.buckets) {
      if (gb.empty) continue;
      const mesh = new THREE.Mesh(gb.geometry(), this.mats[key] || this.mats.floor);
      mesh.receiveShadow = true;
      mesh.castShadow = key !== 'boost' && key !== 'accent' && key !== 'finish';
      if (key === 'boost') mesh.renderOrder = 1;
      this.group.add(mesh);
    }
    // supports
    this.groundY = (this.minY ?? 0) - (T.depth ?? 16);
    OB.pillars(this.ctx, this.runs, this.groundY, T);
    // stars & item boxes are created by the race (instanced)
    this.length = this.path[this.path.length - 1].s;
    // lowest floor near each sample, for the fall-out check
    const P = this.path;
    const lows = new Float32Array(P.length);
    for (let i = 0; i < P.length; i++) {
      let m = P[i].y;
      for (let k = Math.max(0, i - 10); k < Math.min(P.length, i + 10); k++) m = Math.min(m, P[k].y);
      lows[i] = m;
    }
    this.lows = lows;
    return this;
  }

  lowAt(i) {
    return this.lows[clamp(i, 0, this.lows.length - 1)];
  }

  update(t, dt) {
    for (const d of this.dynamics) d.update(t, dt);
    for (const h of this.hazards) h.update(t, dt);
  }

  animate(t) {
    for (const a of this.animTex) a.tex.offset.y = (t * a.v) % 1;
  }
}

export { arcAt, DEG };
export { part, merge };
