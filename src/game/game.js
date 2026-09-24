// Game orchestrator: renderer + XR session, the Link Start intro, the main
// loop, combat & sword skills, quests, NPC dialogs, menus, saving.
import * as THREE from 'three';
import { buildWorld } from '../world/world.js';
import { SUN_DIR, OUTPOST, LAKE, BOSS_ARENA, OVERLOOK, TOWER, TOWN } from '../world/layout.js';
import { GameAudio } from './audio.js';
import { Input, BTN } from './input.js';
import { Player } from './player.js';
import { Sword, SWORDS } from './sword.js';
import { Monsters } from './monsters.js';
import { NPCs } from './npcs.js';
import { Effects } from './effects.js';
import { HUD, Toasts, DamageNumbers, Menu, Dialog, Fader, Vignette, makePrompt } from './ui.js';
import { LinkStart } from './intro.js';
import { QuestLog, QUESTS } from './quests.js';

const QUALITY = {
  low: { pixelRatio: 1, xrScale: 0.85, foveation: 1, shadows: false },
  medium: { pixelRatio: 1.25, xrScale: 1.0, foveation: 1, shadows: true },
  high: { pixelRatio: 1.5, xrScale: 1.25, foveation: 0.7, shadows: true },
};
const SAVE_KEY = 'linkstart-save-v1';
const SPAWN = new THREE.Vector3(0, 0, -15);
const SPAWN_YAW = Math.PI; // facing south, toward the teleport gate

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {};
  } catch (e) {
    return {};
  }
}

function makeGlove(side) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.7 });
  const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0aa, metalness: 0.9, roughness: 0.3 });
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.035, 0.095), mat);
  palm.position.set(0, -0.015, 0.03);
  g.add(palm);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.036, 0.05, 10), metal);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.set(0, -0.012, 0.095);
  g.add(cuff);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 3, 6), mat);
    f.rotation.x = Math.PI / 2 - 0.5;
    f.position.set(-0.03 + i * 0.02, -0.03, -0.035);
    g.add(f);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.04, 3, 6), mat);
  thumb.rotation.set(0.4, 0, side === 'left' ? -0.9 : 0.9);
  thumb.position.set(side === 'left' ? 0.05 : -0.05, -0.005, 0.0);
  g.add(thumb);
  return g;
}

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.quality = opts.quality || 'medium';
    this.timer = new THREE.Timer();
    this.time = 0;
    this.mode = 'loading';
  }

  async init(progress) {
    const q = QUALITY[this.quality];
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.xr.enabled = true;
    this.container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 2500);
    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    this.world = await buildWorld(renderer, this.scene, this.quality, progress);
    progress(0.93, '마을 사람들을 깨우는 중…');
    await new Promise((r) => setTimeout(r, 0));

    const save = loadSave();
    this.settings = { snapTurn: true, vignette: true, music: true, swordAngle: 20, mainHand: 'right', moveRef: 'head', ...(save.settings || {}) };
    this.gameRoot = new THREE.Group();
    this.scene.add(this.gameRoot);
    this.uiRoot = new THREE.Group();
    this.scene.add(this.uiRoot);

    this.audio = new GameAudio();
    this.effects = new Effects(this.gameRoot);
    this.player = new Player(this, save.player);
    this.quests = new QuestLog(save.quests);
    this.input = new Input(renderer, this.rig, renderer.domElement);
    this.input.onConnect = (h) => this.onControllerConnected(h);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.sword = new Sword(this.gameRoot, SWORDS[this.player.swordId] || SWORDS.starter);
    this.monsters = new Monsters(this.gameRoot, this);
    this.npcs = new NPCs(this.gameRoot, this.world.town, this.world.colliders, this.world.tex);
    this.blobs = this.makeBlobShadows();

    this.hud = new HUD();
    this.uiRoot.add(this.hud.group);
    this.toasts = new Toasts();
    this.uiRoot.add(this.toasts.plane.mesh);
    this.damageNums = new DamageNumbers(this.gameRoot);
    this.menu = new Menu(this);
    this.uiRoot.add(this.menu.group);
    this.dialog = new Dialog(this);
    this.uiRoot.add(this.dialog.cp.mesh);
    this.fader = new Fader(this.camera);
    this.vignette = new Vignette(this.camera);
    this.intro = new LinkStart(this.scene);
    this.prompt = makePrompt('[A] 대화');
    this.prompt.visible = false;
    this.uiRoot.add(this.prompt);

    // VR laser pointer
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]);
    this.laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.85, depthTest: false }));
    this.laser.renderOrder = 60;
    this.laser.visible = false;
    this.laserDot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.laserDot.renderOrder = 61;
    this.laserDot.visible = false;
    this.uiRoot.add(this.laserDot);
    this.raycaster = new THREE.Raycaster();

    this.gloves = { left: makeGlove('left'), right: makeGlove('right') };

    this.skill = { charge: 0, ready: false, active: false, timer: 0, cooldown: 0, name: '' };
    this.zone = '';
    this.zoneTimer = 0;
    this.saveTimer = 0;
    this.teleportLock = false;
    this.pendingTeleport = null;
    this.bossEngaged = false;
    this.updateMarkers();

    this.player.teleport(SPAWN, SPAWN_YAW);
    this.world.update(0, 0, this.player._headWorld());

    // audio loops placed in the world once the context exists
    this._loopsAdded = false;

    progress(0.97, '셰이더 준비 중…');
    await new Promise((r) => setTimeout(r, 0));
    try {
      renderer.compile(this.scene, this.camera);
    } catch (e) {
      /* compile is only a warm-up */
    }
    progress(1, '완료');
    this.mode = 'title';
    window.addEventListener('resize', () => this.onResize());
    renderer.setAnimationLoop((t, frame) => this.loop(t, frame));
  }

  // ---------------------------------------------------------------- settings / save
  setQuality(q) {
    this.quality = q;
    const Q = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, Q.pixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({ player: this.player.toJSON(), quests: this.quests.toJSON(), settings: this.settings }));
    } catch (e) {
      /* storage unavailable (private mode) — progress just isn't kept */
    }
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.mode !== 'vr-play') this.layoutDesktopUI();
  }

  debugView(x, y, z, yaw, pitch) {
    this.rig.position.set(x, y, z);
    this.rig.rotation.set(0, 0, 0);
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(pitch, yaw, 0, 'YXZ');
    this.mode = 'debug';
  }

  lockPointer() {
    try {
      const r = this.renderer.domElement.requestPointerLock?.();
      if (r && r.catch) r.catch(() => {});
    } catch (e) {
      /* needs a user gesture; the next click will lock */
    }
  }

  // ---------------------------------------------------------------- start
  _commonStart() {
    this.audio.init();
    if (!this._loopsAdded && this.audio.ctx) {
      this._loopsAdded = true;
      this.audio.addLoop('water', TOWN.fountain.clone().setY(1.5));
      this.audio.addLoop('portal', new THREE.Vector3(0, 3, 0));
      this.audio.addLoop('portal', this.world.gates.outpost.pos.clone().setY(this.world.gates.outpost.pos.y + 3));
    }
    this.audio.setMusic(false);
    this.player.hp = this.player.maxHp;
    this.player.dead = false;
    this.player.teleport(SPAWN, SPAWN_YAW);
  }

  startDesktop({ skipIntro = false } = {}) {
    this.isVR = false;
    this.input.desktopActive = true;
    this._commonStart();
    this.player.yaw = SPAWN_YAW;
    this.player.pitch = 0;
    this.rig.rotation.set(0, 0, 0);
    this.player.camera.position.set(0, this.player.eye, 0);
    this.sword.mountDesktop(this.camera);
    this.layoutDesktopUI();
    document.getElementById('crosshair')?.classList.remove('hidden');
    document.getElementById('desktop-hint')?.classList.remove('hidden');
    this.lockPointer();
    this.prompt.userData.set('[E] 대화');
    if (skipIntro) this.enterWorld(true);
    else this.beginIntro();
  }

  async startVR() {
    const Q = QUALITY[this.quality];
    const session = await navigator.xr.requestSession('immersive-vr', {
      optionalFeatures: ['local-floor', 'bounded-floor', 'layers'],
    });
    this.renderer.xr.setReferenceSpaceType('local-floor');
    this.renderer.xr.setFramebufferScaleFactor(Q.xrScale);
    await this.renderer.xr.setSession(session);
    try {
      this.renderer.xr.setFoveation(Q.foveation);
    } catch (e) {
      /* foveation not supported */
    }
    this.session = session;
    session.addEventListener('end', () => this.onSessionEnd());
    this.isVR = true;
    this.input.desktopActive = false;
    this._commonStart();
    this.camera.position.set(0, 0, 0);
    this.camera.rotation.set(0, 0, 0);
    this.prompt.userData.set('[A] 대화');
    // move HUD / toasts to world space (lazy follow)
    this.uiRoot.add(this.hud.group, this.toasts.plane.mesh);
    this.hud.group.scale.setScalar(1);
    this.toasts.baseScale = 1;
    this.mountHands();
    this.beginIntro();
  }

  onSessionEnd() {
    this.session = null;
    this.isVR = false;
    this.save();
    this.toTitle();
  }

  toTitle() {
    this.mode = 'title';
    this.audio.setMusic(false);
    this.menu.hide();
    this.dialog.hide();
    this.intro.stop();
    this.world.root.visible = this.gameRoot.visible = true;
    this.scene.background = this.world.sky.background;
    this.fader.to(0, 3);
    document.getElementById('crosshair')?.classList.add('hidden');
    document.getElementById('desktop-hint')?.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.desktopActive = false;
    this.onExitToTitle?.();
  }

  onControllerConnected(h) {
    if (this.isVR) this.mountHands();
  }

  mountHands() {
    const main = this.settings.mainHand;
    const off = main === 'right' ? 'left' : 'right';
    const hm = this.input.hands[main];
    const ho = this.input.hands[off];
    if (hm.grip) {
      this.sword.mountVR(hm.grip, this.settings.swordAngle);
      hm.grip.add(this.gloves[main]);
      this.gloves[main].visible = true;
    }
    if (ho.grip) {
      ho.grip.add(this.gloves[off]);
      this.gloves[off].visible = true;
      this.sword.root.parent === ho.grip && hm.grip && this.sword.mountVR(hm.grip, this.settings.swordAngle);
    }
    if (hm.ray) hm.ray.add(this.laser);
  }

  // ---------------------------------------------------------------- intro
  beginIntro() {
    this.mode = 'intro';
    this.world.root.visible = false;
    this.gameRoot.visible = false;
    this.uiRoot.visible = false;
    this.scene.background = new THREE.Color(0x000000);
    this.fader.to(0, 10);
    this._worldShown = false;
    const head = this.player._headWorld();
    const q = new THREE.Quaternion();
    this.camera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    this.intro.start(head, e.y);
    this.audio.play('linkstart', { vol: 0.9 });
  }

  enterWorld(instant = false) {
    this.intro.stop();
    this.world.root.visible = true;
    this.gameRoot.visible = true;
    this.uiRoot.visible = true;
    this.scene.background = this.world.sky.background;
    this.mode = this.isVR ? 'vr-play' : 'desk-play';
    this.audio.setMusic(this.settings.music);
    if (instant) this.fader.to(0, 10);
    this.toasts.push('시작의 마을', '부유성 제1층', '#3aa6ff', true);
    if (!this.quests.active && !this.quests.allDone) {
      this.toasts.push('기사 엘렌에게 말을 걸어보세요', this.isVR ? '가까이 가서 A 버튼' : '가까이 가서 E 키');
    }
    this.zone = '시작의 마을';
  }

  // ---------------------------------------------------------------- UI layout
  layoutDesktopUI() {
    const d = 0.8;
    const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const w = h * this.camera.aspect;
    const hud = this.hud.group;
    this.camera.add(hud);
    const s = Math.min(1, (w * 0.34) / this.hud.main.worldW);
    hud.scale.setScalar(s);
    hud.position.set(-w / 2 + (this.hud.main.worldW * s) / 2 + 0.03, h / 2 - (this.hud.main.worldH * s) / 2 - 0.03, -d);
    hud.quaternion.identity();
    const tp = this.toasts.plane.mesh;
    this.camera.add(tp);
    tp.position.set(0, h * 0.3, -d);
    tp.quaternion.identity();
    this.toasts.baseScale = Math.min(1, (w * 0.5) / this.toasts.plane.worldW);
  }

  followHead(obj, dt, off, rate = 5) {
    const head = this.player.head;
    const q = new THREE.Quaternion();
    this.camera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const yawQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, e.y, 0));
    const target = off.clone().applyQuaternion(yawQ).add(head);
    if (!obj.userData.init) {
      obj.position.copy(target);
      obj.userData.init = true;
    }
    const k = 1 - Math.exp(-dt * rate);
    obj.position.lerp(target, k);
    const look = new THREE.Matrix4().lookAt(head, obj.position, new THREE.Vector3(0, 1, 0));
    const tq = new THREE.Quaternion().setFromRotationMatrix(look);
    obj.quaternion.slerp(tq, k);
  }

  // ---------------------------------------------------------------- stats for UI
  stats() {
    const p = this.player;
    return {
      name: p.name,
      hp: p.hp,
      maxHp: p.maxHp,
      level: p.level,
      exp: p.exp,
      expNext: p.expNext(),
      expFrac: p.exp / p.expNext(),
      potions: p.potions,
      col: p.col,
      kills: p.kills,
      atk: Math.round(p.atk * this.sword.def.atk),
      swordName: this.sword.def.name,
      swordDesc: this.sword.def.desc,
      quest: this.quests.summary(),
      questText: this.quests.hudText(),
      zone: this.zone,
      safe: p.inTown,
      skillReady: this.skill.ready,
    };
  }

  // ---------------------------------------------------------------- main loop
  loop() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.time += dt;
    const t = this.time;
    this.input.update();

    if (this.mode === 'title') {
      // slow cinematic orbit behind the title screen
      const a = t * 0.04;
      this.rig.position.set(Math.sin(a) * 75, 34, Math.cos(a) * 75);
      this.rig.rotation.set(0, 0, 0);
      this.camera.position.set(0, 0, 0);
      const dir = new THREE.Vector3(0, 8, 0).sub(this.rig.position);
      this.camera.rotation.set(Math.atan2(dir.y, Math.hypot(dir.x, dir.z)), Math.atan2(-dir.x, -dir.z), 0, 'YXZ');
      this.player._headWorld();
    } else if (this.mode === 'intro') {
      if (!this.isVR) this.player.updateDesktop(0, this.input, true);
      if (this.isVR) {
        const hp = this.player._headWorld();
        this.intro.group.position.copy(hp);
        if (this.intro.t < 0.6) {
          const e = new THREE.Euler().setFromQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
          this.intro.group.rotation.set(0, e.y, 0);
        }
      }
      const ph = this.intro.update(dt);
      if (ph) {
        if (ph.t > 5.3 && !this._whiteStarted) {
          this._whiteStarted = true;
          this.fader.to(1, 2.2, 0xffffff);
        }
        if (ph.t > 6.0 && !this._worldShown) {
          this._worldShown = true;
          this.world.root.visible = true;
          this.gameRoot.visible = true;
          this.scene.background = this.world.sky.background;
          this.fader.to(0, 1.1, 0xffffff);
        }
        const anyButton = this.input.keyPressed('Space') || this.input.keyPressed('Enter') || this.input.pressed('right', BTN.a) || this.input.pressed('left', BTN.a);
        if (ph.done || (anyButton && ph.t > 1)) {
          this._whiteStarted = false;
          this.enterWorld(!ph.done);
        }
      }
    } else if (this.mode === 'vr-play' || this.mode === 'desk-play') {
      this.updatePlay(dt, t);
    }

    const head = this.player._headWorld();
    this.world.update(dt, t, head);
    this.npcs.update(dt, t, this.mode.endsWith('play') ? this.player.feet : null);
    this.effects.update(dt);
    this.damageNums.update(dt);
    this.fader.update(dt);
    this.updateBlobShadows();
    this.audio.updateListener(this.camera);
    if (this.audio) this.audio.listenerPos = head;
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  updatePlay(dt, t) {
    const vr = this.mode === 'vr-play';
    const input = this.input;
    const main = this.settings.mainHand;
    const off = main === 'right' ? 'left' : 'right';
    const uiOpen = this.menu.open || this.dialog.open;
    const p = this.player;

    // --- movement
    if (!p.dead) {
      if (vr) p.updateVR(dt, input, this.settings);
      else p.updateDesktop(dt, input, uiOpen);
    } else {
      p._afterMove();
    }
    this.vignette.enabled = vr && this.settings.vignette;
    this.vignette.update(dt, vr ? p.moveAmount * 0.9 : 0);

    // --- buttons
    const menuBtn = vr ? input.pressed(off, BTN.b) || input.pressed(main, BTN.b) : input.keyPressed('Tab') || input.keyPressed('KeyM');
    if (menuBtn && !p.dead) {
      if (this.dialog.open) this.dialog.hide();
      else this.toggleMenu();
    }
    if (!vr && input.keyPressed('Escape') && (this.menu.open || this.dialog.open)) {
      this.menu.open ? this.toggleMenu() : this.dialog.hide();
    }
    const potionBtn = vr ? input.pressed(off, BTN.a) : input.keyPressed('KeyQ');
    if (potionBtn && !p.dead) this.usePotion();
    const interactBtn = vr ? input.pressed(main, BTN.a) : input.keyPressed('KeyE');

    // --- NPC interaction
    const npc = !p.dead && p.inTown ? this.npcs.nearest(p.feet) : null;
    this.prompt.visible = !!npc && !uiOpen;
    if (npc) this.prompt.position.set(npc.pos.x, 2.0, npc.pos.z);
    if (interactBtn && npc && !uiOpen) this.talkTo(npc);
    else if (interactBtn && this.dialog.open) this.dialog.choose(0);

    // --- pointer UI (menu / dialog)
    this.updatePointer(vr, uiOpen);
    if (!vr && this.dialog.open) {
      for (let i = 0; i < 3; i++) if (input.keyPressed(`Digit${i + 1}`)) this.dialog.choose(i);
    }

    // --- sword & combat
    this.sword.setVisible(!uiOpen && !p.dead);
    if (!vr) this.sword.updateDesktop(dt);
    this.updateSkill(dt, vr, uiOpen);
    this.sword.track(dt, this.skill.active ? 1 : 0);
    if (!uiOpen && !p.dead) this.checkHits(vr);

    // --- monsters, gates, zones
    this.monsters.update(dt, p);
    this.updateGates(dt);
    this.updateZone(dt);
    if (p.inTown && !p.dead && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * 12);
    else if (!p.dead && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * 0.8);

    // --- UI
    this.hud.render(this.stats());
    this.toasts.update(dt);
    this.menu.update(dt);
    if (vr) {
      this.followHead(this.hud.group, dt, new THREE.Vector3(-0.4, 0.32, -1.1), 4);
      this.followHead(this.toasts.plane.mesh, dt, new THREE.Vector3(0, 0.24, -1.4), 6);
    }

    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.saveTimer = 0;
      this.save();
    }
  }

  // ---------------------------------------------------------------- pointer
  updatePointer(vr, uiOpen) {
    this.laser.visible = vr && uiOpen;
    this.laserDot.visible = false;
    if (!uiOpen) return;
    const targets = this.menu.open ? this.menu.interactive() : [this.dialog.cp.mesh];
    let click = false;
    if (vr) {
      const hand = this.input.hands[this.settings.mainHand];
      if (!hand.ray) return;
      hand.ray.updateWorldMatrix(true, false);
      const origin = new THREE.Vector3().setFromMatrixPosition(hand.ray.matrixWorld);
      const dir = new THREE.Vector3(0, 0, -1).transformDirection(hand.ray.matrixWorld);
      this.raycaster.set(origin, dir);
      click = this.input.pressed(this.settings.mainHand, BTN.trigger) || this.input.pressed(this.settings.mainHand === 'right' ? 'left' : 'right', BTN.trigger);
    } else {
      this.raycaster.setFromCamera(new THREE.Vector2(this.input.mouse.x, this.input.mouse.y), this.camera);
      click = this.input.mouse.clicked;
    }
    const hits = this.raycaster.intersectObjects(targets, false);
    const hit = hits[0] || null;
    if (vr) {
      const len = hit ? hit.distance : 2;
      this.laser.scale.set(1, 1, len);
      if (hit) {
        this.laserDot.visible = true;
        this.laserDot.position.copy(hit.point);
      }
    }
    const over = this.menu.open ? this.menu.pointer(hit, click) : this.dialog.pointer(hit, click);
    if (over && vr && click) this.input.haptic(this.settings.mainHand, 0.3, 20);
  }

  toggleMenu() {
    if (this.menu.open) {
      this.menu.hide();
      this.audio.play('menuClose', { vol: 0.8 });
      if (!this.isVR) {
        this.input.menuMode = false;
        this.lockPointer();
      }
      return;
    }
    const head = this.player._headWorld();
    const q = new THREE.Quaternion();
    this.camera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const fwd = new THREE.Vector3(-Math.sin(e.y), 0, -Math.cos(e.y));
    const dist = this.isVR ? 0.85 : 1.05;
    const pos = head.clone().addScaledVector(fwd, dist);
    pos.y -= this.isVR ? 0.12 : 0.05;
    this.menu.show(pos, e.y);
    this.audio.play('menuOpen', { vol: 0.9 });
    if (!this.isVR) {
      this.input.menuMode = true;
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }

  onLockChange(locked) {
    const hint = document.getElementById('desktop-hint');
    if (hint) hint.textContent = locked ? 'Esc: 마우스 잠금 해제 · Tab: 메뉴' : '클릭해서 마우스 잠금';
  }

  onMenuAction(id) {
    const s = this.settings;
    switch (id) {
      case 'usePotion':
        this.usePotion();
        break;
      case 'turn':
        s.snapTurn = !s.snapTurn;
        break;
      case 'vignette':
        s.vignette = !s.vignette;
        break;
      case 'music':
        s.music = !s.music;
        this.audio.setMusic(s.music);
        break;
      case 'swordAngle': {
        const opts = [0, 20, 40, 60];
        s.swordAngle = opts[(opts.indexOf(s.swordAngle) + 1) % opts.length];
        if (this.isVR) this.mountHands();
        break;
      }
      case 'hand':
        s.mainHand = s.mainHand === 'right' ? 'left' : 'right';
        if (this.isVR) {
          this.gloves.left.removeFromParent();
          this.gloves.right.removeFromParent();
          this.mountHands();
        }
        break;
      case 'moveRef':
        s.moveRef = s.moveRef === 'head' ? 'controller' : 'head';
        break;
      case 'logout':
        this.menu.confirmLogout = true;
        break;
      case 'logoutNo':
        this.menu.confirmLogout = false;
        break;
      case 'logoutYes':
        this.logout();
        return;
    }
    this.save();
  }

  logout() {
    this.save();
    this.menu.hide();
    this.audio.play('menuClose');
    if (this.session) this.session.end();
    else this.toTitle();
  }

  // ---------------------------------------------------------------- skills & hits
  updateSkill(dt, vr, uiOpen) {
    const sk = this.skill;
    const main = this.settings.mainHand;
    sk.cooldown = Math.max(0, sk.cooldown - dt);
    const holding = !uiOpen && !this.player.dead && (vr ? this.input.held(main, BTN.trigger) : this.input.mouse.right);
    if (sk.active) {
      sk.timer -= dt;
      if (sk.timer <= 0) {
        sk.active = false;
        sk.cooldown = 0.9;
      }
    } else if (holding && sk.cooldown <= 0) {
      sk.charge += dt;
      if (!sk.ready && sk.charge >= 0.4) {
        sk.ready = true;
        this.audio.play('charge', { vol: 0.7 });
        if (vr) this.input.haptic(main, 0.25, 60);
      }
    } else if (!holding) {
      sk.charge = 0;
      sk.ready = false;
    }
    // activation
    if (sk.ready && !sk.active) {
      if (vr && this.sword.tipSpeed > 4.2) {
        const v = this.sword.tipVel;
        const horiz = Math.hypot(v.x, v.z);
        const name = Math.abs(v.y) > horiz * 1.4 ? '버티컬' : horiz > Math.abs(v.y) * 1.8 ? '호리즌탈' : '슬랜트';
        this.activateSkill(name);
      } else if (!vr && this.input.mouse.leftPressed) {
        const arc = this.sword.startSwing(true);
        if (arc) this.activateSkill(arc === 'v' ? '버티컬' : '슬랜트');
      }
    } else if (!vr && this.input.mouse.leftPressed && !uiOpen && !this.player.dead && this.input.locked) {
      if (this.sword.startSwing(false)) this.audio.play('swing', { vol: 0.55, rate: 0.95 + Math.random() * 0.1 });
    }
    // VR swing whoosh
    if (vr && !uiOpen) {
      if (this.sword.tipSpeed > 5 && !this._whoosh) {
        this._whoosh = true;
        this.audio.play('swing', { vol: Math.min(0.8, this.sword.tipSpeed / 12), pos: this.sword.tip, rate: 0.9 + Math.random() * 0.2 });
      } else if (this.sword.tipSpeed < 2.5) this._whoosh = false;
    }
    const pulse = 0.65 + 0.35 * Math.sin(this.time * 14);
    this.sword.setGlow(sk.active ? 1 : sk.ready ? pulse : Math.min(0.35, (sk.charge / 0.4) * 0.35));
  }

  activateSkill(name) {
    const sk = this.skill;
    sk.ready = false;
    sk.charge = 0;
    sk.active = true;
    sk.timer = 0.55;
    sk.name = name;
    this.audio.play('skill', { vol: 0.9 });
    if (this.isVR) this.input.haptic(this.settings.mainHand, 0.8, 120);
    this.damageNums.spawn(this.sword.tip.clone().add(new THREE.Vector3(0, 0.2, 0)), name, '#9fe8ff', 1.2);
  }

  checkHits(vr) {
    if (!vr && !this.sword.swinging) return;
    const hits = this.monsters.sweep(this.sword, vr ? 1.8 : 0.3);
    const sk = this.skill;
    for (const h of hits) {
      const speedF = vr ? THREE.MathUtils.clamp((this.sword.tipSpeed - 1.5) / 5.5, 0.25, 1.3) : 0.9;
      let dmg = this.player.atk * this.sword.def.atk * (0.55 + speedF) * (0.9 + Math.random() * 0.2);
      const crit = vr ? this.sword.tipSpeed > 7.5 : Math.random() < 0.12;
      if (sk.active) dmg *= 2.6;
      if (crit) dmg *= 1.5;
      dmg = Math.max(1, Math.round(dmg));
      const killed = this.monsters.damage(h.m, dmg, h.dir);
      this.damageNums.spawn(h.point.clone().add(new THREE.Vector3(0, 0.25, 0)), `${dmg}`, sk.active ? '#8fe6ff' : crit ? '#ffd24a' : '#ffffff', sk.active || crit ? 1.3 : 1);
      this.effects.sparks(h.point, h.dir, sk.active ? this.sword.def.skill : 0xffd28a, sk.active ? 28 : 12, sk.active ? 6 : 4);
      this.audio.play(sk.active || crit ? 'crit' : 'hit', { pos: h.point, vol: 1, rate: 0.9 + Math.random() * 0.2 });
      if (vr) this.input.haptic(this.settings.mainHand, sk.active ? 1 : 0.65, sk.active ? 90 : 45);
      void killed;
    }
  }

  onParry(m, pos) {
    this.effects.sparks(pos, null, 0xfff0a0, 34, 7);
    this.audio.play('crit', { pos, rate: 1.35, vol: 1 });
    this.damageNums.spawn(pos.clone().add(new THREE.Vector3(0, 0.3, 0)), 'PARRY', '#ffe066', 1.1);
    if (this.isVR) this.input.haptic(this.settings.mainHand, 1, 120);
  }

  onPlayerHit(m, dmg, dir) {
    const p = this.player;
    if (p.dead) return;
    p.hp = Math.max(0, p.hp - dmg);
    this.fader.hit(0xff2a2a, 0.42);
    this.audio.play('hurt', { vol: 0.9 });
    if (this.isVR) {
      this.input.haptic('left', 0.9, 150);
      this.input.haptic('right', 0.9, 150);
    }
    const fwd = new THREE.Vector3(0, 0, -0.9).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    this.damageNums.spawn(p.head.clone().add(fwd).add(new THREE.Vector3(0.2, -0.25, 0)), `-${dmg}`, '#ff6b5b', 0.8);
    // small knockback (kept short to stay comfortable in VR)
    this.rig.position.addScaledVector(dir.setY(0).normalize(), this.isVR ? 0.25 : 0.6);
    if (p.hp <= 0) this.die();
  }

  die() {
    const p = this.player;
    p.dead = true;
    this.menu.hide();
    this.dialog.hide();
    this.effects.shatter(p.head.clone().add(new THREE.Vector3(0, -0.6, 0)), 0.7, 0x9ad8ff, 140, 1.6);
    this.audio.play('shatter', { vol: 1.2 });
    this.audio.play('death', { vol: 0.9 });
    this.fader.to(0.92, 0.7);
    this.toasts.push('HP 0 — 전투 불능', '시작의 마을에서 부활합니다…', '#ef4b3f', true);
    setTimeout(() => {
      const lost = Math.floor(p.col * 0.1);
      p.col -= lost;
      p.hp = p.maxHp;
      p.dead = false;
      this.player.teleport(SPAWN, SPAWN_YAW);
      this.fader.to(0, 1.2);
      this.effects.pillar(SPAWN.clone(), 0x9ad8ff, 0.9, 5);
      this.audio.play('teleport', { vol: 0.8 });
      if (lost > 0) this.toasts.push('부활', `${lost} Col을 잃었습니다`);
      this.save();
    }, 3800);
  }

  usePotion() {
    const p = this.player;
    if (p.dead) return;
    if (p.potions <= 0) {
      this.audio.play('deny');
      this.toasts.push('포션이 없습니다', '광장의 상인 모라에게 구매하세요', '#ef4b3f');
      return;
    }
    if (p.hp >= p.maxHp) {
      this.audio.play('deny');
      return;
    }
    p.potions--;
    const heal = Math.min(120, p.maxHp - p.hp);
    p.hp += heal;
    this.audio.play('potion');
    this.effects.motes(p.feet.clone(), 0x7dff9a, 36, 0.5);
    const fwd = new THREE.Vector3(0, 0, -0.9).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    this.damageNums.spawn(p.head.clone().add(fwd).add(new THREE.Vector3(0, -0.2, 0)), `+${Math.round(heal)}`, '#7dff9a', 0.9);
    this.save();
  }

  onMonsterKilled(m) {
    const p = this.player;
    p.kills++;
    const exp = m.def.exp;
    const col = m.def.col + Math.floor(Math.random() * m.def.col * 0.4);
    p.col += col;
    const pos = m.pos.clone().add(new THREE.Vector3(0, m.def.height * m.scale + 0.8, 0));
    this.damageNums.spawn(pos, `+${exp} EXP`, '#8fd0ff', 0.9);
    setTimeout(() => this.damageNums.spawn(pos.clone().add(new THREE.Vector3(0, 0.35, 0)), `+${col} Col`, '#ffd24a', 0.8), 250);
    this.audio.play('coin', { vol: 0.5 });
    if (Math.random() < (m.def.boss ? 1 : 0.14)) {
      p.potions += m.def.boss ? 3 : 1;
      this.toasts.push('회복 포션 획득', `보유 ${p.potions}개`, '#2fb44a');
    }
    const ups = p.gainExp(exp);
    if (ups) this.onLevelUp();
    if (this.quests.onKill(m.def.id)) {
      const q = this.quests.current;
      if (this.quests.done) {
        this.toasts.push('퀘스트 목표 달성!', `${q.title} — 엘렌에게 보고하세요`, '#2fb44a');
        this.audio.play('quest', { vol: 0.8 });
      }
      this.updateMarkers();
    }
    if (m.def.boss) {
      this.bossEngaged = false;
      this.toasts.push('CONGRATULATIONS', '필드 보스 「보어 킹」 토벌!', '#f0a020', true);
      this.audio.play('quest', { vol: 1 });
    }
    this.save();
  }

  onLevelUp() {
    const p = this.player;
    this.audio.play('levelup', { vol: 0.9 });
    this.effects.pillar(p.feet.clone(), 0xffd070, 0.8, 4.5, 1.8);
    this.effects.motes(p.feet.clone(), 0xffe08a, 40, 0.7);
    this.toasts.push('LEVEL UP!', `Lv ${p.level}  ·  HP ${p.maxHp}  ·  공격력 ${p.atk}`, '#f0a020', true);
    if (this.isVR) {
      this.input.haptic('left', 0.5, 200);
      this.input.haptic('right', 0.5, 200);
    }
  }

  onBossAggro(m) {
    if (this.bossEngaged) return;
    this.bossEngaged = true;
    this.toasts.push('WARNING', '필드 보스 「보어 킹」 출현!', '#ef4b3f', true);
    this.audio.setTheme('boss');
  }

  // ---------------------------------------------------------------- NPC dialogs
  updateMarkers() {
    const q = this.quests;
    this.npcs.setMarker(this.npcs.ellen, q.allDone ? null : q.done ? '?' : q.active ? null : '!');
  }

  talkTo(npc) {
    const head = this.player.head;
    const toPlayer = new THREE.Vector3(head.x - npc.pos.x, 0, head.z - npc.pos.z).normalize();
    const pos = npc.pos.clone().addScaledVector(toPlayer, 0.7);
    pos.y = Math.max(1.35, head.y - 0.15);
    const right = new THREE.Vector3(toPlayer.z, 0, -toPlayer.x);
    pos.addScaledVector(right, 0.35);
    const lookAt = head.clone();
    this.audio.play('menuOpen', { vol: 0.6 });
    if (!this.isVR) {
      this.input.menuMode = true;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    const close = () => {
      if (!this.isVR) {
        this.input.menuMode = false;
        this.lockPointer();
      }
    };
    const say = (text, options) =>
      this.dialog.show(
        pos,
        lookAt,
        npc.name,
        text,
        options.map((o) => ({ ...o, action: () => { o.action?.(); if (!this.dialog.open) close(); } }))
      );
    const p = this.player;
    const qs = this.quests;
    if (npc.id === 'ellen') {
      if (qs.allDone) {
        say('이 층의 필드는 이제 평화로워. 다음 목표는 저 미궁 탑이야… 하지만 그건 다음 업데이트에서! 그동안 레벨을 올려 두라고.', [{ label: '알겠어' }]);
      } else if (!qs.active) {
        const q = qs.current;
        say(q.offer, [
          { label: '수락한다', action: () => this.acceptQuest() },
          { label: '나중에' },
        ]);
      } else if (qs.done) {
        const q = qs.current;
        say(q.doneLine, [{ label: '보상 받기', action: () => this.completeQuest() }]);
      } else {
        const q = qs.current;
        say(`${q.progressLine}  (${qs.progress} / ${q.need})`, [{ label: '다녀올게' }]);
      }
    } else if (npc.id === 'mora') {
      say(`어서 오세요~ 회복 포션 하나에 50 Col이에요. HP를 120 회복해 줘요.  (소지금 ${p.col} Col · 포션 ${p.potions}개)`, [
        { label: '1개 구매 (50)', action: () => this.buyPotions(1, npc) },
        { label: '5개 구매 (230)', action: () => this.buyPotions(5, npc) },
        { label: '괜찮아요' },
      ]);
    } else if (npc.id === 'smith') {
      const txt = p.swordId === 'azure'
        ? '그 청은의 장검, 내 평생 최고의 작품이지! 소드 스킬을 쓸 때 푸른 빛이 번쩍이는 게 보여? 하하!'
        : '초심자의 장검이군. 나쁘지 않아. 보어 킹의 어금니를 구해 온다면 훨씬 좋은 검을 벼려 주지.';
      say(txt, [{ label: '고마워' }]);
    } else if (npc.id === 'guard') {
      say('남문 밖은 몬스터 출몰 지역이야. HP가 0이 되면 광장에서 부활하지만 소지금 일부를 잃어. 성벽 안은 안전지대라 HP가 빠르게 회복돼.', [{ label: '조심할게' }]);
    }
  }

  buyPotions(n, npc) {
    const p = this.player;
    const cost = n === 5 ? 230 : 50 * n;
    if (p.col < cost) {
      this.audio.play('deny');
      this.toasts.push('Col이 부족합니다', `${cost} Col 필요 · 보유 ${p.col} Col`, '#ef4b3f');
      return;
    }
    p.col -= cost;
    p.potions += n;
    this.audio.play('coin', { vol: 0.8 });
    this.toasts.push(`회복 포션 ×${n} 구매`, `보유 ${p.potions}개 · 남은 소지금 ${p.col} Col`, '#2fb44a');
    this.save();
    void npc;
  }

  acceptQuest() {
    this.quests.accept();
    const q = this.quests.current;
    this.toasts.push('퀘스트 수락', q.title, '#3aa6ff');
    this.audio.play('select');
    this.updateMarkers();
    if (q.target === 'boss') this.bossEngaged = false;
    this.save();
  }

  completeQuest() {
    const q = this.quests.complete();
    const p = this.player;
    const r = q.reward;
    p.col += r.col || 0;
    p.potions += r.potions || 0;
    this.toasts.push('퀘스트 완료!', `${q.title}  ·  +${r.exp} EXP  ·  +${r.col} Col${r.potions ? `  ·  포션 ×${r.potions}` : ''}`, '#2fb44a', true);
    this.audio.play('quest');
    if (r.sword) {
      p.swordId = r.sword;
      this.sword.setDef(SWORDS[r.sword]);
      this.toasts.push('새 검 획득!', SWORDS[r.sword].name, '#6fd0ff', true);
      this.effects.pillar(p.feet.clone(), 0x6fd0ff, 0.8, 4, 1.6);
    }
    if (p.gainExp(r.exp)) this.onLevelUp();
    this.updateMarkers();
    this.save();
  }

  // ---------------------------------------------------------------- gates & zones
  updateGates(dt) {
    const p = this.player;
    if (p.dead) return;
    const g = this.world.gates;
    const dMain = Math.hypot(p.head.x - g.main.pos.x, p.head.z - g.main.pos.z);
    const dOut = Math.hypot(p.head.x - g.outpost.pos.x, p.head.z - g.outpost.pos.z);
    if (this.teleportLock) {
      if (dMain > 4.5 && dOut > 3.5) this.teleportLock = false;
      return;
    }
    if (this.pendingTeleport) return;
    let dest = null, yaw = 0, label = '';
    if (dMain < 1.6) {
      const o = g.outpost;
      dest = new THREE.Vector3(o.pos.x - 4.5, o.pos.y, o.pos.z);
      yaw = Math.PI / 2;
      label = '남부 초원 · 전초기지';
    } else if (dOut < 1.3) {
      dest = new THREE.Vector3(0, 0, 5);
      yaw = Math.PI;
      label = '시작의 마을';
    }
    if (!dest) return;
    this.pendingTeleport = true;
    this.teleportLock = true;
    this.audio.play('teleport', { vol: 0.9 });
    this.fader.to(1, 5, 0xdff4ff);
    this.effects.pillar(p.feet.clone(), 0x8fd0ff, 1, 6, 1.2);
    setTimeout(() => {
      p.teleport(dest, yaw);
      if (!this.isVR) p.yaw = yaw;
      this.effects.pillar(dest.clone().setY(p.rig.position.y), 0x8fd0ff, 1, 6, 1.4);
      this.fader.to(0, 2.2, 0xdff4ff);
      this.toasts.push(label, '전이 완료', '#3aa6ff');
      this.pendingTeleport = false;
      this.hud.group.userData.init = false;
      this.toasts.plane.mesh.userData.init = false;
    }, 420);
  }

  zoneAt(p) {
    const d = (a) => Math.hypot(p.x - a.x, p.z - a.z);
    if (this.player.inTown) return '시작의 마을';
    if (d(BOSS_ARENA) < 50) return '폐허 광장';
    if (d(TOWER) < TOWER.r + 70) return '미궁 탑 입구';
    if (d(OVERLOOK) < 60) return '세계의 끝 전망대';
    if (d({ x: LAKE.x, z: LAKE.z }) < LAKE.r + 30) return '거울 호수';
    if (d(OUTPOST) < 40) return '초원 전초기지';
    if (d({ x: 175, z: 250 }) < 80) return '동남쪽 숲';
    if (p.z > 120 && Math.abs(p.x) < 140) return '남부 초원';
    return '부유성 제1층 필드';
  }

  updateZone(dt) {
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0) return;
    this.zoneTimer = 0.5;
    const z = this.zoneAt(this.player.feet);
    const boss = this.monsters.boss;
    if (this.bossEngaged && (!boss.alive || !boss.aggro)) {
      this.bossEngaged = false;
    }
    this.audio.setZone(this.player.inTown ? 'town' : 'field');
    this.audio.setTheme(this.bossEngaged ? 'boss' : this.player.inTown ? 'town' : 'field');
    if (z !== this.zone) {
      this.zone = z;
      this.toasts.push(z, this.player.inTown ? '안전지대 — HP가 빠르게 회복됩니다' : '필드 — 몬스터에 주의하세요', this.player.inTown ? '#3aa6ff' : '#f0a020');
    }
  }

  // ---------------------------------------------------------------- blob shadows
  makeBlobShadows() {
    const max = 90;
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), max);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.gameRoot.add(mesh);
    return mesh;
  }

  updateBlobShadows() {
    const mesh = this.blobs;
    const m = new THREE.Matrix4();
    let i = 0;
    const put = (x, y, z, s) => {
      if (i >= mesh.instanceMatrix.count) return;
      m.makeScale(s, 1, s);
      m.setPosition(x, y + 0.03, z);
      mesh.setMatrixAt(i++, m);
    };
    for (const mm of this.monsters.list) {
      if (!mm.alive) continue;
      put(mm.pos.x, mm.pos.y, mm.pos.z, (mm.def.id === 'wolf' ? 1.3 : 1.6) * mm.scale * mm.spawnK);
    }
    const tmp = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const n = this.npcs.walkers.length + this.npcs.special.length;
    for (let k = 0; k < n; k++) {
      this.npcs.cloak.getMatrixAt(k, tmp);
      v.setFromMatrixPosition(tmp);
      put(v.x, 0, v.z, 0.9);
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

export { QUESTS };
