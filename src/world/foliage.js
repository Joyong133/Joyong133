// High-quality foliage: procedurally painted leaf / needle atlas, leaf-card
// trees with bent (crown-spherical) normals, sun translucency and wind, plus
// pre-rendered impostor billboards for distant trees.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RNG, ridged, fbm, hash2, clamp, smoothstep } from '../core/noise.js';

export const windUniform = { value: 0 };
const SUN = { value: new THREE.Vector3(-0.8, 0.35, 0.45).normalize() };
export function setFoliageSun(dir) {
  SUN.value.copy(dir).normalize();
}

// ------------------------------------------------------------------ textures
// Paints into a canvas, then dilates leaf colours into transparent texels so
// mip-mapping never bleeds black halos, and uploads as a DataTexture.
function canvasToData(canvas, fill) {
  const W = canvas.width, H = canvas.height;
  const img = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    const src = (H - 1 - y) * W * 4; // flip so canvas top = v 1
    const dst = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = src + x * 4, o = dst + x * 4;
      const a = img[i + 3];
      if (a < 8) {
        out[o] = fill[0]; out[o + 1] = fill[1]; out[o + 2] = fill[2]; out[o + 3] = 0;
      } else {
        out[o] = img[i]; out[o + 1] = img[i + 1]; out[o + 2] = img[i + 2]; out[o + 3] = a;
      }
    }
  }
  const t = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

function leaf(g, x, y, len, wid, ang, col, rib) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(wid * 0.9, len * 0.25, wid * 0.7, len * 0.75, 0, len);
  g.bezierCurveTo(-wid * 0.7, len * 0.75, -wid * 0.9, len * 0.25, 0, 0);
  g.fillStyle = col;
  g.fill();
  g.strokeStyle = rib;
  g.lineWidth = 1.6;
  g.beginPath();
  g.moveTo(0, len * 0.05);
  g.lineTo(0, len * 0.9);
  g.stroke();
  g.restore();
}

// atlas: [0,0.5) broadleaf cluster · [0.5,1) pine bough
export function foliageAtlas() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = S * 2;
  c.height = S;
  const g = c.getContext('2d');
  const rng = new RNG(808);
  // --- broadleaf cluster (twigs fanning up from bottom centre)
  g.lineCap = 'round';
  const twigs = [];
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.42 + rng.range(-0.12, 0.12);
    const L = S * rng.range(0.32, 0.42);
    twigs.push({ x0: S / 2, y0: S * 0.97, x1: S / 2 + Math.cos(a) * L, y1: S * 0.97 + Math.sin(a) * L * 1.15 });
  }
  g.strokeStyle = '#4a3828';
  for (const t of twigs) {
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(t.x0, t.y0);
    g.quadraticCurveTo((t.x0 + t.x1) / 2 + rng.range(-20, 20), (t.y0 + t.y1) / 2, t.x1, t.y1);
    g.stroke();
  }
  const leaves = [];
  for (let i = 0; i < 120; i++) {
    const t = rng.pick(twigs);
    const u = Math.pow(rng.next(), 0.6);
    const x = t.x0 + (t.x1 - t.x0) * u + rng.range(-40, 40) * u;
    const y = t.y0 + (t.y1 - t.y0) * u + rng.range(-40, 40) * u;
    const dx = x - S / 2, dy = y - S * 0.6;
    if (Math.hypot(dx, dy * 0.9) > S * 0.46) continue;
    leaves.push({ x, y, depth: rng.next(), ang: Math.atan2(dy, dx) + Math.PI / 2 + rng.range(-0.9, 0.9) + Math.PI });
  }
  leaves.sort((a, b) => a.depth - b.depth);
  for (const l of leaves) {
    const h = 88 + rng.range(-10, 22);
    const s = 45 + rng.range(-8, 12);
    const lt = 18 + l.depth * 22 + rng.range(-4, 4);
    leaf(g, l.x, l.y, rng.range(40, 58), rng.range(17, 25), l.ang, `hsl(${h},${s}%,${lt}%)`, `hsla(${h - 10},${s}%,${lt + 14}%,0.7)`);
  }
  // --- pine bough: twig along +x with needles sweeping forward
  g.save();
  g.translate(S, 0);
  const midY = S * 0.5;
  g.strokeStyle = '#3d2c1e';
  g.lineWidth = 7;
  g.beginPath();
  g.moveTo(8, midY);
  g.quadraticCurveTo(S * 0.5, midY + 14, S - 14, midY + 34);
  g.stroke();
  const twigY = (x) => midY + 14 * (x / (S * 0.5)) * (x < S * 0.5 ? 1 : 1) + (x > S * 0.5 ? ((x - S * 0.5) / (S * 0.5)) * 20 : 0);
  // side twigs
  for (let k = 0; k < 7; k++) {
    const x0 = 50 + k * 60;
    const side = k % 2 ? 1 : -1;
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(x0, twigY(x0));
    g.lineTo(x0 + 70, twigY(x0) + side * rng.range(70, 110));
    g.stroke();
  }
  for (let i = 0; i < 900; i++) {
    const x = rng.range(12, S - 20);
    const taper = 1 - Math.pow(Math.abs(x / S - 0.45) * 1.6, 2);
    const off = rng.range(-1, 1) * S * 0.36 * Math.max(0.25, taper);
    const y = twigY(x) + off;
    const len = rng.range(22, 40);
    const a = (off < 0 ? -0.6 : 0.6) + rng.range(-0.35, 0.35);
    const h = 128 + rng.range(-12, 16), lt = 14 + rng.range(0, 16) + (off < 0 ? 4 : 0);
    g.strokeStyle = `hsl(${h},${38 + rng.range(-6, 8)}%,${lt}%)`;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.6);
    g.stroke();
  }
  g.restore();
  return canvasToData(c, [38, 62, 28]);
}

export function barkTexture() {
  const W = 256, H = 512;
  const col = new Uint8Array(W * H * 4);
  const nor = new Uint8Array(W * H * 4);
  const hgt = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H;
    const fiss = ridged(u * 7, v * 1.6, 4, 61, 7);
    const n = fbm(u * 22, v * 6, 3, 63, 22);
    hgt[y * W + x] = fiss * 0.8 + n * 0.2;
    const l = 0.22 + fiss * 0.22 + n * 0.08 + (hash2(x, y, 5) - 0.5) * 0.03;
    const i = (y * W + x) * 4;
    col[i] = clamp(l * 0.98 * 255, 0, 255);
    col[i + 1] = clamp(l * 0.88 * 255, 0, 255);
    col[i + 2] = clamp(l * 0.78 * 255, 0, 255);
    col[i + 3] = 255;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = hgt[y * W + ((x + 1) % W)] - hgt[y * W + ((x - 1 + W) % W)];
    const dy = hgt[((y + 1) % H) * W + x] - hgt[((y - 1 + H) % H) * W + x];
    const nx = -dx * 4, ny = -dy * 4, l = Math.hypot(nx, ny, 1);
    const i = (y * W + x) * 4;
    nor[i] = (nx / l * 0.5 + 0.5) * 255;
    nor[i + 1] = (ny / l * 0.5 + 0.5) * 255;
    nor[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    nor[i + 3] = 255;
  }
  const mk = (d, srgb) => {
    const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { map: mk(col, true), normal: mk(nor, false) };
}

// ------------------------------------------------------------------ materials
export function foliageMaterial(atlas, { wind = 0.06, flutter = 0.05, start = 2.0, translucency = 0.55 } = {}) {
  const mat = new THREE.MeshStandardMaterial({
    map: atlas,
    vertexColors: true,
    roughness: 0.82,
    alphaTest: 0.42,
    alphaToCoverage: true,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windUniform;
    shader.uniforms.sunDirW = SUN;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
#else
  float wph = 0.0;
#endif
  float wk = max(0.0, transformed.y - ${start.toFixed(2)});
  float sway = sin(windTime * 1.2 + wph) * 0.7 + sin(windTime * 2.3 + wph * 1.7) * 0.3;
  transformed.x += sway * ${wind.toFixed(3)} * wk;
  transformed.z += cos(windTime * 1.5 + wph * 1.3) * ${(wind * 0.6).toFixed(3)} * wk;
  float fl = sin(windTime * 7.0 + dot(transformed, vec3(3.1, 2.3, 2.7))) * ${flutter.toFixed(3)} * min(wk, 1.0);
  transformed += normal * fl;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 sunDirW;')
      // foliage keeps one bent normal on both faces (no back-face flip)
      .replace(
        '#include <normal_fragment_begin>',
        `float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
vec3 normal = normalize( vNormal );
vec3 nonPerturbedNormal = normal;`
      )
      // keep coverage stable in mips: boost alpha as texels get minified
      .replace(
        '#include <alphatest_fragment>',
        `{
  vec2 tsz = vec2(textureSize(map, 0));
  vec2 dx = dFdx(vMapUv * tsz), dy = dFdy(vMapUv * tsz);
  float mip = max(0.0, 0.5 * log2(max(dot(dx, dx), dot(dy, dy))));
  diffuseColor.a *= 1.0 + mip * 0.28;
}
#include <alphatest_fragment>`
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
{
  vec3 sunV = normalize((viewMatrix * vec4(sunDirW, 0.0)).xyz);
  vec3 toCam = normalize(vViewPosition);
  float trans = pow(max(dot(-toCam, sunV), 0.0), 3.0);
  float wrap = max(dot(normal, sunV) * 0.5 + 0.5, 0.0);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * vec3(1.0, 0.85, 0.5) * (trans * ${translucency.toFixed(2)} + wrap * 0.18);
}`
      );
  };
  return mat;
}

export function barkMaterial(bark) {
  const mat = new THREE.MeshStandardMaterial({ map: bark.map, normalMap: bark.normal, normalScale: new THREE.Vector2(1.4, 1.4), vertexColors: true, roughness: 0.95 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  float wph = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
#else
  float wph = 0.0;
#endif
  float wk = max(0.0, transformed.y - 2.0);
  transformed.x += (sin(windTime * 1.2 + wph) * 0.7 + sin(windTime * 2.3 + wph * 1.7) * 0.3) * 0.04 * wk;`
      );
  };
  return mat;
}

// ------------------------------------------------------------------ geometry helpers
const _up = new THREE.Vector3(0, 1, 0);

function tube(path, r0, r1, radial, seed, flare = 0) {
  // path: array of Vector3 points; radius tapers r0 → r1
  const n = path.length;
  const pos = [], uv = [], idx = [];
  let len = 0;
  const lens = [0];
  for (let i = 1; i < n; i++) { len += path[i].distanceTo(path[i - 1]); lens.push(len); }
  const tmp = new THREE.Vector3();
  const side = new THREE.Vector3(), bin = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const dir = (i < n - 1 ? tmp.subVectors(path[i + 1], path[i]) : tmp.subVectors(path[i], path[i - 1])).normalize().clone();
    side.crossVectors(dir, Math.abs(dir.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : _up).normalize();
    bin.crossVectors(side, dir).normalize();
    let r = r0 + (r1 - r0) * t;
    if (flare) r *= 1 + flare * Math.pow(1 - Math.min(1, t * 6), 2);
    for (let k = 0; k <= radial; k++) {
      const a = (k / radial) * Math.PI * 2;
      const wob = 1 + 0.08 * Math.sin(a * 3 + seed + i);
      const off = side.clone().multiplyScalar(Math.cos(a) * r * wob).addScaledVector(bin, Math.sin(a) * r * wob);
      pos.push(path[i].x + off.x, path[i].y + off.y, path[i].z + off.z);
      uv.push((k / radial) * Math.max(1, Math.round(r0 * 6)), lens[i] / 2);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < radial; k++) {
      const a = i * (radial + 1) + k, b = a + radial + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function colorAll(g, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(p.getX(i), p.getY(i), p.getZ(i), col, i);
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// One leaf card: quad centred at `p`, facing `n`, rolled by `roll`, size w×h,
// uv rect in the atlas. Normals are bent toward the crown sphere.
function card(out, p, n, roll, w, h, u0, u1, crown, crownR, tint, ao, anchorBottom = false) {
  const nn = n.clone().normalize();
  const tangent = new THREE.Vector3().crossVectors(Math.abs(nn.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : _up, nn).normalize();
  const bit = new THREE.Vector3().crossVectors(nn, tangent).normalize();
  const q = new THREE.Quaternion().setFromAxisAngle(nn, roll);
  tangent.applyQuaternion(q);
  bit.applyQuaternion(q);
  const corners = anchorBottom
    ? [[-0.5, 0], [0.5, 0], [0.5, 1], [-0.5, 1]]
    : [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const uvs = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]];
  const verts = corners.map(([a, b]) => p.clone().addScaledVector(tangent, a * w).addScaledVector(bit, b * h));
  for (const tri of [[0, 1, 2], [0, 2, 3]]) {
    for (const k of tri) {
      const v = verts[k];
      out.pos.push(v.x, v.y, v.z);
      out.uv.push(uvs[k][0], uvs[k][1]);
      const bent = v.clone().sub(crown).divideScalar(crownR).add(new THREE.Vector3(0, 0.35, 0)).normalize().multiplyScalar(0.8).addScaledVector(nn, 0.2).normalize();
      out.nor.push(bent.x, bent.y, bent.z);
      const shell = Math.min(1, v.distanceTo(crown) / crownR);
      const k2 = ao * (0.5 + 0.5 * shell) * (0.75 + 0.25 * clamp((v.y - crown.y + crownR) / (2 * crownR), 0, 1));
      out.col.push(tint.r * k2, tint.g * k2, tint.b * k2);
    }
  }
}

function cardGeometry(out) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  return g;
}

const LEAF_U = [0.004, 0.496];
const PINE_U = [0.504, 0.996];

// ------------------------------------------------------------------ species
export function broadleafTree(seed, { height = 4.2, crownR = 3.0, hue = 0 } = {}) {
  const rng = new RNG(seed);
  // trunk path with a gentle lean
  const lean = new THREE.Vector3(rng.range(-0.3, 0.3), 0, rng.range(-0.3, 0.3));
  const path = [];
  const top = height + crownR * 0.6;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    path.push(new THREE.Vector3(lean.x * t * t + Math.sin(t * 3 + seed) * 0.08, t * top, lean.z * t * t));
  }
  const parts = [tube(path, 0.34, 0.14, 8, seed, 0.6)];
  const crown = new THREE.Vector3(lean.x, height + crownR * 0.7, lean.z);
  const tips = [];
  const nb = rng.int(5, 7);
  for (let k = 0; k < nb; k++) {
    const az = (k / nb) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const y0 = height * rng.range(0.7, 1.0);
    const start = new THREE.Vector3(lean.x * (y0 / top) ** 2, y0, lean.z * (y0 / top) ** 2);
    const el = rng.range(0.45, 0.95);
    const L = crownR * rng.range(0.75, 1.05);
    const d = new THREE.Vector3(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const mid = start.clone().addScaledVector(d, L * 0.55).add(new THREE.Vector3(0, 0.25, 0));
    const end = start.clone().addScaledVector(d, L);
    parts.push(tube([start, mid, end], 0.11, 0.03, 5, seed + k));
    tips.push(end);
  }
  const trunk = mergeGeometries(parts);
  colorAll(trunk, (x, y, z, c) => c.setRGB(1, 1, 1).multiplyScalar(0.55 + 0.45 * Math.min(1, y / 2.5)));

  const out = { pos: [], nor: [], uv: [], col: [] };
  const base = new THREE.Color(1 + hue * 3, 1, 0.9 - hue * 3);
  const cards = [];
  for (const t of tips) for (let k = 0; k < 5; k++) cards.push(t.clone().add(new THREE.Vector3(rng.range(-0.9, 0.9), rng.range(-0.4, 0.9), rng.range(-0.9, 0.9))));
  for (let k = 0; k < 42; k++) {
    const dir = new THREE.Vector3(rng.range(-1, 1), rng.range(-0.6, 1), rng.range(-1, 1)).normalize();
    const r = crownR * (0.35 + 0.65 * Math.sqrt(rng.next()));
    cards.push(crown.clone().add(new THREE.Vector3(dir.x * r, dir.y * r * 0.78, dir.z * r)));
  }
  for (const p of cards) {
    const n = p.clone().sub(crown).normalize();
    n.x += rng.range(-0.5, 0.5); n.y += rng.range(-0.3, 0.6); n.z += rng.range(-0.5, 0.5);
    const s = rng.range(2.0, 2.8);
    const tint = base.clone().multiplyScalar(rng.range(0.82, 1.12));
    tint.r *= rng.range(0.94, 1.08);
    card(out, p, n, rng.range(0, Math.PI * 2), s, s, LEAF_U[0], LEAF_U[1], crown, crownR * 1.1, tint, 1);
    if (rng.chance(0.35)) card(out, p, new THREE.Vector3(n.z, n.y * 0.3, -n.x), rng.range(0, 6.28), s * 0.9, s * 0.9, LEAF_U[0], LEAF_U[1], crown, crownR * 1.1, tint, 0.92);
  }
  const leaves = cardGeometry(out);
  return { trunk, leaves, bounds: { r: crownR + 0.8, h: crown.y + crownR + 0.6 } };
}

export function pineTree(seed, { height = 11 } = {}) {
  const rng = new RNG(seed);
  const path = [];
  for (let i = 0; i <= 5; i++) path.push(new THREE.Vector3(Math.sin(i + seed) * 0.03, (i / 5) * height, 0));
  const trunk = tube(path, 0.3, 0.05, 6, seed, 0.5);
  colorAll(trunk, (x, y, z, c) => c.setRGB(1, 0.95, 0.9).multiplyScalar(0.55 + 0.4 * Math.min(1, y / 3)));
  const out = { pos: [], nor: [], uv: [], col: [] };
  const crown = new THREE.Vector3(0, height * 0.55, 0);
  const crownR = height * 0.45;
  const base = new THREE.Color(0.95, 1.0, 1.0);
  const tiers = 11;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const y = 1.8 + t * (height - 2.4);
    const R = (1 - t) * height * 0.3 + 0.45;
    const n = Math.max(5, Math.round(9 - t * 4));
    const off = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const az = off + (k / n) * Math.PI * 2 + rng.range(-0.2, 0.2);
      const droop = rng.range(0.32, 0.58) + t * 0.12;
      const dir = new THREE.Vector3(Math.cos(az) * Math.cos(droop), -Math.sin(droop), Math.sin(az) * Math.cos(droop));
      // bough card: from the trunk outward, laid roughly flat and rolled a bit
      const L = R * rng.range(0.9, 1.1);
      const w = L * 0.85;
      const side = new THREE.Vector3().crossVectors(_up, dir).normalize();
      const roll = rng.range(-0.6, 0.6);
      const nrm = new THREE.Vector3().crossVectors(dir, side).normalize().applyAxisAngle(dir, roll);
      const p0 = new THREE.Vector3(0, y, 0);
      const verts = [
        p0.clone().addScaledVector(side, -w / 2),
        p0.clone().addScaledVector(side, w / 2),
        p0.clone().addScaledVector(dir, L).addScaledVector(side, w / 2),
        p0.clone().addScaledVector(dir, L).addScaledVector(side, -w / 2),
      ];
      // twist the outer edge using the roll
      verts[2].addScaledVector(nrm, Math.sin(roll) * w * 0.3);
      verts[3].addScaledVector(nrm, -Math.sin(roll) * w * 0.3);
      // atlas: twig runs along +u; card length along u, width along v
      const uvs = [[PINE_U[0], 0], [PINE_U[0], 1], [PINE_U[1], 1], [PINE_U[1], 0]];
      const tint = base.clone().multiplyScalar(rng.range(0.85, 1.1));
      for (const tri of [[0, 2, 1], [0, 3, 2]]) {
        for (const kk of tri) {
          const v = verts[kk];
          out.pos.push(v.x, v.y, v.z);
          out.uv.push(uvs[kk][0], uvs[kk][1]);
          const bent = new THREE.Vector3(v.x, (v.y - crown.y) * 0.3 + 0.5, v.z).normalize();
          out.nor.push(bent.x, bent.y, bent.z);
          const outF = Math.min(1, Math.hypot(v.x, v.z) / Math.max(0.5, R));
          const k2 = (0.42 + 0.58 * outF) * (0.8 + 0.2 * t);
          out.col.push(tint.r * k2, tint.g * k2, tint.b * k2);
        }
      }
    }
  }
  // vertical fill cards so the cone reads solid from the side
  for (let i = 0; i < 4; i++) {
    const t = (i + 0.5) / 4;
    const y = 2.2 + t * (height - 3.2);
    const R = (1 - t) * height * 0.28 + 0.5;
    for (let k = 0; k < 2; k++) {
      const a = k * Math.PI / 2 + i * 0.6;
      card(out, new THREE.Vector3(0, y, 0), new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), Math.PI / 2 + rng.range(-0.2, 0.2), (height - 3) / 3.2, R * 1.7, PINE_U[0], PINE_U[1], crown, crownR, base.clone().multiplyScalar(0.8), 0.85);
    }
  }
  // tip: two crossed small cards standing upright
  for (let k = 0; k < 2; k++) {
    card(out, new THREE.Vector3(0, height - 0.9, 0), new THREE.Vector3(Math.cos(k * 1.57), 0, Math.sin(k * 1.57)), Math.PI / 2, 1.6, 1.0, PINE_U[0], PINE_U[1], crown, crownR, base, 0.95, false);
  }
  const leaves = cardGeometry(out);
  return { trunk, leaves, bounds: { r: height * 0.32 + 0.6, h: height + 0.4 } };
}

export function bushGeometry(seed) {
  const rng = new RNG(seed);
  const out = { pos: [], nor: [], uv: [], col: [] };
  const crown = new THREE.Vector3(0, 0.45, 0);
  const base = new THREE.Color(1.05, 1, 0.85);
  for (let k = 0; k < 13; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.6);
    const p = new THREE.Vector3(Math.cos(a) * r, rng.range(0.3, 0.8), Math.sin(a) * r);
    const n = p.clone().sub(new THREE.Vector3(0, 0.1, 0)).normalize();
    const s = rng.range(0.9, 1.3);
    card(out, p, n, rng.range(0, 6.28), s, s, LEAF_U[0], LEAF_U[1], crown, 0.9, base.clone().multiplyScalar(rng.range(0.85, 1.05)), 1);
  }
  return cardGeometry(out);
}

// ------------------------------------------------------------------ impostors
// Renders each species once from the side into an atlas, then draws far
// trees as camera-facing (Y-axis) billboards in a single draw call.
export class Impostors {
  constructor(renderer, species, env, max = 3000) {
    this.cells = species.length;
    const CW = 256, CH = 512;
    const rt = new THREE.WebGLRenderTarget(CW * this.cells, CH, { samples: 4 });
    rt.texture.generateMipmaps = true;
    rt.texture.minFilter = THREE.LinearMipmapLinearFilter;
    rt.texture.magFilter = THREE.LinearFilter;
    const scene = new THREE.Scene();
    scene.environment = env || null;
    scene.environmentIntensity = 0.7;
    const sun = new THREE.DirectionalLight(0xfff0dc, 2.6);
    sun.position.set(0.5, 0.9, 1);
    scene.add(sun, new THREE.HemisphereLight(0xbcd4ff, 0x4a4030, 0.5));
    const prevTarget = renderer.getRenderTarget();
    const prevColor = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevTM = renderer.toneMapping;
    rt.viewport.set(0, 0, CW * this.cells, CH);
    rt.scissor.set(0, 0, CW * this.cells, CH);
    rt.scissorTest = false;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x2a3a20, 0);
    renderer.clear();
    this.sizes = [];
    species.forEach((sp, i) => {
      const group = new THREE.Group();
      for (const [geo, mat] of sp.meshes) {
        const m2 = mat.clone();
        m2.alphaToCoverage = false;
        m2.onBeforeCompile = mat.onBeforeCompile;
        group.add(new THREE.Mesh(geo, m2));
      }
      scene.add(group);
      const w = sp.bounds.r * 2.1, h = sp.bounds.h * 1.04;
      const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, -50, 50);
      cam.position.set(0, 0, 10);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      rt.viewport.set(i * CW, 0, CW, CH);
      rt.scissor.set(i * CW, 0, CW, CH);
      rt.scissorTest = true;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      scene.remove(group);
      this.sizes.push([w, h]);
    });
    rt.scissorTest = false;
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevColor, prevAlpha);
    renderer.toneMapping = prevTM;
    this.rt = rt;

    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
    g.setAttribute('uv', quad.attributes.uv);
    this.max = max;
    this.data = new Float32Array(max * 4);
    this.extra = new Float32Array(max * 4);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.data, 4));
    g.setAttribute('iExtra', new THREE.InstancedBufferAttribute(this.extra, 4));
    g.instanceCount = 0;
    this.geometry = g;
    const sizes = this.sizes.map(([w, h]) => new THREE.Vector2(w, h));
    while (sizes.length < 4) sizes.push(new THREE.Vector2(1, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { atlas: { value: null }, cells: { value: this.cells }, sizes: { value: sizes } }]),
      vertexShader: /* glsl */ `
        #include <common>
        #include <fog_pars_vertex>
        attribute vec4 iPos;
        attribute vec4 iExtra;
        uniform float cells;
        uniform vec2 sizes[4];
        varying vec2 vUv;
        varying float vShade;
        void main() {
          int cell = int(iExtra.x + 0.5);
          vec2 sz = sizes[cell] * iPos.w;
          vec3 toCam = cameraPosition - iPos.xyz;
          toCam.y = 0.0;
          toCam = normalize(toCam + vec3(1e-4));
          vec3 right = vec3(toCam.z, 0.0, -toCam.x);
          vec3 world = iPos.xyz + right * position.x * sz.x + vec3(0.0, position.y * sz.y, 0.0);
          vUv = vec2((float(cell) + uv.x) / cells, uv.y);
          vShade = iExtra.y;
          vec4 mvPosition = viewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <common>
        #include <fog_pars_fragment>
        uniform sampler2D atlas;
        varying vec2 vUv;
        varying float vShade;
        void main() {
          vec4 c = texture2D(atlas, vUv);
          float a = c.a;
          if (a < 0.02) discard;
          a = smoothstep(0.35, 0.35 + fwidth(a), a);
          vec3 col = c.rgb * vShade;
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      fog: true,
      alphaToCoverage: true,
      side: THREE.DoubleSide,
    });
    // render-target textures can't go through UniformsUtils.merge
    this.material.uniforms.atlas.value = rt.texture;
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'impostors';
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  push(x, y, z, s, cell, shade = 1) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.data[i * 4] = x; this.data[i * 4 + 1] = y; this.data[i * 4 + 2] = z; this.data[i * 4 + 3] = s;
    this.extra[i * 4] = cell; this.extra[i * 4 + 1] = shade;
  }
  end() {
    this.geometry.instanceCount = this.n;
    this.geometry.attributes.iPos.needsUpdate = true;
    this.geometry.attributes.iExtra.needsUpdate = true;
  }
}

export { smoothstep };
