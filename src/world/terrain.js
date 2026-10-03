// Terrain: a polar grid (dense near the town, sparse at the rim) with a
// splat shader that paints cobblestone / grass / dirt roads / rock per pixel.
import * as THREE from 'three';
import { heightF1, roadDistance, ROAD_SEGMENTS, WORLD_R, LAKE, TOWN } from './layout.js';
import { FIELDS, fieldAt } from './farmLayout.js';

// Floor-1 defaults; other floors pass their own height function, roads, lake…
const F1 = {
  height: heightF1,
  segs: ROAD_SEGMENTS,
  lake: LAKE,
  cobbleR: 113.4,
  grassTint: [1, 1, 1],
  fields: FIELDS,
};

// fields → shader uniforms (at least one entry; a far-away dummy if none)
export function fieldUniforms(fields = []) {
  const list = fields.length ? fields : [{ x: 1e5, z: 1e5, yaw: 0, hw: 1, hd: 1, crop: 0 }];
  return {
    A: list.map((f) => new THREE.Vector4(f.x, f.z, Math.cos(f.yaw), Math.sin(f.yaw))),
    B: list.map((f) => new THREE.Vector4(f.hw, f.hd, f.crop, 0)),
  };
}
export function fieldGLSL(n) {
  return `
uniform vec4 uFieldA[${n}];
uniform vec4 uFieldB[${n}];
// returns crop type in .x, inside-ness in .y, local coords in .zw
vec4 fieldInfo(vec2 p) {
  vec4 best = vec4(0.0);
  for (int i = 0; i < ${n}; i++) {
    vec2 d = p - uFieldA[i].xy;
    vec2 l = vec2(d.x * uFieldA[i].z - d.y * uFieldA[i].w, d.x * uFieldA[i].w + d.y * uFieldA[i].z);
    vec2 e = abs(l) - uFieldB[i].xy;
    float inside = 1.0 - smoothstep(-0.4, 0.25, max(e.x, e.y));
    if (inside > best.y) best = vec4(uFieldB[i].z, inside, l);
  }
  return best;
}`;
}
import { fbm, smoothstep } from '../core/noise.js';

function ringRadii() {
  const r = [0];
  let x = 0;
  while (x < WORLD_R) {
    const step = x < 100 ? 12 : x < 180 ? 3 : x < 320 ? 4 : 6;
    x = Math.min(WORLD_R, x + step);
    r.push(x);
  }
  return r;
}

export function buildTerrain(tex, cfg = F1) {
  const heightAt = cfg.height;
  const radii = ringRadii();
  const SEG = 288;
  const verts = [];
  const uvs = [];
  const idx = [];
  // center vertex
  verts.push(0, heightAt(0, 0), 0);
  uvs.push(0, 0);
  for (let ri = 1; ri < radii.length; ri++) {
    const r = radii[ri];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      verts.push(x, heightAt(x, z), z);
      uvs.push(x / 4, z / 4);
    }
  }
  const ringStart = (ri) => 1 + (ri - 1) * SEG;
  for (let s = 0; s < SEG; s++) {
    const a = ringStart(1) + s, b = ringStart(1) + ((s + 1) % SEG);
    idx.push(0, a, b);
  }
  for (let ri = 1; ri < radii.length - 1; ri++) {
    const r0 = ringStart(ri), r1 = ringStart(ri + 1);
    for (let s = 0; s < SEG; s++) {
      const s1 = (s + 1) % SEG;
      const a = r0 + s, b = r0 + s1, c = r1 + s, d = r1 + s1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({
    map: tex.grass.map,
    normalMap: tex.grass.normal,
    roughness: 0.95,
  });
  const segs = cfg.segs.map((s) => new THREE.Vector4(s[0], s[1], s[2], s[3]));
  const lake = cfg.lake || { x: 1e5, z: 1e5, r: 1, level: 0 };
  const fu = fieldUniforms(cfg.fields || []);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uFieldA = { value: fu.A };
    shader.uniforms.uFieldB = { value: fu.B };
    Object.assign(shader.uniforms, {
      tGrass: { value: tex.grass.map }, nGrass: { value: tex.grass.normal },
      tDirt: { value: tex.dirt.map }, nDirt: { value: tex.dirt.normal },
      tCobble: { value: tex.cobble.map }, nCobble: { value: tex.cobble.normal },
      tRock: { value: tex.rock.map }, nRock: { value: tex.rock.normal },
      uSegs: { value: segs },
      uLake: { value: new THREE.Vector4(lake.x, lake.z, lake.r, lake.level) },
      uGrassTint: { value: new THREE.Vector3(...cfg.grassTint) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying float vTUp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(transformed,1.0)).xyz;\nvTUp = normalize(mat3(modelMatrix) * objectNormal).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTW;
varying float vTUp;
uniform sampler2D tGrass, nGrass, tDirt, nDirt, tCobble, nCobble, tRock, nRock;
uniform vec4 uSegs[${segs.length}];
uniform vec4 uLake;
uniform vec3 uGrassTint;
${fieldGLSL(fu.A.length)}
vec4 splatW;
float segDist(vec2 p, vec4 s) {
  vec2 a = s.xy, b = s.zw;
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
vec4 computeSplat() {
  vec2 p = vTW.xz;
  float r = length(p);
  float n = texture2D(tRock, p / 23.0).g;
  float cob = 1.0 - smoothstep(${(cfg.cobbleR - 0.8).toFixed(2)}, ${(cfg.cobbleR + 0.8).toFixed(2)}, r + (n - 0.5) * 1.6);
  float rd = 1e5;
  for (int i = 0; i < ${segs.length}; i++) rd = min(rd, segDist(p, uSegs[i]));
  float dirt = 1.0 - smoothstep(2.0, 3.8, rd + (n - 0.5) * 2.2);
  float lk = length(p - uLake.xy);
  dirt = max(dirt, 1.0 - smoothstep(uLake.z * 0.95, uLake.z * 1.12, lk + (n - 0.5) * 4.0));
  float rock = smoothstep(0.22, 0.38, 1.0 - vTUp + (n - 0.5) * 0.12);
  vec4 w = vec4(0.0);
  w.z = cob;
  float rest = 1.0 - cob;
  w.w = rock * rest; rest -= w.w;
  w.y = dirt * rest; rest -= w.y;
  w.x = rest;
  return w;
}`
      )
      .replace(
        '#include <map_fragment>',
        `splatW = computeSplat();
{
  vec2 p = vTW.xz;
  vec4 g1 = texture2D(tGrass, p / 5.0);
  vec4 g2 = texture2D(tGrass, p / 17.3 + 0.37);
  vec4 grass = mix(g1, g2, 0.35) * (0.85 + 0.35 * texture2D(tDirt, p / 61.0).r);
  grass.rgb *= uGrassTint;
  vec4 dirt = texture2D(tDirt, p / 4.0);
  vec4 cob = texture2D(tCobble, p / 3.2) * vec4(1.1, 1.0, 0.86, 1.0);
  vec4 rock = texture2D(tRock, vec2(p.x + vTW.y * 0.7, p.y - vTW.y * 0.7) / 7.0) * vec4(0.55, 0.5, 0.44, 1.0);
  diffuseColor.rgb *= (grass * splatW.x + dirt * splatW.y + cob * splatW.z + rock * splatW.w).rgb;
  // farm fields: stubble under the wheat, crop rows, plowed furrows
  vec4 fi = fieldInfo(p);
  if (fi.y > 0.001) {
    float row = fi.z / 0.85;
    float furrow = 0.5 + 0.5 * sin(row * 6.2832);
    vec3 soil = mix(vec3(0.16, 0.11, 0.07), vec3(0.27, 0.19, 0.12), furrow) * (0.85 + 0.3 * dirt.r);
    vec3 fc;
    if (fi.x < 1.5) fc = mix(vec3(0.34, 0.24, 0.08), vec3(0.56, 0.41, 0.14), furrow * 0.6 + 0.4 * grass.g);
    else if (fi.x < 2.5) fc = mix(soil, vec3(0.13, 0.24, 0.06) * (0.8 + 0.4 * grass.g), smoothstep(0.55, 0.85, furrow));
    else fc = soil;
    diffuseColor.rgb = mix(diffuseColor.rgb, fc, fi.y);
    splatW = mix(splatW, vec4(0.0, 1.0, 0.0, 0.0), fi.y);
  }
}`
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = dot(splatW, vec4(0.95, 0.92, 0.9, 0.9));`
      )
      .replace(
        '#include <normal_fragment_maps>',
        `{
  vec2 p = vTW.xz;
  vec3 ng = texture2D(nGrass, p / 5.0).xyz;
  vec3 nd = texture2D(nDirt, p / 4.0).xyz;
  vec3 nc = texture2D(nCobble, p / 3.2).xyz;
  vec3 nr = texture2D(nRock, vec2(p.x + vTW.y * 0.7, p.y - vTW.y * 0.7) / 7.0).xyz;
  vec3 mapN = (ng * splatW.x + nd * splatW.y + nc * splatW.z + nr * splatW.w) * 2.0 - 1.0;
  mapN.xy *= 0.45 * splatW.x + 1.0 * splatW.y + 1.1 * splatW.z + 1.2 * splatW.w;
  normal = normalize(tbn * mapN);
}`
      );
  };
  // the shader bakes in the road count and paving radius: one program per floor
  mat.customProgramCacheKey = () => `terrain-${segs.length}-${cfg.cobbleR}`;
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Rocky underside of our floor: visible when looking over the edge at the overlook.
export function buildEdgeCliff(m, heightAt = heightF1) {
  const SEG = 180;
  const rings = [
    [WORLD_R, 0],
    [WORLD_R - 3, -10],
    [WORLD_R - 14, -40],
    [WORLD_R - 45, -90],
    [WORLD_R - 120, -150],
    [WORLD_R - 260, -190],
  ];
  const verts = [], uvs = [], idx = [];
  for (let ri = 0; ri < rings.length; ri++) {
    const [r, y] = rings[ri];
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const top = ri === 0 ? heightAt(Math.sin(a) * (WORLD_R - 0.5), Math.cos(a) * (WORLD_R - 0.5)) : 0;
      const jitter = ri === 0 ? 0 : (fbm(a * 12, ri * 3.1, 3, 5) - 0.5) * 18;
      const rr = r + (ri === 0 ? 0 : jitter);
      verts.push(Math.sin(a) * rr, (ri === 0 ? top : y + top * 0.3) + (ri ? jitter * 0.5 : 0), Math.cos(a) * rr);
      uvs.push((s / SEG) * 120, y / 8);
    }
  }
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let s = 0; s < SEG; s++) {
      const a = ri * (SEG + 1) + s, b = a + 1, c = a + SEG + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const cols = new Float32Array((verts.length / 3) * 3).fill(0.75);
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m.rock);
  mesh.name = 'edgeCliff';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Height + grass-density texture sampled by the GPU grass shader.
function densityF1(x, z) {
  const r = Math.hypot(x, z);
  if (r <= TOWN.safeR + 3 || r >= WORLD_R - 4) return 0;
  const rd = roadDistance(x, z);
  const lk = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (fieldAt(x, z, 1.5)) return 0;
  return smoothstep(3.2, 6, rd) * smoothstep(LAKE.r * 1.05, LAKE.r * 1.3, lk);
}

export function buildHeightTexture(size = 512, extent = 512, heightAt = heightF1, density = densityF1) {
  const data = new Uint16Array(size * size * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const H = new Float32Array(size * size);
  const cell = (2 * extent) / size;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * cell - extent;
      const z = (j + 0.5) * cell - extent;
      H[j * size + i] = heightAt(x, z);
    }
  }
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = (i + 0.5) * cell - extent;
      const z = (j + 0.5) * cell - extent;
      const h = H[j * size + i];
      let dens = density(x, z);
      {
        if (dens > 0) {
          dens *= 0.45 + 0.75 * fbm(x * 0.03, z * 0.03, 3, 201);
          const i1 = Math.min(size - 1, i + 1), j1 = Math.min(size - 1, j + 1);
          const hx = H[j * size + i1] - h, hz = H[j1 * size + i] - h;
          const slope = Math.hypot(hx, hz) / cell;
          dens *= 1 - smoothstep(0.45, 0.8, slope);
        }
      }
      const k = (j * size + i) * 4;
      data[k] = toHalf(h);
      data[k + 1] = toHalf(Math.min(1, dens));
      data[k + 2] = toHalf(0);
      data[k + 3] = toHalf(1);
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return { texture: t, extent, heights: H, size };
}
