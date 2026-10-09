// Sky, ground, lighting, decorative props, landmarks and weather for a
// course. Props are vertex-coloured merged meshes drawn with instancing.
import * as THREE from 'three';
import { part, merge, toon, vcolMaterial } from './geom.js';
import { texture, animatedTexture, dotTexture } from './textures.js';
import { rng, rightX, rightZ } from '../core/rng.js';

const TAU = Math.PI * 2;
const C = (r, rb, h, s = 10) => new THREE.CylinderGeometry(r, rb, h, s);
const S = (r, w = 12, h = 10, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
const K = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);
const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const L = (pts, s = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s);

// ------------------------------------------------------------------ props
const PROPS = {
  treeRound: () =>
    merge([
      part(C(0.25, 0.38, 2.4, 8), 0x8a5a32, [0, 1.2, 0]),
      part(S(1.5), 0x5cb840, [0, 3.1, 0]),
      part(S(1.1), 0x6cc84e, [0.8, 3.7, 0.3]),
      part(S(1.0), 0x4fa838, [-0.7, 3.5, -0.4]),
    ]),
  pineSnow: () =>
    merge([
      part(C(0.22, 0.3, 1.6, 8), 0x6a4a2a, [0, 0.8, 0]),
      part(K(1.6, 2.2), 0x2f6a4a, [0, 2.3, 0]),
      part(K(1.25, 1.8), 0x3a7a55, [0, 3.4, 0]),
      part(K(0.85, 1.5), 0x46886a, [0, 4.4, 0]),
      part(K(0.5, 0.7), 0xffffff, [0, 5.0, 0]),
      part(K(1.3, 0.5), 0xffffff, [0, 2.95, 0]),
      part(K(0.95, 0.45), 0xffffff, [0, 3.95, 0]),
    ]),
  bush: () => merge([part(S(0.9), 0x4fa838, [0, 0.6, 0]), part(S(0.7), 0x5cb840, [0.7, 0.5, 0.2]), part(S(0.65), 0x6cc84e, [-0.6, 0.45, -0.1]), part(S(0.2), 0xff6a8a, [0.3, 1.2, 0.5]), part(S(0.18), 0xffffff, [-0.4, 1.0, 0.5])]),
  house: () =>
    merge([
      part(B(4, 3, 4), 0xfff3dc, [0, 1.5, 0]),
      part(K(3.4, 2.4, 4), 0xe8483c, [0, 4.2, 0], [0, Math.PI / 4, 0]),
      part(B(1, 1.8, 0.1), 0x8a5a32, [0, 0.9, 2.02]),
      part(B(0.9, 0.9, 0.1), 0x8fd4ff, [1.3, 1.9, 2.02]),
      part(B(0.9, 0.9, 0.1), 0x8fd4ff, [-1.3, 1.9, 2.02]),
      part(B(0.6, 1.4, 0.6), 0x9a6a5a, [1.1, 5.0, 0.6]),
    ]),
  mushroom: () => {
    const p = [part(C(0.35, 0.45, 1.3, 10), 0xfff3dc, [0, 0.65, 0]), part(S(1.1, 16, 10), 0xe8303c, [0, 1.3, 0], [0, 0, 0], [1, 0.6, 1])];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      p.push(part(S(0.16, 8, 6), 0xffffff, [Math.cos(a) * 0.7, 1.75, Math.sin(a) * 0.7], [0, 0, 0], [1, 0.5, 1]));
    }
    return merge(p);
  },
  lollipop: () => {
    const p = [part(C(0.08, 0.08, 3, 6), 0xffffff, [0, 1.5, 0]), part(C(1.1, 1.1, 0.3, 24), 0xff5a8a, [0, 3.6, 0], [Math.PI / 2, 0, 0])];
    for (let i = 0; i < 3; i++) p.push(part(new THREE.TorusGeometry(0.25 + i * 0.3, 0.07, 6, 24), i % 2 ? 0xffe066 : 0xffffff, [0, 3.6, 0.16]));
    return merge(p);
  },
  candyCane: () => {
    const p = [];
    for (let i = 0; i < 8; i++) p.push(part(C(0.22, 0.22, 0.5, 10), i % 2 ? 0xffffff : 0xe8303c, [0, 0.25 + i * 0.5, 0]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 5) * Math.PI;
      p.push(part(S(0.25, 8, 6), i % 2 ? 0xffffff : 0xe8303c, [0.6 - Math.cos(a) * 0.6, 4.0 + Math.sin(a) * 0.6, 0]));
    }
    return merge(p);
  },
  cupcake: () =>
    merge([
      part(C(0.9, 0.65, 1.0, 14), 0xff8fc8, [0, 0.5, 0]),
      part(S(0.95, 14, 10), 0xfff3f8, [0, 1.2, 0], [0, 0, 0], [1, 0.75, 1]),
      part(S(0.6, 12, 8), 0xffffff, [0, 1.65, 0]),
      part(S(0.22, 8, 6), 0xe8303c, [0, 2.2, 0]),
    ]),
  donut: () => merge([part(new THREE.TorusGeometry(1, 0.45, 10, 20), 0xd9a060, [0, 1.4, 0]), part(new THREE.TorusGeometry(1, 0.4, 8, 20, Math.PI * 2), 0xff8fc8, [0, 1.52, 0.12])]),
  gingerHouse: () =>
    merge([
      part(B(4.4, 3.2, 4.4), 0xb8783c, [0, 1.6, 0]),
      part(K(3.6, 2.6, 4), 0x8a4a22, [0, 4.5, 0], [0, Math.PI / 4, 0]),
      part(K(3.7, 0.4, 4), 0xffffff, [0, 3.35, 0], [0, Math.PI / 4, 0]),
      part(B(1.2, 2, 0.1), 0xff5a8a, [0, 1, 2.22]),
      part(S(0.35), 0xe8303c, [1.4, 2.3, 2.25]),
      part(S(0.35), 0x5ac8ff, [-1.4, 2.3, 2.25]),
      part(S(0.4), 0xffe066, [0, 6.0, 0]),
    ]),
  cloud: () => merge([part(S(2.4), 0xffffff, [0, 0, 0]), part(S(1.9), 0xffffff, [2.4, -0.3, 0.4]), part(S(1.7), 0xffffff, [-2.3, -0.4, -0.2]), part(S(1.5), 0xf2f6ff, [0.6, 1.1, -1.2])]),
  card: () => merge([part(B(2.2, 3.1, 0.08), 0xffffff, [0, 1.55, 0]), part(S(0.45, 10, 8), 0xd23a5b, [0, 1.6, 0.05], [0, 0, 0], [1, 1, 0.2]), part(B(2.0, 0.08, 0.1), 0xd23a5b, [0, 2.9, 0]), part(B(2.0, 0.08, 0.1), 0xd23a5b, [0, 0.2, 0])]),
  chessRook: () =>
    merge([
      part(L([[0, 0], [1.2, 0], [1.2, 0.4], [0.9, 0.6], [0.7, 2.6], [0.95, 2.8], [0.95, 3.4], [0, 3.4]], 12), 0x2b2440),
      ...[0, 1, 2, 3].map((i) => part(B(0.4, 0.4, 0.4), 0x2b2440, [Math.cos((i / 4) * TAU) * 0.7, 3.6, Math.sin((i / 4) * TAU) * 0.7])),
    ]),
  chessPawn: () => merge([part(L([[0, 0], [1, 0], [1, 0.35], [0.7, 0.5], [0.4, 1.8], [0.65, 2.0], [0.35, 2.15], [0, 2.15]], 14), 0xf6f0ff), part(S(0.6), 0xf6f0ff, [0, 2.6, 0])]),
  teacup: () =>
    merge([
      part(L([[0, 0], [0.8, 0], [0.9, 0.15], [1.4, 1.2], [1.35, 1.25], [0, 0.3]], 18), 0xffffff),
      part(new THREE.TorusGeometry(0.4, 0.1, 6, 12), 0xffffff, [1.45, 0.75, 0]),
      part(C(1.5, 1.5, 0.06, 18), 0xff8fc8, [0, 0.02, 0]),
      part(C(1.3, 1.3, 0.02, 18), 0x8a4a22, [0, 1.0, 0]),
    ]),
  clock: () => {
    const p = [part(C(1.6, 1.6, 0.35, 24), 0xd8b44a, [0, 0, 0], [Math.PI / 2, 0, 0]), part(C(1.4, 1.4, 0.4, 24), 0xfff8e8, [0, 0, 0], [Math.PI / 2, 0, 0])];
    for (let i = 0; i < 12; i++) p.push(part(B(0.08, 0.25, 0.05), 0x2a2030, [Math.cos((i / 12) * TAU) * 1.15, Math.sin((i / 12) * TAU) * 1.15, 0.22], [0, 0, (i / 12) * TAU + Math.PI / 2]));
    p.push(part(B(0.1, 1.0, 0.05), 0x2a2030, [0, 0.45, 0.24]), part(B(0.7, 0.1, 0.05), 0x2a2030, [0.32, 0, 0.24]));
    return merge(p);
  },
  beanLeaf: () => merge([part(S(1.2, 14, 8), 0x5cb840, [0, 0, 0], [0, 0, 0], [1.4, 0.15, 0.8]), part(B(2.6, 0.06, 0.1), 0x3f8f2c, [0, 0.12, 0])]),
  coral: () => {
    const cols = [0xff7a8a, 0xff9a5a, 0xc87aff, 0xffd05a];
    const col = cols[Math.floor(Math.random() * cols.length)];
    const p = [part(C(0.25, 0.35, 1.6, 7), col, [0, 0.8, 0])];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU;
      p.push(part(C(0.15, 0.2, 1.2, 6), col, [Math.cos(a) * 0.4, 1.7, Math.sin(a) * 0.4], [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5]));
      p.push(part(S(0.2, 8, 6), col, [Math.cos(a) * 0.7, 2.3, Math.sin(a) * 0.7]));
    }
    return merge(p);
  },
  seaweed: () => merge([part(K(0.25, 3.5, 5), 0x2f9a5a, [0, 1.75, 0], [0.1, 0, 0]), part(K(0.2, 2.6, 5), 0x3fb86a, [0.4, 1.3, 0.1], [-0.15, 0, 0.1]), part(K(0.18, 2.2, 5), 0x2a8a4a, [-0.35, 1.1, -0.1], [0.1, 0, -0.15])]),
  shell: () => {
    const p = [];
    for (let i = 0; i < 7; i++) p.push(part(K(0.32, 1.8, 6), i % 2 ? 0xffd8e0 : 0xfff0f0, [0, 0.12, 0.6], [Math.PI / 2 - 0.15, ((i - 3) / 6) * 1.6, 0]));
    return merge(p);
  },
  rock: () => merge([part(new THREE.DodecahedronGeometry(1, 0), 0x8a8f9a, [0, 0.5, 0], [0.3, 0.5, 0], [1.2, 0.8, 1])]),
  rockSnow: () => merge([part(new THREE.DodecahedronGeometry(1, 0), 0x8a9aaa, [0, 0.5, 0], [0.3, 0.5, 0], [1.2, 0.8, 1]), part(S(0.9, 10, 6), 0xffffff, [0, 1.0, 0], [0, 0, 0], [1.1, 0.35, 1])]),
  iceCrystal: () => merge([part(new THREE.OctahedronGeometry(0.8, 0), 0xbfeeff, [0, 1.8, 0], [0, 0, 0], [0.8, 2.4, 0.8]), part(new THREE.OctahedronGeometry(0.5, 0), 0x9adcff, [0.8, 1.0, 0.2], [0, 0, -0.4], [0.7, 1.6, 0.7])]),
  snowman: () => merge([part(S(0.9), 0xffffff, [0, 0.8, 0]), part(S(0.65), 0xffffff, [0, 2.0, 0]), part(S(0.45), 0xffffff, [0, 2.9, 0]), part(K(0.08, 0.5, 6), 0xff8a2a, [0, 2.9, 0.6], [Math.PI / 2, 0, 0]), part(C(0.4, 0.4, 0.5, 10), 0x2a2a3a, [0, 3.45, 0]), part(C(0.6, 0.6, 0.06, 10), 0x2a2a3a, [0, 3.2, 0]), part(new THREE.TorusGeometry(0.5, 0.12, 6, 12), 0xe8303c, [0, 2.45, 0], [Math.PI / 2, 0, 0])]),
  poppy: () => {
    const p = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const x = Math.cos(a) * 0.6;
      const z = Math.sin(a) * 0.6;
      p.push(part(C(0.03, 0.03, 0.8, 4), 0x3a7a2a, [x, 0.4, z]), part(S(0.22, 8, 6), 0xe82a2a, [x, 0.85, z], [0, 0, 0], [1, 0.6, 1]), part(S(0.07, 6, 4), 0x2a1a12, [x, 0.95, z]));
    }
    return merge(p);
  },
  scarecrow: () => merge([part(C(0.08, 0.08, 3, 6), 0x8a5a32, [0, 1.5, 0]), part(C(0.06, 0.06, 2.2, 6), 0x8a5a32, [0, 2.2, 0], [0, 0, Math.PI / 2]), part(B(0.9, 1, 0.4), 0x3a6aa8, [0, 2.0, 0]), part(S(0.38), 0xf0d890, [0, 2.9, 0]), part(K(0.6, 0.7, 10), 0x5a4a2a, [0, 3.35, 0]), part(C(0.7, 0.7, 0.05, 10), 0x5a4a2a, [0, 3.05, 0])]),
  gear: () => {
    const p = [part(C(1.6, 1.6, 0.4, 24), 0xc9a14a, [0, 0, 0], [Math.PI / 2, 0, 0]), part(C(0.4, 0.4, 0.5, 12), 0x6a4a1a, [0, 0, 0], [Math.PI / 2, 0, 0])];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      p.push(part(B(0.5, 0.5, 0.4), 0xc9a14a, [Math.cos(a) * 1.75, Math.sin(a) * 1.75, 0], [0, 0, a]));
    }
    return merge(p);
  },
  pumpkin: () => {
    const p = [];
    for (let i = 0; i < 6; i++) p.push(part(S(0.8, 12, 10), i % 2 ? 0xff8a2a : 0xf07a1a, [Math.cos((i / 6) * TAU) * 0.35, 0.7, Math.sin((i / 6) * TAU) * 0.35], [0, 0, 0], [0.7, 0.85, 0.7]));
    p.push(part(C(0.08, 0.12, 0.4, 6), 0x3a6a2a, [0, 1.5, 0]));
    return merge(p);
  },
  palm: () => {
    const p = [];
    for (let i = 0; i < 6; i++) p.push(part(C(0.22, 0.26, 0.9, 7), i % 2 ? 0xa8784a : 0x8a5a32, [i * 0.12, 0.45 + i * 0.85, 0], [0, 0, -0.08]));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      p.push(part(S(1.1, 8, 4), 0x3a9a3a, [0.7 + Math.cos(a) * 1.0, 5.3, Math.sin(a) * 1.0], [0, -a, 0.35], [1.4, 0.12, 0.45]));
    }
    p.push(part(S(0.2), 0x6a4a2a, [0.75, 5.1, 0.2]), part(S(0.2), 0x6a4a2a, [0.55, 5.1, -0.2]));
    return merge(p);
  },
  dune: () => merge([part(S(3, 16, 8, 0, TAU, 0, Math.PI / 2), 0xe8c080, [0, 0, 0], [0, 0, 0], [1.6, 0.45, 1])]),
  pot: () => merge([part(L([[0, 0], [0.5, 0], [0.8, 0.5], [0.85, 1.0], [0.45, 1.5], [0.35, 1.8], [0.5, 1.9], [0, 1.9]], 14), 0xc8784a), part(new THREE.TorusGeometry(0.62, 0.06, 6, 16), 0x2c4fa8, [0, 1.1, 0], [Math.PI / 2, 0, 0])]),
  basalt: () => {
    const p = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const h = 2 + ((i * 7) % 5) * 0.6;
      p.push(part(C(0.5, 0.5, h, 6), i % 2 ? 0x3a3034 : 0x4a3e42, [Math.cos(a) * 0.7, h / 2, Math.sin(a) * 0.7]));
    }
    return merge(p);
  },
  lavaRock: () => merge([part(new THREE.DodecahedronGeometry(1, 0), 0x3a2e2d, [0, 0.5, 0], [0.4, 0.2, 0], [1.2, 0.8, 1]), part(S(0.3, 8, 6), 0xff7a1a, [0.4, 1.0, 0.3])]),
  deadTree: () => merge([part(C(0.18, 0.3, 3, 6), 0x2a2020, [0, 1.5, 0]), part(C(0.08, 0.12, 1.4, 5), 0x2a2020, [0.45, 2.8, 0], [0, 0, -0.7]), part(C(0.07, 0.1, 1.2, 5), 0x2a2020, [-0.4, 2.5, 0.1], [0, 0, 0.8])]),
};

const geoCache = new Map();
function propGeo(type) {
  if (!geoCache.has(type)) geoCache.set(type, PROPS[type]());
  return geoCache.get(type);
}

// ------------------------------------------------------------------ liquids
// Toon water (or lava): drifting noise, cartoon wave contours, sparkles and a
// sky-tinted fresnel at grazing angles. Lava crests are HDR so they bloom.
function liquidMaterial(theme, lava) {
  const base = new THREE.Color(theme.ground.color);
  const deep = lava ? new THREE.Color(0x8a1a08) : base.clone().offsetHSL(0, 0.05, -0.12);
  const shallow = lava ? new THREE.Color(0xff6a14) : base.clone().offsetHSL(0, 0, 0.1);
  const foam = lava ? new THREE.Color(0xffd34d).multiplyScalar(2.2) : new THREE.Color(0xffffff);
  const sky = new THREE.Color(theme.sky[1]);
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deep: { value: deep },
        shallow: { value: shallow },
        foam: { value: foam },
        sky: { value: sky },
        camPos: { value: new THREE.Vector3() },
        lava: { value: lava ? 1 : 0 },
      },
    ]),
    fog: true,
    vertexShader: `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float time;
      uniform vec3 deep;
      uniform vec3 shallow;
      uniform vec3 foam;
      uniform vec3 sky;
      uniform vec3 camPos;
      uniform float lava;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      void main() {
        vec2 p = vWorld.xz * 0.07;
        float speed = mix(1.0, 0.35, lava);
        float n = noise(p + vec2(time * 0.05, time * 0.03) * speed) * 0.6 + noise(p * 2.3 - vec2(time * 0.07, -time * 0.04) * speed) * 0.4;
        float bands = sin(n * 18.0 + time * 1.2 * speed);
        float crest = smoothstep(0.82, 0.95, bands) * smoothstep(0.25, 0.6, n);
        vec3 col = mix(deep, shallow, smoothstep(0.2, 0.85, n));
        col = mix(col, foam, crest * mix(0.75, 1.0, lava));
        float sp = step(0.992, hash(floor(vWorld.xz * 1.2) + floor(time * 2.5)));
        col += sp * 0.7 * (1.0 - lava);
        vec3 v = normalize(camPos - vWorld);
        float fr = pow(1.0 - clamp(v.y, 0.0, 1.0), 3.0);
        col = mix(col, sky, fr * 0.55 * (1.0 - lava));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}

// ------------------------------------------------------------------ helpers
function bounds(course) {
  const b = new THREE.Box3();
  for (const p of course.path) b.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
  return b;
}

// coarse spatial hash of path samples for clearance checks
function pathHash(course) {
  const cell = 12;
  const map = new Map();
  for (const p of course.path) {
    const k = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  }
  return (x, z) => {
    let best = Infinity;
    let bp = null;
    const ix = Math.floor(x / cell);
    const iz = Math.floor(z / cell);
    for (let a = -2; a <= 2; a++) {
      for (let b = -2; b <= 2; b++) {
        const list = map.get(`${ix + a},${iz + b}`);
        if (!list) continue;
        for (const p of list) {
          const d = Math.hypot(p.x - x, p.z - z) - p.w / 2;
          if (d < best) {
            best = d;
            bp = p;
          }
        }
      }
    }
    return { d: best, p: bp };
  };
}

// ------------------------------------------------------------------ build
export function buildScenery(theme, course, quality = 'medium') {
  const group = new THREE.Group();
  const r = rng(1234 + course.path.length);
  const bb = bounds(course);
  const center = bb.getCenter(new THREE.Vector3());
  const size = bb.getSize(new THREE.Vector3());
  const radius = Math.max(size.x, size.z) / 2 + 60;
  const gy = course.groundY;
  const anim = [];

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(theme.sky[0]) }, mid: { value: new THREE.Color(theme.sky[1]) }, bot: { value: new THREE.Color(theme.sky[2]) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, pow(min(h*1.4,1.0), 0.7)) : mix(mid, bot, pow(min(-h*3.0,1.0), 0.5)); gl_FragColor = vec4(c, 1.0); }',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 32, 16), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  const sunDir = new THREE.Vector3(...theme.sun).normalize();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTexture(), color: new THREE.Color(theme.night ? 0xf0f0ff : 0xfffbe8).multiplyScalar(theme.night ? 1.4 : 2.6), fog: false, depthWrite: false, transparent: true }));
  sun.scale.setScalar(theme.night ? 160 : 220);
  sun.position.copy(sunDir).multiplyScalar(1400);
  sky.add(sun);
  if (theme.night) {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = r() * 2 - 1;
      const a = r() * TAU;
      const y = Math.abs(u);
      const k = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * k * 1450, y * 1450, Math.sin(a) * k * 1450], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 3, sizeAttenuation: false, fog: false }));
    sky.add(stars);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
    moon.position.copy(sunDir).multiplyScalar(1300);
    sky.add(moon);
  }

  // ground
  const gk = theme.ground.kind;
  let groundMat;
  if (gk === 'water' || gk === 'lava') {
    groundMat = liquidMaterial(theme, gk === 'lava');
    anim.push((time, cam) => {
      groundMat.uniforms.time.value = time;
      groundMat.uniforms.camPos.value.copy(cam);
    });
  } else if (gk === 'clouds') {
    groundMat = toon({ color: 0xffffff });
  } else {
    const t = theme.ground.tex ? texture(theme.ground.tex).clone() : null;
    if (t) {
      t.userData = {};
      t.needsUpdate = true;
      t.repeat.set(gk === 'void' ? 60 : 300, gk === 'void' ? 60 : 300);
    }
    groundMat = toon({ color: theme.ground.color, map: t });
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(center.x, gk === 'void' ? gy - 30 : gy, center.z);
  ground.receiveShadow = gk !== 'lava' && gk !== 'void';
  group.add(ground);
  if (gk === 'lava') {
    const glow = new THREE.PointLight(0xff6a1a, 2.5, 60, 1.2);
    glow.position.set(center.x, gy + 6, center.z);
    group.add(glow);
  }

  // props near the track
  const near = pathHash(course);
  const islands = [];
  const L0 = course.length;
  for (const spec of theme.decor) {
    const count = Math.round((spec.density * L0) / 100);
    const mats = [];
    for (let i = 0; i < count * 3 && mats.length < count; i++) {
      const s = r() * L0;
      const p = course.pointAt(s);
      const side = r() < 0.5 ? -1 : 1;
      const d = spec.dist[0] + r() * (spec.dist[1] - spec.dist[0]);
      const lat = side * (p.w / 2 + 1 + d);
      const x = p.x + rightX(p.h) * lat;
      const z = p.z + rightZ(p.h) * lat;
      const sc = spec.scale[0] + r() * (spec.scale[1] - spec.scale[0]);
      const clear = near(x, z);
      const floaty = !!spec.float;
      // grounded props may rise above the track, so keep them clear of it
      if (clear.d < (floaty ? 2.5 : 2) + sc * 1.6) continue;
      let y = gy;
      if (floaty) y = p.y + spec.float[0] + r() * (spec.float[1] - spec.float[0]);
      if (!floaty && spec.island && gk === 'water') {
        islands.push({ x, z, r: 2.4 * sc + 1 });
        y = gy + 0.6;
      }
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(floaty && spec.type !== 'cloud' ? (r() - 0.5) * 0.6 : 0, r() * TAU, 0)), new THREE.Vector3(sc, sc, sc));
      mats.push(m);
    }
    if (!mats.length) continue;
    const mesh = new THREE.InstancedMesh(propGeo(spec.type), vcolMaterial(), mats.length);
    mats.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = quality === 'high' && !floatyType(spec);
    mesh.receiveShadow = true;
    if (spec.type === 'cloud') mesh.material = toon({ vertexColors: true, color: spec.color ?? 0xffffff, emissive: 0x8a8f9a });
    else if (spec.color) mesh.material = toon({ vertexColors: true, color: spec.color });
    group.add(mesh);
  }
  if (islands.length) {
    const g = new THREE.CylinderGeometry(1, 1.15, 1.2, 14);
    const mesh = new THREE.InstancedMesh(g, toon({ color: theme.island ?? 0x7bc84a }), islands.length);
    islands.forEach((is, i) => {
      mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(is.x, gy, is.z), new THREE.Quaternion(), new THREE.Vector3(is.r, 1, is.r)));
    });
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (gk === 'clouds') {
    // a sea of cloud puffs below the course
    const n = 140;
    const mesh = new THREE.InstancedMesh(propGeo('cloud'), toon({ vertexColors: true, emissive: 0x8a8f9a }), n);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU;
      const d = r() * (radius + 80);
      const sc = 3 + r() * 5;
      mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(center.x + Math.cos(a) * d, gy + r() * 4, center.z + Math.sin(a) * d), new THREE.Quaternion(), new THREE.Vector3(sc, sc * 0.6, sc)));
    }
    group.add(mesh);
  }

  // distant ring
  buildFar(group, theme, center, radius, gy, r);
  // landmark
  const lm = buildLandmark(theme, course, gy, r);
  if (lm) {
    group.add(lm.obj);
    if (lm.anim) anim.push(lm.anim);
  }

  // lights
  const hemi = new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], theme.hemi[2]);
  group.add(hemi);
  const dir = new THREE.DirectionalLight(theme.sunColor, theme.sunInt);
  dir.position.copy(sunDir).multiplyScalar(80);
  group.add(dir, dir.target);
  if (quality !== 'low') {
    dir.castShadow = true;
    const ms = quality === 'high' ? 2048 : 1024;
    dir.shadow.mapSize.set(ms, ms);
    const cam = dir.shadow.camera;
    cam.left = cam.bottom = -32;
    cam.right = cam.top = 32;
    cam.near = 1;
    cam.far = 200;
    dir.shadow.bias = -0.0008;
    dir.shadow.normalBias = 0.03;
  }

  const fog = new THREE.Fog(theme.fog[0], theme.fog[1], theme.fog[2]);
  return {
    group,
    sky,
    sunDir,
    dir,
    fog,
    update(time, camPos) {
      sky.position.copy(camPos);
      for (const a of anim) a(time, camPos);
    },
    followShadow(target) {
      dir.position.copy(target).addScaledVector(sunDir, 90);
      dir.target.position.copy(target);
    },
  };
}

function floatyType(spec) {
  return spec.type === 'cloud';
}

function buildFar(group, theme, center, radius, gy, r) {
  const f = theme.far;
  if (!f) return;
  const n = 26;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.2;
    const d = radius + 180 + r() * 220;
    const x = center.x + Math.cos(a) * d;
    const z = center.z + Math.sin(a) * d;
    const s = 40 + r() * 80;
    switch (f.type) {
      case 'hills':
        parts.push(part(S(1, 16, 10), f.color, [x, gy - s * 0.3, z], [0, 0, 0], [s * 1.4, s * 0.7, s]));
        break;
      case 'mountains':
        parts.push(part(K(1, 1, 7), 0x9ab0c8, [x, gy + s * 0.5, z], [0, r(), 0], [s * 0.9, s * 1.2, s * 0.9]));
        parts.push(part(K(1, 1, 7), f.color, [x, gy + s * 0.85, z], [0, r(), 0], [s * 0.35, s * 0.5, s * 0.35]));
        break;
      case 'volcanoes':
        parts.push(part(C(0.25, 1, 1, 9), f.color, [x, gy + s * 0.4, z], [0, 0, 0], [s, s * 0.8, s]));
        parts.push(part(C(0.24, 0.24, 1, 9), 0xff6a1a, [x, gy + s * 0.8, z], [0, 0, 0], [s, 0.05 * s, s]));
        break;
      case 'dunes':
        parts.push(part(S(1, 16, 8), f.color, [x, gy - s * 0.2, z], [0, r(), 0], [s * 2, s * 0.4, s]));
        break;
      case 'floatRocks':
        parts.push(part(K(1, 1, 6), f.color, [x, gy + 30 + r() * 60, z], [Math.PI, r(), 0], [s * 0.4, s * 0.7, s * 0.4]));
        parts.push(part(C(1, 1, 1, 6), 0xd99ae8, [x, gy + 30 + 0.35 * s, z], [0, 0, 0], [s * 0.4, 1, s * 0.4]));
        break;
      case 'cloudBanks':
        parts.push(part(S(1, 12, 8), 0xffffff, [x, gy + r() * 30, z], [0, 0, 0], [s, s * 0.45, s * 0.8]));
        break;
      case 'towers':
        parts.push(part(B(1, 1, 1), f.color, [x, gy + s, z], [0, r(), 0], [s * 0.2, s * 2, s * 0.2]));
        parts.push(part(K(1, 1, 4), 0x1a1440, [x, gy + s * 2.2, z], [0, Math.PI / 4, 0], [s * 0.18, s * 0.4, s * 0.18]));
        break;
      case 'reef':
        parts.push(part(new THREE.DodecahedronGeometry(1, 0), f.color, [x, gy, z], [r(), r(), 0], [s, s * 0.6, s]));
        break;
      default:
        break;
    }
  }
  if (!parts.length) return;
  const mesh = new THREE.Mesh(merge(parts), vcolMaterial());
  group.add(mesh);
}

// ------------------------------------------------------------------ landmarks
function buildLandmark(theme, course, gy, r) {
  const goal = course.pointAt(course.goalS);
  const side = r() < 0.5 ? -1 : 1;
  // Landmarks go where there's most room: usually the middle of the circuit.
  // Very distant ones (ahead > 100) sit outside the loop, past the start line.
  const near = pathHash(course);
  const bb = bounds(course);
  const used = [];
  const place = (ahead) => {
    if (ahead > 100) {
      const c = bb.getCenter(new THREE.Vector3());
      const R = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 + ahead;
      return { x: c.x + Math.sin(goal.h) * R, z: c.z + Math.cos(goal.h) * R };
    }
    let best = null;
    let bestD = -Infinity;
    for (let i = 1; i < 12; i++) {
      for (let j = 1; j < 12; j++) {
        const x = bb.min.x + ((bb.max.x - bb.min.x) * i) / 12;
        const z = bb.min.z + ((bb.max.z - bb.min.z) * j) / 12;
        let d = near(x, z).d;
        for (const u of used) d = Math.min(d, Math.hypot(u.x - x, u.z - z) - 20);
        if (d > bestD) {
          bestD = d;
          best = { x, z };
        }
      }
    }
    used.push(best);
    return best;
  };
  const obj = new THREE.Group();
  let animFn = null;
  const add = (geo, x, y, z, ry = 0, s = 1) => {
    const m = new THREE.Mesh(geo, vcolMaterial());
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.scale.setScalar(s);
    obj.add(m);
    return m;
  };
  switch (theme.landmark) {
    case 'windmill': {
      const p = place(50, side * 30);
      add(merge([part(C(3, 4.5, 16, 10), 0xfff3dc, [0, 8, 0]), part(K(4.6, 5, 10), 0xe8483c, [0, 18.5, 0]), part(B(2, 3.5, 0.2), 0x8a5a32, [0, 1.75, 4.1])]), p.x, gy + 0.6, p.z, goal.h);
      const blades = new THREE.Group();
      blades.position.set(p.x + Math.sin(goal.h) * -4.8, gy + 15, p.z + Math.cos(goal.h) * -4.8);
      blades.rotation.y = goal.h;
      const bm = new THREE.Mesh(merge([0, 1, 2, 3].map((i) => part(B(1.6, 11, 0.2), 0xffffff, [Math.cos((i / 4) * TAU) * 5.5, Math.sin((i / 4) * TAU) * 5.5, 0], [0, 0, (i / 4) * TAU + Math.PI / 2]))), vcolMaterial());
      blades.add(bm);
      obj.add(blades);
      const isl = new THREE.Mesh(C(14, 15, 1.2, 20), toon({ color: theme.island }));
      isl.position.set(p.x, gy, p.z);
      obj.add(isl);
      animFn = (t) => (bm.rotation.z = t * 0.6);
      break;
    }
    case 'candyCastle': {
      const p = place(60, side * 34);
      const parts = [part(C(10, 11, 6, 24), 0xff8fc8, [0, 3, 0]), part(C(8, 8.5, 5, 24), 0xfff3f8, [0, 8.5, 0]), part(C(5.5, 6, 4.5, 24), 0x8fd4ff, [0, 13.2, 0]), part(S(1.3), 0xe8303c, [0, 16.5, 0])];
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU;
        parts.push(part(C(1.6, 1.6, 14, 12), i % 2 ? 0xffe066 : 0xb8f5d8, [Math.cos(a) * 11, 7, Math.sin(a) * 11]), part(K(2.2, 4, 12), 0xff5a8a, [Math.cos(a) * 11, 16, Math.sin(a) * 11]));
      }
      add(merge(parts), p.x, gy, p.z);
      break;
    }
    case 'queenCastle': {
      const p = place(70, side * 40);
      const parts = [part(B(22, 14, 14), 0xf6f0ff, [0, 7, 0]), part(B(8, 10, 8), 0xd23a5b, [0, 19, 0]), part(K(6, 8, 4), 0x2b2440, [0, 28, 0], [0, Math.PI / 4, 0])];
      for (const sx of [-1, 1]) {
        parts.push(part(C(3, 3, 22, 12), 0xd23a5b, [sx * 12, 11, 0]), part(K(4, 7, 12), 0x2b2440, [sx * 12, 25.5, 0]), part(S(1.4, 10, 8), 0xffd23f, [sx * 12, 30, 0]));
      }
      add(merge(parts), p.x, course.minY - 6, p.z, goal.h);
      break;
    }
    case 'beanstalk': {
      const mid = course.pointAt(course.length * 0.5);
      const bx = mid.x + rightX(mid.h) * side * 26;
      const bz = mid.z + rightZ(mid.h) * side * 26;
      const parts = [];
      const top = course.maxY + 40;
      for (let y = gy - 5, i = 0; y < top; y += 2.2, i++) {
        const a = i * 0.35;
        parts.push(part(S(2.2, 10, 8), i % 2 ? 0x4f9a34 : 0x5cb840, [Math.cos(a) * 2.5, y, Math.sin(a) * 2.5]));
        if (i % 4 === 0) parts.push(part(S(3, 10, 6), 0x6cc84e, [Math.cos(a) * 6, y + 1, Math.sin(a) * 6], [0, -a, 0.3], [1.4, 0.15, 0.7]));
      }
      add(merge(parts), bx, 0, bz);
      // castle in the clouds behind the goal
      const c = place(55, -side * 25);
      const cparts = [part(S(1, 14, 10), 0xffffff, [0, 0, 0], [0, 0, 0], [20, 5, 14]), part(B(14, 10, 10), 0xd8d0f0, [0, 7, 0]), part(K(5, 6, 4), 0x6a5ab8, [0, 15, 0], [0, Math.PI / 4, 0])];
      for (const sx of [-1, 1]) cparts.push(part(C(2.2, 2.2, 16, 10), 0xc8c0e8, [sx * 8, 8, 0]), part(K(3, 5, 10), 0x6a5ab8, [sx * 8, 18.5, 0]));
      add(merge(cparts), c.x, goal.y + 2, c.z, goal.h);
      break;
    }
    case 'shipwreck': {
      const p = place(40, side * 32);
      const parts = [part(S(1, 16, 10), 0x7a5232, [0, 0, 0], [0, 0, 0], [5, 4, 16]), part(B(9, 0.5, 26), 0x9a6a3f, [0, 2.5, 0]), part(C(0.5, 0.6, 18, 8), 0x6a4a2a, [0, 11, 2]), part(B(10, 7, 0.2), 0xf0e8d8, [0, 13, 2.4]), part(C(0.4, 0.5, 12, 8), 0x6a4a2a, [0, 8, -6])];
      const m = add(merge(parts), p.x, gy + 2, p.z, goal.h + 0.6);
      m.rotation.z = 0.35;
      break;
    }
    case 'icePalace': {
      const p = place(60, side * 36);
      const parts = [part(C(14, 16, 4, 8), 0xd0e8f8, [0, 2, 0])];
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * TAU;
        const d = i === 0 ? 0 : 7 + (i % 2) * 3;
        const h = i === 0 ? 30 : 12 + (i % 3) * 5;
        parts.push(part(new THREE.OctahedronGeometry(1, 0), i % 2 ? 0xbfeeff : 0x9adcff, [Math.cos(a) * d, 4 + h / 2, Math.sin(a) * d], [0, 0, 0], [2.6, h / 2, 2.6]));
      }
      add(merge(parts), p.x, gy, p.z);
      break;
    }
    case 'emeraldCity': {
      const p = place(130, side * 10);
      const parts = [];
      for (let i = 0; i < 9; i++) {
        const x = (i - 4) * 9;
        const h = 30 + Math.abs(4 - Math.abs(i - 4)) * 14;
        parts.push(part(C(3.4, 4, h, 8), i % 2 ? 0x2fa36a : 0x46c486, [x, h / 2, (i % 3) * 5]), part(K(4.2, 10, 8), 0x1f8a52, [x, h + 5, (i % 3) * 5]), part(S(1.1, 8, 6), 0xbfffd8, [x, h + 10.5, (i % 3) * 5]));
      }
      add(merge(parts), p.x, gy, p.z, goal.h);
      break;
    }
    case 'clockTower': {
      const p = place(60, side * 30);
      const tower = add(merge([part(B(16, 70, 16), 0x3a2a4a, [0, 35, 0]), part(K(13, 18, 4), 0x2a1a3a, [0, 79, 0], [0, Math.PI / 4, 0]), part(C(7, 7, 0.6, 32), 0xfff3d0, [0, 58, 8.2], [Math.PI / 2, 0, 0]), part(C(7.6, 7.6, 0.4, 32), 0xd8b44a, [0, 58, 8], [Math.PI / 2, 0, 0])]), p.x, course.minY - 40, p.z, goal.h + Math.PI);
      const hands = new THREE.Group();
      hands.position.set(0, 58, 8.6);
      const hm = toon({ color: 0x1a1430 });
      const hour = new THREE.Mesh(B(0.6, 4, 0.2), hm);
      hour.geometry.translate(0, 2, 0);
      const minute = new THREE.Mesh(B(0.4, 6, 0.2), hm);
      minute.geometry.translate(0, 3, 0);
      hands.add(hour, minute);
      tower.add(hands);
      animFn = (t) => {
        minute.rotation.z = -t * 0.5;
        hour.rotation.z = -t * 0.04 - 0.1;
      };
      break;
    }
    case 'palace': {
      const p = place(70, side * 36);
      const parts = [part(B(30, 12, 18), 0xf2dcb0, [0, 6, 0]), part(S(8, 18, 12, 0, TAU, 0, Math.PI / 2), 0x2c8fa8, [0, 12, 0], [0, 0, 0], [1, 1.3, 1]), part(K(1, 4, 8), 0xf5c542, [0, 23, 0])];
      for (const sx of [-1, 1]) {
        parts.push(part(C(1.6, 2, 26, 10), 0xf2dcb0, [sx * 17, 13, 0]), part(S(2.4, 12, 8), 0x2c8fa8, [sx * 17, 27, 0]), part(K(0.6, 3, 6), 0xf5c542, [sx * 17, 30, 0]));
        parts.push(part(S(4.5, 14, 10, 0, TAU, 0, Math.PI / 2), 0xd8b44a, [sx * 9, 12, 0]));
      }
      add(merge(parts), p.x, gy, p.z, goal.h);
      break;
    }
    case 'dragon': {
      const p = place(60, side * 30);
      const parts = [
        part(C(16, 40, 50, 10), 0x3a2020, [0, 25, 0]),
        part(C(15.5, 15.5, 1, 10), 0xff6a1a, [0, 50.2, 0]),
        // dragon head on the slope
        part(S(1, 14, 10), 0x6a1a1a, [0, 30, 22], [0, 0, 0], [7, 6, 10]),
        part(S(1, 12, 8), 0x7a2020, [0, 27, 31], [0, 0, 0], [5, 3.5, 6]),
        part(K(1.4, 8, 6), 0xf0e0c0, [-4, 37, 20], [-0.5, 0, -0.3]),
        part(K(1.4, 8, 6), 0xf0e0c0, [4, 37, 20], [-0.5, 0, 0.3]),
        part(S(1.3, 10, 8), 0xffd23f, [-3.2, 32, 28]),
        part(S(1.3, 10, 8), 0xffd23f, [3.2, 32, 28]),
      ];
      add(merge(parts), p.x, gy, p.z, goal.h + Math.PI);
      break;
    }
    default:
      return null;
  }
  return { obj, anim: animFn };
}

// ------------------------------------------------------------------ weather
const WEATHER = {
  petals: { n: 220, color: [0xffb3d1, 0xffffff, 0xffd6e6], size: 0.22, vy: -1.2, sway: 1.2 },
  sparkles: { n: 200, color: [0xff8fc8, 0xffe066, 0x8fd4ff, 0xffffff], size: 0.2, vy: 0.2, sway: 0.4, twinkle: true },
  cards: { n: 120, color: [0xffffff, 0xd23a5b, 0x2b2440], size: 0.32, vy: -1.4, sway: 1.5 },
  leaves: { n: 160, color: [0x5cb840, 0x8fd95f], size: 0.25, vy: -1.5, sway: 1.6 },
  bubbles: { n: 260, color: [0xdff8ff, 0xffffff], size: 0.2, vy: 1.8, sway: 0.5 },
  snow: { n: 600, color: [0xffffff], size: 0.18, vy: -2.2, sway: 0.8 },
  stars: { n: 160, color: [0xffe68a, 0xffffff, 0xc8b0ff], size: 0.16, vy: 0.05, sway: 0.2, twinkle: true },
  sand: { n: 400, color: [0xe8c890, 0xd8b070], size: 0.12, vy: -0.3, sway: 0.4, wind: 6 },
  embers: { n: 320, color: [0xff7a1a, 0xffb81a, 0xff4a14], size: 0.18, vy: 2.2, sway: 0.7, twinkle: true },
};

export class Weather {
  constructor(kind, quality) {
    const w = WEATHER[kind];
    this.w = w;
    if (!w) return;
    const n = Math.round(w.n * (quality === 'low' ? 0.4 : quality === 'high' ? 1.3 : 1));
    this.n = n;
    this.box = 36;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    this.seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.box * 2;
      pos[i * 3 + 1] = (Math.random() - 0.5) * this.box;
      pos[i * 3 + 2] = (Math.random() - 0.5) * this.box * 2;
      c.set(w.color[i % w.color.length]);
      col.set([c.r, c.g, c.b], i * 3);
      this.seed[i] = Math.random() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.PointsMaterial({ size: w.size, map: dotTexture(), vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9 });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.origin = new THREE.Vector3();
  }
  update(dt, t, cam) {
    if (!this.w) return;
    const w = this.w;
    const p = this.points.geometry.attributes.position;
    const a = p.array;
    const B = this.box;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const sd = this.seed[i];
      a[k] += (Math.sin(t * 0.9 + sd) * w.sway + (w.wind || 0)) * dt;
      a[k + 1] += w.vy * dt * (0.7 + (sd % 1) * 0.6);
      a[k + 2] += Math.cos(t * 0.7 + sd * 1.3) * w.sway * dt;
      // wrap around the camera
      let x = a[k] - cam.x;
      let y = a[k + 1] - cam.y;
      let z = a[k + 2] - cam.z;
      if (x > B) x -= 2 * B;
      else if (x < -B) x += 2 * B;
      if (y > B / 2) y -= B;
      else if (y < -B / 2) y += B;
      if (z > B) z -= 2 * B;
      else if (z < -B) z += 2 * B;
      a[k] = cam.x + x;
      a[k + 1] = cam.y + y;
      a[k + 2] = cam.z + z;
    }
    p.needsUpdate = true;
    if (w.twinkle) this.mat.opacity = 0.7 + Math.sin(t * 3) * 0.2;
  }
}
