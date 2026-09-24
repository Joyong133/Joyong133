// The floating-castle superstructure: the rocky underside of the floor above,
// the great outer pillars that hold the floors together, and the labyrinth
// tower that climbs from the fields all the way to the ceiling.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo, scaleUV, spireGeo } from '../core/geo.js';
import { fbm, ridged, RNG, smoothstep } from '../core/noise.js';
import { CEILING_Y, TOWER, WORLD_R, heightAt } from './layout.js';

const CEIL_R = 540;

function buildCeiling(m) {
  const radii = [];
  for (let r = 0; r <= CEIL_R; r += r < 300 ? 22 : 14) radii.push(r);
  if (radii[radii.length - 1] !== CEIL_R) radii.push(CEIL_R);
  const SEG = 128;
  const verts = [], uvs = [], cols = [], idx = [];
  const disp = (x, z, r) => {
    const n = fbm(x * 0.004, z * 0.004, 5, 501);
    const rg = ridged(x * 0.012, z * 0.012, 4, 503);
    const edge = smoothstep(CEIL_R - 80, CEIL_R, r);
    return 10 + n * 38 + rg * 14 - edge * 30;
  };
  verts.push(0, CEILING_Y - disp(0, 0, 0), 0);
  uvs.push(0, 0);
  cols.push(0.55, 0.53, 0.5);
  for (let ri = 1; ri < radii.length; ri++) {
    const r = radii[ri];
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const d = disp(x, z, r);
      verts.push(x, CEILING_Y - d, z);
      uvs.push(x / 30, z / 30);
      const k = 0.34 + 0.12 * fbm(x * 0.02, z * 0.02, 2, 505);
      cols.push(k, k * 0.97, k * 0.93);
    }
  }
  const rs = (ri) => 1 + (ri - 1) * SEG;
  for (let s = 0; s < SEG; s++) idx.push(0, rs(1) + ((s + 1) % SEG), rs(1) + s);
  for (let ri = 1; ri < radii.length - 1; ri++) {
    for (let s = 0; s < SEG; s++) {
      const s1 = (s + 1) % SEG;
      const a = rs(ri) + s, b = rs(ri) + s1, c = rs(ri + 1) + s, d = rs(ri + 1) + s1;
      idx.push(a, b, c, b, d, c);
    }
  }
  // rim band going up to the next floor's surface
  const base = verts.length / 3;
  const outer = radii.length - 1;
  for (let s = 0; s <= SEG; s++) {
    const a = (s / SEG) * Math.PI * 2;
    for (const [dr, y] of [[0, null], [6, CEILING_Y - 20], [4, CEILING_Y + 20], [0, CEILING_Y + 34]]) {
      const r = CEIL_R + dr;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const yy = y === null ? CEILING_Y - disp(Math.sin(a) * CEIL_R, Math.cos(a) * CEIL_R, CEIL_R) : y + (fbm(a * 20, y, 2, 7) - 0.5) * 8;
      verts.push(x, yy, z);
      uvs.push(s * 1.5, yy / 12);
      cols.push(0.6, 0.58, 0.55);
    }
  }
  for (let s = 0; s < SEG; s++) {
    for (let k = 0; k < 3; k++) {
      const a = base + s * 4 + k, b = base + (s + 1) * 4 + k;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  void outer;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // aerial perspective: the ceiling is hundreds of meters away, tint it toward the sky
  const mat = m.rock.clone();
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.42, 0.5, 0.66), 0.42);\n#include <fog_fragment>'
    );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'ceiling';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function buildCastle(m, tex, colliders, glows) {
  const group = new THREE.Group();
  group.name = 'castle';
  group.add(buildCeiling(m));

  const b = new GeoBuilder();
  const rng = new RNG(99);
  const stone = new THREE.Color('#a9a6a0');
  const darkStone = new THREE.Color('#8b8a90');

  // --- stalactites + glowing crystal clusters hanging from the ceiling
  const stal = new THREE.ConeGeometry(1, 1, 7, 1);
  stal.rotateX(Math.PI);
  stal.translate(0, -0.5, 0);
  scaleUV(stal, 3, 3);
  const crystal = new THREE.OctahedronGeometry(1, 0);
  for (let i = 0; i < 160; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * (CEIL_R - 60);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const base = CEILING_Y - (10 + fbm(x * 0.004, z * 0.004, 5, 501) * 38 + ridged(x * 0.012, z * 0.012, 4, 503) * 14) + 6;
    const len = rng.range(12, 42);
    const w = rng.range(4, 10);
    b.add('rock', stal, mat4(x, base, z, rng.range(0, 6), 0, 0, w, len, w), stone.clone().multiplyScalar(0.5), { ao: false });
    if (rng.chance(0.3)) {
      const cl = rng.int(2, 4);
      for (let k = 0; k < cl; k++) {
        const s = rng.range(1.2, 3);
        b.add('crystal', crystal, mat4(x + rng.range(-3, 3), base - len * rng.range(0.4, 0.8), z + rng.range(-3, 3), rng.range(0, 3), rng.range(-0.4, 0.4), 0, s * 0.6, s * 2, s * 0.6), 0xffffff, { ao: false });
      }
      glows.add(x, base - len * 0.6, z, 9, 0x3a88ff, 0.15, 900);
    }
  }

  // --- great outer pillars that hold the floors together
  const PILLAR_R = WORLD_R + 22;
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + 0.13;
    const x = Math.sin(a) * PILLAR_R, z = Math.cos(a) * PILLAR_R;
    const bottom = -140;
    const top = CEILING_Y + 20;
    const h = top - bottom;
    b.add('stone', boxGeo(16, h, 16, 6), mat4(x, bottom + h / 2, z, a), darkStone);
    for (const [ox, oz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = new THREE.Vector3(ox * 8, 0, oz * 8).applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
      b.add('stone', boxGeo(3, h, 3, 6), mat4(x + p.x, bottom + h / 2, z + p.z, a), stone);
    }
    // horizontal bands
    for (let yb = 0; yb < 6; yb++) {
      const y = bottom + 40 + yb * 70;
      b.add('stone', boxGeo(20, 3.5, 20, 6), mat4(x, y, z, a), stone, { ao: false });
    }
    // flared capital into the ceiling
    b.add('stone', new THREE.CylinderGeometry(28, 10, 60, 4, 1, true, Math.PI / 4), mat4(x, top - 50, z, a), darkStone, { ao: false });
    glows.add(x - Math.sin(a) * 9, 20, z - Math.cos(a) * 9, 10, 0x6ab8ff, 0.2, 1400);
  }

  // --- labyrinth tower
  const T = TOWER;
  const ground = heightAt(T.x, T.z);
  const tiers = 9;
  const tierH = (CEILING_Y - ground) / tiers;
  const towerStone = new THREE.Color('#b3aea6');
  const facing = Math.atan2(-T.x, -T.z); // toward town
  for (let t = 0; t < tiers; t++) {
    const y0 = ground + t * tierH;
    const r = T.r * (1 - t * 0.035);
    const cyl = new THREE.CylinderGeometry(r * 0.98, r, tierH, 32, 1, true);
    scaleUV(cyl, (Math.PI * 2 * r) / 6, tierH / 6);
    b.add('stone', cyl, mat4(T.x, y0 + tierH / 2, T.z), t % 2 ? towerStone : towerStone.clone().multiplyScalar(0.92));
    // cornice
    const corn = new THREE.CylinderGeometry(r + 1.6, r + 0.4, 2.4, 32, 1, false);
    scaleUV(corn, (Math.PI * 2 * r) / 6, 0.4);
    b.add('stone', corn, mat4(T.x, y0 + tierH - 1, T.z), darkStone, { ao: false });
    // ribs + windows
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rx = T.x + Math.sin(a) * (r + 0.6), rz = T.z + Math.cos(a) * (r + 0.6);
      b.add('stone', boxGeo(2.2, tierH, 1.6, 6), mat4(rx, y0 + tierH / 2, rz, a), darkStone, { ao: false });
      if (t > 0 && (k + t) % 4 === 0) {
        const wa = a + Math.PI / 16;
        const wx = T.x + Math.sin(wa) * (r + 0.2), wz = T.z + Math.cos(wa) * (r + 0.2);
        glows.add(wx, y0 + tierH * 0.5, wz, 3, 0x6e98d8, 0.3, 1600);
      }
    }
  }
  // tower gate facing town
  {
    const gx = T.x + Math.sin(facing) * (T.r + 1), gz = T.z + Math.cos(facing) * (T.r + 1);
    const M = mat4(gx, ground, gz, facing);
    const put = (geo, x, y, z, tint, o) => b.add('stone', geo, M.clone().multiply(mat4(x, y, z)), tint, o);
    put(boxGeo(26, 30, 6, 4), 0, 15, 0, darkStone);
    b.add('plain', new THREE.PlaneGeometry(10, 18), M.clone().multiply(mat4(0, 9, 3.05)), 0x0c1830, { ao: false });
    for (let k = 0; k < 3; k++) put(boxGeo(30 - k * 3, 1, 10 - k * 2), 0, 0.5 + k, 6 + k * 1.5, towerStone);
    const gp = new THREE.Vector3(0, 9, 3.6).applyMatrix4(M);
    glows.add(gp.x, gp.y, gp.z, 16, 0x5aa0ff, 0.15, 1600);
    for (const s of [-1, 1]) {
      put(boxGeo(4, 40, 4, 4), s * 12, 20, 1, stone);
      b.add('roof', spireGeo(3.2, 10, 4), M.clone().multiply(mat4(s * 12, 40, 1)), new THREE.Color('#4a5160'), { ao: false });
      const fp = new THREE.Vector3(s * 7, 4, 7).applyMatrix4(M);
      glows.add(fp.x, fp.y, fp.z, 3, 0xff9a40, 0.5, 900);
    }
  }
  colliders.addCircle(T.x, T.z, T.r + 1.5);

  // world's-end overlook: stone railing along the cliff edge
  {
    const railR = 498;
    const a0 = -0.07, a1 = 0.15;
    const steps = Math.ceil(((a1 - a0) * railR) / 2.4);
    const post = boxGeo(0.35, 1.1, 0.35, 1);
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      const x = Math.sin(a) * railR, z = Math.cos(a) * railR;
      const y = heightAt(Math.sin(a) * (railR - 1), Math.cos(a) * (railR - 1));
      b.add('stone', post, mat4(x, y + 0.5, z, a), stone);
      b.add('stone', boxGeo(0.5, 0.15, 0.5, 1), mat4(x, y + 1.1, z, a), stone, { ao: false });
      if (i < steps) {
        const am = a + (a1 - a0) / steps / 2;
        const len = ((a1 - a0) / steps) * railR;
        const xm = Math.sin(am) * railR, zm = Math.cos(am) * railR;
        const ym = heightAt(Math.sin(am) * (railR - 1), Math.cos(am) * (railR - 1));
        b.add('stone', boxGeo(len, 0.14, 0.24, 1), mat4(xm, ym + 0.95, zm, am), stone, { ao: false });
        b.add('stone', boxGeo(len, 0.1, 0.18, 1), mat4(xm, ym + 0.4, zm, am), stone, { ao: false });
      }
    }
  }

  group.add(b.build(m, { name: 'castle', castShadow: false, receiveShadow: false }));
  return { group, towerGate: new THREE.Vector3(T.x + Math.sin(facing) * (T.r + 10), ground, T.z + Math.cos(facing) * (T.r + 10)) };
}
