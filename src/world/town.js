// "시작의 마을" — a walled medieval town generated from rules: five rings of
// row houses (timber-framed, stone and plaster styles), avenues with market
// stalls, a fountain square, a cathedral, lamp posts and the city wall.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo, quadGeo, gableGeo, archWallGeo, archRingGeo, spireGeo, scaleUV } from '../core/geo.js';
import { RNG } from '../core/noise.js';
import { TOWN } from './layout.js';
import { sharedFoliage } from './vegetation.js';

const col = (h) => new THREE.Color(h);

export const PAL = {
  plaster: ['#f3ead8', '#efd9b0', '#ead1c3', '#f7f3ea', '#e2e5d6', '#ebcfa6', '#dbe2e8'],
  stone: ['#ddd6c8', '#c4bcb0', '#d2c2a4', '#bfb6a8'],
  roof: ['#c05a34', '#a9482b', '#c86a3c', '#b5502e', '#6a7380', '#8a5c40', '#b9583a', '#5d8a7e', '#c46d42'],
  timber: '#6a4a36',
  shutter: ['#3f6d52', '#335a86', '#8c3b2c', '#6e5132', '#44616e'],
  flowers: ['#d8344a', '#ef6fa0', '#f2c94c', '#9b59d0', '#f07d2c', '#ffffff'],
  awning: ['#c0392b', '#2e6fd8', '#2f9e6a', '#e0a82e', '#8e44ad', '#d35400'],
};

const TMP = new THREE.Matrix4();
function mul(M, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return M.clone().multiply(mat4(x, y, z, ry, rx, rz, sx, sy, sz));
}

// ------------------------------------------------------------------ shared templates
export const G = {};
export function templates() {
  if (G.ready) return;
  G.ready = true;
  G.post = new THREE.CylinderGeometry(0.06, 0.09, 3.3, 8);
  G.postBase = new THREE.CylinderGeometry(0.17, 0.24, 0.45, 8);
  G.lampCap = spireGeo(0.28, 0.3, 4);
  G.lampFrame = new THREE.BoxGeometry(0.34, 0.06, 0.34);
  G.lampGlass = new THREE.BoxGeometry(0.26, 0.4, 0.26);
  G.arm = new THREE.BoxGeometry(0.05, 0.05, 0.55);
  G.sphere = new THREE.IcosahedronGeometry(1, 1);
  G.sphereLo = new THREE.IcosahedronGeometry(1, 0);
  G.cyl8 = new THREE.CylinderGeometry(1, 1, 1, 8);
  G.cyl16 = new THREE.CylinderGeometry(1, 1, 1, 16, 1);
  G.barrel = new THREE.CylinderGeometry(0.3, 0.3, 0.8, 10);
  scaleUV(G.barrel, 2, 0.8);
  G.flowerDot = new THREE.IcosahedronGeometry(0.08, 0);
}

// ------------------------------------------------------------------ roof
// Ridge along local X of M. span measured along local Z. Returns ridge height.
export function addRoof(b, M, length, span, pitch, baseY, roofTint, wallKey, wallTint, rng, opts = {}) {
  const over = opts.over ?? 0.45;
  const endOver = opts.endOver ?? 0.35;
  const t = 0.2;
  const half = span / 2 + over;
  const L = half / Math.cos(pitch);
  const rise = (span / 2) * Math.tan(pitch);
  const ridgeY = baseY + rise + t * 0.6;
  const slab = boxGeo(length + endOver * 2, t, L, 2, rng.next(), rng.next());
  // front slab (toward +z) and back slab: local +z of each slab points uphill
  const cy = ridgeY - (L / 2) * Math.sin(pitch);
  const cz = (L / 2) * Math.cos(pitch);
  b.add('roof', slab, mul(M, 0, cy, cz, Math.PI, -pitch), roofTint, { ao: false });
  b.add('roof', slab, mul(M, 0, cy, -cz, 0, -pitch), roofTint, { ao: false });
  // ridge cap
  b.add('roof', boxGeo(length + endOver * 2 + 0.1, 0.22, 0.22, 1), mul(M, 0, ridgeY + 0.05, 0, 0, Math.PI / 4), roofTint.clone().multiplyScalar(0.8), { ao: false });
  // gable end walls
  if (!opts.noGables) {
    const gab = gableGeo(span, rise, 0.3, 2);
    b.add(wallKey, gab, mul(M, length / 2 - 0.15, baseY, 0, Math.PI / 2), wallTint, { ao: false });
    b.add(wallKey, gab, mul(M, -length / 2 + 0.15, baseY, 0, -Math.PI / 2), wallTint, { ao: false });
  }
  return { ridgeY, rise };
}

// ------------------------------------------------------------------ house
export function addHouse(b, glows, x, z, yaw, spec, rng) {
  const M = mat4(x, spec.y || 0, z, yaw);
  const { w, d, floors } = spec;
  const fh = spec.fh;
  const H = floors * fh;
  const plasterT = col(spec.plaster);
  const stoneT = col(spec.stone);
  const roofT = col(spec.roof);
  const timberT = col(PAL.timber);
  const jetty = spec.style === 'timber' && spec.jetty ? 0.35 : 0;

  // plinth
  b.add('stone', boxGeo(w + 0.16, 0.55, d + 0.16, 2, rng.next(), rng.next()), mul(M, 0, 0.2, 0), stoneT.clone().multiplyScalar(0.85));

  let upperKey = 'plaster';
  let upperTint = plasterT;
  if (spec.style === 'stone') {
    b.add('stone', boxGeo(w, H, d, 2, rng.next(), rng.next()), mul(M, 0, H / 2, 0), stoneT);
    upperKey = 'stone';
    upperTint = stoneT;
  } else if (spec.style === 'plaster') {
    b.add('plaster', boxGeo(w, H, d, 2, rng.next(), rng.next()), mul(M, 0, H / 2, 0), plasterT);
    // quoins + string course
    const q = boxGeo(0.55, H, 0.55, 2, rng.next(), 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b.add('stone', q, mul(M, sx * (w / 2 - 0.22), H / 2, sz * (d / 2 - 0.22)), stoneT);
    }
    b.add('stone', boxGeo(w + 0.12, 0.22, d + 0.12, 2), mul(M, 0, fh, 0), stoneT);
  } else {
    // timber: stone ground floor + jettied plaster upper floors
    b.add('stone', boxGeo(w, fh, d, 2, rng.next(), rng.next()), mul(M, 0, fh / 2, 0), stoneT);
    const uh = H - fh;
    b.add('plaster', boxGeo(w, uh, d + jetty, 2, rng.next(), rng.next()), mul(M, 0, fh + uh / 2, jetty / 2), plasterT);
    // jetty bressumer beam
    if (jetty) b.add('wood', boxGeo(w + 0.04, 0.22, 0.3, 1), mul(M, 0, fh + 0.05, d / 2 + jetty - 0.12), timberT);
  }

  // roof
  const roofBase = H;
  const spanD = d + jetty;
  let roofInfo;
  if (spec.roofType === 'side') {
    roofInfo = addRoof(b, mul(M, 0, 0, jetty / 2), w, spanD, spec.pitch, roofBase, roofT, upperKey, upperTint, rng);
  } else {
    roofInfo = addRoof(b, mul(M, 0, 0, jetty / 2, Math.PI / 2), spanD, w, spec.pitch, roofBase, roofT, upperKey, upperTint, rng);
  }

  // chimney
  if (spec.chimney) {
    const cx = (rng.next() < 0.5 ? -1 : 1) * (w / 2 - 1.0);
    const top = roofInfo.ridgeY + 0.9;
    const hgt = top - (H + 0.5);
    b.add('stone', boxGeo(0.75, hgt, 0.75, 2, rng.next()), mul(M, cx, H + 0.5 + hgt / 2, spec.roofType === 'side' ? -0.6 : -d / 4), stoneT.clone().multiplyScalar(0.8));
    b.add('stone', boxGeo(0.95, 0.15, 0.95, 2), mul(M, cx, top + 0.05, spec.roofType === 'side' ? -0.6 : -d / 4), stoneT.clone().multiplyScalar(0.7));
    CHIMNEYS.push(new THREE.Vector3(cx, top + 0.2, spec.roofType === 'side' ? -0.6 : -d / 4).applyMatrix4(M));
  }

  // facade elements
  const nWin = Math.max(1, Math.floor((w - 0.8) / 2.25));
  const slotW = w / nWin;
  const doorSlot = rng.int(0, nWin - 1);
  const shutterT = spec.shutter ? col(spec.shutter) : null;
  const winGeoLit = quadGeo(0.9, 1.3, 0.0, 0, 0.5, 1);
  const winGeoDark = quadGeo(0.9, 1.3, 0.5, 0, 1.0, 1);
  const sill = boxGeo(1.12, 0.1, 0.16, 1);
  const lintel = boxGeo(1.12, 0.14, 0.1, 1);
  const shutter = boxGeo(0.46, 1.3, 0.05, 1);

  for (const side of [1, -1]) {
    const faceRot = side === 1 ? 0 : Math.PI;
    for (let f = 0; f < floors; f++) {
      const fz = (side === 1 ? d / 2 + (f > 0 ? jetty : 0) : d / 2) + 0.01;
      const wy = f * fh + (f === 0 ? 1.45 : 1.6);
      for (let k = 0; k < nWin; k++) {
        const wx = -w / 2 + (k + 0.5) * slotW;
        const Mf = mul(M, 0, 0, 0, faceRot);
        if (f === 0 && k === doorSlot && (side === 1 || spec.backDoor)) {
          // door with stone surround and step
          const dz = side === 1 ? d / 2 : d / 2;
          b.add('door', quadGeo(1.2, 2.25), mul(Mf, wx, 1.12 + 0.02, dz + 0.02), 0xffffff, { ao: false });
          b.add('stone', boxGeo(1.6, 0.3, 0.22, 1), mul(Mf, wx, 2.35, dz + 0.05), stoneT.clone().multiplyScalar(0.9), { ao: false });
          b.add('stone', boxGeo(0.2, 2.3, 0.18, 1), mul(Mf, wx - 0.7, 1.15, dz + 0.04), stoneT.clone().multiplyScalar(0.9));
          b.add('stone', boxGeo(0.2, 2.3, 0.18, 1), mul(Mf, wx + 0.7, 1.15, dz + 0.04), stoneT.clone().multiplyScalar(0.9));
          b.add('stone', boxGeo(1.6, 0.18, 0.55, 1), mul(Mf, wx, 0.09, dz + 0.3), stoneT.clone().multiplyScalar(0.8));
          if (side === 1 && spec.shop) {
            // shop awning over the door
            const aw = boxGeo(2.2, 0.04, 1.2, 1);
            b.add('fabric', aw, mul(Mf, wx, 2.85, dz + 0.55, 0, 0.35), col(spec.shop), { ao: false });
            glows.add(...localToWorld(Mf, wx + 0.95, 2.6, dz + 0.4), 0.7, 0xffb466, 0.4);
            b.add('metal', G.arm, mul(Mf, wx + 0.95, 2.95, dz + 0.25), 0x222222, { ao: false });
            b.add('lampGlass', G.lampGlass, mul(Mf, wx + 0.95, 2.6, dz + 0.45, 0, 0, 0, 0.6, 0.6, 0.6), 0xffffff, { ao: false });
          }
          continue;
        }
        if (f === 0 && spec.style !== 'stone' && side === -1 && rng.chance(0.4)) continue;
        const lit = rng.chance(spec.lit);
        b.add('window', lit ? winGeoLit : winGeoDark, mul(Mf, wx, wy, fz + 0.01), 0xffffff, { ao: false });
        b.add('stone', sill, mul(Mf, wx, wy - 0.7, fz + 0.06), stoneT, { ao: false });
        if (spec.style !== 'timber' || f === 0) b.add('stone', lintel, mul(Mf, wx, wy + 0.72, fz + 0.04), stoneT, { ao: false });
        if (shutterT && f > 0) {
          b.add('wood', shutter, mul(Mf, wx - 0.72, wy, fz + 0.04), shutterT, { ao: false });
          b.add('wood', shutter, mul(Mf, wx + 0.72, wy, fz + 0.04), shutterT, { ao: false });
        }
        if (spec.flowers && f > 0 && side === 1 && rng.chance(0.6)) {
          b.add('wood', boxGeo(0.95, 0.2, 0.26, 1), mul(Mf, wx, wy - 0.8, fz + 0.18), 0x8a6a4a, { ao: false });
          b.add('foliage', boxGeo(0.88, 0.12, 0.2, 1), mul(Mf, wx, wy - 0.64, fz + 0.18), 0x3f7a2c, { ao: false });
          const fc = col(rng.pick(PAL.flowers));
          for (let q = 0; q < 5; q++) {
            b.add('plain', G.flowerDot, mul(Mf, wx - 0.38 + q * 0.19, wy - 0.56 + rng.range(0, 0.05), fz + 0.18 + rng.range(-0.05, 0.05)), fc, { ao: false });
          }
        }
      }
      // half-timbering on upper floors
      if (spec.style === 'timber' && f > 0) {
        const Mf = mul(M, 0, 0, 0, faceRot);
        const y0 = f * fh, y1 = (f + 1) * fh;
        const beamH = boxGeo(w + 0.02, 0.2, 0.09, 1);
        b.add('wood', beamH, mul(Mf, 0, y0 + 0.12, fz + 0.03), timberT, { ao: false });
        b.add('wood', beamH, mul(Mf, 0, y1 - 0.1, fz + 0.03), timberT, { ao: false });
        const post = boxGeo(0.2, fh, 0.09, 1);
        for (let k = 0; k <= nWin; k++) {
          const px = -w / 2 + k * slotW;
          const pxc = k === 0 ? px + 0.1 : k === nWin ? px - 0.1 : px;
          b.add('wood', post, mul(Mf, pxc, y0 + fh / 2, fz + 0.03), timberT, { ao: false });
          // braces in the panels next to each post
          if (k < nWin) {
            const pw = (slotW - 1.35) / 2;
            if (pw > 0.25) {
              const ang = Math.atan2(pw, fh - 0.3);
              const len = Math.hypot(pw, fh - 0.3);
              const br = boxGeo(0.14, len, 0.08, 1);
              b.add('wood', br, mul(Mf, pxc + (k === 0 ? 0.1 : 0.1) + pw / 2, y0 + fh / 2, fz + 0.035, 0, 0, -ang), timberT, { ao: false });
              const nx = -w / 2 + (k + 1) * slotW - 0.1 - pw / 2;
              b.add('wood', br, mul(Mf, nx, y0 + fh / 2, fz + 0.035, 0, 0, ang), timberT, { ao: false });
            }
          }
        }
        // cross braces below each window
        for (let k = 0; k < (side === 1 && spec.braces ? nWin : 0); k++) {
          const wx = -w / 2 + (k + 0.5) * slotW;
          const hh = 0.65;
          const ang = Math.atan2(0.8, hh);
          const br = boxGeo(0.1, Math.hypot(0.8, hh), 0.07, 1);
          b.add('wood', br, mul(Mf, wx, y0 + 0.24 + hh / 2, fz + 0.035, 0, 0, ang), timberT, { ao: false });
          b.add('wood', br, mul(Mf, wx, y0 + 0.24 + hh / 2, fz + 0.035, 0, 0, -ang), timberT, { ao: false });
        }
      }
    }
  }

  // climbing ivy on some facades
  if (spec.ivy) {
    const n = 2 + Math.floor(rng.next() * 3);
    const edge = rng.next() < 0.5 ? -1 : 1;
    const ivyT = col('#d8f0c0');
    for (let k = 0; k < n; k++) {
      const s = rng.range(1.3, 2.3);
      const x = edge * (w / 2 - rng.range(0.4, 1.6));
      const y = rng.range(0.6, Math.min(H - 0.5, 1.2 + k * 1.3));
      b.add('ivy', quadGeo(s, s * 1.2, 0.004, 0, 0.496, 1), mul(M, x, y, d / 2 + 0.05 + k * 0.012, 0, 0, rng.range(-0.5, 0.5)), ivyT.clone().multiplyScalar(rng.range(0.75, 1.0)), { ao: false });
    }
  }

  // balcony
  if (spec.balcony && floors >= 2) {
    const bw = Math.min(w - 1.2, 3.4);
    const by = fh + 0.1;
    const bz = d / 2 + jetty + 0.55;
    b.add('wood', boxGeo(bw, 0.14, 1.1, 1), mul(M, 0, by, bz - 0.05), 0x7a5a40);
    b.add('wood', boxGeo(bw, 0.08, 0.08, 1), mul(M, 0, by + 0.95, bz + 0.46), 0x5a3d2b, { ao: false });
    for (let k = 0; k <= Math.floor(bw / 0.35); k++) {
      b.add('wood', boxGeo(0.05, 0.85, 0.05, 1), mul(M, -bw / 2 + k * 0.35, by + 0.5, bz + 0.46), 0x5a3d2b, { ao: false });
    }
    // brackets
    for (const sx of [-1, 1]) b.add('wood', boxGeo(0.12, 0.12, 0.9, 1), mul(M, sx * (bw / 2 - 0.2), by - 0.25, bz - 0.2, 0, 0.5), 0x5a3d2b);
  }
  return H;
}

function localToWorld(M, x, y, z) {
  const v = new THREE.Vector3(x, y, z).applyMatrix4(M);
  return [v.x, v.y, v.z];
}

// ------------------------------------------------------------------ props
export function addLamp(b, glows, x, z, yaw = 0) {
  const M = mat4(x, 0, z, yaw);
  const iron = 0x1e1f24;
  b.add('metal', G.postBase, mul(M, 0, 0.22, 0), iron);
  b.add('metal', G.post, mul(M, 0, 1.65 + 0.4, 0), iron);
  b.add('metal', G.arm, mul(M, 0, 3.6, 0.22), iron, { ao: false });
  b.add('metal', G.lampFrame, mul(M, 0, 3.52, 0.45), iron, { ao: false });
  b.add('metal', G.lampFrame, mul(M, 0, 3.05, 0.45), iron, { ao: false });
  b.add('lampGlass', G.lampGlass, mul(M, 0, 3.28, 0.45), 0xffffff, { ao: false });
  b.add('metal', G.lampCap, mul(M, 0, 3.55, 0.45), iron, { ao: false });
  const p = new THREE.Vector3(0, 3.28, 0.45).applyMatrix4(M);
  glows.add(p.x, p.y, p.z, 1.3, 0xffa556, 0.25);
  glows.add(p.x, p.y, p.z, 0.45, 0xffe0b0, 0.1);
  LAMPS.push(new THREE.Vector3(p.x, 0, p.z));
}

// lamp positions collected while building (for ground light pools)
const LAMPS = [];
export function takeLamps() {
  return LAMPS.splice(0, LAMPS.length);
}

// Warm pools of lamplight on the cobbles: one additive instanced decal.
export function lightPools(points, heightAt = () => 0, radius = 3.2, intensity = 0.3) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,190,120,1)');
  grd.addColorStop(0.35, 'rgba(255,160,90,0.45)');
  grd.addColorStop(1, 'rgba(255,140,70,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: intensity, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: true });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, points.length));
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    m.makeTranslation(p.x, heightAt(p.x, p.z) + 0.04, p.z);
    mesh.setMatrixAt(i, m);
  });
  mesh.count = points.length;
  mesh.renderOrder = 1;
  mesh.name = 'lightPools';
  mesh.computeBoundingSphere();
  return mesh;
}

export function addStall(b, glows, x, z, yaw, rng) {
  const M = mat4(x, 0, z, yaw);
  const wood = 0x8a6848;
  const post = boxGeo(0.1, 2.5, 0.1, 1);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add('wood', post, mul(M, sx * 1.15, 1.25, sz * 0.6), wood);
  b.add('wood', boxGeo(2.3, 0.9, 1.0, 1), mul(M, 0, 0.45, 0.1), wood);
  b.add('wood', boxGeo(2.45, 0.06, 1.15, 1), mul(M, 0, 0.93, 0.1), 0x6a4c34, { ao: false });
  const aw = col(rng.pick(PAL.awning));
  b.add('fabric', boxGeo(2.8, 0.04, 1.8, 1), mul(M, 0, 2.55, 0.2, 0, 0.28), aw, { ao: false });
  // scalloped valance
  b.add('fabric', boxGeo(2.8, 0.3, 0.03, 1), mul(M, 0, 2.2, 1.1), aw, { ao: false });
  // goods
  const goods = ['#c0392b', '#e67e22', '#f1c40f', '#27ae60', '#8e44ad', '#e8d9b0'];
  for (let i = 0; i < 3; i++) {
    const gx = -0.75 + i * 0.75;
    const kind = rng.int(0, 2);
    if (kind === 0) {
      // basket of fruit
      b.add('wood', G.cyl8, mul(M, gx, 1.05, 0.15, 0, 0, 0, 0.3, 0.18, 0.3), 0x9a7a4a);
      const fc = col(rng.pick(goods));
      for (let k = 0; k < 6; k++) {
        b.add('plain', G.sphereLo, mul(M, gx + rng.range(-0.18, 0.18), 1.18 + rng.range(0, 0.06), 0.15 + rng.range(-0.18, 0.18), 0, 0, 0, 0.07, 0.07, 0.07), fc, { ao: false });
      }
    } else if (kind === 1) {
      // stacked cloth / bread loaves
      const fc = col(rng.pick(goods));
      for (let k = 0; k < 3; k++) b.add('plain', boxGeo(0.5, 0.08, 0.35, 1), mul(M, gx, 1.0 + k * 0.08, 0.15, rng.range(-0.2, 0.2)), fc.clone().multiplyScalar(0.8 + k * 0.1), { ao: false });
    } else {
      // potions
      for (let k = 0; k < 4; k++) {
        const fc = col(rng.pick(['#3aa6ff', '#e74c3c', '#2ecc71', '#f39c12']));
        b.add('plain', G.cyl8, mul(M, gx - 0.2 + k * 0.13, 1.05, 0.15 + rng.range(-0.1, 0.1), 0, 0, 0, 0.05, 0.2, 0.05), fc, { ao: false });
      }
    }
  }
  // crates behind
  b.add('wood', boxGeo(0.6, 0.6, 0.6, 1), mul(M, 1.6, 0.3, -0.3, rng.range(-0.3, 0.3)), 0x9a7a54);
  if (rng.chance(0.5)) b.add('wood', G.barrel, mul(M, -1.6, 0.4, -0.2), 0x8a6a44);
  const lamp = new THREE.Vector3(0.9, 2.1, 0.7).applyMatrix4(M);
  glows.add(lamp.x, lamp.y, lamp.z, 0.6, 0xffb466, 0.3);
}

export function addBench(b, x, z, yaw) {
  const M = mat4(x, 0, z, yaw);
  b.add('wood', boxGeo(1.8, 0.08, 0.45, 1), mul(M, 0, 0.46, 0), 0x8a6040);
  b.add('wood', boxGeo(1.8, 0.35, 0.06, 1), mul(M, 0, 0.75, -0.22, 0, -0.15), 0x8a6040);
  for (const sx of [-0.75, 0.75]) b.add('metal', boxGeo(0.08, 0.46, 0.45, 1), mul(M, sx, 0.23, 0), 0x222428);
}

// ------------------------------------------------------------------ city wall
function addWall(b, colliders, glows, rng) {
  const R = TOWN.wallR, H = TOWN.wallH, T = TOWN.wallThick;
  const stoneT = col('#cfc6b6');
  const N = 96;
  const segLen = (2 * Math.PI * R) / N + 0.25;
  const merlon = boxGeo(0.95, 1.1, 0.7, 2);
  const isGate = (a) => TOWN.gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) * R < 8.5);
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    if (isGate(a)) continue;
    const x = Math.sin(a) * R, z = Math.cos(a) * R;
    const M = mat4(x, 0, z, a);
    b.add('stone', boxGeo(segLen, H, T, 2, i * 0.37, 0), mul(M, 0, H / 2, 0), stoneT);
    // batter at the base
    b.add('stone', boxGeo(segLen, 1.6, T + 0.8, 2, i * 0.37, 0), mul(M, 0, 0.8, 0), stoneT.clone().multiplyScalar(0.9));
    // outer merlons + inner parapet
    for (let k = 0; k < 4; k++) {
      b.add('stone', merlon, mul(M, -segLen / 2 + (k + 0.5) * (segLen / 4), H + 0.55, T / 2 - 0.35), stoneT, { ao: false });
    }
    b.add('stone', boxGeo(segLen, 0.8, 0.4, 2), mul(M, 0, H + 0.4, -T / 2 + 0.2), stoneT, { ao: false });
    // corbel line
    b.add('stone', boxGeo(segLen, 0.3, 0.3, 2), mul(M, 0, H - 0.4, T / 2 + 0.12), stoneT.clone().multiplyScalar(0.85), { ao: false });
  }
  // round towers
  const towerG = new THREE.CylinderGeometry(4.1, 4.6, 15, 18, 1);
  scaleUV(towerG, (Math.PI * 2 * 4.3) / 2, 15 / 2);
  const towerTop = new THREE.CylinderGeometry(4.6, 4.3, 1.2, 18, 1);
  scaleUV(towerTop, 14, 0.6);
  const cone = new THREE.ConeGeometry(5.2, 7, 18, 1);
  scaleUV(cone, 16, 4);
  const roofT = col('#56606c');
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    if (isGate(a)) continue;
    const x = Math.sin(a) * R, z = Math.cos(a) * R;
    b.add('stone', towerG, mat4(x, 7.5, z), stoneT);
    b.add('stone', towerTop, mat4(x, 15.3, z), stoneT.clone().multiplyScalar(0.9), { ao: false });
    b.add('roof', cone, mat4(x, 15.9 + 3.5, z), roofT, { ao: false });
    b.add('metal', G.cyl8, mat4(x, 23.8, z, 0, 0, 0, 0.05, 1.4, 0.05), 0xc9a24a, { ao: false });
    colliders.addCircle(x, z, 4.6);
    // arrow slit glow
    const g = new THREE.Vector3(x, 10, z).multiplyScalar(1).add(new THREE.Vector3(-Math.sin(a), 0, -Math.cos(a)).multiplyScalar(4.2));
    glows.add(g.x, g.y, g.z, 0.9, 0xffa050, 0.3);
  }
  // gatehouses
  for (const ga of TOWN.gates) {
    const gx = Math.sin(ga) * R, gz = Math.cos(ga) * R;
    const M = mat4(gx, 0, gz, ga);
    const archW = archWallGeo(17, H + 2.5, T + 1.2, 6.4, 7.2, 2);
    b.add('stone', archW, mul(M, 0, 0, 0), stoneT);
    const ring = archRingGeo(3.2, 3.9, T + 1.6, 16);
    b.add('stone', ring, mul(M, 0, 7.2 - 3.2, 0), stoneT.clone().multiplyScalar(0.85), { ao: false });
    for (const s of [-1, 1]) {
      // square flanking towers
      const tx = s * 8.2;
      b.add('stone', boxGeo(5.2, 16, 6.2, 2), mul(M, tx, 8, 0.3), stoneT);
      b.add('stone', boxGeo(5.8, 0.6, 6.8, 2), mul(M, tx, 16.1, 0.3), stoneT.clone().multiplyScalar(0.9), { ao: false });
      for (let k = 0; k < 3; k++) {
        b.add('stone', merlon, mul(M, tx - 2 + k * 2, 16.9, 3.3), stoneT, { ao: false });
        b.add('stone', merlon, mul(M, tx - 2 + k * 2, 16.9, -2.7), stoneT, { ao: false });
      }
      b.add('roof', spireGeo(4.4, 6, 4), mul(M, tx, 16.4, 0.3), roofT, { ao: false });
      const p = localToWorld(M, tx, 16.4 + 6.2, 0.3);
      b.add('metal', G.cyl8, mat4(p[0], p[1], p[2], 0, 0, 0, 0.05, 1.2, 0.05), 0xc9a24a, { ao: false });
      // banners (outer side)
      b.add('fabric', boxGeo(1.6, 5.5, 0.04, 1), mul(M, tx, 10.5, 3.45), col('#1f3f8a'), { ao: false });
      b.add('fabric', boxGeo(0.35, 5.5, 0.05, 1), mul(M, tx, 10.5, 3.47), col('#d9a93a'), { ao: false });
      b.add('fabric', boxGeo(1.6, 5.5, 0.04, 1), mul(M, tx, 10.5, -2.85), col('#1f3f8a'), { ao: false });
      // torch glows beside the arch
      const tp = localToWorld(M, s * 4.2, 5.2, T / 2 + 0.9);
      glows.add(tp[0], tp[1], tp[2], 1.6, 0xff9a40, 0.5);
      const tp2 = localToWorld(M, s * 4.2, 5.2, -T / 2 - 0.9);
      glows.add(tp2[0], tp2[1], tp2[2], 1.6, 0xff9a40, 0.5);
      b.add('metal', boxGeo(0.12, 0.5, 0.12, 1), mul(M, s * 4.2, 4.8, T / 2 + 0.8), 0x222222, { ao: false });
      b.add('metal', boxGeo(0.12, 0.5, 0.12, 1), mul(M, s * 4.2, 4.8, -T / 2 - 0.8), 0x222222, { ao: false });
      // colliders for the tower + wall piece beside the opening
      const c = localToWorld(M, tx, 0, 0.3);
      colliders.addBox(c[0], c[2], 2.6, 3.1, ga);
      const w2 = localToWorld(M, s * 4.9, 0, 0);
      colliders.addBox(w2[0], w2[2], 1.7, (T + 1.2) / 2, ga);
    }
    // raised portcullis teeth
    for (let k = -2; k <= 2; k++) b.add('metal', boxGeo(0.1, 1.3, 0.1, 1), mul(M, k * 1.2, 6.2, 0), 0x2a2a2e, { ao: false });
  }
}

// ------------------------------------------------------------------ cathedral
function addCathedral(b, colliders, glows, m) {
  const dark = col('#8a8c95');
  const darker = col('#6d6f79');
  const roofT = col('#3b4250');
  const gold = 0xd4a64a;
  const zF = -38; // front face
  const M = mat4(0, 0, 0);
  // front stairs
  for (let i = 0; i < 4; i++) {
    b.add('stone', boxGeo(20 - i * 0.6, 0.22, 3.2 - i * 0.7, 2), mat4(0, 0.11 + i * 0.22, zF + 1.8 - i * 0.35), dark);
  }
  // facade with portal
  const facade = archWallGeo(16, 25, 2.4, 6.2, 9.4, 2);
  b.add('stone', facade, mat4(0, 0.9, zF - 1.2), dark);
  b.add('stone', boxGeo(16, 0.9, 2.4, 2), mat4(0, 0.45, zF - 1.2), darker);
  for (let i = 0; i < 3; i++) {
    b.add('stone', archRingGeo(3.1 + i * 0.35, 3.45 + i * 0.35, 2.6 + i * 0.3, 18), mat4(0, 0.9 + 9.4 - 3.1, zF - 1.2 + 0.1 + i * 0.12), i % 2 ? darker : dark, { ao: false });
  }
  // doors
  b.add('door', quadGeo(6.1, 9.2, 0, 0, 1, 1), mat4(0, 0.9 + 4.6, zF - 1.9), 0xb0a090, { ao: false });
  // rose window
  const rose = new THREE.CircleGeometry(3.1, 32);
  b.add('rose', rose, mat4(0, 16.5, zF + 0.02), 0xffffff, { ao: false });
  b.add('stone', new THREE.TorusGeometry(3.3, 0.35, 8, 32), mat4(0, 16.5, zF + 0.05), darker, { ao: false });
  glows.add(0, 16.5, zF + 0.6, 7.5, 0x6a7cff, 0, 400);
  // gable over facade
  b.add('stone', gableGeo(16, 9.5, 2.4, 2), mat4(0, 25.9, zF - 1.2), dark, { ao: false });
  b.add('metal', G.cyl8, mat4(0, 36.2, zF - 1.2, 0, 0, 0, 0.1, 1.6, 0.1), gold, { ao: false });
  b.add('metal', boxGeo(1.2, 0.12, 0.12, 1), mat4(0, 36.4, zF - 1.2), gold, { ao: false });
  // twin bell towers
  for (const s of [-1, 1]) {
    const tx = s * 12;
    const tz = zF - 4;
    b.add('stone', boxGeo(8, 36, 8, 2), mat4(tx, 18, tz), dark);
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.add('stone', boxGeo(1.4, 36.5, 1.4, 2), mat4(tx + cx * 4, 18.25, tz + cz * 4), darker);
    }
    // belfry openings
    for (let face = 0; face < 4; face++) {
      const ry = (face * Math.PI) / 2;
      const Mt = mul(mat4(tx, 0, tz), 0, 0, 0, ry);
      b.add('plain', quadGeo(2.2, 5.5), mul(Mt, 0, 29, 4.02), 0x14161c, { ao: false });
      b.add('stone', archRingGeo(1.1, 1.5, 0.4, 10), mul(Mt, 0, 30.6, 4.1), darker, { ao: false });
      b.add('lancet', quadGeo(1.4, 4.2), mul(Mt, 0, 14, 4.02), 0xffffff, { ao: false });
      const gp = localToWorld(Mt, 0, 14, 4.6);
      glows.add(gp[0], gp[1], gp[2], 3.2, 0xb08cff, 0, 400);
    }
    b.add('stone', boxGeo(9.2, 1.2, 9.2, 2), mat4(tx, 36.6, tz), darker, { ao: false });
    b.add('roof', spireGeo(5.4, 20, 8), mat4(tx, 37.2, tz, Math.PI / 8), roofT, { ao: false });
    // pinnacles
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      b.add('roof', spireGeo(0.8, 5, 4), mat4(tx + cx * 4.1, 37.2, tz + cz * 4.1), roofT, { ao: false });
    }
    b.add('metal', G.cyl8, mat4(tx, 58, tz, 0, 0, 0, 0.08, 2.4, 0.08), gold, { ao: false });
    colliders.addBox(tx, tz, 4.8, 4.8, 0);
  }
  // nave
  const naveZ0 = zF - 2.4, naveZ1 = -86;
  const naveL = naveZ0 - naveZ1;
  const naveC = (naveZ0 + naveZ1) / 2;
  b.add('stone', boxGeo(18, 22, naveL, 2), mat4(0, 11, naveC), dark);
  addRoof(b, mat4(0, 0, naveC, Math.PI / 2), naveL, 18, 0.95, 22, roofT, 'stone', dark, new RNG(3), { over: 0.8, endOver: 0.2, noGables: false });
  // aisles
  for (const s of [-1, 1]) {
    b.add('stone', boxGeo(6, 12, naveL - 4, 2), mat4(s * 12, 6, naveC - 2), darker);
    const lean = boxGeo(naveL - 3, 0.25, 7.4, 2);
    b.add('roof', lean, mat4(s * 12.2, 13.7, naveC - 2, s * Math.PI / 2, 0.42), roofT, { ao: false });
    // buttresses + clerestory windows
    for (let k = 0; k < 6; k++) {
      const z = naveZ0 - 5 - k * 7;
      b.add('stone', boxGeo(1.4, 18, 2.2, 2), mat4(s * 15.6, 9, z), darker);
      b.add('roof', spireGeo(0.9, 3, 4), mat4(s * 15.6, 18, z), roofT, { ao: false });
      b.add('lancet', quadGeo(1.6, 5.4), mat4(s * 9.03, 17.2, z - 3.5, s * Math.PI / 2), 0xffffff, { ao: false });
      b.add('lancet', quadGeo(1.4, 4.2), mat4(s * 15.02, 6.4, z - 3.5, s * Math.PI / 2), 0xffffff, { ao: false });
      glows.add(s * 9.8, 17.2, z - 3.5, 3.0, 0x9a8cff, 0, 300);
    }
  }
  // apse
  const apse = new THREE.CylinderGeometry(9, 9, 20, 20, 1, false, Math.PI / 2, Math.PI);
  scaleUV(apse, 14, 10);
  b.add('stone', apse, mat4(0, 10, naveZ1), dark);
  const apseRoof = new THREE.ConeGeometry(9.8, 8, 20, 1, false, Math.PI / 2, Math.PI);
  scaleUV(apseRoof, 16, 4);
  b.add('roof', apseRoof, mat4(0, 24, naveZ1), roofT, { ao: false });
  colliders.addBox(0, naveC, 15.2, naveL / 2, 0);
  colliders.addCircle(0, naveZ1, 9);
  colliders.addBox(0, zF - 1.2, 8, 1.2, 0);
  // courtyard lamps
  for (const s of [-1, 1]) {
    addLamp(b, glows, s * 10, zF + 6, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  return { entrance: new THREE.Vector3(0, 0, zF + 4) };
}

// ------------------------------------------------------------------ fountain (stone part)
export function addFountain(b, colliders, glows, p) {
  const stoneT = col('#e0d8c8');
  const basin = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0, 0.25),
      new THREE.Vector2(4.2, 0.25),
      new THREE.Vector2(4.2, 0.72),
      new THREE.Vector2(4.75, 0.78),
      new THREE.Vector2(4.85, 0.7),
      new THREE.Vector2(4.8, 0.0),
    ],
    40
  );
  scaleUV(basin, 12, 1);
  b.add('stone', basin, mat4(p.x, 0, p.z), stoneT);
  const column = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0, 0.2),
      new THREE.Vector2(1.2, 0.2),
      new THREE.Vector2(1.0, 0.6),
      new THREE.Vector2(0.55, 0.9),
      new THREE.Vector2(0.45, 2.1),
      new THREE.Vector2(1.9, 2.25),
      new THREE.Vector2(2.0, 2.45),
      new THREE.Vector2(1.6, 2.5),
      new THREE.Vector2(0.4, 2.55),
      new THREE.Vector2(0.35, 3.6),
      new THREE.Vector2(1.0, 3.7),
      new THREE.Vector2(1.05, 3.85),
      new THREE.Vector2(0.3, 3.9),
      new THREE.Vector2(0.2, 4.8),
      new THREE.Vector2(0.0, 4.9),
    ],
    24
  );
  scaleUV(column, 4, 2);
  b.add('stone', column, mat4(p.x, 0, p.z), stoneT);
  colliders.addCircle(p.x, p.z, 4.9);
  glows.add(p.x, 5.1, p.z, 1.6, 0x7fc8ff, 0.2);
}

// ------------------------------------------------------------------ main
// chimney tops collected while houses are built (for smoke)
const CHIMNEYS = [];
export function takeChimneys() {
  return CHIMNEYS.splice(0, CHIMNEYS.length);
}

export function buildTown(m, tex, colliders, glows) {
  templates();
  if (!m.ivy) m.ivy = sharedFoliage().vineMat;
  const rng = new RNG(1337);
  const b = new GeoBuilder();
  const treeSpots = [];
  const npcSpots = [];
  const lamps = [];

  // plaza decorative rings (paving inlays)
  const inlay = new THREE.RingGeometry(9.5, 10.3, 64, 1);
  inlay.rotateX(-Math.PI / 2);
  scaleUV(inlay, 10, 10);
  b.add('stone', inlay, mat4(0, 0.03, 0), col('#d8cdb8'), { ao: false });
  const inlay2 = new THREE.RingGeometry(26.6, 27.6, 96, 1);
  inlay2.rotateX(-Math.PI / 2);
  scaleUV(inlay2, 27, 27);
  b.add('stone', inlay2, mat4(0, 0.03, 0), col('#d8cdb8'), { ao: false });

  // plaza ring of lamps, benches and trees
  for (let k = 0; k < 12; k++) {
    const a = ((k + 0.5) / 12) * Math.PI * 2;
    const nearAvenue = [0, Math.PI / 2, Math.PI, -Math.PI / 2].some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.2);
    if (nearAvenue) continue;
    addLamp(b, glows, Math.sin(a) * 22, Math.cos(a) * 22, a + Math.PI);
    colliders.addCircle(Math.sin(a) * 22, Math.cos(a) * 22, 0.25);
  }
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const tx = Math.sin(a) * 24.5, tz = Math.cos(a) * 24.5;
    treeSpots.push({ x: tx, z: tz, kind: 'plane', s: 1.0 });
    // planter
    const pl = new THREE.CylinderGeometry(1.7, 1.8, 0.55, 16);
    scaleUV(pl, 5, 0.5);
    b.add('stone', pl, mat4(tx, 0.27, tz), col('#d6ccb8'));
    b.add('foliage', new THREE.CylinderGeometry(1.55, 1.55, 0.05, 16), mat4(tx, 0.55, tz), col('#3c5a24'), { ao: false });
    colliders.addCircle(tx, tz, 1.8);
    const ba = a + 0.22;
    addBench(b, Math.sin(ba) * 23.5, Math.cos(ba) * 23.5, ba + Math.PI);
  }

  // fountain square
  addFountain(b, colliders, glows, TOWN.fountain);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + 0.3;
    const x = TOWN.fountain.x + Math.sin(a) * 8.5, z = TOWN.fountain.z + Math.cos(a) * 8.5;
    if (Math.abs(x) < 3) continue;
    addBench(b, x, z, a + Math.PI);
  }

  const cathedral = addCathedral(b, colliders, glows, m);

  // --- houses in rings
  const rows = [
    { front: 33, dmin: 8, dmax: 10, fmin: 3, fmax: 4 },
    { front: 48, dmin: 8, dmax: 9.5, fmin: 2, fmax: 4 },
    { front: 63, dmin: 8, dmax: 9.5, fmin: 2, fmax: 3 },
    { front: 78, dmin: 8, dmax: 9.5, fmin: 2, fmax: 3 },
    { front: 93, dmin: 7.5, dmax: 9, fmin: 2, fmax: 3 },
  ];
  const avenues = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const squares = [
    { x: TOWN.fountain.x, z: TOWN.fountain.z, r: 13 },
    { x: 62, z: 0, r: 10 },
    { x: -62, z: 0, r: 10 },
  ];
  const blocked = (x, z, hw) => {
    for (const g of avenues) {
      const gx = Math.sin(g), gz = Math.cos(g);
      const along = x * gx + z * gz;
      const lat = Math.abs(x * gz - z * gx);
      if (along > 0 && lat < TOWN.avenueHalf + hw) return true;
    }
    for (const s of squares) if (Math.hypot(x - s.x, z - s.z) < s.r + hw) return true;
    // cathedral precinct
    if (x > -26 && x < 26 && z < -28 && z > -100) return true;
    return false;
  };
  let houses = 0;
  const shopTypes = PAL.awning;
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    let theta = rng.range(0, 0.1);
    while (theta < Math.PI * 2 - 0.02) {
      const w = rng.range(6.2, 9.8);
      const d = rng.range(row.dmin, row.dmax);
      const angW = w / row.front;
      const tc = theta + angW / 2;
      if (tc + angW / 2 > Math.PI * 2) break;
      const rc = row.front + d / 2;
      const x = Math.sin(tc) * rc, z = Math.cos(tc) * rc;
      if (blocked(x, z, w / 2 + 0.5)) {
        theta += 1.2 / row.front;
        continue;
      }
      // leave occasional alleys
      if (rng.chance(0.08)) {
        theta += 3 / row.front;
        continue;
      }
      const styleR = rng.next();
      const style = styleR < 0.45 ? 'timber' : styleR < 0.72 ? 'plaster' : 'stone';
      const spec = {
        w, d,
        floors: rng.int(row.fmin, row.fmax),
        fh: rng.range(2.9, 3.3),
        style,
        jetty: rng.chance(0.7),
        roofType: rng.chance(0.55) ? 'side' : 'front',
        pitch: rng.range(0.72, 0.95),
        plaster: rng.pick(PAL.plaster),
        stone: rng.pick(PAL.stone),
        roof: rng.pick(PAL.roof),
        shutter: rng.chance(0.45) ? rng.pick(PAL.shutter) : null,
        flowers: rng.chance(0.4),
        balcony: rng.chance(0.15),
        chimney: rng.chance(0.65),
        lit: 0.3,
        shop: (ri === 0 || ri === 2) && rng.chance(0.35) ? rng.pick(shopTypes) : null,
        backDoor: rng.chance(0.3),
        braces: rng.chance(0.5),
        ivy: rng.chance(0.22),
      };
      if (spec.roofType === 'front' && w > 8.5) spec.pitch = Math.min(spec.pitch, 0.8);
      const yaw = tc + Math.PI;
      addHouse(b, glows, x, z, yaw, spec, rng);
      colliders.addBox(x, z, w / 2 + 0.1, d / 2 + 0.45, yaw);
      houses++;
      theta += (w + 0.08) / row.front;
    }
  }

  // --- avenue lamps + market stalls along the south avenue
  for (const g of avenues) {
    const gx = Math.sin(g), gz = Math.cos(g);
    const px = gz, pz = -gx; // perpendicular
    for (let r = 34; r < 104; r += 14) {
      if (g === Math.PI && r < 100) continue; // cathedral side
      for (const s of [-1, 1]) {
        const x = gx * r + px * s * 5.3, z = gz * r + pz * s * 5.3;
        if (squares.some((q) => Math.hypot(x - q.x, z - q.z) < q.r)) continue;
        addLamp(b, glows, x, z, Math.atan2(-px * s, -pz * s));
        colliders.addCircle(x, z, 0.25);
      }
    }
  }
  for (let r = 36; r < 100; r += 4.2) {
    if (Math.abs(r - TOWN.fountain.z) < 15) continue;
    for (const s of [-1, 1]) {
      if (rng.chance(0.25)) continue;
      const x = s * 3.9, z = r;
      addStall(b, glows, x, z, s > 0 ? -Math.PI / 2 : Math.PI / 2, rng);
      colliders.addBox(x, z, 0.75, 1.3, 0);
      if (rng.chance(0.6)) npcSpots.push({ x: x + s * 1.2, z, yaw: s > 0 ? -Math.PI / 2 : Math.PI / 2, role: 'vendor' });
    }
  }

  // ring-street lamps
  const streetR = [45.5, 60.5, 75.5, 90.5];
  for (const sr of streetR) {
    const n = Math.floor((Math.PI * 2 * sr) / 24);
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      const rr = sr + 1.3;
      const x = Math.sin(a) * rr, z = Math.cos(a) * rr;
      if (blocked(x, z, 0.5)) continue;
      addLamp(b, glows, x, z, a + Math.PI);
      colliders.addCircle(x, z, 0.25);
    }
  }

  // east / west squares: a well and a big tree
  {
    const wx = -62, wz = 0;
    const well = new THREE.CylinderGeometry(1.4, 1.5, 1.0, 20, 1, true);
    scaleUV(well, 4.5, 0.5);
    b.add('stone', well, mat4(wx, 0.5, wz), col('#cfc6b6'));
    b.add('stone', new THREE.TorusGeometry(1.45, 0.14, 6, 24), mat4(wx, 1.02, wz, 0, Math.PI / 2), col('#d8cfbf'), { ao: false });
    b.add('plain', new THREE.CircleGeometry(1.35, 20), mat4(wx, 0.6, wz, 0, -Math.PI / 2), col('#10202a'), { ao: false });
    for (const s of [-1, 1]) b.add('wood', boxGeo(0.15, 2.6, 0.15, 1), mat4(wx + s * 1.3, 1.3, wz), 0x6a4a34);
    b.add('wood', boxGeo(2.9, 0.15, 0.15, 1), mat4(wx, 2.55, wz), 0x6a4a34);
    b.add('roof', gableGeo(3.4, 1.1, 2.0, 2), mat4(wx, 2.6, wz), col('#8f3b24'), { ao: false });
    colliders.addCircle(wx, wz, 1.6);
    treeSpots.push({ x: 62, z: 0, kind: 'plane', s: 1.5 });
    const pl = new THREE.CylinderGeometry(2.6, 2.7, 0.5, 20);
    scaleUV(pl, 8, 0.5);
    b.add('stone', pl, mat4(62, 0.25, 0), col('#d6ccb8'));
    colliders.addCircle(62, 0, 2.7);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      addBench(b, 62 + Math.sin(a) * 5.2, Math.cos(a) * 5.2, a + Math.PI);
    }
  }

  // scattered barrels & crates in alleys
  for (let k = 0; k < 90; k++) {
    const sr = rng.pick(streetR) + rng.range(-1.2, 1.2);
    const a = rng.range(0, Math.PI * 2);
    const x = Math.sin(a) * (sr - 1.6), z = Math.cos(a) * (sr - 1.6);
    if (blocked(x, z, 1)) continue;
    if (rng.chance(0.5)) b.add('wood', G.barrel, mat4(x, 0.4, z, rng.range(0, 6)), col('#8a6a44'));
    else b.add('wood', boxGeo(0.7, 0.7, 0.7, 1), mat4(x, 0.35, z, rng.range(0, 6)), col('#9a7a54'));
    colliders.addCircle(x, z, 0.45);
  }

  addWall(b, colliders, glows, rng);

  const group = b.build(m, { name: 'town' });
  group.add(lightPools(takeLamps()));
  return { group, treeSpots, npcSpots, cathedral, houses, streets: [30.5, ...streetR, 106], squares, chimneys: takeChimneys() };
}
