// Farmland outside the floor-1 walls: a windmill with turning sails, a
// farmhouse and barn, fenced fields, haystacks, scarecrows, cabbage rows and
// a GPU wheat field whose ears roll in wind waves.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo, quadGeo, gableGeo, scaleUV, spireGeo } from '../core/geo.js';
import { RNG } from '../core/noise.js';
import { FARM_CLUSTERS, FIELDS, CROP, nearFarms } from './farmLayout.js';
import { fieldUniforms, fieldGLSL } from './terrain.js';
import { addHouse } from './town.js';

const col = (h) => new THREE.Color(h);

function M(cl, rOff, tOff, yawOff = 0, heightAt, lift = 0) {
  const x = cl.cx + cl.rx * rOff + cl.tx * tOff;
  const z = cl.cz + cl.rz * rOff + cl.tz * tOff;
  return { x, z, y: heightAt(x, z) + lift, yaw: cl.yaw + yawOff };
}

// ------------------------------------------------------------------ windmill
function addWindmill(b, glows, colliders, p) {
  const T = mat4(p.x, p.y - 0.3, p.z, p.yaw);
  const put = (key, geo, x, y, z, tint, ry = 0, rx = 0, rz = 0, o) => b.add(key, geo, T.clone().multiply(mat4(x, y, z, ry, rx, rz)), tint, o);
  // octagon rotated so a flat face points forward (+Z) for the door
  const base = new THREE.CylinderGeometry(3.3, 4.3, 11, 8, 1);
  scaleUV(base, 13, 5.5);
  put('stone', base, 0, 5.5, 0, col('#d8cfbf'), Math.PI / 8);
  const cap = new THREE.CylinderGeometry(3.6, 3.4, 2.4, 8, 1);
  scaleUV(cap, 11, 1.2);
  put('wood', cap, 0, 12.2, 0, col('#8a6a4a'), Math.PI / 8);
  put('roof', spireGeo(4.4, 5.2, 8), 0, 13.4, 0, col('#6b4a36'), Math.PI / 8, 0, 0, { ao: false });
  put('metal', new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), 0, 19.2, 0, col('#d4a64a'), 0, 0, 0, { ao: false });
  // door, windows, base stones
  const apo = Math.cos(Math.PI / 8);
  const rAt = (y) => (4.3 - y / 11) * apo + 0.03;
  put('door', quadGeo(1.5, 2.4), 0, 1.25, rAt(1.25), 0xffffff, 0, -0.09, 0, { ao: false });
  for (const [y, a] of [[5, Math.PI / 4], [8.2, -Math.PI / 4], [5.6, (3 * Math.PI) / 4]]) {
    const r = rAt(y);
    put('window', quadGeo(0.8, 1.1, 0, 0, 0.5, 1), Math.sin(a) * r, y, Math.cos(a) * r, 0xffffff, a, -0.09, 0, { ao: false });
  }
  put('stone', new THREE.CylinderGeometry(4.6, 4.9, 0.5, 8), 0, 0.2, 0, col('#bdb4a4'));
  // small balcony ring
  put('wood', new THREE.TorusGeometry(3.7, 0.08, 4, 16), 0, 10.9, 0, col('#5a3d2b'), 0, Math.PI / 2, 0, { ao: false });
  colliders.addCircle(p.x, p.z, 4.5);
  const lamp = new THREE.Vector3(0.9, 2.7, 4.3).applyMatrix4(T);
  glows.add(lamp.x, lamp.y, lamp.z, 1.1, 0xffa556, 0.3);
  // sails hub position (front, toward town)
  return new THREE.Vector3(0, 12.4, 3.9).applyMatrix4(T);
}

function buildSails(m, hub, yaw) {
  const b = new GeoBuilder();
  const wood = col('#6a4a34');
  const cloth = col('#efe6d2');
  b.add('wood', boxGeo(0.9, 0.9, 0.9, 1), mat4(0, 0, 0.2), wood, { ao: false });
  for (let k = 0; k < 4; k++) {
    const R = mat4(0, 0, 0, 0, 0, (k / 4) * Math.PI * 2);
    const put = (key, geo, x, y, z, tint) => b.add(key, geo, R.clone().multiply(mat4(x, y, z)), tint, { ao: false });
    put('wood', boxGeo(0.28, 11.5, 0.22, 1), 0, 6.2, 0, wood);
    // lattice frame
    put('wood', boxGeo(0.08, 9.4, 0.1, 1), 1.0, 6.9, -0.05, wood);
    put('wood', boxGeo(0.08, 9.4, 0.1, 1), 2.6, 6.9, -0.05, wood);
    for (let j = 0; j < 7; j++) put('wood', boxGeo(1.8, 0.07, 0.08, 1), 1.8, 2.5 + j * 1.45, -0.05, wood);
    put('fabric', boxGeo(1.55, 8.9, 0.03, 1), 1.8, 7.0, -0.1, cloth);
  }
  const g = b.build(m, { name: 'sails', castShadow: true });
  const pivot = new THREE.Group();
  pivot.position.copy(hub);
  pivot.rotation.set(-0.12, yaw, 0, 'YXZ');
  const spin = new THREE.Group();
  spin.add(g);
  pivot.add(spin);
  pivot.userData.spin = spin;
  return pivot;
}

// ------------------------------------------------------------------ props
function addFence(b, colliders, f, heightAt, gateSide = 1) {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const toW = (lx, lz) => ({ x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c });
  const wood = col('#7a5a3e');
  const edges = [
    [[-f.hw - 1, -f.hd - 1], [f.hw + 1, -f.hd - 1]],
    [[f.hw + 1, -f.hd - 1], [f.hw + 1, f.hd + 1]],
    [[f.hw + 1, f.hd + 1], [-f.hw - 1, f.hd + 1]],
    [[-f.hw - 1, f.hd + 1], [-f.hw - 1, -f.hd - 1]],
  ];
  const post = boxGeo(0.14, 1.25, 0.14, 1);
  edges.forEach(([a, bb], ei) => {
    const len = Math.hypot(bb[0] - a[0], bb[1] - a[1]);
    const n = Math.ceil(len / 3);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      // leave a gate gap in the middle of one edge
      if (ei === (gateSide > 0 ? 2 : 0) && Math.abs((t0 + t1) / 2 - 0.5) < 0.08) continue;
      const pa = toW(a[0] + (bb[0] - a[0]) * t0, a[1] + (bb[1] - a[1]) * t0);
      const pb = toW(a[0] + (bb[0] - a[0]) * t1, a[1] + (bb[1] - a[1]) * t1);
      const ya = heightAt(pa.x, pa.z), yb = heightAt(pb.x, pb.z);
      b.add('wood', post, mat4(pa.x, ya + 0.55, pa.z, f.yaw), wood);
      const mx = (pa.x + pb.x) / 2, mz = (pa.z + pb.z) / 2, my = (ya + yb) / 2;
      const segLen = Math.hypot(pb.x - pa.x, pb.z - pa.z);
      const ryaw = Math.atan2(pb.x - pa.x, pb.z - pa.z) + Math.PI / 2;
      const tilt = Math.atan2(yb - ya, segLen);
      for (const h of [0.5, 0.95]) b.add('wood', boxGeo(segLen + 0.1, 0.09, 0.06, 1), mat4(mx, my + h, mz, ryaw, 0, -tilt), wood, { ao: false });
    }
  });
}

function addHaystack(b, colliders, x, y, z, rng) {
  const straw = col('#d6b25e');
  if (rng.chance(0.5)) {
    // round bale lying on its side
    const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 14);
    scaleUV(g, 2, 1);
    b.add('plain', g, mat4(x, y + 0.72, z, rng.range(0, 3), 0, Math.PI / 2), straw.clone().multiplyScalar(rng.range(0.85, 1.05)));
    colliders.addCircle(x, z, 0.8);
  } else {
    // classic stack
    const g = new THREE.SphereGeometry(1.5, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.62);
    b.add('plain', g, mat4(x, y - 0.3, z, rng.range(0, 3), 0, 0, 1, 1.45, 1), straw.clone().multiplyScalar(rng.range(0.8, 0.95)));
    colliders.addCircle(x, z, 1.5);
  }
}

function addScarecrow(b, x, y, z, yaw) {
  const T = mat4(x, y, z, yaw);
  const put = (key, geo, px, py, pz, tint, rz = 0) => b.add(key, geo, T.clone().multiply(mat4(px, py, pz, 0, 0, rz)), tint, { ao: false });
  put('wood', boxGeo(0.1, 2.4, 0.1, 1), 0, 1.2, 0, col('#6a4a34'));
  put('wood', boxGeo(1.6, 0.08, 0.08, 1), 0, 1.75, 0, col('#6a4a34'));
  put('plain', boxGeo(0.62, 0.75, 0.32, 1), 0, 1.55, 0, col('#7a4a3a'));
  put('plain', boxGeo(1.5, 0.18, 0.2, 1), 0, 1.78, 0, col('#6a3a2e'));
  put('plain', new THREE.SphereGeometry(0.2, 10, 8), 0, 2.15, 0, col('#d8c08a'));
  put('plain', new THREE.ConeGeometry(0.34, 0.36, 10), 0, 2.42, 0, col('#5a4a2a'));
  put('plain', new THREE.CylinderGeometry(0.42, 0.42, 0.04, 12), 0, 2.27, 0, col('#5a4a2a'));
}

function addCabbages(b, f, heightAt, rng) {
  const c = Math.cos(f.yaw), s = Math.sin(f.yaw);
  const g = new THREE.IcosahedronGeometry(0.26, 0);
  const green = [col('#3f6a26'), col('#4a7a2e'), col('#36602a')];
  for (let lx = -f.hw + 0.6; lx < f.hw - 0.4; lx += 0.85) {
    for (let lz = -f.hd + 0.5; lz < f.hd - 0.4; lz += 0.8) {
      if (rng.chance(0.12)) continue;
      const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
      const sc = rng.range(0.7, 1.15);
      b.add('plain', g, mat4(x, heightAt(x, z) + 0.12 * sc, z, rng.range(0, 6), 0, 0, sc, sc * 0.75, sc), rng.pick(green), { ao: false });
    }
  }
}

// ------------------------------------------------------------------ GPU wheat
class Wheat {
  constructor(heightTex, quality, fields) {
    const cfg = { low: [0.46, 13], medium: [0.36, 18], high: [0.31, 24] }[quality] || [0.36, 18];
    const [cell, radius] = cfg;
    this.radius = radius;
    const N = Math.ceil((radius * 2) / cell);
    // one tuft = 3 stalks (thin stem + ear)
    const pos = [], hgt = [], idx = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const ox = Math.cos(a) * 0.08 * (k % 2 ? 1 : 0.5), oz = Math.sin(a) * 0.08 * (k % 2 ? 1 : 0.5);
      const px = -Math.sin(a + 0.6) * 0.008, pz = Math.cos(a + 0.6) * 0.008;
      const base = pos.length / 3;
      // stem
      pos.push(ox - px, 0, oz - pz, ox + px, 0, oz + pz, ox - px, 0.72, oz - pz, ox + px, 0.72, oz + pz);
      hgt.push(0, 0, 0.72, 0.72);
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      // ear (wider)
      const e = pos.length / 3;
      const ex = px * 2.4, ez = pz * 2.4;
      pos.push(ox - ex, 0.72, oz - ez, ox + ex, 0.72, oz + ez, ox - ex * 0.5, 1.0, oz - ez * 0.5, ox + ex * 0.5, 1.0, oz + ez * 0.5);
      hgt.push(0.72, 0.72, 1, 1);
      idx.push(e, e + 1, e + 2, e + 1, e + 3, e + 2);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('stalkH', new THREE.Float32BufferAttribute(hgt, 1));
    g.setIndex(idx);
    const offs = new Float32Array(N * N * 2);
    let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { offs[k++] = i - N / 2; offs[k++] = j - N / 2; }
    g.setAttribute('iOffset', new THREE.InstancedBufferAttribute(offs, 2));
    g.instanceCount = N * N;
    const fu = fieldUniforms(fields);
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { hMap: { value: null }, hExtent: { value: heightTex.extent }, center: { value: new THREE.Vector3() }, cell: { value: cell }, radius: { value: radius }, time: { value: 0 } },
      ]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        ${fieldGLSL(fu.A.length)}
        attribute vec2 iOffset;
        attribute float stalkH;
        uniform sampler2D hMap;
        uniform float hExtent, cell, radius, time;
        uniform vec3 center;
        varying float vH;
        varying float vShade;
        varying float vEar;
        float h21(vec2 p) { p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
        void main() {
          vec2 base = floor(center.xz / cell) * cell;
          vec2 wp = base + iOffset * cell;
          vec2 id = floor(wp / cell + 0.5);
          float r1 = h21(id), r2 = h21(id + 17.3), r3 = h21(id + 41.7);
          wp += (vec2(r1, r2) - 0.5) * cell * 0.9;
          vec4 fi = fieldInfo(wp);
          float wheat = (abs(fi.x - 1.0) < 0.5 ? 1.0 : 0.0) * step(0.5, fi.y);
          float dist = length(wp - center.xz);
          float fade = 1.0 - smoothstep(radius * 0.7, radius, dist);
          float alive = wheat * fade;
          vec4 hm = texture2D(hMap, (wp + hExtent) / (2.0 * hExtent));
          float H = (0.82 + 0.3 * r3) * alive;
          float ang = r2 * 6.2832;
          vec3 p = position;
          p.xz = vec2(cos(ang) * p.x - sin(ang) * p.z, sin(ang) * p.x + cos(ang) * p.z) * step(0.001, alive);
          p.y *= H;
          // rolling wind waves across the field + small jitter
          vec2 wdir = normalize(vec2(0.8, 0.45));
          float wave = sin(dot(wp, wdir) * 0.35 - time * 1.7) * 0.5 + 0.5;
          float bend = (0.12 + 0.35 * wave) * stalkH * stalkH;
          p.xz += wdir * bend * H + vec2(sin(time * 3.1 + r1 * 20.0), cos(time * 2.7 + r2 * 20.0)) * 0.03 * stalkH;
          p.y -= bend * bend * 0.25 * H;
          vec3 world = vec3(wp.x + p.x, hm.r + p.y - 0.02, wp.y + p.z);
          vH = stalkH;
          vEar = step(0.73, stalkH);
          vShade = (0.8 + 0.3 * r3) * (0.85 + 0.3 * wave);
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        varying float vH;
        varying float vShade;
        varying float vEar;
        void main() {
          vec3 stem = mix(vec3(0.12, 0.1, 0.03), vec3(0.46, 0.36, 0.12), vH);
          vec3 ear = vec3(0.66, 0.46, 0.14);
          vec3 c = mix(stem, ear, vEar) * vShade;
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true,
      side: THREE.DoubleSide,
    });
    this.material.uniforms.hMap.value = heightTex.texture;
    this.material.uniforms.uFieldA = { value: fu.A };
    this.material.uniforms.uFieldB = { value: fu.B };
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'wheat';
    this.fields = fields;
  }
  update(t, center) {
    this.material.uniforms.time.value = t;
    if (center) {
      this.material.uniforms.center.value.copy(center);
      this.mesh.visible = nearFarms(center.x, center.z, this.radius + 4, this.fields);
    }
  }
}

// ------------------------------------------------------------------ main
export function buildFarms(m, colliders, glows, heightAt, heightTex, quality) {
  const group = new THREE.Group();
  group.name = 'farms';
  const b = new GeoBuilder();
  const rng = new RNG(4711);
  const sails = [];
  FARM_CLUSTERS.forEach((cl, ci) => {
    cl.fields.forEach((f, fi) => {
      addFence(b, colliders, f, heightAt, fi % 2 ? 1 : -1);
      if (f.crop === CROP.veg) addCabbages(b, f, heightAt, rng);
    });
    const depth = Math.max(...cl.fields.map((f) => f.hd)) * 2 + 6;
    if (ci === 0) {
      // windmill on the outer edge, farmhouse + barn beside the fields
      const wp = M(cl, depth + 8, 0, Math.PI, heightAt);
      const hub = addWindmill(b, glows, colliders, wp);
      const sp = buildSails(m, hub, wp.yaw);
      group.add(sp);
      sails.push(sp);
      const hp = M(cl, depth + 2, -38, Math.PI, heightAt);
      let lo = Infinity;
      for (const [ox, oz] of [[-5, -4], [5, -4], [-5, 4], [5, 4], [0, 0]]) lo = Math.min(lo, heightAt(hp.x + ox, hp.z + oz));
      b.add('stone', boxGeo(9.6, 3, 8.1, 2), mat4(hp.x, lo - 1.4, hp.z, hp.yaw), col('#bdb4a4'));
      addHouse(b, glows, hp.x, hp.z, hp.yaw, {
        y: lo,
        w: 9, d: 7.5, floors: 2, fh: 3, style: 'timber', jetty: false, roofType: 'side', pitch: 0.8,
        plaster: '#efe2c8', stone: '#cfc6b6', roof: '#7a5236', shutter: '#3f6d52', flowers: true, balcony: false, chimney: true, lit: 0.5, shop: null, backDoor: false, braces: true,
      }, rng);
      colliders.addBox(hp.x, hp.z, 4.7, 4.3, hp.yaw);
      // barn
      const bp = M(cl, depth + 3, 38, Math.PI, heightAt);
      let blo = Infinity;
      for (const [ox, oz] of [[-5, -7], [5, -7], [-5, 7], [5, 7]]) blo = Math.min(blo, heightAt(bp.x + ox, bp.z + oz));
      b.add('stone', boxGeo(10.4, 3, 14.4, 2), mat4(bp.x, blo - 1.3, bp.z, bp.yaw), col('#bdb4a4'));
      const T = mat4(bp.x, blo, bp.z, bp.yaw);
      const put = (key, geo, x, y, z, tint, ry = 0, rx = 0, o) => b.add(key, geo, T.clone().multiply(mat4(x, y, z, ry, rx)), tint, o);
      put('wood', boxGeo(10, 5, 14, 2), 0, 2.5, 0, col('#9a4a32'));
      put('wood', gableGeo(10, 3.6, 0.3, 2), 0, 5, 6.9, col('#9a4a32'), 0, 0, { ao: false });
      put('wood', gableGeo(10, 3.6, 0.3, 2), 0, 5, -6.9, col('#9a4a32'), 0, 0, { ao: false });
      for (const s of [-1, 1]) put('roof', boxGeo(14.6, 0.18, 6.6, 2), s * 2.6, 6.85, 0, col('#5a5048'), Math.PI / 2, s * -0.62, { ao: false });
      put('door', quadGeo(3.6, 3.8), 0, 1.95, 7.06, 0xddccbb, 0, 0, { ao: false });
      put('wood', boxGeo(3.9, 0.18, 0.12, 1), 0, 3.95, 7.1, col('#e8e0d0'), 0, 0, { ao: false });
      colliders.addBox(bp.x, bp.z, 5.1, 7.1, bp.yaw);
      for (let k = 0; k < 5; k++) {
        const hs = M(cl, depth + 3 + rng.range(-6, 8), 50 + rng.range(-3, 6), 0, heightAt);
        addHaystack(b, colliders, hs.x, hs.y, hs.z, rng);
      }
    } else {
      // smaller cluster: a scarecrow and some bales
      const f = cl.fields[0];
      addScarecrow(b, f.x, heightAt(f.x, f.z), f.z, cl.yaw + Math.PI);
      for (let k = 0; k < 4; k++) {
        const hs = M(cl, depth / 2 + 4 + rng.range(0, 6), rng.range(-24, 24), 0, heightAt);
        addHaystack(b, colliders, hs.x, hs.y, hs.z, rng);
      }
    }
  });
  group.add(b.build(m, { name: 'farms', castShadow: true }));
  const wheat = new Wheat(heightTex, quality, FIELDS);
  group.add(wheat.mesh);
  return {
    group,
    update(t, center) {
      for (const s of sails) s.userData.spin.rotation.z = -t * 0.55;
      wheat.update(t, center);
    },
  };
}
