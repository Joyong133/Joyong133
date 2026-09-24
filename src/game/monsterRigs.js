// Procedural monster models. Each rig is one merged, vertex-coloured body
// plus animated parts (legs, wings, weapon arms) that the monster system
// draws as instanced meshes — a handful of draw calls per monster species.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG } from '../core/noise.js';

// ---------------------------------------------------------------- helpers
export function part(geo, x, y, z, rx, ry, rz, sx, sy, sz, top, bottom = top) {
  const g = geo.clone();
  g.scale(sx, sy, sz);
  g.rotateX(rx);
  g.rotateY(ry);
  g.rotateZ(rz);
  g.translate(x, y, z);
  const ng = g.index ? g.toNonIndexed() : g;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', ng.attributes.position);
  out.setAttribute('normal', ng.attributes.normal);
  const p = out.attributes.position;
  const c = new Float32Array(p.count * 3);
  const ct = new THREE.Color(top), cb = new THREE.Color(bottom);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < p.count; i++) { minY = Math.min(minY, p.getY(i)); maxY = Math.max(maxY, p.getY(i)); }
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const k = maxY > minY ? (p.getY(i) - minY) / (maxY - minY) : 1;
    tmp.copy(cb).lerp(ct, k);
    c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
  }
  out.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return out;
}

export function furry(geo, amount, seed) {
  // subtle lumpy displacement for a less "perfect sphere" look
  const g = geo.clone();
  const p = g.attributes.position;
  const rng = new RNG(seed);
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let k = cache.get(key);
    if (k === undefined) { k = 1 + (rng.next() - 0.5) * amount; cache.set(key, k); }
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

const SPH = new THREE.SphereGeometry(1, 12, 8);
const SPH_S = new THREE.SphereGeometry(1, 6, 4);
const CONE = new THREE.ConeGeometry(1, 1, 6);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const TORUS = new THREE.TorusGeometry(1, 0.25, 5, 12);

// ---------------------------------------------------------------- floor 1 beasts
function boarGeometry() {
  const dark = '#4a3b33', mid = '#6e5a4d', belly = '#8b7565', bristle = '#241c18';
  const parts = [
    part(furry(SPH, 0.08, 1), 0, 0.8, -0.08, 0, 0, 0, 0.46, 0.44, 0.8, dark, belly),
    part(furry(SPH, 0.08, 2), 0, 0.92, 0.3, 0, 0, 0, 0.45, 0.48, 0.52, dark, mid),
    part(furry(SPH, 0.05, 3), 0, 0.74, 0.86, -0.25, 0, 0, 0.3, 0.3, 0.44, dark, mid),
    part(CYL, 0, 0.62, 1.22, Math.PI / 2 - 0.25, 0, 0, 0.14, 0.32, 0.15, mid, mid),
    part(CYL, 0, 0.58, 1.37, Math.PI / 2 - 0.25, 0, 0, 0.1, 0.03, 0.105, '#8a5c58', '#8a5c58'),
    part(SPH_S, 0.16, 0.82, 1.08, 0, 0, 0, 0.035, 0.035, 0.035, '#0c0808'),
    part(SPH_S, -0.16, 0.82, 1.08, 0, 0, 0, 0.035, 0.035, 0.035, '#0c0808'),
    part(CONE, 0.17, 1.0, 0.76, -0.4, 0, -0.5, 0.07, 0.17, 0.05, dark, mid),
    part(CONE, -0.17, 1.0, 0.76, -0.4, 0, 0.5, 0.07, 0.17, 0.05, dark, mid),
    part(CONE, 0.13, 0.64, 1.3, -0.6, 0, -0.45, 0.035, 0.24, 0.035, '#f4ecd8', '#d9ccb0'),
    part(CONE, -0.13, 0.64, 1.3, -0.6, 0, 0.45, 0.035, 0.24, 0.035, '#f4ecd8', '#d9ccb0'),
    part(CYL, 0, 0.82, -0.88, 0.9, 0, 0, 0.025, 0.3, 0.025, dark),
  ];
  for (let i = 0; i < 9; i++) {
    const z = -0.5 + i * 0.13;
    const y = 1.18 + Math.sin((i / 8) * Math.PI) * 0.14;
    parts.push(part(CONE, 0, y, z, -0.5, 0, 0, 0.07, 0.24, 0.05, bristle));
  }
  return mergeGeometries(parts);
}

function boarLeg() {
  return mergeGeometries([
    part(CYL, 0, -0.26, 0, 0, 0, 0, 0.08, 0.52, 0.08, '#4a3b33', '#3a2e28'),
    part(CYL, 0, -0.55, 0.01, 0, 0, 0, 0.06, 0.09, 0.07, '#1a1512'),
  ]);
}

function wolfGeometry() {
  const back = '#50555e', mid = '#7c8088', belly = '#c3bfb7';
  const parts = [
    part(furry(SPH, 0.06, 4), 0, 0.9, -0.1, 0, 0, 0, 0.3, 0.33, 0.72, back, belly),
    part(furry(SPH, 0.07, 5), 0, 0.95, 0.35, 0, 0, 0, 0.33, 0.42, 0.42, back, belly),
    part(CYL, 0, 1.08, 0.62, -0.9, 0, 0, 0.16, 0.36, 0.18, back, mid),
    part(furry(SPH, 0.04, 6), 0, 1.16, 0.82, 0, 0, 0, 0.21, 0.2, 0.26, back, mid),
    part(CONE, 0, 1.1, 1.1, Math.PI / 2, 0, 0, 0.1, 0.34, 0.09, mid, mid),
    part(SPH_S, 0, 1.1, 1.27, 0, 0, 0, 0.035, 0.03, 0.035, '#0a0a0a'),
    part(SPH_S, 0.1, 1.22, 0.99, 0, 0, 0, 0.03, 0.025, 0.02, '#ffcc33'),
    part(SPH_S, -0.1, 1.22, 0.99, 0, 0, 0, 0.03, 0.025, 0.02, '#ffcc33'),
    part(CONE, 0.11, 1.38, 0.76, -0.15, 0, -0.15, 0.065, 0.2, 0.04, back, mid),
    part(CONE, -0.11, 1.38, 0.76, -0.15, 0, 0.15, 0.065, 0.2, 0.04, back, mid),
    part(CONE, 0, 0.8, -0.95, -2.3, 0, 0, 0.11, 0.62, 0.11, mid, back),
  ];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    parts.push(part(CONE, Math.sin(a) * 0.2, 1.05 + Math.cos(a) * 0.12, 0.55, -1.2, 0, a, 0.08, 0.22, 0.06, mid, back));
  }
  return mergeGeometries(parts);
}

function wolfLeg() {
  return mergeGeometries([
    part(CYL, 0, -0.33, 0, 0, 0, 0, 0.06, 0.66, 0.06, '#50555e', '#8a8d93'),
    part(SPH_S, 0, -0.66, 0.03, 0, 0, 0, 0.06, 0.04, 0.08, '#3a3d42'),
  ]);
}

// ---------------------------------------------------------------- kobolds (labyrinth)
function koboldBody(c) {
  const { fur, belly, armor, trim, eye } = c;
  const parts = [
    part(furry(SPH, 0.05, 11), 0, 0.8, 0, 0, 0, 0, 0.22, 0.16, 0.18, fur, belly),
    part(furry(SPH, 0.06, 12), 0, 1.08, 0.02, 0.12, 0, 0, 0.3, 0.34, 0.24, fur, belly),
    part(CYL, 0, 1.08, 0.04, 0.12, 0, 0, 0.315, 0.32, 0.255, armor, trim),
    part(TORUS, 0, 0.9, 0.02, Math.PI / 2, 0, 0, 0.25, 0.22, 0.4, trim),
    part(SPH, 0.29, 1.3, 0, 0, 0, 0, 0.13, 0.1, 0.13, armor, trim),
    part(SPH, -0.29, 1.3, 0, 0, 0, 0, 0.13, 0.1, 0.13, armor, trim),
    part(CYL, 0, 1.38, 0.05, 0.3, 0, 0, 0.1, 0.16, 0.1, fur),
    part(furry(SPH, 0.04, 13), 0, 1.53, 0.08, 0, 0, 0, 0.18, 0.17, 0.2, fur, belly),
    part(CYL, 0, 1.48, 0.3, Math.PI / 2 - 0.12, 0, 0, 0.085, 0.28, 0.075, fur, belly),
    part(SPH_S, 0, 1.51, 0.45, 0, 0, 0, 0.04, 0.035, 0.035, '#120c0a'),
    part(SPH_S, 0.08, 1.59, 0.24, 0, 0, 0, 0.032, 0.026, 0.02, eye),
    part(SPH_S, -0.08, 1.59, 0.24, 0, 0, 0, 0.032, 0.026, 0.02, eye),
    part(CONE, 0.06, 1.44, 0.4, Math.PI, 0, 0, 0.012, 0.05, 0.012, '#f0e8d8'),
    part(CONE, -0.06, 1.44, 0.4, Math.PI, 0, 0, 0.012, 0.05, 0.012, '#f0e8d8'),
    part(CONE, 0.11, 1.72, 0.0, -0.2, 0, -0.35, 0.05, 0.18, 0.035, fur, belly),
    part(CONE, -0.11, 1.72, 0.0, -0.2, 0, 0.35, 0.05, 0.18, 0.035, fur, belly),
    part(CONE, 0, 0.78, -0.3, -2.2, 0, 0, 0.06, 0.5, 0.06, belly, fur),
    // shield arm: upper arm + forearm + round buckler
    part(CYL, -0.34, 1.13, 0.06, 0.5, 0, 0.15, 0.06, 0.34, 0.06, fur),
    part(CYL, -0.37, 0.98, 0.24, 1.3, 0, 0, 0.055, 0.28, 0.055, fur),
    part(CYL, -0.39, 1.0, 0.38, Math.PI / 2, 0, 0, 0.2, 0.04, 0.2, c.shield, trim),
    part(SPH_S, -0.39, 1.0, 0.41, 0, 0, 0, 0.05, 0.05, 0.03, trim),
  ];
  if (c.crown) {
    parts.push(part(CYL, 0, 1.7, 0.06, 0, 0, 0, 0.17, 0.08, 0.17, c.crown, c.crown));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      parts.push(part(CONE, Math.sin(a) * 0.15, 1.8, 0.06 + Math.cos(a) * 0.15, 0, 0, 0, 0.03, 0.12, 0.03, c.crown));
    }
    parts.push(part(CONE, 0, 1.12, -0.18, 0.15, 0, 0, 0.36, 0.9, 0.12, c.cape, c.cape));
  }
  return mergeGeometries(parts);
}

function koboldLeg(fur, boot) {
  return mergeGeometries([
    part(CYL, 0, -0.17, 0, 0, 0, 0, 0.085, 0.36, 0.085, fur),
    part(CYL, 0, -0.5, -0.03, -0.12, 0, 0, 0.06, 0.32, 0.06, fur),
    part(SPH_S, 0, -0.72, 0.06, 0, 0, 0, 0.08, 0.05, 0.15, boot),
  ]);
}

// Weapon arms hang along -Y from the shoulder pivot; the weapon continues
// past the hand, so swinging the part swings the whole weapon.
function armWith(fur, weaponParts) {
  return mergeGeometries([
    part(CYL, 0, -0.2, 0, 0, 0, 0, 0.065, 0.42, 0.065, fur),
    part(SPH_S, 0, -0.43, 0, 0, 0, 0, 0.065, 0.065, 0.065, fur),
    ...weaponParts,
  ]);
}

function axeParts(size = 1, steel = '#9aa0a8', wood = '#5a3a22') {
  return [
    part(CYL, 0, -0.8 * size, 0, 0, 0, 0, 0.026, 0.8 * size, 0.026, wood),
    part(BOX, 0, -1.08 * size, 0.12 * size, 0, 0, 0, 0.03, 0.26 * size, 0.24 * size, steel, '#c8ccd2'),
    part(BOX, 0, -1.08 * size, -0.06 * size, 0, 0, 0, 0.03, 0.12 * size, 0.1 * size, steel),
  ];
}

function talwarParts() {
  const steel = '#c9ced8', edge = '#eef2f8';
  const out = [part(CYL, 0, -0.52, 0, 0, 0, 0, 0.022, 0.18, 0.022, '#3a2618'), part(BOX, 0, -0.62, 0, 0, 0, 0, 0.14, 0.03, 0.05, '#c8a040')];
  // curved blade: a few segments bending forward
  for (let i = 0; i < 5; i++) {
    const y = -0.72 - i * 0.2;
    const z = 0.02 + i * i * 0.018;
    out.push(part(BOX, 0, y, z, -0.08 - i * 0.05, 0, 0, 0.018, 0.22, 0.09 - i * 0.008, steel, edge));
  }
  return out;
}

// ---------------------------------------------------------------- floor 2
function bullGeometry() {
  const dark = '#33261e', mid = '#57412f', belly = '#7a6250', horn = '#ece4d2';
  const parts = [
    part(furry(SPH, 0.07, 21), 0, 1.02, -0.2, 0, 0, 0, 0.55, 0.52, 0.95, dark, belly),
    part(furry(SPH, 0.08, 22), 0, 1.24, 0.36, 0, 0, 0, 0.58, 0.66, 0.62, dark, mid),
    part(furry(SPH, 0.05, 23), 0, 1.02, 1.0, -0.3, 0, 0, 0.3, 0.32, 0.42, dark, mid),
    part(CYL, 0, 0.88, 1.3, Math.PI / 2 - 0.35, 0, 0, 0.19, 0.3, 0.17, '#6a5040', '#6a5040'),
    part(CYL, 0, 0.83, 1.44, Math.PI / 2 - 0.35, 0, 0, 0.15, 0.02, 0.13, '#3a2a24'),
    part(TORUS, 0, 0.8, 1.47, 0, 0, 0, 0.07, 0.07, 0.07, '#d8b040'),
    part(SPH_S, 0.2, 1.12, 1.16, 0, 0, 0, 0.04, 0.04, 0.04, '#220808'),
    part(SPH_S, -0.2, 1.12, 1.16, 0, 0, 0, 0.04, 0.04, 0.04, '#220808'),
    // horns sweep out then forward
    part(CYL, 0.3, 1.26, 0.95, 0, 0, -1.2, 0.07, 0.34, 0.07, horn, '#bfb49c'),
    part(CYL, -0.3, 1.26, 0.95, 0, 0, 1.2, 0.07, 0.34, 0.07, horn, '#bfb49c'),
    part(CONE, 0.52, 1.42, 1.02, -0.5, 0, -0.35, 0.06, 0.3, 0.06, '#fffaf0', horn),
    part(CONE, -0.52, 1.42, 1.02, -0.5, 0, 0.35, 0.06, 0.3, 0.06, '#fffaf0', horn),
    part(CONE, 0.28, 1.22, 0.86, -0.3, 0, -1.2, 0.07, 0.14, 0.04, dark),
    part(CONE, -0.28, 1.22, 0.86, -0.3, 0, 1.2, 0.07, 0.14, 0.04, dark),
    part(CYL, 0, 1.0, -1.1, 0.5, 0, 0, 0.03, 0.55, 0.03, dark),
    part(SPH_S, 0, 0.74, -1.32, 0, 0, 0, 0.07, 0.12, 0.07, '#1a1410'),
  ];
  // shaggy mane over the hump
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(part(CONE, Math.sin(a) * 0.45, 1.3 + Math.cos(a) * 0.35, 0.55, -1.25, 0, a, 0.14, 0.4, 0.1, mid, dark));
  }
  return mergeGeometries(parts);
}

function bullLeg() {
  return mergeGeometries([
    part(CYL, 0, -0.34, 0, 0, 0, 0, 0.11, 0.68, 0.11, '#33261e', '#2a1f18'),
    part(CYL, 0, -0.72, 0.01, 0, 0, 0, 0.09, 0.1, 0.1, '#15110e'),
  ]);
}

function waspGeometry() {
  const dark = '#2a1e0e', yel = '#f0b820', blk = '#1c160c';
  const parts = [
    part(furry(SPH, 0.05, 31), 0, 0, 0.1, 0, 0, 0, 0.17, 0.16, 0.2, '#5a4218', dark),
    part(SPH, 0, 0.02, 0.34, 0, 0, 0, 0.12, 0.12, 0.11, dark),
    part(SPH, 0.08, 0.05, 0.4, 0, 0, 0, 0.06, 0.08, 0.05, '#8a1c10', '#3a0808'),
    part(SPH, -0.08, 0.05, 0.4, 0, 0, 0, 0.06, 0.08, 0.05, '#8a1c10', '#3a0808'),
    part(CONE, 0.04, -0.06, 0.44, 2.4, 0, 0, 0.015, 0.08, 0.015, blk),
    part(CONE, -0.04, -0.06, 0.44, 2.4, 0, 0, 0.015, 0.08, 0.015, blk),
    part(CYL, 0.05, 0.16, 0.42, 0.6, 0, -0.4, 0.008, 0.22, 0.008, blk),
    part(CYL, -0.05, 0.16, 0.42, 0.6, 0, 0.4, 0.008, 0.22, 0.008, blk),
    part(SPH, 0, -0.05, -0.16, -0.2, 0, 0, 0.17, 0.16, 0.18, yel, '#c08a10'),
    part(TORUS, 0, -0.05, -0.16, 0.2, 0, 0, 0.17, 0.16, 0.25, blk),
    part(SPH, 0, -0.1, -0.34, -0.25, 0, 0, 0.155, 0.15, 0.16, yel, '#c08a10'),
    part(TORUS, 0, -0.1, -0.34, 0.25, 0, 0, 0.15, 0.145, 0.22, blk),
    part(SPH, 0, -0.15, -0.5, -0.3, 0, 0, 0.11, 0.1, 0.12, yel, '#c08a10'),
    part(CONE, 0, -0.19, -0.66, -Math.PI / 2 - 0.3, 0, 0, 0.03, 0.18, 0.03, blk),
  ];
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      parts.push(part(CYL, s * 0.12, -0.14, 0.18 - k * 0.09, 0.3, 0, s * 0.5, 0.012, 0.26, 0.012, blk));
    }
  }
  return mergeGeometries(parts);
}

function waspWing() {
  // points along +X from its root; mirrored for the left wing
  return mergeGeometries([part(SPH, 0.3, 0, -0.02, 0, 0, 0, 0.32, 0.008, 0.11, '#dcebf5', '#b8d0e0')]);
}

function taurusBody() {
  const fur = '#4a3326', dark = '#2e2019', belly = '#7a5a44', horn = '#efe6d2', cloth = '#6a1c1c', metal = '#8a8070';
  const parts = [
    part(furry(SPH, 0.05, 41), 0, 0.82, 0, 0, 0, 0, 0.3, 0.2, 0.24, fur, belly),
    part(furry(SPH, 0.06, 42), 0, 1.18, 0.02, 0.1, 0, 0, 0.42, 0.42, 0.3, fur, belly),
    part(furry(SPH, 0.05, 43), 0.2, 1.24, 0.12, 0, 0, 0, 0.18, 0.16, 0.14, belly, fur),
    part(furry(SPH, 0.05, 44), -0.2, 1.24, 0.12, 0, 0, 0, 0.18, 0.16, 0.14, belly, fur),
    part(SPH, 0.4, 1.45, -0.02, 0, 0, 0, 0.18, 0.15, 0.18, fur, dark),
    part(SPH, -0.4, 1.45, -0.02, 0, 0, 0, 0.18, 0.15, 0.18, fur, dark),
    part(CYL, 0, 0.72, 0.02, 0, 0, 0, 0.3, 0.14, 0.24, '#4a3a2a', '#3a2a1e'),
    part(BOX, 0, 0.5, 0.2, 0.08, 0, 0, 0.3, 0.42, 0.04, cloth, '#4a1010'),
    part(BOX, 0, 0.5, -0.18, -0.08, 0, 0, 0.3, 0.42, 0.04, cloth, '#4a1010'),
    part(TORUS, 0.4, 1.45, -0.02, Math.PI / 2, 0, 0, 0.2, 0.2, 0.3, metal),
    part(CYL, 0, 1.58, 0.06, 0.25, 0, 0, 0.16, 0.2, 0.15, fur),
    // bull head
    part(furry(SPH, 0.05, 45), 0, 1.74, 0.12, 0, 0, 0, 0.2, 0.2, 0.22, fur, dark),
    part(CYL, 0, 1.66, 0.34, Math.PI / 2 - 0.35, 0, 0, 0.13, 0.22, 0.11, '#6a4a38', '#5a3e2e'),
    part(TORUS, 0, 1.58, 0.44, 0, 0, 0, 0.06, 0.06, 0.06, '#e0b848'),
    part(SPH_S, 0.11, 1.8, 0.28, 0, 0, 0, 0.035, 0.03, 0.03, '#ff5020'),
    part(SPH_S, -0.11, 1.8, 0.28, 0, 0, 0, 0.035, 0.03, 0.03, '#ff5020'),
    part(CYL, 0.2, 1.9, 0.1, 0, 0, -1.1, 0.05, 0.26, 0.05, horn, '#c8bca4'),
    part(CYL, -0.2, 1.9, 0.1, 0, 0, 1.1, 0.05, 0.26, 0.05, horn, '#c8bca4'),
    part(CONE, 0.36, 2.06, 0.12, 0.15, 0, -0.25, 0.045, 0.26, 0.045, '#fffaf0', horn),
    part(CONE, -0.36, 2.06, 0.12, 0.15, 0, 0.25, 0.045, 0.26, 0.045, '#fffaf0', horn),
    part(CONE, 0.18, 1.82, 0.0, 0, 0, -1.3, 0.05, 0.12, 0.03, dark),
    part(CONE, -0.18, 1.82, 0.0, 0, 0, 1.3, 0.05, 0.12, 0.03, dark),
    // off arm resting fist
    part(CYL, -0.5, 1.2, 0.04, 0.2, 0, 0.12, 0.09, 0.42, 0.09, fur),
    part(CYL, -0.54, 0.9, 0.14, 0.7, 0, 0, 0.08, 0.34, 0.08, fur, belly),
    part(SPH, -0.55, 0.76, 0.26, 0, 0, 0, 0.09, 0.09, 0.09, dark),
    part(CONE, 0, 0.82, -0.3, -2.5, 0, 0, 0.05, 0.5, 0.05, fur),
    part(SPH_S, 0, 0.58, -0.52, 0, 0, 0, 0.06, 0.1, 0.06, dark),
  ];
  return mergeGeometries(parts);
}

function taurusLeg() {
  return mergeGeometries([
    part(furry(CYL, 0.05, 46), 0, -0.2, 0, 0, 0, 0, 0.13, 0.42, 0.13, '#4a3326', '#3a281e'),
    part(CYL, 0, -0.55, -0.02, -0.1, 0, 0, 0.1, 0.34, 0.1, '#3a281e'),
    part(CYL, 0, -0.76, 0.03, 0, 0, 0, 0.1, 0.1, 0.13, '#15100c'),
  ]);
}

function hammerArm() {
  const fur = '#4a3326';
  return mergeGeometries([
    part(CYL, 0, -0.22, 0, 0, 0, 0, 0.095, 0.46, 0.095, fur),
    part(SPH, 0, -0.48, 0, 0, 0, 0, 0.1, 0.1, 0.1, '#2e2019'),
    part(CYL, 0, -0.95, 0, 0, 0, 0, 0.035, 1.05, 0.035, '#4a3020'),
    part(CYL, 0, -1.5, 0, Math.PI / 2, 0, 0, 0.2, 0.46, 0.2, '#5a5850', '#8a8a84'),
    part(CYL, 0, -1.5, 0.24, Math.PI / 2, 0, 0, 0.22, 0.05, 0.22, '#c8a040'),
    part(CYL, 0, -1.5, -0.24, Math.PI / 2, 0, 0, 0.22, 0.05, 0.22, '#c8a040'),
  ]);
}

// ---------------------------------------------------------------- rig table
const LEG4 = [0, Math.PI, Math.PI, 0];
function quadLegs(key, hips) {
  return hips.map((p, i) => ({ key, pivot: p, kind: 'leg', phase: LEG4[i] }));
}

export const RIGS = {
  boar: {
    body: boarGeometry,
    geos: { leg: boarLeg },
    parts: quadLegs('leg', [[0.25, 0.6, 0.45], [-0.25, 0.6, 0.45], [0.25, 0.6, -0.5], [-0.25, 0.6, -0.5]]),
  },
  wolf: {
    body: wolfGeometry,
    geos: { leg: wolfLeg },
    parts: quadLegs('leg', [[0.17, 0.72, 0.42], [-0.17, 0.72, 0.42], [0.17, 0.72, -0.5], [-0.17, 0.72, -0.5]]),
  },
  bull: {
    body: bullGeometry,
    geos: { leg: bullLeg },
    parts: quadLegs('leg', [[0.3, 0.78, 0.5], [-0.3, 0.78, 0.5], [0.3, 0.78, -0.6], [-0.3, 0.78, -0.6]]),
  },
  kobold: {
    body: () => koboldBody({ fur: '#7a5646', belly: '#a88a70', armor: '#4a4f58', trim: '#7a6a4a', eye: '#ffcc33', shield: '#6a4a2a' }),
    geos: { leg: () => koboldLeg('#7a5646', '#3a2a1e'), arm: () => armWith('#7a5646', axeParts(1)) },
    parts: [
      { key: 'leg', pivot: [0.13, 0.74, 0], kind: 'leg', phase: 0 },
      { key: 'leg', pivot: [-0.13, 0.74, 0], kind: 'leg', phase: Math.PI },
      { key: 'arm', pivot: [0.34, 1.28, 0.02], kind: 'arm', tip: [0, -1.1, 0.1] },
    ],
  },
  koboldLord: {
    body: () => koboldBody({ fur: '#8a3e2a', belly: '#c09070', armor: '#6a5a3a', trim: '#d0a848', eye: '#ff3a20', shield: '#5a2a1a', crown: '#d8b040', cape: '#5a1830' }),
    geos: {
      leg: () => koboldLeg('#8a3e2a', '#2a1a12'),
      axe: () => armWith('#8a3e2a', axeParts(1.25, '#8a9098', '#4a2a18')),
      talwar: () => armWith('#8a3e2a', talwarParts()),
    },
    parts: [
      { key: 'leg', pivot: [0.13, 0.74, 0], kind: 'leg', phase: 0 },
      { key: 'leg', pivot: [-0.13, 0.74, 0], kind: 'leg', phase: Math.PI },
      { key: 'axe', pivot: [0.34, 1.28, 0.02], kind: 'arm', tip: [0, -1.35, 0.14], show: (m) => !m.phase2 },
      { key: 'talwar', pivot: [0.34, 1.28, 0.02], kind: 'arm', tip: [0, -1.55, 0.3], show: (m) => !!m.phase2 },
    ],
  },
  taurus: {
    body: taurusBody,
    geos: { leg: taurusLeg, arm: hammerArm },
    parts: [
      { key: 'leg', pivot: [0.18, 0.8, 0], kind: 'leg', phase: 0 },
      { key: 'leg', pivot: [-0.18, 0.8, 0], kind: 'leg', phase: Math.PI },
      { key: 'arm', pivot: [0.5, 1.45, 0.02], kind: 'arm', tip: [0, -1.5, 0] },
    ],
  },
  wasp: {
    body: waspGeometry,
    geos: { wing: waspWing },
    parts: [
      { key: 'wing', pivot: [0.08, 0.13, 0.12], kind: 'wing', side: 1 },
      { key: 'wing', pivot: [-0.08, 0.13, 0.12], kind: 'wing', side: -1 },
    ],
  },
};

const cache = new Map();
export function rigGeometry(name) {
  if (cache.has(name)) return cache.get(name);
  const r = RIGS[name];
  const out = { body: r.body(), geos: {} };
  for (const [k, fn] of Object.entries(r.geos)) out.geos[k] = fn();
  cache.set(name, out);
  return out;
}
