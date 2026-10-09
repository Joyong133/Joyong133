// One race: builds the course and runners, runs the fixed-step simulation,
// drives the camera, pickups, checkpoints, ranking and the finish.
import * as THREE from 'three';
import { buildCourse } from '../world/builder.js';
import { buildScenery, Weather } from '../world/scenery.js';
import { THEMES } from '../data/themes.js';
import { CHARACTERS, charById } from '../data/characters.js';
import { Runner, GRAVITY } from './runner.js';
import { Bot } from './ai.js';
import { Fx } from './fx.js';
import { Podium } from './podium.js';
import { GhostRecorder, GhostRunner, loadGhost, saveGhost } from './ghost.js';
import { ItemSystem, rollItem } from './items.js';
import { toon } from '../world/geom.js';
import { toLocalX, toLocalZ } from '../world/physics.js';
import { rng, clamp, dampAngle, damp, rightX, rightZ } from '../core/rng.js';
import { texture } from '../world/textures.js';

const STEP = 1 / 120;
const INTRO = 2.6;
const COUNT = 3.0;
const TAG_COLORS = ['#ffd23f', '#ff8a8a', '#7fd4ff', '#9be07b', '#ffb36b', '#d9a3ff', '#ff9ad5', '#ffffff'];
const DIFF = {
  easy: { skill: [0.1, 0.45], speed: [0.84, 0.9] },
  normal: { skill: [0.45, 0.8], speed: [0.91, 0.97] },
  hard: { skill: [0.8, 1.0], speed: [0.97, 1.02] },
};
const ease = (u) => u * u * (3 - 2 * u);

export class Race {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.map = opts.map;
    this.mode = opts.mode;
    this.scene = new THREE.Scene();
    this.camera = app.camera;
    this.state = 'intro';
    this.t = 0;
    this.clock = 0;
    this.acc = 0;
    this.finishOrder = [];
    this.firstFinish = null;
    this.shake = 0;
    this.rand = rng((Math.random() * 1e9) | 0);
    this.camYaw = 0;
    this.camPos = new THREE.Vector3();
    this.lookPos = new THREE.Vector3();
    this.tmpP = {};
    this.build();
  }

  build() {
    const map = this.map;
    const theme = (this.theme = THEMES[map.theme]);
    this.gravity = theme.gravity ?? 1;
    const q = this.app.quality;
    const b = buildCourse(theme, map);
    this.course = b;
    this.laps = map.laps || 1;
    this.L = b.L;
    this.lineS = b.lineS;
    this.total = this.laps * this.L;
    this.world = b.world;
    this.scene.add(b.group);
    this.scenery = buildScenery(theme, b, q);
    this.scene.add(this.scenery.group);
    this.scene.fog = this.scenery.fog;
    this.scene.background = new THREE.Color(theme.fog[0]);
    this.weather = new Weather(theme.particles, q);
    if (this.weather.points) this.scene.add(this.weather.points);
    this.fx = new Fx();
    this.fx.setViewport(this.app.renderer.domElement.height);
    this.scene.add(this.fx.points);
    this.items = new ItemSystem(this);
    this.scene.add(this.items.group);
    this.hookCourse();
    this.buildPickups();
    this.buildRunners();
    // camera starts on the intro path
    const p0 = this.course.pointAt(0);
    this.camYaw = p0.h;
    this.updateCamera(0);
  }

  hookCourse() {
    const c = this.course;
    c.fx = this.fx;
    c.onHit = (r) => {
      this.fx.burst(r.pos.x, r.pos.y + 1.2, r.pos.z, 10, [0xffe14a, 0xffffff], 5, 0.6, 0.6, { up: 2 });
    };
    c.onDoor = (r, broke, d) => {
      const near = this.near(r.pos);
      if (broke) {
        this.app.audio.sfx('doorBreak', near);
        this.fx.burst(d.col.x, d.col.top0 - 1.2, d.col.z, 16, [0xc58b52, 0xffd23f], 6, 0.7, 0.8, { up: 3, grav: -14 });
        if (r.isPlayer) this.app.hud.message('통과!', 'good');
      } else {
        this.app.audio.sfx('doorFake', near);
        if (r.isPlayer) this.app.hud.message('가짜 문!', 'bad');
      }
    };
    c.onSlam = (x, y, z) => {
      const d = this.player ? this.player.pos.distanceTo(new THREE.Vector3(x, y, z)) : 99;
      if (d < 25) {
        this.app.audio.sfx('slam', Math.max(0.2, 1 - d / 25));
        this.shake = Math.max(this.shake, 0.25 * (1 - d / 25));
      }
      this.fx.dust(x, y, z, 10, 0xd8d0c8);
    };
    c.onBoom = (x, y, z) => {
      const d = this.player ? this.player.pos.distanceTo(new THREE.Vector3(x, y, z)) : 99;
      if (d < 30) this.app.audio.sfx('boom', Math.max(0.2, 1 - d / 30));
      if (d < 14) this.shake = Math.max(this.shake, 0.35 * (1 - d / 14));
      this.fx.burst(x, y, z, 26, [0xff7a1a, 0xffd34d, 0x5a4040], 9, 1.4, 0.8, { up: 4, grav: -6 });
    };
  }

  buildPickups() {
    const c = this.course;
    // stars
    const shape = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const rr = k % 2 ? 0.2 : 0.45;
      if (k === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const sg = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 });
    sg.translate(0, 0, -0.07);
    this.stars = c.stars.map((s) => ({ ...s, on: true, t: 0 }));
    this.starMesh = new THREE.InstancedMesh(sg, toon({ color: 0xffd23f, emissive: 0xffa000, emissiveIntensity: 0.85 }), Math.max(1, this.stars.length));
    this.starMesh.count = this.stars.length;
    this.starMesh.frustumCulled = false;
    this.scene.add(this.starMesh);
    // item boxes
    this.boxes = this.mode === 'item' ? c.itemBoxes.map((s) => ({ ...s, on: true, t: 0 })) : [];
    this.boxMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toon({ map: texture('itembox'), emissive: 0x7a4aff, emissiveIntensity: 0.6, transparent: true, opacity: 0.92 }), Math.max(1, this.boxes.length));
    this.boxMesh.count = this.boxes.length;
    this.boxMesh.frustumCulled = false;
    this.scene.add(this.boxMesh);
    this.dummy = new THREE.Object3D();
  }

  buildRunners() {
    const c = this.course;
    const me = charById(this.opts.charId);
    this.runners = [];
    this.bots = [];
    const solo = this.mode === 'time';
    const slots = [0, 1, 2, 3, 4, 5, 6, 7];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    const outline = this.app.quality !== 'low';
    const player = new Runner(me, { name: me.name, isPlayer: true, idx: 0, outline });
    this.player = player;
    this.runners.push(player);
    if (!solo) {
      const others = CHARACTERS.filter((ch) => ch.id !== me.id);
      const d = DIFF[this.opts.diff] || DIFF.normal;
      others.forEach((ch, i) => {
        const r = new Runner(ch, { name: ch.name, idx: i + 1, color: TAG_COLORS[(i + 1) % TAG_COLORS.length], outline });
        const skill = d.skill[0] + this.rand() * (d.skill[1] - d.skill[0]);
        r.baseMul = d.speed[0] + this.rand() * (d.speed[1] - d.speed[0]);
        r.speedMul = r.baseMul;
        r.bot = new Bot(r, this, skill, rng((this.rand() * 1e9) | 0));
        this.runners.push(r);
        this.bots.push(r.bot);
      });
    }
    this.runners.forEach((r, i) => {
      const g = c.grid[solo ? 1 : slots[i]];
      r.place(g.x, g.y, g.z, g.h);
      r.grounded = true;
      r.s = g.s;
      r.pi = this.indexAtS(g.s);
      r.cp = 0;
      r.lap = 0;
      r.d = r.s - this.lineS;
      r.lapsDone = 0;
      r.lapMark = 0;
      r.lapTimes = [];
      r.gauge = 0;
      r.locked = true;
      r.respawnN = 0;
      r.padCd = 0;
      r.onEvent = (type, who, a) => this.onRunnerEvent(type, who, a);
      this.scene.add(r.root);
    });
    // time attack: race the best saved run and record this one
    if (solo) {
      this.recorder = new GhostRecorder();
      const g = loadGhost(this.map.id);
      if (g) {
        this.ghost = new GhostRunner(g);
        this.scene.add(this.ghost.root);
      }
    }
  }

  indexAtS(s) {
    const P = this.course.path;
    let lo = 0;
    let hi = P.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (P[mid].s <= s) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  near(pos) {
    if (!this.player) return 0;
    const d = this.player.pos.distanceTo(pos);
    return d > 30 ? 0 : 1 - d / 30;
  }

  onRunnerEvent(type, r, a) {
    const audio = this.app.audio;
    const me = r.isPlayer;
    const v = me ? 1 : this.near(r.pos) * 0.5;
    const hud = this.app.hud;
    switch (type) {
      case 'jump':
        if (v > 0.05) audio.sfx('jump', v);
        this.fx.dust(r.pos.x, r.pos.y, r.pos.z, 4);
        break;
      case 'djump':
        if (v > 0.05) audio.sfx('djump', v);
        this.fx.burst(r.pos.x, r.pos.y + 0.5, r.pos.z, 8, [0xffffff, 0xbfe8ff], 3, 0.6, 0.4, { drag: 4 });
        break;
      case 'land':
        if (a > 7) {
          if (me) audio.sfx('land', Math.min(1, a / 20));
          this.fx.dust(r.pos.x, r.pos.y, r.pos.z, 6);
        }
        break;
      case 'hit':
        if (v > 0.05) audio.sfx('hit', v);
        if (me) {
          this.shake = Math.max(this.shake, 0.3);
          hud.message(this.rand() < 0.5 ? '꽈당!' : '으악!', 'bad');
        }
        break;
      case 'bump':
        if (v > 0.05) audio.sfx('bump', v);
        break;
      case 'boing':
        if (me) audio.sfx('boing', 0.7);
        break;
      case 'dash':
        if (v > 0.05) audio.sfx('dash', v);
        if (me) hud.message('부스터!', 'good');
        break;
      case 'shieldPop':
        if (v > 0.05) audio.sfx('shieldPop', v);
        this.fx.burst(r.pos.x, r.pos.y + 0.9, r.pos.z, 14, [0x8fe3ff, 0xffffff], 5, 0.6, 0.5);
        if (me) hud.message('방패가 막았어요!', 'good');
        break;
      case 'zapped':
        if (me) {
          audio.sfx('zap');
          hud.message('번개에 맞았어요!', 'bad');
          hud.flash('#fff6a0');
        }
        break;
      case 'frozen':
        if (v > 0.05) audio.sfx('freeze', v);
        if (me) hud.message('꽁꽁 얼었어요!', 'bad');
        break;
      case 'honey':
        if (me) {
          audio.sfx('honey');
          hud.message('끈적끈적!', 'bad');
        }
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------------------ loop
  update(dt) {
    dt = Math.min(dt, 0.1);
    if (this.paused) {
      if (this.app.input.take('pause')) this.app.togglePause();
      return;
    }
    if (this.podium) {
      this.app.input.clear();
      this.podium.update(dt);
      return;
    }
    this.readPlayerInput();
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 14) {
      this.fixed(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n === 14) this.acc = 0;
    this.frame(dt);
  }

  // Simulate without rendering (used by the self-test).
  simulate(seconds) {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) this.fixed(STEP);
  }

  readPlayerInput() {
    const input = this.app.input;
    const p = this.player;
    if (this.autoPlay) {
      input.clear();
      return;
    }
    const a = input.axis();
    const yaw = this.camYaw;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let dx = fx * a.y + rightX(yaw) * a.x;
    let dz = fz * a.y + rightZ(yaw) * a.x;
    const m = Math.hypot(dx, dz);
    if (m > 0.01) {
      dx /= m;
      dz /= m;
    } else {
      dx = fx;
      dz = fz;
    }
    p.input.dx = dx;
    p.input.dz = dz;
    p.input.m = Math.min(1, m);
    // start dash: press forward right as GO appears
    if (this.state === 'countdown' || (this.state === 'run' && this.clock < 0.35)) {
      const fwd = a.y > 0.5;
      if (fwd && !this.fwdWas) {
        const tc = this.state === 'countdown' ? this.t - INTRO - COUNT : this.clock;
        if (tc < -0.35) this.early = true;
        else if (!this.early && !this.startDashed) {
          this.startDashed = true;
          this.pendingDash = true;
        }
      }
      this.fwdWas = fwd;
    }
    if (input.take('jump')) p.input.jump = true;
    if (input.take('boost')) p.input.boost = true;
    if (input.take('item')) p.input.item = true;
    if (input.take('reset') && this.state === 'run' && !p.finished && p.fallT <= 0 && (this.resetCd || 0) <= 0) {
      this.resetCd = 2;
      this.respawn(p);
    }
    if (input.take('pause')) this.app.togglePause();
  }

  fixed(dt) {
    this.t += dt;
    if (this.resetCd > 0) this.resetCd -= dt;
    const c = this.course;
    if (this.state === 'intro' && this.t >= INTRO) {
      this.state = 'countdown';
      this.countStep = -1;
    }
    if (this.state === 'countdown') {
      const k = Math.floor(this.t - INTRO);
      if (k !== this.countStep && k < 3) {
        this.countStep = k;
        this.app.hud.countdown(String(3 - k));
        this.app.audio.sfx('count');
        this.setLamps(k + 1, 0xff3030);
      }
      if (this.t >= INTRO + COUNT) this.go();
    }
    const running = this.state === 'run' || this.state === 'finish';
    if (running) this.clock += dt;
    if (this.recorder && this.state === 'run' && !this.player.finished) this.recorder.sample(this.clock, this.player);

    c.update(this.t, dt);
    if (running) for (const b of this.bots) b.think(dt, this.t);
    if (this.autoPlay && running && !this.player.finished) this.autoPlay.think(dt, this.t);

    const g = GRAVITY * this.gravity;
    for (const r of this.runners) {
      if (r.padCd > 0) r.padCd -= dt;
      if (r.fallT > 0) {
        r.fallT -= dt;
        r.vel.y -= g * dt;
        r.pos.addScaledVector(r.vel, dt);
        if (r.fallT <= 0) this.respawn(r);
        continue;
      }
      r.step(dt, this);
    }
    this.collideRunners();
    for (const hz of c.hazards) {
      for (const r of this.runners) {
        if (r.fallT > 0 || r.s < hz.s0 - 4 || r.s > hz.s1 + 4) continue;
        hz.collide(r);
      }
    }
    this.items.update(dt);
    for (const r of this.runners) {
      if (r.fallT > 0) continue;
      this.triggers(r);
      this.pickups(r, dt);
      this.progress(r);
    }
    this.updatePickups(dt);
    this.rank();
    this.bands();
    if (running) this.checkEnd(dt);
  }

  // Light the first n countdown lamps on the start gate.
  setLamps(n, color) {
    const lamps = this.course.startArch?.userData.lamps || [];
    lamps.forEach((l, i) => l.material.color.set(i < n ? color : 0x3a2a2a).multiplyScalar(i < n ? 3 : 1));
  }

  go() {
    this.setLamps(3, 0x3aff6a);
    this.state = 'run';
    this.clock = 0;
    this.app.hud.countdown('GO!');
    this.app.audio.sfx('go');
    for (const r of this.runners) r.locked = false;
    if (this.pendingDash && !this.early) this.startDash(this.player);
    for (const r of this.runners) {
      if (r.bot && this.rand() < 0.25 + r.bot.skill * 0.5) this.startDash(r);
    }
  }

  startDash(r) {
    r.dash(1.4, 1.5);
    if (r.isPlayer) {
      this.app.audio.sfx('startDash');
      this.app.hud.message('스타트 대시!', 'good');
    }
  }

  collideRunners() {
    const R = this.runners;
    const D = 0.8;
    for (let i = 0; i < R.length; i++) {
      const a = R[i];
      if (a.fallT > 0 || a.finished) continue;
      for (let j = i + 1; j < R.length; j++) {
        const b = R[j];
        if (b.fallT > 0 || b.finished) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= D * D || Math.abs(b.pos.y - a.pos.y) > 1.2) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = d2 > 1e-6 ? dx / d : 1;
        const nz = d2 > 1e-6 ? dz / d : 0;
        const ov = D - d;
        const wa = b.stats.mass / (a.stats.mass + b.stats.mass);
        const wb = 1 - wa;
        a.pos.x -= nx * ov * wa;
        a.pos.z -= nz * ov * wa;
        b.pos.x += nx * ov * wb;
        b.pos.z += nz * ov * wb;
        const rel = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rel < 0) {
          a.vel.x += nx * rel * wa;
          a.vel.z += nz * rel * wa;
          b.vel.x -= nx * rel * wb;
          b.vel.z -= nz * rel * wb;
        }
      }
    }
  }

  triggers(r) {
    for (const tr of this.course.triggers) {
      if (Math.abs(tr.s - r.s) > 5) continue;
      const c = tr.col;
      const lx = toLocalX(c, r.pos.x, r.pos.z);
      const lz = toLocalZ(c, r.pos.x, r.pos.z);
      if (Math.abs(lx) > c.hx + 0.25 || Math.abs(lz) > c.hz + 0.25) continue;
      if (r.pos.y - tr.y > 0.9 || r.pos.y < tr.y - 0.6) continue;
      if (r.padCd > 0) continue;
      const fx = Math.sin(tr.h);
      const fz = Math.cos(tr.h);
      if (tr.kind === 'boost') {
        r.padCd = 0.4;
        r.dash(1.3, 1.5);
        const sp = Math.max(Math.hypot(r.vel.x, r.vel.z), r.stats.maxSpeed * 1.4);
        const along = r.vel.x * fx + r.vel.z * fz;
        if (along < sp) {
          r.vel.x += fx * (sp - along);
          r.vel.z += fz * (sp - along);
        }
        if (r.isPlayer) this.app.audio.sfx('boost');
        this.fx.burst(r.pos.x, r.pos.y + 0.3, r.pos.z, 8, [0xffd23f, 0xff9a1f], 4, 0.6, 0.4);
      } else if (tr.kind === 'jump') {
        if (r.vel.y > 2) continue;
        r.padCd = 0.6;
        const lat = r.vel.x * rightX(tr.h) + r.vel.z * rightZ(tr.h);
        r.vel.x = fx * tr.speed + rightX(tr.h) * lat * 0.3;
        r.vel.z = fz * tr.speed + rightZ(tr.h) * lat * 0.3;
        r.vel.y = tr.vy;
        r.airTop = tr.speed;
        r.grounded = false;
        r.ground = null;
        r.jumps = 1;
        r.coyote = 0;
        if (r.isPlayer || this.near(r.pos) > 0.3) this.app.audio.sfx('spring', r.isPlayer ? 1 : 0.4);
        this.fx.burst(r.pos.x, r.pos.y + 0.2, r.pos.z, 10, [0xffffff, 0xffd23f], 4, 0.7, 0.5, { up: 3 });
      }
    }
  }

  pickups(r) {
    for (const st of this.stars) {
      if (!st.on || Math.abs(st.s - r.s) > 2.2) continue;
      const dx = st.x - r.pos.x;
      const dy = st.y - (r.pos.y + 0.8);
      const dz = st.z - r.pos.z;
      if (dx * dx + dy * dy + dz * dz > 1.7) continue;
      st.on = false;
      st.t = 8;
      r.gauge = Math.min(100, r.gauge + 12);
      if (r.isPlayer) {
        this.app.audio.sfx('star', 0.8);
        this.fx.burst(st.x, st.y, st.z, 8, [0xffe14a, 0xffffff], 3, 0.5, 0.4);
      }
    }
    for (const bx of this.boxes) {
      if (!bx.on || Math.abs(bx.s - r.s) > 2.5) continue;
      const dx = bx.x - r.pos.x;
      const dy = bx.y - (r.pos.y + 0.8);
      const dz = bx.z - r.pos.z;
      if (dx * dx + dy * dy + dz * dz > 2.2) continue;
      bx.on = false;
      bx.t = 3;
      this.fx.burst(bx.x, bx.y, bx.z, 12, [0x7b5cff, 0xff6ad5, 0xffffff], 5, 0.6, 0.5);
      if (!r.item) {
        r.item = rollItem(r.rank || 1, this.runners.length, this.rand);
        if (r.isPlayer) {
          this.app.audio.sfx('item');
          this.app.hud.itemGot(r.item);
        }
      }
    }
  }

  updatePickups(dt) {
    for (const st of this.stars) {
      if (!st.on) {
        st.t -= dt;
        if (st.t <= 0) st.on = true;
      }
    }
    for (const bx of this.boxes) {
      if (!bx.on) {
        bx.t -= dt;
        if (bx.t <= 0) bx.on = true;
      }
    }
  }

  progress(r) {
    const c = this.course;
    const P = c.path;
    const M = c.M;
    const loop = c.loop;
    const wrap = (k) => (loop ? ((k % M) + M) % M : clamp(k, 0, P.length - 1));
    let bi = r.pi;
    let best = Infinity;
    for (let k = r.pi - 8; k <= r.pi + 14; k++) {
      const j = wrap(k);
      const p = P[j];
      const dx = p.x - r.pos.x;
      const dz = p.z - r.pos.z;
      const dy = (p.y - r.pos.y) * 0.6;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < best) {
        best = d;
        bi = j;
      }
    }
    r.pi = bi;
    const p = P[bi];
    const along = clamp((r.pos.x - p.x) * Math.sin(p.h) + (r.pos.z - p.z) * Math.cos(p.h), -2, 2);
    let s = p.s + along;
    if (loop) s = ((s % this.L) + this.L) % this.L;
    else s = clamp(s, 0, this.L);
    // crossing the loop's seam counts laps (both ways, in case of running backwards)
    if (loop) {
      if (r.s - s > this.L / 2) {
        r.lap++;
        r.cp = 0;
      } else if (s - r.s > this.L / 2) r.lap--;
    }
    r.s = s;
    r.d = r.lap * this.L + (s - this.lineS);

    // fell off?
    if (r.pos.y < c.lowAt(bi) - 7 && r.fallT <= 0) {
      r.fallT = 0.9;
      r.vel.x *= 0.3;
      r.vel.z *= 0.3;
      if (r.isPlayer) {
        this.app.audio.sfx('fall');
        this.app.hud.message('앗, 떨어졌다!', 'bad');
      }
      const gk = this.theme.ground.kind;
      if (gk === 'water' || gk === 'lava') {
        const gy = c.groundY;
        this.splashAt = { x: r.pos.x, z: r.pos.z, y: gy, t: (r.pos.y - gy) / 20, lava: gk === 'lava' };
      }
      return;
    }
    // checkpoints
    const cps = c.checkpoints;
    const next = cps[r.cp + 1];
    if (next && r.grounded && r.s >= next.s && r.s < next.s + 40) {
      r.cp++;
      if (r.isPlayer) {
        this.app.audio.sfx('checkpoint');
        this.app.hud.message('체크포인트', 'cp');
      }
    }
    const racing = this.state === 'run' || this.state === 'finish';
    // laps
    const done = Math.floor(r.d / this.L);
    if (racing && done > r.lapsDone && !r.finished) {
      r.lapsDone = done;
      r.lapTimes.push(this.clock - r.lapMark);
      r.lapMark = this.clock;
      if (r.isPlayer && done < this.laps) {
        const last = done === this.laps - 1;
        this.app.audio.sfx(last ? 'finalLap' : 'lap');
        this.app.hud.lap(done + 1, this.laps, r.lapTimes[r.lapTimes.length - 1]);
        this.app.hud.message(last ? '마지막 바퀴!' : `${done + 1}바퀴째!`, last ? 'final' : 'cp');
      }
      if (r.isPlayer && this.ghost) this.ghostSplit(done);
    }
    // finish
    if (!r.finished && r.d >= this.total && racing) this.finish(r);
  }

  // lap split against the ghost: negative = ahead of it
  ghostSplit(lap) {
    const gt = this.ghost.lapClock(lap);
    if (gt === null) return;
    const dlt = this.clock - gt;
    this.app.hud.message(`고스트 ${dlt < 0 ? '−' : '+'}${Math.abs(dlt).toFixed(2)}초`, dlt < 0 ? 'good' : 'bad');
  }

  finish(r) {
    r.finished = true;
    r.finishTime = this.clock;
    if (r.isPlayer && this.recorder) {
      this.recorder.sample(this.clock, r);
      const old = this.ghost?.data.time;
      this.ghostDelta = old ? r.finishTime - old : null;
      if (!old || r.finishTime < old) this.ghostSaved = saveGhost(this.map.id, this.recorder.data(r));
    }
    r.locked = true;
    this.finishOrder.push(r);
    r.place_ = this.finishOrder.length;
    if (this.firstFinish === null) this.firstFinish = this.clock;
    this.fx.confetti(r.pos.x, r.pos.y + 2, r.pos.z, r.isPlayer ? 120 : 30);
    if (r.isPlayer) {
      this.state = 'finish';
      this.finishWait = 0;
      this.app.audio.sfx('finish');
      this.app.audio.music('win');
      const solo = this.mode === 'time';
      this.app.hud.finish(solo ? '골인!' : `${r.place_}위 골인!`, r.place_);
      this.orbit = Math.atan2(this.camera.position.x - r.pos.x, this.camera.position.z - r.pos.z);
    }
  }

  rank() {
    const list = this.runners.slice().sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.d - a.d;
    });
    list.forEach((r, i) => (r.rank = i + 1));
    this.order = list;
  }

  // gentle rubber-banding so races stay close
  bands() {
    if (!this.bots.length) return;
    const ps = this.player.d;
    const hard = this.opts.diff === 'hard';
    for (const b of this.bots) {
      const r = b.r;
      const d = ps - r.d; // > 0: bot is behind the player
      const k = d > 0 ? clamp(d / 160, 0, 0.07) : -clamp(-d / 220, 0, hard ? 0.02 : 0.05);
      r.speedMul = r.baseMul * (1 + k);
    }
  }

  checkEnd(dt) {
    const solo = this.mode === 'time';
    if (this.state === 'finish') {
      this.finishWait += dt;
      const all = this.runners.every((r) => r.finished);
      if (this.finishWait > (solo ? 3.5 : all ? 3 : 7)) this.end();
      return;
    }
    if (!solo && this.firstFinish !== null && this.clock - this.firstFinish > 30) this.end();
  }

  timeLeft() {
    if (this.firstFinish === null || this.player.finished || this.mode === 'time') return null;
    return Math.max(0, 30 - (this.clock - this.firstFinish));
  }

  end() {
    if (this.state === 'end') return;
    this.state = 'end';
    const rows = this.order.map((r) => ({
      name: r.name,
      ch: r.ch,
      isPlayer: r.isPlayer,
      time: r.finished ? r.finishTime : null,
      rank: r.rank,
      dnf: !r.finished,
      best: r.lapTimes.length ? Math.min(...r.lapTimes) : null,
    }));
    const p = this.player;
    // award ceremony replaces the track view
    this.podium = new Podium(this);
    this.app.hud.ceremony();
    this.app.audio.sfx('cheer', 0.8);
    this.app.audio.sfx('applause', 0.8);
    this.app.onRaceEnd({
      map: this.map,
      mode: this.mode,
      rows,
      rank: p.finished ? p.rank : null,
      time: p.finished ? p.finishTime : null,
      bestLap: p.lapTimes.length ? Math.min(...p.lapTimes) : null,
      laps: this.laps,
      solo: this.mode === 'time',
      ghostDelta: this.ghostDelta ?? null,
      ghostSaved: !!this.ghostSaved,
    });
  }

  respawn(r) {
    const cps = this.course.checkpoints;
    if (r.cp === r.respawnCp) r.respawnN++;
    else {
      r.respawnCp = r.cp;
      r.respawnN = 1;
    }
    let ci = r.cp;
    // a bot that keeps failing at the same spot gets a nudge forward
    if (r.bot && r.respawnN > 3 && ci + 1 < cps.length) {
      ci++;
      r.cp = ci;
      r.respawnN = 0;
    }
    const cp = cps[ci];
    const lat = (((r.idx % 4) - 1.5) * Math.min(1.8, (cp.w - 1.5) / 4));
    r.place(cp.x + rightX(cp.h) * lat, cp.y, cp.z + rightZ(cp.h) * lat, cp.h);
    r.grounded = true;
    r.coyote = 0.12;
    r.invulnT = 1.6;
    r.pi = this.indexAtS(cp.s);
    r.s = cp.s;
    r.d = r.lap * this.L + (r.s - this.lineS);
    (r.bot || (r.isPlayer && this.autoPlay))?.onRespawn();
    if (r.isPlayer) {
      this.app.audio.sfx('respawn');
      this.camYaw = cp.h;
      this.snapCam = true;
    }
    this.fx.burst(r.pos.x, r.pos.y + 1, r.pos.z, 12, [0xffffff, 0xffe14a], 3, 0.6, 0.6, { up: 2 });
  }

  useItem(r) {
    if (r.isPlayer) this.app.audio.sfx('itemUse');
    this.items.use(r);
    if (r.isPlayer) this.app.hud.itemGot(null);
  }

  onItemUse(r, it) {
    if (it === 'shield' && r.isPlayer) this.app.audio.sfx('shield');
    if (it === 'bolt') {
      this.app.audio.sfx('zap', r.isPlayer ? 1 : 0.5);
      this.app.hud.flash('#fffbd0', 0.25);
    }
    if (r.isPlayer) {
      const names = { rocket: '로켓 부스터!', shield: '요정 방패!', bolt: '번개 구름!', ice: '얼음 마법!', honey: '꿀단지!', storm: '회오리!' };
      this.app.hud.message(names[it] || '', 'good');
    }
  }

  // ------------------------------------------------------------ visuals
  frame(dt) {
    const t = this.t;
    for (const r of this.runners) {
      let mode = 'run';
      const sp = Math.hypot(r.vel.x, r.vel.z);
      if (r.finished && r.grounded && sp < 3) mode = 'win';
      else if (this.state === 'intro' || this.state === 'countdown') mode = 'idle';
      r.syncModel(dt, mode);
      if (r.tag) {
        const d = r.pos.distanceTo(this.camera.position);
        r.tag.visible = d > 3.5 && d < 70 && r.fallT <= 0;
      }
      if (r.boostT > 0 && r.grounded && Math.random() < 0.6) {
        this.fx.emit(r.pos.x + (Math.random() - 0.5) * 0.4, r.pos.y + 0.4, r.pos.z + (Math.random() - 0.5) * 0.4, -r.vel.x * 0.1, 0.6, -r.vel.z * 0.1, Math.random() < 0.5 ? 0xffb81a : 0xff5a14, 0.7, 0.3, 0, 2);
      }
      if (r.grounded && sp > 8 && Math.random() < dt * 8) this.fx.dust(r.pos.x, r.pos.y, r.pos.z, 1);
      // footsteps, one per stride
      if (r.isPlayer && r.grounded && sp > 1.5 && r.fallT <= 0) {
        r.stride = (r.stride || 0) + sp * dt;
        if (r.stride > 1.9) {
          r.stride = 0;
          const surf = r.ground?.surface;
          this.app.audio.sfx(surf === 'ice' ? 'stepIce' : surf === 'sand' || surf === 'jelly' || surf === 'bouncy' ? 'stepSoft' : 'step', 0.8);
        }
      }
    }
    if (this.ghost) this.ghost.update(this.clock, dt, this.camera.position, this.state === 'intro' || this.state === 'countdown' ? 'idle' : 'run');
    // stars
    const d = this.dummy;
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      d.position.set(s.x, s.y + Math.sin(t * 2.5 + i * 0.7) * 0.12, s.z);
      d.rotation.set(0, t * 2.4 + i * 0.3, 0);
      d.scale.setScalar(s.on ? 1 : 0.0001);
      d.updateMatrix();
      this.starMesh.setMatrixAt(i, d.matrix);
    }
    this.starMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      d.position.set(b.x, b.y + Math.sin(t * 2 + i) * 0.15, b.z);
      d.rotation.set(t * 0.8 + i, t * 1.3 + i, 0);
      d.scale.setScalar(b.on ? 1 : 0.0001);
      d.updateMatrix();
      this.boxMesh.setMatrixAt(i, d.matrix);
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    // falling splash
    if (this.splashAt) {
      this.splashAt.t -= dt;
      if (this.splashAt.t <= 0) {
        const s = this.splashAt;
        this.fx.burst(s.x, s.y + 0.3, s.z, 24, s.lava ? [0xff7a1a, 0xffd34d] : [0xffffff, 0xbfe8ff], 6, 1.0, 0.8, { up: 6, grav: -14 });
        this.splashAt = null;
      }
    }
    this.course.animate(t);
    this.fx.update(dt);
    this.updateCamera(dt);
    this.weather.update(dt, t, this.camera.position);
    this.scenery.update(t, this.camera.position);
    this.scenery.followShadow(this.player.pos);
    this.app.hud.update(this);
  }

  updateCamera(dt) {
    const cam = this.camera;
    const p = this.player;
    const c = this.course;
    if (!p) return;
    const lookP = c.pointAt(p.s + 7, this.tmpP);
    if (this.state === 'intro') {
      const k = ease(Math.min(1, this.t / INTRO));
      const s0 = c.pointAt(28, {});
      const from = new THREE.Vector3(s0.x + rightX(s0.h) * 14, s0.y + 14, s0.z + rightZ(s0.h) * 14);
      const to = new THREE.Vector3(p.pos.x - Math.sin(p.heading) * 7, p.pos.y + 3, p.pos.z - Math.cos(p.heading) * 7);
      cam.position.lerpVectors(from, to, k);
      const lf = new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z);
      cam.lookAt(lf);
      this.camYaw = p.heading;
      this.camPos.copy(cam.position);
      cam.fov = 60;
      cam.updateProjectionMatrix();
      return;
    }
    if (this.state === 'finish' || this.state === 'end') {
      this.orbit = (this.orbit || 0) + dt * 0.45;
      const tgt = new THREE.Vector3(p.pos.x + Math.sin(this.orbit) * 5.5, p.pos.y + 2.2, p.pos.z + Math.cos(this.orbit) * 5.5);
      cam.position.lerp(tgt, 1 - Math.exp(-3 * dt));
      cam.lookAt(p.pos.x, p.pos.y + 1, p.pos.z);
      return;
    }
    if (p.fallT <= 0) this.camYaw = dampAngle(this.camYaw, lookP.h, 3.2, dt);
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const dist = 7 + (p.boostT > 0 ? 1.1 : 0);
    const tx = p.pos.x - fx * dist;
    const tz = p.pos.z - fz * dist;
    const ty = p.pos.y + 3.4;
    if (this.snapCam || dt === 0) {
      this.camPos.set(tx, ty, tz);
      this.snapCam = false;
    } else if (p.fallT <= 0) {
      this.camPos.x = damp(this.camPos.x, tx, 10, dt);
      this.camPos.z = damp(this.camPos.z, tz, 10, dt);
      this.camPos.y = damp(this.camPos.y, ty, 6, dt);
    }
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      const s = this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
    }
    this.lookPos.set(p.pos.x + fx * 4, p.pos.y + 1.2, p.pos.z + fz * 4);
    cam.lookAt(this.lookPos);
    // portrait screens get a wider view so the track edges stay visible
    const aspect = cam.aspect || 1;
    const base = aspect < 1 ? 60 + (1 - aspect) * 26 : 60;
    const fov = base + (p.boostT > 0 ? 10 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) {
      cam.fov = damp(cam.fov, fov, 5, dt);
      cam.updateProjectionMatrix();
    }
  }

  // Free this race's GPU resources. Shared (cached) textures/materials stay.
  dispose() {
    const mats = new Set();
    const scenes = [this.scene];
    if (this.podium) scenes.push(this.podium.scene);
    for (const sc of scenes) sc.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.isInstancedMesh) o.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((x) => mats.add(x));
      else if (m) mats.add(m);
    });
    for (const m of mats) {
      for (const k of ['map', 'gradientMap']) {
        const t = m[k];
        if (t && !t.userData?.shared && k === 'map') t.dispose();
      }
      if (!m.userData?.shared) m.dispose();
    }
  }
}
