// 부유성 제2층 — "탁상 고원". A high tableland of flat-topped mesas under a
// brighter midday sky. The main town, 메사리아, is built inside a hollow
// crater-mesa you enter through a gated passage; outside: a ranch, a
// waterfall lake, the Taurus General's canyon arena and the next labyrinth.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo, scaleUV, archRingGeo, spireGeo, quadGeo } from '../core/geo.js';
import { fbm, smoothstep, lerp, RNG } from '../core/noise.js';
import { WORLD_R } from '../world/layout.js';
import { bakeSky } from '../world/sky.js';
import { buildTerrain, buildEdgeCliff, buildHeightTexture } from '../world/terrain.js';
import { Colliders } from '../world/collision.js';
import { buildCastle } from '../world/castle.js';
import { buildVegetation } from '../world/vegetation.js';
import { waterMaterial, fallMaterial } from '../world/water.js';
import { GlowField } from '../world/glow.js';
import { gateMaterials, makeGate, updateGateMaterials } from '../world/gate.js';
import { templates, addHouse, addLamp, addBench, addStall, PAL, takeChimneys, takeLamps, lightPools } from '../world/town.js';
import { Ambience } from '../world/ambience.js';
import { pierSpec, pierHeight, pierPoint, buildPier } from './pier.js';
import { part } from '../game/monsterRigs.js';

export const SUN2 = new THREE.Vector3(-0.55, 0.78, 0.35).normalize();
export const CR = { inner: 78, outer: 112, h: 36, gapHalf: 7.4 };
export const LAKE2 = { x: 190, z: 170, r: 30, level: -1.0 };
export const CAMP2 = new THREE.Vector3(-15, 0, 235);
export const ARENA2 = new THREE.Vector3(-190, 0, 300);
export const RANCH = { x: -72, z: 138, hw: 20, hd: 14 };
export const TOWER2 = { x: 175, z: -385, r: 30 };

export const MESAS = [
  { x: -262, z: 300, r: 40, h: 62 },
  { x: -122, z: 342, r: 32, h: 54 },
  { x: 232, z: 204, r: 26, h: 46, fall: true },
  { x: -190, z: 92, r: 34, h: 46 },
  { x: -150, z: -20, r: 26, h: 38 },
  { x: -235, z: -135, r: 44, h: 70 },
  { x: 60, z: -205, r: 36, h: 56 },
  { x: -60, z: -265, r: 30, h: 44 },
  { x: 285, z: -80, r: 34, h: 52 },
  { x: 305, z: 335, r: 40, h: 60 },
  { x: 105, z: 335, r: 26, h: 36 },
  { x: -335, z: 160, r: 30, h: 50 },
  { x: 345, z: 110, r: 28, h: 44 },
  { x: -70, z: 410, r: 34, h: 55 },
  { x: -305, z: -300, r: 40, h: 65 },
  { x: 95, z: -75, r: 18, h: 30 },
];

export const ROADS2 = [
  [[0, 80], [0, 150], [-10, 230], [-60, 280], [-110, 294], [-165, 296]],
  [[0, 150], [60, 158], [120, 156], [158, 152]],
  [[0, 125], [70, 118], [140, 62], [188, -40], [200, -170], [186, -300], [172, -348]],
];
const SEGS2 = [];
for (const road of ROADS2) for (let i = 0; i < road.length - 1; i++) SEGS2.push([road[i][0], road[i][1], road[i + 1][0], road[i + 1][1]]);

export function roadDist2(x, z) {
  let best = 1e9;
  for (const s of SEGS2) {
    const dx = s[2] - s[0], dz = s[3] - s[1];
    const px = x - s[0], pz = z - s[1];
    let t = (px * dx + pz * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - dx * t, ez = pz - dz * t;
    best = Math.min(best, ex * ex + ez * ez);
  }
  return Math.sqrt(best);
}

// gate arrivals (used by the teleport-gate menu before floor 2 is even built)
export const F2_GATES = [
  { id: 'f2town', label: '메사리아', floor: '제2층', pos: new THREE.Vector3(0, 0, 5), yaw: Math.PI },
  { id: 'f2camp', label: '바람골 야영지', floor: '제2층', pos: new THREE.Vector3(CAMP2.x + 9 - 4.5, 0, CAMP2.z), yaw: Math.PI / 2 },
];
export const F2_ARRIVE = { pos: new THREE.Vector3(0, 0, -9), yaw: Math.PI };

function hills2(x, z, oct) {
  const n = fbm(x * 0.006 + 71.3, z * 0.006 - 5.1, oct, 11);
  let v = (n - 0.42) * 24;
  if (oct > 3) v += (fbm(x * 0.025, z * 0.025, 3, 19) - 0.5) * 2.5;
  return Math.max(v, -2) + 2;
}

function flatSpot(x, z, p, r0, r1, h, target) {
  const d = Math.hypot(x - p.x, z - p.z);
  return lerp(target, h, smoothstep(r0, r1, d));
}

export function heightF2(x, z) {
  const r = Math.hypot(x, z);
  if (r < CR.outer + 2) return 0;
  const out = smoothstep(CR.outer + 2, CR.outer + 50, r);
  const rim = smoothstep(380, 480, r);
  const rimH = rim > 0 ? rim * (22 + fbm(x * 0.01, z * 0.01, 4, 91) * 60) : 0;
  let h = hills2(x, z, 5) * out + rimH;
  const dr = roadDist2(x, z);
  if (dr < 14) {
    const target = Math.max(hills2(x, z, 2) * out * 0.9 + rimH, 0.1);
    h = lerp(target, h, smoothstep(3.5, 13, dr));
  }
  const dl = Math.hypot(x - LAKE2.x, z - LAKE2.z);
  if (dl < LAKE2.r * 1.8) {
    const bowl = LAKE2.level - 3.5 * (1 - smoothstep(0, LAKE2.r, dl));
    h = lerp(bowl, h, smoothstep(LAKE2.r * 0.75, LAKE2.r * 1.8, dl));
  }
  h = flatSpot(x, z, CAMP2, 16, 34, h, 2.5);
  h = flatSpot(x, z, ARENA2, 28, 46, h, 2);
  h = flatSpot(x, z, RANCH, 24, 40, h, 1.2);
  h = flatSpot(x, z, TOWER2, TOWER2.r + 6, TOWER2.r + 40, h, 5);
  return h;
}

const toTownDir = new THREE.Vector2(-35, -20).normalize();
const PIER2 = pierSpec(LAKE2, toTownDir, 34, 19, -0.25);

export function walkF2(x, z) {
  const h = heightF2(x, z);
  const d = pierHeight(PIER2, x, z);
  return d === null ? h : Math.max(h, d);
}

// sandstone strata: cream, rust, ochre and deep red layers
const BANDS = ['#e8cfa4', '#c2703e', '#d9a066', '#9a4a2c', '#f0dcb8', '#b8683c', '#d8b080', '#8a4028', '#e0b88a'];
function bandColor(y, a, seed, out) {
  const t = y / 2.6 + Math.sin(a * 2 + seed) * 0.5 + seed;
  const k = Math.floor(t);
  const f = t - k;
  const c0 = BANDS[((k % BANDS.length) + BANDS.length) % BANDS.length];
  const c1 = BANDS[(((k + 1) % BANDS.length) + BANDS.length) % BANDS.length];
  out.set(c0).lerp(_bc.set(c1), smoothstep(0.75, 1, f));
  const v = 0.85 + 0.25 * fbm(a * 9 + seed, y * 0.25, 2, seed | 0);
  return out.multiplyScalar(v * 1.15);
}
const _bc = new THREE.Color();

// A flat-topped rock pillar with sediment bands and a grassy cap.
function mesaGeometry(M, seed) {
  const rng = new RNG(seed);
  const SEG = Math.max(36, Math.round(M.r * 2));
  // talus skirt, then sheer walls broken by two eroded ledges, then the rim
  const prof = [
    [1.42, -6], [1.3, 0.02], [1.14, 0.12], [1.06, 0.2], [1.04, 0.24], [1.0, 0.27], [0.98, 0.46], [0.94, 0.5], [0.925, 0.53],
    [0.91, 0.74], [0.88, 0.77], [0.87, 0.8], [0.86, 0.97], [0.83, 1.0],
  ];
  const lobes = rng.int(2, 4);
  const lph = rng.range(0, 6.28);
  const noiseR = [];
  for (let s = 0; s <= SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    const big = Math.sin(a * lobes + lph) * 0.12;
    noiseR.push(1 + big + (fbm(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2, 4, seed) - 0.5) * 0.42 + (rng.next() - 0.5) * 0.05);
  }
  noiseR[SEG] = noiseR[0];
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let j = 0; j < prof.length; j++) {
    const [kr, ky] = prof[j];
    const y = ky < 0 ? ky : ky * M.h;
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const rr = M.r * kr * noiseR[s] * (1 + (j > 0 && j < prof.length - 1 ? (fbm(a * 6, j * 1.3, 2, seed + 3) - 0.5) * 0.12 : 0));
      pos.push(M.x + Math.sin(a) * rr, M.base + y, M.z + Math.cos(a) * rr);
      uv.push((a * M.r) / 7, y / 7);
      bandColor(y, a, seed * 0.37, c);
      if (j <= 2) c.lerp(_bc.set('#a88a64'), j === 0 ? 0.6 : 0.35); // dusty scree
      if (j === prof.length - 1) c.set('#6a7a3a');
      col.push(c.r, c.g, c.b);
    }
  }
  const row = SEG + 1;
  for (let j = 0; j < prof.length - 1; j++) {
    for (let s = 0; s < SEG; s++) {
      const a = j * row + s, b = a + 1, cc = a + row, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const walls = new THREE.BufferGeometry();
  walls.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  walls.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  walls.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  walls.setIndex(idx);
  walls.computeVertexNormals();
  // grassy cap
  const cpos = [M.x, M.base + M.h + 0.6, M.z], ccol = [0.3, 0.42, 0.14], cidx = [];
  const top = (prof.length - 1) * row;
  for (let s = 0; s <= SEG; s++) {
    cpos.push(pos[(top + s) * 3], pos[(top + s) * 3 + 1], pos[(top + s) * 3 + 2]);
    const g = 0.8 + rng.next() * 0.2;
    ccol.push(0.34 * g, 0.44 * g, 0.16 * g);
  }
  for (let s = 0; s < SEG; s++) cidx.push(0, s + 1, s + 2);
  const cap = new THREE.BufferGeometry();
  cap.setAttribute('position', new THREE.Float32BufferAttribute(cpos, 3));
  cap.setAttribute('color', new THREE.Float32BufferAttribute(ccol, 3));
  cap.setIndex(cidx);
  cap.computeVertexNormals();
  return { walls, cap };
}

const craterNoise = (a) => (fbm(Math.cos(a) * 3, Math.sin(a) * 3, 3, 5) - 0.5) * 3;
const INNER_PROF = [[CR.inner - 1.2, -1], [CR.inner + 0.2, 8], [CR.inner + 0.6, 15], [CR.inner + 2.2, 16], [CR.inner + 2.6, 26], [CR.inner + 3.6, 27], [CR.inner + 4, CR.h - 1.5]];
// radius of the inner crater wall at angle a and height y
function craterInnerR(a, y) {
  const n = craterNoise(a) * 0.35;
  for (let j = 0; j < INNER_PROF.length - 1; j++) {
    const [r0, y0] = INNER_PROF[j], [r1, y1] = INNER_PROF[j + 1];
    if (y <= y1) return r0 + (r1 - r0) * THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1) + n;
  }
  return INNER_PROF[INNER_PROF.length - 1][0] + n;
}

// The hollow crater-mesa around Mesaria, open at the south passage.
function craterGeometry() {
  const gapA = Math.asin(CR.gapHalf / CR.inner) + 0.01;
  const SEG = 220;
  const prof = [
    ...INNER_PROF, [CR.inner + 6, CR.h],
    [CR.outer - 5, CR.h + 1], [CR.outer - 2, CR.h - 2], [CR.outer - 1, 24], [CR.outer + 0.5, 23], [CR.outer + 1.2, 12], [CR.outer + 3, 5], [CR.outer + 7, -1],
  ];
  const TOP0 = INNER_PROF.length, TOP1 = INNER_PROF.length + 1;
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let s = 0; s <= SEG; s++) {
    const a = gapA + (s / SEG) * (Math.PI * 2 - gapA * 2);
    const n = craterNoise(a);
    for (let j = 0; j < prof.length; j++) {
      const [r0, y] = prof[j];
      const top = j === TOP0 || j === TOP1;
      const rr = r0 + (top ? 0 : n * (j < TOP0 ? 0.35 : 1.2));
      const yy = y + (top ? n * 0.4 : 0);
      pos.push(Math.sin(a) * rr, yy, Math.cos(a) * rr);
      uv.push((a * rr) / 7, (j <= TOP0 ? yy : 80 - yy) / 7);
      if (top) c.setRGB(0.3, 0.4, 0.15);
      else bandColor(yy, a, 1.7, c);
      if (j === prof.length - 1) c.lerp(_bc.set('#a88a64'), 0.5);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = prof.length;
  for (let s = 0; s < SEG; s++) {
    for (let j = 0; j < row - 1; j++) {
      const a = s * row + j, b = a + 1, cc = a + row, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  // cut faces at both ends of the gap (both windings; cheap and orientation-proof)
  const base = pos.length / 3;
  for (const s of [0, SEG]) {
    const cx = pos.slice(s * row * 3, s * row * 3 + row * 3);
    let mx = 0, my = 0, mz = 0;
    for (let j = 0; j < row; j++) { mx += cx[j * 3]; my += cx[j * 3 + 1]; mz += cx[j * 3 + 2]; }
    const ci = pos.length / 3;
    pos.push(mx / row, my / row, mz / row);
    uv.push(0, 0);
    bandColor(my / row, 0, 2.1, c);
    col.push(c.r, c.g, c.b);
    for (let j = 0; j < row - 1; j++) {
      const a = s * row + j, b = a + 1;
      idx.push(ci, a, b, ci, b, a);
    }
  }
  void base;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PAL2 = {
  plaster: ['#efe0c4', '#e8d0a8', '#f3e6d0', '#e0c49a', '#f0d8b8', '#e8dcc8'],
  stone: ['#d8c0a0', '#c8a888', '#e0caa8', '#cdb494'],
  roof: ['#b8583a', '#c8683a', '#a8482a', '#d07a48', '#9a4a30', '#b86a44'],
};

function buildMesaria(b, glows, colliders, rng, m) {
  templates();
  const col = (h) => new THREE.Color(h);
  const treeSpots = [];
  const avenues = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const onAvenue = (x, z, hw) => avenues.some((g) => {
    const gx = Math.sin(g), gz = Math.cos(g);
    return x * gx + z * gz > 0 && Math.abs(x * gz - z * gx) < 5.5 + hw;
  });
  // plaza paving and planters
  for (const [r0, r1] of [[9.4, 10.2], [23.6, 24.4]]) {
    const ring = new THREE.RingGeometry(r0, r1, 72, 1);
    ring.rotateX(-Math.PI / 2);
    scaleUV(ring, 10, 10);
    b.add('stone', ring, mat4(0, 0.03, 0), col('#e0c8a0'), { ao: false });
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const x = Math.sin(a) * 20, z = Math.cos(a) * 20;
    addLamp(b, glows, x, z, a + Math.PI);
    colliders.addCircle(x, z, 0.25);
    const ba = a + 0.2;
    addBench(b, Math.sin(ba) * 21.5, Math.cos(ba) * 21.5, ba + Math.PI);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.sin(a) * 16.5, z = Math.cos(a) * 16.5;
    const pl = new THREE.CylinderGeometry(1.8, 1.9, 0.55, 16);
    scaleUV(pl, 5, 0.5);
    b.add('stone', pl, mat4(x, 0.27, z), col('#d8c09c'));
    b.add('foliage', new THREE.CylinderGeometry(1.65, 1.65, 0.05, 16), mat4(x, 0.55, z), col('#3c5a24'), { ao: false });
    colliders.addCircle(x, z, 1.9);
    treeSpots.push({ x, z, kind: 'plane', s: 1.05 });
  }
  // houses: inner ring faces the plaza, outer ring backs onto the cliff
  const rows = [
    { front: 32, dmin: 8, dmax: 9.5, fmin: 2, fmax: 3 },
    { front: 50, dmin: 8, dmax: 9.5, fmin: 2, fmax: 3 },
  ];
  let houses = 0;
  for (const row of rows) {
    let theta = rng.range(0, 0.1);
    while (theta < Math.PI * 2 - 0.02) {
      const w = rng.range(6.5, 9.5);
      const d = rng.range(row.dmin, row.dmax);
      const angW = w / row.front;
      const tc = theta + angW / 2;
      if (tc + angW / 2 > Math.PI * 2) break;
      const rc = row.front + d / 2;
      const x = Math.sin(tc) * rc, z = Math.cos(tc) * rc;
      if (onAvenue(x, z, w / 2 + 0.5)) { theta += 1.2 / row.front; continue; }
      if (rng.chance(0.07)) { theta += 3 / row.front; continue; }
      const style = rng.chance(0.55) ? 'plaster' : 'stone';
      const spec = {
        w, d, floors: rng.int(row.fmin, row.fmax), fh: rng.range(3.0, 3.3), style, jetty: false,
        roofType: rng.chance(0.6) ? 'side' : 'front', pitch: rng.range(0.42, 0.58),
        plaster: rng.pick(PAL2.plaster), stone: rng.pick(PAL2.stone), roof: rng.pick(PAL2.roof),
        shutter: rng.chance(0.5) ? rng.pick(PAL.shutter) : null, flowers: rng.chance(0.55), balcony: rng.chance(0.25),
        chimney: rng.chance(0.3), lit: 0.35, shop: row.front === 32 && rng.chance(0.4) ? rng.pick(PAL.awning) : null, backDoor: false, braces: false,
      };
      addHouse(b, glows, x, z, tc + Math.PI, spec, rng);
      colliders.addBox(x, z, w / 2 + 0.1, d / 2 + 0.3, tc + Math.PI);
      houses++;
      theta += (w + 0.1) / row.front;
    }
  }
  // lamps along the ring streets and avenues
  for (const sr of [45.5]) {
    const n = Math.floor((Math.PI * 2 * sr) / 22);
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      const x = Math.sin(a) * (sr + 1.4), z = Math.cos(a) * (sr + 1.4);
      if (onAvenue(x, z, 0.5)) continue;
      addLamp(b, glows, x, z, a + Math.PI);
      colliders.addCircle(x, z, 0.25);
    }
  }
  for (const g of avenues) {
    const gx = Math.sin(g), gz = Math.cos(g);
    for (let r = 30; r < 76; r += 12) {
      for (const s of [-1, 1]) {
        const x = gx * r + gz * s * 4.8, z = gz * r - gx * s * 4.8;
        addLamp(b, glows, x, z, Math.atan2(-gz * s, gx * s));
        colliders.addCircle(x, z, 0.25);
      }
    }
  }
  // market stalls on the south avenue between the rings and near the passage
  for (let r = 60; r < 74; r += 4.4) {
    for (const s of [-1, 1]) {
      const x = s * 3.6, z = r;
      addStall(b, glows, x, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, rng);
      colliders.addBox(x, z, 0.75, 1.3, 0);
    }
  }
  // cliff gardens: trees between the outer houses and the crater wall
  for (let k = 0; k < 26; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(66, 72);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onAvenue(x, z, 3)) continue;
    treeSpots.push({ x, z, kind: 'plane', s: rng.range(0.8, 1.15) });
    colliders.addCircle(x, z, 0.6);
  }
  // cliff dwellings: doors, windows and balconies cut into the inner crater wall
  const winLit = quadGeo(0.9, 1.3, 0.0, 0, 0.5, 1);
  const winDark = quadGeo(0.9, 1.3, 0.5, 0, 1.0, 1);
  for (let k = 0; k < 70; k++) {
    const a = rng.range(0, Math.PI * 2);
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.2) continue;
    const y = rng.pick([1.4, 5.5, 9.5, 13.5, 20, 24, 30]);
    const r = craterInnerR(a, y) - 0.12;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const M = mat4(x, 0, z, a + Math.PI);
    if (y < 2) {
      b.add('door', quadGeo(1.3, 2.4), M.clone().multiply(mat4(0, 1.2, 0.05)), 0xffffff, { ao: false });
      b.add('stone', archRingGeo(0.65, 0.95, 0.3, 10), M.clone().multiply(mat4(0, 2.4, 0.05)), col('#c8a888'), { ao: false });
      continue;
    }
    b.add('window', rng.chance(0.55) ? winLit : winDark, M.clone().multiply(mat4(0, y, 0.05)), 0xffffff, { ao: false });
    b.add('stone', boxGeo(1.2, 0.12, 0.3, 1), M.clone().multiply(mat4(0, y - 0.72, 0.12)), col('#d8c0a0'), { ao: false });
    if (rng.chance(0.35)) {
      b.add('wood', boxGeo(2.2, 0.12, 1.0, 1), M.clone().multiply(mat4(0, y - 0.9, 0.55)), 0x7a5a40);
      b.add('wood', boxGeo(2.2, 0.06, 0.06, 1), M.clone().multiply(mat4(0, y - 0.1, 1.02)), 0x5a3d2b, { ao: false });
      b.add('fabric', boxGeo(2.4, 0.04, 1.2, 1), M.clone().multiply(mat4(0, y + 1.1, 0.6, 0, 0.3)), col(rng.pick(PAL.awning)), { ao: false });
    }
    if (rng.chance(0.4)) {
      const gp = new THREE.Vector3(0.7, y + 0.3, 0.4).applyMatrix4(M);
      glows.add(gp.x, gp.y, gp.z, 0.8, 0xffb466, 0.3, 300);
    }
  }
  // the gated passage: stone walls lining the cut, towers and an arch at the outer mouth
  const sand = col('#d0b490');
  for (const s of [-1, 1]) {
    const x = s * (CR.gapHalf + 1.2);
    b.add('stone', boxGeo(1.6, 12, CR.outer - CR.inner + 6, 2), mat4(x, 6, (CR.inner + CR.outer) / 2), sand);
    colliders.addBox(x, (CR.inner + CR.outer) / 2, 0.8, (CR.outer - CR.inner + 6) / 2);
    for (let z = CR.inner - 2; z < CR.outer + 3; z += 1.6) b.add('stone', boxGeo(0.9, 1.0, 0.8, 1), mat4(x, 12.5, z), sand, { ao: false });
    for (let z = CR.inner + 8; z < CR.outer - 2; z += 10) {
      addLamp(b, glows, s * (CR.gapHalf - 0.2), z, -s * Math.PI / 2);
    }
    // gate towers at the outer mouth
    const tx = s * (CR.gapHalf + 4.5), tz = CR.outer + 3;
    const tw = new THREE.CylinderGeometry(4, 4.4, 20, 16);
    scaleUV(tw, 12, 10);
    b.add('stone', tw, mat4(tx, 10, tz), sand);
    b.add('stone', new THREE.CylinderGeometry(4.5, 4.2, 1.2, 16), mat4(tx, 20.4, tz), sand.clone().multiplyScalar(0.9), { ao: false });
    b.add('roof', spireGeo(4.8, 7, 16), mat4(tx, 21, tz), col('#a8482a'), { ao: false });
    colliders.addCircle(tx, tz, 4.5);
    glows.add(tx - s * 4.2, 6, tz + 1, 1.6, 0xffa556, 0.3);
  }
  b.add('stone', archRingGeo(CR.gapHalf, CR.gapHalf + 2.2, 3, 18), mat4(0, 9.5, CR.outer + 3), sand);
  b.add('stone', boxGeo(CR.gapHalf * 2 + 5, 3.4, 3.2, 2), mat4(0, 9.5 + CR.gapHalf + 2.3, CR.outer + 3), sand);
  b.add('fabric', new THREE.PlaneGeometry(2.4, 5), mat4(-4, 13, CR.outer + 4.62), col('#2a5a9a'), { ao: false });
  b.add('fabric', new THREE.PlaneGeometry(2.4, 5), mat4(4, 13, CR.outer + 4.62), col('#2a5a9a'), { ao: false });
  // paved floor through the passage
  for (let z = CR.inner - 1; z < CR.outer + 8; z += 2) {
    b.add('cobble', boxGeo(CR.gapHalf * 2, 0.1, 2.02, 3.2), mat4(0, 0.0, z + 1), col('#c8b8a0'), { ao: false });
  }
  return { treeSpots, houses };
}

function buildOutside(b, glows, colliders, rng, gm, group) {
  const col = (h) => new THREE.Color(h);
  const H = heightF2;
  // --- wind valley camp with its gate
  const cy = H(CAMP2.x, CAMP2.z);
  const camp = makeGate(b, group, gm, glows, colliders, new THREE.Vector3(CAMP2.x + 9, cy, CAMP2.z), -Math.PI / 2, 0.7);
  const fp = new THREE.Vector3(CAMP2.x - 6, cy, CAMP2.z - 6);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.add('rock', new THREE.IcosahedronGeometry(0.25, 0), mat4(fp.x + Math.sin(a) * 0.8, cy + 0.1, fp.z + Math.cos(a) * 0.8), 0x888888, { ao: false });
  }
  glows.add(fp.x, cy + 0.6, fp.z, 3.2, 0xff8a30, 0.8);
  glows.add(fp.x, cy + 0.4, fp.z, 1.2, 0xffd080, 0.6);
  colliders.addCircle(fp.x, fp.z, 0.9);
  for (const [dx, dz, ry] of [[-12, -2, 0.4], [-6, -13, -0.2], [2, -12, 0.9]]) {
    const tent = new THREE.ConeGeometry(2.2, 2.6, 4, 1, true);
    scaleUV(tent, 4, 2);
    b.add('fabric', tent, mat4(CAMP2.x + dx, cy + 1.3, CAMP2.z + dz, ry + Math.PI / 4), col(rng.pick(['#c9b48a', '#8aa0b8', '#b88a6a'])), { ao: false });
    colliders.addCircle(CAMP2.x + dx, CAMP2.z + dz, 1.8);
  }
  // wind-worn standing stones around the camp
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.2;
    if (k === 0 || k === 5) continue;
    const x = CAMP2.x + Math.sin(a) * 17, z = CAMP2.z + Math.cos(a) * 17;
    const h = 2.5 + (k % 3);
    b.add('stone', boxGeo(1.3, h, 1.3, 2), mat4(x, H(x, z) + h / 2 - 0.3, z, a, 0, (k % 2) * 0.06), col('#c8b49a'));
    colliders.addCircle(x, z, 0.9);
  }

  // --- Hanna's ranch: fenced paddock + barn + hay
  const ry = H(RANCH.x, RANCH.z);
  const fence = (x0, z0, x1, z1) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const n = Math.ceil(L / 3);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, z = z0 + ((z1 - z0) * i) / n;
      b.add('wood', boxGeo(0.16, 1.3, 0.16, 1), mat4(x, ry + 0.6, z), 0x6a4a2e);
      colliders.addCircle(x, z, 0.25);
    }
    for (const hy of [0.55, 1.05]) b.add('wood', boxGeo(0.08, 0.1, L, 1), mat4((x0 + x1) / 2, ry + hy, (z0 + z1) / 2, yaw), 0x8a6a44, { ao: false });
    for (let i = 0; i < n; i++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / n, z = z0 + ((z1 - z0) * (i + 0.5)) / n;
      colliders.addCircle(x, z, 0.25);
    }
  };
  const X0 = RANCH.x - RANCH.hw, X1 = RANCH.x + RANCH.hw, Z0 = RANCH.z - RANCH.hd, Z1 = RANCH.z + RANCH.hd;
  fence(X0, Z0, X1, Z0);
  fence(X0, Z1, X1, Z1);
  fence(X0, Z0, X0, Z1);
  fence(X1, Z0, X1, RANCH.z - 3);
  fence(X1, RANCH.z + 3, X1, Z1);
  addHouse(b, glows, RANCH.x - 8, RANCH.z - 4, Math.PI / 2, {
    w: 10, d: 8, floors: 2, fh: 3.4, style: 'plaster', jetty: false, roofType: 'side', pitch: 0.7,
    plaster: '#b04a36', stone: '#8a7a6a', roof: '#5a4a44', shutter: '#f0e8d8', flowers: false, balcony: false, chimney: false, lit: 0.2, shop: null, backDoor: false, braces: false,
  }, rng);
  colliders.addBox(RANCH.x - 8, RANCH.z - 4, 4.1, 5.2, Math.PI / 2);
  for (let k = 0; k < 6; k++) {
    const x = RANCH.x + 4 + (k % 3) * 2.2, z = RANCH.z + 7 + Math.floor(k / 3) * 2.2;
    const hay = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14);
    scaleUV(hay, 3, 1);
    b.add('fabric', hay, mat4(x, ry + 0.75, z, 0, Math.PI / 2, 0), col('#d8b860'));
    colliders.addCircle(x, z, 0.8);
  }
  b.add('wood', boxGeo(3, 0.6, 0.9, 1), mat4(RANCH.x + 10, ry + 0.3, RANCH.z - 8), 0x6a4a2e);
  b.add('plain', boxGeo(2.8, 0.05, 0.7, 1), mat4(RANCH.x + 10, ry + 0.55, RANCH.z - 8), 0x3a6a8a, { ao: false });
  colliders.addBox(RANCH.x + 10, RANCH.z - 8, 1.5, 0.5);

  // --- the Taurus General's arena: a ring of broken colossal pillars
  const ay = H(ARENA2.x, ARENA2.z);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    if (k === 3 || k === 4) continue; // the entrance faces the road (east)
    const x = ARENA2.x + Math.sin(a) * 31, z = ARENA2.z + Math.cos(a) * 31;
    const h = 4 + ((k * 53) % 7);
    const cyl = new THREE.CylinderGeometry(1.2, 1.4, h, 12);
    scaleUV(cyl, 3, h / 2);
    b.add('stone', cyl, mat4(x, H(x, z) + h / 2 - 0.3, z), col('#d0bc9c'));
    if (k % 4 === 0) b.add('stone', boxGeo(5, 0.9, 1.6, 2), mat4(x, H(x, z) + h + 0.2, z, a + Math.PI / 2, 0, 0.12), col('#c8b494'), { ao: false });
    colliders.addCircle(x, z, 1.5);
  }
  for (let k = 0; k < 10; k++) {
    const a = rng.range(0, Math.PI * 2), r = rng.range(8, 24);
    const x = ARENA2.x + Math.sin(a) * r, z = ARENA2.z + Math.cos(a) * r;
    b.add('stone', boxGeo(rng.range(1, 2.5), rng.range(0.5, 1.2), rng.range(1, 2.5), 2), mat4(x, ay + 0.3, z, rng.range(0, 3), rng.range(-0.2, 0.2)), col('#c8b494'));
  }
  const ring = new THREE.RingGeometry(26, 27, 64);
  ring.rotateX(-Math.PI / 2);
  b.add('stone', ring, mat4(ARENA2.x, ay + 0.04, ARENA2.z), col('#b8a488'), { ao: false });
  return { camp, fire: fp };
}

export async function makeFloor2(world, game, progress) {
  const { m, tex } = world;
  const renderer = game.renderer;
  let tPrev = performance.now();
  const step = async (p, text) => {
    if (import.meta.env.DEV) {
      const now = performance.now();
      console.log(`[floor2] ${(now - tPrev).toFixed(0)}ms → ${text}`);
      tPrev = now;
    }
    progress(p, text);
    await new Promise((r) => setTimeout(r, 0));
  };
  await step(0.05, '제2층 하늘을 굽는 중…');
  const sky = bakeSky(renderer, SUN2, game.quality === 'low' ? 512 : 1024, {
    zenith: [0.07, 0.26, 0.64],
    mid: [0.3, 0.55, 0.86],
    horizon: [0.78, 0.84, 0.9],
    warm: [0.55, 0.42, 0.28],
    cloud: 0.53,
    fogColor: [0.74, 0.8, 0.86],
    sunColor: [1.0, 0.95, 0.86],
    sunTint: [1.0, 0.86, 0.66],
  });
  if (!m.crystal2) {
    m.crystal2 = new THREE.MeshStandardMaterial({ color: 0xc07a30, emissive: 0xffa040, emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.2, flatShading: true });
    m.crystal2.userData.noShadow = true;
  }
  const root = new THREE.Group();
  root.name = 'floor2';
  const colliders = new Colliders(8, { r: (CR.inner + CR.outer) / 2, thick: CR.outer - CR.inner, gates: [0], gateHalf: CR.gapHalf + 0.2 });
  const glows = new GlowField(tex.glow, 900);

  await step(0.15, '탁상 고원을 형성하는 중…');
  root.add(buildTerrain(tex, { height: heightF2, segs: SEGS2, lake: LAKE2, cobbleR: CR.inner + 0.4, grassTint: [1.1, 1.02, 0.78] }));
  root.add(buildEdgeCliff(m, heightF2));
  await step(0.25, '풀밭 높이맵 계산 중…');
  const density = (x, z) => {
    const r = Math.hypot(x, z);
    if (r < CR.outer + 4 || r > WORLD_R - 4) return 0;
    for (const M of MESAS) if (Math.hypot(x - M.x, z - M.z) < M.r * 1.12 + 1) return 0;
    const lk = Math.hypot(x - LAKE2.x, z - LAKE2.z);
    return smoothstep(3.2, 6, roadDist2(x, z)) * smoothstep(LAKE2.r * 1.05, LAKE2.r * 1.3, lk) * smoothstep(10, 22, Math.hypot(x - ARENA2.x, z - ARENA2.z));
  };
  const heightTex = buildHeightTexture(512, 512, heightF2, density);

  await step(0.35, '메사를 깎아 세우는 중…');
  const rb = new GeoBuilder();
  const cap = new GeoBuilder();
  rb.add('rock', craterGeometry(), null, 0xffffff, { ao: false, keepColors: true });
  MESAS.forEach((M, i) => {
    if (!M.scaled) { M.h *= 1.35; M.scaled = true; }
    let base = Infinity;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      base = Math.min(base, heightF2(M.x + Math.sin(a) * M.r, M.z + Math.cos(a) * M.r));
    }
    M.base = base;
    const g = mesaGeometry(M, 101 + i * 7);
    rb.add('rock', g.walls, null, 0xffffff, { ao: false, keepColors: true });
    cap.add('foliage', g.cap, null, 0xffffff, { ao: false, keepColors: true });
    colliders.addCircle(M.x, M.z, M.r * 1.06);
  });
  const rockMesh = rb.build(m, { name: 'mesas', castShadow: true });
  root.add(rockMesh, cap.build(m, { name: 'mesaCaps', castShadow: false }));

  await step(0.5, '메사리아를 짓는 중…');
  const rng = new RNG(2222);
  const b = new GeoBuilder();
  const town = buildMesaria(b, glows, colliders, rng, m);
  const gm = gateMaterials(tex);
  const gateGroup = new THREE.Group();
  const mainGate = makeGate(b, gateGroup, gm, glows, colliders, new THREE.Vector3(0, 0, 0), 0, 1);
  const outside = buildOutside(b, glows, colliders, rng, gm, gateGroup);
  root.add(b.build(m, { name: 'mesaria' }), gateGroup);
  root.add(lightPools(takeLamps(), heightF2));
  const ambience = new Ambience({
    quality: game.quality,
    chimneys: takeChimneys(),
    height: heightF2,
    birdAreas: [
      { x: 0, z: 0, r: 60, y: 62 },
      { x: -180, z: 200, r: 90, y: 80 },
      { x: 200, z: -120, r: 80, y: 75 },
    ],
    butterflyOk: (x, z) => Math.hypot(x, z) > CR.outer + 8,
    wind: new THREE.Vector3(0.6, 0, -0.4),
    seed: 21,
  });
  root.add(ambience.root);
  root.add(buildPier(m, colliders, PIER2, heightF2, { hut: true }));

  await step(0.62, '제2층 구조물 생성 중…');
  const castle = buildCastle(m, tex, colliders, glows, { height: heightF2, tower: TOWER2, seeds: [611, 613], rng: 199, overlook: false, crystal: 'crystal2', crystalGlow: 0xffa040 });
  root.add(castle.group);

  await step(0.72, '고원의 숲을 가꾸는 중…');
  const veg = buildVegetation(m, tex, colliders, heightTex, game.quality, {
    env: sky.environment,
    seed: 3030,
    height: heightF2,
    okSpot(x, z, clear = 5) {
      const r = Math.hypot(x, z);
      if (r < CR.outer + 10 || r > WORLD_R - 12) return false;
      if (roadDist2(x, z) < clear + 2) return false;
      if (Math.hypot(x - LAKE2.x, z - LAKE2.z) < LAKE2.r + 4) return false;
      for (const M of MESAS) if (Math.hypot(x - M.x, z - M.z) < M.r * 1.12 + 4) return false;
      for (const [p, rr] of [[CAMP2, 26], [ARENA2, 40], [TOWER2, TOWER2.r + 14]]) if (Math.hypot(x - p.x, z - p.z) < rr) return false;
      if (Math.abs(x - RANCH.x) < RANCH.hw + 8 && Math.abs(z - RANCH.z) < RANCH.hd + 8) return false;
      return true;
    },
    forests: [
      { x: -80, z: -150, r: 60, pine: 0.75, n: 70 },
      { x: 250, z: -250, r: 70, pine: 0.6, n: 80 },
      { x: -300, z: 40, r: 50, pine: 0.5, n: 50 },
      { x: 170, z: 290, r: 50, pine: 0.3, n: 45 },
      { x: 330, z: -10, r: 40, pine: 0.5, n: 35 },
      { x: -170, z: 200, r: 40, pine: 0.4, n: 35 },
    ],
    meadow: { n: 70, rmin: 140, rmax: 470, pine: 0.4 },
    lake: LAKE2,
    bushes: 320,
    rocks: { n: 200, rmin: 125, rmax: 490 },
    edgeRocks: false,
    grassTips: [[0.17, 0.26, 0.07], [0.31, 0.32, 0.1]],
  });
  veg.addTownTrees(town.treeSpots);
  veg.finalize();
  root.add(veg.group, veg.grass);

  await step(0.84, '폭포와 호수를 채우는 중…');
  const lakeMat = waterMaterial(sky.background, { deep: '#0f3440', shallow: '#3a7a7a', scale: 0.35, strength: 1.2, sun: SUN2 });
  lakeMat.uniforms.env.value = sky.background;
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE2.r * 1.25, 64), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE2.x, LAKE2.level, LAKE2.z);
  root.add(lake);
  const fall = fallMaterial();
  const FM = MESAS.find((x) => x.fall);
  const fdir = new THREE.Vector2(LAKE2.x - FM.x, LAKE2.z - FM.z).normalize();
  const fh = FM.base + FM.h - LAKE2.level;
  const face = new THREE.Vector3(FM.x + fdir.x * (FM.r * 0.99 + 0.6), 0, FM.z + fdir.y * (FM.r * 0.99 + 0.6));
  const cg = new THREE.CylinderGeometry(FM.r + 1.2, FM.r + 2.6, fh, 24, 1, true, Math.atan2(fdir.x, fdir.y) - 0.2, 0.4);
  scaleUV(cg, 1, 9);
  const curtain = new THREE.Mesh(cg, fall);
  curtain.position.set(FM.x, LAKE2.level + fh / 2, FM.z);
  root.add(curtain);
  for (let k = 0; k < 5; k++) {
    glows.add(face.x + fdir.x * 2 + (k - 2) * 1.6 * fdir.y, LAKE2.level + 1 + (k % 2), face.z + fdir.y * 2 - (k - 2) * 1.6 * fdir.x, 5, 0xe8f4ff, 0.5, 500);
  }

  // wind flowers (the tamer's quest) at the foot of the mesas
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x2a7aff, emissiveIntensity: 0.55, roughness: 0.4 });
  const flowerGeo = (() => {
    const parts = [part(new THREE.CylinderGeometry(1, 1, 1, 5), 0, 0.25, 0, 0, 0, 0, 0.015, 0.5, 0.015, '#3a7a2a')];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      parts.push(part(new THREE.SphereGeometry(1, 6, 4), Math.sin(a) * 0.07, 0.52, Math.cos(a) * 0.07, 0, a, 0.5, 0.07, 0.02, 0.045, '#bff0ff', '#6fd0ff'));
    }
    parts.push(part(new THREE.SphereGeometry(1, 6, 4), 0, 0.53, 0, 0, 0, 0, 0.04, 0.04, 0.04, '#fff0a0'));
    return mergeParts(parts);
  })();
  const flowerIdx = [3, 4, 10, 11, 12, 13, 6, 8, 1];
  const flowers = flowerIdx.map((i) => {
    const M = MESAS[i];
    const d = new THREE.Vector2(-M.x, -M.z).normalize();
    const x = M.x + d.x * (M.r * 1.12 + 2.5), z = M.z + d.y * (M.r * 1.12 + 2.5);
    const y = heightF2(x, z);
    const mesh = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(flowerGeo, flowerMat);
      f.position.set((k - 1) * 0.25, 0, (k % 2) * 0.2);
      f.rotation.y = k * 1.3;
      f.scale.setScalar(1.3 + k * 0.2);
      mesh.add(f);
    }
    mesh.position.set(x, y, z);
    root.add(mesh);
    const glow = glows.add(x, y + 0.7, z, 1.2, 0x6fd0ff, 0.3, 120);
    return { pos: new THREE.Vector3(x, y, z), mesh, glow, taken: false, t: 0 };
  });

  root.add(glows.mesh);
  const fisher2 = pierPoint(PIER2, 4, -2.5);
  const spawns = [];
  const srng = new RNG(88);
  const bullZones = [[40, 250, 40], [110, 215, 35], [-70, 190, 25], [220, 60, 40]];
  for (let i = 0; i < 14; i++) {
    const zc = bullZones[i % bullZones.length];
    const a = srng.range(0, Math.PI * 2), r = srng.range(0, zc[2]);
    spawns.push({ type: 'bull', x: zc[0] + Math.sin(a) * r, z: zc[1] + Math.cos(a) * r });
  }
  const waspZones = [[-200, 20, 45], [-110, 60, 30], [-280, 230, 35], [0, -210, 40]];
  for (let i = 0; i < 12; i++) {
    const zc = waspZones[i % waspZones.length];
    const a = srng.range(0, Math.PI * 2), r = srng.range(0, zc[2]);
    spawns.push({ type: 'wasp', x: zc[0] + Math.sin(a) * r, z: zc[1] + Math.cos(a) * r });
  }
  spawns.push({ type: 'taurus', x: ARENA2.x - 6, z: ARENA2.z });

  const map = {
    id: 'f2',
    name: '부유성 제2층',
    town: '메사리아',
    root,
    glows,
    height: walkF2,
    colliders,
    maxR: WORLD_R - 2.8,
    isSafe: (x, z) => Math.hypot(x, z) < CR.inner - 0.5 || (Math.abs(x) < CR.gapHalf + 1 && z > 0 && z < CR.outer + 6),
    zoneAt(p, inTown) {
      const d = (a) => Math.hypot(p.x - a.x, p.z - a.z);
      if (Math.hypot(p.x, p.z) < CR.inner) return '메사리아';
      if (inTown) return '메사리아 관문';
      if (d(ARENA2) < 50) return '황소왕의 협곡';
      if (d(TOWER2) < TOWER2.r + 70) return '제2층 미궁 탑';
      if (d(LAKE2) < LAKE2.r + 30) return '폭포 호수';
      if (d(CAMP2) < 40) return '바람골 야영지';
      if (Math.abs(p.x - RANCH.x) < RANCH.hw + 12 && Math.abs(p.z - RANCH.z) < RANCH.hd + 12) return '한나의 목장';
      if (p.x < -100 && p.z < 250) return '말벌의 메사 지대';
      return '탁상 고원';
    },
    spawn: { pos: new THREE.Vector3(0, 0, -15), yaw: Math.PI },
    env: {
      sky,
      envIntensity: 0.65,
      fog: { color: sky.fogColor, density: 0.0019 },
      sun: { dir: SUN2, color: sky.sunColor, intensity: 3.1, center: new THREE.Vector3(0, 0, 0), extent: 135 },
      hemi: { sky: 0xa8c8ff, ground: 0x6a5a40, intensity: 0.4 },
    },
    themes: { town: 'town2', field: 'field2' },
    loops: [
      { kind: 'portal', pos: new THREE.Vector3(0, 3, 0) },
      { kind: 'portal', pos: outside.camp.pos.clone().setY(outside.camp.pos.y + 3) },
      { kind: 'water', pos: face.clone().setY(LAKE2.level + 2) },
    ],
    gates: [
      { id: 'f2town', label: '메사리아', floor: '제2층', pos: mainGate.pos, r: 1.6 },
      { id: 'f2camp', label: '바람골 야영지', floor: '제2층', pos: outside.camp.pos, r: 1.3 },
    ],
    portals: [
      { id: 'tower2', pos: castle.towerGate.clone(), r: 7, prompt: '제2층 미궁 탑 (봉인됨)', action: () => game.say(null, { title: '제2층 미궁 탑', body: '거대한 문에 빛나는 문장이 새겨져 있다. “층을 지키는 자가 깨어날 때까지 이 문은 열리지 않는다.”\n…아직은 들어갈 수 없는 것 같다. (다음 업데이트를 기다려 주세요!)' }, [{ label: '돌아간다' }]) },
    ],
    fishing: [{ pos: new THREE.Vector3(PIER2.x1 - PIER2.fx * 0.4, PIER2.deck, PIER2.z1 - PIER2.fz * 0.4), r: 2.6, table: 'lake2', water: { x: LAKE2.x, z: LAKE2.z, r: LAKE2.r * 0.95, y: LAKE2.level } }],
    chestSpots: [
      { x: 30, z: 175 }, { x: -48, z: 262 }, { x: 95, z: 150 }, { x: -140, z: 305 }, { x: 150, z: 20 },
      { x: 206, z: -100 }, { x: -185, z: 150 }, { x: 240, z: 250 }, { x: -240, z: 40 },
    ].map((c) => {
      // nudge off roads / out of mesas
      for (const M of MESAS) {
        const d = Math.hypot(c.x - M.x, c.z - M.z);
        if (d < M.r * 1.12 + 3) { c.x = M.x + ((c.x - M.x) / d) * (M.r * 1.12 + 3); c.z = M.z + ((c.z - M.z) / d) * (M.r * 1.12 + 3); }
      }
      return c;
    }),
    npcCfg: {
      seed: 9090,
      walkers: 30,
      plazaR: 26.5,
      plazaWalkers: 8,
      streets: [45.5],
      cloakColors: ['#b8804a', '#8a5a3a', '#6a8a5a', '#a89070', '#7a5a8a', '#c0a060', '#5a7890', '#a05a4a'],
      specials: [
        { id: 'hanna', name: '목장주 한나', x: 7, z: 12.5, yaw: -2.6, color: '#b04a36', marker: '!' },
        { id: 'mii', name: '조련사 미이', x: -13, z: 5, yaw: 1.9, color: '#e08ab0', marker: '!', scale: 0.92 },
        { id: 'garrett', name: '대장장이 가렛', x: 13.5, z: -6, yaw: -1.2, color: '#6a3a1a', marker: 'anvil' },
        { id: 'bella', name: '상인 벨라', x: -12, z: -9.5, yaw: 0.9, color: '#3a7a5a', marker: 'coin' },
        { id: 'tunnel', name: '관문 경비병', x: 5.2, z: CR.inner + 4, yaw: Math.PI, color: '#4a5a6a' },
        { id: 'sage', name: '고원의 현자', x: 2, z: -17.5, yaw: 0, color: '#6a6a78', marker: 'info' },
        { id: 'fisher2', name: '물가의 소녀 이나', x: fisher2.x, z: fisher2.z, y: heightF2(fisher2.x, fisher2.z), yaw: PIER2.yaw, color: '#4a8aa8', marker: 'fish', scale: 0.9 },
      ],
      props(group, cols, npcs) {
        const wood = new THREE.MeshStandardMaterial({ map: tex.wood.map, color: 0xb08860, roughness: 0.85 });
        const iron = new THREE.MeshStandardMaterial({ color: 0x2c2e33, metalness: 0.8, roughness: 0.4 });
        const put = (obj, n, dist, rad) => {
          obj.position.set(n.x + Math.sin(n.yaw) * dist, 0, n.z + Math.cos(n.yaw) * dist);
          obj.rotation.y = n.yaw;
          group.add(obj);
          cols.addCircle(obj.position.x, obj.position.z, rad);
        };
        // Garrett's forge: anvil + glowing coals
        const g = npcs.byId.garrett;
        const anvil = new THREE.Group();
        const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), iron);
        top.position.y = 0.72;
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.3), iron);
        base.position.y = 0.33;
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), iron);
        horn.rotation.z = Math.PI / 2;
        horn.position.set(0.5, 0.74, 0);
        anvil.add(top, base, horn);
        put(anvil, g, 1.1, 0.45);
        const forge = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.9, 10), new THREE.MeshStandardMaterial({ color: 0x5a4a40, roughness: 0.9 }));
        forge.position.set(g.x - 1.6, 0.45, g.z - 0.4);
        const coals = new THREE.Mesh(new THREE.CircleGeometry(0.5, 12), new THREE.MeshBasicMaterial({ color: 0xff7020 }));
        coals.rotation.x = -Math.PI / 2;
        coals.position.set(g.x - 1.6, 0.91, g.z - 0.4);
        group.add(forge, coals);
        cols.addCircle(g.x - 1.6, g.z - 0.4, 0.75);
        glows.add(g.x - 1.6, 1.2, g.z - 0.4, 1.6, 0xff7020, 0.6);
        // Bella's stall
        const bl = npcs.byId.bella;
        const stall = new THREE.Group();
        const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.7), wood);
        counter.position.y = 0.475;
        const awn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 1.3), new THREE.MeshStandardMaterial({ map: tex.fabric.map, color: 0x3a8a5a, roughness: 0.9 }));
        awn.position.set(0, 2.35, -0.1);
        awn.rotation.x = 0.25;
        stall.add(counter, awn);
        for (const sx of [-0.85, 0.85]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, 0.08), wood);
          post.position.set(sx, 1.17, 0.3);
          stall.add(post);
        }
        for (let i = 0; i < 4; i++) {
          const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.1, 12), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xfff0f4 : 0xf8d8e0, roughness: 0.6 }));
          cake.position.set(-0.55 + i * 0.36, 1.0, 0.05);
          const berry = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), new THREE.MeshStandardMaterial({ color: 0xd0203a }));
          berry.position.set(-0.55 + i * 0.36, 1.07, 0.05);
          stall.add(cake, berry);
        }
        put(stall, bl, 1.0, 0.95);
        // Mii's nest with the egg
        const mi = npcs.byId.mii;
        const nest = new THREE.Group();
        const straw = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.13, 6, 14), new THREE.MeshStandardMaterial({ color: 0xb89a58, roughness: 1 }));
        straw.rotation.x = Math.PI / 2;
        straw.position.y = 0.55;
        const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.5, 10), wood);
        stand.position.y = 0.25;
        const egg = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: 0xcfefff, roughness: 0.3, emissive: 0x2a5a7a, emissiveIntensity: 0.4 }));
        egg.scale.y = 1.3;
        egg.position.y = 0.72;
        nest.add(straw, stand, egg);
        nest.userData.egg = egg;
        put(nest, mi, 1.0, 0.45);
        map.egg = egg;
      },
    },
    monsterCfg: () => ({
      seed: 88,
      spawns,
      keepOut(pos, rad) {
        const r = Math.hypot(pos.x, pos.z);
        const minR = CR.outer + 6 + rad;
        if (r < minR) { pos.x *= minR / r; pos.z *= minR / r; }
      },
    }),
    mapInfo: {
      R: WORLD_R,
      roads: ROADS2,
      areas: [
        { x: 0, z: 0, r: CR.outer, fill: '#b8906a', stroke: '#8a6a4a' },
        { x: 0, z: 0, r: CR.inner, fill: 'rgba(230,210,180,0.95)' },
        ...MESAS.map((M) => ({ x: M.x, z: M.z, r: M.r, fill: '#b8906a', stroke: '#8a6a4a' })),
        { x: LAKE2.x, z: LAKE2.z, r: LAKE2.r, fill: '#5aa0c8' },
        { x: TOWER2.x, z: TOWER2.z, r: TOWER2.r, fill: '#8a8e9a', stroke: '#5a5e6a' },
        { x: ARENA2.x, z: ARENA2.z, r: 30, fill: 'rgba(200,180,140,0.8)' },
      ],
      pois: [
        { x: 0, z: 0, label: '메사리아', icon: 'gate' },
        { x: CAMP2.x, z: CAMP2.z, label: '바람골 야영지', icon: 'gate' },
        { x: ARENA2.x, z: ARENA2.z, label: '협곡 투기장', icon: 'boss' },
        { x: TOWER2.x, z: TOWER2.z + TOWER2.r + 12, label: '미궁 탑', icon: 'tower' },
        { x: LAKE2.x - 10, z: LAKE2.z - LAKE2.r - 8, label: '폭포 호수', icon: 'fish' },
        { x: RANCH.x, z: RANCH.z, label: '한나의 목장', icon: 'dot' },
      ],
    },
    nearestFlower(p) {
      let best = null, bd = 2.2;
      for (const f of flowers) {
        if (f.taken) continue;
        const d = Math.hypot(p.x - f.pos.x, p.z - f.pos.z);
        if (d < bd) { bd = d; best = f; }
      }
      return best;
    },
    pickFlower(f) {
      if (f.taken) return false;
      f.taken = true;
      f.t = 120;
      f.mesh.visible = false;
      glows.set(f.glow, f.pos.x, f.pos.y + 0.7, f.pos.z, 0.001);
      return true;
    },
    update(dt, t, center) {
      updateGateMaterials(gm, t);
      mainGate.rune.rotation.z = t * 0.05;
      outside.camp.rune.rotation.z = -t * 0.05;
      lakeMat.uniforms.time.value = t;
      fall.uniforms.time.value = t;
      veg.update(t, center);
      castle.group.userData.update?.(t);
      ambience.update(dt, t, center);
      glows.update(t);
      for (const f of flowers) {
        if (f.taken) {
          f.t -= dt;
          if (f.t <= 0) {
            f.taken = false;
            f.mesh.visible = true;
            glows.set(f.glow, f.pos.x, f.pos.y + 0.7, f.pos.z, 1.2);
          }
        } else f.mesh.rotation.y = Math.sin(t * 0.8 + f.pos.x) * 0.3;
      }
      if (map.egg) map.egg.visible = !game.progress.pet;
      if (map.egg && !game.progress.pet) map.egg.rotation.z = Math.sin(t * 3) * 0.12 * (Math.sin(t * 0.7) > 0.6 ? 1 : 0);
    },
  };

  await step(0.95, '셰이더 준비 중…');
  try {
    renderer.compile(root, game.camera, game.scene);
  } catch (e) {
    /* warm-up only */
  }
  return map;
}

function mergeParts(parts) {
  // tiny helper so the flower mesh is one geometry
  const g = new THREE.BufferGeometry();
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
