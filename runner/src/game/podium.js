// Award ceremony shown when a race ends: the top three stand on a podium
// doing victory poses, everyone else claps behind, with fireworks.
import * as THREE from 'three';
import { toon, part, merge, vcolMaterial } from '../world/geom.js';
import { texture } from '../world/textures.js';
import { Fx } from './fx.js';

function numberTexture(n, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(0, 0, 256, 24);
  g.fillStyle = '#ffffff';
  g.font = '170px "Jua", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 16;
  g.strokeStyle = 'rgba(40,24,70,0.45)';
  g.strokeText(String(n), 128, 142);
  g.fillText(String(n), 128, 142);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SLOTS = [
  { x: 0, h: 1.5, col: 0xffc93c, css: '#f0a800' },
  { x: -1.85, h: 1.05, col: 0xc8d4e8, css: '#8a9ab8' },
  { x: 1.85, h: 0.7, col: 0xe0a070, css: '#b8703a' },
];

export class Podium {
  constructor(race) {
    this.race = race;
    const theme = race.theme;
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(theme.sky[1]);
    s.fog = new THREE.Fog(theme.sky[1], 18, 60);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color(theme.sky[0]) }, bot: { value: new THREE.Color(theme.sky[2]) } },
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform vec3 top; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(bot, top, smoothstep(-0.1, 0.7, h)), 1.0); }',
      })
    );
    s.add(sky);
    s.add(new THREE.HemisphereLight(theme.hemi[0], theme.hemi[1], Math.min(theme.hemi[2] ?? 1, 1.1)));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.7);
    sun.position.set(4, 9, 7);
    sun.castShadow = race.app.quality !== 'low';
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -8;
    sc.right = sc.top = 8;
    s.add(sun);

    // stage: round floor in the track's own material, podium blocks
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.4, 0.6, 48), [toon({ color: theme.curb?.[0] ?? 0xff6a3d }), toon({ map: texture(theme.floor) }), toon({ color: 0x3a2a5c })]);
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    s.add(floor);
    SLOTS.forEach((slot, i) => {
      const top = toon({ color: 0xf6ead2 });
      const side = toon({ color: slot.col });
      const front = new THREE.MeshBasicMaterial({ map: numberTexture(i + 1, slot.css) });
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.7, slot.h, 1.5), [side, side, top, side, front, side]);
      block.position.set(slot.x, slot.h / 2, 0);
      block.castShadow = block.receiveShadow = true;
      s.add(block);
    });
    // back-row riser for everyone else
    const riser = new THREE.Mesh(new THREE.BoxGeometry(11, 0.4, 1.6), [toon({ color: 0x8a6ad0 }), toon({ color: 0x8a6ad0 }), toon({ color: 0xb79cf0 }), toon({ color: 0x8a6ad0 }), toon({ color: 0x9a7ae0 }), toon({ color: 0x8a6ad0 })]);
    riser.position.set(0, 0.2, -2.7);
    riser.receiveShadow = true;
    s.add(riser);
    // balloons and pennants around the stage
    const parts = [];
    const cols = [0xff5a5a, 0xffd23f, 0x5ad1ff, 0x7be07b, 0xff8fd8];
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * (0.15 + (i / 9) * 0.7);
      const x = Math.cos(a) * 6.5;
      const z = -Math.sin(a) * 6.5 + 1;
      parts.push(part(new THREE.SphereGeometry(0.45, 14, 10), cols[i % cols.length], [x, 3.4 + (i % 3) * 0.5, z], [0, 0, 0], [1, 1.2, 1]));
      parts.push(part(new THREE.CylinderGeometry(0.01, 0.01, 3.2, 4), 0xffffff, [x, 1.7 + (i % 3) * 0.5, z]));
    }
    this.balloons = new THREE.Mesh(merge(parts), vcolMaterial());
    s.add(this.balloons);

    // place runners: finishers by time, then the rest by distance
    const order = race.order.slice();
    this.places = [];
    const back = [];
    order.forEach((r, i) => {
      const root = r.root;
      root.parent?.remove(root);
      s.add(root);
      root.rotation.set(0, 0, 0);
      if (r.tag) r.tag.visible = false;
      r.shield.visible = r.ice.visible = false;
      r.model.pose.visible = true;
      if (i < 3) {
        root.position.set(SLOTS[i].x, SLOTS[i].h, 0);
        this.places.push({ r, mode: 'win' });
      } else {
        back.push(r);
        this.places.push({ r, mode: 'clap' });
      }
      root.scale.setScalar(r.ch.scale || 1);
    });
    back.forEach((r, k) => r.root.position.set((k - (back.length - 1) / 2) * 1.25, 0.4, -2.7));

    this.fx = new Fx(600);
    s.add(this.fx.points);
    this.cam = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.t = 0;
    this.nextFw = 0.3;
    this.resize(window.innerWidth, window.innerHeight, race.app.renderer.getPixelRatio());
    this.update(0);
  }

  // The results card covers the right side (landscape) or the bottom
  // (portrait); shift the projection so the stage sits in the free area and
  // pull the camera back until the whole stage fits there.
  resize(w, h, dpr = 1) {
    const cam = this.cam;
    cam.aspect = w / h;
    const wide = w / h > 1.15;
    let fw = w;
    let fh = h;
    if (wide) {
      const card = Math.min(480, w * 0.42) + 40;
      cam.setViewOffset(w, h, card / 2, 0, w, h);
      fw = w - card;
    } else {
      const sheet = Math.min(h * 0.5, 400);
      cam.setViewOffset(w, h, 0, sheet / 2, w, h);
      fh = h - sheet;
    }
    cam.fov = wide ? 40 : 58;
    cam.updateProjectionMatrix();
    // metres visible across the free area at distance d: 2·d·tan·(fw/h)
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    this.dist = Math.max(4.4 / (tan * (fw / h)), 2.6 / (tan * (fh / h)), 8);
    this.fx.setViewport(h * dpr);
  }

  update(dt) {
    this.t += dt;
    for (const p of this.places) p.r.model.update(dt, { mode: p.mode, grounded: true, speed: 0 });
    this.balloons.position.y = Math.sin(this.t * 1.3) * 0.15;
    // fireworks
    this.nextFw -= dt;
    if (this.nextFw <= 0) {
      this.nextFw = 0.5 + Math.random() * 0.6;
      const cols = [[0xff5a5a, 0xffd23f], [0x5ad1ff, 0xffffff], [0x7be07b, 0xffe14a], [0xff8fd8, 0xd9a3ff]][Math.floor(Math.random() * 4)];
      const x = (Math.random() - 0.5) * 12;
      const y = 6 + Math.random() * 4;
      const z = -6 - Math.random() * 6;
      this.fx.burst(x, y, z, 70, cols.map((c) => new THREE.Color(c).multiplyScalar(1.5)), 7, 0.6, 1.4, { grav: -3, drag: 1.4, spread: 2 });
      this.race.app.audio.sfx('pop', 0.5);
    }
    if (Math.random() < dt * 14) {
      const c = [0xff5a5a, 0xffd23f, 0x5ad1ff, 0x7be07b, 0xff8fd8][Math.floor(Math.random() * 5)];
      this.fx.emit((Math.random() - 0.5) * 8, 6, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 0.6, -1.2, 0, c, 0.45, 4, -0.4, 0.3);
    }
    this.fx.update(dt);
    // slow swing in from a closer shot, then a gentle drift
    const k = 1 - Math.exp(-this.t * 1.6);
    const a = Math.sin(this.t * 0.25) * 0.22 + (1 - k) * 0.5;
    const d = this.dist * (0.75 + 0.25 * k);
    this.cam.position.set(Math.sin(a) * d, 1.4 + d * 0.3, Math.cos(a) * d);
    this.cam.lookAt(0, 1.35, -0.8);
  }
}
