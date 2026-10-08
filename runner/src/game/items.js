// 아이템전 items: rolling, using, and the little world objects some of them
// leave behind (honey puddles, tornadoes, lightning bolts).
import * as THREE from 'three';
import { rightX, rightZ } from '../core/rng.js';
import { toon } from '../world/geom.js';

export const ITEMS = {
  rocket: { icon: '🚀', name: '로켓 부스터', desc: '잠깐 동안 엄청 빨라져요' },
  shield: { icon: '🛡️', name: '요정 방패', desc: '장애물과 공격을 한 번 막아요' },
  bolt: { icon: '⚡', name: '번개 구름', desc: '앞에 있는 모두를 작고 느리게' },
  ice: { icon: '❄️', name: '얼음 마법', desc: '바로 앞 선수를 얼려요' },
  honey: { icon: '🍯', name: '꿀단지', desc: '뒤에 끈적한 꿀을 뿌려요' },
  storm: { icon: '🌪️', name: '회오리', desc: '앞으로 날아가 선수들을 날려요' },
};

export function rollItem(rank, n, rand) {
  const f = n > 1 ? (rank - 1) / (n - 1) : 0.5; // 0 = leader, 1 = last
  const w = {
    rocket: 1 + 3 * f,
    shield: 2.4 - 1.4 * f,
    bolt: rank === 1 ? 0 : 0.2 + 1.8 * f,
    ice: rank === 1 ? 0 : 0.6 + 1.2 * f,
    honey: 2.2 - 1.6 * f,
    storm: rank === 1 ? 0.2 : 0.5 + 1.4 * f,
  };
  let total = 0;
  for (const k in w) total += w[k];
  let x = rand() * total;
  for (const k in w) {
    x -= w[k];
    if (x <= 0) return k;
  }
  return 'rocket';
}

export class ItemSystem {
  constructor(race) {
    this.race = race;
    this.puddles = [];
    this.storms = [];
    this.bolts = [];
    this.group = new THREE.Group();
    this.honeyGeo = new THREE.CylinderGeometry(2, 2, 0.08, 20);
    this.honeyMat = toon({ color: 0xf5b82a, transparent: true, opacity: 0.85 });
    this.stormGeo = new THREE.ConeGeometry(1.4, 3.6, 16, 1, true);
    this.stormGeo.rotateX(Math.PI);
    this.stormGeo.translate(0, 1.8, 0);
    this.stormMat = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    this.boltMat = new THREE.LineBasicMaterial({ color: 0xfff36b });
    this.tmp = {};
  }

  use(r) {
    const race = this.race;
    const it = r.item;
    r.item = null;
    race.onItemUse?.(r, it);
    switch (it) {
      case 'rocket':
        r.dash(2.4, 1.75);
        break;
      case 'shield':
        r.shieldT = 6;
        break;
      case 'bolt': {
        for (const o of race.runners) {
          if (o === r || o.finished || o.s <= r.s) continue;
          if (o.shieldT > 0) {
            o.shieldT = 0;
            o.emit('shieldPop');
            continue;
          }
          o.slowT = 2.6;
          o.stunT = Math.max(o.stunT, 0.4);
          this.bolt(o);
          o.emit('zapped');
        }
        break;
      }
      case 'ice': {
        let target = null;
        for (const o of race.runners) {
          if (o === r || o.finished || o.s <= r.s) continue;
          if (!target || o.s < target.s) target = o;
        }
        if (target) {
          if (target.shieldT > 0) {
            target.shieldT = 0;
            target.emit('shieldPop');
          } else {
            target.frozenT = 1.9;
            target.vel.x *= 0.1;
            target.vel.z *= 0.1;
            target.emit('frozen');
          }
        }
        break;
      }
      case 'honey': {
        const x = r.pos.x - Math.sin(r.heading) * 2;
        const z = r.pos.z - Math.cos(r.heading) * 2;
        const m = new THREE.Mesh(this.honeyGeo, this.honeyMat);
        const y = race.world.groundBelow(x, z, r.pos.y + 1, (this._sc ||= []));
        const gy = y === -Infinity ? r.pos.y : y;
        m.position.set(x, gy + 0.05, z);
        m.receiveShadow = true;
        this.group.add(m);
        this.puddles.push({ x, y: gy, z, t: 14, owner: r, grace: 0.8, m });
        break;
      }
      case 'storm': {
        const p = race.course.pointAt(r.s, this.tmp);
        const lat = (r.pos.x - p.x) * rightX(p.h) + (r.pos.z - p.z) * rightZ(p.h);
        const m = new THREE.Mesh(this.stormGeo, this.stormMat);
        this.group.add(m);
        this.storms.push({ s: r.s + 1.5, lat, t: 2.6, owner: r, hit: new Set([r]), m, x: 0, y: 0, z: 0 });
        break;
      }
      default:
        break;
    }
  }

  bolt(o) {
    const pts = [];
    let x = 0;
    let z = 0;
    for (let i = 0; i <= 6; i++) {
      pts.push(new THREE.Vector3(x, 9 - i * 1.4, z));
      x = (Math.random() - 0.5) * 0.9;
      z = (Math.random() - 0.5) * 0.9;
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.boltMat);
    line.position.copy(o.pos);
    this.group.add(line);
    this.bolts.push({ line, t: 0.35 });
  }

  update(dt) {
    const race = this.race;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.t -= dt;
      p.grace -= dt;
      p.m.scale.setScalar(Math.min(1, p.t * 2, (14 - p.t) * 4 + 0.2));
      for (const r of race.runners) {
        if (r.finished || (r === p.owner && p.grace > 0)) continue;
        const dx = r.pos.x - p.x;
        const dz = r.pos.z - p.z;
        if (dx * dx + dz * dz < 4 && Math.abs(r.pos.y - p.y) < 0.6) {
          if (r.honeyT <= 0) r.emit('honey');
          r.honeyT = 1.4;
        }
      }
      if (p.t <= 0) {
        this.group.remove(p.m);
        this.puddles.splice(i, 1);
      }
    }
    for (let i = this.storms.length - 1; i >= 0; i--) {
      const s = this.storms[i];
      s.t -= dt;
      s.s += 26 * dt;
      // home in on the nearest runner ahead
      let target = null;
      for (const r of race.runners) {
        if (s.hit.has(r) || r.finished) continue;
        const d = r.s - s.s;
        if (d > -1 && d < 25 && (!target || d < target.s - s.s)) target = r;
      }
      const p = race.course.pointAt(s.s, this.tmp);
      if (target) {
        const tl = (target.pos.x - p.x) * rightX(p.h) + (target.pos.z - p.z) * rightZ(p.h);
        s.lat += Math.max(-8 * dt, Math.min(8 * dt, tl - s.lat));
      }
      s.x = p.x + rightX(p.h) * s.lat;
      s.y = p.y;
      s.z = p.z + rightZ(p.h) * s.lat;
      s.m.position.set(s.x, s.y, s.z);
      s.m.rotation.y += dt * 14;
      s.m.scale.setScalar(Math.min(1, s.t * 3));
      race.fx?.emit(s.x + (Math.random() - 0.5) * 2, s.y + Math.random() * 3, s.z + (Math.random() - 0.5) * 2, 0, 2, 0, 0xffffff, 0.5, 0.4, 0, 1);
      for (const r of race.runners) {
        if (s.hit.has(r)) continue;
        const dx = r.pos.x - s.x;
        const dz = r.pos.z - s.z;
        if (dx * dx + dz * dz < 2.6 && Math.abs(r.pos.y - s.y) < 2.5) {
          s.hit.add(r);
          const a = Math.random() * Math.PI * 2;
          r.knock(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 3, 12, 1.3);
        }
      }
      if (s.t <= 0 || s.s > race.course.goalS) {
        this.group.remove(s.m);
        this.storms.splice(i, 1);
      }
    }
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.t -= dt;
      b.line.visible = Math.floor(b.t * 30) % 2 === 0;
      if (b.t <= 0) {
        this.group.remove(b.line);
        b.line.geometry.dispose();
        this.bolts.splice(i, 1);
      }
    }
  }
}
