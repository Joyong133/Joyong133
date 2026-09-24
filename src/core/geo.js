// Geometry helpers + a builder that merges thousands of static parts into a
// handful of draw calls (one per material), which is what keeps Quest at 72+ fps.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { smoothstep } from './noise.js';

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export function mat4(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

// Box whose UVs are expressed in world meters / tile so textures keep their scale.
export function boxGeo(w, h, d, tile = 1, uOff = 0, vOff = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / tile + uOff, uv.getY(i) * dims[f][1] / tile + vOff);
    }
  }
  return g;
}

export function scaleUV(g, su, sv = su, ou = 0, ov = 0) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + ou, uv.getY(i) * sv + ov);
  return g;
}

// Quad in XY plane facing +Z, uv rect (u0,v0)-(u1,v1)
export function quadGeo(w, h, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
  }
  return g;
}

// Triangular prism (gable end), triangle in XY with base w on y=0 and apex at h, thickness t along Z.
export function gableGeo(w, h, t, tile = 2) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  g.translate(0, 0, -t / 2);
  scaleUV(g, 1 / tile);
  return g;
}

// Arch opening wall: rectangle w x h with a round-top hole (holeW, holeH) at bottom center.
export function archWallGeo(w, h, t, holeW, holeH, tile = 2) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-holeW / 2, 0);
  const rr = holeW / 2;
  const springY = holeH - rr;
  s.lineTo(-holeW / 2, springY);
  s.absarc(0, springY, rr, Math.PI, 0, true);
  s.lineTo(holeW / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h);
  s.lineTo(-w / 2, h);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: 14 });
  g.translate(0, 0, -t / 2);
  scaleUV(g, 1 / tile);
  return g;
}

// Semicircular arch ring (voussoirs) in XY plane.
export function archRingGeo(rIn, rOut, t, segs = 16) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, 0, Math.PI, false);
  s.lineTo(-rIn, 0);
  s.absarc(0, 0, rIn, Math.PI, 0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false, curveSegments: segs });
  g.translate(0, 0, -t / 2);
  scaleUV(g, 0.5);
  return g;
}

// Pyramid / spire with n sides, base radius r, height h (base at y=0).
export function spireGeo(r, h, n = 4) {
  const g = new THREE.ConeGeometry(r, h, n, 1, false, n === 4 ? Math.PI / 4 : 0);
  g.translate(0, h / 2, 0);
  scaleUV(g, r * 2, h / 2);
  return g;
}

function ensureIndexed(g) {
  if (g.index) return g;
  const n = g.attributes.position.count;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const _c = new THREE.Color();

export class GeoBuilder {
  constructor() {
    this.parts = new Map();
    this.tris = 0;
  }

  /**
   * @param key material key
   * @param geo template geometry (not modified)
   * @param matrix Matrix4 world transform
   * @param color THREE.Color | hex | [r,g,b] linear
   * @param opts { ao: bool, aoMin, aoH, ground }
   */
  add(key, geo, matrix, color = 0xffffff, opts = {}) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', geo.attributes.position.clone());
    g.setAttribute('normal', geo.attributes.normal.clone());
    if (geo.attributes.uv) g.setAttribute('uv', geo.attributes.uv.clone());
    else g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (geo.index) g.setIndex(geo.index.clone());
    if (matrix) g.applyMatrix4(matrix);
    ensureIndexed(g);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    if (Array.isArray(color)) _c.setRGB(color[0], color[1], color[2]);
    else _c.set(color);
    const pos = g.attributes.position.array;
    const ao = opts.ao !== false;
    const aoMin = opts.aoMin ?? 0.55;
    const aoH = opts.aoH ?? 1.6;
    const ground = opts.ground ?? 0;
    for (let i = 0; i < n; i++) {
      let k = 1;
      if (ao) k = aoMin + (1 - aoMin) * smoothstep(0, aoH, pos[i * 3 + 1] - ground);
      col[i * 3] = _c.r * k;
      col[i * 3 + 1] = _c.g * k;
      col[i * 3 + 2] = _c.b * k;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    let list = this.parts.get(key);
    if (!list) this.parts.set(key, (list = []));
    list.push(g);
    this.tris += g.index.count / 3;
    return g;
  }

  build(materials, { castShadow = true, receiveShadow = true, name = 'static' } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, list] of this.parts) {
      if (!list.length) continue;
      const material = materials[key];
      if (!material) {
        console.warn('GeoBuilder: missing material', key);
        continue;
      }
      // merge in chunks to stay under index limits comfortably
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}:${key}`;
      mesh.castShadow = castShadow && !material.userData.noShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      for (const g of list) g.dispose();
    }
    this.parts.clear();
    return group;
  }
}
