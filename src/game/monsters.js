// Monsters of every floor: beasts that charge (boar, wolf, bull), weapon
// wielders that chop / sweep / slam (kobolds, the Kobold Lord, the Taurus
// General) and flying wasps that dive. Each species is drawn as instanced
// body + instanced parts; one small state machine drives them all.
import * as THREE from 'three';
import { RNG } from '../core/noise.js';
import { FONT, roundRect } from './ui.js';
import { RIGS, rigGeometry } from './monsterRigs.js';

export const MONSTER_TYPES = {
  boar: {
    id: 'boar', name: '와일드 보어', level: 2, hp: 90, atk: 14, walk: 1.2, trot: 3.2, charge: 7.5,
    aggro: 8, leash: 36, windup: 0.6, attackT: 0.5, recover: 0.9, reach: 1.25, radius: 0.55, len: 1.5, height: 0.8,
    exp: 35, col: 18, scale: 1, shard: 0x9ad8ff, sound: 'grunt', rig: 'boar', style: 'charge', shadow: 1.6,
    drop: { id: 'boarHide', p: 0.3 },
  },
  wolf: {
    id: 'wolf', name: '그레이 울프', level: 4, hp: 135, atk: 20, walk: 1.5, trot: 4.8, charge: 9,
    aggro: 14, leash: 40, windup: 0.45, attackT: 0.36, recover: 0.7, reach: 1.35, radius: 0.45, len: 1.35, height: 0.95,
    exp: 60, col: 30, scale: 1, shard: 0xb8c8ff, sound: 'growl', rig: 'wolf', style: 'charge', shadow: 1.3, lunge: 1.4,
    drop: { id: 'wolfFang', p: 0.3 },
  },
  boss: {
    id: 'boss', name: '보어 킹', level: 9, hp: 1500, atk: 42, walk: 1.0, trot: 3.6, charge: 9.5,
    aggro: 18, leash: 55, windup: 1.0, attackT: 0.75, recover: 1.5, reach: 1.25, radius: 0.55, len: 1.5, height: 0.8,
    exp: 700, col: 800, scale: 2.7, shard: 0xffb080, sound: 'roar', boss: true, rig: 'boar', style: 'charge',
    tint: [0.85, 0.55, 0.5], shadow: 1.6, respawn: 90, drop: { id: 'boarTusk', p: 1 },
  },
  kobold: {
    id: 'kobold', name: '루인 코볼트 센티널', level: 6, hp: 260, atk: 30, walk: 1.3, trot: 3.5, charge: 2.4,
    aggro: 13, leash: 34, windup: 0.62, attackT: 0.42, recover: 0.85, reach: 1.25, radius: 0.34, len: 0.6, height: 1.6,
    exp: 110, col: 45, scale: 1, shard: 0xffb8a0, sound: 'growl', rig: 'kobold', style: 'melee', upright: true,
    shadow: 1.1, respawn: 45, drop: { id: 'koboldScrap', p: 0.35 },
  },
  koboldLord: {
    id: 'koboldLord', name: '코볼트 로드', level: 10, hp: 3200, atk: 50, walk: 1.2, trot: 3.3, charge: 3.2,
    aggro: 22, leash: 70, windup: 0.95, attackT: 0.5, recover: 1.15, reach: 1.2, radius: 0.36, len: 0.6, height: 1.7,
    exp: 2600, col: 3000, scale: 2.3, shard: 0xff9a70, sound: 'roar', rig: 'koboldLord', style: 'melee', upright: true,
    boss: true, floorBoss: true, sweep: true, shadow: 1.2, noRespawn: true, summon: 'kobold', drop: { id: 'lordCoat', p: 1 },
  },
  bull: {
    id: 'bull', name: '트렘블 오록스', level: 8, hp: 320, atk: 38, walk: 1.1, trot: 3.4, charge: 10,
    aggro: 11, leash: 40, windup: 0.8, attackT: 0.55, recover: 1.05, reach: 1.35, radius: 0.62, len: 1.8, height: 1.0,
    exp: 150, col: 55, scale: 1.1, shard: 0xe8d0a8, sound: 'moo', rig: 'bull', style: 'charge', shadow: 2.1,
    drop: { id: 'bullHorn', p: 0.35 },
  },
  wasp: {
    id: 'wasp', name: '윈드 와스프', level: 9, hp: 200, atk: 34, walk: 2.2, trot: 4.6, charge: 9,
    aggro: 15, leash: 42, windup: 0.6, attackT: 0.5, recover: 0.9, reach: 0.62, radius: 0.3, len: 0.9, height: 0.2,
    exp: 170, col: 60, scale: 1.3, shard: 0xffe070, sound: 'buzz', rig: 'wasp', style: 'dive', flying: true, hover: 1.55,
    shadow: 0.9, drop: { id: 'waspSting', p: 0.35 },
  },
  taurus: {
    id: 'taurus', name: '타우러스 제너럴', level: 14, hp: 6500, atk: 70, walk: 1.1, trot: 3.1, charge: 3.4,
    aggro: 24, leash: 60, windup: 1.05, attackT: 0.55, recover: 1.25, reach: 1.25, radius: 0.46, len: 0.7, height: 1.9,
    exp: 5200, col: 6000, scale: 2.4, shard: 0xffc890, sound: 'roar', rig: 'taurus', style: 'melee', upright: true,
    boss: true, sweep: true, slam: true, shadow: 1.5, respawn: 300, drop: { id: 'taurusHorn', p: 1 },
  },
};

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
    this.sprite.visible = false;
    this.key = '';
  }
  draw(m) {
    const f = m.hp / m.maxHp;
    const key = `${m.def.name}|${Math.ceil(f * 100)}|${m.aggro}`;
    if (key === this.key) return;
    this.key = key;
    const g = this.c.getContext('2d');
    g.clearRect(0, 0, 320, 120);
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
export function segSegDist(p1, q1, p2, q2, outA, outB) {
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

const ease = (k) => 1 - Math.pow(1 - THREE.MathUtils.clamp(k, 0, 1), 2.4);
const REST_ARM = -0.35;

// ---------------------------------------------------------------- system
export class Monsters {
  /**
   * cfg: { height(x,z), colliders?, keepOut?(pos, r), spawns: [{ type, x, z, dormant?, noRespawn? }], seed? }
   */
  constructor(scene, game, cfg) {
    this.group = new THREE.Group();
    this.group.name = 'monsters';
    scene.add(this.group);
    this.game = game;
    this.cfg = cfg;
    this.h = cfg.height;
    this.list = [];
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    // count instances per rig
    const counts = {};
    for (const s of cfg.spawns) {
      const rig = MONSTER_TYPES[s.type].rig;
      counts[rig] = (counts[rig] || 0) + 1;
    }
    this.rigs = {};
    for (const [name, n] of Object.entries(counts)) {
      const def = RIGS[name];
      const geo = rigGeometry(name);
      const body = this._inst(geo.body, n);
      const parts = {};
      for (const key of Object.keys(geo.geos)) {
        const per = def.parts.filter((p) => p.key === key).length;
        parts[key] = { mesh: this._inst(geo.geos[key], n * per), per };
      }
      // index of each part within its key group
      const idxInKey = [];
      const seen = {};
      for (const p of def.parts) { idxInKey.push(seen[p.key] || 0); seen[p.key] = (seen[p.key] || 0) + 1; }
      this.rigs[name] = { def, body, parts, idxInKey, used: 0 };
    }
    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._m3 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
    this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this.time = 0;
    this.rng = new RNG(cfg.seed || 77);
    for (const s of cfg.spawns) this.spawn(s.type, s.x, s.z, s);
  }

  _inst(geo, n) {
    const m = new THREE.InstancedMesh(geo, this.mat, Math.max(1, n));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3).fill(1), 3);
    m.frustumCulled = false;
    m.castShadow = false;
    m.count = 0;
    this.group.add(m);
    return m;
  }

  get boss() {
    return this.list.find((m) => m.def.boss) || null;
  }

  spawn(typeId, x, z, opts = {}) {
    const def = MONSTER_TYPES[typeId];
    const rig = this.rigs[def.rig];
    const slot = rig.used++;
    const bar = new Bar();
    this.group.add(bar.sprite);
    const y = this.h(x, z);
    const m = {
      def, rig, slot, bar,
      home: new THREE.Vector3(x, y, z),
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(),
      yaw: opts.yaw ?? Math.random() * Math.PI * 2,
      state: 'idle', t: Math.random() * 3,
      hp: def.hp, maxHp: def.hp,
      alive: !opts.dormant, aggro: false,
      phase: Math.random() * 10, speed: 0,
      flash: 0, hitCd: 0, hitPlayer: false, pitch: 0, hop: 0,
      spawnK: 1, respawn: opts.dormant ? Infinity : 0, wanderTarget: null,
      scale: def.scale * (def.boss ? 1 : 0.92 + Math.random() * 0.16),
      armX: REST_ARM, armY: 0, armTX: REST_ARM, armTY: 0,
      fly: def.hover || 0, cd: 1 + Math.random() * 2, strafe: Math.random() < 0.5 ? 1 : -1,
      atk: 'chop', phase2: false, summoned: false, dormant: !!opts.dormant,
      noRespawn: !!(opts.noRespawn || def.noRespawn), slamCd: 4, speedMul: 1,
    };
    if (m.dormant) m.state = 'dead';
    this.list.push(m);
    return m;
  }

  // wake up dormant minions around a point (boss summons)
  summon(typeId, n, around) {
    let k = 0;
    for (const m of this.list) {
      if (k >= n) break;
      if (m.def.id !== typeId || !m.dormant || m.alive) continue;
      const a = Math.random() * Math.PI * 2;
      const x = around.x + Math.sin(a) * 5, z = around.z + Math.cos(a) * 5;
      m.pos.set(x, this.h(x, z), z);
      m.home.copy(m.pos);
      this._revive(m);
      m.aggro = true;
      m.state = 'chase';
      m.fromBoss = true;
      this.game.effects.pillar(m.pos.clone(), 0xff6a40, 0.8, 4, 1.2);
      k++;
    }
    return k;
  }

  _revive(m) {
    m.alive = true;
    m.hp = m.maxHp;
    m.state = 'idle';
    m.t = 1;
    m.spawnK = 0;
    m.aggro = false;
    m.phase2 = false;
    m.summoned = false;
    m.speedMul = 1;
    m.fly = m.def.hover || 0;
    m.armTX = m.armX = REST_ARM;
    m.armTY = m.armY = 0;
  }

  // world-space point on an animated part (weapon tips)
  partPoint(m, partIdx, local, out) {
    const p = m.rig.def.parts[partIdx];
    const s = m.scale;
    this._e.set(m.pitch, m.yaw, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    this._m.compose(this._v.set(m.pos.x, m.pos.y + m.hop * s, m.pos.z), this._q, this._s.set(s, s, s));
    this._partMatrix(m, p, this._m2);
    return out.set(local[0], local[1], local[2]).applyMatrix4(this._m2).applyMatrix4(this._m);
  }

  bodyPoint(m, local, out) {
    const s = m.scale;
    this._e.set(m.pitch, m.yaw, 0, 'YXZ');
    this._q.setFromEuler(this._e);
    this._m.compose(this._v.set(m.pos.x, m.pos.y + m.hop * s, m.pos.z), this._q, this._s.set(s, s, s));
    return out.set(local[0], local[1], local[2]).applyMatrix4(this._m);
  }

  // arm pitch that makes a horizontal sweep pass at chest height, whatever the size
  sweepPitch(m) {
    const p = m.rig.def.parts[this.weaponPart(m)];
    const L = Math.hypot(p.tip[1], p.tip[2]);
    const drop = p.pivot[1] - 1.15 / m.scale;
    return -Math.acos(THREE.MathUtils.clamp(drop / L, -1, 1));
  }

  _partMatrix(m, p, out) {
    if (p.kind === 'arm') {
      this._e.set(m.armX, m.armY, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      out.makeRotationFromQuaternion(this._q);
    } else if (p.kind === 'wing') {
      const flap = 0.25 + Math.sin(this.time * 52 + m.slot * 1.7) * 0.75;
      this._e.set(0, p.side < 0 ? Math.PI : 0, flap, 'YXZ');
      this._q.setFromEuler(this._e);
      out.makeRotationFromQuaternion(this._q);
    } else {
      const amp = Math.min(0.7, m.speed * (m.def.upright ? 0.2 : 0.12));
      out.makeRotationX(Math.sin(m.phase + p.phase) * amp);
    }
    out.setPosition(p.pivot[0], p.pivot[1], p.pivot[2]);
    return out;
  }

  weaponPart(m) {
    const parts = m.rig.def.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 'arm' && (!p.show || p.show(m))) return i;
    }
    return -1;
  }

  // front / strike point of a monster in world space
  headPos(m, out) {
    const s = m.scale;
    if (m.def.style === 'melee') {
      const i = this.weaponPart(m);
      return this.partPoint(m, i, m.rig.def.parts[i].tip, out);
    }
    if (m.def.flying) return this.bodyPoint(m, [0, -0.3, -0.2], out);
    return out.set(Math.sin(m.yaw) * m.def.len * 0.55 * s, m.def.height * s * 0.85, Math.cos(m.yaw) * m.def.len * 0.55 * s).add(m.pos);
  }

  capsule(m, a, b) {
    const s = m.scale;
    const d = m.def;
    const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
    if (d.upright) {
      a.set(m.pos.x, m.pos.y + 0.35 * s, m.pos.z);
      b.set(m.pos.x + fx * 0.05 * s, m.pos.y + d.height * s * 0.92, m.pos.z + fz * 0.05 * s);
      return;
    }
    if (d.flying) {
      a.set(m.pos.x - fx * 0.45 * s, m.pos.y - 0.08 * s, m.pos.z - fz * 0.45 * s);
      b.set(m.pos.x + fx * 0.35 * s, m.pos.y, m.pos.z + fz * 0.35 * s);
      return;
    }
    const h = d.height * s;
    const L = d.len * 0.5 * s;
    a.set(m.pos.x - fx * L * 0.8, m.pos.y + h, m.pos.z - fz * L * 0.8);
    b.set(m.pos.x + fx * L, m.pos.y + h * 0.95, m.pos.z + fz * L);
  }

  hitRadius(m) {
    const d = m.def;
    return (d.upright ? 0.3 : d.flying ? 0.24 : d.radius) * m.scale + 0.03;
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
      if (m.pos.distanceToSquared(sword.tip) > 36 * m.scale * m.scale + 9) continue;
      this.capsule(m, A, B);
      const rad = this.hitRadius(m);
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

  // parry check: blade crossing the monster's head / weapon during an attack
  blocks(m, sword) {
    const hp = this.headPos(m, new THREE.Vector3());
    const ca = new THREE.Vector3(), cb = new THREE.Vector3();
    const d = segSegDist(sword.base, sword.tip, hp, hp, ca, cb);
    const r = m.def.style === 'melee' ? 0.32 + 0.06 * m.scale : 0.3 * m.scale;
    return d < r;
  }

  damage(m, amount, dir) {
    if (!m.alive) return false;
    m.hp -= amount;
    m.flash = 1;
    m.hitCd = 0.28;
    if (!m.aggro) this.game.audio.play(m.def.sound, { pos: m.pos, vol: m.def.boss ? 1 : 0.7 });
    m.aggro = true;
    if (dir && !m.def.boss) {
      m.vel.set(dir.x, 0, dir.z).normalize().multiplyScalar(m.def.flying ? 6 : 4.5);
    }
    // bosses keep attacking through hits (super armor); everyone else flinches
    if (!(m.def.boss && (m.state === 'attack' || m.state === 'windup' || m.state === 'roar'))) {
      m.state = 'hurt';
      m.t = m.def.boss ? 0.12 : 0.28;
      m.armTX = REST_ARM;
      m.armTY = 0;
    }
    if (m.def.boss) this._bossPhases(m);
    if (m.hp <= 0) {
      this.kill(m);
      return true;
    }
    return false;
  }

  _bossPhases(m) {
    const f = m.hp / m.maxHp;
    if (m.def.summon && !m.summoned && f < 0.55) {
      m.summoned = true;
      if (this.summon(m.def.summon, 2, m.pos)) this.game.onBossEvent?.(m, 'summon');
    }
    if (!m.phase2 && f < (m.def.floorBoss ? 0.3 : 0.5) && m.hp > 0) {
      m.phase2 = true;
      m.speedMul = 1.3;
      m.state = 'roar';
      m.t = 1.5;
      m.slamCd = 1.5;
      this.game.onBossEvent?.(m, 'phase2');
    }
  }

  kill(m) {
    m.alive = false;
    m.hp = 0;
    m.state = 'dead';
    m.respawn = m.noRespawn || m.fromBoss ? Infinity : m.def.respawn ?? 22;
    if (m.fromBoss) m.dormant = true;
    m.aggro = false;
    const center = m.pos.clone();
    center.y += m.def.height * m.scale * (m.def.flying ? 0 : 0.8);
    this.game.effects.shatter(center, 0.6 * m.scale, m.def.shard, m.def.boss ? 260 : 80, Math.max(0.6, m.def.height * m.scale));
    this.game.audio.play('shatter', { pos: center, vol: m.def.boss ? 1.4 : 1, rate: m.def.boss ? 0.8 : 1 });
    m.bar.sprite.visible = false;
    this.game.onMonsterKilled(m);
  }

  // boss gave up (player died / fled): heal back and reset its phases
  _resetBoss(m) {
    m.phase2 = false;
    m.summoned = false;
    m.speedMul = 1;
    for (const o of this.list) {
      if (o.fromBoss && o.alive) {
        o.alive = false;
        o.dormant = true;
        o.state = 'dead';
        o.respawn = Infinity;
        o.bar.sprite.visible = false;
      }
    }
  }

  update(dt, player) {
    this.time += dt;
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

  _startAttack(m, dist) {
    const d = m.def;
    m.state = 'windup';
    m.t = d.windup * (m.phase2 ? 0.72 : 1);
    m.hitPlayer = false;
    if (d.style === 'melee') {
      const canSlam = (d.slam || m.phase2) && m.slamCd <= 0 && dist > 2.5 * m.scale * 0.5;
      if (canSlam && Math.random() < (m.phase2 ? 0.45 : 0.3)) {
        m.atk = 'slam';
        m.t *= 1.25;
        m.slamCd = m.phase2 ? 5 : 8;
        const tp = this.game.player.feet;
        m.slamAt = new THREE.Vector3(tp.x, 0, tp.z);
        const R = this.slamRadius(m);
        this.game.effects.telegraph(new THREE.Vector3(tp.x, this.h(tp.x, tp.z), tp.z), R, m.t + d.attackT, 0xff3a2a);
      } else {
        m.atk = d.sweep && Math.random() < 0.4 ? 'sweep' : 'chop';
      }
      if (m.atk === 'sweep') { m.armTX = this.sweepPitch(m); m.armTY = -1.5; }
      else { m.armTX = -3.3; m.armTY = 0; }
    }
    this.game.audio.play(d.sound, { pos: m.pos, vol: d.boss ? 1.2 : 0.8, rate: (d.boss ? 0.9 : 1) + Math.random() * 0.2 });
  }

  slamRadius(m) {
    return 1.8 * m.scale;
  }

  _updateOne(m, dt, pp, safe, player) {
    const def = m.def;
    if (!m.alive) {
      m.respawn -= dt;
      if (m.respawn <= 0) {
        this._revive(m);
        m.pos.copy(m.home);
      }
      return;
    }
    m.spawnK = Math.min(1, m.spawnK + dt * 1.5);
    m.flash = Math.max(0, m.flash - dt * 5);
    m.hitCd = Math.max(0, m.hitCd - dt);
    m.slamCd -= dt;
    m.cd -= dt;
    m.t -= dt;
    const dx = pp.x - m.pos.x, dz = pp.z - m.pos.z;
    const dist = Math.hypot(dx, dz);
    const toYaw = Math.atan2(dx, dz);
    const homeDist = Math.hypot(m.pos.x - m.home.x, m.pos.z - m.home.z);
    let targetSpeed = 0;
    let faceYaw = null;
    const alive = player.hp > 0 && !player.dead;
    const sp = m.speedMul;

    if ((safe || !alive) && m.aggro && m.state !== 'return') {
      m.aggro = false;
      m.state = 'return';
      m.armTX = REST_ARM;
      m.armTY = 0;
    }

    switch (m.state) {
      case 'idle':
        if (m.t <= 0) {
          m.state = 'wander';
          const a = Math.random() * Math.PI * 2, r = Math.random() * (def.boss ? 4 : 10);
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
        if (def.style === 'dive') {
          // circle the player at a distance, then dive in
          if (dist > 4.6) targetSpeed = def.trot;
          else if (dist < 2.6) targetSpeed = -def.walk;
          else {
            m.pos.x += Math.cos(toYaw) * m.strafe * def.walk * 0.8 * dt;
            m.pos.z -= Math.sin(toYaw) * m.strafe * def.walk * 0.8 * dt;
            if (Math.random() < dt * 0.3) m.strafe *= -1;
          }
          if (m.cd <= 0 && dist < 5.5 && dist > 1.6) this._startAttack(m, dist);
        } else {
          targetSpeed = def.trot * sp;
          const reach = def.style === 'melee' ? def.reach * m.scale + 0.7 : def.reach * m.scale + 1.6 + (def.lunge || 0) * 0.55;
          if (dist < reach) this._startAttack(m, dist);
        }
        if (homeDist > def.leash) {
          m.state = 'return';
          m.aggro = false;
          m.armTX = REST_ARM;
          m.armTY = 0;
        }
        break;
      case 'roar':
        m.pitch = THREE.MathUtils.lerp(m.pitch, -0.2, dt * 5);
        m.armTX = -2.6;
        if (m.t <= 0) {
          m.state = 'chase';
          m.armTX = REST_ARM;
        }
        break;
      case 'windup':
        faceYaw = def.style === 'melee' && m.atk === 'slam' ? Math.atan2(m.slamAt.x - m.pos.x, m.slamAt.z - m.pos.z) : toYaw;
        if (def.style === 'dive') {
          m.fly = THREE.MathUtils.lerp(m.fly, def.hover + 0.6, dt * 3);
          targetSpeed = -0.8;
          m.pitch = THREE.MathUtils.lerp(m.pitch, -0.9, dt * 6);
        } else if (def.style === 'melee') {
          m.pitch = THREE.MathUtils.lerp(m.pitch, m.atk === 'slam' ? -0.12 : 0.05, dt * 6);
        } else {
          m.pitch = THREE.MathUtils.lerp(m.pitch, -0.18, dt * 8);
        }
        if (m.t <= 0) {
          m.state = 'attack';
          m.t = def.attackT * (m.atk === 'slam' ? 1.5 : 1);
          m.hitPlayer = false;
          m.attackDir = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw));
          if (def.style === 'dive') {
            const head = this.game.player.head;
            const from = this.headPos(m, new THREE.Vector3());
            m.attackDir.set(head.x, head.y - 0.35, head.z).sub(from).normalize();
          }
          if (m.atk === 'slam') m.slamFrom = m.pos.clone();
        }
        break;
      case 'attack':
        this._attack(m, dt, pp, alive);
        break;
      case 'recover':
        m.pitch = THREE.MathUtils.lerp(m.pitch, 0, dt * 5);
        if (def.style === 'dive') {
          m.fly = THREE.MathUtils.lerp(m.fly, def.hover, dt * 2.5);
          targetSpeed = -def.walk * 0.6;
          faceYaw = toYaw;
        }
        if (m.t <= 0) {
          m.state = m.aggro ? 'chase' : 'idle';
          m.cd = 1.8 + Math.random() * 2.2;
        }
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
        if (m.hp >= m.maxHp && def.boss && (m.phase2 || m.summoned)) this._resetBoss(m);
        if (Math.hypot(hx, hz) < 1.5) {
          m.state = 'idle';
          m.t = 2;
          if (def.boss) { m.hp = m.maxHp; this._resetBoss(m); }
        }
        break;
      }
    }
    // aggro checks
    if ((m.state === 'idle' || m.state === 'wander') && !safe && alive && dist < def.aggro && Math.abs(pp.y - m.pos.y) < 6) {
      m.aggro = true;
      m.state = 'chase';
      this.game.audio.play(def.sound, { pos: m.pos, vol: def.boss ? 1.4 : 0.7 });
      if (def.boss) this.game.onBossAggro(m);
    }

    // arm easing (weapon wielders)
    if (def.style === 'melee' && m.state !== 'attack') {
      const k = Math.min(1, dt * (m.state === 'windup' ? 7 : 4));
      m.armX += (m.armTX - m.armX) * k;
      m.armY += (m.armTY - m.armY) * k;
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
    const rad = def.radius * m.scale;
    if (this.cfg.colliders && !def.flying) this.cfg.colliders.resolve(m.pos, rad * 0.8);
    if (this.cfg.keepOut) this.cfg.keepOut(m.pos, rad);
    const ground = this.h(m.pos.x, m.pos.z);
    if (def.flying) {
      if (m.state === 'idle' || m.state === 'wander' || m.state === 'chase' || m.state === 'return') {
        m.fly = THREE.MathUtils.lerp(m.fly, def.hover, dt * 2);
      }
      m.fly = Math.max(0.45, m.fly);
      m.pos.y = ground + m.fly + Math.sin(this.time * 2.3 + m.slot) * 0.08;
      if (m.state !== 'windup' && m.state !== 'attack') m.pitch = THREE.MathUtils.lerp(m.pitch, 0.08, dt * 3);
    } else {
      m.pos.y = ground;
    }
    m.phase += dt * (Math.abs(m.speed) * 3.2 / Math.max(0.6, m.scale));
  }

  _attack(m, dt, pp, alive) {
    const def = m.def;
    const T = def.attackT * (m.atk === 'slam' ? 1.5 : 1);
    const k = 1 - m.t / T;
    const player = this.game.player;
    if (def.style === 'melee') {
      if (m.atk === 'slam') {
        // leap onto the marked spot, hammer / axe first
        const to = m.slamAt;
        const u = ease(k);
        m.pos.x = THREE.MathUtils.lerp(m.slamFrom.x, to.x - Math.sin(m.yaw) * 1.1 * m.scale, u);
        m.pos.z = THREE.MathUtils.lerp(m.slamFrom.z, to.z - Math.cos(m.yaw) * 1.1 * m.scale, u);
        m.hop = Math.sin(k * Math.PI) * 0.9;
        m.armX = THREE.MathUtils.lerp(-3.4, -0.4, ease(Math.max(0, (k - 0.45) / 0.55)));
        m.pitch = THREE.MathUtils.lerp(m.pitch, 0.15, dt * 6);
        if (m.t <= 0) {
          m.hop = 0;
          const R = this.slamRadius(m);
          const ip = new THREE.Vector3(to.x, this.h(to.x, to.z), to.z);
          this.game.onSlam?.(m, ip, R);
          if (alive && Math.hypot(pp.x - to.x, pp.z - to.z) < R && !player.airborne) {
            const dir = new THREE.Vector3(pp.x - to.x, 0, pp.z - to.z);
            if (dir.lengthSq() < 1e-4) dir.set(Math.sin(m.yaw), 0, Math.cos(m.yaw));
            this.game.onPlayerHit(m, Math.round(def.atk * 1.35 * (0.9 + Math.random() * 0.2)), dir.normalize());
          }
          m.state = 'recover';
          m.t = def.recover * 1.2;
          m.armTX = REST_ARM;
        }
        return;
      }
      if (m.atk === 'sweep') {
        m.armX = m.armTX;
        m.armY = THREE.MathUtils.lerp(-1.5, 1.5, ease(k));
      } else {
        m.armX = THREE.MathUtils.lerp(-3.3, -0.35, ease(k));
        m.armY = 0;
      }
      m.pitch = THREE.MathUtils.lerp(m.pitch, 0.12, dt * 8);
      m.speed = def.charge * (1 - k);
      m.pos.addScaledVector(m.attackDir, def.charge * dt * (1 - k));
      if (!m.hitPlayer && alive && k > 0.2 && k < 0.9) {
        const tip = this.headPos(m, this._v);
        const bx = tip.x - pp.x, bz = tip.z - pp.z;
        const r = 0.55 + 0.1 * m.scale;
        const inY = tip.y > pp.y - 0.3 && tip.y < player.head.y + 0.4;
        if (bx * bx + bz * bz < r * r && inY) {
          m.hitPlayer = true;
          if (this.game.sword && this.blocks(m, this.game.sword)) {
            this.game.onParry(m, tip.clone());
            m.state = 'recover';
            m.t = def.recover * 1.6;
            m.armTX = REST_ARM;
            m.armTY = 0;
            m.vel.copy(m.attackDir).multiplyScalar(-4);
            return;
          }
          this.game.onPlayerHit(m, Math.round(def.atk * (0.85 + Math.random() * 0.3)), m.attackDir.clone());
        }
      }
      if (m.t <= 0) {
        m.state = 'recover';
        m.t = def.recover * (m.phase2 ? 0.75 : 1);
        m.armTX = REST_ARM;
        m.armTY = 0;
      }
      return;
    }
    if (def.style === 'dive') {
      m.pitch = THREE.MathUtils.lerp(m.pitch, -1.1, dt * 10);
      const v = def.charge * (1 - k * 0.4);
      m.pos.x += m.attackDir.x * v * dt;
      m.pos.z += m.attackDir.z * v * dt;
      m.fly += m.attackDir.y * v * dt;
      m.speed = v;
      if (!m.hitPlayer && alive) {
        const hp = this.headPos(m, this._v);
        const head = player.head;
        const chest = this._v2.set(head.x, head.y - 0.35, head.z);
        // distance from the stinger to the player's body (a short vertical segment)
        const dy = hp.y > head.y ? hp.y - head.y : hp.y < pp.y + 0.5 ? pp.y + 0.5 - hp.y : 0;
        const dxz = Math.hypot(hp.x - chest.x, hp.z - chest.z);
        if (Math.hypot(dxz, dy) < def.reach * m.scale * 0.6 + 0.2) {
          m.hitPlayer = true;
          if (this.game.sword && this.blocks(m, this.game.sword)) {
            this.game.onParry(m, hp.clone());
            m.state = 'recover';
            m.t = def.recover * 1.5;
            m.vel.copy(m.attackDir).setY(0).multiplyScalar(-6);
            return;
          }
          this.game.onPlayerHit(m, Math.round(def.atk * (0.85 + Math.random() * 0.3)), m.attackDir.clone());
        }
      }
      if (m.t <= 0) {
        m.state = 'recover';
        m.t = def.recover;
      }
      return;
    }
    // charge (beasts)
    m.pitch = THREE.MathUtils.lerp(m.pitch, 0.12, dt * 10);
    m.pos.addScaledVector(m.attackDir, def.charge * dt * (1 - k * 0.5));
    if (def.lunge) m.hop = Math.sin(k * Math.PI) * 0.6;
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
          m.hop = 0;
          return;
        }
        this.game.onPlayerHit(m, Math.round(def.atk * (0.85 + Math.random() * 0.3)), m.attackDir.clone());
      }
    }
    if (m.t <= 0) {
      m.state = 'recover';
      m.t = def.recover;
      m.hop = 0;
    }
  }

  _render(player) {
    const cam = player.head;
    const now = performance.now();
    for (const r of Object.values(this.rigs)) r.dirty = false;
    for (const m of this.list) {
      const rig = m.rig;
      const def = m.def;
      const s = m.alive ? m.scale * m.spawnK : 0;
      if (s === 0) {
        rig.body.setMatrixAt(m.slot, this._zero);
        rig.def.parts.forEach((p, i) => {
          const pm = rig.parts[p.key];
          pm.mesh.setMatrixAt(m.slot * pm.per + rig.idxInKey[i], this._zero);
        });
        m.bar.sprite.visible = false;
        continue;
      }
      const bob = def.flying ? 0 : Math.abs(Math.sin(m.phase)) * 0.03 * Math.min(1, Math.abs(m.speed) / 3) * m.scale;
      this._e.set(m.pitch, m.yaw, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      this._v.set(m.pos.x, m.pos.y + bob + m.hop * m.scale, m.pos.z);
      this._m.compose(this._v, this._q, this._s.set(s, s, s));
      rig.body.setMatrixAt(m.slot, this._m);
      // color: flash white on hit, reddish tint during windup / enraged bosses
      const base = def.tint || (m.phase2 ? [1.25, 0.7, 0.62] : [1, 1, 1]);
      const wind = m.state === 'windup' || m.state === 'roar' ? 0.4 + 0.4 * Math.sin(now / 50) : 0;
      this._c.setRGB(base[0] + m.flash * 3 + wind, base[1] + m.flash * 3, base[2] + m.flash * 3);
      rig.body.setColorAt(m.slot, this._c);
      rig.def.parts.forEach((p, i) => {
        const pm = rig.parts[p.key];
        const idx = m.slot * pm.per + rig.idxInKey[i];
        if (p.show && !p.show(m)) {
          pm.mesh.setMatrixAt(idx, this._zero);
          return;
        }
        this._partMatrix(m, p, this._m2);
        this._m3.multiplyMatrices(this._m, this._m2);
        pm.mesh.setMatrixAt(idx, this._m3);
        pm.mesh.setColorAt(idx, this._c);
      });
      // bar
      const bar = m.bar;
      if (cam) {
        const d = cam.distanceTo(m.pos);
        const show = d < (def.boss ? 50 : 22) && m.spawnK >= 1;
        bar.sprite.visible = show;
        if (show) {
          bar.draw(m);
          const top = def.flying ? 0.7 : def.height + 0.75;
          bar.sprite.position.set(m.pos.x, m.pos.y + top * m.scale + 0.25, m.pos.z);
          const sc = def.boss ? 2.2 : 1;
          bar.sprite.scale.set(1.2 * sc, 0.45 * sc, 1);
        }
      } else bar.sprite.visible = false;
    }
    for (const r of Object.values(this.rigs)) {
      r.body.count = r.used;
      r.body.instanceMatrix.needsUpdate = true;
      r.body.instanceColor.needsUpdate = true;
      for (const pm of Object.values(r.parts)) {
        pm.mesh.count = r.used * pm.per;
        pm.mesh.instanceMatrix.needsUpdate = true;
        pm.mesh.instanceColor.needsUpdate = true;
      }
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

  // reset aggro when the player leaves this map
  calm() {
    for (const m of this.list) {
      if (!m.alive) continue;
      if (m.aggro) {
        m.aggro = false;
        m.state = 'return';
      }
    }
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
