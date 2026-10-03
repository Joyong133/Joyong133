// Leather-and-steel gauntlets for VR. Built in WebXR grip space: the held
// object's axis is -Z, the thumb sits on top (+Y) and the back of the hand
// faces outward (+X for the right hand). Fingers are jointed and curl around
// the grip axis; the free hand follows the trigger / grip buttons.
import * as THREE from 'three';

const leather = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.72 });
const steel = new THREE.MeshStandardMaterial({ color: 0xa6adb8, metalness: 0.9, roughness: 0.28 });
const trim = new THREE.MeshStandardMaterial({ color: 0xb8923e, metalness: 0.9, roughness: 0.32 });

function capsule(r, len) {
  const g = new THREE.CapsuleGeometry(r, len, 3, 8);
  g.translate(0, -len / 2 - r * 0.6, 0); // pivot at the top joint, extends along -Y
  return g;
}

export function makeGlove(side) {
  const s = side === 'left' ? -1 : 1;
  const root = new THREE.Group();
  // back-of-hand armour plate (outer side) + palm pad (inner side)
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), steel);
  back.scale.set(0.45, 0.7, 1.05);
  back.rotation.z = -s * Math.PI / 2;
  back.position.set(s * 0.03, 0.0, 0.004);
  root.add(back);
  for (let k = 0; k < 3; k++) {
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.04, 0.012), trim);
    ridge.position.set(s * 0.051, 0.0, -0.026 + k * 0.026);
    root.add(ridge);
  }
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.062, 0.088), leather);
  palm.position.set(s * 0.012, -0.004, 0.003);
  root.add(palm);
  // wrist cuff toward the forearm (+Z, slightly down)
  // short leather wrist with a trim band (kept compact: it's what you see most)
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.033, 0.04, 14), leather);
  cuff.rotation.x = Math.PI / 2 - 0.25;
  cuff.position.set(s * 0.012, -0.008, 0.066);
  cuff.scale.set(1.15, 1, 0.85);
  root.add(cuff);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.031, 0.004, 5, 18), trim);
  band.rotation.x = -0.25;
  band.position.set(s * 0.012, -0.008, 0.05);
  band.scale.set(1.15, 0.85, 1);
  root.add(band);

  // four fingers: knuckles in a row along Z on the outer side, curling under
  // the grip axis and around toward the palm side
  const fingers = [];
  const zs = [-0.032, -0.011, 0.01, 0.03];
  const lens = [[0.034, 0.028], [0.038, 0.031], [0.035, 0.028], [0.028, 0.022]];
  zs.forEach((z, i) => {
    const base = new THREE.Group();
    base.position.set(s * 0.034, -0.026, z);
    const p1 = new THREE.Mesh(capsule(0.0112, lens[i][0]), leather);
    base.add(p1);
    const mid = new THREE.Group();
    mid.position.y = -lens[i][0] - 0.012;
    const p2 = new THREE.Mesh(capsule(0.0102, lens[i][1]), leather);
    mid.add(p2);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0105, 8, 6), steel);
    cap.scale.set(1, 0.6, 1);
    base.add(cap);
    base.add(mid);
    root.add(base);
    fingers.push({ base, mid });
  });
  // thumb on top, reaching across toward the palm side
  const thumb = new THREE.Group();
  thumb.position.set(s * 0.018, 0.026, -0.026);
  const t1 = new THREE.Mesh(capsule(0.0122, 0.03), leather);
  thumb.add(t1);
  const tMid = new THREE.Group();
  tMid.position.y = -0.043;
  tMid.add(new THREE.Mesh(capsule(0.011, 0.024), leather));
  thumb.add(tMid);
  root.add(thumb);

  root.userData.curl = (index, rest, thumbCurl = 0.8) => {
    fingers.forEach((f, i) => {
      const c = i === 0 ? index : rest;
      // rotate around Z (grip axis); sign mirrors per hand
      f.base.rotation.set(0, 0, -s * (0.35 + c * 1.25));
      f.mid.rotation.set(0, 0, -s * (0.25 + c * 1.35));
    });
    thumb.rotation.set(-0.35, 0, -s * (1.2 + thumbCurl * 0.7));
    tMid.rotation.set(0, 0, -s * (0.2 + thumbCurl * 0.6));
  };
  root.userData.curl(0.2, 0.2, 0.3);
  root.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return root;
}
