// Shared material library. Static world geometry is merged per material key,
// so the key list here roughly equals the town's draw-call count.
import * as THREE from 'three';
import * as T from './textures.js';

export function stainedGlassTexture(size = 512, round = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#111';
  g.fillRect(0, 0, size, size);
  const cols = ['#c0392b', '#2e6fd8', '#e0b030', '#2f9e6a', '#8e44ad', '#d35400', '#3aa6c9'];
  const cx = size / 2, cy = size / 2, R = size / 2;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  if (round) {
    const rings = [0.18, 0.42, 0.7, 0.98];
    for (let ri = 0; ri < rings.length; ri++) {
      const r0 = ri ? rings[ri - 1] * R : 0, r1 = rings[ri] * R;
      const n = ri === 0 ? 1 : 8 * ri;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        g.beginPath();
        g.arc(cx, cy, r1, a0, a1);
        g.arc(cx, cy, r0, a1, a0, true);
        g.closePath();
        g.fillStyle = cols[Math.floor(rnd() * cols.length)];
        g.fill();
        g.lineWidth = size * 0.012;
        g.strokeStyle = '#1a1510';
        g.stroke();
      }
    }
  } else {
    const w = size, h = size;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) {
      g.fillStyle = cols[Math.floor(rnd() * cols.length)];
      g.fillRect((x / 3) * w, (y / 8) * h, w / 3, h / 8);
    }
    g.strokeStyle = '#1a1510';
    g.lineWidth = size * 0.02;
    for (let y = 0; y <= 8; y++) { g.beginPath(); g.moveTo(0, (y / 8) * h); g.lineTo(w, (y / 8) * h); g.stroke(); }
    for (let x = 0; x <= 3; x++) { g.beginPath(); g.moveTo((x / 3) * w, 0); g.lineTo((x / 3) * w, h); g.stroke(); }
  }
  // soft light variation
  const grd = g.createRadialGradient(cx, cy * 0.8, 0, cx, cy, R);
  grd.addColorStop(0, 'rgba(255,240,200,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createMaterials(progress = () => {}) {
  const tick = async (msg) => {
    progress(msg);
    await new Promise((r) => setTimeout(r, 0));
  };
  const tex = {};
  await tick('돌길 텍스처 생성 중…');
  tex.cobble = T.cobbleTexture(1024);
  await tick('석재 텍스처 생성 중…');
  tex.stone = T.stoneBrickTexture(512, 21);
  await tick('회벽 텍스처 생성 중…');
  tex.plaster = T.plasterTexture(512);
  await tick('기와 텍스처 생성 중…');
  tex.roof = T.roofTexture(512);
  await tick('목재 텍스처 생성 중…');
  tex.wood = T.woodTexture(512);
  await tick('초원 텍스처 생성 중…');
  tex.grass = T.grassTexture(512);
  tex.dirt = T.dirtTexture(512);
  await tick('암석 텍스처 생성 중…');
  tex.rock = T.rockTexture(512);
  tex.window = T.windowTexture();
  tex.door = T.doorTexture();
  tex.fabric = T.fabricTexture(256);
  tex.glow = T.glowTexture(128, 2.0);
  tex.rune = T.runeTexture(512);
  tex.rose = stainedGlassTexture(512, true);
  tex.lancet = stainedGlassTexture(256, false);

  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });

  const m = {
    stone: std({ map: tex.stone.map, normalMap: tex.stone.normal, roughness: 0.88, normalScale: new THREE.Vector2(1.2, 1.2) }),
    plaster: std({ map: tex.plaster.map, normalMap: tex.plaster.normal, roughness: 0.95 }),
    roof: std({ map: tex.roof.map, normalMap: tex.roof.normal, roughness: 0.75, normalScale: new THREE.Vector2(1.4, 1.4) }),
    wood: std({ map: tex.wood.map, normalMap: tex.wood.normal, roughness: 0.85 }),
    door: std({ map: tex.door.map, normalMap: tex.door.normal, roughness: 0.8 }),
    window: std({
      map: tex.window.map,
      normalMap: tex.window.normal,
      emissiveMap: tex.window.emissive,
      emissive: new THREE.Color(1.0, 0.82, 0.6),
      emissiveIntensity: 1.6,
      roughness: 0.25,
      metalness: 0.1,
    }),
    rock: std({ map: tex.rock.map, normalMap: tex.rock.normal, roughness: 0.92, normalScale: new THREE.Vector2(1.3, 1.3) }),
    fabric: std({ map: tex.fabric.map, normalMap: tex.fabric.normal, roughness: 0.9, side: THREE.DoubleSide }),
    plain: std({ roughness: 0.8 }),
    metal: std({ roughness: 0.45, metalness: 0.75 }),
    foliage: std({ roughness: 0.9 }),
    cobble: std({ map: tex.cobble.map, normalMap: tex.cobble.normal, roughness: 0.8 }),
    lampGlass: new THREE.MeshStandardMaterial({ color: 0x331a08, emissive: new THREE.Color(1.0, 0.72, 0.38), emissiveIntensity: 2.2, roughness: 0.3 }),
    rose: new THREE.MeshStandardMaterial({ map: tex.rose, emissiveMap: tex.rose, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.3 }),
    lancet: new THREE.MeshStandardMaterial({ map: tex.lancet, emissiveMap: tex.lancet, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.3 }),
    crystal: new THREE.MeshStandardMaterial({ color: 0x3a7bd5, emissive: 0x4aa8ff, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.2, flatShading: true }),
  };
  m.lampGlass.userData.noShadow = true;
  m.rose.userData.noShadow = true;
  m.lancet.userData.noShadow = true;
  m.crystal.userData.noShadow = true;
  m.fabric.shadowSide = THREE.DoubleSide;
  return { tex, m };
}
