// Lobby: character select with a 3D preview on a podium, map select, mode
// and difficulty. Character portraits are rendered once at startup.
import * as THREE from 'three';
import { CHARACTERS, STAT_LABELS, charById } from '../data/characters.js';
import { MAPS } from '../data/maps.js';
import { THEMES } from '../data/themes.js';
import { CharacterModel } from '../game/model.js';
import { toon } from '../world/geom.js';
import { texture } from '../world/textures.js';
import { store } from '../core/store.js';
import { fmtTime } from './hud.js';

const MAP_ICONS = {
  meadow: '🌼',
  candy: '🍭',
  wonder: '🃏',
  beanstalk: '🌱',
  sea: '🐚',
  snow: '❄️',
  oz: '🌪️',
  clock: '🕛',
  desert: '🪔',
  volcano: '🐉',
};

const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

export function renderPortraits() {
  const size = 128;
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(size, size);
  r.setPixelRatio(1);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.4);
  d.position.set(2, 3, 4);
  scene.add(d);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  const out = {};
  for (const ch of CHARACTERS) {
    const m = new CharacterModel(ch);
    m.update(0.016, { mode: 'idle', grounded: true, speed: 0 });
    m.root.rotation.y = -0.35;
    scene.add(m.root);
    const s = ch.scale || 1;
    cam.position.set(0.25, 1.38 * s, 2.6 * s);
    cam.lookAt(0, 1.2 * s, 0);
    r.render(scene, cam);
    out[ch.id] = r.domElement.toDataURL('image/png');
    scene.remove(m.root);
  }
  r.dispose();
  r.forceContextLoss?.();
  return out;
}

export class Lobby {
  constructor(app, root) {
    this.app = app;
    this.root = root;
    this.sel = {
      char: store.get('char') || 'harang',
      map: Math.min(MAPS.length - 1, store.get('map') || 0),
      mode: store.get('mode') || 'speed',
      diff: store.get('diff') || 'normal',
    };
    this.buildScene();
    this.portraits = renderPortraits();
    this.buildDom();
    this.select(this.sel.char, true);
  }

  buildScene() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0xbfe6ff);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(80, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 a = vec3(0.98,0.84,0.92); vec3 b = vec3(0.55,0.78,1.0); gl_FragColor = vec4(mix(a, b, smoothstep(-0.1, 0.6, h)), 1.0); }',
      })
    );
    s.add(sky);
    s.add(new THREE.HemisphereLight(0xffffff, 0xb0a0c0, 1.8));
    const d = new THREE.DirectionalLight(0xfff4e0, 2.2);
    d.position.set(3, 6, 4);
    d.castShadow = true;
    d.shadow.mapSize.set(1024, 1024);
    const sc = d.shadow.camera;
    sc.left = sc.bottom = -4;
    sc.right = sc.top = 4;
    s.add(d);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.5, 40), [toon({ color: 0xffd23f }), toon({ map: texture('checker') }), toon({ color: 0xffd23f })]);
    ped.position.y = -0.25;
    ped.receiveShadow = true;
    s.add(ped);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7, 0.08, 8, 48), toon({ color: 0xff6a3d }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.02;
    s.add(ring);
    // floating confetti blocks
    this.floaters = [];
    const cols = [0xff8fc8, 0x7fd4ff, 0xffe066, 0x9be07b, 0xd9a3ff];
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(i % 2 ? new THREE.OctahedronGeometry(0.18) : new THREE.SphereGeometry(0.15, 10, 8), toon({ color: cols[i % cols.length] }));
      const a = (i / 18) * Math.PI * 2;
      m.position.set(Math.cos(a) * (3 + (i % 3)), 0.5 + (i % 5) * 0.6, Math.sin(a) * (3 + (i % 3)) - 2);
      m.userData.y = m.position.y;
      m.userData.p = i;
      s.add(m);
      this.floaters.push(m);
    }
    this.holder = new THREE.Group();
    s.add(this.holder);
    this.cam = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.yaw = -0.3;
    this.drag = null;
  }

  buildDom() {
    const R = this.root;
    R.innerHTML = `
      <header class="lb-top">
        <div class="logo">동화나라 <b>런너즈</b></div>
        <div class="lb-opts">
          <button class="opt" data-opt="music" title="음악">🎵</button>
          <button class="opt" data-opt="sfx" title="효과음">🔊</button>
          <div class="seg small" data-seg="quality">
            <button data-v="low">낮음</button><button data-v="medium">보통</button><button data-v="high">높음</button>
          </div>
        </div>
      </header>
      <div class="lb-spacer"></div>
      <section class="lb-chars panel">
        <h2>캐릭터</h2>
        <div class="char-list"></div>
      </section>
      <section class="lb-info panel">
        <div class="ci-head"><span class="ci-name"></span><span class="ci-title"></span></div>
        <div class="ci-stats"></div>
        <p class="ci-desc"></p>
      </section>
      <section class="lb-maps panel">
        <h2>맵 선택</h2>
        <p class="map-desc"></p>
        <div class="map-list"></div>
      </section>
      <footer class="lb-bottom panel">
        <div class="seg" data-seg="mode">
          <button data-v="speed">스피드전</button><button data-v="item">아이템전</button><button data-v="time">타임어택</button>
        </div>
        <div class="seg" data-seg="diff">
          <button data-v="easy">쉬움</button><button data-v="normal">보통</button><button data-v="hard">어려움</button>
        </div>
        <button class="go">출발!</button>
      </footer>
    `;
    const list = R.querySelector('.char-list');
    for (const ch of CHARACTERS) {
      const b = document.createElement('button');
      b.className = 'char-card';
      b.dataset.id = ch.id;
      b.style.setProperty('--c', hexCss(ch.colors.top));
      b.innerHTML = `<img alt="" src="${this.portraits[ch.id]}"><span>${ch.name}</span>`;
      b.addEventListener('click', () => {
        this.app.audio.sfx('select');
        this.select(ch.id);
      });
      list.appendChild(b);
    }
    const ml = R.querySelector('.map-list');
    MAPS.forEach((m, i) => {
      const th = THEMES[m.theme];
      const b = document.createElement('button');
      b.className = 'map-card';
      b.dataset.i = i;
      b.style.setProperty('--a', hexCss(th.sky[0]));
      b.style.setProperty('--b', hexCss(th.sky[1]));
      b.innerHTML = `<span class="mi">${MAP_ICONS[m.id] || '⭐'}</span><span class="mt"><b>${i + 1}. ${m.name}</b><small>${m.sub} · ${'★'.repeat(m.level)}</small></span><span class="mr"></span>`;
      b.addEventListener('click', () => {
        this.app.audio.sfx('click');
        this.sel.map = i;
        store.set('map', i);
        this.refresh();
      });
      ml.appendChild(b);
    });
    R.querySelectorAll('[data-seg]').forEach((seg) => {
      const key = seg.dataset.seg;
      seg.querySelectorAll('button').forEach((b) =>
        b.addEventListener('click', () => {
          this.app.audio.sfx('click');
          if (key === 'quality') this.app.setQuality(b.dataset.v);
          else {
            this.sel[key] = b.dataset.v;
            store.set(key, b.dataset.v);
          }
          this.refresh();
        })
      );
    });
    R.querySelectorAll('[data-opt]').forEach((b) =>
      b.addEventListener('click', () => {
        const k = b.dataset.opt;
        const v = !store.get(k);
        store.set(k, v);
        if (k === 'music') this.app.audio.setMusic(v);
        else this.app.audio.setSfx(v);
        this.app.audio.sfx('click');
        this.refresh();
      })
    );
    R.querySelector('.go').addEventListener('click', () => {
      this.app.audio.sfx('select');
      this.app.launch({ mapIdx: this.sel.map, charId: this.sel.char, mode: this.sel.mode, diff: this.sel.diff });
    });
    // drag to spin the preview
    const cv = this.app.renderer.domElement;
    cv.addEventListener('pointerdown', (e) => {
      if (this.app.screen !== 'lobby') return;
      this.drag = { x: e.clientX, yaw: this.yaw };
    });
    window.addEventListener('pointermove', (e) => {
      if (this.drag) this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.012;
    });
    window.addEventListener('pointerup', () => (this.drag = null));
    this.refresh();
  }

  select(id, silent) {
    this.sel.char = id;
    store.set('char', id);
    const ch = charById(id);
    if (this.model) this.holder.remove(this.model.root);
    this.model = new CharacterModel(ch);
    this.model.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    this.holder.add(this.model.root);
    if (!silent) this.spin = 1;
    const R = this.root;
    R.querySelector('.ci-name').textContent = ch.name;
    R.querySelector('.ci-title').textContent = ch.title;
    R.querySelector('.ci-desc').textContent = ch.desc;
    R.querySelector('.ci-stats').innerHTML = Object.keys(STAT_LABELS)
      .map((k) => `<div class="st"><span>${STAT_LABELS[k]}</span><div class="bar">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= ch.stats[k] ? 'on' : ''}"></i>`).join('')}</div></div>`)
      .join('');
    this.refresh();
  }

  refresh() {
    const R = this.root;
    R.querySelectorAll('.char-card').forEach((b) => b.classList.toggle('on', b.dataset.id === this.sel.char));
    R.querySelectorAll('.map-card').forEach((b) => {
      const i = +b.dataset.i;
      b.classList.toggle('on', i === this.sel.map);
      const rec = store.record(MAPS[i].id);
      b.querySelector('.mr').innerHTML = rec ? `${rec.rank === 1 ? '🏆' : rec.rank ? `${rec.rank}위` : ''}<small>${fmtTime(rec.time)}</small>` : '';
    });
    const segs = { mode: this.sel.mode, diff: this.sel.diff, quality: this.app.quality };
    R.querySelectorAll('[data-seg]').forEach((seg) => {
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === segs[seg.dataset.seg]));
    });
    R.querySelector('[data-seg="diff"]').classList.toggle('dim', this.sel.mode === 'time');
    R.querySelectorAll('[data-opt]').forEach((b) => b.classList.toggle('off', !store.get(b.dataset.opt)));
    R.querySelector('.map-desc').textContent = MAPS[this.sel.map].desc;
    const sel = R.querySelector('.map-card.on');
    sel?.scrollIntoView?.({ block: 'nearest' });
  }

  show() {
    this.root.classList.remove('hidden');
    this.refresh();
  }
  hide() {
    this.root.classList.add('hidden');
  }

  resize(w, h) {
    this.cam.aspect = w / h;
    // keep the character in the free middle area on wide screens, upper area on tall ones
    const tall = h > w * 1.1 || w <= 900;
    this.cam.fov = tall ? 50 : 30;
    // on narrow screens the preview sits in the strip under the header
    if (tall) this.cam.setViewOffset(w, h, 0, h * 0.27, w, h);
    else this.cam.clearViewOffset();
    this.cam.updateProjectionMatrix();
    this.tall = tall;
  }

  update(dt) {
    const m = this.model;
    if (this.spin) {
      this.spin = Math.max(0, this.spin - dt * 1.5);
    }
    if (!this.drag) this.yaw += dt * 0.25;
    this.holder.rotation.y = this.yaw + (this.spin ? (1 - this.spin) * Math.PI * 2 : 0);
    m?.update(dt, { mode: 'lobby', grounded: true, speed: 0 });
    for (const f of this.floaters) {
      f.position.y = f.userData.y + Math.sin(performance.now() * 0.001 + f.userData.p) * 0.2;
      f.rotation.y += dt;
    }
    if (this.tall) {
      this.cam.position.set(0, 2.2, 7.6);
      this.cam.lookAt(0, 0.45, 0);
    } else {
      this.cam.position.set(0, 1.9, 8.6);
      this.cam.lookAt(0, 0.7, 0);
    }
  }
}
