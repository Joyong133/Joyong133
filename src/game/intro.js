// "LINK START" — the rainbow tunnel dive that plays when you log in.
import * as THREE from 'three';
import { FONT } from './ui.js';

function textSprite(lines, w = 1024, h = 256, size = 120) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.shadowColor = 'rgba(120,200,255,0.9)';
  g.shadowBlur = 30;
  lines.forEach((l, i) => {
    g.font = `${i === 0 ? 900 : 600} ${i === 0 ? size : size * 0.4}px ${FONT}`;
    g.fillText(l, w / 2, h / 2 + (i === 0 ? size * 0.35 : size * 0.35 + i * size * 0.55));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, (2.4 * h) / w),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false })
  );
  m.renderOrder = 60;
  return m;
}

export class LinkStart {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    const RINGS = 60;
    const ringGeo = new THREE.TorusGeometry(1, 0.012, 6, 64);
    this.ringMat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    this.rings = new THREE.InstancedMesh(ringGeo, this.ringMat, RINGS);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RINGS * 3), 3);
    this.rings.frustumCulled = false;
    this.group.add(this.rings);
    this.ringData = [];
    for (let i = 0; i < RINGS; i++) this.ringData.push({ z: -i * 1.4, r: 2.2 + Math.random() * 1.6, hue: (i * 0.137) % 1, rot: Math.random() * 6 });
    const S = 380;
    const streakGeo = new THREE.BoxGeometry(0.012, 0.012, 2.4);
    this.streaks = new THREE.InstancedMesh(streakGeo, this.ringMat, S);
    this.streaks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(S * 3), 3);
    this.streaks.frustumCulled = false;
    this.group.add(this.streaks);
    this.streakData = [];
    for (let i = 0; i < S; i++) {
      const a = Math.random() * Math.PI * 2;
      this.streakData.push({ a, r: 1.2 + Math.random() * 5, z: -Math.random() * 90, hue: Math.random(), speed: 0.7 + Math.random() * 0.6 });
    }
    this.title = textSprite(['LINK START']);
    this.title.position.set(0, 0, -3);
    this.group.add(this.title);
    this.checks = textSprite(['', 'Touch  OK    Sight  OK    Hearing  OK    Taste  OK    Smell  OK'], 1600, 200, 90);
    this.checks.scale.setScalar(1.3);
    this.checks.position.set(0, -0.55, -3);
    this.group.add(this.checks);
    this.welcome = textSprite(['Welcome to', '부유성 제1층 — 시작의 마을'], 1024, 256, 100);
    this.welcome.position.set(0, 0.1, -3);
    this.group.add(this.welcome);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._c = new THREE.Color();
    this.active = false;
    this.duration = 7.2;
  }

  start(pos, yaw) {
    this.group.position.copy(pos);
    this.group.rotation.set(0, yaw, 0);
    this.group.visible = true;
    this.active = true;
    this.t = 0;
  }

  stop() {
    this.active = false;
    this.group.visible = false;
  }

  // returns phase info for the game (to trigger flashes)
  update(dt) {
    if (!this.active) return null;
    this.t += dt;
    const t = this.t;
    const tunnel = THREE.MathUtils.smoothstep(t, 0.9, 1.8) * (1 - THREE.MathUtils.smoothstep(t, 5.4, 5.9));
    const speed = 8 + Math.pow(Math.max(0, t - 1), 2) * 9;
    this.ringData.forEach((r, i) => {
      r.z += speed * dt;
      if (r.z > 1) { r.z -= 84; r.hue = (r.hue + 0.37) % 1; }
      r.rot += dt * 0.5;
      this._q.setFromEuler(new THREE.Euler(0, 0, r.rot));
      const s = r.r * (1 + Math.max(0, r.z) * 0.1);
      this._m.compose(new THREE.Vector3(0, 0, r.z), this._q, new THREE.Vector3(s, s, s));
      this.rings.setMatrixAt(i, this._m);
      const fade = THREE.MathUtils.smoothstep(r.z, -80, -30) * tunnel;
      this._c.setHSL((r.hue + t * 0.1) % 1, 0.9, 0.6).multiplyScalar(fade * 1.2);
      this.rings.setColorAt(i, this._c);
    });
    this.streakData.forEach((s, i) => {
      s.z += speed * 1.6 * s.speed * dt;
      if (s.z > 2) s.z -= 92;
      this._m.makeTranslation(Math.cos(s.a) * s.r, Math.sin(s.a) * s.r, s.z);
      this.streaks.setMatrixAt(i, this._m);
      const fade = THREE.MathUtils.smoothstep(s.z, -90, -20) * tunnel;
      this._c.setHSL(s.hue, 0.8, 0.7).multiplyScalar(fade);
      this.streaks.setColorAt(i, this._c);
    });
    this.rings.instanceMatrix.needsUpdate = true;
    this.rings.instanceColor.needsUpdate = true;
    this.streaks.instanceMatrix.needsUpdate = true;
    this.streaks.instanceColor.needsUpdate = true;
    const ta = THREE.MathUtils.smoothstep(t, 0.1, 0.5) * (1 - THREE.MathUtils.smoothstep(t, 1.3, 1.9));
    this.title.material.opacity = ta;
    this.title.scale.setScalar(1 + t * 0.15);
    this.checks.material.opacity = THREE.MathUtils.smoothstep(t, 2.2, 2.6) * (1 - THREE.MathUtils.smoothstep(t, 4.3, 4.8));
    this.welcome.material.opacity = THREE.MathUtils.smoothstep(t, 6.0, 6.3) * (1 - THREE.MathUtils.smoothstep(t, 6.9, 7.2));
    return { t, whiteOut: t > 5.3 && t < 6.0, done: t >= this.duration };
  }
}
