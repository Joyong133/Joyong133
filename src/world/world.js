// Builds every static part of the floor: sky, lights, terrain, town, castle
// structure, vegetation and water. Returns handles the game loop animates.
import * as THREE from 'three';
import { createMaterials } from '../core/materials.js';
import { setMaxAnisotropy } from '../core/textures.js';
import { installAtmosphericFog } from '../core/fog.js';
import { bakeSky } from './sky.js';
import { buildTerrain, buildEdgeCliff, buildHeightTexture } from './terrain.js';
import { SUN_DIR } from './layout.js';
import { Colliders } from './collision.js';
import { buildTown } from './town.js';
import { buildCastle } from './castle.js';
import { buildVegetation } from './vegetation.js';
import { buildWater } from './water.js';
import { GlowField } from './glow.js';
import { buildGates } from './gate.js';

export async function buildWorld(renderer, scene, quality, progress) {
  const step = async (p, text) => {
    progress(p, text);
    await new Promise((r) => setTimeout(r, 0));
  };
  setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

  const root = new THREE.Group();
  root.name = 'world';
  scene.add(root);

  await step(0.02, '하늘을 굽는 중…');
  const sky = bakeSky(renderer, SUN_DIR, quality === 'low' ? 512 : 1024);
  installAtmosphericFog(SUN_DIR, sky.sunTint);
  scene.background = sky.background;
  scene.environment = sky.environment;
  scene.environmentIntensity = 0.6;
  scene.fog = new THREE.FogExp2(sky.fogColor, 0.0023);

  const { tex, m } = await createMaterials((t) => progress(0.1, t));
  await step(0.3, '대지를 형성하는 중…');

  // Sun with a static (bake-once) shadow map covering the town
  const sun = new THREE.DirectionalLight(sky.sunColor, 3.3);
  sun.position.copy(SUN_DIR).multiplyScalar(220);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = quality !== 'low';
  const sm = quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera;
  sc.left = -135; sc.right = 135; sc.top = 135; sc.bottom = -135;
  sc.near = 20; sc.far = 480;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  root.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x9fc2ff, 0x5a4a38, 0.35);
  root.add(hemi);

  const colliders = new Colliders();

  const terrain = buildTerrain(tex);
  root.add(terrain);
  root.add(buildEdgeCliff(m));
  await step(0.38, '풀밭 높이맵 계산 중…');
  const heightTex = buildHeightTexture(512, 512);

  await step(0.45, '시작의 마을을 짓는 중…');
  const glows = new GlowField(tex.glow, 900);
  const town = buildTown(m, tex, colliders, glows);
  root.add(town.group);

  await step(0.62, '부유성 구조물 생성 중…');
  const castle = buildCastle(m, tex, colliders, glows);
  root.add(castle.group);

  await step(0.72, '숲과 초원을 가꾸는 중…');
  const veg = buildVegetation(m, tex, colliders, heightTex, quality);
  veg.addTownTrees(town.treeSpots);
  veg.finalize();
  root.add(veg.group);
  root.add(veg.grass);

  await step(0.84, '물과 전이문을 여는 중…');
  const water = buildWater(sky);
  root.add(water.group);
  const gates = buildGates(m, tex, colliders, glows);
  root.add(gates.group);

  root.add(glows.mesh);

  await step(0.9, '그림자를 굽는 중…');
  renderer.shadowMap.needsUpdate = true;

  return {
    root, sky, sun, hemi, terrain, colliders, heightTex, town, castle, veg, water, gates, glows, tex, m,
    update(dt, t, center) {
      water.update(t);
      gates.update(dt, t);
      veg.update(t, center);
      glows.update(t);
    },
  };
}
