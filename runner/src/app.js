// App shell: renderer, screens (title → lobby → race → results), pause,
// quality settings and the main loop.
import * as THREE from 'three';
import { Input } from './core/input.js';
import { GameAudio } from './core/audio.js';
import { store } from './core/store.js';
import { Hud, fmtTime } from './ui/hud.js';
import { Lobby } from './ui/lobby.js';
import { Race } from './game/race.js';
import { MAPS } from './data/maps.js';
import { Bot } from './game/ai.js';
import { rng } from './core/rng.js';

const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export class App {
  constructor() {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.quality = store.get('quality') || (mobile ? 'medium' : 'high');
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('app').appendChild(r.domElement);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 3200);
    this.input = new Input();
    this.audio = new GameAudio();
    this.audio.musicOn = store.get('music') !== false;
    this.audio.sfxOn = store.get('sfx') !== false;
    this.hud = new Hud(document.getElementById('hud'));
    this.screens = {
      title: document.getElementById('title'),
      lobby: document.getElementById('lobby'),
      pause: document.getElementById('pause'),
      results: document.getElementById('results'),
      touch: document.getElementById('touch'),
    };
    this.input.bindTouch(this.screens.touch);
    this.applyQuality();
    this.lobby = new Lobby(this, this.screens.lobby);
    this.screen = 'title';
    this.race = null;
    this.bindScreens();
    window.addEventListener('resize', () => this.resize());
    // browsers only allow audio after a gesture; unlock on the first one
    const unlock = () => this.audio.init();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    this.resize();
    this.last = performance.now();
    r.setAnimationLoop(() => this.loop());
  }

  bindScreens() {
    const S = this.screens;
    S.title.querySelector('.start').addEventListener('click', () => {
      this.audio.init();
      this.audio.sfx('select');
      this.toLobby();
    });
    S.pause.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    S.results.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    document.getElementById('pause-btn').addEventListener('click', () => this.togglePause());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.race && this.race.state !== 'end' && !this.race.paused) this.togglePause();
    });
  }

  act(a) {
    this.audio.sfx('click');
    if (a === 'resume') this.togglePause();
    else if (a === 'retry') this.startRace(this.lastOpts);
    else if (a === 'next') this.startRace({ ...this.lastOpts, mapIdx: (this.lastOpts.mapIdx + 1) % MAPS.length });
    else if (a === 'lobby') this.toLobby();
  }

  setQuality(q) {
    this.quality = q;
    store.set('quality', q);
    this.applyQuality();
  }

  applyQuality() {
    const dpr = window.devicePixelRatio || 1;
    const pr = this.quality === 'high' ? Math.min(dpr, 2) : this.quality === 'medium' ? Math.min(dpr, 1.5) : 1;
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lobby?.resize(w, h);
    this.race?.fx.setViewport(this.renderer.domElement.height);
  }

  show(name) {
    for (const k of ['title', 'lobby', 'pause', 'results']) this.screens[k].classList.toggle('hidden', k !== name);
  }

  toLobby() {
    this.disposeRace();
    this.screen = 'lobby';
    this.show('lobby');
    this.hud.hide();
    this.screens.touch.classList.add('hidden');
    document.getElementById('pause-btn').classList.add('hidden');
    this.lobby.show();
    this.audio.music('lobby');
  }

  disposeRace() {
    if (this.race) {
      this.race.dispose();
      this.race = null;
    }
  }

  startRace(opts) {
    this.audio.init();
    this.lastOpts = opts;
    this.disposeRace();
    this.show(null);
    const map = MAPS[opts.mapIdx];
    this.race = new Race(this, { ...opts, map });
    window.__race = this.race;
    if (opts.auto) {
      // self-test: the player is driven by a bot brain
      this.race.autoPlay = new Bot(this.race.player, this.race, 1, rng(7));
      this.race.player.bot = null;
    }
    this.screen = 'race';
    this.hud.setup(this.race);
    this.screens.touch.classList.toggle('hidden', !isTouch());
    document.getElementById('pause-btn').classList.remove('hidden');
    this.input.clear();
    this.audio.music(map.theme);
  }

  togglePause() {
    const r = this.race;
    if (!r || r.state === 'end') return;
    r.paused = !r.paused;
    this.screens.pause.classList.toggle('hidden', !r.paused);
    this.input.clear();
  }

  onRaceEnd(res) {
    const S = this.screens.results;
    let best = false;
    if (res.time !== null) best = store.submit(res.map.id, res.time, res.solo ? null : res.rank);
    const title = res.time === null ? '시간 초과!' : res.solo ? '완주!' : `${res.rank}위!`;
    S.querySelector('.res-title').textContent = title;
    S.querySelector('.res-title').className = `res-title${res.rank === 1 && !res.solo ? ' gold' : ''}`;
    const rec = store.record(res.map.id);
    S.querySelector('.res-sub').innerHTML = `${res.map.name} · 기록 <b>${fmtTime(res.time)}</b>${best ? ' <span class="new">신기록!</span>' : ''}${rec?.time ? ` · 최고 ${fmtTime(rec.time)}` : ''}`;
    S.querySelector('.res-table').innerHTML = res.rows
      .map(
        (r, i) =>
          `<tr class="${r.isPlayer ? 'me' : ''}"><td class="rk">${r.dnf ? '-' : i + 1}</td><td class="nm">${r.name}${r.isPlayer ? ' (나)' : ''}</td><td class="tt">${r.dnf ? (res.time === null && r.isPlayer ? '시간 초과' : '달리는 중') : fmtTime(r.time)}</td></tr>`
      )
      .join('');
    S.querySelector('[data-act="next"]').textContent = `다음 맵: ${MAPS[(this.lastOpts.mapIdx + 1) % MAPS.length].name}`;
    this.audio.sfx(res.time === null ? 'lose' : 'finish', 0.6);
    setTimeout(() => {
      if (this.race && this.race.state === 'end') this.show('results');
    }, 400);
    this.screens.touch.classList.add('hidden');
  }

  loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.screen === 'race' && this.race) {
      this.race.update(dt);
      this.renderer.render(this.race.scene, this.camera);
    } else {
      this.lobby.update(dt);
      this.renderer.render(this.lobby.scene, this.lobby.cam);
    }
  }
}
