// The player's one-handed sword: procedural model, a motion trail, velocity
// tracking for swing-based damage, and the desktop swing animation.
import * as THREE from 'three';

export const SWORDS = {
  starter: {
    name: '초심자의 장검',
    desc: '시작의 마을 대장간에서 지급하는 평범한 장검. 가볍고 다루기 쉽다. (공격력 +0%)',
    blade: 0xd9dee7,
    edge: 0x9fd8ff,
    guard: 0x8a7a55,
    atk: 1.0,
    skill: 0x4ab8ff,
  },
  azure: {
    name: '청은의 장검',
    desc: '보어 킹의 어금니로 벼려낸 푸른 은빛 장검. 소드 스킬의 위력이 크게 오른다. (공격력 +50%)',
    blade: 0x2b3140,
    edge: 0x6fd0ff,
    guard: 0xd0a24a,
    atk: 1.5,
    skill: 0x6fe8ff,
  },
};

function bladeGeometry(len = 0.95, w = 0.043, t = 0.0065, tipLen = 0.2) {
  const segs = 10;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    const y = 0.12 + u * len;
    const fromTip = (1 - u) * len;
    const k = fromTip < tipLen ? Math.pow(fromTip / tipLen, 0.8) : 1;
    const ww = w * k * (1 - u * 0.12);
    const tt = t * (0.35 + 0.65 * k);
    pos.push(-ww, y, 0, 0, y, tt, ww, y, 0, 0, y, -tt);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let f = 0; f < 4; f++) {
      const f1 = (f + 1) % 4;
      idx.push(a + f, a + f1, b + f, a + f1, b + f1, b + f);
    }
  }
  // base cap
  idx.push(0, 2, 1, 0, 3, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

export function buildSwordModel(def) {
  const group = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: def.blade, metalness: 0.95, roughness: 0.28, emissive: 0x000000, envMapIntensity: 1.0 });
  const guardMat = new THREE.MeshStandardMaterial({ color: def.guard, metalness: 0.9, roughness: 0.35 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.85 });
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x1a3a6a, emissive: def.edge, emissiveIntensity: 1.2, roughness: 0.2 });
  const blade = new THREE.Mesh(bladeGeometry(), bladeMat);
  group.add(blade);
  // edge glow strip (becomes bright during sword skills)
  const edgeMat = new THREE.MeshBasicMaterial({ color: def.edge, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const edge = new THREE.Mesh(bladeGeometry(0.97, 0.056, 0.012, 0.22), edgeMat);
  edge.position.y = -0.005;
  group.add(edge);
  // fuller line
  const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.62, 0.0135), new THREE.MeshStandardMaterial({ color: 0x5a6070, metalness: 1, roughness: 0.3 }));
  fuller.position.y = 0.12 + 0.35;
  group.add(fuller);
  // cross guard
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.026, 0.036), guardMat);
  guard.position.y = 0.105;
  group.add(guard);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), guardMat);
    tip.position.set(s * 0.105, 0.115, 0);
    group.add(tip);
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 6), guardMat);
    wing.position.set(s * 0.06, 0.13, 0);
    wing.rotation.z = -s * 0.5;
    group.add(wing);
  }
  const center = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.045), guardMat);
  center.position.y = 0.105;
  group.add(center);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.013, 0), gemMat);
  gem.position.set(0, 0.105, 0.024);
  group.add(gem);
  // grip with wrap rings
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.19, 10), gripMat);
  grip.position.y = -0.0;
  group.add(grip);
  for (let i = 0; i < 5; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0035, 5, 12), gripMat);
    r.rotation.x = Math.PI / 2;
    r.position.y = -0.08 + i * 0.04;
    group.add(r);
  }
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), guardMat);
  pommel.position.y = -0.115;
  group.add(pommel);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return { group, bladeMat, edgeMat, gemMat, guardMat };
}

// Ribbon trail made from the last N blade positions.
class Trail {
  constructor(n = 18) {
    this.n = n;
    this.base = [];
    this.tip = [];
    for (let i = 0; i < n; i++) {
      this.base.push(new THREE.Vector3());
      this.tip.push(new THREE.Vector3());
    }
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const idx = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2, b = a + 2;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    g.setIndex(idx);
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.color = new THREE.Color(0xffffff);
    this.init = false;
  }
  push(b, t, strength) {
    if (!this.init) {
      for (let i = 0; i < this.n; i++) { this.base[i].copy(b); this.tip[i].copy(t); }
      this.init = true;
    }
    const lastB = this.base.pop();
    const lastT = this.tip.pop();
    lastB.copy(b);
    lastT.copy(t);
    this.base.unshift(lastB);
    this.tip.unshift(lastT);
    const c = this.color;
    for (let i = 0; i < this.n; i++) {
      const k = 1 - i / (this.n - 1);
      this.pos.set([this.base[i].x, this.base[i].y, this.base[i].z], i * 6);
      this.pos.set([this.tip[i].x, this.tip[i].y, this.tip[i].z], i * 6 + 3);
      const a = strength * k * k;
      this.col.set([c.r, c.g, c.b, 0], i * 8);
      this.col.set([c.r, c.g, c.b, a], i * 8 + 4);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
    this.mesh.visible = strength > 0.01;
  }
}

// Desktop swing arcs expressed in camera space: blade direction keys + hand keys.
const ARCS = [
  { dirs: [[1, 0.15, -0.3], [0.1, 0, -1], [-1, -0.2, -0.25]], hands: [[0.34, -0.2, -0.3], [0.02, -0.22, -0.5], [-0.34, -0.28, -0.34]], name: 'h1' },
  { dirs: [[-1, 0.1, -0.3], [-0.1, -0.05, -1], [1, -0.25, -0.3]], hands: [[-0.3, -0.2, -0.32], [0.0, -0.24, -0.5], [0.36, -0.3, -0.32]], name: 'h2' },
  { dirs: [[0.1, 1, 0.25], [0.02, 0.35, -1], [0, -0.85, -0.55]], hands: [[0.16, 0.08, -0.28], [0.06, -0.1, -0.5], [0.02, -0.42, -0.42]], name: 'v' },
  { dirs: [[0.8, 0.85, -0.1], [0.05, 0.05, -1], [-0.75, -0.75, -0.3]], hands: [[0.3, 0.02, -0.3], [0.04, -0.18, -0.5], [-0.3, -0.4, -0.35]], name: 'd' },
];

const _up = new THREE.Vector3(0, 1, 0);

function slerpDir(out, a, b, t) {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const th = Math.acos(dot) * t;
  const rel = b.clone().addScaledVector(a, -dot);
  if (rel.lengthSq() < 1e-8) return out.copy(a);
  rel.normalize();
  return out.copy(a).multiplyScalar(Math.cos(th)).addScaledVector(rel, Math.sin(th));
}

export class Sword {
  constructor(scene, def = SWORDS.starter) {
    this.scene = scene;
    this.root = new THREE.Group(); // attached to grip or desktop pivot
    this.holder = new THREE.Group(); // angle adjustment
    this.root.add(this.holder);
    this.setDef(def);
    this.trail = new Trail();
    scene.add(this.trail.mesh);
    this.base = new THREE.Vector3();
    this.tip = new THREE.Vector3();
    this.prevBase = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.tipVel = new THREE.Vector3();
    this.tipSpeed = 0;
    this.smoothSpeed = 0;
    this.glow = 0;
    this.skillColor = new THREE.Color(def.skill);
    this.first = true;
    // desktop
    this.swing = null;
    this.swingIdx = 0;
    this.restPos = new THREE.Vector3(0.3, -0.34, -0.5);
    this.restDir = new THREE.Vector3(0.3, 0.72, -0.62).normalize();
    this.curDir = this.restDir.clone();
    this.curHand = this.restPos.clone();
    this.lastSwingT = 0;
  }

  setDef(def) {
    this.def = def;
    if (this.model) this.holder.remove(this.model.group);
    this.model = buildSwordModel(def);
    this.holder.add(this.model.group);
    this.skillColor = new THREE.Color(def.skill);
  }

  // VR: blade along -Z of grip space, with adjustable upward tilt
  mountVR(grip, angleDeg) {
    grip.add(this.root);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.holder.rotation.set(-Math.PI / 2 + THREE.MathUtils.degToRad(angleDeg), 0, 0);
    this.holder.position.set(0, 0, 0.01);
    this.mode = 'vr';
    this.first = true;
  }

  mountDesktop(camera) {
    camera.add(this.root);
    this.holder.rotation.set(0, 0, 0);
    this.holder.position.set(0, 0, 0);
    this.mode = 'desktop';
    this.first = true;
    this._applyDesktopPose();
  }

  startSwing(skill = false) {
    if (this.swing && this.swing.t < this.swing.dur * 0.75) return false;
    const arc = ARCS[skill ? 2 + (this.swingIdx % 2) : this.swingIdx % 2];
    this.swingIdx++;
    this.swing = { arc, t: 0, dur: skill ? 0.26 : 0.3, recover: 0.2, dirs: arc.dirs.map((d) => new THREE.Vector3(...d).normalize()), hands: arc.hands.map((h) => new THREE.Vector3(...h)), skill };
    return arc.name;
  }

  _applyDesktopPose() {
    const q = new THREE.Quaternion().setFromUnitVectors(_up, this.curDir);
    this.root.quaternion.copy(q);
    // roll the edge to face the swing plane a little
    this.root.position.copy(this.curHand);
  }

  updateDesktop(dt) {
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      if (s.t <= s.dur) {
        const u = s.t / s.dur;
        const e = 1 - Math.pow(1 - u, 2.2);
        const seg = e < 0.5 ? 0 : 1;
        const lt = e < 0.5 ? e * 2 : (e - 0.5) * 2;
        slerpDir(this.curDir, s.dirs[seg], s.dirs[seg + 1], lt);
        this.curHand.lerpVectors(s.hands[seg], s.hands[seg + 1], lt);
      } else if (s.t <= s.dur + s.recover) {
        const u = (s.t - s.dur) / s.recover;
        slerpDir(this.curDir, s.dirs[2], this.restDir, u);
        this.curHand.lerpVectors(s.hands[2], this.restPos, u);
      } else {
        this.swing = null;
        this.curDir.copy(this.restDir);
        this.curHand.copy(this.restPos);
      }
    } else {
      // idle sway
      const t = performance.now() / 1000;
      this.curHand.copy(this.restPos).add(new THREE.Vector3(Math.sin(t * 1.3) * 0.005, Math.sin(t * 2.1) * 0.006, 0));
    }
    this._applyDesktopPose();
  }

  get swinging() {
    return !!(this.swing && this.swing.t <= this.swing.dur);
  }

  // Samples blade endpoints in world space and computes tip speed.
  track(dt, trailStrength = 0) {
    this.prevBase.copy(this.base);
    this.prevTip.copy(this.tip);
    this.model.group.updateWorldMatrix(true, false);
    this.base.set(0, 0.16, 0).applyMatrix4(this.model.group.matrixWorld);
    this.tip.set(0, 1.07, 0).applyMatrix4(this.model.group.matrixWorld);
    if (this.first) {
      this.prevBase.copy(this.base);
      this.prevTip.copy(this.tip);
      this.first = false;
    }
    this.tipVel.subVectors(this.tip, this.prevTip).divideScalar(Math.max(dt, 1e-3));
    this.tipSpeed = this.tipVel.length();
    this.smoothSpeed += (this.tipSpeed - this.smoothSpeed) * Math.min(1, dt * 12);
    const speedTrail = THREE.MathUtils.clamp((this.smoothSpeed - 2.5) / 5, 0, 1);
    this.trail.color.copy(this.glow > 0.05 ? this.skillColor : new THREE.Color(0xdde8ff));
    this._trailBase = (this._trailBase || new THREE.Vector3()).lerpVectors(this.base, this.tip, 0.45);
    this.trail.push(this._trailBase, this.tip, Math.max(speedTrail * 0.3, trailStrength * 0.85));
  }

  setGlow(v) {
    this.glow = v;
    this.model.edgeMat.opacity = v * 0.9;
    this.model.bladeMat.emissive.copy(this.skillColor).multiplyScalar(v * 0.6);
    this.model.gemMat.emissiveIntensity = 1.2 + v * 3;
  }

  setVisible(v) {
    this.root.visible = v;
    this.trail.mesh.visible = v && this.trail.mesh.visible;
  }
}
