// Particle-ish effects: the signature polygon shatter when something dies,
// hit sparks, healing motes and light pillars (level up / teleport).
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

export class Effects {
  constructor(scene, max = 700) {
    this.scene = scene;
    const geo = new THREE.TetrahedronGeometry(1, 0);
    geo.scale(1, 1.6, 0.35);
    this.mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    scene.add(this.mesh);
    this.parts = [];
    for (let i = 0; i < max; i++) {
      this.parts.push({ alive: false, p: new THREE.Vector3(), v: new THREE.Vector3(), axis: new THREE.Vector3(1, 0, 0), ang: 0, spin: 0, life: 1, t: 0, s: 0.1, col: new THREE.Color(), drag: 1, grav: 0 });
      this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
    }
    this.next = 0;
    this.pillars = [];
    this.pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true);
    this.pillarGeo.translate(0, 0.5, 0);
    this.discGeo = new THREE.CircleGeometry(1, 48);
    this.discGeo.rotateX(-Math.PI / 2);
    this.decals = [];
  }

  // AoE warning on the ground: a ring that fills up until the hit lands
  telegraph(pos, radius, duration, color = 0xff3a2a) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, k: { value: 0 }, fade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 color; uniform float k, fade; varying vec2 vUv;
        void main(){ float r = length(vUv - 0.5) * 2.0;
          float ring = smoothstep(0.9, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
          float fill = step(r, k) * (0.25 + 0.35 * smoothstep(k - 0.15, k, r));
          gl_FragColor = vec4(color * (ring * 1.4 + fill) * fade, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -6,
    });
    const m = new THREE.Mesh(this.discGeo, mat);
    m.position.copy(pos).add(new THREE.Vector3(0, 0.06, 0));
    m.scale.setScalar(radius);
    m.renderOrder = 9;
    m.frustumCulled = false;
    this.scene.add(m);
    this.decals.push({ m, t: 0, life: duration, kind: 'tele' });
  }

  // expanding shock ring + debris (boss slams)
  shockwave(pos, radius, color = 0xffc080) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, k: { value: 0 }, fade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 color; uniform float k, fade; varying vec2 vUv;
        void main(){ float r = length(vUv - 0.5) * 2.0;
          float w = 0.12 + 0.1 * k;
          float ring = smoothstep(k - w, k, r) * (1.0 - smoothstep(k, k + 0.03, r));
          gl_FragColor = vec4(color * ring * 2.0 * fade, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const m = new THREE.Mesh(this.discGeo, mat);
    m.position.copy(pos).add(new THREE.Vector3(0, 0.1, 0));
    m.scale.setScalar(radius * 1.15);
    m.renderOrder = 9;
    m.frustumCulled = false;
    this.scene.add(m);
    this.decals.push({ m, t: 0, life: 0.55, kind: 'shock' });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.sparks(pos.clone().add(new THREE.Vector3(Math.sin(a) * radius * 0.5, 0.2, Math.cos(a) * radius * 0.5)), new THREE.Vector3(Math.sin(a), 0.8, Math.cos(a)), 0xc8b090, 3, 5);
    }
  }

  _alloc() {
    for (let k = 0; k < this.parts.length; k++) {
      const i = (this.next + k) % this.parts.length;
      if (!this.parts[i].alive) {
        this.next = i + 1;
        return this.parts[i];
      }
    }
    const p = this.parts[this.next % this.parts.length];
    this.next++;
    return p;
  }

  shatter(center, radius, color = 0x8fd6ff, count = 70, height = 1) {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this._alloc();
      p.alive = true;
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      p.p.copy(center).addScaledVector(dir, Math.random() * radius);
      p.p.y += (Math.random() - 0.3) * height * 0.5;
      p.v.copy(dir).multiplyScalar(1.2 + Math.random() * 3.2);
      p.v.y += 1.2 + Math.random() * 1.5;
      p.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      p.ang = Math.random() * 6;
      p.spin = (Math.random() - 0.5) * 16;
      p.life = 0.9 + Math.random() * 0.8;
      p.t = 0;
      p.s = (0.05 + Math.random() * 0.12) * Math.max(0.6, radius);
      p.col.copy(base).offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.3) * 0.2);
      p.drag = 2.2;
      p.grav = -0.8;
    }
  }

  sparks(pos, dir, color = 0xffc070, count = 14, speed = 4) {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this._alloc();
      p.alive = true;
      p.p.copy(pos);
      p.v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      if (dir) p.v.addScaledVector(dir, speed * 0.6);
      p.axis.set(Math.random(), Math.random(), Math.random()).normalize();
      p.ang = 0;
      p.spin = 20;
      p.life = 0.25 + Math.random() * 0.3;
      p.t = 0;
      p.s = 0.015 + Math.random() * 0.03;
      p.col.copy(base);
      p.drag = 3;
      p.grav = 6;
    }
  }

  motes(pos, color = 0x7dff9a, count = 30, radius = 0.5) {
    const base = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const p = this._alloc();
      p.alive = true;
      const a = Math.random() * Math.PI * 2;
      p.p.set(pos.x + Math.sin(a) * radius, pos.y + Math.random() * 1.6, pos.z + Math.cos(a) * radius);
      p.v.set(0, 0.5 + Math.random() * 1.2, 0);
      p.axis.set(0, 1, 0);
      p.ang = Math.random() * 6;
      p.spin = 4;
      p.life = 0.8 + Math.random() * 0.8;
      p.t = 0;
      p.s = 0.025 + Math.random() * 0.03;
      p.col.copy(base);
      p.drag = 0.5;
      p.grav = 0;
    }
  }

  pillar(pos, color = 0x8fd0ff, radius = 0.9, height = 5, life = 1.6) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, k: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 color; uniform float k; varying vec2 vUv;
        void main(){ float a = (1.0 - vUv.y) * (1.0 - k) * (0.6 + 0.4 * sin(vUv.x * 60.0 + vUv.y * 10.0 - k * 20.0));
          gl_FragColor = vec4(color * a * 1.4, 1.0); }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(this.pillarGeo, mat);
    m.position.copy(pos);
    m.scale.set(radius, height, radius);
    m.renderOrder = 11;
    m.frustumCulled = false;
    this.scene.add(m);
    this.pillars.push({ m, t: 0, life, radius, height });
  }

  update(dt) {
    let any = false;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (!p.alive) continue;
      any = true;
      p.t += dt;
      if (p.t >= p.life) {
        p.alive = false;
        this.mesh.setMatrixAt(i, _m.makeScale(0, 0, 0));
        continue;
      }
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.v.y -= p.grav * dt;
      p.p.addScaledVector(p.v, dt);
      p.ang += p.spin * dt;
      const k = p.t / p.life;
      const fade = Math.pow(1 - k, 1.4);
      _q.setFromAxisAngle(p.axis, p.ang);
      const sc = p.s * (k < 0.1 ? k / 0.1 : 1);
      _m.compose(p.p, _q, _s.set(sc, sc, sc));
      this.mesh.setMatrixAt(i, _m);
      _c.copy(p.col).multiplyScalar(fade * 1.6);
      this.mesh.setColorAt(i, _c);
    }
    if (any || this._wasAny) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
    this._wasAny = any;
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.t += dt;
      const k = Math.min(1, d.t / d.life);
      const u = d.m.material.uniforms;
      if (d.kind === 'tele') {
        u.k.value = k;
        u.fade.value = 0.7 + 0.3 * Math.sin(d.t * 18);
      } else {
        u.k.value = 0.15 + 0.85 * (1 - Math.pow(1 - k, 2));
        u.fade.value = 1 - k;
      }
      if (d.t >= d.life) {
        this.scene.remove(d.m);
        d.m.material.dispose();
        this.decals.splice(i, 1);
      }
    }
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const pl = this.pillars[i];
      pl.t += dt;
      const k = pl.t / pl.life;
      pl.m.material.uniforms.k.value = k;
      const r = pl.radius * (1 + k * 0.6);
      pl.m.scale.set(r, pl.height * (0.3 + 0.7 * Math.min(1, k * 4)), r);
      if (k >= 1) {
        this.scene.remove(pl.m);
        pl.m.material.dispose();
        this.pillars.splice(i, 1);
      }
    }
  }
}
