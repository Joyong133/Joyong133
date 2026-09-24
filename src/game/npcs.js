// Townsfolk: instanced cloaked villagers strolling the ring streets, plus the
// interactive NPCs (quest knight + potion merchant) with floating markers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/noise.js';
import { FONT } from './ui.js';

function colored(geo, color, shade = true) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  const p = out.attributes.position;
  const c = new Float32Array(p.count * 3);
  const base = new THREE.Color(color);
  for (let i = 0; i < p.count; i++) {
    const k = shade ? 0.55 + 0.45 * Math.min(1, Math.max(0, p.getY(i) / 1.5)) : 1;
    c[i * 3] = base.r * k; c[i * 3 + 1] = base.g * k; c[i * 3 + 2] = base.b * k;
  }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return out;
}

function cloakGeometry() {
  const prof = [
    [0.0, 0.03], [0.34, 0.03], [0.3, 0.3], [0.25, 0.8], [0.23, 1.12], [0.26, 1.32], [0.2, 1.42], [0.09, 1.46], [0.0, 1.47],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.LatheGeometry(prof, 10);
  const hood = new THREE.SphereGeometry(0.155, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hood.rotateX(-0.35);
  hood.translate(0, 1.6, -0.03);
  const sleeveL = new THREE.CylinderGeometry(0.06, 0.1, 0.6, 6, 1, true);
  sleeveL.rotateZ(0.18);
  sleeveL.rotateX(-0.25);
  sleeveL.translate(0.27, 1.08, 0.06);
  const sleeveR = sleeveL.clone();
  sleeveR.scale(-1, 1, 1);
  const belt = new THREE.TorusGeometry(0.24, 0.025, 4, 12);
  belt.rotateX(Math.PI / 2);
  belt.translate(0, 0.95, 0);
  return mergeGeometries([
    colored(body, 0xe8e8e8),
    colored(hood, 0xdddddd, false),
    colored(sleeveL, 0xd8d8d8),
    colored(sleeveR, 0xd8d8d8),
    colored(belt, 0x5a5a5a, false),
  ]);
}

function skinGeometry() {
  const head = new THREE.SphereGeometry(0.115, 10, 7);
  head.translate(0, 1.6, 0.02);
  const hair = new THREE.SphereGeometry(0.122, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.5);
  hair.rotateX(-0.5);
  hair.translate(0, 1.63, 0.0);
  const handL = new THREE.SphereGeometry(0.045, 5, 4);
  handL.translate(0.33, 0.78, 0.16);
  const handR = handL.clone();
  handR.translate(-0.66, 0, 0);
  const eyeL = new THREE.SphereGeometry(0.015, 4, 3);
  eyeL.translate(0.04, 1.62, 0.125);
  const eyeR = eyeL.clone();
  eyeR.translate(-0.08, 0, 0);
  const bootL = new THREE.BoxGeometry(0.1, 0.08, 0.2);
  bootL.translate(0.1, 0.04, 0.12);
  const bootR = bootL.clone();
  bootR.translate(-0.2, 0, 0);
  return mergeGeometries([
    colored(head, 0xf0c8a8, false),
    colored(hair, 0x4a3020, false),
    colored(handL, 0xf0c8a8, false),
    colored(handR, 0xf0c8a8, false),
    colored(eyeL, 0x1a1a1a, false),
    colored(eyeR, 0x1a1a1a, false),
    colored(bootL, 0x3a2a1e, false),
    colored(bootR, 0x3a2a1e, false),
  ]);
}

function markerSprite(kind) {
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
    g.fillStyle = k === 'coin' ? '#f7c948' : k === '?' ? '#6fd06f' : '#f0a020';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#fff';
    g.stroke();
    g.fillStyle = '#fff';
    g.font = `900 72px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(k === 'coin' ? 'C' : k, 64, 90);
    tex.needsUpdate = true;
  };
  s.userData.set(kind);
  return s;
}

export class NPCs {
  constructor(scene, town, colliders, m) {
    this.scene = scene;
    this.rng = new RNG(4242);
    const N = 46;
    this.cloak = new THREE.InstancedMesh(cloakGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), N);
    this.skin = new THREE.InstancedMesh(skinGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), N);
    for (const mesh of [this.cloak, this.skin]) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      scene.add(mesh);
    }
    const cloakColors = ['#6d7f99', '#8a5a44', '#4f6d4a', '#8c8c8c', '#6b4f7a', '#a0824f', '#3f5870', '#9a4a4a', '#5a5a66', '#b8a888'];
    this.walkers = [];
    const streets = town.streets.filter((r) => r > 40 && r < 100);
    for (let i = 0; i < N - 4; i++) {
      const plaza = i < 8;
      const r = plaza ? 26 + this.rng.range(-1, 1) : this.rng.pick(streets) + this.rng.range(-0.5, 0.8);
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
    this.walkers.forEach((w, i) => this.cloak.setColorAt(i, w.color));

    // interactive NPCs
    this.special = [];
    const add = (id, name, x, z, yaw, color, marker) => {
      const idx = this.walkers.length + this.special.length;
      const npc = { id, name, pos: new THREE.Vector3(x, 0, z), yaw, idx, color: new THREE.Color(color), marker: markerSprite(marker) };
      npc.marker.position.set(x, 2.25, z);
      scene.add(npc.marker);
      this.cloak.setColorAt(idx, npc.color);
      colliders.addCircle(x, z, 0.4);
      this.special.push(npc);
      return npc;
    };
    this.ellen = add('ellen', '기사 엘렌', -5.5, -12, Math.PI * 0.8, '#2f4f8f', '!');
    this.mora = add('mora', '상인 모라', 12.5, -9, -Math.PI * 0.62, '#6b3f7a', 'coin');
    this.smith = add('smith', '대장장이 브로크', -12.5, 9, Math.PI * 0.35, '#7a4a2a', null);
    this.guard = add('guard', '남문 경비병', 7, 104, Math.PI, '#4a5a6a', null);
    this.cloak.instanceColor.needsUpdate = true;

    // Mora's potion stand
    const stand = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ map: m.wood.map, color: 0xb08860, roughness: 0.85 });
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.7), wood);
    counter.position.set(0, 0.475, 0);
    stand.add(counter);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 1.3), new THREE.MeshStandardMaterial({ map: m.fabric.map, color: 0x7a4a9a, roughness: 0.9 }));
    awn.position.set(0, 2.35, -0.1);
    awn.rotation.x = 0.25;
    stand.add(awn);
    for (const sx of [-0.85, 0.85]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, 0.08), wood);
      post.position.set(sx, 1.17, 0.3);
      stand.add(post);
    }
    const potionCols = [0xe74c3c, 0x3aa6ff, 0x2ecc71, 0xe74c3c, 0xe74c3c, 0xf1c40f];
    potionCols.forEach((c, i) => {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }));
      bottle.position.set(-0.6 + i * 0.24, 1.05, 0.05);
      stand.add(bottle);
    });
    stand.position.set(12.5 + Math.sin(this.mora.yaw) * 1.0, 0, -9 + Math.cos(this.mora.yaw) * 1.0);
    stand.rotation.y = this.mora.yaw;
    scene.add(stand);
    colliders.addBox(stand.position.x, stand.position.z, 0.95, 0.4, this.mora.yaw);

    // Brock's anvil
    const anvil = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2e33, metalness: 0.8, roughness: 0.4 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), iron);
    top.position.y = 0.72;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), iron);
    horn.rotation.z = Math.PI / 2;
    horn.position.set(0.5, 0.74, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.3), iron);
    base.position.y = 0.33;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.1, 12), wood);
    stump.position.y = 0.05;
    anvil.add(top, horn, base, stump);
    anvil.position.set(-12.5 + Math.sin(this.smith.yaw) * 1.1, 0, 9 + Math.cos(this.smith.yaw) * 1.1);
    anvil.rotation.y = this.smith.yaw + Math.PI / 2;
    scene.add(anvil);
    colliders.addCircle(anvil.position.x, anvil.position.z, 0.45);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.cloak.count = this.skin.count = this.walkers.length + this.special.length;
  }

  setMarker(npc, kind) {
    npc.marker.userData.set(kind);
    npc.marker.visible = !!kind;
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
      const bob = moving ? Math.abs(Math.sin(w.phase)) * 0.04 : 0;
      const roll = moving ? Math.sin(w.phase) * 0.04 : 0;
      this._e.set(0, yaw, roll, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(x, bob, z), this._q, this._s.set(w.h, w.h, w.h));
      this.cloak.setMatrixAt(i, this._m);
      this.skin.setMatrixAt(i, this._m);
      i++;
    }
    for (const n of this.special) {
      // idle breathing, turn toward player when near
      let yaw = n.yaw;
      if (playerPos && playerPos.distanceTo(n.pos) < 5) yaw = Math.atan2(playerPos.x - n.pos.x, playerPos.z - n.pos.z);
      n.curYaw = n.curYaw === undefined ? yaw : n.curYaw + Math.atan2(Math.sin(yaw - n.curYaw), Math.cos(yaw - n.curYaw)) * Math.min(1, dt * 4);
      const breathe = 1 + Math.sin(t * 2 + n.idx) * 0.008;
      this._e.set(0, n.curYaw, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.copy(n.pos), this._q, this._s.set(1.05, 1.05 * breathe, 1.05));
      this.cloak.setMatrixAt(n.idx, this._m);
      this.skin.setMatrixAt(n.idx, this._m);
      n.marker.position.y = 2.2 + Math.sin(t * 2.5 + n.idx) * 0.06;
    }
    this.cloak.instanceMatrix.needsUpdate = true;
    this.skin.instanceMatrix.needsUpdate = true;
  }

  nearest(p, maxDist = 2.4) {
    let best = null, bd = maxDist;
    for (const n of this.special) {
      const d = Math.hypot(p.x - n.pos.x, p.z - n.pos.z);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }
}
