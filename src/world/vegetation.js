// Trees, bushes and rocks as instanced meshes, plus an infinite GPU grass
// field that follows the player and reads terrain height from a texture.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, fbm } from '../core/noise.js';
import { fieldAt } from './farmLayout.js';
import { foliageAtlas, barkTexture, foliageMaterial, barkMaterial, broadleafTree, pineTree, bushGeometry, Impostors, windUniform } from './foliage.js';
import { heightF1, roadDistance, LAKE, OUTPOST, BOSS_ARENA, OVERLOOK, TOWER, WORLD_R, TOWN } from './layout.js';

// Floor-1 scattering rules. Other floors pass their own config.
export const VEG_F1 = {
  seed: 2024,
  height: heightF1,
  okSpot(x, z, clear = 5) {
    const r = Math.hypot(x, z);
    if (r < TOWN.wallR + 16 || r > WORLD_R - 12) return false;
    if (roadDistance(x, z) < clear + 2) return false;
    if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4) return false;
    for (const [p, rr] of [[OUTPOST, 26], [BOSS_ARENA, 40], [OVERLOOK, 30]]) if (Math.hypot(x - p.x, z - p.z) < rr) return false;
    if (Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER.r + 14) return false;
    if (fieldAt(x, z, 6)) return false;
    return true;
  },
  forests: [
    { x: -270, z: 60, r: 75, pine: 0.35, n: 110 },
    { x: 180, z: 235, r: 60, pine: 0.2, n: 70 },
    { x: 230, z: -210, r: 85, pine: 0.8, n: 110 },
    { x: -60, z: -290, r: 75, pine: 0.9, n: 90 },
    { x: -250, z: 300, r: 55, pine: 0.6, n: 60 },
    { x: 330, z: 110, r: 60, pine: 0.4, n: 60 },
    { x: -200, z: -170, r: 60, pine: 0.7, n: 60 },
  ],
  meadow: { n: 90, rmin: 140, rmax: 470, pine: 0.25 },
  lake: LAKE,
  bushes: 380,
  rocks: { n: 170, rmin: 125, rmax: 490 },
  edgeRocks: true,
};

function colorize(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), tmp);
    c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

function strip(g) {
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', g.attributes.position);
  out.setAttribute('normal', g.attributes.normal);
  out.setAttribute('uv', g.attributes.uv || new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (g.attributes.color) out.setAttribute('color', g.attributes.color);
  if (g.index) out.setIndex(g.index);
  return out.index ? out.toNonIndexed() : out;
}

// Shared foliage assets (built once, reused by every floor).
let SHARED = null;
let RENDERER = null;
let ENV = null;
export function setVegetationRenderer(renderer, env) {
  RENDERER = renderer;
  ENV = env;
}
export function sharedFoliage() {
  return shared();
}
function shared() {
  if (SHARED) return SHARED;
  const atlas = foliageAtlas();
  const bark = barkTexture();
  const leafMat = foliageMaterial(atlas, { wind: 0.045, flutter: 0.06, start: 2.2 });
  leafMat.customProgramCacheKey = () => 'foliage-leaf';
  const pineMat = foliageMaterial(atlas, { wind: 0.025, flutter: 0.03, start: 2.0, translucency: 0.35 });
  pineMat.customProgramCacheKey = () => 'foliage-pine';
  const bushMat = foliageMaterial(atlas, { wind: 0.0, flutter: 0.04, start: 0.1 });
  bushMat.customProgramCacheKey = () => 'foliage-bush';
  const barkMat = barkMaterial(bark);
  barkMat.customProgramCacheKey = () => 'foliage-bark';
  const species = [
    broadleafTree(3, { height: 4.0, crownR: 3.1, hue: 0 }),
    broadleafTree(11, { height: 4.6, crownR: 2.8, hue: 0.03 }),
    pineTree(5, { height: 11.5 }),
  ];
  const bush = bushGeometry(9);
  const vineMat = foliageMaterial(atlas, { wind: 0, flutter: 0, start: 0, translucency: 0.25 });
  vineMat.customProgramCacheKey = () => 'foliage-vine';
  SHARED = { atlas, bark, leafMat, pineMat, bushMat, barkMat, vineMat, species, bush };
  return SHARED;
}

function rockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 0.7 + fbm(x * 1.3 + seed, y * 1.3 + z * 0.9, 3, seed) * 0.6;
    p.setXYZ(i, x * n * 1.2, Math.max(y * n * 0.75, -0.3), z * n);
  }
  g.computeVertexNormals();
  const out = strip(g);
  const uv = out.attributes.uv;
  const pos = out.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 0.5 + pos.getY(i) * 0.3, pos.getZ(i) * 0.5 + pos.getY(i) * 0.2);
  colorize(out, (x, y, z, c) => c.setRGB(0.72, 0.66, 0.58).multiplyScalar(0.55 + 0.45 * THREE.MathUtils.clamp(y + 0.5, 0, 1)));
  return out;
}

function matrixFor(t) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(t.tilt || 0, t.rot || 0, t.tilt2 || 0));
  m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(t.sx ?? t.s, t.sy ?? t.s, t.sz ?? t.s));
  return m.elements;
}

// Near trees are full leaf-card meshes; far ones become impostor billboards
// (or vanish, for bushes).
class TreeSet {
  constructor(list, hi, dist, cell = -1, farDist = Infinity) {
    this.list = list.map((t) => ({ x: t.x, y: t.y, z: t.z, s: t.s, m: matrixFor(t), shade: 0.85 + ((t.x * 13.7 + t.z * 7.3) % 1 + 1) % 1 * 0.25 }));
    this.hi = hi.map(([g, mat, shadow]) => {
      const m = new THREE.InstancedMesh(g, mat, Math.max(1, this.list.length));
      m.castShadow = !!shadow;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.count = 0;
      return m;
    });
    this.d2 = dist * dist;
    this.far2 = farDist * farDist;
    this.cell = cell;
    this.meshes = this.hi;
  }
  update(c, imp) {
    let h = 0;
    for (const t of this.list) {
      const dx = t.x - c.x, dz = t.z - c.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < this.d2) {
        for (const m of this.hi) m.instanceMatrix.array.set(t.m, h * 16);
        h++;
      } else if (this.cell >= 0 && imp && d2 < this.far2) {
        imp.push(t.x, t.y, t.z, t.s, this.cell, t.shade);
      }
    }
    for (const m of this.hi) { m.count = h; m.instanceMatrix.needsUpdate = true; }
  }
}

function makeInstanced(geo, material, list, castShadow = false) {
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(1, list.length));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  list.forEach((t, i) => {
    e.set(t.tilt || 0, t.rot || 0, t.tilt2 || 0);
    q.setFromEuler(e);
    m.compose(p.set(t.x, t.y, t.z), q, s.set(t.sx ?? t.s, t.sy ?? t.s, t.sz ?? t.s));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  return mesh;
}

// ----------------------------------------------------------------- GPU grass
function buildGrass(heightTex, quality, tips = [[0.15, 0.28, 0.06], [0.27, 0.33, 0.1]]) {
  const cfg = { low: [0.6, 14], medium: [0.5, 22], high: [0.42, 26] }[quality] || [0.5, 22];
  const [cell, radius] = cfg;
  const N = Math.ceil((radius * 2) / cell);
  // one tuft = 3 blades of 2 segments
  const pos = [], hgt = [];
  const idx = [];
  const BL = 4;
  for (let b = 0; b < BL; b++) {
    const a = (b / BL) * Math.PI + 0.3;
    const dx = Math.cos(a) * 0.026, dz = Math.sin(a) * 0.026;
    const k = b - (BL - 1) / 2;
    const ox = Math.cos(a + 1.3) * 0.07 * k, oz = Math.sin(a + 1.3) * 0.07 * k;
    const lean = k * 0.1;
    const base = pos.length / 3;
    pos.push(ox - dx, 0, oz - dz, ox + dx, 0, oz + dz);
    hgt.push(0, 0);
    pos.push(ox - dx * 0.6 + lean * 0.4, 0.55, oz - dz * 0.6, ox + dx * 0.6 + lean * 0.4, 0.55, oz + dz * 0.6);
    hgt.push(0.55, 0.55);
    pos.push(ox + lean, 1, oz);
    hgt.push(1);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('bladeH', new THREE.Float32BufferAttribute(hgt, 1));
  g.setIndex(idx);
  const offs = new Float32Array(N * N * 2);
  let k = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    offs[k++] = i - N / 2;
    offs[k++] = j - N / 2;
  }
  g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(offs, 2));
  g.instanceCount = N * N;

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        hMap: { value: heightTex.texture },
        hExtent: { value: heightTex.extent },
        center: { value: new THREE.Vector3() },
        cell: { value: cell },
        radius: { value: radius },
        time: { value: 0 },
        tipA: { value: new THREE.Vector3(...tips[0]) },
        tipB: { value: new THREE.Vector3(...tips[1]) },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      attribute vec2 iOffset;
      attribute float bladeH;
      uniform sampler2D hMap;
      uniform float hExtent, cell, radius, time;
      uniform vec3 center, tipA, tipB;
      varying float vH;
      varying vec3 vTip;
      varying float vShade;
      float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
      void main() {
        vec2 base = floor(center.xz / cell) * cell;
        vec2 wp = base + iOffset * cell;
        vec2 id = floor(wp / cell + 0.5);
        float r1 = h21(id), r2 = h21(id + 17.3), r3 = h21(id + 41.7), r4 = h21(id + 7.1);
        wp += (vec2(r1, r2) - 0.5) * cell * 0.9;
        vec4 hm = texture2D(hMap, (wp + hExtent) / (2.0 * hExtent));
        float dist = length(wp - center.xz);
        float fade = 1.0 - smoothstep(radius * 0.65, radius, dist);
        float alive = step(r3, hm.g) * fade;
        bool flower = r4 < 0.035;
        float h = (0.2 + 0.34 * r1) * (0.6 + 0.55 * hm.g) * alive * (flower ? 0.85 : 1.0);
        float ang = r2 * 6.2832;
        float ca = cos(ang), sa = sin(ang);
        vec3 p = position;
        p.xz = vec2(ca * p.x - sa * p.z, sa * p.x + ca * p.z) * (0.8 + 0.6 * r3) * step(0.001, alive);
        p.y *= h;
        float w = sin(time * 1.8 + wp.x * 0.33 + wp.y * 0.21) * 0.6 + sin(time * 3.1 + wp.x * 0.9 - wp.y * 0.4) * 0.25;
        float bend = bladeH * bladeH;
        p.x += w * 0.14 * bend * h;
        p.z += w * 0.07 * bend * h;
        vec3 world = vec3(wp.x + p.x, hm.r + p.y - 0.03, wp.y + p.z);
        vH = bladeH;
        vTip = mix(tipA, tipB, r1 * r1);
        if (flower) {
          vTip = r2 < 0.33 ? vec3(1.0, 0.95, 0.9) : r2 < 0.66 ? vec3(1.0, 0.8, 0.15) : vec3(0.6, 0.35, 1.0);
        }
        vShade = 0.75 + 0.35 * r3;
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying float vH;
      varying vec3 vTip;
      varying float vShade;
      void main() {
        vec3 baseC = vec3(0.025, 0.05, 0.015);
        vec3 c = mix(baseC, vTip, smoothstep(0.0, 1.0, vH)) * vShade;
        // warm sun + sky light approximation
        c *= vec3(0.98, 0.97, 0.88);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.name = 'grass';
  return mesh;
}

// ----------------------------------------------------------------- main
export function buildVegetation(m, tex, colliders, heightTex, quality, cfg = VEG_F1) {
  const group = new THREE.Group();
  group.name = 'vegetation';
  const rng = new RNG(cfg.seed);
  const heightAt = cfg.height;

  const F = shared();
  const rockMat = m.rock;
  const rock = rockGeometry(13);

  const oakLists = [[], []];
  const pineList = [];
  const bushList = [];
  const rockList = [];

  const okSpot = cfg.okSpot;
  const forests = cfg.forests;
  const place = (x, z, pineProb) => {
    const y = heightAt(x, z);
    const s = rng.range(0.8, 1.35);
    const t = { x, y: y - 0.2, z, s, rot: rng.range(0, Math.PI * 2) };
    if (rng.chance(pineProb)) pineList.push({ ...t, s: s * 1.0 });
    else oakLists[rng.int(0, 1)].push(t);
    colliders.addCircle(x, z, 0.45 * s);
  };
  for (const f of forests) {
    let placed = 0, tries = 0;
    while (placed < f.n && tries < f.n * 6) {
      tries++;
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * f.r;
      const x = f.x + Math.sin(a) * r, z = f.z + Math.cos(a) * r;
      if (!okSpot(x, z)) continue;
      place(x, z, f.pine);
      placed++;
    }
  }
  // sparse solitary trees in meadows
  for (let i = 0; i < cfg.meadow.n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(cfg.meadow.rmin, cfg.meadow.rmax);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!okSpot(x, z, 8)) continue;
    place(x, z, cfg.meadow.pine);
  }
  // lake ring
  const lake = cfg.lake;
  for (let i = 0; lake && i < 24; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = lake.r + rng.range(6, 18);
    const x = lake.x + Math.sin(a) * r, z = lake.z + Math.cos(a) * r;
    if (!okSpot(x, z)) continue;
    place(x, z, 0.1);
  }
  // bushes
  for (let i = 0; i < cfg.bushes; i++) {
    const f = rng.chance(0.6) ? rng.pick(forests) : { x: 0, z: 0, r: 460 };
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * f.r;
    const x = f.x + Math.sin(a) * r, z = f.z + Math.cos(a) * r;
    if (!okSpot(x, z, 3)) continue;
    const s = rng.range(0.5, 1.2);
    bushList.push({ x, y: heightAt(x, z) + 0.15 * s, z, s, rot: rng.range(0, 6) });
  }
  // rocks
  for (let i = 0; i < cfg.rocks.n; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(cfg.rocks.rmin, cfg.rocks.rmax);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (!okSpot(x, z, 3)) continue;
    const s = rng.chance(0.15) ? rng.range(2.5, 5) : rng.range(0.4, 1.6);
    rockList.push({ x, y: heightAt(x, z) - 0.15 * s, z, s, sy: s * rng.range(0.6, 1.1), rot: rng.range(0, 6), tilt: rng.range(-0.2, 0.2) });
    if (s > 1.2) colliders.addCircle(x, z, s * 0.9);
  }
  // rocks along the overlook cliff edge
  for (let i = 0; cfg.edgeRocks && i < 40; i++) {
    const a = rng.range(-0.6, 0.6);
    const r = WORLD_R - rng.range(2, 10);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const s = rng.range(1, 4);
    rockList.push({ x, y: heightAt(x, z) - 0.3 * s, z, s, sy: s * 0.7, rot: rng.range(0, 6) });
  }

  // no grass growing through rocks: clear the density channel under them
  {
    const tex = heightTex.texture;
    const data = tex.image.data;
    const size = tex.image.width;
    const cell = (2 * heightTex.extent) / size;
    const zero = THREE.DataUtils.toHalfFloat(0);
    for (const r of rockList) {
      const rad = r.s * 1.15;
      const i0 = Math.floor((r.x - rad + heightTex.extent) / cell), i1 = Math.ceil((r.x + rad + heightTex.extent) / cell);
      const j0 = Math.floor((r.z - rad + heightTex.extent) / cell), j1 = Math.ceil((r.z + rad + heightTex.extent) / cell);
      for (let j = Math.max(0, j0); j <= Math.min(size - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(size - 1, i1); i++) {
          const x = (i + 0.5) * cell - heightTex.extent, z = (j + 0.5) * cell - heightTex.extent;
          if (Math.hypot(x - r.x, z - r.z) < rad) data[(j * size + i) * 4 + 1] = zero;
        }
      }
    }
    tex.needsUpdate = true;
  }

  // town trees (plane trees) from the town layout
  const townTrees = [];
  return {
    group,
    addTownTrees(spots) {
      for (const t of spots) {
        townTrees.push({ x: t.x, y: 0.4, z: t.z, s: t.s * 1.1, rot: rng.range(0, 6) });
      }
    },
    finalize() {
      oakLists[0].push(...townTrees.slice(0, Math.ceil(townTrees.length / 2)));
      oakLists[1].push(...townTrees.slice(Math.ceil(townTrees.length / 2)));
      const near = { low: 55, medium: 75, high: 95 }[quality] || 75;
      const imp = new Impostors(cfg.renderer || RENDERER, F.species.map((sp, i) => ({
        meshes: [[sp.trunk, F.barkMat], [sp.leaves, i === 2 ? F.pineMat : F.leafMat]],
        bounds: sp.bounds,
      })), cfg.env || ENV);
      this.impostors = imp;
      this.lods = [];
      F.species.slice(0, 2).forEach((sp, i) => {
        this.lods.push(new TreeSet(oakLists[i], [[sp.trunk, F.barkMat, true], [sp.leaves, F.leafMat, true]], near, i));
      });
      const ps = F.species[2];
      this.lods.push(new TreeSet(pineList, [[ps.trunk, F.barkMat, true], [ps.leaves, F.pineMat, true]], near, 2));
      this.lods.push(new TreeSet(bushList, [[F.bush, F.bushMat, false]], near * 0.6));
      for (const l of this.lods) group.add(...l.meshes);
      group.add(imp.mesh);
      group.add(makeInstanced(rock, rockMat, rockList));
      this.counts = { oak: oakLists[0].length + oakLists[1].length, pine: pineList.length, bush: bushList.length, rock: rockList.length };
      this._lodPos = new THREE.Vector3(1e9, 0, 0);
      this.refreshLods(new THREE.Vector3(0, 0, 0));
    },
    refreshLods(center) {
      this.impostors.begin();
      for (const l of this.lods) l.update(center, this.impostors);
      this.impostors.end();
    },
    grass: buildGrass(heightTex, quality, cfg.grassTips),
    update(t, center) {
      windUniform.value = t;
      this.grass.material.uniforms.time.value = t;
      if (center) {
        this.grass.material.uniforms.center.value.copy(center);
        if (this.lods && this._lodPos.distanceToSquared(center) > 9) {
          this._lodPos.copy(center);
          this.refreshLods(center);
        }
      }
    },
  };
}
