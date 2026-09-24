// Tag with little Finn: he bolts through the streets, jukes when you get
// close and slowly tires out. Catch him within 60 seconds.
import * as THREE from 'three';

export class Tag {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.kid = null;
    this.returning = false;
  }

  start(kid, colliders, bounds) {
    const g = this.game;
    this.kid = kid;
    this.colliders = colliders;
    this.bounds = bounds;
    this.active = true;
    this.time = 60;
    this.juke = 0;
    this.jukeCd = 0;
    this.stuckT = 0;
    this.lastPos = kid.pos.clone();
    this.panic = null;
    this.dir = new THREE.Vector3();
    kid.noTalk = true;
    g.audio.setTheme('game');
    g.audio.play('giggle', { pos: kid.pos, vol: 0.9 });
    g.toasts.push('술래잡기 시작!', '60초 안에 꼬마 핀을 잡으세요 (가까이 다가가 터치)', '#f0a020');
  }

  stop(caught) {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    this.returning = true;
    this.kid.noTalk = false;
    g.mini.hide();
    const took = 60 - this.time;
    if (caught) {
      const rec = g.records;
      const best = rec.tagBest;
      const isBest = !best || took < best;
      if (isBest) rec.tagBest = Math.round(took * 10) / 10;
      g.player.col += 150;
      g.inv.add('candy', 3);
      g.audio.play('quest', { vol: 0.8 });
      g.toasts.push('잡았다!', `${took.toFixed(1)}초${isBest ? ' · 최고 기록!' : ''}  ·  +150 Col · 꿀사탕 ×3`, '#2fb44a', true);
    } else {
      g.audio.play('giggle', { pos: this.kid.pos, vol: 0.9, rate: 1.1 });
      g.toasts.push('시간 초과!', '꼬마 핀: “메롱~ 못 잡았지!”', '#ef4b3f');
    }
    g.save();
  }

  update(dt) {
    const kid = this.kid;
    if (!kid) return;
    const g = this.game;
    if (!this.active) {
      if (this.returning) {
        const to = kid.home.clone().sub(kid.pos).setY(0);
        const d = to.length();
        if (d < 0.2) {
          this.returning = false;
          kid.moving = 0;
          kid.face = null;
        } else {
          to.normalize();
          kid.pos.addScaledVector(to, Math.min(d, 1.6 * dt));
          kid.moving = 1.6;
          kid.face = Math.atan2(to.x, to.z);
        }
      }
      return;
    }
    this.time -= dt;
    const p = g.player.feet;
    const away = new THREE.Vector3(kid.pos.x - p.x, 0, kid.pos.z - p.z);
    const dist = away.length();
    if (dist < 1.05) {
      this.stop(true);
      return;
    }
    if (this.time <= 0) {
      this.stop(false);
      return;
    }
    away.normalize();
    const tired = 1 - (60 - this.time) / 60;
    let speed = dist < 9 ? 2.6 + 1.2 * tired : 1.4;
    this.jukeCd -= dt;
    if (dist < 2.6 && this.jukeCd <= 0) {
      // sidestep burst
      this.juke = 0.55;
      this.jukeCd = 2.2 + (1 - tired) * 0.8;
      this.jukeSide = Math.random() < 0.5 ? 1 : -1;
      g.audio.play('giggle', { pos: kid.pos, vol: 0.7, rate: 1.2 });
    }
    let want = away.clone();
    if (this.juke > 0) {
      this.juke -= dt;
      want.set(away.z * this.jukeSide, 0, -away.x * this.jukeSide).addScaledVector(away, 0.4);
      speed = 4.4;
    }
    // stay inside the town, away from the wall
    const r = Math.hypot(kid.pos.x, kid.pos.z);
    if (r > this.bounds - 8) want.addScaledVector(new THREE.Vector3(-kid.pos.x / r, 0, -kid.pos.z / r), (r - this.bounds + 8) * 0.5);
    if (this.panic) {
      this.panic.t -= dt;
      want.copy(this.panic.dir);
      speed = 3.4;
      if (this.panic.t <= 0) this.panic = null;
    }
    want.y = 0;
    if (want.lengthSq() > 1e-6) want.normalize();
    this.dir.lerp(want, Math.min(1, dt * 6)).normalize();
    kid.pos.addScaledVector(this.dir, speed * dt);
    this.colliders.resolve(kid.pos, 0.3);
    kid.moving = speed;
    kid.face = Math.atan2(this.dir.x, this.dir.z);
    // unstick from corners
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      if (kid.pos.distanceTo(this.lastPos) < 0.5 && !this.panic) {
        const a = Math.random() * Math.PI * 2;
        this.panic = { t: 1.1, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)) };
      }
      this.lastPos.copy(kid.pos);
      this.stuckT = 0;
    }
    g.mini.show(`술래잡기  ${Math.max(0, this.time).toFixed(1)}초`, `꼬마 핀까지 ${dist.toFixed(1)}m`, this.time / 60, this.time < 15 ? '#ef4b3f' : '#f0a020');
  }
}
