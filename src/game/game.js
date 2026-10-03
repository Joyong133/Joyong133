// Game orchestrator: renderer + XR session, the Link Start intro, the main
// loop, maps (floor 1, the labyrinth, floor 2) and travel between them,
// combat & sword skills, quests, NPC dialogs, mini-games, menus, saving.
import * as THREE from 'three';
import { buildWorld } from '../world/world.js';
import { setActiveHeight, TOWER } from '../world/layout.js';
import { GlowField } from '../world/glow.js';
import { setFoliageSun } from '../world/foliage.js';
import { makeFloor1 } from '../maps/floor1.js';
import { makeLabyrinth, LAB } from '../maps/labyrinth.js';
import { makeFloor2, F2_GATES, F2_ARRIVE } from '../maps/floor2.js';
import { GameAudio } from './audio.js';
import { Input, BTN } from './input.js';
import { Player } from './player.js';
import { Sword, SWORDS } from './sword.js';
import { Monsters, MONSTER_TYPES } from './monsters.js';
import { NPCs } from './npcs.js';
import { Effects } from './effects.js';
import { HUD, Toasts, DamageNumbers, Menu, Dialog, Fader, Vignette, MiniPanel, BossBar, makePrompt } from './ui.js';
import { LinkStart } from './intro.js';
import { QuestLog, CHAINS } from './quests.js';
import { Inventory, ITEMS } from './inventory.js';
import { Chests } from './chests.js';
import { Pet } from './pet.js';
import { Fishing } from './fishing.js';
import { Training } from './training.js';
import { Tag } from './tag.js';
import { talk } from './talk.js';
import { makeGlove } from './hands.js';

const QUALITY = {
  low: { pixelRatio: 1, xrScale: 0.85, foveation: 1, shadows: false },
  medium: { pixelRatio: 1.25, xrScale: 1.0, foveation: 1, shadows: true },
  high: { pixelRatio: 1.5, xrScale: 1.25, foveation: 0.7, shadows: true },
};
const SAVE_KEY = 'linkstart-save-v1';

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null') || {};
  } catch (e) {
    return {};
  }
}


const GATE_DEFS = () => [
  { id: 'f1town', map: 'f1', label: '시작의 마을', floor: '제1층', pos: new THREE.Vector3(0, 0, 5), yaw: Math.PI },
  { id: 'f1outpost', map: 'f1', label: '초원 전초기지', floor: '제1층' },
  ...F2_GATES.map((g) => ({ ...g, map: 'f2' })),
];

export class Game {
  constructor(container, opts = {}) {
    this.container = container;
    this.quality = opts.quality || 'medium';
    this.timer = new THREE.Timer();
    this.time = 0;
    this.mode = 'loading';
    this.maps = {};
    this.map = null;
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
    progress(0.92, '마을 사람들을 깨우는 중…');
    await new Promise((r) => setTimeout(r, 0));

    const save = loadSave();
    this.settings = { snapTurn: true, vignette: true, music: true, swordAngle: 20, mainHand: 'right', moveRef: 'head', pet: true, ...(save.settings || {}) };
    this.progress = { floor2: false, lordDefeated: false, pet: false, f2visited: false, ...(save.progress || {}) };
    this.records = { killsBy: {}, ...(save.records || {}) };
    this.inv = new Inventory(save.inv || { potion: save.player?.potions ?? 3 });
    this.gameRoot = new THREE.Group();
    this.scene.add(this.gameRoot);
    this.uiRoot = new THREE.Group();
    this.scene.add(this.uiRoot);

    this.audio = new GameAudio();
    this.effects = new Effects(this.gameRoot);
    this.player = new Player(this, save.player);
    this.quests = new QuestLog(save.quests);
    this.quests.countItem = (id) => this.inv.count(id);
    this.input = new Input(renderer, this.rig, renderer.domElement);
    this.input.onConnect = (h) => this.onControllerConnected(h);
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.sword = new Sword(this.gameRoot, SWORDS[this.player.swordId] || SWORDS.starter);
    this.blobs = this.makeBlobShadows();
    this.pet = new Pet(this.gameRoot, this);
    this.fishing = new Fishing(this.gameRoot, this);
    this.training = new Training(this.gameRoot, this);
    this.tag = new Tag(this);
    this.buff = { atk: 0, exp: 0 };

    this.hud = new HUD();
    this.uiRoot.add(this.hud.group);
    this.toasts = new Toasts();
    this.uiRoot.add(this.toasts.plane.mesh);
    this.mini = new MiniPanel();
    this.uiRoot.add(this.mini.cp.mesh);
    this.bossBar = new BossBar();
    this.uiRoot.add(this.bossBar.cp.mesh);
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
    this.pendingTeleport = false;
    this.bossEngaged = false;
    this.bossTarget = null;
    this._loops = [];

    // maps: floor 1 + labyrinth now; floor 2 is built the first time you go there
    this.setupMap(makeFloor1(this.world, this));
    progress(0.95, '미궁 탑을 쌓는 중…');
    await new Promise((r) => setTimeout(r, 0));
    const labGlows = new GlowField(this.world.tex.glow, 160);
    const lab = makeLabyrinth(this.world, this, labGlows);
    lab.root.add(labGlows.mesh);
    lab.glows = labGlows;
    this.setupMap(lab);
    let startMap = 'f1';
    if (save.map === 'f2' && this.progress.floor2) {
      progress(0.96, '제2층을 불러오는 중…');
      await this.ensureMap('f2', progress);
      startMap = 'f2';
    }
    this.switchMap(startMap, this.maps[startMap].spawn.pos, this.maps[startMap].spawn.yaw);
    this.updateMarkers();
    this.map.update(0, 0, this.player._headWorld());

    progress(0.98, '셰이더 준비 중…');
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

  // ---------------------------------------------------------------- maps
  setupMap(map) {
    if (!map.root.parent) this.scene.add(map.root);
    map.actors = new THREE.Group();
    map.actors.name = `actors:${map.id}`;
    this.gameRoot.add(map.actors);
    map.monsters = new Monsters(map.actors, this, { height: map.height, colliders: map.colliders, ...map.monsterCfg() });
    map.npcs = new NPCs(map.actors, map.colliders, map.npcCfg);
    map.chests = new Chests(map.actors, this, map.chestSpots, map.height, map.colliders, map.glows || null, map.id);
    map.root.visible = false;
    map.actors.visible = false;
    this.maps[map.id] = map;
    return map;
  }

  async ensureMap(id, progress) {
    if (this.maps[id]) return this.maps[id];
    if (id === 'f2') {
      const map = await makeFloor2(this.world, this, progress || (() => {}));
      this.setupMap(map);
      this.updateMarkers();
      return map;
    }
    throw new Error(`unknown map ${id}`);
  }

  applyEnv(env) {
    const w = this.world;
    this.scene.background = env.sky.background;
    this.scene.environment = env.sky.environment;
    this.scene.environmentIntensity = env.envIntensity;
    this.scene.fog.color.copy(env.fog.color);
    this.scene.fog.density = env.fog.density;
    const s = env.sun;
    setFoliageSun(s.dir);
    w.sun.color.copy(s.color);
    w.sun.intensity = s.intensity;
    w.sun.target.position.copy(s.center);
    w.sun.position.copy(s.dir).multiplyScalar(220).add(s.center);
    w.sun.target.updateMatrixWorld();
    const sc = w.sun.shadow.camera;
    sc.left = sc.bottom = -s.extent;
    sc.right = sc.top = s.extent;
    sc.updateProjectionMatrix();
    w.hemi.color.set(env.hemi.sky);
    w.hemi.groundColor.set(env.hemi.ground);
    w.hemi.intensity = env.hemi.intensity;
    this.renderer.shadowMap.needsUpdate = true;
  }

  switchMap(id, pos, yaw) {
    const prev = this.map;
    const map = this.maps[id];
    if (prev && prev !== map) {
      prev.root.visible = false;
      prev.actors.visible = false;
      prev.monsters.calm();
    }
    this.map = map;
    this.monsters = map.monsters;
    this.npcs = map.npcs;
    map.root.visible = true;
    map.actors.visible = true;
    setActiveHeight(map.height);
    this.applyEnv(map.env);
    this.player.teleport(pos, yaw);
    if (!this.isVR) this.player.yaw = yaw;
    this.player._afterMove();
    this.fishing.stop();
    this.training.stop(false);
    if (this.tag.active) this.tag.stop(false);
    this.bossEngaged = false;
    this.bossTarget = null;
    this.bossBar.hide();
    this.pet.reset();
    this.zone = '';
    this.zoneTimer = 0;
    for (const l of this._loops) l.handle?.set(l.map === id);
    this.hud.group.userData.init = false;
    this.toasts.plane.mesh.userData.init = false;
    this.mini.cp.mesh.userData.init = false;
  }

  addMapLoops(map) {
    if (!this.audio.ctx || map._loopsAdded) return;
    map._loopsAdded = true;
    for (const l of map.loops) {
      const handle = this.audio.addLoop(l.kind, l.pos);
      handle?.set(this.map === map);
      this._loops.push({ map: map.id, handle });
    }
  }

  // fade out → (build) → switch map → fade in
  async travel(id, pos, yaw, title, sub = '') {
    if (this.pendingTeleport) return;
    this.pendingTeleport = true;
    this.teleportLock = true;
    this.menu.hide();
    this.dialog.hide();
    this.audio.play('teleport', { vol: 0.9 });
    this.fader.to(1, 4, 0xdff4ff);
    this.effects.pillar(this.player.feet.clone(), 0x8fd0ff, 1, 6, 1.2);
    await new Promise((r) => setTimeout(r, 450));
    if (!this.maps[id]) {
      this.fader.to(1, 10, 0x000000);
      this.mini.show('새로운 층을 불러오는 중…', '잠시만 기다려 주세요', 0, '#3aa6ff');
      await new Promise((r) => setTimeout(r, 60));
      try {
        await this.ensureMap(id, (p, t) => this.mini.show('새로운 층을 불러오는 중…', t || '', p, '#3aa6ff'));
      } catch (e) {
        console.error(e);
        this.mini.hide();
        this.fader.to(0, 2);
        this.pendingTeleport = false;
        return;
      }
      this.mini.hide();
    }
    this.switchMap(id, pos, yaw);
    this.addMapLoops(this.map);
    this.effects.pillar(this.player.feet.clone(), 0x8fd0ff, 1, 6, 1.4);
    this.fader.to(0, 2.2, 0xdff4ff);
    if (title) this.toasts.push(title, sub, '#3aa6ff', true);
    this.pendingTeleport = false;
    this.save();
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
      localStorage.setItem(
        SAVE_KEY,
        JSON.stringify({
          v: 2,
          player: this.player.toJSON(),
          inv: this.inv.toJSON(),
          quests: this.quests.toJSON(),
          settings: this.settings,
          progress: this.progress,
          records: this.records,
          map: this.map && this.map.id === 'f2' ? 'f2' : 'f1',
        })
      );
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
    for (const m of Object.values(this.maps)) this.addMapLoops(m);
    this.audio.setMusic(false);
    this.player.hp = this.player.maxHp;
    this.player.dead = false;
    if (this.map.id === 'lab') this.switchMap('f1', this.maps.f1.spawn.pos, this.maps.f1.spawn.yaw);
    this.player.teleport(this.map.spawn.pos, this.map.spawn.yaw);
    this.intro.setWelcome(`${this.map.name} — ${this.map.town}`);
  }

  startDesktop({ skipIntro = false } = {}) {
    this.isVR = false;
    this.input.desktopActive = true;
    this._commonStart();
    this.player.yaw = this.map.spawn.yaw;
    this.player.pitch = 0;
    this.rig.rotation.set(0, 0, 0);
    this.player.camera.position.set(0, this.player.eye, 0);
    this.sword.mountDesktop(this.camera);
    this.layoutDesktopUI();
    document.getElementById('crosshair')?.classList.remove('hidden');
    document.getElementById('desktop-hint')?.classList.remove('hidden');
    this.lockPointer();
    this.btnLabel = '[E]';
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
    this.btnLabel = '[A]';
    // move HUD / toasts to world space (lazy follow)
    this.uiRoot.add(this.hud.group, this.toasts.plane.mesh, this.mini.cp.mesh, this.bossBar.cp.mesh);
    this.hud.group.scale.setScalar(1);
    this.toasts.baseScale = 1;
    for (const o of [this.mini.cp.mesh, this.bossBar.cp.mesh]) o.scale.setScalar(1);
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
    this.fishing.stop();
    this.training.stop(false);
    this.mini.hide();
    this.bossBar.hide();
    this.intro.stop();
    this.map.root.visible = this.gameRoot.visible = true;
    this.scene.background = this.map.env.sky.background;
    this.fader.to(0, 3);
    document.getElementById('crosshair')?.classList.add('hidden');
    document.getElementById('desktop-hint')?.classList.add('hidden');
    if (document.pointerLockElement) document.exitPointerLock();
    this.input.desktopActive = false;
    this.onExitToTitle?.();
  }

  onControllerConnected() {
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
    if (this.fishing.active) this.fishing.mount();
  }

  // ---------------------------------------------------------------- intro
  beginIntro() {
    this.mode = 'intro';
    this.map.root.visible = false;
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
    this.map.root.visible = true;
    this.gameRoot.visible = true;
    this.uiRoot.visible = true;
    this.scene.background = this.map.env.sky.background;
    this.mode = this.isVR ? 'vr-play' : 'desk-play';
    this.audio.setMusic(this.settings.music);
    if (instant) this.fader.to(0, 10);
    this.toasts.push(this.map.town, this.map.name, '#3aa6ff', true);
    if (this.map.id === 'f1' && !this.quests.active('ellen') && this.quests.state.ellen.idx === 0) {
      this.toasts.push('기사 엘렌에게 말을 걸어보세요', this.isVR ? '가까이 가서 A 버튼' : '가까이 가서 E 키');
    }
    this.zone = this.map.town;
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
    const mp = this.mini.cp.mesh;
    this.camera.add(mp);
    const ms = Math.min(1, (w * 0.36) / this.mini.cp.worldW);
    mp.scale.setScalar(ms);
    mp.position.set(0, -h / 2 + (this.mini.cp.worldH * ms) / 2 + 0.05, -d);
    mp.quaternion.identity();
    const bb = this.bossBar.cp.mesh;
    this.camera.add(bb);
    const bs = Math.min(1, (w * 0.5) / this.bossBar.cp.worldW);
    bb.scale.setScalar(bs);
    bb.position.set(0, h / 2 - (this.bossBar.cp.worldH * bs) / 2 - 0.02, -d);
    bb.quaternion.identity();
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
  swordAtk() {
    return this.sword.def.atk * (1 + 0.1 * this.player.swordPlus) * (this.buff.atk > 0 ? 1.2 : 1);
  }

  stats(full = true) {
    const p = this.player;
    const inv = this.inv;
    const mk = (id) => ({ id, name: ITEMS[id].name, desc: ITEMS[id].desc || '', count: inv.count(id) });
    const use = ['potion', 'hipotion', 'crystal', 'cake', 'candy'].filter((id) => id === 'potion' || inv.has(id)).map(mk);
    const kills = this.records.killsBy || {};
    const top = Object.entries(kills).sort((a, b) => b[1] - a[1])[0];
    const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const buffs = [];
    if (this.buff.atk > 0) buffs.push(`공격력 UP ${fmt(this.buff.atk)}`);
    if (this.buff.exp > 0) buffs.push(`경험치 UP ${fmt(this.buff.exp)}`);
    if (!full) {
      return {
        name: p.name, hp: p.hp, maxHp: p.maxHp, level: p.level, expFrac: p.exp / p.expNext(), potions: p.potions,
        col: p.col, questText: this.quests.hudText(), zone: this.zone, safe: p.inTown, skillReady: this.skill.ready, buff: buffs.join('  ·  '),
      };
    }
    return {
      name: p.name,
      hp: p.hp,
      maxHp: p.maxHp,
      hpBonus: p.hpBonus,
      level: p.level,
      exp: p.exp,
      expNext: p.expNext(),
      expFrac: p.exp / p.expNext(),
      potions: p.potions,
      col: p.col,
      kills: p.kills,
      atk: Math.round(p.atk * this.swordAtk()),
      swordName: `${this.sword.def.name}${p.swordPlus ? ` +${p.swordPlus}` : ''}`,
      swordDesc: this.sword.def.desc,
      quests: this.quests.summaries(),
      questText: this.quests.hudText(),
      zone: this.zone,
      floorName: this.map.name,
      safe: p.inTown,
      skillReady: this.skill.ready,
      buff: buffs.join('  ·  '),
      petName: this.progress.pet ? '깃털 용 큐루' : '',
      cleared: this.progress.lordDefeated ? '제1층' : '없음',
      items: {
        use,
        mats: inv.ofKind('mat').map(mk),
        fish: inv.ofKind('fish').map(mk),
        keys: inv.ofKind('key').map(mk),
      },
      records: {
        ...this.records,
        topKill: top ? `${MONSTER_TYPES[top[0]]?.name || top[0]} ${top[1]}` : '',
        bigFishName: this.records.bigFish ? ITEMS[this.records.bigFish.id]?.name : '',
      },
      map: this.mapTabData(),
    };
  }

  mapTabData() {
    const head = this.player.head;
    const q = new THREE.Quaternion();
    this.camera.getWorldQuaternion(q);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    const marks = [];
    for (const n of this.npcs.special) {
      if (n.markerKind === '!' || n.markerKind === '?') marks.push({ x: n.pos.x, z: n.pos.z, kind: n.markerKind });
    }
    return { info: this.map.mapInfo, name: this.map.name, player: { x: head.x, z: head.z, yaw: e.y }, marks };
  }

  // ---------------------------------------------------------------- main loop
  loop() {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  update(dt) {
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
          this.map.root.visible = true;
          this.gameRoot.visible = true;
          this.scene.background = this.map.env.sky.background;
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
    this.map.update(dt, t, head);
    this.map.glows?.update(t);
    const playing = this.mode.endsWith('play');
    this.npcs.update(dt, t, playing ? this.player.feet : null);
    this.map.chests.update(dt);
    this.tag.update(dt);
    this.pet.update(dt);
    this.effects.update(dt);
    this.damageNums.update(dt);
    this.fader.update(dt);
    this.updateBlobShadows();
    this.audio.updateListener(this.camera);
    if (this.audio) this.audio.listenerPos = head;
  }

  updatePlay(dt, t) {
    const vr = this.mode === 'vr-play';
    const input = this.input;
    const main = this.settings.mainHand;
    const off = main === 'right' ? 'left' : 'right';
    const uiOpen = this.menu.open || this.dialog.open;
    const p = this.player;
    const fishing = this.fishing.active;

    // --- movement
    if (!p.dead) {
      if (vr) p.updateVR(dt, input, this.settings);
      else p.updateDesktop(dt, input, uiOpen);
    } else {
      p._afterMove();
    }
    this.vignette.enabled = vr && this.settings.vignette;
    this.vignette.update(dt, vr ? p.moveAmount * 0.9 : 0);
    if (vr) {
      // sword hand stays clenched; the free hand follows trigger / grip
      const offH = input.hands[off];
      this.gloves[main].userData.curl(0.9, 1.0, 0.95);
      this.gloves[off].userData.curl(offH.values[BTN.trigger] || 0, offH.values[BTN.grip] || 0, offH.buttons[BTN.a] || offH.buttons[BTN.b] ? 1 : 0.35);
    }

    // --- buttons
    const menuBtn = vr ? input.pressed(off, BTN.b) || input.pressed(main, BTN.b) : input.keyPressed('Tab') || input.keyPressed('KeyM');
    if (menuBtn && !p.dead) {
      if (this.dialog.open) this.closeDialog();
      else if (fishing) this.fishing.stop();
      else this.toggleMenu();
    }
    if (!vr && input.keyPressed('Escape') && (this.menu.open || this.dialog.open)) {
      this.menu.open ? this.toggleMenu() : this.closeDialog();
    }
    const potionBtn = vr ? input.pressed(off, BTN.a) : input.keyPressed('KeyQ');
    if (potionBtn && !p.dead) this.usePotion();
    const interactBtn = vr ? input.pressed(main, BTN.a) : input.keyPressed('KeyE');

    // --- interaction (NPCs, chests, portals, fishing spots, flowers)
    const cand = !p.dead && !uiOpen && !fishing && !this.pendingTeleport ? this.findInteract(p) : null;
    this.prompt.visible = !!cand;
    if (cand) {
      const label = `${this.btnLabel || '[A]'} ${cand.label}`;
      if (label !== this._promptLabel) {
        this._promptLabel = label;
        this.prompt.userData.set(label);
      }
      this.prompt.position.copy(cand.at);
      if (interactBtn) cand.act();
    } else if (interactBtn && this.dialog.open) this.dialog.choose(0);
    else if (interactBtn && fishing && !vr) this.fishing.stop();
    // auto portals (stairs of light)
    if (!p.dead && !this.pendingTeleport) {
      for (const pt of this.map.portals) {
        if (!pt.auto || (pt.enabled && !pt.enabled())) continue;
        if (Math.hypot(p.feet.x - pt.pos.x, p.feet.z - pt.pos.z) < pt.r && Math.abs(p.feet.y - pt.pos.y) < 2) pt.action();
      }
    }

    // --- pointer UI (menu / dialog)
    this.updatePointer(vr, uiOpen);
    if (!vr && this.dialog.open) {
      for (let i = 0; i < 4; i++) if (input.keyPressed(`Digit${i + 1}`)) this.dialog.choose(i);
    }

    // --- sword & combat
    this.sword.setVisible(!uiOpen && !p.dead && !fishing);
    if (!vr) this.sword.updateDesktop(dt);
    if (!fishing) this.updateSkill(dt, vr, uiOpen);
    else this.sword.setGlow(0);
    this.sword.track(dt, this.skill.active ? 1 : 0);
    if (!uiOpen && !p.dead && !fishing) this.checkHits(vr);
    this.fishing.update(dt, vr && !uiOpen);
    if (!uiOpen) this.training.update(dt, vr);

    // --- monsters, gates, zones
    this.monsters.update(dt, p);
    this.updateGates(dt);
    this.updateZone(dt);
    if (p.inTown && !p.dead && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * 12);
    else if (!p.dead && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + dt * 0.8);
    this.buff.atk = Math.max(0, this.buff.atk - dt);
    this.buff.exp = Math.max(0, this.buff.exp - dt);

    // --- boss gauge
    const b = this.bossTarget;
    if (b && b.alive && b.aggro && b.pos.distanceTo(p.feet) < 70) this.bossBar.show(b);
    else this.bossBar.hide();

    // --- UI
    this.hud.render(this.stats(false));
    this.toasts.update(dt);
    this.menu.update(dt);
    if (vr) {
      this.followHead(this.hud.group, dt, new THREE.Vector3(-0.4, 0.32, -1.1), 4);
      this.followHead(this.toasts.plane.mesh, dt, new THREE.Vector3(0, 0.24, -1.4), 6);
      if (this.mini.open) this.followHead(this.mini.cp.mesh, dt, new THREE.Vector3(0, -0.34, -1.05), 5);
      if (this.bossBar.cp.mesh.visible) this.followHead(this.bossBar.cp.mesh, dt, new THREE.Vector3(0, 0.46, -1.35), 5);
    }

    this.saveTimer += dt;
    if (this.saveTimer > 15) {
      this.saveTimer = 0;
      this.save();
    }
  }

  // nearest thing the player can use with [A] / E
  findInteract(p) {
    let best = null;
    const consider = (d, max, label, at, act) => {
      if (d < max && (!best || d < best.d)) best = { d, label, at, act };
    };
    const npc = this.npcs.nearest(p.feet);
    if (npc) consider(Math.hypot(p.feet.x - npc.pos.x, p.feet.z - npc.pos.z), 2.4, '대화', new THREE.Vector3(npc.pos.x, npc.pos.y + 2.0 * npc.scale, npc.pos.z), () => this.talkTo(npc));
    const chest = this.map.chests.nearest(p.feet);
    if (chest) consider(Math.hypot(p.feet.x - chest.pos.x, p.feet.z - chest.pos.z), 1.9, '보물상자 열기', chest.pos.clone().add(new THREE.Vector3(0, 1.15, 0)), () => this.openChest(chest));
    for (const s of this.map.fishing) {
      const d = Math.hypot(p.feet.x - s.pos.x, p.feet.z - s.pos.z);
      if (Math.abs(p.feet.y - s.pos.y) < 1.5) consider(d, s.r, '낚시하기', s.pos.clone().add(new THREE.Vector3(0, 1.8, 0)), () => this.startFishing(s));
    }
    for (const pt of this.map.portals) {
      if (pt.auto || (pt.enabled && !pt.enabled())) continue;
      consider(Math.hypot(p.feet.x - pt.pos.x, p.feet.z - pt.pos.z), pt.r, pt.prompt, pt.pos.clone().add(new THREE.Vector3(0, 2.2, 0)), pt.action);
    }
    const fl = this.map.nearestFlower?.(p.feet);
    if (fl) consider(Math.hypot(p.feet.x - fl.pos.x, p.feet.z - fl.pos.z), 1.8, '바람꽃 채집', fl.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), () => this.pickFlower(fl));
    return best;
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
    if (id.startsWith('use:')) {
      this.useItem(id.slice(4));
      return;
    }
    switch (id) {
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
      case 'pet':
        s.pet = s.pet === false;
        this.pet.reset();
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
      let dmg = this.player.atk * this.swordAtk() * (0.55 + speedF) * (0.9 + Math.random() * 0.2);
      const crit = vr ? this.sword.tipSpeed > 7.5 : Math.random() < 0.12;
      if (sk.active) dmg *= 2.6;
      if (crit) dmg *= 1.5;
      dmg = Math.max(1, Math.round(dmg));
      this.monsters.damage(h.m, dmg, h.dir);
      this.damageNums.spawn(h.point.clone().add(new THREE.Vector3(0, 0.25, 0)), `${dmg}`, sk.active ? '#8fe6ff' : crit ? '#ffd24a' : '#ffffff', sk.active || crit ? 1.3 : 1);
      this.effects.sparks(h.point, h.dir, sk.active ? this.sword.def.skill : 0xffd28a, sk.active ? 28 : 12, sk.active ? 6 : 4);
      this.audio.play(sk.active || crit ? 'crit' : 'hit', { pos: h.point, vol: 1, rate: 0.9 + Math.random() * 0.2 });
      if (vr) this.input.haptic(this.settings.mainHand, sk.active ? 1 : 0.65, sk.active ? 90 : 45);
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
    if (p.dead || this.pendingTeleport) return;
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
    this.rig.position.addScaledVector(dir.clone().setY(0).normalize(), this.isVR ? 0.25 : 0.6);
    if (this.fishing.active) this.fishing.stop();
    if (p.hp <= 0) this.die();
  }

  onSlam(m, pos, R) {
    this.effects.shockwave(pos, R, m.def.id === 'taurus' ? 0xffb060 : 0xff8a60);
    this.audio.play('slam', { pos, vol: 1.3 });
    const d = pos.distanceTo(this.player.feet);
    if (this.isVR && d < R * 3) {
      const k = Math.max(0.25, 1 - d / (R * 3));
      this.input.haptic('left', k, 160);
      this.input.haptic('right', k, 160);
    }
  }

  die() {
    const p = this.player;
    p.dead = true;
    this.menu.hide();
    this.dialog.hide();
    this.fishing.stop();
    this.training.stop(false);
    this.effects.shatter(p.head.clone().add(new THREE.Vector3(0, -0.6, 0)), 0.7, 0x9ad8ff, 140, 1.6);
    this.audio.play('shatter', { vol: 1.2 });
    this.audio.play('death', { vol: 0.9 });
    this.fader.to(0.92, 0.7);
    const home = this.map.id === 'lab' ? this.maps.f1 : this.map;
    this.toasts.push('HP 0 — 전투 불능', `${home.town}에서 부활합니다…`, '#ef4b3f', true);
    setTimeout(() => {
      const lost = Math.floor(p.col * 0.1);
      p.col -= lost;
      p.hp = p.maxHp;
      p.dead = false;
      if (home !== this.map) this.switchMap(home.id, home.spawn.pos, home.spawn.yaw);
      else this.player.teleport(home.spawn.pos, home.spawn.yaw);
      if (!this.isVR) this.player.yaw = home.spawn.yaw;
      this.fader.to(0, 1.2);
      this.effects.pillar(home.spawn.pos.clone(), 0x9ad8ff, 0.9, 5);
      this.audio.play('teleport', { vol: 0.8 });
      if (lost > 0) this.toasts.push('부활', `${lost} Col을 잃었습니다`);
      this.save();
    }, 3800);
  }

  heal(amount, color = '#7dff9a') {
    const p = this.player;
    const heal = Math.min(amount, p.maxHp - p.hp);
    p.hp += heal;
    this.audio.play('potion');
    this.effects.motes(p.feet.clone(), 0x7dff9a, 36, 0.5);
    const fwd = new THREE.Vector3(0, 0, -0.9).applyQuaternion(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    this.damageNums.spawn(p.head.clone().add(fwd).add(new THREE.Vector3(0, -0.2, 0)), `+${Math.round(heal)}`, color, 0.9);
  }

  usePotion() {
    const p = this.player;
    if (p.dead) return;
    const id = ['potion', 'hipotion', 'candy'].find((k) => this.inv.has(k));
    if (!id) {
      this.audio.play('deny');
      this.toasts.push('포션이 없습니다', '상인에게 구매하세요', '#ef4b3f');
      return;
    }
    // prefer a hi-potion when badly hurt
    const useId = this.inv.has('hipotion') && p.maxHp - p.hp > 220 ? 'hipotion' : id;
    this.useItem(useId);
  }

  useItem(id) {
    const p = this.player;
    if (p.dead || !this.inv.has(id)) return this.audio.play('deny');
    const heals = { potion: 120, hipotion: 350, candy: 60 };
    if (heals[id]) {
      if (p.hp >= p.maxHp) return this.audio.play('deny');
      this.inv.remove(id);
      this.heal(heals[id]);
    } else if (id === 'cake') {
      this.inv.remove(id);
      this.buff.atk = 180;
      this.audio.play('levelup', { vol: 0.5, rate: 1.5 });
      this.effects.motes(p.feet.clone(), 0xffb0d0, 40, 0.5);
      this.toasts.push('트렘블 쇼트케이크', '사르르… 3분 동안 공격력 +20%!', '#ff8ab0');
    } else if (id === 'crystal') {
      const home = this.map.id === 'lab' ? this.maps.f1 : this.map;
      this.inv.remove(id);
      this.menu.hide();
      this.audio.play('select');
      this.toasts.push('전이!', home.town, '#3aa6ff');
      this.travel(home.id, home.spawn.pos, home.spawn.yaw, home.town, '전이 결정 사용');
    }
    this.save();
  }

  onMonsterKilled(m) {
    const p = this.player;
    const def = m.def;
    p.kills++;
    this.records.killsBy[def.id] = (this.records.killsBy[def.id] || 0) + 1;
    const exp = Math.round(def.exp * (this.buff.exp > 0 ? 1.2 : 1));
    const col = def.col + Math.floor(Math.random() * def.col * 0.4);
    p.col += col;
    const pos = m.pos.clone().add(new THREE.Vector3(0, (def.flying ? 0.4 : def.height) * m.scale + 0.8, 0));
    this.damageNums.spawn(pos, `+${exp} EXP`, '#8fd0ff', 0.9);
    setTimeout(() => this.damageNums.spawn(pos.clone().add(new THREE.Vector3(0, 0.35, 0)), `+${col} Col`, '#ffd24a', 0.8), 250);
    this.audio.play('coin', { vol: 0.5 });
    if (Math.random() < (def.boss ? 1 : 0.14)) {
      const hi = def.level >= 6;
      this.inv.add(hi ? 'hipotion' : 'potion', def.boss ? 3 : 1);
      this.toasts.push(`${hi ? '하이 포션' : '회복 포션'} 획득`, `보유 ${this.inv.count(hi ? 'hipotion' : 'potion')}개`, '#2fb44a');
    }
    if (def.drop && Math.random() < def.drop.p) {
      this.inv.add(def.drop.id);
      setTimeout(() => this.damageNums.spawn(pos.clone().add(new THREE.Vector3(0, 0.7, 0)), ITEMS[def.drop.id].name, '#e8d0ff', 0.7), 500);
    }
    const ups = p.gainExp(exp);
    if (ups) this.onLevelUp();
    const moved = this.quests.onKill(def.id);
    for (const chain of moved) {
      if (this.quests.done(chain)) {
        const q = this.quests.q(chain);
        this.toasts.push('퀘스트 목표 달성!', `${q.title} — ${CHAINS[chain].giver}에게 보고하세요`, '#2fb44a');
        this.audio.play('quest', { vol: 0.8 });
      }
    }
    if (moved.length) this.updateMarkers();
    if (def.floorBoss) this.onFloorBossDefeated(m);
    else if (def.boss) {
      this.bossEngaged = false;
      this.toasts.push('CONGRATULATIONS', `필드 보스 「${def.name}」 토벌!`, '#f0a020', true);
      this.audio.play('quest', { vol: 1 });
    }
    if (m === this.bossTarget) this.bossTarget = null;
    this.save();
  }

  onFloorBossDefeated(m) {
    this.bossEngaged = false;
    const first = !this.progress.lordDefeated;
    this.progress.lordDefeated = true;
    this.progress.floor2 = true;
    this.audio.play('fanfare', { vol: 1 });
    this.toasts.push('CONGRATULATIONS!', `층 보스 「${m.def.name}」 토벌 — 제1층 공략 완료!`, '#f0a020', true);
    if (first && !this.inv.has('lordCoat')) {
      this.inv.add('lordCoat');
      this.player.hp = this.player.maxHp;
      this.toasts.push('LAST ATTACK BONUS', '군주의 망토 획득 — 최대 HP +60', '#b07aff', true);
    }
    this.toasts.push('빛의 계단이 열렸습니다', '보스 방 북쪽 계단을 올라 제2층으로!', '#3aa6ff', true);
    this.map.lab?.setOpen();
    setTimeout(() => this.audio.play('gate', { pos: new THREE.Vector3(0, 3, LAB.stairs.z0), vol: 1.2 }), 1500);
    this.updateMarkers();
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
    this.bossTarget = m;
    if (this.bossEngaged) return;
    this.bossEngaged = true;
    this.toasts.push('WARNING', `${m.def.floorBoss ? '층 보스' : '필드 보스'} 「${m.def.name}」 출현!`, '#ef4b3f', true);
    this.audio.setTheme('boss');
  }

  onBossEvent(m, kind) {
    if (kind === 'phase2') {
      const line = m.def.id === 'koboldLord' ? '도끼와 방패를 내던지고 곡도를 뽑았다!' : '분노로 온몸이 붉게 달아올랐다!';
      this.toasts.push(`${m.def.name} 광폭화!`, line, '#ef4b3f', true);
      this.audio.play('roar', { pos: m.pos, vol: 1.5, rate: 0.85 });
    } else if (kind === 'summon') {
      this.toasts.push('부하 소환!', `${m.def.name}이(가) 센티널을 불러냈다`, '#f0a020');
    }
  }

  // ---------------------------------------------------------------- NPC dialogs
  updateMarkers() {
    const set = (map, id, chain) => {
      const n = this.maps[map]?.npcs.byId[id];
      if (n) this.maps[map].npcs.setMarker(n, this.quests.marker(chain));
    };
    set('f1', 'ellen', 'ellen');
    set('f2', 'hanna', 'hanna');
    set('f2', 'mii', 'mii');
  }

  closeDialog() {
    this.dialog.hide();
    if (!this.isVR) {
      this.input.menuMode = false;
      this.lockPointer();
    }
  }

  // open a dialog next to an NPC (or in front of you when npc is null)
  say(npc, text, options) {
    const head = this.player.head;
    let pos;
    if (npc) {
      const toPlayer = new THREE.Vector3(head.x - npc.pos.x, 0, head.z - npc.pos.z).normalize();
      pos = npc.pos.clone().addScaledVector(toPlayer, 0.7);
      pos.y = head.y - 0.15;
      pos.addScaledVector(new THREE.Vector3(toPlayer.z, 0, -toPlayer.x), 0.35);
    } else {
      const q = new THREE.Quaternion();
      this.camera.getWorldQuaternion(q);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      pos = head.clone().add(new THREE.Vector3(-Math.sin(e.y), 0, -Math.cos(e.y)).multiplyScalar(this.isVR ? 0.9 : 1.1));
      pos.y = head.y - 0.12;
    }
    if (!this.isVR) {
      this.input.menuMode = true;
      if (document.pointerLockElement) document.exitPointerLock();
    }
    this.dialog.show(
      pos,
      head.clone(),
      npc ? npc.name : text.title || '',
      npc ? text : text.body,
      options.map((o) => ({ ...o, action: () => { o.action?.(); if (!this.dialog.open) this.closeDialog(); } }))
    );
  }

  talkTo(npc) {
    this.audio.play('menuOpen', { vol: 0.6 });
    talk(this, npc);
  }

  buy(id, n, price) {
    const p = this.player;
    if (p.col < price) {
      this.audio.play('deny');
      this.toasts.push('Col이 부족합니다', `${price} Col 필요 · 보유 ${p.col} Col`, '#ef4b3f');
      return;
    }
    p.col -= price;
    this.inv.add(id, n);
    this.audio.play('coin', { vol: 0.8 });
    this.toasts.push(`${ITEMS[id].name} ×${n} 구매`, `보유 ${this.inv.count(id)}개 · 남은 소지금 ${p.col} Col`, '#2fb44a');
    this.save();
  }

  sellLoot(kinds) {
    let col = 0, n = 0;
    for (const k of kinds) {
      for (const id of this.inv.ofKind(k)) {
        col += ITEMS[id].sell * this.inv.count(id);
        n += this.inv.count(id);
        this.inv.remove(id, this.inv.count(id));
      }
    }
    if (!n) {
      this.audio.play('deny');
      this.toasts.push('팔 물건이 없습니다', '', '#7b8391');
      return;
    }
    this.player.col += col;
    this.audio.play('coin', { vol: 0.9 });
    this.toasts.push(`+${col} Col`, `${n}개 판매 완료`, '#f0a020');
    this.save();
  }

  acceptQuest(chain) {
    this.quests.accept(chain);
    const q = this.quests.q(chain);
    this.toasts.push('퀘스트 수락', q.title, '#3aa6ff');
    this.audio.play('select');
    this.updateMarkers();
    this.save();
  }

  completeQuest(chain) {
    const q = this.quests.q(chain);
    if (q.collect) this.inv.remove(q.target, q.need);
    this.quests.complete(chain);
    const p = this.player;
    const r = q.reward;
    p.col += r.col || 0;
    if (r.potions) this.inv.add('potion', r.potions);
    if (r.hipotions) this.inv.add('hipotion', r.hipotions);
    if (r.crystals) this.inv.add('crystal', r.crystals);
    const extra = [r.potions && `포션 ×${r.potions}`, r.hipotions && `하이 포션 ×${r.hipotions}`, r.crystals && `전이 결정 ×${r.crystals}`].filter(Boolean).join(' · ');
    this.toasts.push('퀘스트 완료!', `${q.title}  ·  +${r.exp} EXP  ·  +${r.col} Col${extra ? `  ·  ${extra}` : ''}`, '#2fb44a', true);
    this.audio.play('quest');
    if (r.sword) {
      p.swordId = r.sword;
      this.sword.setDef(SWORDS[r.sword]);
      this.toasts.push('새 검 획득!', `${SWORDS[r.sword].name}${p.swordPlus ? ` (+${p.swordPlus} 강화 유지)` : ''}`, '#6fd0ff', true);
      this.effects.pillar(p.feet.clone(), 0x6fd0ff, 0.8, 4, 1.6);
    }
    if (r.pet) {
      this.progress.pet = true;
      this.settings.pet = true;
      this.pet.reset();
      this.toasts.push('동료 획득!', '깃털 용 “큐루”가 함께합니다', '#ff8ab0', true);
      this.effects.motes(p.feet.clone(), 0x9fe8ff, 60, 0.8);
    }
    if (p.gainExp(r.exp)) this.onLevelUp();
    this.updateMarkers();
    this.save();
  }

  enhanceSword(npc, col, pts, rate) {
    const p = this.player;
    if (p.col < col || !this.inv.spendEnh(pts)) {
      this.audio.play('deny');
      return;
    }
    p.col -= col;
    const anvil = npc.pos.clone().add(new THREE.Vector3(Math.sin(npc.yaw) * 1.1, 0.9, Math.cos(npc.yaw) * 1.1));
    this.toasts.push('강화 중…', '깡! 깡! 깡!', '#9a8a7a');
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        this.audio.play('anvil', { pos: anvil, vol: 1, rate: 0.95 + i * 0.05 });
        this.effects.sparks(anvil, new THREE.Vector3(0, 1, 0), 0xffb040, 20, 3);
      }, 250 + i * 420);
    }
    setTimeout(() => {
      if (Math.random() * 100 < rate) {
        p.swordPlus++;
        this.records.enhBest = Math.max(this.records.enhBest || 0, p.swordPlus);
        this.audio.play('levelup', { vol: 0.8 });
        this.effects.pillar(p.feet.clone(), 0xffc860, 0.7, 3.5, 1.4);
        this.toasts.push(`강화 성공! +${p.swordPlus}`, `${this.sword.def.name} +${p.swordPlus}  ·  공격력 ${Math.round(p.atk * this.swordAtk())}`, '#f0a020', true);
      } else {
        this.audio.play('deny', { vol: 1 });
        this.effects.sparks(anvil, null, 0x8a8a8a, 30, 2);
        this.toasts.push('강화 실패…', '재료와 Col이 사라졌습니다. 검은 무사합니다.', '#7b8391', true);
      }
      this.save();
    }, 1700);
  }

  playSong(npc) {
    const p = this.player;
    if (p.col < 10) {
      this.audio.play('deny');
      return this.say(npc, '어머, 동전이 없으시네요. 괜찮아요, 다음에 들려드릴게요!', [{ label: '미안' }]);
    }
    p.col -= 10;
    const song = [74, 76, 78, 81, 78, 76, 74, null, 71, 74, 76, 78, 76, 74, 71, 69, 71, 74, 76, 74, null, 78, 81, 83, 81, 78, 76, 74];
    this.audio.jingle(song, 0.26, 0.1);
    for (let i = 0; i < 8; i++) {
      setTimeout(() => this.effects.motes(npc.pos.clone(), [0xffd070, 0x9fe8ff, 0xffa0d0][i % 3], 6, 0.4), i * 800);
    }
    this.buff.exp = 180;
    this.toasts.push('리라의 노래', '마음이 가벼워진다… 3분 동안 경험치 +20%', '#b07aff');
    this.save();
  }

  startTraining() {
    if (this.training.active) return;
    this.training.start();
  }

  startTag(npc) {
    if (this.tag.active) return;
    this.tag.start(npc, this.map.colliders, 108);
  }

  startFishing(spot) {
    if (!this.inv.has('rod')) {
      this.audio.play('deny');
      this.toasts.push('낚싯대가 없습니다', '거울 호수의 낚시꾼 토마에게 받아 오세요', '#ef4b3f');
      return;
    }
    this.fishing.start(spot);
  }

  openChest(c) {
    const loot = this.map.chests.open(c);
    if (!loot) return;
    this.player.col += loot.col;
    for (const [id, n] of loot.items) this.inv.add(id, n);
    this.records.chests = (this.records.chests || 0) + 1;
    this.audio.play('chest', { pos: c.pos, vol: 1 });
    this.effects.motes(c.pos.clone(), 0xffd070, 40, 0.5);
    this.effects.sparks(c.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), new THREE.Vector3(0, 1, 0), 0xffe080, 24, 2.5);
    const list = loot.items.map(([id, n]) => `${ITEMS[id].name} ×${n}`).join(' · ');
    this.toasts.push('보물상자!', `+${loot.col} Col${list ? `  ·  ${list}` : ''}`, '#f0a020');
    this.save();
  }

  pickFlower(f) {
    if (!this.map.pickFlower(f)) return;
    this.inv.add('windFlower');
    this.audio.play('chest', { vol: 0.7, rate: 1.3 });
    this.effects.motes(f.pos.clone(), 0x6fd0ff, 30, 0.4);
    this.toasts.push('바람꽃 채집', `보유 ${this.inv.count('windFlower')}송이`, '#6fd0ff');
    if (this.quests.done('mii')) this.updateMarkers();
    this.save();
  }

  // ---------------------------------------------------------------- gates & travel
  gateTargets() {
    const defs = GATE_DEFS();
    const f1 = this.maps.f1;
    for (const d of defs) {
      if (d.map === 'f1') {
        const g = f1.gates.find((x) => x.id === d.id);
        d.pos = g.arrive.pos;
        d.yaw = g.arrive.yaw;
      }
    }
    return defs.filter((d) => d.map === 'f1' || this.progress.floor2);
  }

  updateGates() {
    const p = this.player;
    if (p.dead || this.pendingTeleport) return;
    const gates = this.map.gates;
    let inside = null;
    for (const g of gates) {
      if (Math.hypot(p.head.x - g.pos.x, p.head.z - g.pos.z) < g.r) inside = g;
    }
    if (this.teleportLock) {
      const near = gates.some((g) => Math.hypot(p.head.x - g.pos.x, p.head.z - g.pos.z) < g.r + 3);
      if (!near) this.teleportLock = false;
      return;
    }
    if (!inside) return;
    this.teleportLock = true;
    const others = this.gateTargets().filter((d) => d.id !== inside.id);
    if (!this.progress.floor2 || others.length === 1) {
      const d = others[0];
      this.travel(d.map, d.pos, d.yaw, d.label, '전이 완료');
      return;
    }
    this.audio.play('menuOpen', { vol: 0.7 });
    this.say(null, { title: '전이문', body: `어디로 전이할까요?  (현재: ${inside.floor} ${inside.label})` }, [
      ...others.map((d) => ({ label: `${d.floor} ${d.label}`, action: () => this.travel(d.map, d.pos, d.yaw, d.label, `${d.floor} · 전이 완료`) })),
      { label: '취소' },
    ]);
  }

  enterLabyrinth() {
    this.travel('lab', LAB.entry, 0, '제1층 미궁 탑', this.progress.lordDefeated ? '보스 방은 이미 공략되었습니다' : '최상층 — 보스 방 앞');
  }

  leaveLabyrinth() {
    const tg = this.maps.f1.portals.find((x) => x.id === 'tower').pos;
    const d = new THREE.Vector3(tg.x - TOWER.x, 0, tg.z - TOWER.z).normalize();
    this.travel('f1', tg.clone().addScaledVector(d, 4), Math.atan2(-d.x, -d.z), '미궁 탑 입구', '제1층 필드');
  }

  climbToFloor2() {
    const first = !this.progress.f2visited;
    this.progress.f2visited = true;
    this.travel('f2', F2_ARRIVE.pos, F2_ARRIVE.yaw, '부유성 제2층', '고원 도시 메사리아').then(() => {
      if (first) {
        setTimeout(() => {
          this.audio.play('fanfare', { vol: 0.9 });
          this.toasts.push('전이문 활성화!', '이제 제1층 광장의 전이문에서 제2층으로 올 수 있습니다', '#3aa6ff', true);
        }, 1800);
      }
    });
  }

  // ---------------------------------------------------------------- zones
  updateZone(dt) {
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0) return;
    this.zoneTimer = 0.5;
    const p = this.player;
    const z = this.map.zoneAt(p.feet, p.inTown);
    const boss = this.bossTarget;
    if (this.bossEngaged && (!boss || !boss.alive || !boss.aggro)) this.bossEngaged = false;
    const indoor = this.map.env.indoor;
    this.audio.setZone(indoor ? 'dungeon' : p.inTown ? 'town' : 'field');
    const game = this.training.active || this.tag.active;
    this.audio.setTheme(this.bossEngaged ? 'boss' : game ? 'game' : this.map.themes[p.inTown ? 'town' : 'field']);
    if (z !== this.zone) {
      this.zone = z;
      this.toasts.push(z, p.inTown ? '안전지대 — HP가 빠르게 회복됩니다' : indoor ? '미궁 — 몬스터에 주의하세요' : '필드 — 몬스터에 주의하세요', p.inTown ? '#3aa6ff' : '#f0a020');
    }
  }

  // ---------------------------------------------------------------- blob shadows
  makeBlobShadows() {
    const max = 110;
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
    const h = this.map.height;
    const put = (x, y, z, s) => {
      if (i >= mesh.instanceMatrix.count) return;
      m.makeScale(s, 1, s);
      m.setPosition(x, y + 0.03, z);
      mesh.setMatrixAt(i++, m);
    };
    for (const mm of this.monsters.list) {
      if (!mm.alive) continue;
      put(mm.pos.x, mm.def.flying ? h(mm.pos.x, mm.pos.z) : mm.pos.y, mm.pos.z, mm.def.shadow * mm.scale * mm.spawnK);
    }
    this.npcs.forEachPos((x, z, s) => put(x, h(x, z), z, s));
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
