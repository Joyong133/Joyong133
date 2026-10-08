// Moving platforms, hazards and set-dressing pieces for the course.
//
// Hazards implement:
//   update(t, dt)                 animate + move colliders
//   collide(runner)               apply knock-backs
//   threat(t, px, pz, vx, vz, py, ph) AI look-ahead (ph = track heading): 0 none, 1 jump, 2 wait,
//                                 or { dodge: ±1 } to sidestep
import * as THREE from 'three';
import { box, cyl, moveTo, toLocalX, toLocalZ } from './physics.js';
import { boxGeometry, part, merge, toon } from './geom.js';
import { texture, labelTexture } from './textures.js';
import { clamp, rightX, rightZ } from '../core/rng.js';

const TAU = Math.PI * 2;
const ease = (u) => u * u * (3 - 2 * u);

function shadowed(m) {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- platforms
export class Mover {
  constructor(ctx, o) {
    this.o = o;
    this.col = box({ x: o.x, z: o.z, yaw: o.h, hx: o.sx / 2, hz: o.sz / 2, top: o.y, thick: 0.6 });
    ctx.world.addDynamic(this.col);
    this.mesh = moverMesh(ctx, o);
    ctx.group.add(this.mesh);
    this.update(0, 1 / 60);
  }
  posAt(t) {
    const o = this.o;
    const k = Math.sin((TAU * t) / o.period + o.phase) * o.amp;
    if (o.axis === 'y') return { x: o.x, y: o.y + k - o.amp, z: o.z };
    if (o.axis === 'z') return { x: o.x + Math.sin(o.h) * k, y: o.y, z: o.z + Math.cos(o.h) * k };
    return { x: o.x + rightX(o.h) * k, y: o.y, z: o.z + rightZ(o.h) * k };
  }
  update(t) {
    const p = this.posAt(t);
    moveTo(this.col, p.x, p.y, p.z);
    this.mesh.position.set(p.x, p.y, p.z);
    if (this.o.look === 'carpet') this.mesh.children[0].rotation.x = Math.sin(t * 3) * 0.03;
  }
}

function moverMesh(ctx, o) {
  const g = new THREE.Group();
  g.rotation.y = o.h;
  const look = o.look || 'box';
  if (look === 'cloud') {
    const parts = [part(new THREE.CylinderGeometry(o.sx / 2, o.sx / 2 - 0.3, 0.5, 18), 0xffffff, [0, -0.25, 0], [0, 0, 0], [1, 1, o.sz / o.sx])];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      parts.push(part(new THREE.SphereGeometry(0.75, 12, 8), 0xffffff, [Math.cos(a) * o.sx * 0.42, -0.35, Math.sin(a) * o.sz * 0.42]));
    }
    g.add(shadowed(new THREE.Mesh(merge(parts), toon({ vertexColors: true, emissive: 0x6a6f7a }))));
    return g;
  }
  if (look === 'carpet') {
    const inner = new THREE.Group();
    const m = shadowed(new THREE.Mesh(boxGeometry(o.sx, 0.18, o.sz, o.sx), [toon({ map: texture('carpet') }), toon({ color: 0xf5c542 })]));
    m.position.y = -0.09;
    inner.add(m);
    const tassels = [];
    const tg = new THREE.ConeGeometry(0.08, 0.3, 5);
    for (const sd of [-1, 1]) {
      for (let i = 0; i < 5; i++) tassels.push(part(tg, 0xf5c542, [((i - 2) / 4) * o.sx * 0.9, -0.25, (sd * o.sz) / 2]));
    }
    inner.add(new THREE.Mesh(merge(tassels), ctx.mats.vcol));
    g.add(inner);
    return g;
  }
  if (look === 'leaf') {
    const geo = merge([part(new THREE.SphereGeometry(1, 18, 10), 0x5cb840, [0, -0.16, 0], [0, 0, 0], [o.sx / 2 + 0.2, 0.18, o.sz / 2 + 0.3]), part(new THREE.BoxGeometry(0.1, 0.05, o.sz), 0x3f8f2c, [0, 0.02, 0])]);
    g.add(shadowed(new THREE.Mesh(geo, ctx.mats.vcol)));
    return g;
  }
  const m = shadowed(new THREE.Mesh(boxGeometry(o.sx, 0.6, o.sz, 3), [ctx.mats.plat, ctx.mats.platSide]));
  m.position.y = -0.3;
  g.add(m);
  return g;
}

export class Disc {
  constructor(ctx, o) {
    this.o = o;
    this.col = cyl({ x: o.x, z: o.z, r: o.r, top: o.y, thick: 0.8 });
    ctx.world.addDynamic(this.col);
    const g = (this.mesh = new THREE.Group());
    g.position.set(o.x, o.y, o.z);
    const top = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(o.r, o.r * 0.92, 0.8, 40), [ctx.mats.platSide, ctx.mats.plat, ctx.mats.platSide]));
    top.position.y = -0.4;
    g.add(top);
    // stripes so the spin reads clearly, plus a centre knob
    const T = ctx.course.theme;
    const parts = [];
    for (let i = 0; i < 4; i++) parts.push(part(new THREE.BoxGeometry(o.r * 1.9, 0.04, 0.35), T.hazard?.[0] ?? 0xe0533d, [0, 0.02, 0], [0, (i / 4) * Math.PI, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 16), T.hazard?.[1] ?? 0xffffff, [0, 0.15, 0]));
    g.add(shadowed(new THREE.Mesh(merge(parts), ctx.mats.vcol)));
    ctx.group.add(g);
  }
  update(t, dt) {
    const a = this.o.speed * dt;
    moveTo(this.col, this.o.x, this.o.y, this.o.z);
    this.col.dyaw = a;
    this.mesh.rotation.y += a;
  }
}

export class Tiles {
  constructor(ctx, o) {
    this.ctx = ctx;
    const cols = Math.max(2, Math.round(o.w / (o.size + 0.25)));
    const rows = Math.max(2, Math.round(o.len / (o.size + 0.25)));
    const sx = o.w / cols;
    const sz = o.len / rows;
    const ts = Math.min(sx, sz) - 0.22;
    Object.assign(this, { o, cols, rows, sx, sz });
    this.n = cols * rows;
    this.y = o.y;
    this.tiles = [];
    const geo = boxGeometry(ts, 0.5, ts, 2.4);
    this.mesh = new THREE.InstancedMesh(geo, [ctx.mats.plat, ctx.mats.platSide], this.n);
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.h = o.h;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const along = sz * (r + 0.5);
        const lat = (c - (cols - 1) / 2) * sx;
        const x = o.x + Math.sin(o.h) * along + rightX(o.h) * lat;
        const z = o.z + Math.cos(o.h) * along + rightZ(o.h) * lat;
        const i = this.tiles.length;
        const col = box({ x, z, yaw: o.h, hx: ts / 2, hz: ts / 2, top: o.y, thick: 0.5, onStand: () => this.touch(i) });
        ctx.world.addStatic(col);
        this.tiles.push({ x, z, col, st: 0, timer: 0, yo: 0, vy: 0 });
      }
    }
    this.dummy = new THREE.Object3D();
    this.update(0, 0);
    ctx.group.add(this.mesh);
  }
  touch(i) {
    const t = this.tiles[i];
    if (t.st === 0) {
      t.st = 1;
      t.timer = 0.75;
    }
  }
  // AI: jump when about to run onto a missing tile
  threat(t, px, pz, vx, vz) {
    for (const tau of [0.06, 0.14, 0.22]) {
      const T = this.tileAt(px + vx * tau, pz + vz * tau);
      if (T && T.st >= 2) return 1;
    }
    return 0;
  }
  tileAt(x, z) {
    const o = this.o;
    const dx = x - o.x;
    const dz = z - o.z;
    const along = dx * Math.sin(o.h) + dz * Math.cos(o.h);
    const lat = dx * rightX(o.h) + dz * rightZ(o.h);
    const row = Math.floor(along / this.sz);
    const col = Math.round(lat / this.sx + (this.cols - 1) / 2);
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    return this.tiles[row * this.cols + col];
  }
  collide() {}
  update(t, dt) {
    const d = this.dummy;
    for (let i = 0; i < this.tiles.length; i++) {
      const T = this.tiles[i];
      let jx = 0;
      let jz = 0;
      if (T.st === 1) {
        T.timer -= dt;
        jx = Math.sin(t * 70 + i) * 0.05;
        jz = Math.cos(t * 63 + i) * 0.05;
        if (T.timer <= 0) {
          T.st = 2;
          T.timer = 3;
          T.col.active = false;
          T.vy = 0;
        }
      } else if (T.st === 2) {
        T.vy -= 30 * dt;
        T.yo += T.vy * dt;
        T.timer -= dt;
        if (T.timer <= 0) {
          T.st = 0;
          T.yo = 0;
          T.col.active = true;
        }
      }
      d.position.set(T.x + jx, this.y - 0.25 + T.yo, T.z + jz);
      d.rotation.set(T.st === 2 ? T.yo * 0.05 : 0, this.h, 0);
      d.scale.setScalar(T.st === 2 && T.yo < -30 ? 0.001 : 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- hazards
// Distance from a runner's body (vertical segment) to a point.
function bodyDist2(r, x, y, z) {
  const cy = clamp(y, r.pos.y + 0.35, r.pos.y + 1.15);
  const dx = r.pos.x - x;
  const dy = cy - y;
  const dz = r.pos.z - z;
  return dx * dx + dy * dy + dz * dz;
}

function stripedBar(len, radius, a, b, segs = 8) {
  const parts = [];
  const seg = (2 * len) / segs;
  const g = new THREE.CylinderGeometry(radius, radius, seg, 12);
  for (let i = 0; i < segs; i++) {
    parts.push(part(g, i % 2 ? a : b, [-len + seg * (i + 0.5), 0, 0], [0, 0, Math.PI / 2]));
  }
  const cap = new THREE.SphereGeometry(radius * 1.15, 12, 8);
  parts.push(part(cap, a, [-len, 0, 0]), part(cap, a, [len, 0, 0]));
  return merge(parts);
}

export class SpinBar {
  constructor(ctx, o) {
    this.ctx = ctx;
    Object.assign(this, { x: o.x, y: o.y, z: o.z, len: o.len, w: o.speed, phase: o.phase, s: o.s });
    this.s0 = o.s - o.len - 3;
    this.s1 = o.s + o.len + 3;
    this.barY = o.y + 0.6;
    ctx.world.addStatic(cyl({ x: o.x, z: o.z, r: 0.45, top: o.y + 1.4, thick: 1.4 }));
    const g = new THREE.Group();
    g.position.set(o.x, o.y, o.z);
    const T = ctx.course.theme;
    const post = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.55, 1.4, 16), ctx.mats.metal));
    post.position.y = 0.7;
    g.add(post);
    const cap = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10), ctx.mats.hazard));
    cap.position.y = 1.45;
    g.add(cap);
    this.bar = new THREE.Group();
    this.bar.position.y = 0.6;
    this.bar.add(shadowed(new THREE.Mesh(stripedBar(o.len, 0.22, T.hazard?.[0] ?? 0xe0533d, T.hazard?.[1] ?? 0xffffff), ctx.mats.vcol)));
    g.add(this.bar);
    ctx.group.add(g);
  }
  angle(t) {
    return this.phase + this.w * t;
  }
  update(t) {
    this.t = t;
    this.bar.rotation.y = this.angle(t);
  }
  _hits(theta, px, pz) {
    const dx = Math.cos(theta);
    const dz = -Math.sin(theta);
    const vx = px - this.x;
    const vz = pz - this.z;
    const along = vx * dx + vz * dz;
    if (Math.abs(along) > this.len + 0.35 || Math.abs(along) < 0.3) return 0;
    const nx = -Math.sin(theta);
    const nz = -Math.cos(theta);
    const d = vx * nx + vz * nz;
    if (Math.abs(d) > 0.62) return 0;
    return Math.sign(along * this.w) || 1;
  }
  collide(r) {
    if (r.pos.y > this.barY + 0.22 || r.pos.y + 1.4 < this.barY) return;
    const th = this.angle(this.t);
    const sg = this._hits(th, r.pos.x, r.pos.z);
    if (!sg) return;
    const nx = -Math.sin(th) * sg;
    const nz = -Math.cos(th) * sg;
    if (r.knock(nx, nz, 9, 6, 0.85)) this.ctx.course.onHit?.(r, 'bar');
  }
  threat(t, px, pz, vx, vz, py) {
    if (py > this.barY + 0.3) return 0;
    for (const tau of [0.12, 0.24, 0.36]) {
      if (this._hits(this.angle(t + tau), px + vx * tau, pz + vz * tau)) return 1;
    }
    return 0;
  }
}

export class Hammer {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.L = 6.4;
    this.A = 1.02;
    this.px = o.x;
    this.py = o.y + 8;
    this.pz = o.z;
    this.h = o.h;
    this.s0 = o.s - 4;
    this.s1 = o.s + 3;
    this.lx = Math.cos(o.h);
    this.lz = -Math.sin(o.h);
    this.fx = Math.sin(o.h);
    this.fz = Math.cos(o.h);
    const T = ctx.course.theme;
    const g = new THREE.Group();
    g.position.set(o.x, o.y, o.z);
    g.rotation.y = o.h;
    const side = o.w / 2 + 0.9;
    const postG = new THREE.CylinderGeometry(0.28, 0.35, 8.8, 10);
    const frame = merge([
      part(postG, T.metal ?? 0x8a93a6, [side, 4.4, 0]),
      part(postG, T.metal ?? 0x8a93a6, [-side, 4.4, 0]),
      part(new THREE.BoxGeometry(side * 2 + 0.8, 0.6, 0.7), T.hazard?.[0] ?? 0xe0533d, [0, 8.6, 0]),
    ]);
    g.add(shadowed(new THREE.Mesh(frame, ctx.mats.vcol)));
    this.swing = new THREE.Group();
    this.swing.position.y = 8;
    const arm = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, this.L, 8), ctx.mats.metal));
    arm.position.y = -this.L / 2;
    this.swing.add(arm);
    const headG = merge([
      part(new THREE.CylinderGeometry(0.85, 0.85, 1.8, 18), T.hazard?.[0] ?? 0xe0533d, [0, 0, 0], [Math.PI / 2, 0, 0]),
      part(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 18), T.hazard?.[1] ?? 0xffffff, [0, 0, 0.95], [Math.PI / 2, 0, 0]),
      part(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 18), T.hazard?.[1] ?? 0xffffff, [0, 0, -0.95], [Math.PI / 2, 0, 0]),
    ]);
    const head = shadowed(new THREE.Mesh(headG, ctx.mats.vcol));
    head.position.y = -this.L;
    this.swing.add(head);
    g.add(this.swing);
    ctx.group.add(g);
  }
  theta(t) {
    return this.A * Math.sin(this.o.speed * t + this.o.phase);
  }
  head(t, out) {
    const th = this.theta(t);
    const lat = this.L * Math.sin(th);
    out.x = this.px + this.lx * lat;
    out.y = this.py - this.L * Math.cos(th);
    out.z = this.pz + this.lz * lat;
    return out;
  }
  update(t) {
    this.t = t;
    this.swing.rotation.z = this.theta(t);
  }
  _dist2(hx, hy, hz, x, y, z) {
    // head is a short capsule along the track direction
    const f = clamp((x - hx) * this.fx + (z - hz) * this.fz, -0.9, 0.9);
    const cx = hx + this.fx * f;
    const cz = hz + this.fz * f;
    const cy = clamp(hy, y + 0.35, y + 1.15);
    return (x - cx) ** 2 + (cy - hy) ** 2 + (z - cz) ** 2;
  }
  collide(r) {
    const h = this.head(this.t, (this._h ||= {}));
    if (this._dist2(h.x, h.y, h.z, r.pos.x, r.pos.y, r.pos.z) > 1.3 * 1.3) return;
    const sg = Math.sign(Math.cos(this.o.speed * this.t + this.o.phase)) || 1;
    if (r.knock(this.lx * sg, this.lz * sg, 12, 7, 1.0)) this.ctx.course.onHit?.(r, 'hammer');
  }
  threat(t, px, pz, vx, vz, py) {
    const h = (this._th ||= {});
    for (const tau of [0.15, 0.3, 0.45, 0.6]) {
      this.head(t + tau, h);
      if (this._dist2(h.x, h.y, h.z, px + vx * tau, py, pz + vz * tau) < 2.1 * 2.1) return 2;
    }
    return 0;
  }
}

export class Pusher {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.side = o.side;
    this.sx = 3.4;
    this.sz = 2.4;
    this.H = 2.3;
    this.reach = o.reach ?? o.w * 0.36;
    this.rest = o.side * (o.w / 2 + this.sx / 2 + 0.15);
    this.out = o.side * (o.w / 2 + this.sx / 2 - this.reach);
    this.rx = rightX(o.h);
    this.rz = rightZ(o.h);
    this.s0 = o.s - 4;
    this.s1 = o.s + 3;
    this.lat = this.rest;
    this.vel = 0;
    this.col = box({ x: o.x + this.rx * this.rest, z: o.z + this.rz * this.rest, yaw: o.h, hx: this.sx / 2, hz: this.sz / 2, top: o.y + this.H, bot: o.y + 0.05 });
    ctx.world.addDynamic(this.col);
    const T = ctx.course.theme;
    const blockG = merge([
      part(new THREE.BoxGeometry(this.sx, this.H, this.sz), T.hazard?.[0] ?? 0xe0533d, [0, this.H / 2, 0]),
      part(new THREE.BoxGeometry(0.3, this.H * 0.8, this.sz * 0.8), T.hazard?.[1] ?? 0xffffff, [(-o.side * this.sx) / 2, this.H / 2, 0]),
      part(new THREE.SphereGeometry(0.22, 8, 6), 0x222222, [(-o.side * this.sx) / 2 - o.side * 0.12, this.H * 0.65, 0.45]),
      part(new THREE.SphereGeometry(0.22, 8, 6), 0x222222, [(-o.side * this.sx) / 2 - o.side * 0.12, this.H * 0.65, -0.45]),
    ]);
    this.mesh = shadowed(new THREE.Mesh(blockG, ctx.mats.vcol));
    this.mesh.rotation.y = o.h;
    ctx.group.add(this.mesh);
    // housing outside the track
    const house = shadowed(new THREE.Mesh(new THREE.BoxGeometry(this.sx + 0.6, this.H + 0.6, this.sz + 0.6), ctx.mats.metal));
    const hl = o.side * (o.w / 2 + this.sx / 2 + 0.6);
    house.position.set(o.x + this.rx * hl, o.y + this.H / 2, o.z + this.rz * hl);
    house.rotation.y = o.h;
    ctx.group.add(house);
    this.update(0, 1 / 120);
  }
  phaseU(t) {
    return (((t / this.o.period + this.o.phase) % 1) + 1) % 1;
  }
  latAt(t) {
    const u = this.phaseU(t);
    if (u < 0.45) return this.rest;
    if (u < 0.52) return this.rest + (this.out - this.rest) * ease((u - 0.45) / 0.07);
    if (u < 0.72) return this.out;
    return this.out + (this.rest - this.out) * ((u - 0.72) / 0.28);
  }
  update(t, dt) {
    this.t = t;
    const lat = this.latAt(t);
    this.vel = dt > 0 ? (lat - this.lat) / dt : 0;
    this.lat = lat;
    const o = this.o;
    moveTo(this.col, o.x + this.rx * lat, o.y + this.H, o.z + this.rz * lat);
    this.mesh.position.set(o.x + this.rx * lat, o.y, o.z + this.rz * lat);
  }
  collide(r) {
    if (-this.vel * this.side < 2) return; // only while punching inwards
    if (r.pos.y > this.o.y + this.H || r.pos.y + 1.4 < this.o.y) return;
    const lx = toLocalX(this.col, r.pos.x, r.pos.z);
    const lz = toLocalZ(this.col, r.pos.x, r.pos.z);
    if (Math.abs(lx) > this.sx / 2 + 0.6 || Math.abs(lz) > this.sz / 2 + 0.45) return;
    if (r.knock(-this.side * this.rx, -this.side * this.rz, 10, 5, 0.6)) this.ctx.course.onHit?.(r, 'pusher');
  }
  threat(t, px, pz, vx, vz, py) {
    const o = this.o;
    for (const tau of [0.15, 0.35, 0.55]) {
      const x = px + vx * tau;
      const z = pz + vz * tau;
      const dx = x - o.x;
      const dz = z - o.z;
      const along = dx * Math.sin(o.h) + dz * Math.cos(o.h);
      const lat = dx * this.rx + dz * this.rz;
      if (Math.abs(along) > this.sz / 2 + 0.7) continue;
      const lim = this.out - this.side * (this.sx / 2 + 0.8);
      const inZone = this.side > 0 ? lat > lim : lat < lim;
      if (!inZone) continue;
      const u = this.phaseU(t + tau);
      if (u > 0.38 && u < 0.8) return 2;
    }
    return 0;
  }
}

export class Rollers {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.s0 = o.s0 - 6;
    this.s1 = o.s1;
    this.next = 0.3;
    const n = Math.ceil((o.s1 - o.s0 + 10) / (o.speed * o.interval * 0.8)) + 2;
    this.balls = [];
    let geo;
    let mat;
    if (o.style === 'snow') {
      geo = new THREE.IcosahedronGeometry(o.radius, 2);
      mat = toon({ color: 0xffffff });
    } else if (o.style === 'cake') {
      geo = merge([
        part(new THREE.CylinderGeometry(o.radius, o.radius, o.radius * 1.2, 20), 0xffe0ef, [0, 0, 0], [0, 0, Math.PI / 2]),
        part(new THREE.CylinderGeometry(o.radius * 1.02, o.radius * 1.02, o.radius * 0.3, 20), 0xff6fa8, [0, 0, 0], [0, 0, Math.PI / 2]),
      ]);
      mat = ctx.mats.vcol;
    } else if (o.style === 'barrel') {
      geo = merge([
        part(new THREE.CylinderGeometry(o.radius, o.radius, o.radius * 1.5, 16), 0x9a6a3f, [0, 0, 0], [0, 0, Math.PI / 2]),
        part(new THREE.CylinderGeometry(o.radius * 1.03, o.radius * 1.03, 0.12, 16), 0x555555, [0.4, 0, 0], [0, 0, Math.PI / 2]),
        part(new THREE.CylinderGeometry(o.radius * 1.03, o.radius * 1.03, 0.12, 16), 0x555555, [-0.4, 0, 0], [0, 0, Math.PI / 2]),
      ]);
      mat = ctx.mats.vcol;
    } else {
      geo = new THREE.DodecahedronGeometry(o.radius, 1);
      mat = toon({ map: texture('rock'), color: o.color });
    }
    for (let i = 0; i < n; i++) {
      const m = shadowed(new THREE.Mesh(geo, mat));
      m.visible = false;
      ctx.group.add(m);
      this.balls.push({ m, on: false, s: 0, lat: 0, x: 0, y: 0, z: 0, h: 0, sink: 0 });
    }
    this.tmp = {};
  }
  update(t, dt) {
    this.t = t;
    const o = this.o;
    const c = this.ctx.course;
    if (t >= this.next) {
      this.next = t + o.interval * (0.75 + this.ctx.r() * 0.5);
      const b = this.balls.find((x) => !x.on);
      if (b) {
        const p = c.pointAt(o.s1 - 0.5, this.tmp);
        b.on = true;
        b.s = o.s1 - 0.5;
        b.lat = (Math.floor(this.ctx.r() * 3) - 1) * (p.w / 3.2);
        b.sink = 0;
        b.m.visible = true;
      }
    }
    for (const b of this.balls) {
      if (!b.on) continue;
      b.s -= o.speed * dt;
      const p = c.pointAt(b.s, this.tmp);
      if (b.s < o.s0 - 6) {
        b.sink += dt * 3;
        if (b.sink > 1) {
          b.on = false;
          b.m.visible = false;
          continue;
        }
      }
      b.x = p.x + rightX(p.h) * b.lat;
      b.z = p.z + rightZ(p.h) * b.lat;
      b.y = p.y + o.radius - b.sink * 2;
      b.h = p.h;
      b.m.position.set(b.x, b.y, b.z);
      b.m.rotation.y = p.h;
      b.m.rotateX((b.s / o.radius) % TAU);
      b.m.scale.setScalar(1 - b.sink * 0.8);
    }
  }
  collide(r) {
    const R = this.o.radius + 0.4;
    for (const b of this.balls) {
      if (!b.on || b.sink > 0.3) continue;
      if (bodyDist2(r, b.x, b.y, b.z) < R * R) {
        if (r.knock(-Math.sin(b.h), -Math.cos(b.h), 10, 7, 0.9)) this.ctx.course.onHit?.(r, 'roller');
      }
    }
  }
  threat(t, px, pz, vx, vz, py) {
    const R = this.o.radius + 0.9;
    for (const b of this.balls) {
      if (!b.on) continue;
      for (const tau of [0.1, 0.22, 0.34]) {
        const bx = b.x - Math.sin(b.h) * this.o.speed * tau;
        const bz = b.z - Math.cos(b.h) * this.o.speed * tau;
        const dx = px + vx * tau - bx;
        const dz = pz + vz * tau - bz;
        if (dx * dx + dz * dz < R * R && py < b.y + this.o.radius) return 1;
      }
    }
    return 0;
  }
}

export class Crusher {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.H = 4.4;
    this.bh = 2.2;
    this.s0 = o.s - 4;
    this.s1 = o.s + 2;
    this.bottom = o.y + this.H;
    this.col = box({ x: o.x, z: o.z, yaw: o.h, hx: o.sx / 2, hz: o.sz / 2, top: this.bottom + this.bh, bot: this.bottom });
    ctx.world.addDynamic(this.col);
    const T = ctx.course.theme;
    const g = merge([
      part(new THREE.BoxGeometry(o.sx, this.bh, o.sz), T.crusher ?? T.metal ?? 0x6b7280, [0, this.bh / 2, 0]),
      part(new THREE.BoxGeometry(o.sx * 0.9, 0.25, o.sz * 0.9), T.hazard?.[0] ?? 0xe0533d, [0, 0.12, 0]),
      part(new THREE.BoxGeometry(0.35, 0.18, 0.05), 0x111111, [-o.sx * 0.18, this.bh * 0.6, o.sz / 2 + 0.01], [0, 0, -0.3]),
      part(new THREE.BoxGeometry(0.35, 0.18, 0.05), 0x111111, [o.sx * 0.18, this.bh * 0.6, o.sz / 2 + 0.01], [0, 0, 0.3]),
    ]);
    this.mesh = shadowed(new THREE.Mesh(g, ctx.mats.vcol));
    this.mesh.rotation.y = o.h;
    ctx.group.add(this.mesh);
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(o.sx, o.sz), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
    this.shadow.rotation.set(-Math.PI / 2, 0, o.h);
    this.shadow.position.set(o.x, o.y + 0.03, o.z);
    ctx.group.add(this.shadow);
    this.vel = 0;
    this.update(0, 1 / 120);
  }
  phaseU(t) {
    return (((t / this.o.period + this.o.phase) % 1) + 1) % 1;
  }
  bottomAt(t) {
    const u = this.phaseU(t);
    const y = this.o.y;
    if (u < 0.6) return y + this.H;
    if (u < 0.68) return y + this.H + Math.sin((u - 0.6) * 300) * 0.06;
    if (u < 0.71) return y + this.H * (1 - ease((u - 0.68) / 0.03));
    if (u < 0.86) return y;
    return y + this.H * ease((u - 0.86) / 0.14);
  }
  update(t, dt) {
    this.t = t;
    const b = this.bottomAt(t);
    this.vel = dt > 0 ? (b - this.bottom) / dt : 0;
    this.bottom = b;
    moveTo(this.col, this.o.x, b + this.bh, this.o.z);
    this.mesh.position.set(this.o.x, b, this.o.z);
    const k = 1 - (b - this.o.y) / this.H;
    this.shadow.material.opacity = 0.15 + k * 0.45;
    if (this.vel < -20 && b - this.o.y < 0.4 && !this.thud) {
      this.thud = true;
      this.ctx.course.onSlam?.(this.o.x, this.o.y, this.o.z);
    }
    if (this.vel >= 0) this.thud = false;
  }
  inside(x, z, m = 0) {
    const lx = toLocalX(this.col, x, z);
    const lz = toLocalZ(this.col, x, z);
    return Math.abs(lx) < this.o.sx / 2 + m && Math.abs(lz) < this.o.sz / 2 + m;
  }
  collide(r) {
    if (this.vel > -3) return;
    if (this.bottom > r.pos.y + 1.5 || !this.inside(r.pos.x, r.pos.z, 0.3)) return;
    if (r.knock(-Math.sin(this.o.h), -Math.cos(this.o.h), 4, 2, 1.3, true)) this.ctx.course.onHit?.(r, 'crusher');
  }
  threat(t, px, pz, vx, vz) {
    if (this.inside(px, pz, 0.2)) return 0; // already underneath: keep running
    for (const tau of [0.2, 0.4, 0.6]) {
      if (!this.inside(px + vx * tau, pz + vz * tau, 0.5)) continue;
      const u = this.phaseU(t + tau);
      if (u > 0.55 && u < 0.9) return 2;
    }
    return 0;
  }
}

export class Doors {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.s0 = o.s - 6;
    this.s1 = o.s + 1;
    const n = o.n;
    const pw = 0.55;
    const dw = (o.w - (n + 1) * pw) / n;
    const H = 3.0;
    const wallH = 5.2;
    const fx = Math.sin(o.h);
    const fz = Math.cos(o.h);
    const rx = rightX(o.h);
    const rz = rightZ(o.h);
    const T = ctx.course.theme;
    const parts = [];
    const lin = box({ x: o.x, z: o.z, yaw: o.h, hx: o.w / 2 + 0.5, hz: 0.35, top: o.y + wallH, bot: o.y + H, floor: false });
    ctx.world.addStatic(lin);
    parts.push(part(new THREE.BoxGeometry(o.w + 1, wallH - H, 0.7), T.doorFrame ?? T.accent ?? 0xffc93c, [0, (H + wallH) / 2, 0]));
    for (let i = 0; i <= n; i++) {
      const lat = -o.w / 2 + pw / 2 + i * (pw + dw);
      const col = box({ x: o.x + rx * lat, z: o.z + rz * lat, yaw: o.h, hx: pw / 2, hz: 0.35, top: o.y + H, floor: false, thick: H + 1 });
      ctx.world.addStatic(col);
      parts.push(part(new THREE.BoxGeometry(pw, H, 0.7), T.doorFrame ?? T.accent ?? 0xffc93c, [-lat, H / 2, 0]));
    }
    // emblem on top
    parts.push(part(new THREE.SphereGeometry(0.6, 12, 8), T.hazard?.[0] ?? 0xe0533d, [0, wallH + 0.3, 0]));
    const frame = shadowed(new THREE.Mesh(merge(parts), ctx.mats.vcol));
    frame.position.set(o.x, o.y, o.z);
    frame.rotation.y = o.h;
    ctx.group.add(frame);

    // pick which doors are fake (solid)
    const idx = [...Array(n).keys()];
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.r() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const fakes = new Set(idx.slice(0, Math.min(o.fake, n - 1)));
    this.list = [];
    const doorGeo = boxGeometry(dw, H, 0.3, 2);
    for (let i = 0; i < n; i++) {
      const lat = -o.w / 2 + pw + dw / 2 + i * (pw + dw);
      const x = o.x + rx * lat;
      const z = o.z + rz * lat;
      const d = { lat, fake: fakes.has(i), broken: false, fall: 0, bump: 0 };
      d.col = box({ x, z, yaw: o.h, hx: dw / 2, hz: 0.18, top: o.y + H, thick: H + 0.5, floor: false });
      d.col.onTouch = (r) => this.touch(d, r);
      ctx.world.addStatic(d.col);
      const hinge = new THREE.Group();
      hinge.position.set(x, o.y, z);
      hinge.rotation.y = o.h;
      const m = shadowed(new THREE.Mesh(doorGeo, [ctx.mats.plat, ctx.mats.plat]));
      m.position.y = H / 2;
      hinge.add(m);
      // little knob / emblem
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), ctx.mats.accent);
      knob.position.set(dw * 0.3, H * 0.45, -0.2);
      hinge.add(knob);
      const q = new THREE.Mesh(new THREE.PlaneGeometry(dw * 0.7, dw * 0.7), new THREE.MeshBasicMaterial({ map: doorMark(), transparent: true }));
      q.position.set(0, H * 0.62, -0.16);
      q.rotation.y = Math.PI;
      hinge.add(q);
      ctx.group.add(hinge);
      d.hinge = hinge;
      this.list.push(d);
    }
    this.fx = fx;
    this.fz = fz;
  }
  touch(d, r) {
    const into = r.vel.x * this.fx + r.vel.z * this.fz;
    if (d.broken || into < 0.5) return;
    if (d.fake) {
      if (d.bump <= 0) {
        d.bump = 0.35;
        d.known = true;
        r.knock(-this.fx, -this.fz, 5, 3, 0.35, true);
        this.ctx.course.onDoor?.(r, false, d);
      }
      return;
    }
    d.broken = true;
    d.col.active = false;
    this.ctx.course.onDoor?.(r, true, d);
  }
  update(t, dt) {
    for (const d of this.list) {
      if (d.broken && d.fall < 1) {
        d.fall = Math.min(1, d.fall + dt * 3);
        d.hinge.rotation.x = ease(d.fall) * (Math.PI / 2);
      }
      if (d.bump > 0) {
        d.bump -= dt;
        d.hinge.rotation.z = Math.sin(d.bump * 60) * 0.03;
      }
    }
  }
  collide() {}
  threat() {
    return 0;
  }
}

let doorMarkTex = null;
function doorMark() {
  if (doorMarkTex) return doorMarkTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = 'bold 96px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 64, 70);
  doorMarkTex = new THREE.CanvasTexture(c);
  doorMarkTex.colorSpace = THREE.SRGBColorSpace;
  return doorMarkTex;
}

export class Wind {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.s0 = o.s0;
    this.s1 = o.s1;
    this.tmp = {};
    // streak particles
    const n = 46;
    const geo = new THREE.PlaneGeometry(1.6, 0.06);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.streaks = [];
    for (let i = 0; i < n; i++) {
      this.streaks.push({ s: o.s0 + ctx.r() * (o.s1 - o.s0), lat: (ctx.r() - 0.5) * 14, y: 0.3 + ctx.r() * 3 });
    }
    this.dummy = new THREE.Object3D();
    ctx.group.add(this.mesh);
  }
  forceAt(t) {
    const o = this.o;
    if (o.dir) return o.dir * o.force;
    const k = Math.sin((TAU * t) / o.period);
    return Math.sign(k) * Math.min(1, Math.abs(k) * 3) * o.force;
  }
  update(t, dt) {
    this.t = t;
    const f = this.forceAt(t);
    const c = this.ctx.course;
    const d = this.dummy;
    for (let i = 0; i < this.streaks.length; i++) {
      const s = this.streaks[i];
      s.lat += f * dt * 1.6;
      if (s.lat > 8) s.lat = -8;
      if (s.lat < -8) s.lat = 8;
      const p = c.pointAt(s.s, this.tmp);
      d.position.set(p.x + rightX(p.h) * s.lat, p.y + s.y, p.z + rightZ(p.h) * s.lat);
      d.rotation.set(0, p.h + Math.PI / 2, 0);
      d.scale.set(Math.min(1.5, Math.abs(f) / 8 + 0.1), 1, 1);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  collide(r) {
    if (r.s < this.s0 || r.s > this.s1) return;
    const p = this.ctx.course.pointAt(r.s, this.tmp);
    if (r.pos.y < p.y - 2 || r.pos.y > p.y + 8) return;
    const f = this.forceAt(this.t) * (r.windMul ?? 1);
    r.ext.x += rightX(p.h) * f;
    r.ext.z += rightZ(p.h) * f;
  }
  threat() {
    return 0;
  }
}

export class Meteors {
  constructor(ctx, o) {
    this.ctx = ctx;
    this.o = o;
    this.s0 = o.s0;
    this.s1 = o.s1;
    this.next = 0.5;
    this.impacts = [];
    this.list = [];
    const ballGeo = new THREE.IcosahedronGeometry(0.9, 1);
    const ballMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xffe066 });
    const ringGeo = new THREE.RingGeometry(1.9, 2.4, 32);
    for (let i = 0; i < 7; i++) {
      const ball = new THREE.Mesh(ballGeo, ballMat);
      const core = new THREE.Mesh(ballGeo, coreMat);
      core.scale.setScalar(0.6);
      ball.add(core);
      ball.visible = false;
      const ring = new THREE.Mesh(ringGeo, ctx.mats.warn);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      ctx.group.add(ball, ring);
      this.list.push({ ball, ring, st: 0, t: 0, x: 0, y: 0, z: 0 });
    }
    this.tmp = {};
  }
  update(t, dt) {
    this.t = t;
    this.impacts.length = 0;
    const c = this.ctx.course;
    if (t >= this.next) {
      this.next = t + this.o.interval * (0.7 + this.ctx.r() * 0.6);
      const m = this.list.find((x) => x.st === 0);
      if (m) {
        const s = this.o.s0 + 3 + this.ctx.r() * (this.o.s1 - this.o.s0 - 6);
        const p = c.pointAt(s, this.tmp);
        const lat = (this.ctx.r() - 0.5) * (p.w - 2);
        m.x = p.x + rightX(p.h) * lat;
        m.z = p.z + rightZ(p.h) * lat;
        m.y = p.y;
        m.st = 1;
        m.t = 1.1;
        m.ring.visible = true;
        m.ring.position.set(m.x, m.y + 0.05, m.z);
      }
    }
    for (const m of this.list) {
      if (m.st === 0) continue;
      m.t -= dt;
      if (m.st === 1) {
        const k = 1 - m.t / 1.1;
        m.ring.scale.setScalar(1.2 - k * 0.2);
        m.ring.material.opacity = 0.3 + 0.3 * Math.abs(Math.sin(t * 12));
        if (m.t < 0.4) {
          m.ball.visible = true;
          const f = m.t / 0.4;
          m.ball.position.set(m.x + f * 6, m.y + 0.6 + f * 26, m.z - f * 3);
          m.ball.rotation.x += dt * 8;
        }
        if (m.t <= 0) {
          m.st = 2;
          m.t = 0.35;
          m.ring.visible = false;
          this.impacts.push(m);
          c.onBoom?.(m.x, m.y + 0.5, m.z);
        }
      } else if (m.st === 2) {
        const k = 1 - m.t / 0.35;
        m.ball.scale.setScalar(1 + k * 2.2);
        m.ball.position.y = m.y + 0.4;
        if (m.t <= 0) {
          m.st = 0;
          m.ball.visible = false;
          m.ball.scale.setScalar(1);
        }
      }
    }
  }
  collide(r) {
    for (const m of this.impacts) {
      const dx = r.pos.x - m.x;
      const dz = r.pos.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d < 2.5 && r.pos.y < m.y + 2.2 && r.pos.y > m.y - 1) {
        const nx = d > 0.1 ? dx / d : 1;
        const nz = d > 0.1 ? dz / d : 0;
        if (r.knock(nx, nz, 9, 10, 1.0)) this.ctx.course.onHit?.(r, 'meteor');
      }
    }
  }
  threat(t, px, pz, vx, vz, py, ph) {
    for (const m of this.list) {
      if (m.st !== 1) continue;
      const tau = Math.max(0.05, m.t);
      if (tau > 1) continue;
      const x = px + vx * tau;
      const z = pz + vz * tau;
      const dx = x - m.x;
      const dz = z - m.z;
      if (dx * dx + dz * dz < 3.2 * 3.2) {
        const side = dx * rightX(ph) + dz * rightZ(ph);
        return { dodge: side >= 0 ? 1 : -1, m };
      }
    }
    return 0;
  }
}

// ---------------------------------------------------------------- visuals
export function jumpPadVisual(ctx, p, w) {
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.h;
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 2.8), ctx.mats.metal));
  base.position.y = 0.06;
  g.add(base);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, 2.5), ctx.mats.boost);
  top.rotation.x = -Math.PI / 2;
  top.position.y = 0.13;
  g.add(top);
  const springG = new THREE.TorusGeometry(0.22, 0.05, 6, 12);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(springG, ctx.mats.accent);
    s.rotation.x = Math.PI / 2;
    s.position.set(((i - 1.5) / 3) * (w - 1.2), 0.05, 1.5);
    g.add(s);
  }
  ctx.group.add(g);
}

const bannerTex = new Map();
function bannerTexture(text, bg, fg) {
  const key = `${text}|${bg}`;
  if (bannerTex.has(key)) return bannerTex.get(key);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 96);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(0, 0, 512, 10);
  g.fillStyle = fg;
  g.font = 'bold 58px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  bannerTex.set(key, t);
  return t;
}

export function archVisual(ctx, p, w, color, kind) {
  const g = new THREE.Group();
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.h;
  const side = w / 2 + 0.55;
  const H = kind === 'cp' ? 5.2 : 6.2;
  const col = new THREE.Color(color);
  const light = col.clone().offsetHSL(0, 0, 0.18).getHex();
  const postG = new THREE.CylinderGeometry(0.32, 0.4, H, 12);
  const ball = new THREE.SphereGeometry(0.55, 14, 10);
  const parts = [
    part(postG, color, [side, H / 2, 0]),
    part(postG, color, [-side, H / 2, 0]),
    part(ball, light, [side, H + 0.4, 0]),
    part(ball, light, [-side, H + 0.4, 0]),
  ];
  if (kind !== 'cp') parts.push(part(new THREE.BoxGeometry(side * 2, 1.3, 0.45), color, [0, H - 0.4, 0]));
  else parts.push(part(new THREE.BoxGeometry(side * 2, 0.35, 0.3), color, [0, H - 0.1, 0]));
  // little pennant flags
  const flagG = new THREE.ConeGeometry(0.28, 0.6, 3);
  const flagCols = [0xff5a5a, 0xffd23f, 0x5ad1ff, 0x7be07b, 0xff8fd8];
  const nf = Math.round(side * 2.2);
  for (let i = 0; i < nf; i++) {
    const x = -side + ((i + 0.5) / nf) * side * 2;
    parts.push(part(flagG, flagCols[i % flagCols.length], [x, H - (kind === 'cp' ? 0.6 : 1.4), 0], [Math.PI, 0, 0]));
  }
  g.add(shadowed(new THREE.Mesh(merge(parts), ctx.mats.vcol)));
  if (kind !== 'cp') {
    const text = kind === 'goal' ? 'GOAL' : 'START';
    const tex = kind === 'goal' ? texture('finish') : bannerTexture(text, '#ff6a3d', '#ffffff');
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(side * 2 - 0.3, 1.1), new THREE.MeshBasicMaterial({ map: kind === 'goal' ? bannerTexture('GOAL', '#1d1d24', '#ffd23f') : tex, side: THREE.DoubleSide }));
    // one banner on each face of the beam: -z faces the runners, +z faces the far side
    plane.position.set(0, H - 0.4, -0.24);
    plane.rotation.y = Math.PI;
    g.add(plane);
    const plane2 = plane.clone();
    plane2.position.z = 0.24;
    plane2.rotation.y = 0;
    g.add(plane2);
  } else {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.7), new THREE.MeshBasicMaterial({ map: bannerTexture('CHECK POINT', '#2b7fd6', '#ffffff'), side: THREE.DoubleSide }));
    sign.position.set(0, H + 0.35, 0);
    sign.rotation.y = Math.PI; // face the runners coming towards it
    g.add(sign);
  }
  ctx.group.add(g);
  return g;
}

export function roundStoneVisual(ctx, x, y, z, r) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 1.2, 24), [ctx.mats.platSide, ctx.mats.plat, ctx.mats.platSide]));
  m.position.set(x, y - 0.6, z);
  ctx.group.add(m);
}

let bumperGeo = null;
export function bumperVisual(ctx, x, y, z, r, theme) {
  if (!bumperGeo || bumperGeo.userData.col !== theme.bumper) {
    const cap = theme.bumper ?? 0xff5a7a;
    const parts = [
      part(new THREE.CylinderGeometry(0.55, 0.7, 1.0, 14), 0xfff3dc, [0, 0.5, 0]),
      part(new THREE.SphereGeometry(1.1, 20, 12, 0, TAU, 0, Math.PI / 2), cap, [0, 0.9, 0], [0, 0, 0], [1, 0.75, 1]),
    ];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      parts.push(part(new THREE.SphereGeometry(0.18, 8, 6), 0xffffff, [Math.cos(a) * 0.75, 1.42, Math.sin(a) * 0.75], [0, 0, 0], [1, 0.5, 1]));
    }
    parts.push(part(new THREE.SphereGeometry(0.2, 8, 6), 0xffffff, [0, 1.72, 0], [0, 0, 0], [1, 0.5, 1]));
    bumperGeo = merge(parts);
    bumperGeo.userData.col = theme.bumper;
  }
  const m = shadowed(new THREE.Mesh(bumperGeo, ctx.mats.vcol));
  m.position.set(x, y, z);
  m.scale.setScalar(r / 1.1);
  ctx.group.add(m);
}

export function pillars(ctx, runs, groundY, theme) {
  if (theme.pillar === null) return;
  const P = theme.pillar || {};
  const list = [];
  for (const run of runs) {
    const S = run.samples;
    if (S.length < 2) continue;
    const len = S[S.length - 1].s - S[0].s;
    const n = Math.max(1, Math.round(len / (P.every ?? 18)));
    for (let i = 0; i < n; i++) {
      const target = S[0].s + ((i + 0.5) / n) * len;
      let k = 0;
      while (k < S.length - 1 && S[k + 1].s < target) k++;
      const a = S[k];
      const top = a.y - run.thick;
      const h = top - groundY;
      if (h < 1) continue;
      list.push({ x: a.x, z: a.z, top, h, w: a.w });
    }
  }
  if (!list.length) return;
  const r = P.r ?? 1.1;
  const geo = new THREE.CylinderGeometry(r * 0.85, r, 1, P.sides ?? 10);
  geo.translate(0, -0.5, 0);
  const mat = P.tex ? toon({ map: texture(P.tex) }) : toon({ color: P.color ?? 0x9a7a5a });
  const mesh = new THREE.InstancedMesh(geo, mat, list.length);
  const d = new THREE.Object3D();
  list.forEach((p, i) => {
    d.position.set(p.x, p.top, p.z);
    d.scale.set(1, p.h, 1);
    d.updateMatrix();
    mesh.setMatrixAt(i, d.matrix);
  });
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  ctx.group.add(mesh);
}

export { labelTexture };
