// A racer: kinematic capsule controller + character model. The player and
// the bots share this class; only where `input` comes from differs.
import * as THREE from 'three';
import { RUNNER_R, RUNNER_H, STEP_UP, floorTop, pushOut, ceilingAt } from '../world/physics.js';
import { physicsFor } from '../data/characters.js';
import { CharacterModel, shieldMesh, iceMesh } from './model.js';
import { dampAngle } from '../core/rng.js';
import { labelTexture } from '../world/textures.js';

export const GRAVITY = 32;

export class Runner {
  constructor(ch, { name, isPlayer = false, idx = 0, color = '#ffffff', outline = true } = {}) {
    this.ch = ch;
    this.name = name || ch.name;
    this.isPlayer = isPlayer;
    this.idx = idx;
    this.stats = physicsFor(ch);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.ext = { x: 0, z: 0 };
    this.heading = 0;
    this.input = { dx: 0, dz: 1, m: 0, jump: false, boost: false, item: false };
    this._near = [];
    this._po = { x: 0, z: 0, nx: 0, nz: 0 };
    this.model = new CharacterModel(ch, { outline });
    this.root = this.model.root;
    this.shield = shieldMesh();
    this.ice = iceMesh();
    this.root.add(this.shield, this.ice);
    if (!isPlayer) {
      // constant on-screen size so close runners don't cover the view
      const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(this.name, color), depthWrite: false, transparent: true, sizeAttenuation: false }));
      tag.scale.set(0.15, 0.0375, 1);
      tag.position.y = 2.15;
      tag.renderOrder = 5;
      this.tag = tag;
      this.root.add(tag);
    } else {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 4), new THREE.MeshBasicMaterial({ color: 0xffe14a }));
      arrow.rotation.x = Math.PI;
      arrow.position.y = 2.2;
      this.arrow = arrow;
      this.root.add(arrow);
    }
    this.resetState();
  }

  resetState() {
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.jumps = 0;
    this.jumpBuf = 0;
    this.flipT = 1;
    this.airTop = 0;
    this.stunT = 0;
    this.invulnT = 0;
    this.boostT = 0;
    this.boostMul = 1;
    this.shieldT = 0;
    this.frozenT = 0;
    this.slowT = 0;
    this.honeyT = 0;
    this.fallT = 0;
    this.gauge = this.gauge ?? 0;
  }

  place(x, y, z, h) {
    this.pos.set(x, y, z);
    this.heading = h;
    this.resetState();
    this.syncModel(0);
  }

  emit(type, a) {
    if (type === 'jump' || type === 'djump' || type === 'boing') this.model.kick(2.4);
    else if (type === 'land' && a > 4) this.model.kick(-Math.min(4.5, a * 0.22));
    this.onEvent?.(type, this, a);
  }

  // Knock the runner over. Returns false if blocked (shield/invulnerable).
  knock(nx, nz, strength, up, stun, soft = false) {
    if (this.finished || this.fallT > 0) return false;
    if (!soft && this.invulnT > 0) return false;
    if (!soft && this.shieldT > 0) {
      this.shieldT = 0;
      this.invulnT = 0.6;
      this.emit('shieldPop');
      return false;
    }
    const k = strength * (soft ? 1 : this.stats.knockMul);
    this.vel.x = nx * k;
    this.vel.z = nz * k;
    this.vel.y = up;
    this.grounded = false;
    this.ground = null;
    this.stunT = Math.max(this.stunT, stun * (soft ? 1 : this.stats.knockMul));
    this.boostT = Math.min(this.boostT, 0.2);
    if (!soft) this.invulnT = this.stunT + 0.6;
    this.emit(soft ? 'bump' : 'hit');
    return true;
  }

  canAct() {
    return this.stunT <= 0 && this.frozenT <= 0 && this.fallT <= 0 && !this.locked;
  }

  doJump() {
    const v = this.stats.jumpV * (this.honeyT > 0 ? 0.8 : 1);
    this.vel.y = v;
    this.grounded = false;
    this.ground = null;
    this.coyote = 0;
    this.jumps = 1;
    this.jumpBuf = 0;
    this.airTop = Math.max(this.airTop, Math.hypot(this.vel.x, this.vel.z));
    this.emit('jump');
  }

  doDouble() {
    this.vel.y = this.stats.jumpV * 0.9;
    this.jumps = 2;
    this.flipT = 0;
    this.jumpBuf = 0;
    this.emit('djump');
  }

  tryJump() {
    if (this.grounded || this.coyote > 0) this.doJump();
    else if (this.jumps < 2) this.doDouble();
    else this.jumpBuf = 0.15;
  }

  dash(time = 1.6, mul = 1.45) {
    this.boostMul = this.boostT > 0 ? Math.max(this.boostMul, mul) : mul;
    this.boostT = Math.max(this.boostT, time);
  }

  step(dt, race) {
    const W = race.world;
    const g = GRAVITY * race.gravity;
    const pos = this.pos;
    const vel = this.vel;

    // timers
    if (this.stunT > 0) this.stunT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;
    if (this.boostT > 0) {
      this.boostT -= dt;
      if (this.boostT <= 0) this.boostMul = 1;
    }
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.frozenT > 0) this.frozenT -= dt;
    if (this.slowT > 0) this.slowT -= dt;
    if (this.honeyT > 0) this.honeyT -= dt;
    if (this.flipT < 1) this.flipT = Math.min(1, this.flipT + dt / 0.42);

    // carried by the thing we stand on
    if (this.grounded && this.ground) {
      const c = this.ground;
      if (!c.active) {
        this.grounded = false;
        this.ground = null;
      } else {
        if (c.dyaw) {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const ca = Math.cos(c.dyaw);
          const sa = Math.sin(c.dyaw);
          pos.x = c.x + dx * ca + dz * sa;
          pos.z = c.z - dx * sa + dz * ca;
          this.heading += c.dyaw;
        }
        pos.x += c.dx;
        pos.y += c.dy;
        pos.z += c.dz;
        if (c.conv) {
          pos.x += Math.sin(c.yaw) * c.conv * dt;
          pos.z += Math.cos(c.yaw) * c.conv * dt;
        }
      }
    }

    // ---- control ----
    const act = this.canAct();
    const inp = this.input;
    if (inp.jump) {
      inp.jump = false;
      if (act) this.tryJump();
    }
    if (this.jumpBuf > 0) {
      this.jumpBuf -= dt;
      if (act && (this.grounded || this.coyote > 0)) this.doJump();
    }
    if (inp.boost) {
      inp.boost = false;
      if (act && this.gauge >= 50) {
        this.gauge -= 50;
        this.dash(1.6, 1.45);
        this.emit('dash');
      }
    }
    if (inp.item) {
      inp.item = false;
      if (act && this.item) race.useItem(this);
    }

    const m = act ? inp.m : 0;
    const surf = this.grounded && this.ground ? this.ground.surface : null;
    let top = this.stats.maxSpeed * (this.speedMul ?? 1);
    if (this.boostT > 0) top *= this.boostMul;
    if (surf === 'sand') top *= 0.62;
    if (this.slowT > 0) top *= 0.6;
    if (this.honeyT > 0) top *= 0.5;

    const sp = Math.hypot(vel.x, vel.z);
    let rate;
    let tx = inp.dx * m;
    let tz = inp.dz * m;
    if (this.grounded) {
      this.airTop = 0;
      if (surf === 'ice') rate = m > 0.05 ? this.stats.accel * 0.17 * this.stats.grip : 1.6;
      else if (this.stunT > 0) rate = 9;
      else if (m > 0.05) rate = sp > top + 0.6 ? 8 : this.stats.accel;
      else rate = 30;
      tx *= top;
      tz *= top;
    } else {
      this.airTop = Math.max(top, this.airTop - 2.5 * dt);
      rate = m > 0.05 ? this.stats.accel * this.stats.airCtl : 0.6;
      if (this.stunT > 0) rate = 0.6;
      tx *= this.airTop;
      tz *= this.airTop;
    }
    let dvx = tx - vel.x;
    let dvz = tz - vel.z;
    const dl = Math.hypot(dvx, dvz);
    const maxd = rate * dt;
    if (dl > maxd) {
      dvx *= maxd / dl;
      dvz *= maxd / dl;
    }
    vel.x += dvx + this.ext.x * dt;
    vel.z += dvz + this.ext.z * dt;
    this.ext.x = this.ext.z = 0;

    // facing
    if (act && m > 0.1) this.heading = dampAngle(this.heading, Math.atan2(inp.dx, inp.dz), this.stats.turn, dt);
    else if (sp > 1.5 && this.stunT <= 0) this.heading = dampAngle(this.heading, Math.atan2(vel.x, vel.z), 6, dt);

    // ---- horizontal move + walls ----
    pos.x += vel.x * dt;
    pos.z += vel.z * dt;
    const near = W.nearby(pos.x, pos.z, 2.6, this._near);
    for (let it = 0; it < 2; it++) {
      let hit = false;
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (!c.active || !c.solid) continue;
        const o = pushOut(c, pos.x, pos.z, RUNNER_R, pos.y, pos.y + RUNNER_H, this._po);
        if (!o) continue;
        hit = true;
        const vn = vel.x * o.nx + vel.z * o.nz;
        if (c.onTouch) c.onTouch(this);
        if (!c.active) continue; // a door that just broke
        pos.x = o.x;
        pos.z = o.z;
        if (c.bounce) {
          this.knock(o.nx, o.nz, c.bounce, 4, 0.3, true);
        } else if (vn < 0) {
          vel.x -= vn * o.nx;
          vel.z -= vn * o.nz;
        }
      }
      if (!hit) break;
    }

    // ---- vertical ----
    const yPrev = pos.y;
    const vyPrev = vel.y;
    vel.y -= g * dt;
    if (vel.y < -42) vel.y = -42;
    pos.y += vel.y * dt;
    if (vel.y > 0) {
      for (let i = 0; i < near.length; i++) {
        const c = near[i];
        if (!c.active) continue;
        const cy = ceilingAt(c, pos.x, pos.z, yPrev);
        if (cy !== Infinity && pos.y + RUNNER_H > cy && yPrev + RUNNER_H <= cy + 0.25) {
          pos.y = cy - RUNNER_H;
          vel.y = 0;
        }
      }
    }
    let best = -Infinity;
    let bc = null;
    const maxY = Math.max(yPrev, pos.y) + STEP_UP;
    for (let i = 0; i < near.length; i++) {
      const c = near[i];
      if (!c.active || !c.floor) continue;
      const t = floorTop(c, pos.x, pos.z);
      if (t <= maxY && t > best) {
        best = t;
        bc = c;
      }
    }
    const snap = this.grounded ? 0.38 : 0;
    if (bc && vel.y <= 0 && pos.y <= best + snap) {
      const wasAir = !this.grounded;
      pos.y = best;
      vel.y = 0;
      this.grounded = true;
      this.ground = bc;
      this.jumps = 0;
      this.coyote = 0.12;
      if (wasAir) this.emit('land', -vyPrev);
      if (bc.onStand) bc.onStand(this);
      if (bc.surface === 'bouncy' && this.fallT <= 0) {
        vel.y = wasAir && vyPrev < -10 ? 14 : 10;
        this.grounded = false;
        this.ground = null;
        this.jumps = 1;
        this.emit('boing');
      }
      if (this.jumpBuf > 0 && this.canAct() && this.grounded) this.doJump();
    } else {
      this.grounded = false;
      this.ground = null;
      if (this.coyote > 0) {
        this.coyote -= dt;
        if (this.coyote <= 0 && this.jumps === 0) this.jumps = 1;
      }
    }
  }

  syncModel(dt, mode) {
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.model.update(dt, {
      speed: this.grounded ? sp : 0,
      grounded: this.grounded,
      vy: this.vel.y,
      stun: this.stunT > 0 ? this.stunT : 0,
      boost: this.boostT > 0,
      frozen: this.frozenT > 0,
      flipT: this.flipT,
      mode: mode || 'run',
    });
    this.shield.visible = this.shieldT > 0;
    if (this.shield.visible) this.shield.scale.setScalar(1 + Math.sin(performance.now() * 0.01) * 0.03);
    this.ice.visible = this.frozenT > 0;
    const shrink = this.slowT > 0 ? 0.65 : 1;
    const base = this.ch.scale || 1;
    const sc = this.root.scale.x + (base * shrink - this.root.scale.x) * Math.min(1, dt * 8);
    this.root.scale.setScalar(sc);
    if (this.arrow) this.arrow.position.y = 2.2 + Math.sin(performance.now() * 0.005) * 0.08;
    // blink while invulnerable after a hit
    this.model.pose.visible = !(this.invulnT > 0 && this.stunT <= 0 && Math.floor(performance.now() / 70) % 2 === 0);
  }
}
