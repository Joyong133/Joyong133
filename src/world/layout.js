// World layout constants + the terrain height function shared by rendering,
// physics, vegetation scattering and monster AI.
import * as THREE from 'three';
import { fbm, smoothstep, lerp } from '../core/noise.js';

export const WORLD_R = 500;

export const TOWN = {
  plazaR: 28,
  wallR: 111,
  wallThick: 3.2,
  wallH: 9,
  safeR: 113,
  avenueHalf: 6,
  gates: [0, Math.PI / 2, -Math.PI / 2], // south(+z), east(+x), west(-x) ; angle measured atan2(x, z)
  fountain: new THREE.Vector3(0, 0, 60),
};

// Sun comes from the west-south-west, low golden afternoon light.
export const SUN_DIR = new THREE.Vector3(-0.82, 0.34, 0.46).normalize();

export const LAKE = { x: -150, z: 175, r: 34, level: -1.2 };
export const TOWER = { x: -185, z: 380, r: 32 };
export const CEILING_Y = 370;
export const OUTPOST = new THREE.Vector3(0, 0, 262);
export const BOSS_ARENA = new THREE.Vector3(-120, 0, 330);
export const OVERLOOK = new THREE.Vector3(20, 0, 478);

// Dirt roads (polylines in XZ).
export const ROADS = [
  [[0, 106], [0, 140], [9, 180], [-4, 222], [0, 262], [22, 305], [14, 360], [22, 420], [20, 480]],
  [[0, 262], [-38, 286], [-80, 312], [-120, 330], [-150, 352], [-170, 362]],
  [[106, 0], [150, 4], [200, -8], [262, -2], [320, 10]],
  [[-106, 0], [-150, -6], [-205, 6], [-260, 0], [-320, -8]],
];

const SEGS = [];
for (const road of ROADS) {
  for (let i = 0; i < road.length - 1; i++) SEGS.push([road[i][0], road[i][1], road[i + 1][0], road[i + 1][1]]);
}
export const ROAD_SEGMENTS = SEGS;

export function roadDistance(x, z) {
  let best = 1e9;
  for (let i = 0; i < SEGS.length; i++) {
    const s = SEGS[i];
    const dx = s[2] - s[0], dz = s[3] - s[1];
    const px = x - s[0], pz = z - s[1];
    let t = (px * dx + pz * dz) / (dx * dx + dz * dz);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - dx * t, ez = pz - dz * t;
    const d = ex * ex + ez * ez;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

function flatSpot(x, z, p, r0, r1, h, target) {
  const d = Math.hypot(x - p.x, z - p.z);
  return lerp(target, h, smoothstep(r0, r1, d));
}

function hills(x, z, octaves) {
  const n = fbm(x * 0.0055 + 31.7, z * 0.0055 - 12.3, octaves, 3);
  let v = (n - 0.38) * 46;
  if (octaves > 3) v += (fbm(x * 0.022, z * 0.022, 3, 9) - 0.5) * 3.5;
  return Math.max(v, -3) + 3;
}

// Floor-1 terrain. Everything else goes through heightAt(), which follows
// whichever map (floor 1, labyrinth, floor 2…) the player is currently on.
export function heightF1(x, z) {
  const r = Math.hypot(x, z);
  if (r < 113) return 0;
  const out = smoothstep(113, 175, r);
  const lift = smoothstep(113, 200, r) * 2.5;
  // mountains around the rim except the southern overlook
  const ang = Math.atan2(x, z);
  const southGap = smoothstep(0.35, 0.75, Math.abs(ang - 0.05));
  const rim = smoothstep(360, 470, r) * southGap;
  const rimH = rim > 0 ? rim * (18 + fbm(x * 0.01, z * 0.01, 4, 77) * 70) : 0;
  let h = hills(x, z, 5) * out + lift + rimH;
  // roads are flattened toward a smoother version of the terrain
  const dr = roadDistance(x, z);
  if (dr < 14) {
    const target = Math.max(hills(x, z, 2) * out * 0.9 + lift + rimH, 0.15);
    h = lerp(target, h, smoothstep(3.5, 13, dr));
  }
  // lake basin
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 1.8) {
    const bowl = LAKE.level - 3.5 * (1 - smoothstep(0, LAKE.r, dl));
    h = lerp(bowl, h, smoothstep(LAKE.r * 0.75, LAKE.r * 1.8, dl));
  }
  // flat plateaus for points of interest
  h = flatSpot(x, z, OUTPOST, 16, 34, h, 4);
  h = flatSpot(x, z, BOSS_ARENA, 26, 48, h, 4);
  h = flatSpot(x, z, TOWER, TOWER.r + 6, TOWER.r + 40, h, 6);
  h = flatSpot(x, z, OVERLOOK, 18, 40, h, 8);
  return h;
}

let activeHeight = heightF1;
export function setActiveHeight(fn) {
  activeHeight = fn;
}
export function heightAt(x, z) {
  return activeHeight(x, z);
}

export function isInTown(x, z) {
  return x * x + z * z < TOWN.safeR * TOWN.safeR;
}
