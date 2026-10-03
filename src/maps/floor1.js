// Floor 1 gameplay layer on top of the static world from world/world.js:
// who stands where, what spawns where, zones, the fishing pier, treasure
// chests and the way into the labyrinth tower.
import * as THREE from 'three';
import { pierSpec, pierHeight, pierPoint, buildPier } from './pier.js';
import { heightF1, TOWN, LAKE, OUTPOST, BOSS_ARENA, TOWER, OVERLOOK, ROADS, WORLD_R, SUN_DIR } from '../world/layout.js';
import { VEG_F1 } from '../world/vegetation.js';
import { RNG } from '../core/noise.js';
import { Ambience } from '../world/ambience.js';

// a point beside a road: segment `seg` of road `ri`, fraction t, offset sideways
export function besideRoad(roads, ri, seg, t, side = 1, off = 4.8) {
  const a = roads[ri][seg], b = roads[ri][seg + 1];
  const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return { x: x + ((b[1] - a[1]) / L) * off * side, z: z - ((b[0] - a[0]) / L) * off * side };
}

// wooden fishing pier on the town side of the mirror lake
const PIER = pierSpec(LAKE, new THREE.Vector2(-LAKE.x, -LAKE.z).normalize());

// walking height: terrain, or the pier deck where it's higher
export function walkF1(x, z) {
  const h = heightF1(x, z);
  const d = pierHeight(PIER, x, z);
  return d === null ? h : Math.max(h, d);
}

export function floor1Zone(p, inTown) {
  const d = (a) => Math.hypot(p.x - a.x, p.z - a.z);
  if (inTown) return '시작의 마을';
  if (d(BOSS_ARENA) < 50) return '폐허 광장';
  if (d(TOWER) < TOWER.r + 70) return '미궁 탑 입구';
  if (d(OVERLOOK) < 60) return '세계의 끝 전망대';
  if (d({ x: LAKE.x, z: LAKE.z }) < LAKE.r + 30) return '거울 호수';
  if (d(OUTPOST) < 40) return '초원 전초기지';
  if (d({ x: 175, z: 250 }) < 80) return '동남쪽 숲';
  if (p.z > 120 && Math.abs(p.x) < 140) return '남부 초원';
  return '부유성 제1층 필드';
}

// Mora's potion stand, Brock's anvil, the dealer's card table
function floor1Props(tex) {
  return (group, colliders, npcs) => {
    const wood = new THREE.MeshStandardMaterial({ map: tex.wood.map, color: 0xb08860, roughness: 0.85 });
    const mora = npcs.byId.mora;
    const stand = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.95, 0.7), wood);
    counter.position.set(0, 0.475, 0);
    stand.add(counter);
    const awn = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 1.3), new THREE.MeshStandardMaterial({ map: tex.fabric.map, color: 0x7a4a9a, roughness: 0.9 }));
    awn.position.set(0, 2.35, -0.1);
    awn.rotation.x = 0.25;
    stand.add(awn);
    for (const sx of [-0.85, 0.85]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.35, 0.08), wood);
      post.position.set(sx, 1.17, 0.3);
      stand.add(post);
    }
    [0xe74c3c, 0x3aa6ff, 0x2ecc71, 0xe74c3c, 0xe74c3c, 0xf1c40f].forEach((c, i) => {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.15, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0.9 }));
      bottle.position.set(-0.6 + i * 0.24, 1.05, 0.05);
      stand.add(bottle);
    });
    stand.position.set(mora.x + Math.sin(mora.yaw) * 1.0, 0, mora.z + Math.cos(mora.yaw) * 1.0);
    stand.rotation.y = mora.yaw;
    group.add(stand);
    colliders.addBox(stand.position.x, stand.position.z, 0.95, 0.4, mora.yaw);

    const smith = npcs.byId.smith;
    const anvil = new THREE.Group();
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2e33, metalness: 0.8, roughness: 0.4 });
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), iron);
    top.position.y = 0.72;
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), iron);
    horn.rotation.z = Math.PI / 2;
    horn.position.set(0.5, 0.74, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.6, 0.3), iron);
    base.position.y = 0.33;
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 0.1, 12), wood);
    stump.position.y = 0.05;
    anvil.add(top, horn, base, stump);
    anvil.position.set(smith.x + Math.sin(smith.yaw) * 1.1, 0, smith.z + Math.cos(smith.yaw) * 1.1);
    anvil.rotation.y = smith.yaw + Math.PI / 2;
    group.add(anvil);
    colliders.addCircle(anvil.position.x, anvil.position.z, 0.45);

    const dealer = npcs.byId.dealer;
    const table = new THREE.Group();
    const felt = new THREE.MeshStandardMaterial({ color: 0x1f5a3a, roughness: 0.9 });
    const tt = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 20), felt);
    tt.position.y = 0.82;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.04, 6, 24), wood);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.85;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.8, 8), wood);
    leg.position.y = 0.4;
    table.add(tt, rim, leg);
    for (let k = 0; k < 5; k++) {
      const card = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.004, 0.14), new THREE.MeshStandardMaterial({ color: k % 2 ? 0xf4f0e8 : 0xb03030, roughness: 0.6 }));
      card.position.set(-0.3 + k * 0.15, 0.857, 0.1 + (k % 2) * 0.05);
      card.rotation.y = (k - 2) * 0.2;
      table.add(card);
    }
    table.position.set(dealer.x + Math.sin(dealer.yaw) * 1.05, 0, dealer.z + Math.cos(dealer.yaw) * 1.05);
    group.add(table);
    colliders.addCircle(table.position.x, table.position.z, 0.8);

    // training dummies next to the sword master
    const tr = npcs.byId.trainer;
    for (const s of [-1, 1]) {
      const dm = new THREE.Group();
      const straw = new THREE.MeshStandardMaterial({ color: 0xc9a860, roughness: 0.95 });
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.8, 8), wood);
      pole.position.y = 0.9;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 10), straw);
      body.position.y = 1.2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), straw);
      head.position.y = 1.78;
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), wood);
      arm.rotation.z = Math.PI / 2;
      arm.position.y = 1.4;
      dm.add(pole, body, head, arm);
      const x = tr.x + Math.cos(tr.yaw) * 2.2 * s, z = tr.z - Math.sin(tr.yaw) * 2.2 * s;
      dm.position.set(x, 0, z);
      dm.rotation.y = tr.yaw;
      group.add(dm);
      colliders.addCircle(x, z, 0.35);
    }
  };
}

export function makeFloor1(world, game) {
  const { m, tex } = world;
  world.root.add(buildPier(m, world.colliders, PIER, heightF1));
  const chestSpots = [
    besideRoad(ROADS, 0, 2, 0.5, 1),
    besideRoad(ROADS, 0, 5, 0.6, -1),
    besideRoad(ROADS, 0, 7, 0.5, 1),
    besideRoad(ROADS, 1, 2, 0.5, 1),
    besideRoad(ROADS, 2, 2, 0.5, -1),
    besideRoad(ROADS, 2, 3, 0.7, 1),
    besideRoad(ROADS, 3, 1, 0.5, 1),
    besideRoad(ROADS, 3, 3, 0.6, -1),
  ];
  const { fx, fz } = PIER;
  const fisher = pierPoint(PIER, 3.5, 2.4);
  const ambience = new Ambience({
    quality: game.quality,
    chimneys: world.town.chimneys,
    height: walkF1,
    birdAreas: [
      { x: 0, z: 0, r: 70, y: 42 },
      { x: 20, z: 210, r: 90, y: 34 },
      { x: -230, z: 80, r: 60, y: 38 },
      { x: 150, z: -160, r: 80, y: 46 },
    ],
    butterflyOk: (x, z) => Math.hypot(x, z) > TOWN.safeR + 6,
    wind: new THREE.Vector3(SUN_DIR.x * -1, 0, SUN_DIR.z * -1),
  });
  world.root.add(ambience.root);
  return {
    id: 'f1',
    name: '부유성 제1층',
    town: '시작의 마을',
    root: world.root,
    glows: world.glows,
    height: walkF1,
    colliders: world.colliders,
    maxR: WORLD_R - 2.8,
    isSafe: (x, z) => Math.hypot(x, z) < TOWN.safeR,
    zoneAt: floor1Zone,
    spawn: { pos: new THREE.Vector3(0, 0, -15), yaw: Math.PI },
    env: {
      sky: world.sky,
      envIntensity: 0.6,
      fog: { color: world.sky.fogColor, density: 0.0023 },
      sun: { dir: SUN_DIR, color: world.sky.sunColor, intensity: 3.3, center: new THREE.Vector3(0, 0, 0), extent: 135 },
      hemi: { sky: 0x9fc2ff, ground: 0x5a4a38, intensity: 0.35 },
    },
    themes: { town: 'town', field: 'field' },
    loops: [
      { kind: 'water', pos: TOWN.fountain.clone().setY(1.5) },
      { kind: 'portal', pos: new THREE.Vector3(0, 3, 0) },
      { kind: 'portal', pos: world.gates.outpost.pos.clone().setY(world.gates.outpost.pos.y + 3) },
    ],
    gates: [
      { id: 'f1town', label: '시작의 마을', floor: '제1층', pos: world.gates.main.pos, r: 1.6, arrive: { pos: new THREE.Vector3(0, 0, 5), yaw: Math.PI } },
      {
        id: 'f1outpost', label: '초원 전초기지', floor: '제1층', pos: world.gates.outpost.pos, r: 1.3,
        arrive: { pos: new THREE.Vector3(world.gates.outpost.pos.x - 4.5, 0, world.gates.outpost.pos.z), yaw: Math.PI / 2 },
      },
    ],
    portals: [
      { id: 'tower', pos: world.castle.towerGate.clone(), r: 7, prompt: '미궁 탑 입장', action: () => game.enterLabyrinth() },
    ],
    fishing: [{ pos: new THREE.Vector3(PIER.x1 - fx * 0.4, PIER.deck, PIER.z1 - fz * 0.4), r: 2.6, table: 'lake1', water: { x: LAKE.x, z: LAKE.z, r: LAKE.r * 0.95, y: LAKE.level } }],
    chestSpots,
    npcCfg: {
      seed: 4242,
      walkers: 42,
      plazaR: 26,
      plazaWalkers: 8,
      streets: world.town.streets.filter((r) => r > 40 && r < 100),
      specials: [
        { id: 'ellen', name: '기사 엘렌', x: -5.5, z: -12, yaw: Math.PI * 0.8, color: '#2f4f8f', marker: '!' },
        { id: 'mora', name: '상인 모라', x: 12.5, z: -9, yaw: -Math.PI * 0.62, color: '#6b3f7a', marker: 'coin' },
        { id: 'smith', name: '대장장이 브로크', x: -12.5, z: 9, yaw: Math.PI * 0.35, color: '#7a4a2a', marker: 'anvil' },
        { id: 'guard', name: '남문 경비병', x: 7, z: 104, yaw: Math.PI, color: '#4a5a6a' },
        { id: 'bard', name: '음유시인 리라', x: 13.5, z: 8.5, yaw: -2.1, color: '#2a7a6a', marker: 'music' },
        { id: 'trainer', name: '검술 교관 가론', x: 69, z: -1, yaw: -Math.PI / 2, color: '#8a2a2a', marker: 'game' },
        { id: 'kid', name: '꼬마 핀', x: -6.5, z: 50, yaw: 0.6, color: '#d8a030', marker: 'game', scale: 0.62, dynamic: true },
        { id: 'dealer', name: '도박사 에이스', x: -57, z: 6.5, yaw: -2.4, color: '#1a1a22', marker: 'game' },
        { id: 'broker', name: '정보상 로나', x: -4.5, z: 99, yaw: Math.PI - 0.3, color: '#6a5a3a', marker: 'info' },
        { id: 'fisher', name: '낚시꾼 토마', x: fisher.x, z: fisher.z, y: heightF1(fisher.x, fisher.z), yaw: PIER.yaw, color: '#3a6a8a', marker: 'fish' },
      ],
      props: floor1Props(tex),
    },
    monsterCfg: () => {
      const rng = new RNG(77);
      const spawns = [];
      const boarZones = [[40, 175, 45], [-45, 205, 40], [70, 225, 35], [160, 40, 35]];
      for (let i = 0; i < 14; i++) {
        const zc = boarZones[i % boarZones.length];
        const a = rng.range(0, Math.PI * 2), r = rng.range(0, zc[2]);
        spawns.push({ type: 'boar', x: zc[0] + Math.sin(a) * r, z: zc[1] + Math.cos(a) * r });
      }
      const wolfZones = [[175, 250, 40], [-225, 130, 35], [110, 300, 30]];
      for (let i = 0; i < 11; i++) {
        const zc = wolfZones[i % wolfZones.length];
        const a = rng.range(0, Math.PI * 2), r = rng.range(0, zc[2]);
        spawns.push({ type: 'wolf', x: zc[0] + Math.sin(a) * r, z: zc[1] + Math.cos(a) * r });
      }
      spawns.push({ type: 'boss', x: BOSS_ARENA.x, z: BOSS_ARENA.z });
      return {
        seed: 77,
        spawns,
        keepOut(pos, rad) {
          const r = Math.hypot(pos.x, pos.z);
          const minR = TOWN.safeR + 4 + rad;
          if (r < minR) { pos.x *= minR / r; pos.z *= minR / r; }
        },
      };
    },
    mapInfo: {
      R: WORLD_R,
      roads: ROADS,
      areas: [
        ...VEG_F1.forests.map((f) => ({ x: f.x, z: f.z, r: f.r * 0.8, fill: 'rgba(60,110,50,0.35)' })),
        { x: LAKE.x, z: LAKE.z, r: LAKE.r, fill: '#5aa0c8' },
        { x: 0, z: 0, r: TOWN.wallR, fill: 'rgba(200,180,150,0.9)', stroke: '#8a7a64' },
        { x: TOWER.x, z: TOWER.z, r: TOWER.r, fill: '#8a8e9a', stroke: '#5a5e6a' },
      ],
      pois: [
        { x: 0, z: 0, label: '시작의 마을', icon: 'gate' },
        { x: OUTPOST.x, z: OUTPOST.z, label: '전초기지', icon: 'gate' },
        { x: BOSS_ARENA.x, z: BOSS_ARENA.z, label: '폐허 광장', icon: 'boss' },
        { x: TOWER.x, z: TOWER.z + TOWER.r + 12, label: '미궁 탑', icon: 'tower' },
        { x: OVERLOOK.x, z: OVERLOOK.z, label: '전망대', icon: 'dot' },
        { x: LAKE.x, z: LAKE.z - LAKE.r - 10, label: '거울 호수', icon: 'fish' },
      ],
    },
    update(dt, t, center) {
      world.update(dt, t, center);
      ambience.update(dt, t, center);
    },
  };
}
