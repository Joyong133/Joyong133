// Lightweight GPU point-sprite particles for dust, sparkles, confetti and
// impacts. One draw call for everything.
import * as THREE from 'three';
import { dotTexture } from '../world/textures.js';

const VS = `
attribute float size;
attribute float alpha;
attribute vec3 color;
varying vec3 vColor;
varying float vAlpha;
uniform float scale;
void main() {
  vColor = color;
  vAlpha = alpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * scale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
uniform sampler2D map;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  if (t.a * vAlpha < 0.02) discard;
  gl_FragColor = vec4(vColor, t.a * vAlpha);
}`;

const _c = new THREE.Color();

export class Fx {
  constructor(max = 900) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTexture() }, scale: { value: 400 } },
      vertexShader: VS,
      fragmentShader: FS,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setViewport(h) {
    this.mat.uniforms.scale.value = h * 0.9;
  }

  emit(x, y, z, vx, vy, vz, color, size, life, grav = 0, drag = 0) {
    const i = this.i;
    this.i = (i + 1) % this.max;
    const k = i * 3;
    this.pos[k] = x;
    this.pos[k + 1] = y;
    this.pos[k + 2] = z;
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
    _c.set(color);
    this.col[k] = _c.r;
    this.col[k + 1] = _c.g;
    this.col[k + 2] = _c.b;
    this.size0[i] = size;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.alpha[i] = 1;
    this.grav[i] = grav;
    this.drag[i] = drag;
  }

  burst(x, y, z, n, colors, speed, size, life, { up = 0, grav = 0, drag = 1.5, spread = 1 } = {}) {
    for (let j = 0; j < n; j++) {
      const a = Math.random() * Math.PI * 2;
      const e = (Math.random() - 0.3) * spread;
      const s = speed * (0.4 + Math.random() * 0.6);
      const col = Array.isArray(colors) ? colors[j % colors.length] : colors;
      this.emit(x, y, z, Math.cos(a) * s, e * s + up, Math.sin(a) * s, col, size * (0.6 + Math.random() * 0.6), life * (0.6 + Math.random() * 0.6), grav, drag);
    }
  }

  dust(x, y, z, n = 6, color = 0xf0e6d8) {
    this.burst(x, y + 0.1, z, n, color, 2.5, 0.9, 0.5, { up: 1, drag: 3, spread: 0.3 });
  }

  confetti(x, y, z, n = 80) {
    this.burst(x, y, z, n, [0xff5a5a, 0xffd23f, 0x5ad1ff, 0x7be07b, 0xff8fd8, 0xffffff], 9, 0.55, 2.2, { up: 7, grav: -9, drag: 1.2, spread: 0.6 });
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const k = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= d;
      this.vel[k + 1] = this.vel[k + 1] * d + this.grav[i] * dt;
      this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, t * 2.5);
      this.size[i] = this.size0[i] * (0.5 + 0.5 * t);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
    g.attributes.alpha.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}
