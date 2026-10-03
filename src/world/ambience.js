// Ambient life: bird flocks wheeling overhead, butterflies around the player
// in the fields, chimney smoke, and sunlit pollen drifting in the air.
// Everything animates on the GPU or with a few dozen matrix writes per frame.
import * as THREE from 'three';
import { RNG } from '../core/noise.js';

function softPuffTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rng = new RNG(31);
  for (let i = 0; i < 14; i++) {
    const x = S / 2 + rng.range(-22, 22), y = S / 2 + rng.range(-22, 22), r = rng.range(20, 38);
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ birds
function birdGeometry() {
  // +Z forward; wing tips carry |x| so the shader can flap them
  const p = [
    0, 0, 0.18, 0, 0, -0.12, -0.5, 0.02, -0.06,
    0, 0, 0.18, 0.5, 0.02, -0.06, 0, 0, -0.12,
    0, 0, 0.18, 0, -0.035, 0.0, 0, 0, -0.14,
    -0.5, 0.02, -0.06, -0.62, 0.0, -0.16, -0.32, 0.01, -0.1,
    0.5, 0.02, -0.06, 0.32, 0.01, -0.1, 0.62, 0.0, -0.16,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

function flapMaterial(color, rate, amp) {
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
  const time = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.flapTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float flapTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float fph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;
#else
  float fph = 0.0;
#endif
  float fa = sin(flapTime * ${rate.toFixed(2)} + fph) * ${amp.toFixed(2)};
  float span = abs(transformed.x);
  transformed = vec3(transformed.x * cos(fa) , transformed.y + span * sin(fa), transformed.z);`
      );
  };
  mat.customProgramCacheKey = () => `flap-${rate}-${amp}`;
  mat.userData.time = time;
  return mat;
}

class Birds {
  constructor(root, areas, rng, count) {
    this.flocks = [];
    const total = areas.length * count;
    this.mesh = new THREE.InstancedMesh(birdGeometry(), flapMaterial(0x2b2a2e, 11, 0.75), total);
    this.mesh.frustumCulled = false;
    root.add(this.mesh);
    let i = 0;
    for (const a of areas) {
      const flock = { cx: a.x, cz: a.z, R: a.r, y: a.y, speed: rng.range(8, 11) / a.r * (rng.chance(0.5) ? 1 : -1), ph: rng.range(0, 6), birds: [] };
      for (let k = 0; k < count; k++) {
        flock.birds.push({ i: i++, off: new THREE.Vector3(rng.range(-6, 6), rng.range(-2.5, 2.5), rng.range(-6, 6)), ph: rng.range(0, 6), s: rng.range(0.8, 1.25) });
      }
      this.flocks.push(flock);
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }
  update(t) {
    for (const f of this.flocks) {
      const a = f.ph + t * f.speed;
      // figure-of-eight-ish wander around the area centre
      const R = f.R * (0.75 + 0.25 * Math.sin(t * 0.07 + f.ph));
      const cx = f.cx + Math.sin(a) * R, cz = f.cz + Math.cos(a) * R * 0.8;
      const yaw = Math.atan2(Math.cos(a) * Math.sign(f.speed), -Math.sin(a) * 0.8 * Math.sign(f.speed));
      for (const b of f.birds) {
        const wob = Math.sin(t * 0.9 + b.ph);
        this._p.set(cx + b.off.x + wob * 1.5, f.y + b.off.y + Math.sin(t * 1.3 + b.ph) * 1.2, cz + b.off.z + Math.cos(t * 0.8 + b.ph) * 1.5);
        this._e.set(Math.sin(t * 2 + b.ph) * 0.1, yaw, -Math.sign(f.speed) * 0.35, 'YXZ');
        this._q.setFromEuler(this._e);
        this._m.compose(this._p, this._q, this._s.setScalar(b.s));
        this.mesh.setMatrixAt(b.i, this._m);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.userData.time.value = t;
  }
}

// ------------------------------------------------------------------ butterflies
function butterflyGeometry() {
  const p = [
    // left wing (two lobes)
    0, 0, 0.02, -0.07, 0, 0.06, -0.08, 0, 0.0,
    0, 0, 0.0, -0.07, 0, -0.005, -0.05, 0, -0.06,
    // right wing
    0, 0, 0.02, 0.08, 0, 0.0, 0.07, 0, 0.06,
    0, 0, 0.0, 0.05, 0, -0.06, 0.07, 0, -0.005,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

class Butterflies {
  constructor(root, rng, count, height, allowed) {
    this.mesh = new THREE.InstancedMesh(butterflyGeometry(), flapMaterial(0xffffff, 26, 1.1), count);
    this.mesh.frustumCulled = false;
    const cols = ['#ffffff', '#ffe066', '#ff9f43', '#7fc8ff', '#f8a5c2', '#fffbe0'];
    this.list = [];
    for (let i = 0; i < count; i++) {
      this.mesh.setColorAt(i, new THREE.Color(rng.pick(cols)));
      this.list.push({ p: new THREE.Vector3(1e6, 0, 0), v: new THREE.Vector3(), ph: rng.range(0, 10), alive: false, s: rng.range(0.9, 1.4) });
    }
    root.add(this.mesh);
    this.height = height;
    this.allowed = allowed;
    this.rng = rng;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
  }
  update(dt, t, c) {
    const ok = c && this.allowed(c.x, c.z);
    this.list.forEach((b, i) => {
      const dx = b.p.x - (c ? c.x : 0), dz = b.p.z - (c ? c.z : 0);
      if (ok && (!b.alive || dx * dx + dz * dz > 22 * 22)) {
        const a = this.rng.range(0, Math.PI * 2), r = this.rng.range(2.5, 11);
        b.p.set(c.x + Math.sin(a) * r, 0, c.z + Math.cos(a) * r);
        b.p.y = this.height(b.p.x, b.p.z) + this.rng.range(0.4, 1.4);
        b.alive = this.allowed(b.p.x, b.p.z);
      }
      if (!ok) b.alive = false;
      if (!b.alive) {
        this._m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this._m);
        return;
      }
      // wander: smoothly turning heading with bobbing flight
      const h = t * 0.6 + b.ph;
      const dir = new THREE.Vector3(Math.sin(h * 1.3) + Math.sin(h * 0.37), 0, Math.cos(h * 1.1) + Math.cos(h * 0.53)).normalize();
      b.p.addScaledVector(dir, dt * 1.1);
      const gy = this.height(b.p.x, b.p.z);
      b.p.y += (gy + 0.7 + Math.sin(t * 3 + b.ph) * 0.35 - b.p.y) * Math.min(1, dt * 2);
      this._q.setFromEuler(new THREE.Euler(-0.4, Math.atan2(dir.x, dir.z), 0, 'YXZ'));
      this._m.compose(b.p, this._q, this._s.setScalar(b.s * 2.2));
      this.mesh.setMatrixAt(i, this._m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.material.userData.time.value = t;
  }
}

// ------------------------------------------------------------------ chimney smoke (GPU)
class Smoke {
  constructor(root, chimneys, perChimney, wind) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const n = chimneys.length * perChimney;
    const pos = new Float32Array(n * 4);
    let k = 0;
    chimneys.forEach((c, ci) => {
      for (let j = 0; j < perChimney; j++) {
        pos.set([c.x, c.y, c.z, j / perChimney + ci * 0.137], k * 4);
        k++;
      }
    });
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4));
    g.instanceCount = n;
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, time: { value: 0 }, wind: { value: wind } }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute vec4 iPos;
        uniform float time;
        uniform vec3 wind;
        varying vec2 vUv;
        varying float vA;
        void main() {
          float age = fract(time * 0.075 + iPos.w);
          vec3 c = iPos.xyz + vec3(0.0, age * 9.0, 0.0) + wind * age * age * 7.0;
          c.x += sin(age * 6.0 + iPos.w * 30.0) * 0.4 * age;
          float size = 1.1 + age * 5.2;
          vec4 mvPosition = viewMatrix * vec4(c, 1.0);
          float rot = iPos.w * 20.0 + age * 1.5;
          vec2 q = mat2(cos(rot), -sin(rot), sin(rot), cos(rot)) * position.xy;
          mvPosition.xy += q * size;
          vUv = uv;
          vA = smoothstep(0.0, 0.1, age) * pow(1.0 - age, 1.3) * 0.95;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D map;
        varying vec2 vUv;
        varying float vA;
        void main() {
          float a = texture2D(map, vUv).a * vA;
          gl_FragColor = vec4(vec3(0.6, 0.58, 0.56), min(a, 0.85));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.material.uniforms.map.value = softPuffTexture();
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    root.add(this.mesh);
  }
  update(t) {
    this.material.uniforms.time.value = t;
  }
}

// ------------------------------------------------------------------ sunlit pollen motes (GPU, wraps around the player)
class Motes {
  constructor(root, count, color) {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    const seeds = new Float32Array(count * 4);
    const rng = new RNG(5);
    for (let i = 0; i < count; i++) seeds.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
    g.setAttribute('seed', new THREE.InstancedBufferAttribute(seeds, 4));
    g.instanceCount = count;
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, color: { value: new THREE.Color(color) } },
      vertexShader: /* glsl */ `
        attribute vec4 seed;
        uniform float time;
        uniform vec3 center;
        varying vec2 vUv;
        varying float vA;
        void main() {
          const float B = 14.0;
          vec3 p = seed.xyz * B + vec3(sin(time * 0.13 + seed.w * 9.0), time * 0.05 + sin(time * 0.2 + seed.x * 7.0) * 0.3, cos(time * 0.11 + seed.y * 9.0)) * 1.2;
          p = mod(p - center + B * 0.5, B) - B * 0.5 + center;
          p.y = center.y - 1.0 + mod(seed.y * 4.0 + time * 0.03, 4.0);
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = length(mv.xyz);
          vA = smoothstep(7.0, 3.0, d) * smoothstep(0.3, 0.8, d) * (0.5 + 0.5 * sin(time * 2.0 + seed.w * 40.0));
          mv.xy += position.xy * 0.035;
          vUv = uv;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        varying vec2 vUv;
        varying float vA;
        void main() {
          float d = length(vUv - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.0, d) * vA;
          gl_FragColor = vec4(color * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    root.add(this.mesh);
  }
  update(t, c) {
    this.material.uniforms.time.value = t;
    if (c) this.material.uniforms.center.value.copy(c);
  }
}

// ------------------------------------------------------------------ facade
export class Ambience {
  constructor({ quality = 'medium', chimneys = [], birdAreas = [], height, butterflyOk = () => true, wind = new THREE.Vector3(1, 0, 0.3), seed = 7, moteColor = 0xfff0c0 }) {
    this.root = new THREE.Group();
    this.root.name = 'ambience';
    const rng = new RNG(seed);
    const q = { low: 0, medium: 1, high: 2 }[quality] ?? 1;
    this.birds = birdAreas.length ? new Birds(this.root, birdAreas, rng, q === 0 ? 5 : 8) : null;
    this.butterflies = q > 0 ? new Butterflies(this.root, rng, q === 2 ? 16 : 10, height, butterflyOk) : null;
    const smokeFrom = q === 0 ? chimneys.filter((_, i) => i % 3 === 0) : q === 1 ? chimneys.filter((_, i) => i % 2 === 0) : chimneys;
    this.smoke = smokeFrom.length ? new Smoke(this.root, smokeFrom, q === 2 ? 10 : 8, wind.clone().normalize()) : null;
    this.motes = q > 0 ? new Motes(this.root, q === 2 ? 160 : 90, moteColor) : null;
  }
  update(dt, t, center) {
    this.birds?.update(t);
    this.butterflies?.update(dt, t, center);
    this.smoke?.update(t);
    this.motes?.update(t, center);
  }
}
