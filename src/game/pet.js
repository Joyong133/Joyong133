// "큐루" — a tiny feathered dragon familiar hatched on floor 2. Flutters at
// your shoulder, breathes bubbles at monsters and heals you in a pinch.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { part } from './monsterRigs.js';

const SPH = new THREE.SphereGeometry(1, 12, 9);
const CONE = new THREE.ConeGeometry(1, 1, 8);

function bodyGeo() {
  const fur = '#8fd8f2', belly = '#e8f6fb', deep = '#4aa8d8';
  const parts = [
    part(SPH, 0, 0, 0, 0, 0, 0, 0.1, 0.1, 0.13, fur, belly),
    part(SPH, 0, 0.1, 0.1, 0, 0, 0, 0.085, 0.08, 0.085, fur, belly),
    part(SPH, 0, 0.08, 0.18, 0, 0, 0, 0.045, 0.035, 0.05, belly),
    part(SPH, 0.042, 0.125, 0.165, 0, 0, 0, 0.022, 0.026, 0.018, '#1a1030'),
    part(SPH, -0.042, 0.125, 0.165, 0, 0, 0, 0.022, 0.026, 0.018, '#1a1030'),
    part(SPH, 0.048, 0.132, 0.176, 0, 0, 0, 0.007, 0.007, 0.006, '#ffffff'),
    part(SPH, -0.036, 0.132, 0.176, 0, 0, 0, 0.007, 0.007, 0.006, '#ffffff'),
    // head feathers
    part(CONE, 0.03, 0.2, 0.06, -0.6, 0, -0.3, 0.02, 0.1, 0.012, deep, fur),
    part(CONE, -0.03, 0.2, 0.06, -0.6, 0, 0.3, 0.02, 0.1, 0.012, deep, fur),
    part(CONE, 0, 0.21, 0.04, -0.8, 0, 0, 0.018, 0.12, 0.012, '#ffd24a', deep),
    // tail plume
    part(CONE, 0, 0.0, -0.2, -Math.PI / 2 - 0.2, 0, 0, 0.04, 0.2, 0.03, fur, deep),
    part(CONE, 0.03, 0.02, -0.33, -Math.PI / 2 - 0.4, 0, 0.3, 0.03, 0.16, 0.012, '#ffd24a', deep),
    part(CONE, -0.03, 0.02, -0.33, -Math.PI / 2 - 0.4, 0, -0.3, 0.03, 0.16, 0.012, '#ffd24a', deep),
    // little feet
    part(SPH, 0.04, -0.09, 0.03, 0, 0, 0, 0.02, 0.018, 0.028, '#f0c060'),
    part(SPH, -0.04, -0.09, 0.03, 0, 0, 0, 0.02, 0.018, 0.028, '#f0c060'),
  ];
  return mergeGeometries(parts);
}

function wingGeo() {
  const parts = [];
  for (let i = 0; i < 4; i++) {
    parts.push(part(SPH, 0.07 + i * 0.03, 0.01 - i * 0.012, -0.02 - i * 0.02, 0, 0.2 + i * 0.25, 0, 0.09, 0.006, 0.03, '#d8f2fb', '#8fd8f2'));
  }
  return mergeGeometries(parts);
}

export class Pet {
  constructor(scene, game) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x0a2030 });
    this.body = new THREE.Mesh(bodyGeo(), mat);
    this.wingL = new THREE.Mesh(wingGeo(), mat);
    this.wingR = new THREE.Mesh(wingGeo(), mat);
    this.wingL.position.set(-0.05, 0.05, 0.02);
    this.wingR.position.set(0.05, 0.05, 0.02);
    this.wingL.scale.x = -1;
    this.root.add(this.body, this.wingL, this.wingR);
    this.root.scale.setScalar(1.25);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.t = 0;
    this.healCd = 5;
    this.atkCd = 3;
    this.placed = false;
    this.name = '큐루';
  }

  get active() {
    return this.game.progress.pet && this.game.settings.pet !== false;
  }

  reset() {
    this.placed = false;
  }

  update(dt) {
    const g = this.game;
    const on = this.active && g.mode.endsWith('play');
    this.root.visible = on && !g.player.dead;
    if (!on) return;
    this.t += dt;
    const head = g.player.head;
    const q = new THREE.Quaternion();
    g.camera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const yaw = e.y;
    // hover beside the off-hand shoulder, drifting in a lazy figure-eight
    const side = g.settings.mainHand === 'right' ? -1 : 1;
    const off = new THREE.Vector3(side * 0.62 + Math.sin(this.t * 0.7) * 0.15, -0.05 + Math.sin(this.t * 1.9) * 0.06, -0.45 + Math.sin(this.t * 1.4) * 0.12);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const target = head.clone().add(off);
    if (!this.placed || this.pos.distanceTo(target) > 12) {
      this.pos.copy(target);
      this.placed = true;
    }
    const k = 1 - Math.exp(-dt * 3.2);
    this.pos.lerp(target, k);
    this.root.position.copy(this.pos);
    // face where the player looks (or the monster it's breathing at)
    let face = yaw + Math.PI;
    if (this.lookAt) {
      face = Math.atan2(this.lookAt.x - this.pos.x, this.lookAt.z - this.pos.z);
      this.lookT -= dt;
      if (this.lookT <= 0) this.lookAt = null;
    }
    const cur = this.root.rotation.y;
    this.root.rotation.y = cur + Math.atan2(Math.sin(face - cur), Math.cos(face - cur)) * Math.min(1, dt * 5);
    const flap = Math.sin(this.t * 22) * 0.8;
    this.wingL.rotation.z = -flap * 0.9 - 0.3;
    this.wingR.rotation.z = flap * 0.9 + 0.3;
    this.body.position.y = Math.sin(this.t * 22) * 0.008;

    const p = g.player;
    if (p.dead || !g.map) return;
    this.healCd -= dt;
    this.atkCd -= dt;
    if (this.healCd <= 0 && p.hp < p.maxHp * 0.45 && !p.inTown) {
      this.healCd = 25;
      const heal = Math.round(p.maxHp * 0.18);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      g.effects.motes(p.feet.clone(), 0x9fe8ff, 40, 0.6);
      g.effects.sparks(this.pos.clone(), null, 0xbff0ff, 16, 1.5);
      g.audio.play('potion', { vol: 0.7, rate: 1.3 });
      g.toasts.push(`${this.name}의 치유의 숨결!`, `HP +${heal}`, '#6fd0ff');
    }
    if (this.atkCd <= 0) {
      const m = g.monsters?.nearestAggro(p.feet);
      if (m && m.pos.distanceTo(p.feet) < 10) {
        this.atkCd = 3.5;
        const hit = m.pos.clone().add(new THREE.Vector3(0, m.def.height * m.scale * 0.7, 0));
        this.lookAt = hit;
        this.lookT = 0.8;
        const dir = hit.clone().sub(this.pos).normalize();
        for (let i = 0; i < 5; i++) g.effects.sparks(this.pos.clone().addScaledVector(dir, 0.2 + i * 0.25), dir, 0x9fe8ff, 3, 2);
        g.audio.play('bubble', { pos: this.pos, vol: 0.6 });
        setTimeout(() => {
          if (!m.alive) return;
          const dmg = Math.max(1, Math.round(g.player.atk * g.swordAtk() * 0.12));
          g.monsters.damage(m, dmg, dir);
          g.damageNums.spawn(hit.clone().add(new THREE.Vector3(0, 0.3, 0)), `${dmg}`, '#9fe8ff', 0.8);
          g.effects.sparks(hit, dir, 0xbff0ff, 10, 2.5);
        }, 350);
      } else {
        this.atkCd = 1;
      }
    }
  }
}
