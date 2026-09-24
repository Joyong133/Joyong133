// Townsfolk: instanced cloaked villagers strolling ring streets, plus the
// interactive NPCs (quest givers, merchants, mini-game hosts) with floating
// markers and name tags. One instance per town; the layout comes from config.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/noise.js';
import { FONT, roundRect } from './ui.js';

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
    this.cloak = new THREE.InstancedMesh(cloakGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), Math.max(1, N));
    this.skin = new THREE.InstancedMesh(skinGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), Math.max(1, N));
    for (const mesh of [this.cloak, this.skin]) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      this.group.add(mesh);
    }
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
    this.walkers.forEach((w, i) => this.cloak.setColorAt(i, w.color));

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
      this.cloak.setColorAt(idx, npc.color);
      npc.collider = colliders.addCircle(sp.x, sp.z, 0.4);
      if (sp.dynamic) npc.collider.off = true;
      this.special.push(npc);
      this.byId[sp.id] = npc;
    }
    if (this.cloak.instanceColor) this.cloak.instanceColor.needsUpdate = true;
    cfg.props?.(this.group, colliders, this);

    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.cloak.count = this.skin.count = this.walkers.length + this.special.length;
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
      this.cloak.setMatrixAt(n.idx, this._m);
      this.skin.setMatrixAt(n.idx, this._m);
      const top = n.pos.y + 2.2 * n.scale;
      n.marker.position.set(n.pos.x, top + Math.sin(t * 2.5 + n.idx) * 0.06, n.pos.z);
      const d = playerPos ? Math.hypot(playerPos.x - n.pos.x, playerPos.z - n.pos.z) : 99;
      n.marker.visible = !!n.markerKind && n.visible;
      n.tag.visible = n.visible && d < 11;
      n.tag.position.set(n.pos.x, top - (n.marker.visible ? 0.36 : 0.05), n.pos.z);
    }
    this.cloak.instanceMatrix.needsUpdate = true;
    this.skin.instanceMatrix.needsUpdate = true;
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
