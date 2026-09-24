// Terrain: a polar grid (dense near the town, sparse at the rim) with a
// splat shader that paints cobblestone / grass / dirt roads / rock per pixel.
import * as THREE from 'three';
import { heightAt, roadDistance, ROAD_SEGMENTS, WORLD_R, LAKE, TOWN } from './layout.js';
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

export function buildTerrain(tex) {
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
  const segs = ROAD_SEGMENTS.map((s) => new THREE.Vector4(s[0], s[1], s[2], s[3]));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tGrass: { value: tex.grass.map }, nGrass: { value: tex.grass.normal },
      tDirt: { value: tex.dirt.map }, nDirt: { value: tex.dirt.normal },
      tCobble: { value: tex.cobble.map }, nCobble: { value: tex.cobble.normal },
      tRock: { value: tex.rock.map }, nRock: { value: tex.rock.normal },
      uSegs: { value: segs },
      uLake: { value: new THREE.Vector4(LAKE.x, LAKE.z, LAKE.r, LAKE.level) },
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
  float cob = 1.0 - smoothstep(112.6, 114.2, r + (n - 0.5) * 1.6);
  float rd = 1e5;
  for (int i = 0; i < ${segs.length}; i++) rd = min(rd, segDist(p, uSegs[i]));
  float dirt = 1.0 - smoothstep(2.0, 3.8, rd + (n - 0.5) * 2.2);
  float lk = length(p - uLake.xy);
  dirt = max(dirt, 1.0 - smoothstep(uLake.z * 0.95, uLake.z * 1.12, lk + (n - 0.5) * 4.0));
  float rock = smoothstep(0.17, 0.3, 1.0 - vTUp + (n - 0.5) * 0.1);
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
  vec4 dirt = texture2D(tDirt, p / 4.0);
  vec4 cob = texture2D(tCobble, p / 3.2);
  vec4 rock = texture2D(tRock, vec2(p.x + vTW.y * 0.7, p.y - vTW.y * 0.7) / 7.0) * vec4(0.7, 0.66, 0.6, 1.0);
  diffuseColor.rgb *= (grass * splatW.x + dirt * splatW.y + cob * splatW.z + rock * splatW.w).rgb;
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
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

// Rocky underside of our floor: visible when looking over the edge at the overlook.
export function buildEdgeCliff(m) {
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
export function buildHeightTexture(size = 512, extent = 512) {
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
      const r = Math.hypot(x, z);
      let dens = 0;
      if (r > TOWN.safeR + 3 && r < WORLD_R - 4) {
        const rd = roadDistance(x, z);
        const lk = Math.hypot(x - LAKE.x, z - LAKE.z);
        dens = smoothstep(3.2, 6, rd) * smoothstep(LAKE.r * 1.05, LAKE.r * 1.3, lk);
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
