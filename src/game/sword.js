// The player's one-handed sword: procedural model, a motion trail, velocity
// tracking for swing-based damage, and the desktop swing animation.
import * as THREE from 'three';

export const SWORDS = {
  starter: {
    id: 'starter',
    name: '초심자의 장검',
    desc: '시작의 마을 대장간에서 지급하는 평범한 장검. 가볍고 다루기 쉽다. (공격력 +0%)',
    blade: 0xd9dee7,
    edge: 0x9fd8ff,
    guard: 0x8a7a55,
    atk: 1.0,
    skill: 0x4ab8ff,
  },
  azure: {
    id: 'azure',
    name: '청은의 장검',
    desc: '보어 킹의 어금니로 벼려낸 푸른 은빛 장검. 소드 스킬의 위력이 크게 오른다. (공격력 +50%)',
    blade: 0x2b3140,
    edge: 0x6fd0ff,
    guard: 0xd0a24a,
    atk: 1.5,
    skill: 0x6fe8ff,
  },
  terra: {
    id: 'terra',
    name: '대지의 검 테라',
    desc: '메사의 심장석과 타우러스의 뿔로 벼린 황금빛 장검. 묵직하지만 휘두를 때마다 대지의 힘이 실린다. (공격력 +110%)',
    blade: 0x8a7a5a,
    edge: 0xffc860,
    guard: 0x5a3a1a,
    atk: 2.1,
    skill: 0xffb040,
  },
};

// Hexagonal blade cross-section: flat faces + bevelled cutting edges, built
// as two meshes so the bevels can have their own (glossier / glowing) material.
function bladeParts(len = 0.93, w = 0.04, t = 0.0062, bevel = 0.011, tipLen = 0.21, ricasso = 0.05) {
  const segs = 14;
  const flat = [], edge = [];
  const ring = (u) => {
    const y = 0.125 + u * len;
    const fromTip = (1 - u) * len;
    const k = fromTip < tipLen ? Math.pow(fromTip / tipLen, 0.85) : 1;
    const ric = u * len < ricasso ? 0.82 : 1;
    const ww = w * k * (1 - u * 0.1) * ric;
    const bb = Math.min(bevel * (0.6 + 0.4 * k), ww * 0.9);
    const tt = t * (0.45 + 0.55 * k);
    // order: right edge, right-top, left-top, left edge, left-bottom, right-bottom
    return [[ww, y, 0], [ww - bb, y, tt], [-(ww - bb), y, tt], [-ww, y, 0], [-(ww - bb), y, -tt], [ww - bb, y, -tt]];
  };
  const quad = (arr, a, b, c, d) => arr.push(...a, ...b, ...c, ...b, ...d, ...c);
  for (let i = 0; i < segs; i++) {
    const r0 = ring(i / segs), r1 = ring((i + 1) / segs);
    const faces = [[0, 1, 'e'], [1, 2, 'f'], [2, 3, 'e'], [3, 4, 'e'], [4, 5, 'f'], [5, 0, 'e']];
    for (const [p, q, kind] of faces) quad(kind === 'f' ? flat : edge, r0[p], r0[q], r1[p], r1[q]);
  }
  // base cap
  const r0 = ring(0);
  for (const [a, b2, c] of [[0, 1, 5], [1, 2, 5], [2, 4, 5], [2, 3, 4]]) flat.push(...r0[a], ...r0[c], ...r0[b2]);
  const mk = (arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  };
  return { flat: mk(flat), edge: mk(edge) };
}

// tapered tube along a list of points (radius r0 → r1)
function taperTube(pts, r0, r1, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 16, 1, radial, false);
  const p = tube.attributes.position;
  const n = tube.attributes.normal;
  const steps = 17;
  for (let i = 0; i < p.count; i++) {
    const seg = Math.floor(i / (radial + 1));
    const t = seg / (steps - 1);
    const c = curve.getPointAt(Math.min(1, t));
    const r = r0 + (r1 - r0) * t;
    p.setXYZ(i, c.x + n.getX(i) * r, c.y + n.getY(i) * r, c.z + n.getZ(i) * r);
  }
  tube.computeVertexNormals();
  return tube;
}

const STYLE = {
  starter: { flat: 0xc9ced6, rough: 0.34, edgeRough: 0.14, fuller: 0x6a707a, wrap: 0x4a2e1c, quillon: 'straight' },
  azure: { flat: 0x232835, rough: 0.28, edgeRough: 0.1, fuller: 0x0e1420, wrap: 0x1c2230, quillon: 'swept' },
  terra: { flat: 0x9a8258, rough: 0.3, edgeRough: 0.12, fuller: 0x5a4224, wrap: 0x3a2412, quillon: 'swept' },
};

export function buildSwordModel(def) {
  const st = STYLE[def.id] || STYLE[Object.keys(SWORDS).find((k) => SWORDS[k] === def)] || STYLE.starter;
  const group = new THREE.Group();
  const bladeMat = new THREE.MeshStandardMaterial({ color: st.flat, metalness: 0.95, roughness: st.rough, emissive: 0x000000, envMapIntensity: 1.1 });
  const bevelMat = new THREE.MeshStandardMaterial({ color: def.id === 'azure' ? 0x9fb6d0 : 0xeef2f6, metalness: 1, roughness: st.edgeRough, emissive: 0x000000, envMapIntensity: 1.4 });
  const guardMat = new THREE.MeshStandardMaterial({ color: def.guard, metalness: 0.9, roughness: 0.3 });
  const gripMat = new THREE.MeshStandardMaterial({ color: st.wrap, roughness: 0.75 });
  const gemMat = new THREE.MeshStandardMaterial({ color: 0x1a3a6a, emissive: def.edge, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.2 });
  const parts = bladeParts();
  group.add(new THREE.Mesh(parts.flat, bladeMat));
  group.add(new THREE.Mesh(parts.edge, bevelMat));
  // fuller grooves on both faces
  const fullerMat = new THREE.MeshStandardMaterial({ color: st.fuller, metalness: 1, roughness: 0.35 });
  for (const s of [-1, 1]) {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.011, 0.6), fullerMat);
    f.position.set(0, 0.125 + 0.36, s * 0.0058);
    if (s < 0) f.rotation.y = Math.PI;
    group.add(f);
  }
  // edge glow shell (sword skills)
  const edgeMat = new THREE.MeshBasicMaterial({ color: def.edge, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const shell = bladeParts(0.95, 0.052, 0.011, 0.02, 0.23);
  const edgeMesh = new THREE.Mesh(shell.edge, edgeMat);
  edgeMesh.position.y = -0.006;
  group.add(edgeMesh);
  // cross guard: tapered, slightly swept quillons + centre block
  for (const s of [-1, 1]) {
    const sweep = st.quillon === 'swept' ? 0.035 : 0.008;
    const q = taperTube([
      new THREE.Vector3(0, 0.105, 0),
      new THREE.Vector3(s * 0.055, 0.106, 0),
      new THREE.Vector3(s * 0.1, 0.105 + sweep * 0.6, 0),
      new THREE.Vector3(s * 0.125, 0.105 + sweep, 0),
    ], 0.012, 0.0075, 8);
    group.add(new THREE.Mesh(q, guardMat));
    const end = new THREE.Mesh(new THREE.SphereGeometry(0.0115, 10, 8), guardMat);
    end.position.set(s * 0.127, 0.105 + sweep, 0);
    group.add(end);
  }
  const block = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.036, 6), guardMat);
  block.position.y = 0.105;
  block.rotation.y = Math.PI / 6;
  group.add(block);
  const langet = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 4), guardMat);
  langet.position.y = 0.14;
  langet.scale.set(1, 1, 0.45);
  group.add(langet);
  for (const s of [-1, 1]) {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.011, 0), gemMat);
    gem.position.set(0, 0.105, s * 0.02);
    gem.scale.set(1, 1.3, 0.5);
    group.add(gem);
  }
  // grip: core + spiral leather wrap
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.017, 0.19, 12), gripMat);
  group.add(core);
  const helix = [];
  for (let i = 0; i <= 64; i++) {
    const a = i * 0.62;
    helix.push(new THREE.Vector3(Math.cos(a) * 0.0165, -0.088 + (i / 64) * 0.176, Math.sin(a) * 0.0165));
  }
  const wrap = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 160, 0.0034, 5, false), gripMat);
  group.add(wrap);
  for (const y of [-0.093, 0.092]) {
    const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.01, 12), guardMat);
    ferrule.position.y = y;
    group.add(ferrule);
  }
  // faceted pommel with a gem
  const pommel = new THREE.Mesh(
    new THREE.LatheGeometry([new THREE.Vector2(0.0, -0.148), new THREE.Vector2(0.016, -0.143), new THREE.Vector2(0.027, -0.124), new THREE.Vector2(0.024, -0.106), new THREE.Vector2(0.012, -0.098), new THREE.Vector2(0.0, -0.097)], 8),
    guardMat
  );
  pommel.material = guardMat.clone();
  pommel.material.flatShading = true;
  group.add(pommel);
  const pgem = new THREE.Mesh(new THREE.OctahedronGeometry(0.009, 0), gemMat);
  pgem.position.y = -0.149;
  group.add(pgem);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  return { group, bladeMat, bevelMat, edgeMat, gemMat, guardMat };
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
    this.model.bladeMat.emissive.copy(this.skillColor).multiplyScalar(v * 0.35);
    this.model.bevelMat.emissive.copy(this.skillColor).multiplyScalar(v * 1.6);
    this.model.gemMat.emissiveIntensity = 1.2 + v * 3;
  }

  setVisible(v) {
    this.root.visible = v;
    this.trail.mesh.visible = v && this.trail.mesh.visible;
  }
}
