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
import { THEMES } from './data/themes.js';
import { Bot } from './game/ai.js';
import { rng } from './core/rng.js';
import { Post } from './core/post.js';
import { setMaxAnisotropy } from './world/textures.js';

const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

const MODE_NAMES = { speed: '스피드전', item: '아이템전', time: '타임어택' };
const TIPS = [
  '출발 신호 <b>GO!</b>에 맞춰 앞으로 달리면 스타트 대시!',
  '공중에서 한 번 더 점프하면 앞구르기 2단 점프를 해요.',
  '별을 모으면 부스터 게이지가 차요. 반 칸마다 <kbd>Shift</kbd>로 쭉!',
  '길에서 떨어지면 마지막 체크포인트에서 다시 시작해요. <kbd>R</kbd>로 직접 돌아갈 수도 있어요.',
  '요정 방패는 장애물과 공격을 딱 한 번 막아 줘요.',
  '가짜 문은 꽝! 부딪쳐 보고 진짜 문을 찾아요.',
  '움직이는 발판은 다가오는 순간을 노려서 뛰어요.',
  '회전 막대는 점프로 넘거나 바깥쪽으로 피해요.',
  '꿀단지는 뒤에 뿌려져요. 바짝 쫓아오는 친구에게 딱!',
  '체크포인트를 지날 때마다 깃발이 반짝여요. 거기서 다시 시작해요.',
  '마지막 바퀴에선 아이템을 아껴 두었다가 역전을 노려 봐요.',
  '인어의 바닷속에선 몸이 가벼워서 둥실 높이 뛰어요.',
  '빙판에선 미리 방향을 틀어야 미끄러지지 않아요.',
];

export class App {
  constructor() {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.quality = store.get('quality') || (mobile ? 'medium' : 'high');
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    document.getElementById('app').appendChild(r.domElement);
    setMaxAnisotropy(r.capabilities.getMaxAnisotropy());
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
      loading: document.getElementById('loading'),
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
    else if (a === 'retry') this.launch(this.lastOpts);
    else if (a === 'next') this.launch({ ...this.lastOpts, mapIdx: (this.lastOpts.mapIdx + 1) % MAPS.length });
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
    // bloom + grading only on high; others get a CSS vignette instead
    if (this.quality === 'high' && !this.post) {
      try {
        this.post = new Post(this.renderer);
      } catch (e) {
        console.warn('post-processing unavailable', e);
        this.post = null;
      }
    }
    document.body.classList.toggle('fx-high', this.quality === 'high' && !!this.post);
    this.resize();
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.lobby?.resize(w, h);
    this.race?.fx.setViewport(this.renderer.domElement.height);
    this.race?.podium?.resize(w, h, this.renderer.getPixelRatio());
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

  // Title card while the course builds and its shaders compile, so the race
  // opens on a smooth frame. startRace() itself stays synchronous for tests.
  launch(opts) {
    if (this.loading) return;
    this.audio.init();
    const L = this.screens.loading;
    const map = MAPS[opts.mapIdx];
    const th = THEMES[map.theme];
    const css = (c) => `#${new THREE.Color(c).getHexString()}`;
    L.style.setProperty('--ld-a', css(th.sky[0]));
    L.style.setProperty('--ld-b', css(th.sky[2]));
    L.style.setProperty('--ld-c', css(th.accent));
    const q = (s) => L.querySelector(s);
    q('.ld-sub').textContent = `${opts.mapIdx + 1}. ${map.sub}`;
    q('.ld-name').textContent = map.name;
    q('.ld-meta').innerHTML = `<span class="stars">${'★'.repeat(Math.ceil(map.level / 2))}${'☆'.repeat(4 - Math.ceil(map.level / 2))}</span> · ${map.laps}바퀴 · ${MODE_NAMES[opts.mode] || ''}`;
    q('.ld-desc').textContent = map.desc;
    q('.ld-tip').innerHTML = `<b>TIP</b> ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
    const img = q('.ld-runner');
    const pic = this.lobby?.portraits?.[opts.charId];
    if (pic) img.src = pic;
    img.style.display = pic ? '' : 'none';
    const fill = q('.ld-fill');
    fill.style.transition = 'none';
    fill.style.width = '0%';
    L.classList.remove('hidden', 'out');
    void fill.offsetWidth;
    fill.style.transition = 'width 1.2s cubic-bezier(0.2, 0.7, 0.3, 1)';
    fill.style.width = '72%';
    this.show(null);
    this.loading = true;
    const t0 = performance.now();
    // two frames so the card paints before the heavy synchronous build
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        this.startRace(opts);
        try {
          await this.renderer.compileAsync(this.race.scene, this.camera);
        } catch {
          /* precompile is only an optimisation */
        }
        const wait = Math.max(0, 1500 - (performance.now() - t0));
        setTimeout(() => {
          fill.style.transition = 'width 0.3s ease-out';
          fill.style.width = '100%';
        }, Math.max(0, wait - 350));
        setTimeout(() => {
          this.loading = false;
          this.last = performance.now();
          L.classList.add('out');
          setTimeout(() => L.classList.add('hidden'), 450);
        }, wait);
      })
    );
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
    if (res.ghostDelta !== null || res.ghostSaved) {
      const g = res.ghostDelta;
      const txt = g === null ? '' : `고스트보다 <b class="${g < 0 ? 'ahead' : 'behind'}">${g < 0 ? '−' : '+'}${Math.abs(g).toFixed(2)}초</b>`;
      S.querySelector('.res-sub').innerHTML += `<br>${txt}${res.ghostSaved ? `${txt ? ' · ' : ''}새 고스트 저장!` : ''}`;
    }
    S.querySelector('.res-table').innerHTML = res.rows
      .map(
        (r, i) =>
          `<tr class="${r.isPlayer ? 'me' : ''}${r.dnf ? ' dnf' : ''}"><td class="rk">${i + 1}</td><td class="nm">${r.name}${r.isPlayer ? ' (나)' : ''}</td><td class="tt">${r.dnf ? (res.time === null && r.isPlayer ? '시간 초과' : '달리는 중') : fmtTime(r.time)}</td></tr>`
      )
      .join('');
    S.querySelector('[data-act="next"]').innerHTML = `다음 맵 ▶<small>${MAPS[(this.lastOpts.mapIdx + 1) % MAPS.length].name}</small>`;
    this.audio.sfx(res.time === null ? 'lose' : 'finish', 0.6);
    setTimeout(() => {
      if (this.race && this.race.state === 'end') this.show('results');
    }, 900);
    this.screens.touch.classList.add('hidden');
    document.getElementById('pause-btn').classList.add('hidden');
  }

  draw(scene, cam, dt) {
    if (this.post && this.quality === 'high') this.post.render(scene, cam, dt);
    else this.renderer.render(scene, cam);
  }

  loop() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.loading) return;
    if (this.screen === 'race' && this.race) {
      this.race.update(dt);
      const pd = this.race.podium;
      if (pd) this.draw(pd.scene, pd.cam, dt);
      else this.draw(this.race.scene, this.camera, dt);
    } else {
      this.lobby.update(dt);
      this.draw(this.lobby.scene, this.lobby.cam, dt);
    }
  }
}
