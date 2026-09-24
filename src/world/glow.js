// One draw call for every light glow in the world (lamps, windows of the
// cathedral, crystals…). Camera-facing additive billboards; cheap fake bloom.
import * as THREE from 'three';

export class GlowField {
  constructor(texture, max = 1024) {
    this.max = max;
    this.count = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.pos = new Float32Array(max * 3);
    this.data = new Float32Array(max * 4); // size, flicker, phase, fadeFar
    this.col = new Float32Array(max * 3);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(this.data, 4));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 3));
    g.instanceCount = 0;
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, time: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec4 iData;
        attribute vec3 iCol;
        uniform float time;
        varying vec2 vUv;
        varying vec3 vCol;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float dist = length(mv.xyz);
          float flick = 1.0 - iData.y * (0.5 + 0.5 * sin(time * 9.0 + iData.z) * sin(time * 5.3 + iData.z * 2.1)) * 0.35;
          float fade = 1.0 - smoothstep(iData.w * 0.6, iData.w, dist);
          // keep glows from shrinking to sub-pixel sparkle in the distance
          float size = iData.x * clamp(dist / 160.0, 1.0, 2.2);
          vCol = iCol * flick * fade;
          mv.xy += position.xy * size;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        varying vec3 vCol;
        void main() {
          float a = texture2D(map, vUv).a;
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'glows';
  }

  add(x, y, z, size, color, flicker = 0, fadeFar = 260) {
    if (this.count >= this.max) return -1;
    const i = this.count++;
    const c = new THREE.Color(color);
    this.pos.set([x, y, z], i * 3);
    this.data.set([size, flicker, Math.random() * 100, fadeFar], i * 4);
    this.col.set([c.r, c.g, c.b], i * 3);
    this.geometry.instanceCount = this.count;
    this._dirty();
    return i;
  }

  set(i, x, y, z, size, color) {
    this.pos.set([x, y, z], i * 3);
    if (size !== undefined) this.data[i * 4] = size;
    if (color) this.col.set([color.r, color.g, color.b], i * 3);
    this._dirty();
  }

  _dirty() {
    for (const k of ['iPos', 'iData', 'iCol']) this.geometry.attributes[k].needsUpdate = true;
  }

  update(t) {
    this.material.uniforms.time.value = t;
  }
}
