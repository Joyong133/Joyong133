// Treasure chests scattered along the roads. Instanced bodies + lids (2 draw
// calls per map); lids swing open, loot is rolled per floor, and chests
// quietly refill a few minutes later.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part } from './monsterRigs.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12, 1, false, 0, Math.PI);

function bodyGeo() {
  const wood = '#8a5a30', dark = '#5a3a1e', iron = '#3a3834', gold = '#d8b048';
  return mergeGeometries([
    part(BOX, 0, 0.26, 0, 0, 0, 0, 0.9, 0.52, 0.56, wood, dark),
    part(BOX, -0.36, 0.26, 0, 0, 0, 0, 0.07, 0.54, 0.58, iron),
    part(BOX, 0.36, 0.26, 0, 0, 0, 0, 0.07, 0.54, 0.58, iron),
    part(BOX, 0, 0.44, 0.285, 0, 0, 0, 0.14, 0.16, 0.04, gold),
  ]);
}

function lidGeo() {
  // hinge at the back edge (local origin), lid extends toward +z
  const wood = '#9a6a38', iron = '#3a3834';
  return mergeGeometries([
    part(CYL, 0, 0, 0.28, 0, 0, Math.PI / 2, 0.28, 0.9, 0.28, wood, '#6a4424'),
    part(CYL, -0.36, 0, 0.28, 0, 0, Math.PI / 2, 0.29, 0.07, 0.29, iron),
    part(CYL, 0.36, 0, 0.28, 0, 0, Math.PI / 2, 0.29, 0.07, 0.29, iron),
  ]);
}

const LOOT = {
  f1: { col: [40, 130], rolls: [['potion', 0.5, 1], ['hipotion', 0.08, 1], ['crystal', 0.07, 1], ['boarHide', 0.35, 2], ['wolfFang', 0.3, 2]] },
  lab: { col: [150, 320], rolls: [['hipotion', 0.6, 2], ['crystal', 0.3, 1], ['koboldScrap', 0.7, 3], ['potion', 0.5, 2]] },
  f2: { col: [110, 280], rolls: [['hipotion', 0.4, 1], ['crystal', 0.15, 1], ['cake', 0.2, 1], ['bullHorn', 0.35, 2], ['waspSting', 0.3, 2], ['potion', 0.4, 2]] },
};

export class Chests {
  constructor(parent, game, spots, height, colliders, glows, lootKey) {
    this.game = game;
    this.loot = LOOT[lootKey] || LOOT.f1;
    this.group = new THREE.Group();
    this.group.name = 'chests';
    parent.add(this.group);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
    const n = Math.max(1, spots.length);
    this.body = new THREE.InstancedMesh(bodyGeo(), mat, n);
    this.lid = new THREE.InstancedMesh(lidGeo(), mat, n);
    for (const m of [this.body, this.lid]) {
      m.frustumCulled = false;
      m.castShadow = false;
      this.group.add(m);
    }
    this.list = spots.map((s, i) => {
      const y = height(s.x, s.z);
      const yaw = s.yaw ?? Math.atan2(-s.x, -s.z) + (i % 3 - 1) * 0.4;
      const c = { i, pos: new THREE.Vector3(s.x, y, s.z), yaw, open: false, anim: 0, respawn: 0, glow: glows ? glows.add(s.x, y + 0.9, s.z, 1.4, 0xffd070, 0.2, 90) : -1 };
      colliders.addBox(s.x, s.z, 0.5, 0.33, yaw);
      return c;
    });
    this.glows = glows;
    this.body.count = this.lid.count = this.list.length;
    this._m = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3(1, 1, 1);
    for (const c of this.list) this._place(c);
    this.body.instanceMatrix.needsUpdate = true;
  }

  _place(c) {
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw);
    this._m.compose(c.pos, this._q, this._s);
    this.body.setMatrixAt(c.i, this._m);
    // lid hinge at the back top edge
    this._m2.makeRotationX(-c.anim * 1.9);
    this._m2.setPosition(0, 0.52, -0.28);
    this._m.multiply(this._m2);
    this.lid.setMatrixAt(c.i, this._m);
    this.lid.instanceMatrix.needsUpdate = true;
  }

  nearest(p, maxD = 1.9) {
    let best = null, bd = maxD;
    for (const c of this.list) {
      if (c.open) continue;
      const d = Math.hypot(p.x - c.pos.x, p.z - c.pos.z);
      if (d < bd && Math.abs(p.y - c.pos.y) < 2) { bd = d; best = c; }
    }
    return best;
  }

  open(c) {
    if (c.open) return null;
    c.open = true;
    c.respawn = 240;
    if (this.glows && c.glow >= 0) this.glows.set(c.glow, c.pos.x, c.pos.y + 0.9, c.pos.z, 0.001);
    const L = this.loot;
    const got = [];
    const col = Math.round(L.col[0] + Math.random() * (L.col[1] - L.col[0]));
    for (const [id, p, max] of L.rolls) {
      if (Math.random() < p) got.push([id, 1 + Math.floor(Math.random() * max)]);
    }
    return { col, items: got };
  }

  update(dt) {
    for (const c of this.list) {
      const target = c.open ? 1 : 0;
      if (c.anim !== target) {
        c.anim += Math.sign(target - c.anim) * Math.min(Math.abs(target - c.anim), dt * (c.open ? 2.2 : 1));
        this._place(c);
      }
      if (c.open) {
        c.respawn -= dt;
        if (c.respawn <= 0) {
          c.open = false;
          if (this.glows && c.glow >= 0) this.glows.set(c.glow, c.pos.x, c.pos.y + 0.9, c.pos.z, 1.4);
        }
      }
    }
  }
}
