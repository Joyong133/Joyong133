// Teleport gates ("전이문"): the grand gate in the central plaza and a smaller
// one at the field outpost. Swirling portal shader + rising motes + rune circle.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo, archRingGeo, scaleUV } from '../core/geo.js';
import { heightF1 as heightAt, OUTPOST } from './layout.js';

function portalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, intensity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time, intensity;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        p.y = p.y * 1.25 + 0.2;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = n(vec2(a * 3.0 + r * 6.0 - time * 1.5, r * 4.0 - time)) * 0.6
                    + n(vec2(a * 6.0 - r * 9.0 + time * 2.2, r * 8.0)) * 0.4;
        float rim = smoothstep(1.05, 0.7, r);
        float core = smoothstep(0.8, 0.0, r);
        vec3 c = mix(vec3(0.1, 0.35, 1.0), vec3(0.5, 0.9, 1.0), swirl);
        c += vec3(0.5, 0.8, 1.0) * core * 0.25;
        float ring = smoothstep(0.08, 0.0, abs(r - 0.93 + 0.03 * sin(a * 12.0 + time * 3.0)));
        c += vec3(0.6, 0.85, 1.0) * ring * 1.5;
        float alpha = rim * (0.55 + 0.45 * swirl) + ring;
        gl_FragColor = vec4(c * intensity * 0.6, clamp(alpha, 0.0, 1.0) * 0.7);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

function runeMaterial(tex) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(0.35, 0.75, 1.6),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
}

function motes(count, radius, height) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const s = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * radius;
    p[i * 3] = Math.sin(a) * r;
    p[i * 3 + 1] = Math.random() * height;
    p[i * 3 + 2] = Math.cos(a) * r;
    s[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, height: { value: height }, scale: { value: 700 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float time, height, scale;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = fract(seed + time * (0.08 + seed * 0.08));
        p.y = t * height;
        p.x += sin(time * 0.7 + seed * 30.0) * 0.3;
        p.z += cos(time * 0.6 + seed * 20.0) * 0.3;
        vA = sin(t * 3.14159);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = scale * (0.05 + seed * 0.05) / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        gl_FragColor = vec4(vec3(0.5, 0.85, 1.0) * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}

export function makeGate(b, group, mats, glows, colliders, pos, yaw, scale) {
  const M = mat4(pos.x, pos.y, pos.z, yaw, 0, 0, scale, scale, scale);
  const stone = new THREE.Color('#e4dccb');
  const trim = new THREE.Color('#b9ad97');
  const gold = 0xcfa24a;
  const add = (key, geo, x, y, z, tint, ry = 0, o) => b.add(key, geo, M.clone().multiply(mat4(x, y, z, ry)), tint, o);
  // dais
  const d1 = new THREE.CylinderGeometry(8.2, 8.6, 0.3, 48);
  scaleUV(d1, 26, 0.3);
  const d2 = new THREE.CylinderGeometry(6.8, 7.1, 0.3, 48);
  scaleUV(d2, 22, 0.3);
  add('stone', d1, 0, 0.15, 0, trim);
  add('stone', d2, 0, 0.45, 0, stone);
  // pillars
  for (const s of [-1, 1]) {
    add('stone', boxGeo(1.5, 0.6, 1.5, 1), s * 3.6, 0.9, 0, trim);
    const col = new THREE.CylinderGeometry(0.55, 0.6, 5.2, 16);
    scaleUV(col, 2, 2.6);
    add('stone', col, s * 3.6, 3.8, 0, stone);
    add('stone', boxGeo(1.5, 0.5, 1.5, 1), s * 3.6, 6.65, 0, trim);
    // floating crystal on top
    add('crystal', new THREE.OctahedronGeometry(0.45, 0), s * 3.6, 7.6, 0, 0xffffff, 0, { ao: false });
    const gp = new THREE.Vector3(s * 3.6, 7.6, 0).applyMatrix4(M);
    glows.add(gp.x, gp.y, gp.z, 2.2 * scale, 0x5ab4ff, 0.2);
    if (colliders) {
      const cp = new THREE.Vector3(s * 3.6, 0, 0).applyMatrix4(M);
      colliders.addCircle(cp.x, cp.z, 0.8 * scale);
    }
  }
  // arch
  add('stone', archRingGeo(3.0, 4.2, 1.3, 24), 0, 6.9, 0, stone);
  add('stone', archRingGeo(4.2, 4.5, 1.5, 24), 0, 6.9, 0, trim, 0, { ao: false });
  add('metal', boxGeo(0.5, 0.8, 1.6, 1), 0, 11.3, 0, gold, 0, { ao: false });
  // portal surface
  const portal = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 9.4), mats.portal);
  portal.position.set(0, 0.6 + 4.7, 0);
  const pg = new THREE.Group();
  pg.position.copy(pos);
  pg.rotation.y = yaw;
  pg.scale.setScalar(scale);
  pg.add(portal);
  // rune circle
  const rune = new THREE.Mesh(new THREE.CircleGeometry(6.6, 64), mats.rune);
  rune.rotation.x = -Math.PI / 2;
  rune.position.y = 0.62;
  pg.add(rune);
  const mo = motes(90, 5.5, 9);
  pg.add(mo);
  mats.motes.push(mo.material);
  group.add(pg);
  const cg = new THREE.Vector3(0, 5, 0).applyMatrix4(M);
  glows.add(cg.x, cg.y, cg.z, 7 * scale, 0x2a5cc0, 0.1);
  return { pos: pos.clone(), yaw, scale, rune, portal };
}

export function gateMaterials(tex) {
  return { portal: portalMaterial(), rune: runeMaterial(tex.rune), motes: [] };
}

export function updateGateMaterials(mats, t) {
  mats.portal.uniforms.time.value = t;
  for (const mm of mats.motes) mm.uniforms.time.value = t;
}

export function buildGates(m, tex, colliders, glows) {
  const group = new THREE.Group();
  group.name = 'gates';
  const b = new GeoBuilder();
  const mats = gateMaterials(tex);
  const main = makeGate(b, group, mats, glows, colliders, new THREE.Vector3(0, 0, 0), 0, 1);
  const oy = heightAt(OUTPOST.x, OUTPOST.z);
  const outpost = makeGate(b, group, mats, glows, colliders, new THREE.Vector3(OUTPOST.x + 8, oy, OUTPOST.z), -Math.PI / 2, 0.7);

  // outpost ruins: broken stone ring
  const stone = new THREE.Color('#c9c1b0');
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    if (k === 2 || k === 7) continue;
    const x = OUTPOST.x + Math.sin(a) * 15, z = OUTPOST.z + Math.cos(a) * 15;
    const h = 2 + ((k * 37) % 5);
    b.add('stone', boxGeo(1.4, h, 1.4, 2), mat4(x, heightAt(x, z) + h / 2 - 0.3, z, a), stone);
    if (k % 3 === 0) b.add('stone', boxGeo(4.5, 0.8, 1.2, 2), mat4(x, heightAt(x, z) + h + 0.1, z, a + Math.PI / 2, 0, 0.1), stone, { ao: false });
    colliders.addCircle(x, z, 1);
  }
  // camp fire + tents
  const fp = new THREE.Vector3(OUTPOST.x - 6, oy, OUTPOST.z + 4);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.add('rock', new THREE.IcosahedronGeometry(0.25, 0), mat4(fp.x + Math.sin(a) * 0.8, oy + 0.1, fp.z + Math.cos(a) * 0.8), 0x888888, { ao: false });
  }
  glows.add(fp.x, oy + 0.6, fp.z, 3.2, 0xff8a30, 0.8);
  glows.add(fp.x, oy + 0.4, fp.z, 1.2, 0xffd080, 0.6);
  for (const [dx, dz, ry] of [[-10, -6, 0.4], [-4, -10, -0.2]]) {
    const tent = new THREE.ConeGeometry(2.2, 2.6, 4, 1, true);
    scaleUV(tent, 4, 2);
    b.add('fabric', tent, mat4(OUTPOST.x + dx, oy + 1.3, OUTPOST.z + dz, ry + Math.PI / 4), new THREE.Color('#c9b48a'), { ao: false });
    colliders.addCircle(OUTPOST.x + dx, OUTPOST.z + dz, 1.8);
  }

  group.add(b.build(m, { name: 'gates', castShadow: true }));
  return {
    group,
    main,
    outpost,
    fire: fp,
    update(dt, t) {
      updateGateMaterials(mats, t);
      main.rune.rotation.z = t * 0.05;
      outpost.rune.rotation.z = -t * 0.05;
    },
  };
}
