// Townsfolk: instanced cloaked villagers strolling ring streets, plus the
// interactive NPCs (quest givers, merchants, mini-game hosts) with floating
// markers and name tags. One instance per town; the layout comes from config.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/noise.js';
import { FONT, roundRect } from './ui.js';

// tintSel per vertex: 0 = fixed colour, 1 = per-instance tint A, 2 = tint B
function paint(geo, color, sel = 0, shade = true) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  const p = out.attributes.position;
  const c = new Float32Array(p.count * 3);
  const t = new Float32Array(p.count).fill(sel);
  const base = new THREE.Color(color);
  for (let i = 0; i < p.count; i++) {
    const k = shade ? 0.6 + 0.4 * Math.min(1, Math.max(0, p.getY(i) / 1.5)) : 1;
    c[i * 3] = base.r * k; c[i * 3 + 1] = base.g * k; c[i * 3 + 2] = base.b * k;
  }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  out.setAttribute('tintSel', new THREE.BufferAttribute(t, 1));
  return out;
}
const SKIN = 0xf0c8a8;

// torso + head (+ hair, face, belt). Local +Z forward, feet at y = 0.
function bodyGeometry() {
  const prof = [[0.0, 0.58], [0.215, 0.58], [0.205, 0.72], [0.18, 0.92], [0.2, 1.1], [0.215, 1.28], [0.2, 1.4], [0.09, 1.47], [0.0, 1.48]].map(([x, y]) => new THREE.Vector2(x, y));
  const tunic = new THREE.LatheGeometry(prof, 10);
  tunic.scale(1, 1, 0.78);
  const collar = new THREE.TorusGeometry(0.075, 0.025, 4, 10);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 1.47, 0);
  const belt = new THREE.TorusGeometry(0.18, 0.028, 3, 12);
  belt.rotateX(Math.PI / 2);
  belt.scale(1, 1, 0.8);
  belt.translate(0, 0.94, 0);
  const buckle = new THREE.BoxGeometry(0.06, 0.05, 0.02);
  buckle.translate(0, 0.94, 0.15);
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8);
  neck.translate(0, 1.52, 0);
  const head = new THREE.SphereGeometry(0.105, 10, 7);
  head.scale(1, 1.12, 1.02);
  head.translate(0, 1.64, 0.01);
  const nose = new THREE.ConeGeometry(0.018, 0.04, 5);
  nose.rotateX(Math.PI / 2);
  nose.translate(0, 1.63, 0.115);
  const ears = [-1, 1].map((s) => new THREE.SphereGeometry(0.022, 4, 3).scale(0.6, 1, 1).translate(s * 0.104, 1.64, 0));
  const eyes = [-1, 1].map((s) => new THREE.SphereGeometry(0.014, 4, 3).translate(s * 0.038, 1.665, 0.098));
  const brows = [-1, 1].map((s) => new THREE.BoxGeometry(0.035, 0.008, 0.01).translate(s * 0.038, 1.69, 0.103));
  const mouth = new THREE.BoxGeometry(0.04, 0.007, 0.01).translate(0, 1.6, 0.104);
  const hair = new THREE.SphereGeometry(0.114, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
  hair.scale(1, 1.08, 1.04);
  hair.rotateX(-0.42);
  hair.translate(0, 1.66, -0.005);
  const hairBack = new THREE.SphereGeometry(0.11, 7, 4, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.45);
  hairBack.translate(0, 1.64, -0.012);
  return mergeGeometries([
    paint(tunic, 0xeeeeee, 1),
    paint(collar, 0xdddddd, 1, false),
    paint(belt, 0x3a2a1e, 0, false),
    paint(buckle, 0xc9a24a, 0, false),
    paint(neck, SKIN, 0, false),
    paint(head, SKIN, 0, false),
    paint(nose, 0xe8b898, 0, false),
    ...ears.map((e) => paint(e, 0xe8b898, 0, false)),
    ...eyes.map((e) => paint(e, 0x1a1410, 0, false)),
    ...brows.map((e) => paint(e, 0xffffff, 2, false)),
    paint(mouth, 0xa86a5a, 0, false),
    paint(hair, 0xffffff, 2, false),
    paint(hairBack, 0xffffff, 2, false),
  ]);
}

// one leg, pivot at the hip; trousers tinted (A), boot fixed
function legGeometry() {
  const leg = new THREE.CylinderGeometry(0.068, 0.052, 0.74, 8, 2);
  leg.translate(0, -0.37, 0);
  const boot = new THREE.BoxGeometry(0.105, 0.11, 0.22);
  boot.translate(0, -0.775, 0.035);
  const cuff = new THREE.CylinderGeometry(0.062, 0.062, 0.06, 8);
  cuff.translate(0, -0.7, 0);
  return mergeGeometries([paint(leg, 0xffffff, 1, false), paint(boot, 0x3a2a1e, 0, false), paint(cuff, 0x2e2218, 0, false)]);
}

// one arm, pivot at the shoulder; sleeve tinted like the tunic (A)
function armGeometry() {
  const sleeve = new THREE.CylinderGeometry(0.058, 0.046, 0.5, 7, 2);
  sleeve.translate(0, -0.25, 0);
  const hand = new THREE.SphereGeometry(0.042, 7, 5);
  hand.scale(0.85, 1.2, 0.7);
  hand.translate(0, -0.55, 0.01);
  return mergeGeometries([paint(sleeve, 0xe4e4e4, 1, false), paint(hand, SKIN, 0, false)]);
}

function tintMaterial(roughness) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float tintSel;\nattribute vec3 iTintA;\nattribute vec3 iTintB;')
      .replace('#include <color_vertex>', `#include <color_vertex>
  vColor.rgb *= tintSel < 0.5 ? vec3(1.0) : (tintSel < 1.5 ? iTintA : iTintB);`);
    // soft rim light so figures read clearly against busy backgrounds
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_fragment_end>',
      `#include <lights_fragment_end>
  { float rim = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);
    reflectedLight.indirectDiffuse += diffuseColor.rgb * rim * 0.35; }`
    );
  };
  mat.customProgramCacheKey = () => 'npc-tint';
  return mat;
}

function tintedInstances(geo, mat, count) {
  const g = geo.clone();
  const a = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
  const b = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
  g.setAttribute('iTintA', a);
  g.setAttribute('iTintB', b);
  const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, count));
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.userData.setTint = (i, ca, cb) => {
    a.setXYZ(i, ca.r, ca.g, ca.b);
    if (cb) b.setXYZ(i, cb.r, cb.g, cb.b);
    a.needsUpdate = b.needsUpdate = true;
  };
  return mesh;
}

const HAIR = ['#1e1612', '#3a2618', '#5a3a22', '#8a5a2e', '#c99a5a', '#b04a2a', '#7a7470', '#2a2a30'];
const PANTS = ['#3a3028', '#4a4a50', '#2e3440', '#5a4632', '#3a4232', '#6a5a48'];
const HIP = 0.86, HIP_X = 0.095, SHOULDER = 1.38, SHOULDER_X = 0.235;

export function markerSprite(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set(0.45, 0.45, 1);
  s.renderOrder = 16;
  s.userData.set = (k) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 128, 128);
    if (!k) { tex.needsUpdate = true; return; }
    g.beginPath();
    g.arc(64, 64, 50, 0, Math.PI * 2);
    const colors = { coin: '#f7c948', '?': '#6fd06f', '!': '#f0a020', game: '#3aa6ff', fish: '#2fb4c8', anvil: '#9a8a7a', pet: '#ff8ab0', music: '#b07aff', info: '#6a7a90' };
    g.fillStyle = colors[k] || '#f0a020';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fillStyle = '#fff';
    const glyph = { coin: 'C', game: '★', fish: '≈', anvil: '⚒', pet: '♥', music: '♪', info: 'i' }[k] || k;
    g.font = `900 ${glyph.length > 1 ? 50 : 72}px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(glyph, 64, 90);
    tex.needsUpdate = true;
  };
  s.userData.set(kind);
  return s;
}

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 80;
  const g = c.getContext('2d');
  g.font = `700 40px ${FONT}`;
  const w = Math.min(500, g.measureText(text).width + 44);
  g.fillStyle = 'rgba(22,26,34,0.62)';
  roundRect(g, (512 - w) / 2, 8, w, 62, 31);
  g.fill();
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.fillText(text, 256, 53);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, toneMapped: false }));
  s.scale.set(0.9, 0.14, 1);
  s.renderOrder = 16;
  return s;
}

export class NPCs {
  /**
   * cfg: { seed, walkers, plazaR, plazaWalkers, streets: [r…], cloakColors?, specials: [{ id, name, x, z, yaw, color, marker, scale }], props?(group) }
   */
  constructor(scene, colliders, cfg) {
    this.group = new THREE.Group();
    this.group.name = 'npcs';
    scene.add(this.group);
    this.rng = new RNG(cfg.seed || 4242);
    const nWalk = cfg.walkers || 0;
    const N = nWalk + cfg.specials.length;
    const mat = tintMaterial(0.85);
    this.body = tintedInstances(bodyGeometry(), mat, N);
    this.legs = tintedInstances(legGeometry(), mat, N * 2);
    this.arms = tintedInstances(armGeometry(), mat, N * 2);
    this.cloak = this.body; // positions are read back from the body instances
    this.group.add(this.body, this.legs, this.arms);
    const paintPerson = (idx, tunic, rng) => {
      const hair = new THREE.Color(rng.pick(HAIR));
      const pants = new THREE.Color(rng.pick(PANTS));
      this.body.userData.setTint(idx, tunic, hair);
      this.legs.userData.setTint(idx * 2, pants);
      this.legs.userData.setTint(idx * 2 + 1, pants);
      this.arms.userData.setTint(idx * 2, tunic);
      this.arms.userData.setTint(idx * 2 + 1, tunic);
    };
    const cloakColors = cfg.cloakColors || ['#6d7f99', '#8a5a44', '#4f6d4a', '#8c8c8c', '#6b4f7a', '#a0824f', '#3f5870', '#9a4a4a', '#5a5a66', '#b8a888'];
    this.walkers = [];
    const streets = cfg.streets || [];
    for (let i = 0; i < nWalk; i++) {
      const plaza = i < (cfg.plazaWalkers ?? 8);
      const r = plaza ? cfg.plazaR + this.rng.range(-1, 1) : this.rng.pick(streets) + this.rng.range(-0.5, 0.8);
      this.walkers.push({
        r,
        a: this.rng.range(0, Math.PI * 2),
        dir: this.rng.chance(0.5) ? 1 : -1,
        speed: this.rng.range(0.8, 1.3),
        pause: 0,
        phase: this.rng.range(0, 10),
        h: this.rng.range(0.92, 1.08),
        color: new THREE.Color(this.rng.pick(cloakColors)),
      });
    }
    this.walkers.forEach((w, i) => paintPerson(i, w.color, this.rng));

    this.special = [];
    this.byId = {};
    for (const sp of cfg.specials) {
      const idx = this.walkers.length + this.special.length;
      const npc = {
        ...sp,
        pos: new THREE.Vector3(sp.x, sp.y || 0, sp.z),
        home: new THREE.Vector3(sp.x, sp.y || 0, sp.z),
        idx,
        scale: sp.scale || 1.05,
        color: new THREE.Color(sp.color),
        marker: markerSprite(sp.marker || null),
        tag: nameTag(sp.name),
        moving: 0,
        phase: 0,
        face: null,
        visible: true,
      };
      npc.markerKind = sp.marker || null;
      npc.marker.visible = !!sp.marker;
      npc.marker.position.set(npc.pos.x, npc.pos.y + 2.25 * npc.scale, npc.pos.z);
      this.group.add(npc.marker, npc.tag);
      paintPerson(idx, npc.color, this.rng);
      npc.collider = colliders.addCircle(sp.x, sp.z, 0.4);
      if (sp.dynamic) npc.collider.off = true;
      this.special.push(npc);
      this.byId[sp.id] = npc;
    }
    cfg.props?.(this.group, colliders, this);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._m2 = new THREE.Matrix4();
    this._m3 = new THREE.Matrix4();
    const n = this.walkers.length + this.special.length;
    this.body.count = n;
    this.legs.count = this.arms.count = n * 2;
  }

  setMarker(npc, kind) {
    if (!npc) return;
    npc.marker.userData.set(kind);
    npc.markerKind = kind;
    npc.marker.visible = !!kind && npc.visible;
  }

  update(dt, t, playerPos) {
    let i = 0;
    for (const w of this.walkers) {
      const x = Math.sin(w.a) * w.r, z = Math.cos(w.a) * w.r;
      const near = playerPos && Math.hypot(playerPos.x - x, playerPos.z - z) < 1.3;
      if (w.pause > 0) w.pause -= dt;
      else if (Math.random() < dt * 0.02) w.pause = 2 + Math.random() * 4;
      const moving = !near && w.pause <= 0;
      if (moving) {
        w.a += (w.dir * w.speed * dt) / w.r;
        w.phase += dt * w.speed * 5.5;
      }
      const yaw = w.a + (w.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      w.walk = THREE.MathUtils.lerp(w.walk || 0, moving ? 1 : 0, Math.min(1, dt * 6));
      const bob = Math.abs(Math.sin(w.phase)) * 0.035 * w.walk;
      const roll = Math.sin(w.phase) * 0.025 * w.walk;
      this._e.set(0, yaw, roll, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(x, bob, z), this._q, this._s.set(w.h, w.h, w.h));
      this.pose(i, this._m, w.phase, w.walk, t);
      i++;
    }
    for (const n of this.special) {
      let yaw = n.face ?? n.yaw;
      if (n.face === null && playerPos && playerPos.distanceTo(n.pos) < 5) yaw = Math.atan2(playerPos.x - n.pos.x, playerPos.z - n.pos.z);
      n.curYaw = n.curYaw === undefined ? yaw : n.curYaw + Math.atan2(Math.sin(yaw - n.curYaw), Math.cos(yaw - n.curYaw)) * Math.min(1, dt * (n.moving > 0.5 ? 10 : 4));
      n.phase += dt * n.moving * 2.2;
      const bob = n.moving > 0.2 ? Math.abs(Math.sin(n.phase)) * 0.05 * n.scale : 0;
      const roll = n.moving > 0.2 ? Math.sin(n.phase) * 0.05 : 0;
      const breathe = 1 + Math.sin(t * 2 + n.idx) * 0.008;
      this._e.set(n.lean || 0, n.curYaw, roll, 'YXZ');
      this._q.setFromEuler(this._e);
      const sc = n.visible ? n.scale : 0;
      this._m.compose(this._p.set(n.pos.x, n.pos.y + bob, n.pos.z), this._q, this._s.set(sc, sc * breathe, sc));
      this.pose(n.idx, this._m, n.phase * 2.5, n.visible ? Math.min(1, n.moving) : 0, t);
      const top = n.pos.y + 2.2 * n.scale;
      n.marker.position.set(n.pos.x, top + Math.sin(t * 2.5 + n.idx) * 0.06, n.pos.z);
      const d = playerPos ? Math.hypot(playerPos.x - n.pos.x, playerPos.z - n.pos.z) : 99;
      n.marker.visible = !!n.markerKind && n.visible;
      n.tag.visible = n.visible && d < 11;
      n.tag.position.set(n.pos.x, top - (n.marker.visible ? 0.36 : 0.05), n.pos.z);
    }
    this.body.instanceMatrix.needsUpdate = true;
    this.legs.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
  }

  // body matrix + swinging legs/arms (opposite phase), idle arm sway
  pose(i, M, phase, walk, t) {
    this.body.setMatrixAt(i, M);
    const swing = Math.sin(phase) * 0.55 * walk;
    const idle = Math.sin(t * 1.3 + i) * 0.04 * (1 - walk);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? -1 : 1;
      const legA = side * swing;
      this._m2.makeRotationX(legA);
      this._m2.setPosition(side * HIP_X, HIP, 0);
      this.legs.setMatrixAt(i * 2 + s, this._m3.multiplyMatrices(M, this._m2));
      const armA = -side * swing * 0.75 + idle;
      this._e.set(armA, 0, side * 0.09, 'XYZ');
      this._m2.makeRotationFromEuler(this._e);
      this._m2.setPosition(side * SHOULDER_X, SHOULDER, 0);
      this.arms.setMatrixAt(i * 2 + s, this._m3.multiplyMatrices(M, this._m2));
    }
  }

  // positions for blob shadows
  forEachPos(fn) {
    const tmp = this._m;
    const v = this._p;
    for (let k = 0; k < this.walkers.length; k++) {
      this.cloak.getMatrixAt(k, tmp);
      v.setFromMatrixPosition(tmp);
      fn(v.x, v.z, 0.9);
    }
    for (const n of this.special) if (n.visible) fn(n.pos.x, n.pos.z, 0.9 * n.scale);
  }

  nearest(p, maxDist = 2.4) {
    let best = null, bd = maxDist;
    for (const n of this.special) {
      if (!n.visible || n.noTalk) continue;
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
}
