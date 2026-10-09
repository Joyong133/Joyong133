// Time-attack ghost: the player's run is sampled ten times a second, the best
// run on each map is kept in this browser, and later runs race against it as
// a see-through copy of the runner who set it.
import * as THREE from 'three';
import { CharacterModel } from './model.js';
import { charById } from '../data/characters.js';
import { labelTexture } from '../world/textures.js';
import { angleDiff, clamp } from '../core/rng.js';

const KEY = (mapId) => `fairy-runners-ghost-${mapId}`;
const DT = 0.1;
const STRIDE = 5; // x, y, z, heading, grounded

export function loadGhost(mapId) {
  try {
    const g = JSON.parse(localStorage.getItem(KEY(mapId)));
    return g && g.v === 1 && Array.isArray(g.f) && g.f.length >= STRIDE * 2 ? g : null;
  } catch {
    return null;
  }
}

export function saveGhost(mapId, g) {
  try {
    localStorage.setItem(KEY(mapId), JSON.stringify(g));
    return true;
  } catch {
    return false;
  }
}

export class GhostRecorder {
  constructor() {
    this.f = [];
    this.next = 0;
  }

  sample(clock, r) {
    while (clock >= this.next) {
      const p = r.pos;
      this.f.push(Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round(p.z * 100) / 100, Math.round(r.heading * 100) / 100, r.grounded ? 1 : 0);
      this.next += DT;
    }
  }

  data(r) {
    return { v: 1, time: r.finishTime, char: r.ch.id, laps: r.lapTimes.slice(), f: this.f };
  }
}

export class GhostRunner {
  constructor(data) {
    this.data = data;
    this.n = data.f.length / STRIDE;
    const ch = charById(data.char);
    this.model = new CharacterModel(ch, { outline: false });
    this.root = this.model.root;
    this.root.scale.setScalar(ch.scale || 1);
    // tinted, translucent copies of the runner's materials
    const clones = new Map();
    this.mats = [];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      const src = o.material;
      let m = clones.get(src);
      if (!m) {
        m = src.clone();
        m.userData = {};
        m.transparent = true;
        m.opacity = 0.45;
        if (m.emissive) {
          m.emissive.set(0x5ad8ff);
          m.emissiveIntensity = 0.45;
        }
        clones.set(src, m);
        this.mats.push(m);
      }
      o.material = m;
    });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(`${ch.name} 고스트`, '#9fe8ff'), depthWrite: false, transparent: true, sizeAttenuation: false, opacity: 0.85 }));
    tag.scale.set(0.15, 0.0375, 1);
    tag.position.y = 2.15;
    tag.renderOrder = 5;
    this.root.add(tag);
    this.pos = new THREE.Vector3();
    this.heading = 0;
    this.done = false;
  }

  // Cumulative ghost time at the end of lap n (1-based), if recorded.
  lapClock(n) {
    const laps = this.data.laps || [];
    if (laps.length < n) return null;
    let t = 0;
    for (let i = 0; i < n; i++) t += laps[i];
    return t;
  }

  update(clock, dt, camPos, mode) {
    const f = this.data.f;
    let k = Math.max(0, clock) / DT;
    let i = Math.floor(k);
    let u = k - i;
    if (i >= this.n - 1) {
      i = this.n - 2;
      u = 1;
      this.done = true;
    }
    const a = i * STRIDE;
    const b = a + STRIDE;
    this.pos.set(f[a] + (f[b] - f[a]) * u, f[a + 1] + (f[b + 1] - f[a + 1]) * u, f[a + 2] + (f[b + 2] - f[a + 2]) * u);
    this.heading = f[a + 3] + angleDiff(f[a + 3], f[b + 3]) * u;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.heading;
    const speed = Math.hypot(f[b] - f[a], f[b + 2] - f[a + 2]) / DT;
    const grounded = !!(f[a + 4] && f[b + 4]);
    this.model.update(dt, { mode: this.done ? 'win' : mode, speed, grounded, vy: (f[b + 1] - f[a + 1]) / DT });
    // fade out when it would sit in front of the camera
    const d = camPos ? camPos.distanceTo(this.pos) : 10;
    const op = clamp((d - 2.5) / 5, 0.1, 0.45);
    for (const m of this.mats) m.opacity = op;
  }
}
