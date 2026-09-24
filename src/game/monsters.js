// Field monsters: wild boars, grey wolves and the Boar King. Rendered as
// instanced bodies + instanced legs (4 draw calls for every monster in the
// world), driven by a small state machine AI.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt, TOWN, BOSS_ARENA } from '../world/layout.js';
import { RNG } from '../core/noise.js';
import { FONT, roundRect } from './ui.js';

export const MONSTER_TYPES = {
  boar: {
    id: 'boar', name: '와일드 보어', level: 2, hp: 90, atk: 14, walk: 1.2, trot: 3.2, charge: 7.5,
    aggro: 8, leash: 36, windup: 0.6, attackT: 0.5, recover: 0.9, reach: 1.25, radius: 0.55, len: 1.5, height: 0.8,
    exp: 35, col: 18, scale: 1, shard: 0x9ad8ff, sound: 'grunt',
  },
  wolf: {
    id: 'wolf', name: '그레이 울프', level: 4, hp: 135, atk: 20, walk: 1.5, trot: 4.8, charge: 9,
    aggro: 14, leash: 40, windup: 0.45, attackT: 0.36, recover: 0.7, reach: 1.35, radius: 0.45, len: 1.35, height: 0.95,
    exp: 60, col: 30, scale: 1, shard: 0xb8c8ff, sound: 'growl',
  },
  boss: {
    id: 'boss', name: '보어 킹', level: 9, hp: 1500, atk: 42, walk: 1.0, trot: 3.6, charge: 9.5,
    aggro: 18, leash: 55, windup: 1.0, attackT: 0.75, recover: 1.5, reach: 1.25, radius: 0.55, len: 1.5, height: 0.8,
    exp: 700, col: 800, scale: 2.7, shard: 0xffb080, sound: 'roar', boss: true,
  },
};

// ---------------------------------------------------------------- geometry
function part(geo, x, y, z, rx, ry, rz, sx, sy, sz, top, bottom = top) {
  const g = geo.clone();
  g.scale(sx, sy, sz);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  const ng = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', ng.attributes.position);
  out.setAttribute('normal', ng.attributes.normal);
  const p = out.attributes.position;
  const c = new Float32Array(p.count * 3);
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = maxY > minY ? (p.getY(i) - minY) / (maxY - minY) : 1;
    tmp.copy(cb).lerp(ct, k);
    c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
  }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return out;
}

function furry(geo, amount, seed) {
  // subtle lumpy displacement for a less "perfect sphere" look
  const g = geo.clone();
  const p = g.attributes.position;
  const rng = new RNG(seed);
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) { k = 1 + (rng.next() - 0.5) * amount; cache.set(key, k); }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const SPH = new THREE.SphereGeometry(1, 12, 8);
const SPH_S = new THREE.SphereGeometry(1, 6, 4);
const CONE = new THREE.ConeGeometry(1, 1, 6);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);

function boarGeometry() {
  const dark = '#4a3b33', mid = '#6e5a4d', belly = '#8b7565', bristle = '#241c18';
  const parts = [
    part(furry(SPH, 0.08, 1), 0, 0.8, -0.08, 0, 0, 0, 0.46, 0.44, 0.8, dark, belly),
    part(furry(SPH, 0.08, 2), 0, 0.92, 0.3, 0, 0, 0, 0.45, 0.48, 0.52, dark, mid),
    part(furry(SPH, 0.05, 3), 0, 0.74, 0.86, -0.25, 0, 0, 0.3, 0.3, 0.44, dark, mid),
    part(CYL, 0, 0.62, 1.22, Math.PI / 2 - 0.25, 0, 0, 0.14, 0.32, 0.15, mid, mid),
    part(CYL, 0, 0.58, 1.37, Math.PI / 2 - 0.25, 0, 0, 0.1, 0.03, 0.105, '#8a5c58', '#8a5c58'),
    part(SPH_S, 0.16, 0.82, 1.08, 0, 0, 0, 0.035, 0.035, 0.035, '#0c0808'),
    part(SPH_S, -0.16, 0.82, 1.08, 0, 0, 0, 0.035, 0.035, 0.035, '#0c0808'),
    part(CONE, 0.17, 1.0, 0.76, -0.4, 0, -0.5, 0.07, 0.17, 0.05, dark, mid),
    part(CONE, -0.17, 1.0, 0.76, -0.4, 0, 0.5, 0.07, 0.17, 0.05, dark, mid),
    part(CONE, 0.13, 0.64, 1.3, -0.6, 0, -0.45, 0.035, 0.24, 0.035, '#f4ecd8', '#d9ccb0'),
    part(CONE, -0.13, 0.64, 1.3, -0.6, 0, 0.45, 0.035, 0.24, 0.035, '#f4ecd8', '#d9ccb0'),
    part(CYL, 0, 0.82, -0.88, 0.9, 0, 0, 0.025, 0.3, 0.025, dark),
  ];
  for (let i = 0; i < 9; i++) {
    const z = -0.5 + i * 0.13;
    const y = 1.18 + Math.sin((i / 8) * Math.PI) * 0.14;
    parts.push(part(CONE, 0, y, z, -0.5, 0, 0, 0.07, 0.24, 0.05, bristle));
  }
  return mergeGeometries(parts);
}

function boarLeg() {
  return mergeGeometries([
    part(CYL, 0, -0.26, 0, 0, 0, 0, 0.08, 0.52, 0.08, '#4a3b33', '#3a2e28'),
    part(CYL, 0, -0.55, 0.01, 0, 0, 0, 0.06, 0.09, 0.07, '#1a1512'),
  ]);
}

function wolfGeometry() {
  const back = '#50555e', mid = '#7c8088', belly = '#c3bfb7';
  const parts = [
    part(furry(SPH, 0.06, 4), 0, 0.9, -0.1, 0, 0, 0, 0.3, 0.33, 0.72, back, belly),
    part(furry(SPH, 0.07, 5), 0, 0.95, 0.35, 0, 0, 0, 0.33, 0.42, 0.42, back, belly),
    part(CYL, 0, 1.08, 0.62, -0.9, 0, 0, 0.16, 0.36, 0.18, back, mid),
    part(furry(SPH, 0.04, 6), 0, 1.16, 0.82, 0, 0, 0, 0.21, 0.2, 0.26, back, mid),
    part(CONE, 0, 1.1, 1.1, Math.PI / 2, 0, 0, 0.1, 0.34, 0.09, mid, mid),
    part(SPH_S, 0, 1.1, 1.27, 0, 0, 0, 0.035, 0.03, 0.035, '#0a0a0a'),
    part(SPH_S, 0.1, 1.22, 0.99, 0, 0, 0, 0.03, 0.025, 0.02, '#ffcc33'),
    part(SPH_S, -0.1, 1.22, 0.99, 0, 0, 0, 0.03, 0.025, 0.02, '#ffcc33'),
    part(CONE, 0.11, 1.38, 0.76, -0.15, 0, -0.15, 0.065, 0.2, 0.04, back, mid),
    part(CONE, -0.11, 1.38, 0.76, -0.15, 0, 0.15, 0.065, 0.2, 0.04, back, mid),
    part(CONE, 0, 0.8, -0.95, -2.3, 0, 0, 0.11, 0.62, 0.11, mid, back),
  ];
  // neck ruff
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(part(CONE, Math.sin(a) * 0.2, 1.05 + Math.cos(a) * 0.12, 0.55, -1.2, 0, a, 0.08, 0.22, 0.06, mid, back));
  }
  return mergeGeometries(parts);
}

function wolfLeg() {
  return mergeGeometries([
    part(CYL, 0, -0.33, 0, 0, 0, 0, 0.06, 0.66, 0.06, '#50555e', '#8a8d93'),
    part(SPH_S, 0, -0.66, 0.03, 0, 0, 0, 0.06, 0.04, 0.08, '#3a3d42'),
  ]);
}

const HIPS = {
  boar: [[0.25, 0.6, 0.45], [-0.25, 0.6, 0.45], [0.25, 0.6, -0.5], [-0.25, 0.6, -0.5]],
  wolf: [[0.17, 0.72, 0.42], [-0.17, 0.72, 0.42], [0.17, 0.72, -0.5], [-0.17, 0.72, -0.5]],
};
const LEG_PHASE = [0, Math.PI, Math.PI, 0];

// ---------------------------------------------------------------- name/HP bar
class Bar {
  constructor() {
    this.c = document.createElement('canvas');
    this.c.width = 320;
    this.c.height = 120;
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
    this.sprite.scale.set(1.2, 0.45, 1);
    this.sprite.renderOrder = 15;
    this.key = '';
  }
  draw(m) {
    const f = m.hp / m.maxHp;
    const key = `${m.def.name}|${Math.ceil(f * 100)}|${m.aggro}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.c.getContext('2d');
    g.clearRect(0, 0, 320, 120);
    // cursor
    g.fillStyle = m.aggro ? '#ff4a5a' : '#ff9aa6';
    g.beginPath();
    g.moveTo(160 - 14, 4);
    g.lineTo(160 + 14, 4);
    g.lineTo(160, 26);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    g.stroke();
    g.font = `700 26px ${FONT}`;
    g.textAlign = 'center';
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    const label = `Lv${m.def.level}  ${m.def.name}`;
    g.strokeText(label, 160, 62);
    g.fillStyle = '#fff';
    g.fillText(label, 160, 62);
    g.fillStyle = 'rgba(20,24,30,0.75)';
    roundRect(g, 30, 76, 260, 22, 6);
    g.fill();
    g.fillStyle = f > 0.5 ? '#5fd46c' : f > 0.2 ? '#f2c640' : '#ef4b3f';
    roundRect(g, 34, 80, Math.max(0, 252 * f), 14, 4);
    g.fill();
    this.tex.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- segment math
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
function segSegDist(p1, q1, p2, q2, outA, outB) {
  _d1.subVectors(q1, p1);
  _d2.subVectors(q2, p2);
  _r.subVectors(p1, p2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  let s, t;
  if (a <= 1e-8 && e <= 1e-8) { s = t = 0; }
  else if (a <= 1e-8) { s = 0; t = THREE.MathUtils.clamp(f / e, 0, 1); }
  else {
    const c = _d1.dot(_r);
    if (e <= 1e-8) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
    else {
      const b = _d1.dot(_d2);
      const denom = a * e - b * b;
      s = denom !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
      else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
    }
  }
  outA.copy(p1).addScaledVector(_d1, s);
  outB.copy(p2).addScaledVector(_d2, t);
  return outA.distanceTo(outB);
}

// ---------------------------------------------------------------- system
export class Monsters {
  constructor(scene, game) {
    this.scene = scene;
    this.game = game;
    this.list = [];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 });
    this.mat = mat;
    const counts = { boar: 15, wolf: 11 };
    this.meshes = {};
    const bodyGeo = { boar: boarGeometry(), wolf: wolfGeometry() };
    const legGeo = { boar: boarLeg(), wolf: wolfLeg() };
    for (const k of ['boar', 'wolf']) {
      const body = new THREE.InstancedMesh(bodyGeo[k], mat, counts[k]);
      const legs = new THREE.InstancedMesh(legGeo[k], mat, counts[k] * 4);
      for (const m of [body, legs]) {
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.count * 3).fill(1), 3);
        m.frustumCulled = false;
        m.castShadow = false;
        scene.add(m);
      }
      this.meshes[k] = { body, legs, used: 0 };
    }
    this.bars = [];
    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this.spawnAll();
  }

  spawn(typeId, x, z, slotType = typeId === 'boss' ? 'boar' : typeId) {
    const def = MONSTER_TYPES[typeId];
    const mesh = this.meshes[slotType];
    const slot = mesh.used++;
    const bar = new Bar();
    this.scene.add(bar.sprite);
    const m = {
      def, slotType, slot, bar,
      home: new THREE.Vector3(x, heightAt(x, z), z),
      pos: new THREE.Vector3(x, heightAt(x, z), z),
      vel: new THREE.Vector3(),
      yaw: Math.random() * Math.PI * 2,
      state: 'idle', t: Math.random() * 3,
      hp: def.hp, maxHp: def.hp,
      alive: true, aggro: false,
      phase: Math.random() * 10, speed: 0,
      flash: 0, hitCd: 0, hitPlayer: false, pitch: 0, hop: 0,
      spawnK: 1, respawn: 0, wanderTarget: null, stun: 0,
      scale: def.scale * (def.boss ? 1 : 0.9 + Math.random() * 0.2),
    };
    this.list.push(m);
    return m;
  }

  spawnAll() {
    const rng = new RNG(77);
    // boars in the southern meadows and near the east road
    const boarZones = [[40, 175, 45], [-45, 205, 40], [70, 225, 35], [160, 40, 35]];
    for (let i = 0; i < 14; i++) {
      const zc = boarZones[i % boarZones.length];
      const a = rng.range(0, Math.PI * 2), r = rng.range(0, zc[2]);
      this.spawn('boar', zc[0] + Math.sin(a) * r, zc[1] + Math.cos(a) * r);
    }
    const wolfZones = [[175, 250, 40], [-225, 130, 35], [110, 300, 30]];
    for (let i = 0; i < 11; i++) {
      const zc = wolfZones[i % wolfZones.length];
      const a = rng.range(0, Math.PI * 2), r = rng.range(0, zc[2]);
      this.spawn('wolf', zc[0] + Math.sin(a) * r, zc[1] + Math.cos(a) * r);
    }
    this.boss = this.spawn('boss', BOSS_ARENA.x, BOSS_ARENA.z, 'boar');
  }

  // head (front) point of a monster in world space
  headPos(m, out) {
    const s = m.scale;
    return out.set(Math.sin(m.yaw) * m.def.len * 0.55 * s, m.def.height * s * 0.85, Math.cos(m.yaw) * m.def.len * 0.55 * s).add(m.pos);
  }

  capsule(m, a, b) {
    const s = m.scale;
    const h = m.def.height * s;
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    const L = m.def.len * 0.5 * s;
    a.set(m.pos.x - fx * L * 0.8, m.pos.y + h, m.pos.z - fz * L * 0.8);
    b.set(m.pos.x + fx * L, m.pos.y + h * 0.95, m.pos.z + fz * L);
  }

  // Returns list of hits for this frame's blade sweep
  sweep(sword, minSpeed) {
    const hits = [];
    if (sword.tipSpeed < minSpeed) return hits;
    const A = new THREE.Vector3(), B = new THREE.Vector3();
    const s0 = new THREE.Vector3(), s1 = new THREE.Vector3();
    const ca = new THREE.Vector3(), cb = new THREE.Vector3();
    for (const m of this.list) {
      if (!m.alive || m.spawnK < 1 || m.hitCd > 0) continue;
      if (m.pos.distanceToSquared(sword.tip) > 36 * m.scale * m.scale) continue;
      this.capsule(m, A, B);
      const rad = m.def.radius * m.scale + 0.03;
      for (let k = 0; k <= 3; k++) {
        const u = k / 3;
        s0.lerpVectors(sword.prevBase, sword.base, u);
        s1.lerpVectors(sword.prevTip, sword.tip, u);
        const d = segSegDist(s0, s1, A, B, ca, cb);
        if (d < rad) {
          hits.push({ m, point: ca.clone(), dir: sword.tipVel.clone().normalize() });
          break;
        }
      }
    }
    return hits;
  }

  // parry check: blade crossing the monster's head during an attack
  blocks(m, sword) {
    const hp = this.headPos(m, new THREE.Vector3());
    const ca = new THREE.Vector3(), cb = new THREE.Vector3();
    const d = segSegDist(sword.base, sword.tip, hp, hp, ca, cb);
    return d < 0.3 * m.scale;
  }

  damage(m, amount, dir) {
    if (!m.alive) return false;
    m.hp -= amount;
    m.flash = 1;
    m.hitCd = 0.28;
    if (!m.aggro) this.game.audio.play(m.def.sound, { pos: m.pos, vol: m.def.boss ? 1 : 0.7 });
    m.aggro = true;
    if (dir && !m.def.boss) {
      m.vel.set(dir.x, 0, dir.z).normalize().multiplyScalar(4.5);
    }
    // bosses keep charging through hits (super armor); everyone else flinches
    if (!(m.def.boss && (m.state === 'attack' || m.state === 'windup'))) {
      m.state = 'hurt';
      m.t = m.def.boss ? 0.12 : 0.28;
    }
    if (m.hp <= 0) {
      this.kill(m);
      return true;
    }
    return false;
  }

  kill(m) {
    m.alive = false;
    m.hp = 0;
    m.state = 'dead';
    m.respawn = m.def.boss ? 90 : 22;
    m.aggro = false;
    const center = m.pos.clone();
    center.y += m.def.height * m.scale * 0.8;
    this.game.effects.shatter(center, 0.6 * m.scale, m.def.shard, m.def.boss ? 260 : 80, m.def.height * m.scale);
    this.game.audio.play('shatter', { pos: center, vol: m.def.boss ? 1.4 : 1, rate: m.def.boss ? 0.8 : 1 });
    m.bar.sprite.visible = false;
    this.game.onMonsterKilled(m);
  }

  update(dt, player) {
    const pp = player.feet;
    const safe = player.inTown;
    for (const m of this.list) this._updateOne(m, dt, pp, safe, player);
    // separation
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const rr = (a.def.radius * a.scale + b.def.radius * b.scale) * 1.3;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (rr - d) * 0.5;
          a.pos.x -= (dx / d) * push; a.pos.z -= (dz / d) * push;
          b.pos.x += (dx / d) * push; b.pos.z += (dz / d) * push;
        }
      }
    }
    this._render(player);
  }

  _updateOne(m, dt, pp, safe, player) {
    const def = m.def;
    if (!m.alive) {
      m.respawn -= dt;
      if (m.respawn <= 0) {
        m.alive = true;
        m.hp = m.maxHp;
        m.pos.copy(m.home);
        m.state = 'idle';
        m.spawnK = 0;
        m.aggro = false;
      }
      return;
    }
    m.spawnK = Math.min(1, m.spawnK + dt * 1.5);
    m.flash = Math.max(0, m.flash - dt * 5);
    m.hitCd = Math.max(0, m.hitCd - dt);
    m.t -= dt;
    const dx = pp.x - m.pos.x, dz = pp.z - m.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(dx, dz);
    const homeDist = m.pos.distanceTo(m.home);
    let targetSpeed = 0;
    let faceYaw = null;
    const alive = player.hp > 0;

    if ((safe || !alive) && m.aggro && m.state !== 'return') {
      m.aggro = false;
      m.state = 'return';
    }

    switch (m.state) {
      case 'idle':
        if (m.t <= 0) {
          m.state = 'wander';
          const a = Math.random() * Math.PI * 2, r = Math.random() * 10;
          m.wanderTarget = new THREE.Vector3(m.home.x + Math.sin(a) * r, 0, m.home.z + Math.cos(a) * r);
          m.t = 6;
        }
        break;
      case 'wander': {
        const wx = m.wanderTarget.x - m.pos.x, wz = m.wanderTarget.z - m.pos.z;
        if (Math.hypot(wx, wz) < 0.8 || m.t <= 0) {
          m.state = 'idle';
          m.t = 2 + Math.random() * 4;
        } else {
          faceYaw = Math.atan2(wx, wz);
          targetSpeed = def.walk;
        }
        break;
      }
      case 'chase':
        faceYaw = toYaw;
        targetSpeed = def.trot;
        if (dist < def.reach * m.scale + 1.6 + (def.id === 'wolf' ? 0.8 : 0)) {
          m.state = 'windup';
          m.t = def.windup;
          this.game.audio.play(def.sound, { pos: m.pos, vol: def.boss ? 1.2 : 0.8, rate: 0.9 + Math.random() * 0.2 });
        } else if (homeDist > def.leash) {
          m.state = 'return';
          m.aggro = false;
        }
        break;
      case 'windup':
        faceYaw = toYaw;
        m.pitch = THREE.MathUtils.lerp(m.pitch, -0.18, dt * 8);
        if (m.t <= 0) {
          m.state = 'attack';
          m.t = def.attackT;
          m.hitPlayer = false;
          m.attackDir = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
        }
        break;
      case 'attack': {
        const k = 1 - m.t / def.attackT;
        m.pitch = THREE.MathUtils.lerp(m.pitch, 0.12, dt * 10);
        m.pos.addScaledVector(m.attackDir, def.charge * dt * (1 - k * 0.5));
        if (def.id === 'wolf') m.hop = Math.sin(k * Math.PI) * 0.6;
        m.speed = def.charge;
        if (!m.hitPlayer && alive) {
          const hp = this.headPos(m, this._v);
          const bx = hp.x - pp.x, bz = hp.z - pp.z;
          const reach = 0.55 * m.scale + 0.25;
          if (bx * bx + bz * bz < reach * reach) {
            m.hitPlayer = true;
            if (this.game.sword && this.blocks(m, this.game.sword)) {
              this.game.onParry(m, hp.clone());
              m.state = 'recover';
              m.t = def.recover * 1.6;
              m.vel.copy(m.attackDir).multiplyScalar(-5);
              break;
            }
            this.game.onPlayerHit(m, Math.round(def.atk * (0.85 + Math.random() * 0.3)), m.attackDir.clone());
          }
        }
        if (m.t <= 0) {
          m.state = 'recover';
          m.t = def.recover;
          m.hop = 0;
        }
        break;
      }
      case 'recover':
        m.pitch = THREE.MathUtils.lerp(m.pitch, 0, dt * 5);
        if (m.t <= 0) m.state = m.aggro ? 'chase' : 'idle';
        break;
      case 'hurt':
        m.pitch = THREE.MathUtils.lerp(m.pitch, 0.1, dt * 10);
        if (m.t <= 0) m.state = 'chase';
        break;
      case 'return': {
        const hx = m.home.x - m.pos.x, hz = m.home.z - m.pos.z;
        faceYaw = Math.atan2(hx, hz);
        targetSpeed = def.trot;
        m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.15 * dt);
        if (Math.hypot(hx, hz) < 1.5) {
          m.state = 'idle';
          m.t = 2;
        }
        break;
      }
    }
    // aggro checks
    if ((m.state === 'idle' || m.state === 'wander') && !safe && alive && dist < def.aggro) {
      m.aggro = true;
      m.state = 'chase';
      this.game.audio.play(def.sound, { pos: m.pos, vol: def.boss ? 1.4 : 0.7 });
      if (def.boss) this.game.onBossAggro(m);
    }

    // movement
    if (faceYaw !== null) {
      let d = faceYaw - m.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.yaw += d * Math.min(1, dt * (m.state === 'windup' ? 10 : 5));
    }
    if (m.state !== 'attack') {
      m.speed = THREE.MathUtils.lerp(m.speed, targetSpeed, dt * 4);
      m.pos.x += Math.sin(m.yaw) * m.speed * dt;
      m.pos.z += Math.cos(m.yaw) * m.speed * dt;
    }
    m.pos.addScaledVector(m.vel, dt);
    m.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
    // stay out of town
    const r = Math.hypot(m.pos.x, m.pos.z);
    const minR = TOWN.safeR + 4 + m.def.radius * m.scale;
    if (r < minR) {
      m.pos.x *= minR / r;
      m.pos.z *= minR / r;
    }
    m.pos.y = heightAt(m.pos.x, m.pos.z);
    m.phase += dt * (m.speed * 3.2 / Math.max(0.6, m.scale));
  }

  _render(player) {
    for (const k of ['boar', 'wolf']) this.meshes[k].dirty = false;
    const cam = player.head;
    for (const m of this.list) {
      const mesh = this.meshes[m.slotType];
      const s = m.alive ? m.scale * m.spawnK : 0;
      const bob = Math.abs(Math.sin(m.phase)) * 0.03 * Math.min(1, m.speed / 3) * m.scale;
      this._e.set(m.pitch, m.yaw, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      this._v.set(m.pos.x, m.pos.y + bob + m.hop * m.scale, m.pos.z);
      this._m.compose(this._v, this._q, this._s.set(s, s, s));
      mesh.body.setMatrixAt(m.slot, this._m);
      // color: flash white on hit, reddish tint during windup, boss tint
      const base = m.def.boss ? [0.85, 0.55, 0.5] : [1, 1, 1];
      const wind = m.state === 'windup' ? 0.4 + 0.4 * Math.sin(performance.now() / 50) : 0;
      this._c.setRGB(base[0] + m.flash * 3 + wind, base[1] + m.flash * 3, base[2] + m.flash * 3);
      mesh.body.setColorAt(m.slot, this._c);
      const hips = HIPS[m.slotType];
      const amp = Math.min(0.7, m.speed * 0.12);
      for (let i = 0; i < 4; i++) {
        const swing = Math.sin(m.phase + LEG_PHASE[i]) * amp;
        this._m2.makeRotationX(swing);
        this._m2.setPosition(hips[i][0], hips[i][1], hips[i][2]);
        const lm = this._m.clone().multiply(this._m2);
        mesh.legs.setMatrixAt(m.slot * 4 + i, lm);
        mesh.legs.setColorAt(m.slot * 4 + i, this._c);
      }
      mesh.dirty = true;
      // bar
      const bar = m.bar;
      if (m.alive && cam) {
        const d = cam.distanceTo(m.pos);
        const show = d < (m.def.boss ? 45 : 22) && m.spawnK >= 1;
        bar.sprite.visible = show;
        if (show) {
          bar.draw(m);
          bar.sprite.position.set(m.pos.x, m.pos.y + (m.def.height + 0.75) * m.scale + 0.2, m.pos.z);
          const sc = m.def.boss ? 2.2 : 1;
          bar.sprite.scale.set(1.2 * sc, 0.45 * sc, 1);
        }
      } else bar.sprite.visible = false;
    }
    for (const k of ['boar', 'wolf']) {
      const mesh = this.meshes[k];
      mesh.body.count = mesh.used;
      mesh.legs.count = mesh.used * 4;
      mesh.body.instanceMatrix.needsUpdate = true;
      mesh.legs.instanceMatrix.needsUpdate = true;
      mesh.body.instanceColor.needsUpdate = true;
      mesh.legs.instanceColor.needsUpdate = true;
    }
  }

  nearestAggro(p) {
    let best = null, bd = Infinity;
    for (const m of this.list) {
      if (!m.alive || !m.aggro) continue;
      const d = m.pos.distanceTo(p);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }
}
