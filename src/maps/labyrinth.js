// The top of the floor-1 labyrinth tower: an entrance chamber, a torch-lit
// corridor guarded by kobold sentinels, the circular boss hall of the Kobold
// Lord, and — once he falls — the stairs of light up to floor 2.
import * as THREE from 'three';
import { GeoBuilder, mat4, boxGeo, scaleUV, archRingGeo, spireGeo } from '../core/geo.js';
import { Colliders } from '../world/collision.js';

export const LAB = {
  hall: { x: 0, z: -18, r: 26, h: 15 },
  corridor: { half: 4, z0: 8, z1: 56, h: 7.5 },
  stairs: { half: 3, z0: -43, z1: -64, rise: 8 },
  entry: new THREE.Vector3(0, 0, 51),
};

export function heightLab(x, z) {
  const s = LAB.stairs;
  if (z < s.z0 + 1 && Math.abs(x) < s.half + 1) {
    const u = THREE.MathUtils.clamp((s.z0 - z) / (s.z0 - s.z1), 0, 1);
    return Math.floor(u * 16) / 16 * s.rise;
  }
  return 0;
}

// inside-out copy of a geometry (for walls & domes seen from within)
function invert(g) {
  const out = g.index ? g.toNonIndexed() : g.clone();
  const p = out.attributes.position;
  const n = out.attributes.normal;
  const uv = out.attributes.uv;
  for (let i = 0; i < p.count; i += 3) {
    for (const a of [p, n, uv]) {
      if (!a) continue;
      for (let c = 0; c < a.itemSize; c++) {
        const t = a.array[(i + 1) * a.itemSize + c];
        a.array[(i + 1) * a.itemSize + c] = a.array[(i + 2) * a.itemSize + c];
        a.array[(i + 2) * a.itemSize + c] = t;
      }
    }
  }
  for (let i = 0; i < n.array.length; i++) n.array[i] = -n.array[i];
  return out;
}

export function buildLabyrinth(world, glows) {
  const { m } = world;
  const root = new THREE.Group();
  root.name = 'labyrinth';
  const colliders = new Colliders(8, null);
  const b = new GeoBuilder();
  const nb = new GeoBuilder(); // no shadow casting (ceilings)
  const H = LAB.hall, C = LAB.corridor, S = LAB.stairs;
  const stone = new THREE.Color('#9c968c');
  const dark = new THREE.Color('#6e6a64');
  const floorT = new THREE.Color('#8e877c');
  const gold = new THREE.Color('#c8a040');

  // ---- floors
  const hallFloor = new THREE.CircleGeometry(H.r + 1, 64);
  hallFloor.rotateX(-Math.PI / 2);
  scaleUV(hallFloor, (H.r + 1) * 2 / 3.2);
  b.add('cobble', hallFloor, mat4(H.x, 0, H.z), floorT, { ao: false });
  const inlay = new THREE.RingGeometry(9, 10, 64);
  inlay.rotateX(-Math.PI / 2);
  b.add('stone', inlay, mat4(H.x, 0.02, H.z), new THREE.Color('#b8a070'), { ao: false });
  const inlay2 = new THREE.RingGeometry(15.5, 16, 64);
  inlay2.rotateX(-Math.PI / 2);
  b.add('stone', inlay2, mat4(H.x, 0.02, H.z), new THREE.Color('#a89060'), { ao: false });
  b.add('cobble', boxGeo(C.half * 2 + 0.4, 0.2, C.z1 - C.z0 + 2, 3.2), mat4(0, -0.1, (C.z0 + C.z1) / 2), floorT, { ao: false });

  // ---- corridor: walls, ribs, vaulted ceiling
  const cl = C.z1 - C.z0 + 2;
  for (const s of [-1, 1]) {
    b.add('stone', boxGeo(1.2, C.h, cl, 2), mat4(s * (C.half + 0.6), C.h / 2, (C.z0 + C.z1) / 2), stone);
    colliders.addBox(s * (C.half + 0.6), (C.z0 + C.z1) / 2, 0.6, cl / 2);
  }
  for (let z = C.z0 + 3; z < C.z1; z += 6) {
    for (const s of [-1, 1]) {
      b.add('stone', boxGeo(0.8, C.h, 0.9, 2), mat4(s * (C.half - 0.1), C.h / 2, z), dark);
      colliders.addBox(s * (C.half - 0.1), z, 0.4, 0.45);
    }
    b.add('stone', archRingGeo(C.half - 0.5, C.half + 0.2, 0.9, 12), mat4(0, C.h - 1.2, z), dark, { ao: false });
  }
  // the corridor roof casts shadows: only torchlight and a little skylight reach inside
  b.add('stone', boxGeo(C.half * 2 + 2.4, 0.8, cl, 2), mat4(0, C.h + 0.4, (C.z0 + C.z1) / 2), dark.clone().multiplyScalar(0.7), { ao: false });
  // entrance chamber end wall with the exit door
  b.add('stone', boxGeo(C.half * 2 + 2.4, C.h, 1.2), mat4(0, C.h / 2, C.z1 + 1.2), stone);
  colliders.addBox(0, C.z1 + 1.2, C.half + 1.2, 0.6);
  b.add('door', boxGeo(3.2, 4.6, 0.2, 1), mat4(0, 2.3, C.z1 + 0.55), new THREE.Color('#9a7a5a'), { ao: false });
  b.add('metal', boxGeo(3.6, 0.2, 0.3, 1), mat4(0, 4.7, C.z1 + 0.5), 0x2a2a2e, { ao: false });

  // ---- boss hall: wall ring with openings, pilasters, dome
  const openS = Math.asin((C.half + 0.3) / H.r); // corridor opening (south, +z)
  const openN = Math.asin((S.half + 0.3) / H.r); // stairs opening (north, -z)
  const N = 56;
  for (let i = 0; i < N; i++) {
    const a = ((i + 0.5) / N) * Math.PI * 2;
    const dS = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    const dN = Math.abs(Math.atan2(Math.sin(a - Math.PI), Math.cos(a - Math.PI)));
    if (dS < openS + 0.04 || dN < openN + 0.04) continue;
    const x = H.x + Math.sin(a) * (H.r + 0.7), z = H.z + Math.cos(a) * (H.r + 0.7);
    const seg = (Math.PI * 2 * (H.r + 0.7)) / N + 0.2;
    b.add('stone', boxGeo(seg, H.h, 1.4, 2, i * 0.3), mat4(x, H.h / 2, z, a), stone);
    colliders.addBox(x, z, seg / 2, 0.7, a);
  }
  // corridor mouth and stairs mouth framing
  for (const [zz, half, ang] of [[H.z + H.r + 0.5, C.half, 0], [H.z - H.r - 0.5, S.half, Math.PI]]) {
    for (const s of [-1, 1]) {
      b.add('stone', boxGeo(1.8, H.h, 2.2, 2), mat4(s * (half + 0.9), H.h / 2, zz), dark);
      colliders.addBox(s * (half + 0.9), zz, 0.9, 1.1);
    }
    b.add('stone', boxGeo(half * 2 + 3.6, H.h - 7.5, 2.2, 2), mat4(0, 7.5 + (H.h - 7.5) / 2, zz), stone);
    b.add('stone', archRingGeo(half, half + 0.9, 2.3, 16), mat4(0, 7.5 - half, zz, ang), dark, { ao: false });
  }
  const dome = invert(new THREE.SphereGeometry(H.r + 1.4, 48, 14, 0, Math.PI * 2, 0, Math.PI / 2));
  dome.scale(1, 0.55, 1);
  scaleUV(dome, 24, 8);
  nb.add('stone', dome, mat4(H.x, H.h - 0.5, H.z), dark.clone().multiplyScalar(0.6), { ao: false });
  // ribs on the dome
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    for (let j = 0; j < 8; j++) {
      const t0 = (j / 8) * (Math.PI / 2);
      const r = (H.r + 0.9) * Math.cos(t0);
      const y = H.h - 0.5 + (H.r + 1.4) * 0.55 * Math.sin(t0);
      nb.add('stone', boxGeo(0.8, 0.6, 3.4, 2), mat4(H.x + Math.sin(a) * r, y, H.z + Math.cos(a) * r, a, -t0 * 0.7), dark.clone().multiplyScalar(0.8), { ao: false });
    }
  }
  // great crystal chandelier
  const chand = new THREE.OctahedronGeometry(1, 0);
  nb.add('crystal', chand, mat4(H.x, H.h + 7, H.z, 0, 0, 0, 1.4, 3.2, 1.4), 0xffffff, { ao: false });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    nb.add('crystal', chand, mat4(H.x + Math.sin(a) * 3, H.h + 5.8, H.z + Math.cos(a) * 3, a, 0.3, 0, 0.5, 1.4, 0.5), 0xffffff, { ao: false });
  }
  glows.add(H.x, H.h + 6.5, H.z, 14, 0x4a8cff, 0.1, 400);
  // pillars with torches
  for (let k = 0; k < 8; k++) {
    const a = ((k + 0.5) / 8) * Math.PI * 2;
    const x = H.x + Math.sin(a) * 19, z = H.z + Math.cos(a) * 19;
    const col = new THREE.CylinderGeometry(1.0, 1.15, H.h, 16);
    scaleUV(col, 3, H.h / 2);
    b.add('stone', col, mat4(x, H.h / 2, z), stone);
    b.add('stone', boxGeo(2.6, 0.8, 2.6, 2), mat4(x, 0.4, z), dark);
    b.add('stone', boxGeo(2.6, 0.9, 2.6, 2), mat4(x, H.h - 0.45, z), dark, { ao: false });
    colliders.addCircle(x, z, 1.25);
    // torch facing the hall centre
    const tx = x - Math.sin(a) * 1.25, tz = z - Math.cos(a) * 1.25;
    b.add('metal', boxGeo(0.12, 0.7, 0.12, 1), mat4(tx, 3.4, tz, a, 0.35), 0x2a2420, { ao: false });
    b.add('lampGlass', new THREE.ConeGeometry(0.16, 0.34, 8), mat4(tx - Math.sin(a) * 0.12, 3.9, tz - Math.cos(a) * 0.12, 0, Math.PI), 0xffffff, { ao: false });
    glows.add(tx - Math.sin(a) * 0.14, 4.1, tz - Math.cos(a) * 0.14, 2.6, 0xff8a30, 0.85, 300);
    glows.add(tx - Math.sin(a) * 0.14, 4.0, tz - Math.cos(a) * 0.14, 0.9, 0xffd890, 0.6, 300);
  }
  // corridor torches
  for (let z = C.z0 + 6; z < C.z1; z += 12) {
    for (const s of [-1, 1]) {
      const x = s * (C.half - 0.1);
      b.add('metal', boxGeo(0.1, 0.6, 0.1, 1), mat4(x - s * 0.5, 3.2, z, 0, 0, s * 0.4), 0x2a2420, { ao: false });
      glows.add(x - s * 0.75, 3.7, z, 2.2, 0xff8a30, 0.85, 200);
      glows.add(x - s * 0.75, 3.6, z, 0.7, 0xffd890, 0.6, 200);
    }
  }
  // braziers around the throne
  for (const s of [-1, 1]) {
    const x = s * 7, z = H.z - 16;
    b.add('metal', new THREE.CylinderGeometry(0.7, 0.35, 0.6, 12), mat4(x, 1.3, z), 0x2a2622, { ao: false });
    b.add('metal', new THREE.CylinderGeometry(0.12, 0.2, 1.1, 8), mat4(x, 0.55, z), 0x2a2622);
    b.add('lampGlass', new THREE.ConeGeometry(0.5, 0.8, 8), mat4(x, 1.9, z), 0xffffff, { ao: false });
    glows.add(x, 2.2, z, 4.5, 0xff7a20, 0.9, 300);
    glows.add(x, 1.9, z, 1.6, 0xffd070, 0.7, 300);
    colliders.addCircle(x, z, 0.8);
  }
  // throne on a dais
  {
    const z = H.z - 20;
    for (let k = 0; k < 3; k++) b.add('stone', boxGeo(9 - k * 2, 0.4, 5 - k, 2), mat4(0, 0.2 + k * 0.4, z - k * 0.4), k === 2 ? stone : dark);
    b.add('stone', boxGeo(3.2, 1.2, 2, 2), mat4(0, 1.8, z - 1), stone);
    b.add('stone', boxGeo(3.2, 5, 0.6, 2), mat4(0, 3.7, z - 1.9), stone);
    b.add('metal', spireGeo(0.5, 1.6, 4), mat4(0, 6.2, z - 1.9), gold, { ao: false });
    for (const s of [-1, 1]) b.add('stone', boxGeo(0.5, 1.8, 2, 2), mat4(s * 1.6, 2.3, z - 1), dark);
    colliders.addBox(0, z - 0.6, 4.5, 2.5);
  }
  // banners
  for (const a of [-0.9, -0.45, 0.45, 0.9]) {
    const aa = Math.PI + a;
    const x = H.x + Math.sin(aa) * (H.r - 0.1), z = H.z + Math.cos(aa) * (H.r - 0.1);
    b.add('fabric', new THREE.PlaneGeometry(2.4, 6.5), mat4(x, 8, z, aa + Math.PI), new THREE.Color('#8a1a1a'), { ao: false });
    b.add('fabric', new THREE.PlaneGeometry(0.5, 6.5), mat4(x + Math.cos(aa) * 0.0, 8, z, aa + Math.PI), gold, { ao: false });
  }

  // ---- stairs of light
  const sl = S.z0 - S.z1;
  for (let k = 0; k < 16; k++) {
    const z = S.z0 - (k + 0.5) * (sl / 16);
    const y = ((k + 1) / 16) * S.rise;
    b.add('stone', boxGeo(S.half * 2, y, sl / 16 + 0.02, 2), mat4(0, y / 2, z), stone.clone().multiplyScalar(0.9 + (k % 2) * 0.06));
  }
  b.add('stone', boxGeo(S.half * 2 + 1, S.rise, 4, 2), mat4(0, S.rise / 2, S.z1 - 1.6), stone);
  for (const s of [-1, 1]) {
    b.add('stone', boxGeo(1, S.rise + 8, sl + 6, 2), mat4(s * (S.half + 0.5), (S.rise + 8) / 2, (S.z0 + S.z1) / 2 - 2), stone);
    colliders.addBox(s * (S.half + 0.5), (S.z0 + S.z1) / 2 - 2, 0.5, sl / 2 + 3);
  }
  nb.add('stone', boxGeo(S.half * 2 + 2, 1, sl + 6), mat4(0, S.rise + 8.5, (S.z0 + S.z1) / 2 - 2), dark.clone().multiplyScalar(0.6), { ao: false });
  b.add('stone', boxGeo(S.half * 2 + 2, S.rise + 8, 1), mat4(0, (S.rise + 8) / 2, S.z1 - 4), stone);
  colliders.addBox(0, S.z1 - 3.2, S.half + 1, 0.5);
  // the doorway at the top
  b.add('stone', archRingGeo(2.0, 2.8, 0.8, 16), mat4(0, S.rise + 3.2, S.z1 - 3.3), gold, { ao: false });
  for (const s of [-1, 1]) b.add('stone', boxGeo(0.8, 3.2, 0.8, 1), mat4(s * 2.4, S.rise + 1.6, S.z1 - 3.3), gold, { ao: false });
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x0a0c12, toneMapped: false });
  const doorLight = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 5.2), lightMat);
  doorLight.position.set(0, S.rise + 2.6, S.z1 - 3.45);
  root.add(doorLight);
  const doorGlow = glows.add(0, S.rise + 2.8, S.z1 - 2.8, 0.01, 0xbfe6ff, 0.05, 200);

  // portcullis blocking the stairs until the lord falls
  const bars = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2c30, metalness: 0.85, roughness: 0.45 });
  const barGeo = new THREE.BoxGeometry(0.12, 7.2, 0.12);
  for (let k = 0; k < 9; k++) {
    const bar = new THREE.Mesh(barGeo, iron);
    bar.position.set(-S.half + 0.35 + k * ((S.half * 2 - 0.7) / 8), 3.6, 0);
    bars.add(bar);
  }
  const crossGeo = new THREE.BoxGeometry(S.half * 2, 0.12, 0.14);
  for (let k = 0; k < 4; k++) {
    const cr = new THREE.Mesh(crossGeo, iron);
    cr.position.set(0, 1.2 + k * 1.8, 0);
    bars.add(cr);
  }
  bars.position.set(0, 0, S.z0 + 0.3);
  root.add(bars);
  const gateCol = colliders.addBox(0, S.z0 + 0.3, S.half, 0.25);

  root.add(b.build(m, { name: 'labyrinth' }));
  root.add(nb.build(m, { name: 'labyrinthCeil', castShadow: false }));

  let open = 0, opening = false;
  return {
    root,
    colliders,
    setOpen(instant) {
      opening = true;
      gateCol.off = true;
      if (instant) open = 1;
    },
    get isOpen() {
      return opening;
    },
    update(dt, t) {
      if (opening && open < 1) open = Math.min(1, open + dt / 3.5);
      bars.position.y = open * 7.4;
      const k = open;
      lightMat.color.setRGB(0.04 + k * 1.6, 0.05 + k * 1.9, 0.07 + k * 2.4);
      glows.set(doorGlow, 0, S.rise + 2.8, S.z1 - 2.8, 0.01 + k * (9 + Math.sin(t * 2) * 0.6));
    },
  };
}

export function makeLabyrinth(world, game, glows) {
  const L = buildLabyrinth(world, glows);
  const H = LAB.hall, C = LAB.corridor, S = LAB.stairs;
  const dormant = game.progress.lordDefeated;
  const bg = new THREE.Color(0x05060a);
  const spawns = [
    { type: 'kobold', x: -2, z: 40, yaw: 0 },
    { type: 'kobold', x: 2, z: 38, yaw: 0 },
    { type: 'kobold', x: -1.5, z: 24, yaw: 0 },
    { type: 'kobold', x: 1.8, z: 21, yaw: 0 },
    { type: 'koboldLord', x: 0, z: H.z - 12, yaw: 0, dormant, noRespawn: true },
  ];
  for (let k = 0; k < 4; k++) spawns.push({ type: 'kobold', x: -6 + k * 4, z: H.z - 6, dormant: true, noRespawn: true });
  if (dormant) L.setOpen(true);
  return {
    id: 'lab',
    name: '제1층 미궁 탑',
    town: '미궁 탑 입구',
    root: L.root,
    lab: L,
    height: heightLab,
    colliders: L.colliders,
    maxR: 80,
    isSafe: (x, z) => z > C.z1 - 7,
    zoneAt(p) {
      if (p.z > C.z1 - 7) return '미궁 탑 — 안전지대';
      if (p.z > C.z0) return '미궁 탑 — 수호자의 회랑';
      if (p.z < S.z0) return '빛의 계단';
      return '보스 방 — 코볼트 로드의 옥좌';
    },
    spawn: { pos: LAB.entry.clone(), yaw: 0 },
    env: {
      sky: { background: bg, environment: world.sky.environment },
      envIntensity: 0.3,
      fog: { color: new THREE.Color(0.05, 0.055, 0.07), density: 0.012 },
      sun: { dir: new THREE.Vector3(0.28, 1, 0.18).normalize(), color: new THREE.Color(0.7, 0.8, 1.0), intensity: 1.5, center: new THREE.Vector3(0, 0, 0), extent: 70 },
      hemi: { sky: 0x8a90b0, ground: 0x6a4a30, intensity: 1.15 },
      indoor: true,
    },
    themes: { town: 'dungeon', field: 'dungeon' },
    loops: [],
    gates: [],
    portals: [
      { id: 'labExit', pos: new THREE.Vector3(0, 0, C.z1 - 0.5), r: 2.8, prompt: '미궁 탑 나가기', action: () => game.leaveLabyrinth() },
      { id: 'stairs', pos: new THREE.Vector3(0, S.rise, S.z1 - 1.5), r: 2.4, auto: true, enabled: () => L.isOpen, action: () => game.climbToFloor2() },
    ],
    fishing: [],
    chestSpots: [{ x: -18, z: H.z - 14 }, { x: 18, z: H.z - 14 }],
    npcCfg: { seed: 5, walkers: 0, specials: [] },
    monsterCfg: () => ({ seed: 9, spawns, colliders: L.colliders }),
    mapInfo: {
      R: 70,
      center: { x: 0, z: -5 },
      rects: [
        { x0: -C.half, z0: C.z0, x1: C.half, z1: C.z1 + 1, fill: '#9a948a' },
        { x0: -S.half, z0: S.z1 - 3, x1: S.half, z1: S.z0, fill: '#c8d8f0' },
      ],
      areas: [{ x: H.x, z: H.z, r: H.r, fill: '#9a948a', stroke: '#5a564e' }],
      pois: [
        { x: 0, z: C.z1 - 3, label: '입구', icon: 'gate' },
        { x: 0, z: H.z - 12, label: '보스', icon: 'boss' },
        { x: 0, z: S.z1 - 2, label: '제2층 계단', icon: 'tower' },
      ],
    },
    update(dt, t) {
      L.update(dt, t);
    },
  };
}
