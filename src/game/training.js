// Sword master Garon's drill: crystal targets pop up around you for 45 s.
// Slash blue ones, go for the small gold ones, leave the red ones alone.
import * as THREE from 'three';
import { segSegDist } from './monsters.js';

const TYPES = {
  blue: { color: 0x4ab8ff, pts: 100, r: 0.15, life: 2.6 },
  gold: { color: 0xffc830, pts: 300, r: 0.11, life: 1.5 },
  red: { color: 0xff3a3a, pts: -200, r: 0.15, life: 2.2 },
};

export class Training {
  constructor(scene, game) {
    this.game = game;
    this.active = false;
    this.group = new THREE.Group();
    scene.add(this.group);
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const ring = new THREE.TorusGeometry(1.35, 0.08, 6, 24);
    this.pool = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x4ab8ff, emissive: 0x4ab8ff, emissiveIntensity: 0.8, roughness: 0.2, flatShading: true, transparent: true });
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, toneMapped: false, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      const r = new THREE.Mesh(ring, ringMat);
      m.add(r);
      m.visible = false;
      this.group.add(m);
      this.pool.push({ m, r, mat, ringMat, alive: false, t: 0, type: null });
    }
    this._a = new THREE.Vector3();
    this._b = new THREE.Vector3();
  }

  start() {
    const g = this.game;
    this.active = true;
    this.time = 45;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.spawnT = 1.2;
    for (const p of this.pool) { p.alive = false; p.m.visible = false; }
    g.audio.setTheme('game');
    g.audio.play('levelup', { vol: 0.5, rate: 1.4 });
    g.toasts.push('수련 시작!', '파란 수정 +100 · 금색 +300 · 빨간 수정은 피하세요', '#f0a020');
  }

  stop(show = true) {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    for (const p of this.pool) { p.alive = false; p.m.visible = false; }
    g.mini.hide();
    if (!show) return;
    const rec = g.records;
    const best = rec.trainBest || 0;
    const newBest = this.score > best;
    if (newBest) rec.trainBest = this.score;
    const reward = Math.max(0, Math.floor(this.score / 15));
    g.player.col += reward;
    g.audio.play(newBest ? 'quest' : 'coin', { vol: 0.8 });
    g.toasts.push(`수련 종료 — ${this.score}점`, `최대 콤보 ${this.maxCombo}  ·  +${reward} Col${newBest ? '  ·  최고 기록!' : ''}`, newBest ? '#f0a020' : '#3aa6ff', true);
    g.save();
  }

  _spawn() {
    const g = this.game;
    const p = this.pool.find((q) => !q.alive);
    if (!p) return;
    const roll = Math.random();
    const type = roll < 0.14 ? 'gold' : roll < 0.3 ? 'red' : 'blue';
    const T = TYPES[type];
    p.type = type;
    p.alive = true;
    p.t = 0;
    p.mat.color.setHex(T.color);
    p.mat.emissive.setHex(T.color);
    p.ringMat.color.setHex(T.color);
    const head = g.player.head;
    const q = new THREE.Quaternion();
    g.camera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    let pos;
    if (g.isVR) {
      const yaw = e.y + THREE.MathUtils.degToRad((Math.random() - 0.5) * 110);
      const d = 0.72 + Math.random() * 0.25;
      pos = new THREE.Vector3(head.x - Math.sin(yaw) * d, head.y - 0.5 + Math.random() * 0.55, head.z - Math.cos(yaw) * d);
    } else {
      // in front of the camera, inside the reach of the desktop swing arcs
      const local = new THREE.Vector3((Math.random() - 0.5) * 0.55, -0.27 + Math.random() * 0.22, -0.78 - Math.random() * 0.12);
      local.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.y, 0)));
      pos = head.clone().add(local);
    }
    // don't overlap another live target
    for (const o of this.pool) if (o !== p && o.alive && o.m.position.distanceTo(pos) < 0.3) { p.alive = false; return; }
    p.m.position.copy(pos);
    p.m.visible = true;
    p.life = T.life * (1 - Math.min(0.35, (45 - this.time) / 120));
  }

  update(dt, vr) {
    if (!this.active) return;
    const g = this.game;
    this.time -= dt;
    this.spawnT -= dt;
    const rate = THREE.MathUtils.lerp(0.95, 0.42, 1 - this.time / 45);
    if (this.spawnT <= 0 && this.time > 0.5) {
      this.spawnT = rate;
      this._spawn();
    }
    const sw = g.sword;
    const swinging = vr ? sw.tipSpeed > 1.6 : sw.swinging;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.t += dt;
      const T = TYPES[p.type];
      const k = p.t / p.life;
      const pop = Math.min(1, p.t * 8);
      const sc = T.r * pop * (1 - Math.max(0, k - 0.75) * 2);
      p.m.scale.setScalar(Math.max(0.001, sc));
      p.m.rotation.y += dt * 2.5;
      p.m.rotation.x += dt * 1.3;
      p.r.rotation.x = Math.PI / 2;
      p.ringMat.opacity = 0.6 * (1 - k);
      p.mat.opacity = 1 - Math.max(0, k - 0.8) * 5;
      if (swinging) {
        const c = p.m.position;
        let hit = false;
        for (let s = 0; s <= 3 && !hit; s++) {
          const u = s / 3;
          this._a.lerpVectors(sw.prevBase, sw.base, u);
          this._b.lerpVectors(sw.prevTip, sw.tip, u);
          if (segSegDist(this._a, this._b, c, c, new THREE.Vector3(), new THREE.Vector3()) < T.r + 0.06) hit = true;
        }
        if (hit) {
          p.alive = false;
          p.m.visible = false;
          const bad = p.type === 'red';
          if (bad) {
            this.combo = 0;
            this.score = Math.max(0, this.score + T.pts);
            g.audio.play('hurt', { vol: 0.6 });
            g.damageNums.spawn(c.clone(), `${T.pts}`, '#ff6b5b', 0.7);
            if (vr) g.input.haptic(g.settings.mainHand, 1, 80);
          } else {
            this.combo++;
            this.hits++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
            const pts = T.pts + this.combo * 10;
            this.score += pts;
            g.audio.play(p.type === 'gold' ? 'crit' : 'hit', { pos: c, vol: 0.7, rate: 1.2 + Math.min(0.6, this.combo * 0.03) });
            g.damageNums.spawn(c.clone().add(new THREE.Vector3(0, 0.1, 0)), `+${pts}`, p.type === 'gold' ? '#ffd24a' : '#9fe0ff', 0.7);
            if (vr) g.input.haptic(g.settings.mainHand, 0.6, 40);
          }
          g.effects.shatter(c.clone(), 0.18, T.color, 26, 0.3);
          continue;
        }
      }
      if (p.t >= p.life) {
        p.alive = false;
        p.m.visible = false;
        if (p.type !== 'red') this.combo = 0;
      }
    }
    g.mini.show(`${Math.max(0, this.score)}점   콤보 ×${this.combo}`, `남은 시간 ${Math.max(0, this.time).toFixed(1)}초`, Math.max(0, this.time) / 45, this.time < 10 ? '#ef4b3f' : '#3aa6ff');
    if (this.time <= 0) this.stop();
  }
}
