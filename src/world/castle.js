// The floating-castle superstructure: the rocky underside of the floor above,
// the great outer pillars that hold the floors together, and the labyrinth
// tower that climbs from the fields all the way to the ceiling.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo, scaleUV, spireGeo } from '../core/geo.js';
import { fbm, ridged, RNG, smoothstep, lerp } from '../core/noise.js';
import { sharedFoliage } from './vegetation.js';
import { CEILING_Y, TOWER, WORLD_R, heightF1 } from './layout.js';

const CEIL_R = 540;

// Floor-1 defaults; floor 2 passes its own tower spot, terrain and seeds.
const F1 = { height: heightF1, tower: TOWER, seeds: [501, 503], rng: 99, overlook: true, crystal: 'crystal', crystalGlow: 0x3a88ff };

function buildCeiling(m, cfg) {
  const [S1, S2] = cfg.seeds;
  const radii = [];
  for (let r = 0; r <= CEIL_R; r += r < 300 ? 18 : 11) radii.push(r);
  if (radii[radii.length - 1] !== CEIL_R) radii.push(CEIL_R);
  const SEG = 160;
  // earthy strata, darker creases, moss creeping in near the rim
  const earth = (x, z, r, d, out) => {
    const n1 = fbm(x * 0.008, z * 0.008, 3, S1 + 7);
    const rg = ridged(x * 0.012, z * 0.012, 4, S2);
    const strata = 0.5 + 0.5 * Math.sin(d * 0.45 + n1 * 7);
    let k = lerp(0.24, 0.5, strata * 0.55 + n1 * 0.45) * (0.55 + 0.45 * rg);
    let cr = k * 1.15, cg = k * 0.84, cb = k * 0.6;
    const moss = smoothstep(CEIL_R - 120, CEIL_R - 25, r) * (0.35 + 0.65 * fbm(x * 0.03, z * 0.03, 2, 9));
    cr = lerp(cr, 0.16, moss); cg = lerp(cg, 0.25, moss); cb = lerp(cb, 0.1, moss);
    out.push(cr, cg, cb);
  };
  const verts = [], uvs = [], cols = [], idx = [];
  const disp = (x, z, r) => {
    const n = fbm(x * 0.004, z * 0.004, 5, S1);
    const rg = ridged(x * 0.012, z * 0.012, 4, S2);
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
      earth(x, z, r, d, cols);
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
      // grassy lip of the upper floor, raw rock below it
      if (y !== null && y > CEILING_Y + 25) cols.push(0.2, 0.3, 0.12);
      else cols.push(0.42, 0.36, 0.3);
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
      'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.5, 0.5, 0.56), 0.2);\n#include <fog_fragment>'
    );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = 'ceiling';
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function buildCastle(m, tex, colliders, glows, cfg = F1) {
  const heightAt = cfg.height;
  const [S1, S2] = cfg.seeds;
  const group = new THREE.Group();
  group.name = 'castle';
  group.add(buildCeiling(m, cfg));

  const b = new GeoBuilder();
  const rng = new RNG(cfg.rng);
  const stone = new THREE.Color('#a9a6a0');
  const darkStone = new THREE.Color('#8b8a90');

  // --- jagged stalactites, glowing crystal clusters and hanging vines
  const ceilAt = (x, z) => CEILING_Y - (10 + fbm(x * 0.004, z * 0.004, 5, S1) * 38 + ridged(x * 0.012, z * 0.012, 4, S2) * 14);
  const stalVariants = [0, 1, 2].map((v) => {
    const g = new THREE.ConeGeometry(1, 1, 7, 4);
    g.rotateX(Math.PI);
    g.translate(0, -0.5, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const a = Math.atan2(x, z);
      const j = 1 + (fbm(a * 2 + v * 5, y * 3, 3, 40 + v) - 0.5) * 0.9;
      p.setXYZ(i, x * j + Math.sin(y * 4 + v) * 0.08, y, z * j);
    }
    g.computeVertexNormals();
    scaleUV(g, 3, 3);
    return g;
  });
  const crystal = new THREE.OctahedronGeometry(1, 0);
  const vineCards = { pos: [], nor: [], uv: [], col: [] };
  const vine = (x, z, len, w, yaw) => {
    const y0 = ceilAt(x, z) + 2;
    const ax = Math.cos(yaw) * w * 0.5, az = -Math.sin(yaw) * w * 0.5;
    const quad = [
      [x - ax, y0, z - az, 0.504, 0],
      [x + ax, y0, z + az, 0.504, 1],
      [x + ax * 0.5, y0 - len, z + az * 0.5, 0.996, 1],
      [x - ax * 0.5, y0 - len, z - az * 0.5, 0.996, 0],
    ];
    for (const k of [0, 1, 2, 0, 2, 3]) {
      const q = quad[k];
      vineCards.pos.push(q[0], q[1], q[2]);
      vineCards.uv.push(q[3], q[4]);
      vineCards.nor.push(0, -0.8, 0.6);
      const sh = k >= 2 ? 0.55 : 0.85;
      vineCards.col.push(0.7 * sh, 0.85 * sh, 0.6 * sh);
    }
  };
  for (let i = 0; i < 200; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = Math.sqrt(rng.next()) * (CEIL_R - 60);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const base = ceilAt(x, z) + 6;
    const len = rng.range(10, 46);
    const w = rng.range(3.5, 10);
    const tint = new THREE.Color().setRGB(0.42, 0.36, 0.3).multiplyScalar(rng.range(0.6, 1.0));
    b.add('rock', stalVariants[i % 3], mat4(x, base, z, rng.range(0, 6), 0, 0, w, len, w), tint, { ao: false });
    // satellite spikes
    if (rng.chance(0.5)) {
      const s2 = rng.range(0.35, 0.6);
      b.add('rock', stalVariants[(i + 1) % 3], mat4(x + rng.range(-w, w), base, z + rng.range(-w, w), rng.range(0, 6), 0, 0, w * s2, len * s2, w * s2), tint, { ao: false });
    }
    if (rng.chance(0.28)) {
      const cl = rng.int(2, 5);
      for (let k = 0; k < cl; k++) {
        const s = rng.range(1.2, 3.2);
        b.add(cfg.crystal, crystal, mat4(x + rng.range(-3, 3), base - len * rng.range(0.4, 0.85), z + rng.range(-3, 3), rng.range(0, 3), rng.range(-0.4, 0.4), 0, s * 0.6, s * 2, s * 0.6), 0xffffff, { ao: false });
      }
      glows.add(x, base - len * 0.6, z, 9, cfg.crystalGlow, 0.15, 900);
    }
  }
  // vines: thick near the mossy rim, sparse elsewhere
  for (let i = 0; i < 170; i++) {
    const a = rng.range(0, Math.PI * 2);
    const rim = rng.chance(0.75);
    const r = rim ? rng.range(CEIL_R - 115, CEIL_R - 12) : Math.sqrt(rng.next()) * (CEIL_R - 140);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    const len = rng.range(18, rim ? 70 : 40);
    const w = rng.range(4, 9);
    const yaw = rng.range(0, Math.PI);
    vine(x, z, len, w, yaw);
    vine(x, z, len * 0.85, w * 0.9, yaw + Math.PI / 2);
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vineCards.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(vineCards.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(vineCards.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(vineCards.col, 3));
    g.computeBoundingSphere();
    const vines = new THREE.Mesh(g, sharedFoliage().vineMat);
    vines.name = 'vines';
    group.add(vines);
  }

  // --- waterfalls pouring off the rim of the floor above into the void
  const fallMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float time;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float v = vUv.y;
        float s1 = n(vec2(vUv.x * 24.0, v * 6.0 - time * 1.1));
        float s2 = n(vec2(vUv.x * 70.0 + 3.0, v * 16.0 - time * 2.4));
        float edge = smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
        float body = (0.3 + 0.5 * s1 + 0.25 * s2) * edge;
        float top = smoothstep(0.0, 0.015, v);
        float mist = 1.0 - smoothstep(0.45, 1.0, v);
        float a = clamp(body * top * mist, 0.0, 1.0) * 0.8;
        vec3 col = mix(vec3(0.72, 0.8, 0.9), vec3(1.0, 0.98, 0.95), s2);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  const falls = [];
  const fallAngles = cfg.falls ?? [0.39, 1.44, 2.5, 3.8, 4.85, 5.6];
  for (const fa of fallAngles) {
    const width = rng.range(16, 34);
    const segs = 28;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const r = CEIL_R + 3 + 16 * t + 34 * t * t;
      const y = CEILING_Y + 28 - t * 540;
      const w = width * (1 + 1.1 * t);
      const cx = Math.sin(fa) * r, cz = Math.cos(fa) * r;
      const tx = Math.cos(fa) * w * 0.5, tz = -Math.sin(fa) * w * 0.5;
      pos.push(cx - tx, y, cz - tz, cx + tx, y, cz + tz);
      uv.push(0, t, 1, t);
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, fallMat);
    mesh.renderOrder = 2;
    mesh.name = 'waterfall';
    group.add(mesh);
    falls.push(mesh);
    glows.add(Math.sin(fa) * (CEIL_R + 6), CEILING_Y + 22, Math.cos(fa) * (CEIL_R + 6), width * 0.7, 0xcfe6ff, 0.05, 2000);
  }
  group.userData.update = (t) => {
    fallMat.uniforms.time.value = t;
  };

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
  const T = cfg.tower;
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
  if (cfg.overlook) {
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
