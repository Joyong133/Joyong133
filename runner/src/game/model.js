// Procedural chibi runners built from primitives, with a procedural
// animation rig (run cycle, jumps, double-jump flip, tumble, victory dance),
// facial expressions, squash-and-stretch and cel-shading outlines.
import * as THREE from 'three';
import { toon, toonColor, paint, merge, vcolMaterial, addOutline } from '../world/geom.js';

let basicV = null;
const basicVcol = () => (basicV ||= new THREE.MeshBasicMaterial({ vertexColors: true }));

const G = {};
function geos() {
  if (G.ready) return G;
  G.ready = true;
  G.head = new THREE.SphereGeometry(0.33, 28, 20);
  G.robotHead = new THREE.BoxGeometry(0.62, 0.54, 0.56, 2, 2, 2);
  G.torso = new THREE.CapsuleGeometry(0.2, 0.14, 8, 16);
  G.pants = new THREE.CylinderGeometry(0.205, 0.215, 0.2, 16);
  G.skirt = new THREE.CylinderGeometry(0.19, 0.31, 0.26, 18);
  G.limb = new THREE.CapsuleGeometry(0.075, 0.18, 4, 10);
  G.leg = new THREE.CapsuleGeometry(0.095, 0.2, 4, 10);
  G.hand = new THREE.SphereGeometry(0.085, 12, 10);
  G.shoe = new THREE.SphereGeometry(0.13, 14, 10);
  G.sole = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 14);
  G.eye = new THREE.SphereGeometry(0.055, 14, 12);
  G.dot = new THREE.SphereGeometry(0.02, 8, 6);
  G.blush = new THREE.SphereGeometry(0.05, 10, 8);
  G.arc = new THREE.TorusGeometry(0.042, 0.011, 6, 14, Math.PI);
  G.ring = new THREE.TorusGeometry(0.022, 0.009, 6, 12);
  G.brow = new THREE.CapsuleGeometry(0.012, 0.055, 3, 6);
  G.hairCap = new THREE.SphereGeometry(0.35, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52);
  G.hairBob = new THREE.SphereGeometry(0.36, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.66);
  G.ball = new THREE.SphereGeometry(1, 14, 10);
  G.capTop = new THREE.SphereGeometry(0.36, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  G.brim = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18, 1, false, -Math.PI / 2, Math.PI);
  G.ear = new THREE.CapsuleGeometry(0.06, 0.3, 4, 10);
  G.cone = new THREE.ConeGeometry(1, 1, 18);
  G.cone4 = new THREE.ConeGeometry(1, 1, 4);
  G.cyl = new THREE.CylinderGeometry(1, 1, 1, 14);
  G.torus = new THREE.TorusGeometry(0.1, 0.03, 6, 16);
  G.box = new THREE.BoxGeometry(1, 1, 1);
  G.star = (() => {
    const s = new THREE.Shape();
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + Math.PI / 2;
      const r = k % 2 ? 0.045 : 0.1;
      if (k === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  })();
  return G;
}

const mat = (c) => toonColor(c);
// Unlit colour; k > 1 makes it HDR-bright so the bloom pass picks it up.
const glowMats = new Map();
function glow(c, k = 2.2) {
  const key = `${c}|${k}`;
  if (!glowMats.has(key)) glowMats.set(key, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) }));
  return glowMats.get(key);
}

function mesh(geo, material, pos, scl, rot) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(pos[0], pos[1], pos[2]);
  if (scl) m.scale.set(scl[0], scl[1], scl[2]);
  if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
  m.castShadow = true;
  return m;
}

function shade(hex, l) {
  return new THREE.Color(hex).offsetHSL(0, 0, l).getHex();
}

const SKIRTS = new Set(['bori', 'luna', 'ari']);
const INK = 0x2a2030;

export class CharacterModel {
  constructor(ch, { outline = true } = {}) {
    geos();
    this.ch = ch;
    const c = ch.colors;
    const root = (this.root = new THREE.Group());
    // squash & stretch pivots at the feet
    const squash = (this.squashG = new THREE.Group());
    root.add(squash);
    const pose = (this.pose = new THREE.Group());
    pose.position.y = 0.8;
    squash.add(pose);
    const hips = (this.hips = new THREE.Group());
    hips.position.y = 0.55 - 0.8;
    pose.add(hips);

    // legs
    this.legs = [];
    for (const side of [-1, 1]) {
      const leg = new THREE.Group();
      leg.position.set(0.11 * side, 0, 0);
      leg.add(mesh(G.leg, mat(ch.robot ? c.bottom : c.skin), [0, -0.2, 0]));
      leg.add(mesh(G.leg, mat(c.bottom), [0, -0.1, 0], [1.08, 0.55, 1.08]));
      leg.add(mesh(G.shoe, mat(c.shoes), [0, -0.43, 0.05], [1, 0.72, 1.35]));
      leg.add(mesh(G.sole, mat(0xfaf6f0), [0, -0.5, 0.05], [1, 1, 1.4]));
      if (ch.extra === 'suspenders') leg.add(mesh(G.ball, mat(shade(c.skin, -0.12)), [0, -0.26, 0.02], [0.1, 0.07, 0.1]));
      hips.add(leg);
      this.legs.push(leg);
    }

    const torso = (this.torso = new THREE.Group());
    hips.add(torso);
    torso.add(mesh(G.torso, mat(c.top), [0, 0.24, 0], [1, 1, 0.9]));
    torso.add(mesh(G.torus, mat(shade(c.top, -0.1)), [0, 0.08, 0], [2.0, 2.0, 1.8], [Math.PI / 2, 0, 0]));
    if (SKIRTS.has(ch.id)) {
      torso.add(mesh(G.skirt, mat(c.bottom), [0, 0.02, 0]));
      torso.add(mesh(G.torus, mat(shade(c.bottom, -0.12)), [0, -0.1, 0], [3.0, 3.0, 2.6], [Math.PI / 2, 0, 0]));
    } else torso.add(mesh(G.pants, mat(c.bottom), [0, 0.04, 0]));
    if (ch.robot) {
      torso.add(mesh(G.cyl, glow(c.accent), [0, 0.28, 0.18], [0.07, 0.02, 0.07], [Math.PI / 2, 0, 0]));
      torso.add(mesh(G.box, mat(0x4a5568), [0, 0.2, 0.17], [0.22, 0.12, 0.04]));
      for (const sx of [-1, 1]) torso.add(mesh(G.cyl, mat(0x8a97ab), [0.24 * sx, 0.42, 0], [0.06, 0.08, 0.06], [0, 0, Math.PI / 2]));
      const key = (this.windKey = new THREE.Group());
      key.position.set(0, 0.3, -0.2);
      key.add(mesh(G.cyl, mat(0xd8b44a), [0, 0, -0.08], [0.025, 0.16, 0.025], [Math.PI / 2, 0, 0]));
      key.add(mesh(G.torus, mat(0xd8b44a), [0.1, 0, -0.16], [1, 1, 1], [0, Math.PI / 2, 0]));
      key.add(mesh(G.torus, mat(0xd8b44a), [-0.1, 0, -0.16], [1, 1, 1], [0, Math.PI / 2, 0]));
      torso.add(key);
    } else {
      const collar = ch.extra === 'bell' ? 0xe8303c : c.accent;
      torso.add(mesh(G.torus, mat(collar), [0, 0.43, 0], [1.6, 1.6, 1.4], [Math.PI / 2, 0, 0]));
    }
    this.buildExtras(torso, ch);

    // arms
    this.arms = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(0.25 * side, 0.4, 0);
      arm.add(mesh(G.limb, mat(c.top), [0, -0.14, 0]));
      arm.add(mesh(G.torus, mat(shade(c.top, -0.1)), [0, -0.24, 0], [0.85, 0.85, 0.85], [Math.PI / 2, 0, 0]));
      arm.add(mesh(G.hand, mat(ch.robot ? c.hair : c.skin), [0, -0.31, 0]));
      if (ch.extra === 'cape' && side === -1) {
        // star wand in the right hand
        arm.add(mesh(G.cyl, mat(0x8a5a32), [0, -0.33, 0.1], [0.016, 0.34, 0.016], [Math.PI / 2, 0, 0]));
        arm.add(mesh(G.star, glow(0xffe14a), [0, -0.33, 0.29], [1.1, 1.1, 1.1], [0, 0, 0]));
      }
      torso.add(arm);
      this.arms.push(arm);
    }

    // head
    const head = (this.head = new THREE.Group());
    head.position.y = 0.44;
    torso.add(head);
    this.buildHead(head, ch);

    // tail
    if (ch.tail) {
      const tail = (this.tail = new THREE.Group());
      tail.position.set(0, 0.06, -0.2);
      hips.add(tail);
      if (ch.tail === 'fox') {
        tail.add(mesh(G.ball, mat(c.hair), [0, 0.12, -0.2], [0.17, 0.17, 0.36], [-0.7, 0, 0]));
        tail.add(mesh(G.ball, mat(0xffffff), [0, 0.32, -0.45], [0.12, 0.12, 0.14], [-0.7, 0, 0]));
      } else if (ch.tail === 'cat') {
        for (let i = 0; i < 7; i++) {
          const t = i / 6;
          tail.add(mesh(G.ball, mat(c.hair), [0, t * 0.4, -0.08 - Math.sin(t * 2.2) * 0.22], [0.045, 0.045, 0.045]));
        }
      } else {
        tail.add(mesh(G.ball, mat(c.accent), [0, 0, -0.04], [0.09, 0.09, 0.09]));
      }
    }

    // FX attachments
    this.stars = new THREE.Group();
    this.stars.position.y = 1.85;
    for (let i = 0; i < 3; i++) {
      const s = mesh(G.star, glow(0xffe14a));
      s.castShadow = false;
      this.stars.add(s);
    }
    this.stars.visible = false;
    root.add(this.stars);

    if (ch.scale) root.scale.setScalar(ch.scale);
    this.compact(outline);
    this.phase = Math.random() * 6;
    this.t = 0;
    this.flip = 0;
    this.blink = 2 + Math.random() * 3;
    this.sq = 0;
    this.sqV = 0;
    this.face = '';
  }

  buildExtras(torso, ch) {
    const c = ch.colors;
    switch (ch.extra) {
      case 'backpack':
        torso.add(mesh(G.ball, mat(0xe8a33a), [0, 0.26, -0.22], [0.17, 0.2, 0.1]));
        torso.add(mesh(G.ball, mat(0xc77d1f), [0, 0.38, -0.25], [0.15, 0.07, 0.09]));
        torso.add(mesh(G.ball, mat(0xffe08a), [0, 0.22, -0.31], [0.06, 0.05, 0.02]));
        for (const sx of [-1, 1]) torso.add(mesh(G.box, mat(0x8a5a2a), [0.11 * sx, 0.28, 0.18], [0.04, 0.3, 0.02], [0.15, 0, 0]));
        break;
      case 'belly':
        torso.add(mesh(G.ball, mat(0xf2d0a0), [0, 0.2, 0.15], [0.15, 0.16, 0.07]));
        break;
      case 'bell':
        torso.add(mesh(G.ball, mat(0xf5c542), [0, 0.37, 0.2], [0.05, 0.05, 0.05]));
        torso.add(mesh(G.box, mat(0x6a4a10), [0, 0.355, 0.245], [0.05, 0.008, 0.01]));
        break;
      case 'suspenders':
        for (const sx of [-1, 1]) {
          torso.add(mesh(G.box, mat(c.accent), [0.09 * sx, 0.24, 0.18], [0.04, 0.36, 0.02], [0.18, 0, 0]));
          torso.add(mesh(G.box, mat(c.accent), [0.09 * sx, 0.24, -0.18], [0.04, 0.36, 0.02], [-0.18, 0, 0]));
          torso.add(mesh(G.ball, mat(0xf5c542), [0.09 * sx, 0.09, 0.2], [0.025, 0.025, 0.02]));
        }
        break;
      case 'cape': {
        const cape = (this.cape = new THREE.Group());
        cape.position.set(0, 0.43, -0.13);
        cape.add(mesh(G.box, mat(0x2e2366), [0, -0.3, 0], [0.5, 0.6, 0.025]));
        cape.add(mesh(G.box, mat(0xffd84a), [0, -0.6, 0], [0.5, 0.04, 0.03]));
        cape.add(mesh(G.ball, mat(0xffd84a), [0, 0, 0.05], [0.05, 0.05, 0.03]));
        torso.add(cape);
        break;
      }
      default:
        break;
    }
  }

  buildHead(head, ch) {
    const c = ch.colors;
    if (ch.robot) {
      head.add(mesh(G.robotHead, mat(c.skin), [0, 0.27, 0]));
      head.add(mesh(G.box, mat(0x223044), [0, 0.28, 0.26], [0.5, 0.26, 0.06]));
      head.add(mesh(G.cyl, mat(c.hair), [0, 0.62, 0], [0.02, 0.16, 0.02]));
      head.add(mesh(G.ball, glow(0xff5a5a), [0, 0.72, 0], [0.05, 0.05, 0.05]));
      for (const s of [-1, 1]) head.add(mesh(G.cyl, mat(c.hair), [0.32 * s, 0.27, 0], [0.08, 0.04, 0.08], [0, 0, Math.PI / 2]));
      // screen face: open / happy / dizzy
      this.eyes = this.faceGroup(head, [0, 0.29, 0.3], (g) => {
        for (const sx of [-1, 1]) g.add(mesh(G.box, glow(c.accent), [0.11 * sx, 0, 0], [0.09, 0.09, 0.02]));
      });
      this.eyesHappy = this.faceGroup(head, [0, 0.27, 0.3], (g) => {
        for (const sx of [-1, 1]) g.add(mesh(G.arc, glow(c.accent), [0.11 * sx, 0, 0], [1, 1, 0.4]));
      });
      this.eyesHurt = this.faceGroup(head, [0, 0.29, 0.3], (g) => {
        for (const sx of [-1, 1]) for (const r of [-1, 1]) g.add(mesh(G.brow, glow(0xff5a5a), [0.11 * sx, 0, 0], [1, 1, 0.5], [0, 0, (Math.PI / 4) * r]));
      });
      return;
    }
    head.add(mesh(G.head, mat(c.skin), [0, 0.27, 0]));
    // ears (human)
    for (const s of [-1, 1]) {
      if (!['bunny', 'bear', 'cat', 'fox'].includes(ch.hat)) head.add(mesh(G.ball, mat(c.skin), [0.32 * s, 0.25, 0], [0.06, 0.08, 0.05]));
      const b = mesh(G.blush, mat(0xff9aa8), [0.2 * s, 0.17, 0.255], [1, 0.5, 0.35]);
      b.castShadow = false;
      head.add(b);
    }
    if (ch.nose) head.add(mesh(G.cone, mat(c.skin), [0, 0.22, 0.43], [0.045, 0.24, 0.045], [Math.PI / 2, 0, 0]));
    else head.add(mesh(G.ball, mat(shade(c.skin, -0.06)), [0, 0.2, 0.322], [0.018, 0.012, 0.01]));

    // eyes: dark rim, coloured iris with a lighter bottom, pupil and two highlights
    const iris = ch.eye ?? 0x6b4226;
    const irisLight = shade(iris, 0.2);
    this.eyes = this.faceGroup(head, [0, 0.255, 0.292], (g) => {
      for (const s of [-1, 1]) {
        const x = 0.12 * s;
        g.add(mesh(G.eye, mat(INK), [x, 0, 0], [1.05, 1.42, 0.45]));
        g.add(mesh(G.eye, mat(iris), [x, -0.012, 0.012], [0.8, 1.0, 0.4]));
        g.add(mesh(G.eye, mat(irisLight), [x, -0.036, 0.019], [0.58, 0.42, 0.3]));
        g.add(mesh(G.eye, mat(INK), [x, -0.004, 0.022], [0.36, 0.52, 0.28]));
        g.add(mesh(G.dot, glow(0xffffff, 1), [x - 0.013, 0.022, 0.03], [1.05, 1.15, 0.5]));
        g.add(mesh(G.dot, glow(0xffffff, 1), [x + 0.016, -0.028, 0.03], [0.55, 0.55, 0.4]));
        if (ch.lashes) g.add(mesh(G.cone4, mat(INK), [x + s * 0.058, 0.05, 0.002], [0.02, 0.05, 0.01], [0, 0, -s * 0.9]));
      }
    });
    this.eyesHappy = this.faceGroup(head, [0, 0.245, 0.3], (g) => {
      for (const s of [-1, 1]) g.add(mesh(G.arc, mat(INK), [0.12 * s, 0, 0], [1.1, 1.1, 0.5]));
    });
    this.eyesHurt = this.faceGroup(head, [0, 0.255, 0.3], (g) => {
      for (const s of [-1, 1]) for (const r of [-1, 1]) g.add(mesh(G.brow, mat(INK), [0.12 * s, 0, 0], [1, 1, 0.5], [0, 0, (Math.PI / 4) * r]));
    });
    this.brows = this.faceGroup(head, [0, 0.375, 0.29], (g) => {
      for (const s of [-1, 1]) g.add(mesh(G.brow, mat(shade(c.hair, -0.05)), [0.12 * s, 0, 0], [1, 1, 0.6], [0, 0, Math.PI / 2 + s * 0.15]));
    });
    // mouths
    this.mouthSmile = this.faceGroup(head, [0, 0.15, 0.318], (g) => {
      g.add(mesh(G.arc, mat(0x8a2a3a), [0, 0, 0], [1, 1, 0.5], [0, 0, Math.PI]));
    });
    this.mouthOpen = this.faceGroup(head, [0, 0.14, 0.31], (g) => {
      g.add(mesh(G.eye, mat(0x6a1a2a), [0, 0, 0], [0.75, 0.62, 0.3]));
      g.add(mesh(G.eye, mat(0xff8a9a), [0, -0.016, 0.006], [0.5, 0.28, 0.25]));
    });
    this.mouthGrin = this.faceGroup(head, [0, 0.145, 0.31], (g) => {
      g.add(mesh(G.eye, mat(0x6a1a2a), [0, -0.005, 0], [1.25, 0.7, 0.3]));
      g.add(mesh(G.eye, mat(0xff8a9a), [0, -0.024, 0.006], [0.8, 0.3, 0.25]));
      g.add(mesh(G.box, mat(0xffffff), [0, 0.022, 0.012], [0.1, 0.014, 0.01]));
    });
    this.mouthOuch = this.faceGroup(head, [0, 0.14, 0.318], (g) => {
      g.add(mesh(G.ring, mat(0x8a2a3a), [0, 0, 0], [1, 1.2, 0.5]));
    });

    // hair
    const hm = mat(c.hair);
    if (ch.hair === 'bob') {
      head.add(mesh(G.hairBob, hm, [0, 0.29, -0.015], [1, 1, 1], [-0.25, 0, 0]));
    } else if (ch.hair !== 'none') {
      head.add(mesh(G.hairCap, hm, [0, 0.29, -0.02], [1, 1, 1], [-0.32, 0, 0]));
    }
    if (ch.hair !== 'none' && ch.hat !== 'bear') {
      // two rows of fringe tufts and side locks
      for (let i = -3; i <= 3; i++) {
        head.add(mesh(G.ball, hm, [i * 0.055, 0.475 - Math.abs(i) * 0.018, 0.245 - Math.abs(i) * 0.03], [0.065, 0.06, 0.05], [0.45, 0, i * 0.18]));
      }
      for (let i = -2; i <= 2; i++) head.add(mesh(G.ball, hm, [i * 0.08, 0.53, 0.18 - Math.abs(i) * 0.03], [0.08, 0.06, 0.07], [0.3, 0, i * 0.2]));
      for (const s of [-1, 1]) head.add(mesh(G.ball, hm, [0.29 * s, 0.24, 0.12], [0.05, 0.12, 0.06], [0.1, 0, s * 0.15]));
    }
    if (ch.hair === 'twin') {
      for (const s of [-1, 1]) {
        head.add(mesh(G.ball, hm, [0.33 * s, 0.24, -0.08], [0.1, 0.1, 0.1]));
        head.add(mesh(G.ball, hm, [0.38 * s, 0.08, -0.1], [0.11, 0.18, 0.11], [0, 0, 0.25 * s]));
        head.add(mesh(G.ball, mat(0xff5a8a), [0.33 * s, 0.28, -0.08], [0.06, 0.06, 0.06]));
      }
    } else if (ch.hair === 'long') {
      head.add(mesh(G.ball, hm, [0, 0.1, -0.17], [0.31, 0.38, 0.17]));
      for (const s of [-1, 1]) head.add(mesh(G.ball, hm, [0.27 * s, 0.05, -0.05], [0.08, 0.2, 0.09]));
    }

    // hats
    const ac = mat(c.accent);
    switch (ch.hat) {
      case 'cap':
        head.add(mesh(G.capTop, ac, [0, 0.33, -0.01], [1, 0.9, 1], [-0.12, 0, 0]));
        head.add(mesh(G.brim, ac, [0, 0.41, 0.24], [1.05, 1, 1.3], [-0.12, 0, 0]));
        head.add(mesh(G.ball, mat(0xffffff), [0, 0.67, 0.02], [0.04, 0.03, 0.04]));
        head.add(mesh(G.star, mat(0xffe14a), [0, 0.53, 0.31], [0.75, 0.75, 0.6], [-0.5, 0, 0]));
        break;
      case 'bunny':
        head.add(mesh(G.torus, mat(0xff6f9a), [0, 0.42, 0], [2.6, 2.6, 2], [Math.PI / 2 + 0.25, 0, 0]));
        for (const s of [-1, 1]) {
          const ear = new THREE.Group();
          ear.position.set(0.12 * s, 0.56, -0.04);
          ear.rotation.z = -0.18 * s;
          ear.add(mesh(G.ear, mat(0xffffff), [0, 0.2, 0], [1.25, 1, 0.55]));
          ear.add(mesh(G.ear, mat(0xffb3c9), [0, 0.2, 0.025], [0.7, 0.85, 0.3]));
          head.add(ear);
          (this.ears ||= []).push(ear);
        }
        // ribbon bow on the headband
        for (const s of [-1, 1]) head.add(mesh(G.ball, mat(0xff5a8a), [0.2 + s * 0.07, 0.57, 0.12], [0.075, 0.05, 0.035], [0, 0, s * 0.4]));
        head.add(mesh(G.ball, mat(0xe84a7a), [0.2, 0.57, 0.14], [0.03, 0.03, 0.03]));
        break;
      case 'bear':
        head.add(mesh(G.hairBob, ac, [0, 0.31, -0.03], [1.06, 1.04, 1.06], [-0.62, 0, 0]));
        head.add(mesh(G.torus, mat(shade(c.accent, 0.1)), [0, 0.43, 0.19], [2.4, 2.4, 1.6], [0.55, 0, 0]));
        for (const s of [-1, 1]) {
          head.add(mesh(G.ball, ac, [0.25 * s, 0.6, -0.02], [0.11, 0.11, 0.07]));
          head.add(mesh(G.ball, mat(0xf2c9a0), [0.25 * s, 0.6, 0.03], [0.06, 0.06, 0.03]));
        }
        break;
      case 'witch':
        head.add(mesh(G.cyl, mat(c.top), [0, 0.52, 0], [0.44, 0.025, 0.44]));
        head.add(mesh(G.cone, mat(c.top), [0, 0.8, -0.04], [0.25, 0.56, 0.25], [-0.22, 0, 0]));
        head.add(mesh(G.torus, mat(c.accent), [0, 0.56, -0.01], [2.3, 2.3, 1.2], [Math.PI / 2 - 0.1, 0, 0]));
        head.add(mesh(G.star, glow(c.accent), [0, 0.74, 0.17], [1.2, 1.2, 1.2], [-0.2, 0, 0]));
        break;
      case 'cat':
        for (const s of [-1, 1]) {
          head.add(mesh(G.cone4, mat(c.hair), [0.2 * s, 0.6, 0], [0.11, 0.2, 0.08], [0, Math.PI / 4, -0.3 * s]));
          head.add(mesh(G.cone4, mat(0xffb3c9), [0.2 * s, 0.58, 0.035], [0.06, 0.13, 0.03], [0, Math.PI / 4, -0.3 * s]));
        }
        break;
      case 'fox':
        for (const s of [-1, 1]) {
          head.add(mesh(G.cone4, mat(c.hair), [0.21 * s, 0.62, -0.02], [0.13, 0.26, 0.08], [0, Math.PI / 4, -0.28 * s]));
          head.add(mesh(G.cone4, mat(0xffffff), [0.21 * s, 0.6, 0.02], [0.07, 0.16, 0.03], [0, Math.PI / 4, -0.28 * s]));
        }
        break;
      case 'puppet':
        head.add(mesh(G.cone, ac, [0, 0.66, -0.05], [0.26, 0.4, 0.26], [-0.35, 0, 0]));
        head.add(mesh(G.ball, mat(0xe8483c), [0.12, 0.72, -0.12], [0.03, 0.14, 0.03], [-0.5, 0, -0.4]));
        break;
      default:
        break;
    }
    if (ch.extra === 'ribbon') {
      for (const s of [-1, 1]) head.add(mesh(G.ball, mat(0xd94a3a), [s * 0.08, 0.42, -0.31], [0.085, 0.055, 0.035], [0, 0, s * 0.35]));
      head.add(mesh(G.ball, mat(0xb83a2a), [0, 0.42, -0.33], [0.035, 0.035, 0.03]));
    }
  }

  faceGroup(head, pos, fill) {
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    fill(g);
    g.traverse((o) => (o.castShadow = false));
    head.add(g);
    (this.faceGroups ||= []).push(g);
    return g;
  }

  // Merge the static meshes under each animated joint into one vertex-coloured
  // mesh (plus one unlit mesh for glowing bits): ~10 draw calls per runner.
  compact(outline) {
    const joints = [this.hips, this.torso, this.head, this.cape, ...(this.faceGroups || []), ...this.legs, ...this.arms, this.tail, this.windKey, ...(this.ears || [])];
    const face = new Set(this.faceGroups || []);
    for (const g of joints) {
      if (!g) continue;
      const lit = [];
      const unlit = [];
      for (const c of [...g.children]) {
        if (!c.isMesh) continue;
        c.updateMatrix();
        const geo = c.geometry.clone().applyMatrix4(c.matrix);
        (c.material.isMeshBasicMaterial ? unlit : lit).push(paint(geo, c.material.color));
        g.remove(c);
      }
      if (lit.length) {
        const m = new THREE.Mesh(merge(lit), vcolMaterial());
        m.castShadow = !face.has(g);
        g.add(m);
        if (outline && !face.has(g)) addOutline(m, 0.016);
      }
      if (unlit.length) g.add(new THREE.Mesh(merge(unlit), basicVcol()));
    }
  }

  // Squash (negative) or stretch (positive) impulse, e.g. on landing / jumping.
  kick(v) {
    this.sqV += v;
  }

  setFace(eyes, mouth) {
    const key = `${eyes}|${mouth}`;
    if (key === this.face) return;
    this.face = key;
    this.eyes.visible = eyes === 'open';
    this.eyesHappy.visible = eyes === 'happy';
    this.eyesHurt.visible = eyes === 'hurt';
    if (this.brows) this.brows.visible = eyes !== 'hurt';
    if (this.mouthSmile) {
      this.mouthSmile.visible = mouth === 'smile';
      this.mouthOpen.visible = mouth === 'open';
      this.mouthGrin.visible = mouth === 'grin';
      this.mouthOuch.visible = mouth === 'ouch';
    }
  }

  // st: { speed, grounded, vy, stun, boost, frozen, flipT, mode }
  update(dt, st) {
    this.t += dt;
    const [legL, legR] = this.legs;
    const [armL, armR] = this.arms;
    const mode = st.mode || 'run';

    // squash & stretch spring
    this.sqV += (-260 * this.sq - 16 * this.sqV) * dt;
    this.sq += this.sqV * dt;
    this.sq = Math.max(-0.35, Math.min(0.35, this.sq));
    const sy = 1 + this.sq;
    const sxz = 1 - this.sq * 0.5;
    this.squashG.scale.set(sxz, sy, sxz);

    // blink
    this.blink -= dt;
    let eyeScale = 1;
    if (this.blink < 0) {
      eyeScale = 0.12;
      if (this.blink < -0.12) this.blink = 2 + Math.random() * 3.5;
    }
    this.eyes.scale.y = eyeScale;
    if (this.windKey) this.windKey.rotation.z += dt * (2 + (st.speed || 0) * 0.6);

    this.stars.visible = !!st.stun;
    if (st.stun) {
      this.stars.rotation.y += dt * 6;
      this.stars.children.forEach((s, i) => {
        const a = (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.32, Math.sin(this.t * 8 + i) * 0.04, Math.sin(a) * 0.32);
        s.rotation.y = -this.stars.rotation.y;
      });
    }

    let legA = 0;
    let legB = 0;
    let armA = 0;
    let armB = 0;
    let armSpread = 0.12;
    let lean = 0;
    let bob = 0;
    let poseX = 0;
    let poseZ = 0;
    let headTilt = 0;
    let twist = 0;
    let face = ['open', 'smile'];

    if (mode === 'idle' || mode === 'lobby') {
      const b = Math.sin(this.t * 2.4);
      bob = b * 0.012;
      armA = 0.08 * Math.sin(this.t * 1.7);
      armB = -armA;
      armSpread = 0.15 + b * 0.02;
      headTilt = Math.sin(this.t * 0.9) * 0.08;
      if (mode === 'lobby') {
        // little hop every few seconds
        const k = (this.t % 3.2) / 3.2;
        if (k > 0.85) {
          const u = (k - 0.85) / 0.15;
          bob += Math.sin(u * Math.PI) * 0.18;
          armA = armB = -2.4 * Math.sin(u * Math.PI);
          face = ['happy', 'grin'];
        }
      }
    } else if (mode === 'win') {
      const u = (this.t * 1.6) % 1;
      bob = Math.abs(Math.sin(u * Math.PI)) * 0.35;
      armA = -2.8;
      armB = -2.2 + Math.sin(this.t * 10) * 0.4;
      armSpread = 0.4;
      legA = -0.3 * Math.sin(u * Math.PI);
      legB = 0.2;
      headTilt = Math.sin(this.t * 5) * 0.15;
      face = ['happy', 'grin'];
    } else if (mode === 'clap') {
      // applause from the back row: arms forward, hands meeting in front
      this.clapOff ??= Math.random() * 10;
      const t = this.t + this.clapOff;
      const c = 0.5 + 0.5 * Math.sin(t * 11);
      armA = armB = -1.25 + Math.sin(t * 2.1) * 0.12;
      armSpread = -0.22 + c * 0.5;
      bob = Math.abs(Math.sin(t * 2.6)) * 0.05;
      headTilt = Math.sin(t * 1.3) * 0.12;
      face = ['happy', c > 0.6 ? 'grin' : 'smile'];
    } else if (st.frozen) {
      armA = armB = -0.4;
      armSpread = 0.5;
      face = ['open', 'ouch'];
    } else if (st.stun) {
      this.flip = 0;
      poseX = Math.sin(this.t * 12) * 0.25 - 0.9 * Math.min(1, st.stun);
      poseZ = Math.sin(this.t * 9) * 0.3;
      armA = -2.6;
      armB = -2.3;
      armSpread = 0.8;
      legA = -0.6;
      legB = 0.4;
      face = ['hurt', 'ouch'];
    } else if (!st.grounded) {
      const up = st.vy > 0;
      legA = up ? -0.9 : -0.4;
      legB = up ? 0.5 : 0.25;
      armA = up ? -2.6 : -1.6;
      armB = up ? -2.2 : -1.2;
      armSpread = up ? 0.35 : 0.7;
      lean = 0.1;
      face = ['open', 'open'];
    } else {
      const sp = st.speed || 0;
      const a = Math.min(1, sp / 7);
      this.phase += dt * (4 + sp * 1.05);
      const s = Math.sin(this.phase);
      legA = s * 1.0 * a;
      legB = -s * 1.0 * a;
      armA = -s * 1.1 * a;
      armB = s * 1.1 * a;
      bob = Math.abs(Math.cos(this.phase)) * 0.07 * a;
      lean = 0.16 * a + (st.boost ? 0.3 : 0);
      twist = s * 0.16 * a;
      if (st.boost) {
        armA = armB = 1.2; // arms swept back
        armSpread = 0.3;
        twist = 0;
        face = ['open', 'open'];
      }
      if (a < 0.05) {
        armA = 0.05 * Math.sin(this.t * 1.7);
        armB = -armA;
        bob = Math.sin(this.t * 2.4) * 0.01;
      }
    }
    this.setFace(face[0], face[1]);

    // double-jump forward flip
    if (st.flipT !== undefined && st.flipT < 1 && !st.stun) {
      this.flip = st.flipT * Math.PI * 2;
    } else {
      this.flip = 0;
    }

    legL.rotation.x = legA;
    legR.rotation.x = legB;
    armL.rotation.x = armA;
    armR.rotation.x = armB;
    armL.rotation.z = -armSpread;
    armR.rotation.z = armSpread;
    this.hips.position.y = 0.55 - 0.8 + bob;
    this.hips.rotation.y = -twist * 0.4;
    this.torso.rotation.x = lean;
    this.torso.rotation.y = twist;
    this.head.rotation.z = headTilt;
    this.head.rotation.y = -twist * 0.7;
    this.pose.rotation.x = poseX + this.flip;
    this.pose.rotation.z = poseZ;
    const spd = Math.min(1, (st.speed || 0) / 8);
    if (this.tail) this.tail.rotation.y = Math.sin(this.t * 7) * (0.2 + spd * 0.25);
    if (this.ears) this.ears.forEach((e, i) => (e.rotation.x = -0.15 - spd * 0.5 + Math.sin(this.t * 6 + i) * 0.05));
    if (this.cape) {
      const lift = st.grounded === false ? 0.5 : spd * 0.9 + (st.boost ? 0.3 : 0);
      this.cape.rotation.x = -(0.12 + lift) - Math.sin(this.t * 11) * 0.06 * (0.3 + spd);
    }
  }
}

// Shared overlay meshes (shield bubble, ice block) attached per runner.
let bubbleGeo;
let bubbleMat;
let iceGeo;
let iceMat;
export function shieldMesh() {
  bubbleGeo ||= new THREE.SphereGeometry(1.05, 24, 16);
  bubbleMat ||= new THREE.MeshBasicMaterial({ color: 0x8fe3ff, transparent: true, opacity: 0.28, depthWrite: false });
  const m = new THREE.Mesh(bubbleGeo, bubbleMat);
  m.position.y = 0.85;
  m.visible = false;
  return m;
}
export function iceMesh() {
  iceGeo ||= new THREE.BoxGeometry(1.2, 1.9, 1.2);
  iceMat ||= toon({ color: 0xbfeeff, transparent: true, opacity: 0.6, depthWrite: false });
  const m = new THREE.Mesh(iceGeo, iceMat);
  m.position.y = 0.95;
  m.visible = false;
  return m;
}
