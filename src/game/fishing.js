// Fishing mini-game: swing (or click) to cast, wait for the bobber to plunge,
// strike in time, then reel (mash the trigger / click) before the line snaps.
import * as THREE from 'three';
import { ITEMS } from './inventory.js';
import { BTN } from './input.js';

export const FISH_TABLES = {
  lake1: [
    { id: 'fish_minnow', w: 35, size: [6, 14], pull: 0.06, color: 0xb8c4c8 },
    { id: 'fish_trout', w: 28, size: [22, 45], pull: 0.1, color: 0x8a9a6a },
    { id: 'fish_carp', w: 20, size: [30, 70], pull: 0.15, color: 0xa08050 },
    { id: 'fish_rainbow', w: 11, size: [35, 60], pull: 0.2, color: 0xd88aa0 },
    { id: 'fish_gold', w: 5, size: [40, 80], pull: 0.28, color: 0xffc830 },
    { id: 'fish_lord', w: 1, size: [150, 240], pull: 0.42, color: 0x3a4a5a },
  ],
  lake2: [
    { id: 'fish_mesa', w: 34, size: [25, 50], pull: 0.12, color: 0x9a8a70 },
    { id: 'fish_trout', w: 20, size: [22, 45], pull: 0.1, color: 0x8a9a6a },
    { id: 'fish_cat', w: 22, size: [40, 90], pull: 0.18, color: 0xb05a3a },
    { id: 'fish_crystal', w: 16, size: [10, 18], pull: 0.24, color: 0xbfe8ff },
    { id: 'fish_gold', w: 6, size: [40, 80], pull: 0.28, color: 0xffc830 },
    { id: 'fish_dragon', w: 2, size: [180, 300], pull: 0.45, color: 0x3a8a9a },
  ],
};

function rodModel() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.7 });
  const cork = new THREE.MeshStandardMaterial({ color: 0xb89a6a, roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.35 });
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.3, 8), cork);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 1.5, 6), wood);
  shaft.position.y = 0.9;
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), metal);
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0.035, 0.1, 0.02);
  g.add(handle, shaft, reel);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return g;
}

function fishModel(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3, emissive: color, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat);
  body.scale.set(0.35, 0.45, 1);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.3, 4), mat);
  tail.rotation.x = Math.PI / 2;
  tail.scale.set(0.3, 1, 1.2);
  tail.position.z = -0.6;
  g.add(body, tail);
  return g;
}

export class Fishing {
  constructor(scene, game) {
    this.game = game;
    this.active = false;
    this.rodRoot = new THREE.Group();
    this.rodHolder = new THREE.Group();
    this.rodRoot.add(this.rodHolder);
    this.rod = rodModel();
    this.rodHolder.add(this.rod);
    this.rodRoot.visible = false;
    const bm = new THREE.MeshStandardMaterial({ color: 0xff3a2a, roughness: 0.4, emissive: 0x401008 });
    this.bobber = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bm);
    const bot = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }));
    top.scale.y = 0.8;
    this.bobber.add(top, bot);
    this.bobber.visible = false;
    scene.add(this.bobber);
    this.lineGeo = new THREE.BufferGeometry();
    this.linePts = new Float32Array(12 * 3);
    this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePts, 3));
    this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0.7 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
    this.tip = new THREE.Vector3();
    this.prevTip = new THREE.Vector3();
    this.tipSpeed = 0;
    this.bobPos = new THREE.Vector3();
    this.state = 'off';
    this.catchFx = null;
  }

  mount() {
    const g = this.game;
    if (g.isVR) {
      const hand = g.input.hands[g.settings.mainHand];
      if (hand.grip) {
        hand.grip.add(this.rodRoot);
        this.rodHolder.rotation.set(-Math.PI / 2 + THREE.MathUtils.degToRad(35), 0, 0);
        this.rodHolder.position.set(0, 0, 0.02);
      }
    } else {
      g.camera.add(this.rodRoot);
      this.rodRoot.position.set(0.26, -0.32, -0.45);
      this.rodHolder.rotation.set(-0.55, 0, -0.15);
    }
  }

  start(spot) {
    const g = this.game;
    this.spot = spot;
    this.active = true;
    this.state = 'ready';
    this.t = 0;
    this.mount();
    this.rodRoot.visible = true;
    this.first = true;
    g.sword.setVisible(false);
    g.mini.show('낚시', g.isVR ? '컨트롤러를 앞으로 휘두르거나 트리거로 던지기 · B: 그만두기' : '클릭해서 던지기 · E / Tab: 그만두기', null);
    g.audio.play('select', { vol: 0.6 });
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.state = 'off';
    this.rodRoot.visible = false;
    this.rodRoot.removeFromParent();
    this.bobber.visible = false;
    this.line.visible = false;
    this.game.mini.hide();
  }

  _trackTip(dt) {
    this.rod.updateWorldMatrix(true, false);
    this.prevTip.copy(this.tip);
    this.tip.set(0, 1.64, 0).applyMatrix4(this.rod.matrixWorld);
    if (this.first) { this.prevTip.copy(this.tip); this.first = false; }
    const v = this.tip.distanceTo(this.prevTip) / Math.max(dt, 1e-3);
    this.tipSpeed += (v - this.tipSpeed) * Math.min(1, dt * 15);
  }

  _press(vr) {
    const g = this.game;
    const main = g.settings.mainHand;
    if (vr) return g.input.pressed(main, BTN.trigger) || g.input.pressed(main, BTN.a);
    return g.input.mouse.leftPressed;
  }

  _rollFish() {
    const table = FISH_TABLES[this.spot.table];
    const tot = table.reduce((a, f) => a + f.w, 0);
    let r = Math.random() * tot;
    for (const f of table) {
      r -= f.w;
      if (r <= 0) return f;
    }
    return table[0];
  }

  update(dt, vr) {
    if (!this.active) return;
    const g = this.game;
    this.t += dt;
    this._trackTip(dt);
    const w = this.spot.water;
    const main = g.settings.mainHand;
    // leave when walking away
    if (Math.hypot(g.player.feet.x - this.spot.pos.x, g.player.feet.z - this.spot.pos.z) > this.spot.r + 2.5) {
      this.stop();
      g.toasts.push('낚시 종료', '낚시터에서 벗어났습니다');
      return;
    }
    const press = this._press(vr);
    switch (this.state) {
      case 'ready': {
        const flick = vr && this.tipSpeed > 3.6;
        if (press || flick) this._cast();
        break;
      }
      case 'cast': {
        const k = Math.min(1, this.t / 0.9);
        this.bobPos.lerpVectors(this.castFrom, this.castTo, k);
        this.bobPos.y += Math.sin(k * Math.PI) * 3.2;
        if (k >= 1) {
          this.state = 'wait';
          this.t = 0;
          this.biteAt = 2.5 + Math.random() * 6;
          this.nibbleAt = 0.8 + Math.random() * 1.5;
          g.audio.play('splash', { pos: this.castTo, vol: 0.5, rate: 1.4 });
          g.effects.sparks(this.castTo.clone(), new THREE.Vector3(0, 1, 0), 0xdff4ff, 8, 1.5);
          g.mini.show('입질을 기다리는 중…', '찌가 쑥 가라앉으면 바로 당기세요!', null);
        }
        break;
      }
      case 'wait': {
        this.bobPos.copy(this.castTo);
        this.bobPos.y = w.y + Math.sin(this.t * 2.2) * 0.015;
        if (this.t > this.nibbleAt && this.t < this.biteAt - 0.6) {
          this.bobPos.y -= 0.05;
          if (!this._nib) {
            this._nib = true;
            if (vr) g.input.haptic(main, 0.15, 30);
            g.audio.play('click', { pos: this.bobPos, vol: 0.3, rate: 0.5 });
          }
          if (this.t > this.nibbleAt + 0.25) { this.nibbleAt = this.t + 0.8 + Math.random() * 1.6; this._nib = false; }
        }
        if (press) {
          // struck too early: the fish is scared off
          this._reset('너무 일찍 당겼다…', '찌가 가라앉을 때 당기세요');
          break;
        }
        if (this.t >= this.biteAt) {
          this.state = 'bite';
          this.t = 0;
          this.fish = this._rollFish();
          g.audio.play('splash', { pos: this.bobPos, vol: 0.9 });
          g.effects.sparks(this.bobPos.clone(), new THREE.Vector3(0, 1, 0), 0xdff4ff, 18, 2.5);
          if (vr) g.input.haptic(main, 0.9, 180);
          g.mini.show('!!! 입질 !!!', vr ? '지금 트리거!' : '지금 클릭!', null, '#ef4b3f');
        }
        break;
      }
      case 'bite': {
        this.bobPos.y = w.y - 0.12 + Math.sin(this.t * 30) * 0.03;
        if (press) {
          this.state = 'reel';
          this.t = 0;
          this.reel = 0.25;
          g.audio.play('crit', { vol: 0.4, rate: 1.6 });
        } else if (this.t > 1.1) {
          this._reset('놓쳤다…', '물고기가 미끼만 먹고 도망갔습니다');
        }
        break;
      }
      case 'reel': {
        const f = this.fish;
        if (press) {
          this.reel += 0.1;
          g.audio.play('reel', { vol: 0.5, rate: 0.9 + Math.random() * 0.2 });
          if (vr) g.input.haptic(main, 0.35, 25);
        }
        // pulling the rod back also reels in VR
        if (vr && this.tipSpeed > 2.5) this.reel += dt * 0.12 * Math.min(3, this.tipSpeed / 2.5);
        this.reel -= f.pull * dt * (0.7 + 0.6 * Math.abs(Math.sin(this.t * 2.3)));
        const k = THREE.MathUtils.clamp(this.reel, 0, 1);
        const toMe = g.player.feet.clone().setY(w.y);
        this.bobPos.lerpVectors(this.castTo, toMe, k * 0.85);
        this.bobPos.y = w.y - 0.08 + Math.sin(this.t * 17) * 0.05;
        this.bobPos.x += Math.sin(this.t * 7) * 0.12 * (1 - k);
        if (Math.random() < dt * 4) g.effects.sparks(this.bobPos.clone(), new THREE.Vector3(0, 1, 0), 0xdff4ff, 3, 1.5);
        if (vr && Math.random() < dt * 8) g.input.haptic(main, 0.2 + f.pull, 20);
        const left = Math.max(0, 10 - this.t);
        g.mini.show(`릴을 감아라!  ${left.toFixed(1)}s`, vr ? '트리거 연타 / 낚싯대를 뒤로 당기기' : '클릭 연타!', k, k > 0.7 ? '#2fb44a' : '#f0a020');
        if (this.reel >= 1) this._catch();
        else if (this.reel <= 0 || this.t > 10) this._reset('줄이 끊어졌다!', `${ITEMS[f.id].name}${f.pull > 0.25 ? '… 엄청난 녀석이었는데!' : '이(가) 도망갔습니다'}`);
        break;
      }
      case 'caught': {
        if (this.catchFx) {
          const c = this.catchFx;
          c.t += dt;
          const k = Math.min(1, c.t / 0.9);
          c.obj.position.lerpVectors(c.from, c.to, k);
          c.obj.position.y += Math.sin(k * Math.PI) * 2;
          c.obj.rotation.x += dt * 8;
          if (k >= 1) {
            g.effects.shatter(c.obj.position.clone(), 0.3, c.color, 40, 0.4);
            g.audio.play('shatter', { vol: 0.5, rate: 1.5 });
            c.obj.removeFromParent();
            this.catchFx = null;
          }
        }
        if (this.t > 1.2) this._reset(null);
        break;
      }
    }
    // bobber + line
    const showBob = this.state !== 'ready';
    this.bobber.visible = showBob && this.state !== 'caught';
    this.line.visible = showBob && this.state !== 'caught';
    if (showBob) {
      this.bobber.position.copy(this.bobPos);
      const a = this.tip, b = this.bobPos;
      const sag = this.state === 'reel' || this.state === 'bite' ? 0.05 : 0.6;
      for (let i = 0; i < 12; i++) {
        const u = i / 11;
        this.linePts[i * 3] = a.x + (b.x - a.x) * u;
        this.linePts[i * 3 + 1] = a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * sag;
        this.linePts[i * 3 + 2] = a.z + (b.z - a.z) * u;
      }
      this.lineGeo.attributes.position.needsUpdate = true;
    }
  }

  _cast() {
    const g = this.game;
    const w = this.spot.water;
    const q = new THREE.Quaternion();
    g.camera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const fwd = new THREE.Vector3(-Math.sin(e.y), 0, -Math.cos(e.y));
    const dist = 9 + Math.random() * 5 + (g.isVR ? Math.min(4, this.tipSpeed * 0.4) : 0);
    const to = g.player.feet.clone().addScaledVector(fwd, dist);
    // keep the bobber on the water
    const dx = to.x - w.x, dz = to.z - w.z;
    const d = Math.hypot(dx, dz);
    if (d > w.r * 0.85) { to.x = w.x + (dx / d) * w.r * 0.85; to.z = w.z + (dz / d) * w.r * 0.85; }
    to.y = w.y;
    this.castFrom = this.tip.clone();
    this.castTo = to;
    this.bobPos.copy(this.castFrom);
    this.state = 'cast';
    this.t = 0;
    this._nib = false;
    g.audio.play('swing', { vol: 0.6, rate: 1.2 });
    g.mini.show('휙—', '', null);
  }

  _reset(title, sub) {
    const g = this.game;
    this.state = 'ready';
    this.t = 0;
    if (title) {
      g.audio.play('deny', { vol: 0.5 });
      g.toasts.push(title, sub || '', '#7b8391');
    }
    g.mini.show('낚시', g.isVR ? '휘두르거나 트리거로 던지기 · B: 그만두기' : '클릭해서 던지기 · E / Tab: 그만두기', null);
  }

  _catch() {
    const g = this.game;
    const f = this.fish;
    const size = Math.round(f.size[0] + Math.random() * (f.size[1] - f.size[0]));
    this.state = 'caught';
    this.t = 0;
    g.inv.add(f.id);
    const rec = g.records;
    rec.fish = (rec.fish || 0) + 1;
    const best = rec.bigFish || { size: 0 };
    const isRecord = size > best.size;
    if (isRecord) rec.bigFish = { id: f.id, size };
    const obj = fishModel(f.color);
    obj.scale.setScalar(THREE.MathUtils.clamp(size / 60, 0.25, 3));
    g.gameRoot.add(obj);
    this.catchFx = { obj, t: 0, from: this.bobPos.clone(), to: g.player.head.clone().add(new THREE.Vector3(0, -0.2, 0)), color: f.color };
    const rare = f.pull >= 0.28;
    g.audio.play(rare ? 'levelup' : 'coin', { vol: 0.8 });
    g.toasts.push(`${ITEMS[f.id].name} 획득!`, `${size}cm${isRecord ? '  ·  최대어 기록 갱신!' : ''}  ·  판매가 ${ITEMS[f.id].sell} Col`, rare ? '#f0a020' : '#2fb4c8', rare);
    g.mini.show('낚았다!', `${ITEMS[f.id].name}  ${size}cm`, 1, '#2fb44a');
    g.onFishCaught?.(f, size);
    g.save();
  }
}
