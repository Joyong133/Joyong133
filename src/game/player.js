// Player rig: smooth locomotion + snap/smooth turning in VR, mouse-look FPS
// controls on desktop, collision against the town, and RPG stats.
import * as THREE from 'three';
import { heightAt, TOWN } from '../world/layout.js';
import { BTN } from './input.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Player {
  constructor(game, saved) {
    this.game = game;
    this.rig = game.rig;
    this.camera = game.camera;
    this.head = new THREE.Vector3();
    this.feet = new THREE.Vector3();
    this.level = saved?.level ?? 1;
    this.exp = saved?.exp ?? 0;
    this.col = saved?.col ?? 100;
    this.potions = saved?.potions ?? 3;
    this.kills = saved?.kills ?? 0;
    this.swordId = saved?.swordId ?? 'starter';
    this.hp = this.maxHp;
    this.dead = false;
    this.inTown = true;
    this.name = 'PLAYER';
    // desktop look
    this.yaw = Math.PI;
    this.pitch = 0;
    this.vy = 0;
    this.eye = 1.65;
    this.grounded = true;
    this.snapReady = true;
    this.moveAmount = 0;
    this.sprint = false;
  }

  get maxHp() {
    return 220 + (this.level - 1) * 35;
  }
  get atk() {
    return 12 + (this.level - 1) * 3;
  }
  expNext(level = this.level) {
    return Math.round(90 * Math.pow(level, 1.55));
  }

  gainExp(n) {
    this.exp += n;
    let ups = 0;
    while (this.exp >= this.expNext()) {
      this.exp -= this.expNext();
      this.level++;
      ups++;
    }
    if (ups) this.hp = this.maxHp;
    return ups;
  }

  teleport(pos, yaw) {
    // place the rig so the HEAD ends up above pos
    this.camera.updateMatrixWorld();
    const local = new THREE.Vector3().setFromMatrixPosition(this.camera.matrix);
    this.rig.rotation.y = yaw;
    this.yaw = yaw;
    const off = local.clone();
    off.y = 0;
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.rig.position.set(pos.x - off.x, heightAt(pos.x, pos.z), pos.z - off.z);
    this.vy = 0;
  }

  _headWorld() {
    // update parents too: the rig may have moved since the last render
    this.camera.updateWorldMatrix(true, false);
    return this.head.setFromMatrixPosition(this.camera.matrixWorld);
  }

  _collide(prevHead) {
    const colliders = this.game.world.colliders;
    const p = { x: this.head.x, z: this.head.z };
    colliders.resolve(p, 0.28);
    // world edge (don't walk off the floating castle… unless you really want to)
    const r = Math.hypot(p.x, p.z);
    const maxR = 497.2;
    if (r > maxR) { p.x *= maxR / r; p.z *= maxR / r; }
    const dx = p.x - this.head.x, dz = p.z - this.head.z;
    if (dx || dz) {
      this.rig.position.x += dx;
      this.rig.position.z += dz;
      this.head.x = p.x;
      this.head.z = p.z;
    }
    void prevHead;
  }

  updateVR(dt, input, settings) {
    const main = settings.mainHand;
    const off = main === 'right' ? 'left' : 'right';
    const mv = input.hands[off].axes;
    const turn = input.hands[main].axes;
    this._headWorld();
    const prev = this.head.clone();
    // movement direction from head (or controller) yaw
    let yawSrc = this.camera;
    if (settings.moveRef === 'controller' && input.hands[off].ray) yawSrc = input.hands[off].ray;
    yawSrc.getWorldQuaternion(_q);
    _e.setFromQuaternion(_q, 'YXZ');
    const yaw = _e.y;
    if (input.pressed(off, BTN.stick)) this.sprint = !this.sprint;
    const mag = Math.hypot(mv.x, mv.y);
    if (mag < 0.1) this.sprint = false;
    const speed = (this.sprint ? 5.0 : 2.9) * Math.min(1, mag);
    let mx = 0, mz = 0;
    if (mag > 0) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      mx = ((fx * -mv.y + rx * mv.x) / mag) * speed;
      mz = ((fz * -mv.y + rz * mv.x) / mag) * speed;
      this.rig.position.x += mx * dt;
      this.rig.position.z += mz * dt;
    }
    this.moveAmount = mag > 0 ? Math.min(1, speed / 4) : 0;
    // turning
    let turned = 0;
    if (settings.snapTurn) {
      if (Math.abs(turn.x) > 0.7 && this.snapReady) {
        turned = -Math.sign(turn.x) * (Math.PI / 6);
        this.snapReady = false;
      } else if (Math.abs(turn.x) < 0.3) this.snapReady = true;
    } else if (Math.abs(turn.x) > 0.15) {
      turned = -turn.x * dt * 2.4;
      this.moveAmount = Math.max(this.moveAmount, Math.abs(turn.x) * 0.6);
    }
    if (turned) {
      // rotate the rig around the head position
      this._headWorld();
      const hx = this.head.x, hz = this.head.z;
      this.rig.rotation.y += turned;
      this.rig.updateMatrixWorld(true);
      this._headWorld();
      this.rig.position.x += hx - this.head.x;
      this.rig.position.z += hz - this.head.z;
    }
    this._headWorld();
    this._collide(prev);
    const gy = heightAt(this.head.x, this.head.z);
    this.rig.position.y += (gy - this.rig.position.y) * Math.min(1, dt * 12);
    this._afterMove();
  }

  updateDesktop(dt, input, menuOpen) {
    if (!menuOpen && input.locked) {
      this.yaw -= input.mouse.dx * 0.0022;
      this.pitch -= input.mouse.dy * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.45, 1.45);
    }
    this.rig.rotation.y = 0;
    this.camera.position.set(0, this.eye, 0);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    let fx = 0, fz = 0;
    if (!menuOpen) {
      if (input.key('KeyW') || input.key('ArrowUp')) fz -= 1;
      if (input.key('KeyS') || input.key('ArrowDown')) fz += 1;
      if (input.key('KeyA') || input.key('ArrowLeft')) fx -= 1;
      if (input.key('KeyD') || input.key('ArrowRight')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    const speed = input.key('ShiftLeft') || input.key('ShiftRight') ? 5.6 : 3.2;
    if (len > 0) {
      fx /= len; fz /= len;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      const wx = fx * c + fz * s;
      const wz = -fx * s + fz * c;
      this.rig.position.x += wx * speed * dt;
      this.rig.position.z += wz * speed * dt;
    }
    this._headWorld();
    this._collide();
    const gy = heightAt(this.head.x, this.head.z);
    if (this.grounded && input.keyPressed('Space') && !menuOpen) {
      this.vy = 4.6;
      this.grounded = false;
    }
    this.vy -= 12 * dt;
    this.rig.position.y += this.vy * dt;
    if (this.rig.position.y <= gy) {
      this.rig.position.y = gy;
      this.vy = 0;
      this.grounded = true;
    } else if (this.grounded) {
      // walking downhill: stick to ground
      if (this.rig.position.y - gy < 0.4) this.rig.position.y = gy;
      else this.grounded = false;
    }
    this._afterMove();
  }

  _afterMove() {
    this._headWorld();
    this.feet.set(this.head.x, heightAt(this.head.x, this.head.z), this.head.z);
    this.inTown = Math.hypot(this.head.x, this.head.z) < TOWN.safeR;
  }

  toJSON() {
    return { level: this.level, exp: this.exp, col: this.col, potions: this.potions, kills: this.kills, swordId: this.swordId };
  }
}
