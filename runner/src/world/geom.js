// Geometry helpers: a small triangle builder with world-scaled UVs, track
// ribbons, oriented boxes, toon materials and vertex-coloured props that can
// be merged into a single draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rightX, rightZ } from '../core/rng.js';

// ---------- materials ----------
let gradient = null;
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 170, 235, 255]);
  gradient = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(params = {}) {
  return new THREE.MeshToonMaterial({ gradientMap: gradientMap(), ...params });
}

const matCache = new Map();
export function toonColor(color) {
  const key = `c${color}`;
  if (!matCache.has(key)) {
    const m = toon({ color });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return matCache.get(key);
}

export function vcolMaterial() {
  if (!matCache.has('vcol')) {
    const m = toon({ vertexColors: true });
    m.userData.shared = true;
    matCache.set('vcol', m);
  }
  return matCache.get('vcol');
}

// ---------- triangle builder ----------
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _n = new THREE.Vector3();

export class GeoBuilder {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
  }
  // a, b, c, d counter-clockwise when seen from the front; uvs as [u, v] pairs
  quad(a, b, c, d, ua, ub, uc, ud) {
    _a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    _b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    _n.crossVectors(_a, _b);
    if (_n.lengthSq() < 1e-12) {
      _b.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
      _n.crossVectors(_a, _b);
    }
    _n.normalize();
    for (const [v, uv] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(_n.x, _n.y, _n.z);
      this.uv.push(uv[0], uv[1]);
    }
  }
  get empty() {
    return this.p.length === 0;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}

// Track ribbon along centreline samples {x, y, z, h, w, s}. Top goes into
// `top`, the walls/underside into `side`.
export function ribbon(samples, top, side, { thick = 1.2, tile = 4, caps = true, ox = 0 } = {}) {
  const L = [];
  const R = [];
  for (const s of samples) {
    const rx = rightX(s.h);
    const rz = rightZ(s.h);
    const half = s.w / 2;
    const off = typeof ox === 'function' ? ox(s) : ox;
    const cx = s.x + rx * off;
    const cz = s.z + rz * off;
    L.push([cx - rx * half, s.y, cz - rz * half]);
    R.push([cx + rx * half, s.y, cz + rz * half]);
  }
  const down = (v) => [v[0], v[1] - thick, v[2]];
  for (let i = 0; i < samples.length - 1; i++) {
    const s0 = samples[i];
    const s1 = samples[i + 1];
    const v0 = s0.s / tile;
    const v1 = s1.s / tile;
    const hw0 = s0.w / 2 / tile;
    const hw1 = s1.w / 2 / tile;
    top.quad(L[i], R[i], R[i + 1], L[i + 1], [-hw0, v0], [hw0, v0], [hw1, v1], [-hw1, v1]);
    if (side) {
      const t = thick / tile;
      side.quad(R[i], down(R[i]), down(R[i + 1]), R[i + 1], [v0, 0], [v0, -t], [v1, -t], [v1, 0]);
      side.quad(L[i], L[i + 1], down(L[i + 1]), down(L[i]), [v0, 0], [v1, 0], [v1, -t], [v0, -t]);
      side.quad(down(L[i]), down(L[i + 1]), down(R[i + 1]), down(R[i]), [-hw0, v0], [-hw1, v1], [hw1, v1], [hw0, v0]);
    }
  }
  if (side && caps && samples.length > 1) {
    const n = samples.length - 1;
    const hw = samples[0].w / 2 / tile;
    const t = thick / tile;
    side.quad(L[0], down(L[0]), down(R[0]), R[0], [-hw, 0], [-hw, -t], [hw, -t], [hw, 0]);
    const hw2 = samples[n].w / 2 / tile;
    side.quad(L[n], R[n], down(R[n]), down(L[n]), [-hw2, 0], [hw2, 0], [hw2, -t], [-hw2, -t]);
  }
}

// Oriented box (with optional sloped top) matching a physics 'box' collider.
export function boxQuads(c, top, side, tile = 4) {
  const { hx, hz, top0, top1, bot } = c;
  const w = (lx, y, lz) => [c.x + lx * c.cos + lz * c.sin, y, c.z - lx * c.sin + lz * c.cos];
  const Lt0 = w(hx, top0, -hz);
  const Rt0 = w(-hx, top0, -hz);
  const Rt1 = w(-hx, top1, hz);
  const Lt1 = w(hx, top1, hz);
  const Lb0 = w(hx, bot, -hz);
  const Rb0 = w(-hx, bot, -hz);
  const Rb1 = w(-hx, bot, hz);
  const Lb1 = w(hx, bot, hz);
  const u = hx / tile;
  const v = hz / tile;
  top.quad(Lt0, Rt0, Rt1, Lt1, [u, -v], [-u, -v], [-u, v], [u, v]);
  const s = side || top;
  const y0 = top0 / tile;
  const y1 = top1 / tile;
  const yb = bot / tile;
  s.quad(Rt0, Rb0, Rb1, Rt1, [-v, y0], [-v, yb], [v, yb], [v, y1]);
  s.quad(Lt0, Lt1, Lb1, Lb0, [-v, y0], [v, y1], [v, yb], [-v, yb]);
  s.quad(Lt1, Rt1, Rb1, Lb1, [u, y1], [-u, y1], [-u, yb], [u, yb]);
  s.quad(Lt0, Lb0, Rb0, Rt0, [u, y0], [u, yb], [-u, yb], [-u, y0]);
  s.quad(Lb0, Lb1, Rb1, Rb0, [u, -v], [u, v], [-u, v], [-u, -v]);
}

// Box geometry centred at the origin with world-scaled UVs, for meshes that
// move (platforms, tiles, doors).
export function boxGeometry(w, h, d, tile = 4) {
  const gb = new GeoBuilder();
  const side = new GeoBuilder();
  boxQuads({ x: 0, z: 0, hx: w / 2, hz: d / 2, top0: h / 2, top1: h / 2, bot: -h / 2, cos: 1, sin: 0 }, gb, side, tile);
  const g = mergeGeometries([gb.geometry(), side.geometry()], true);
  return g;
}

// ---------- vertex-coloured props ----------
const _c = new THREE.Color();
export function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  _c.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
// Positioned, painted part: part(geo, color, [x,y,z], [rx,ry,rz], [sx,sy,sz])
export function part(geo, color, pos = [0, 0, 0], rot = [0, 0, 0], scl = [1, 1, 1]) {
  const g = paint(geo.clone(), color);
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _p.set(pos[0], pos[1], pos[2]);
  _s.set(scl[0], scl[1], scl[2]);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export function merge(parts) {
  const g = mergeGeometries(parts.flat().filter(Boolean), false);
  g.computeBoundingSphere();
  return g;
}

export { mergeGeometries };

// ---------- cel-shading outlines (inverted hull) ----------
const outlineMats = new Map();
export function outlineMaterial(width = 0.02, color = 0x2a1f3a) {
  const key = `${width}|${color}`;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n  transformed += normalize(normal) * ${width.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => `outline${width}`;
  m.userData.shared = true;
  outlineMats.set(key, m);
  return m;
}

// Add a dark back-face shell around a mesh (shares its geometry).
export function addOutline(mesh, width = 0.02, color) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(width, color));
  o.castShadow = false;
  o.receiveShadow = false;
  o.userData.outline = true;
  mesh.add(o);
  return o;
}
