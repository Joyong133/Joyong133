// A wooden fishing pier reaching into a lake, with rails that keep you on
// the deck and a walking-height function so you can stroll along it.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo } from '../core/geo.js';

// dir: unit vector from the lake centre toward the shore the pier starts on
export function pierSpec(lake, dir, from = 34, to = 20, deck = -0.42) {
  const P = {
    x0: lake.x + dir.x * from, z0: lake.z + dir.y * from,
    x1: lake.x + dir.x * to, z1: lake.z + dir.y * to,
    half: 1.25, deck,
  };
  P.yaw = Math.atan2(P.x1 - P.x0, P.z1 - P.z0);
  P.len = Math.hypot(P.x1 - P.x0, P.z1 - P.z0);
  P.fx = Math.sin(P.yaw);
  P.fz = Math.cos(P.yaw);
  return P;
}

// deck height where the point is on the pier, else null
export function pierHeight(P, x, z) {
  const dx = x - P.x0, dz = z - P.z0;
  const along = dx * P.fx + dz * P.fz;
  const lat = dx * P.fz - dz * P.fx;
  if (along > -1 && along < P.len + 0.2 && Math.abs(lat) < P.half) return P.deck;
  return null;
}

// world point relative to the pier: `back` metres landward, `side` metres sideways
export function pierPoint(P, back, side) {
  return { x: P.x0 - P.fx * back + P.fz * side, z: P.z0 - P.fz * back - P.fx * side };
}

export function buildPier(m, colliders, P, groundAt, { hut = true } = {}) {
  const b = new GeoBuilder();
  const M = mat4(P.x0, 0, P.z0, P.yaw);
  const wood = new THREE.Color('#8a6a48');
  const dark = new THREE.Color('#5a4430');
  const L = P.len + 3;
  for (let i = 0; i < Math.ceil(L / 0.5); i++) {
    const along = -3 + i * 0.5 + 0.25;
    b.add('wood', boxGeo(P.half * 2 + 0.1, 0.08, 0.46, 1, i * 0.37), M.clone().multiply(mat4(0, P.deck - 0.04, along, 0, 0, ((i % 3) - 1) * 0.01)), wood.clone().multiplyScalar(0.85 + (i % 4) * 0.05), { ao: false });
  }
  for (let k = 0; k <= 4; k++) {
    const along = (k / 4) * P.len;
    for (const s of [-1, 1]) {
      b.add('wood', boxGeo(0.18, 3.2, 0.18, 1), M.clone().multiply(mat4(s * P.half, P.deck - 1.5, along)), dark);
      b.add('wood', boxGeo(0.12, 1.0, 0.12, 1), M.clone().multiply(mat4(s * P.half, P.deck + 0.45, along)), dark, { ao: false });
    }
    if (k < 4) for (const s of [-1, 1]) {
      b.add('wood', boxGeo(0.08, 0.08, P.len / 4, 1), M.clone().multiply(mat4(s * P.half, P.deck + 0.9, along + P.len / 8)), wood, { ao: false });
    }
  }
  for (let a = 0; a <= P.len; a += 1.2) {
    for (const s of [-1, 1]) {
      colliders.addCircle(P.x0 + P.fx * a + P.fz * s * (P.half + 0.25), P.z0 + P.fz * a - P.fx * s * (P.half + 0.25), 0.22);
    }
  }
  colliders.addCircle(P.x1 + P.fx * 0.9, P.z1 + P.fz * 0.9, 0.5);
  if (hut) {
    const hp = pierPoint(P, 2, 4);
    const H = mat4(hp.x, groundAt(hp.x, hp.z), hp.z, P.yaw);
    b.add('wood', boxGeo(0.6, 0.8, 0.6, 1), H.clone().multiply(mat4(0, 0.4, 0)), '#7a5a3a');
    b.add('wood', boxGeo(0.6, 0.8, 0.6, 1), H.clone().multiply(mat4(0.7, 0.4, 0.2, 0.4)), '#8a6a44');
    b.add('wood', boxGeo(1.6, 0.1, 0.1, 1), H.clone().multiply(mat4(0, 1.5, -0.5)), dark);
    for (let k = 0; k < 4; k++) b.add('wood', boxGeo(0.03, 2.2, 0.03, 1), H.clone().multiply(mat4(-0.6 + k * 0.4, 1.1, -0.45, 0, 0.1)), '#b09060', { ao: false });
    colliders.addCircle(hp.x, hp.z, 0.9);
  }
  return b.build(m, { name: 'pier', castShadow: false });
}
