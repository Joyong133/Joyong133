// In-world UI rendered to canvas textures: SAO-style HUD, the ring menu,
// NPC dialogs, toasts, damage numbers, prompts and full-view fades.
import * as THREE from 'three';

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif';
const C = {
  panel: 'rgba(248,249,251,0.94)',
  panelEdge: 'rgba(255,255,255,0.9)',
  ink: '#262c37',
  muted: '#7b8391',
  accent: '#f0a020',
  accentDark: '#c77f0c',
  blue: '#3aa6ff',
  line: 'rgba(38,44,55,0.12)',
};

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function wrapText(g, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const ch of para) {
      const test = line + ch;
      if (g.measureText(test).width > maxW && line) {
        // try to break on space
        const sp = line.lastIndexOf(' ');
        if (sp > line.length * 0.6) {
          lines.push(line.slice(0, sp));
          line = line.slice(sp + 1) + ch;
        } else {
          lines.push(line);
          line = ch;
        }
      } else line = test;
    }
    lines.push(line);
  }
  return lines;
}

export class CanvasPlane {
  constructor(w, h, worldW, { depthTest = false, order = 20, transparent = true } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const worldH = (worldW * h) / w;
    this.material = new THREE.MeshBasicMaterial({ map: this.tex, transparent, depthTest, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), this.material);
    this.mesh.renderOrder = order;
    this.mesh.frustumCulled = false;
    this.w = w;
    this.h = h;
    this.worldW = worldW;
    this.worldH = worldH;
  }
  draw(fn) {
    this.g.clearRect(0, 0, this.w, this.h);
    fn(this.g, this.w, this.h);
    this.tex.needsUpdate = true;
  }
  // convert a raycast uv hit into canvas pixels
  uvToPx(uv) {
    return { x: uv.x * this.w, y: (1 - uv.y) * this.h };
  }
}

// ------------------------------------------------------------------ icons
function drawIcon(g, kind, cx, cy, s, color) {
  g.save();
  g.translate(cx, cy);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = s * 0.09;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (kind === 'status') {
    g.beginPath(); g.arc(0, -s * 0.18, s * 0.17, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, s * 0.42, s * 0.33, Math.PI * 1.08, Math.PI * 1.92); g.lineTo(s * 0.3, s * 0.3); g.fill();
  } else if (kind === 'items') {
    roundRect(g, -s * 0.3, -s * 0.12, s * 0.6, s * 0.46, s * 0.08); g.stroke();
    g.beginPath(); g.arc(0, -s * 0.12, s * 0.14, Math.PI, 0); g.stroke();
    g.beginPath(); g.moveTo(-s * 0.3, s * 0.06); g.lineTo(s * 0.3, s * 0.06); g.stroke();
  } else if (kind === 'quest') {
    roundRect(g, -s * 0.24, -s * 0.34, s * 0.48, s * 0.64, s * 0.06); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.13, -s * 0.16 + i * s * 0.16); g.lineTo(s * 0.13, -s * 0.16 + i * s * 0.16); g.stroke(); }
  } else if (kind === 'settings') {
    for (let i = 0; i < 8; i++) {
      g.save(); g.rotate((i / 8) * Math.PI * 2);
      g.fillRect(-s * 0.06, -s * 0.36, s * 0.12, s * 0.14);
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, s * 0.24, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(0, 0, s * 0.09, 0, Math.PI * 2); g.fill();
  } else if (kind === 'logout') {
    g.beginPath(); g.arc(0, s * 0.03, s * 0.27, -Math.PI * 0.32, Math.PI * 1.32); g.stroke();
    g.beginPath(); g.moveTo(0, -s * 0.36); g.lineTo(0, -s * 0.02); g.stroke();
  }
  g.restore();
}

// ------------------------------------------------------------------ HUD
export class HUD {
  constructor() {
    this.group = new THREE.Group();
    this.main = new CanvasPlane(1024, 300, 0.56, { order: 30 });
    this.group.add(this.main.mesh);
    this.key = '';
    this.shake = 0;
    this.visible = true;
  }

  render(s) {
    const key = [s.name, Math.ceil(s.hp), s.maxHp, s.level, Math.floor(s.expFrac * 200), s.potions, s.questText, s.zone, s.col, s.skillReady, s.safe].join('|');
    if (key === this.key) return;
    this.key = key;
    this.main.draw((g, W) => {
      // name tag
      g.font = `700 34px ${FONT}`;
      const nameW = Math.max(150, g.measureText(s.name).width + 50);
      g.fillStyle = 'rgba(22,26,34,0.72)';
      roundRect(g, 8, 18, nameW, 62, 10);
      g.fill();
      g.fillStyle = '#fff';
      g.fillText(s.name, 30, 62);
      // HP bar frame (slanted end like the classic VRMMO HUD)
      const x0 = nameW + 22, y0 = 22, bw = W - x0 - 20, bh = 54;
      g.save();
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + bw, y0);
      g.lineTo(x0 + bw - 28, y0 + bh);
      g.lineTo(x0, y0 + bh);
      g.closePath();
      g.fillStyle = 'rgba(22,26,34,0.72)';
      g.fill();
      g.clip();
      const f = Math.max(0, s.hp / s.maxHp);
      const col = f > 0.5 ? ['#6fe07a', '#2fb44a'] : f > 0.2 ? ['#ffe066', '#e0a800'] : ['#ff7a6b', '#d9302a'];
      const grd = g.createLinearGradient(0, y0, 0, y0 + bh);
      grd.addColorStop(0, col[0]);
      grd.addColorStop(1, col[1]);
      g.fillStyle = grd;
      g.fillRect(x0 + 6, y0 + 8, (bw - 12) * f, bh - 16);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x0 + 6, y0 + 8, (bw - 12) * f, (bh - 16) * 0.4);
      g.restore();
      g.strokeStyle = 'rgba(255,255,255,0.85)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + bw, y0);
      g.lineTo(x0 + bw - 28, y0 + bh);
      g.lineTo(x0, y0 + bh);
      g.closePath();
      g.stroke();
      // HP numbers + level
      g.font = `700 30px ${FONT}`;
      g.fillStyle = '#fff';
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 5;
      const hpTxt = `${Math.ceil(s.hp)} / ${s.maxHp}`;
      g.strokeText(hpTxt, x0 + bw - 250, y0 + bh + 38);
      g.fillText(hpTxt, x0 + bw - 250, y0 + bh + 38);
      const lvTxt = `Lv ${s.level}`;
      g.strokeText(lvTxt, x0 + bw - 90, y0 + bh + 38);
      g.fillText(lvTxt, x0 + bw - 90, y0 + bh + 38);
      // EXP bar
      g.fillStyle = 'rgba(22,26,34,0.6)';
      g.fillRect(x0, y0 + bh + 6, bw - 290, 10);
      g.fillStyle = C.blue;
      g.fillRect(x0, y0 + bh + 6, (bw - 290) * s.expFrac, 10);
      // info line
      g.font = `600 27px ${FONT}`;
      const line = `${s.safe ? '안전지대 · ' : ''}${s.zone}   ·   포션 ${s.potions}   ·   ${s.col} Col`;
      g.lineWidth = 5;
      g.strokeText(line, 14, 162);
      g.fillStyle = '#fff';
      g.fillText(line, 14, 162);
      if (s.questText) {
        g.font = `700 28px ${FONT}`;
        g.fillStyle = 'rgba(22,26,34,0.62)';
        const qw = g.measureText(s.questText).width + 60;
        roundRect(g, 8, 184, qw, 50, 10);
        g.fill();
        g.fillStyle = C.accent;
        g.fillRect(8, 184, 8, 50);
        g.fillStyle = '#fff';
        g.fillText(s.questText, 34, 219);
      }
      if (s.skillReady) {
        g.font = `800 28px ${FONT}`;
        g.fillStyle = '#9fe0ff';
        g.strokeText('SWORD SKILL READY', 14, 280);
        g.fillText('SWORD SKILL READY', 14, 280);
      }
    });
  }
}

// ------------------------------------------------------------------ toasts
export class Toasts {
  constructor() {
    this.plane = new CanvasPlane(1024, 220, 0.7, { order: 31 });
    this.queue = [];
    this.cur = null;
    this.t = 0;
    this.baseScale = 1;
    this.plane.mesh.visible = false;
  }
  push(title, sub = '', color = C.accent, big = false) {
    this.queue.push({ title, sub, color, big });
  }
  update(dt) {
    if (!this.cur && this.queue.length) {
      this.cur = this.queue.shift();
      this.t = 0;
      const { title, sub, color, big } = this.cur;
      this.plane.draw((g, W, H) => {
        g.font = `800 ${big ? 78 : 56}px ${FONT}`;
        const tw = g.measureText(title).width;
        g.font = `600 32px ${FONT}`;
        const sw = sub ? g.measureText(sub).width : 0;
        const w = Math.min(W - 20, Math.max(tw, sw) + 100);
        const x = (W - w) / 2;
        g.fillStyle = 'rgba(248,249,251,0.93)';
        roundRect(g, x, 20, w, sub ? 180 : 130, 18);
        g.fill();
        g.fillStyle = color;
        g.fillRect(x, 20, w, 7);
        g.textAlign = 'center';
        g.fillStyle = C.ink;
        g.font = `800 ${big ? 78 : 56}px ${FONT}`;
        g.fillText(title, W / 2, big ? 112 : 102);
        if (sub) {
          g.font = `600 32px ${FONT}`;
          g.fillStyle = C.muted;
          g.fillText(sub, W / 2, 168);
        }
      });
    }
    if (this.cur) {
      this.t += dt;
      const dur = this.cur.big ? 3.2 : 2.4;
      const a = Math.min(1, this.t * 5) * Math.min(1, (dur - this.t) * 3);
      this.plane.material.opacity = Math.max(0, a);
      this.plane.mesh.visible = a > 0.01;
      this.plane.mesh.scale.setScalar(this.baseScale * (0.92 + 0.08 * Math.min(1, this.t * 6)));
      if (this.t >= dur) this.cur = null;
    }
  }
}

// ------------------------------------------------------------------ floating damage numbers
export class DamageNumbers {
  constructor(scene, n = 14) {
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 112;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
      s.renderOrder = 40;
      s.visible = false;
      s.scale.set(0.9, 0.39, 1);
      scene.add(s);
      this.pool.push({ s, c, tex, t: 0, life: 0, vel: new THREE.Vector3() });
    }
    this.i = 0;
  }
  spawn(pos, text, color = '#ffffff', size = 1) {
    const p = this.pool[this.i++ % this.pool.length];
    const g = p.c.getContext('2d');
    g.clearRect(0, 0, 256, 112);
    g.font = `900 72px ${FONT}`;
    g.textAlign = 'center';
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(0,0,0,0.7)';
    g.strokeText(text, 128, 82);
    g.fillStyle = color;
    g.fillText(text, 128, 82);
    p.tex.needsUpdate = true;
    p.s.position.copy(pos);
    p.s.visible = true;
    p.t = 0;
    p.life = 1.1;
    p.size = size;
    p.vel.set((Math.random() - 0.5) * 0.6, 1.3, (Math.random() - 0.5) * 0.6);
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.s.visible) continue;
      p.t += dt;
      p.s.position.addScaledVector(p.vel, dt);
      p.vel.y -= dt * 1.5;
      const k = p.t / p.life;
      p.s.material.opacity = 1 - k * k;
      const sc = p.size * (0.7 + 0.5 * Math.min(1, p.t * 8) - 0.2 * k);
      p.s.scale.set(0.9 * sc, 0.39 * sc, 1);
      if (p.t >= p.life) p.s.visible = false;
    }
  }
}

// ------------------------------------------------------------------ prompt sprite ("[A] 대화")
export function makePrompt(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, fog: false, toneMapped: false }));
  s.renderOrder = 35;
  s.scale.set(0.8, 0.15, 1);
  const set = (t) => {
    const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 96);
    g.font = `700 40px ${FONT}`;
    const w = g.measureText(t).width + 50;
    g.fillStyle = 'rgba(22,26,34,0.75)';
    roundRect(g, (512 - w) / 2, 12, w, 70, 35);
    g.fill();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.fillText(t, 256, 61);
    tex.needsUpdate = true;
  };
  set(text);
  s.userData.set = set;
  return s;
}

// ------------------------------------------------------------------ fader (black / red / white)
export class Fader {
  constructor(camera) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), this.mat);
    this.mesh.renderOrder = 100;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
    this.target = 0;
    this.speed = 2;
    this.flash = 0;
    this.flashColor = new THREE.Color();
    this.base = new THREE.Color(0x000000);
  }
  to(opacity, speed = 2, color = 0x000000) {
    this.target = opacity;
    this.speed = speed;
    this.base.set(color);
  }
  hit(color = 0xff2020, amount = 0.45) {
    this.flash = amount;
    this.flashColor.set(color);
  }
  update(dt) {
    const o = this.mat.opacity;
    const baseO = o + Math.sign(this.target - o) * Math.min(Math.abs(this.target - o), dt * this.speed);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    if (this.flash > 0 && baseO < this.flash) {
      this.mat.color.copy(this.flashColor);
      this.mat.opacity = this.flash;
      this._base = baseO;
    } else {
      this.mat.color.copy(this.base);
      this.mat.opacity = baseO;
    }
    this.mesh.visible = this.mat.opacity > 0.002;
  }
}

// ------------------------------------------------------------------ comfort vignette
export class Vignette {
  constructor(camera) {
    this.mat = new THREE.ShaderMaterial({
      uniforms: { amount: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float amount; varying vec2 vUv;
        void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0 - amount * 0.55, 1.05 - amount * 0.35, r); gl_FragColor = vec4(0.0,0.0,0.0,a * min(1.0, amount * 1.5)); }`,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), this.mat);
    this.mesh.position.z = -0.12;
    this.mesh.renderOrder = 99;
    this.mesh.frustumCulled = false;
    camera.add(this.mesh);
    this.cur = 0;
    this.enabled = true;
  }
  update(dt, target) {
    const t = this.enabled ? target : 0;
    this.cur += (t - this.cur) * Math.min(1, dt * 8);
    this.mat.uniforms.amount.value = this.cur;
    this.mesh.visible = this.cur > 0.01;
  }
}

// ------------------------------------------------------------------ ring menu
const TABS = [
  { id: 'status', label: '상태' },
  { id: 'items', label: '아이템' },
  { id: 'quest', label: '퀘스트' },
  { id: 'settings', label: '설정' },
  { id: 'logout', label: '로그아웃' },
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.group.visible = false;
    this.open = false;
    this.tab = 'status';
    this.anim = 0;
    this.buttons = [];
    TABS.forEach((t, i) => {
      const cp = new CanvasPlane(160, 160, 0.105, { order: 50 });
      cp.mesh.userData = { kind: 'tab', id: t.id };
      cp.mesh.position.set(-0.46, 0.2 - i * 0.12, 0);
      this.group.add(cp.mesh);
      this.buttons.push({ ...t, cp, hover: 0 });
    });
    this.panel = new CanvasPlane(900, 640, 0.68, { order: 50 });
    this.panel.mesh.position.set(0, -0.03, 0);
    this.panel.mesh.userData = { kind: 'panel' };
    this.group.add(this.panel.mesh);
    this.regions = [];
    this.hoverRegion = null;
    this.hoverTab = null;
    this.confirmLogout = false;
  }

  drawButton(b, sel, hover) {
    b.cp.draw((g, W, H) => {
      const r = W / 2 - 8;
      g.beginPath();
      g.arc(W / 2, H / 2, r, 0, Math.PI * 2);
      g.fillStyle = sel ? C.accent : hover ? '#ffffff' : 'rgba(248,249,251,0.92)';
      g.fill();
      g.lineWidth = 5;
      g.strokeStyle = sel ? '#fff' : hover ? C.accent : 'rgba(255,255,255,0.9)';
      g.stroke();
      drawIcon(g, b.id, W / 2, H / 2, W * 0.7, sel ? '#fff' : C.muted);
    });
  }

  show(pos, yaw) {
    this.open = true;
    this.anim = 0;
    this.confirmLogout = false;
    this.group.visible = true;
    this.group.position.copy(pos);
    this.group.rotation.set(0, yaw, 0);
    this.refresh();
  }

  hide() {
    this.open = false;
  }

  refresh() {
    this.buttons.forEach((b) => this.drawButton(b, b.id === this.tab, this.hoverTab === b.id));
    this.drawPanel();
  }

  drawPanel() {
    const s = this.game.stats();
    const regions = (this.regions = []);
    const btn = (g, x, y, w, h, label, id, primary = false, disabled = false) => {
      const hov = this.hoverRegion === id;
      roundRect(g, x, y, w, h, 12);
      g.fillStyle = disabled ? '#e4e7ec' : primary ? (hov ? C.accentDark : C.accent) : hov ? '#eef1f5' : '#ffffff';
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = primary ? 'rgba(0,0,0,0)' : C.line;
      g.stroke();
      g.fillStyle = disabled ? C.muted : primary ? '#fff' : C.ink;
      g.font = `700 30px ${FONT}`;
      g.textAlign = 'center';
      g.fillText(label, x + w / 2, y + h / 2 + 11);
      g.textAlign = 'left';
      if (!disabled) regions.push({ id, x, y, w, h });
    };
    this.panel.draw((g, W, H) => {
      g.fillStyle = C.panel;
      roundRect(g, 0, 0, W, H, 22);
      g.fill();
      g.fillStyle = C.accent;
      g.fillRect(0, 0, W, 8);
      const tab = TABS.find((t) => t.id === this.tab);
      g.fillStyle = C.ink;
      g.font = `800 44px ${FONT}`;
      g.fillText(tab.label, 40, 76);
      g.fillStyle = C.line;
      g.fillRect(40, 100, W - 80, 2);
      g.font = `600 30px ${FONT}`;
      const row = (y, k, v) => {
        g.fillStyle = C.muted;
        g.fillText(k, 40, y);
        g.fillStyle = C.ink;
        g.textAlign = 'right';
        g.fillText(v, W - 40, y);
        g.textAlign = 'left';
      };
      if (this.tab === 'status') {
        row(160, '이름', s.name);
        row(210, '레벨', `Lv ${s.level}`);
        row(260, 'HP', `${Math.ceil(s.hp)} / ${s.maxHp}`);
        row(310, '경험치', `${s.exp} / ${s.expNext}`);
        g.fillStyle = '#e4e7ec';
        g.fillRect(40, 330, W - 80, 12);
        g.fillStyle = C.blue;
        g.fillRect(40, 330, (W - 80) * s.expFrac, 12);
        row(400, '공격력', `${s.atk}`);
        row(450, '장비', s.swordName);
        row(500, '처치 수', `${s.kills}`);
        row(550, '소지금', `${s.col} Col`);
      } else if (this.tab === 'items') {
        g.fillStyle = C.ink;
        g.font = `700 34px ${FONT}`;
        g.fillText(`회복 포션  ×${s.potions}`, 40, 170);
        g.font = `500 26px ${FONT}`;
        g.fillStyle = C.muted;
        g.fillText('HP를 120 회복합니다. (VR: X 버튼 / PC: Q)', 40, 212);
        btn(g, W - 230, 132, 190, 64, '사용', 'usePotion', true, s.potions <= 0);
        g.fillStyle = C.line;
        g.fillRect(40, 250, W - 80, 2);
        g.fillStyle = C.ink;
        g.font = `700 34px ${FONT}`;
        g.fillText(s.swordName, 40, 310);
        g.font = `500 26px ${FONT}`;
        g.fillStyle = C.muted;
        const lines = wrapText(g, s.swordDesc, W - 80);
        lines.forEach((l, i) => g.fillText(l, 40, 352 + i * 36));
      } else if (this.tab === 'quest') {
        const q = s.quest;
        if (!q) {
          g.fillStyle = C.muted;
          g.fillText('진행 중인 퀘스트가 없습니다.', 40, 170);
          g.fillText('광장의 기사 “엘렌”에게 말을 걸어보세요.', 40, 215);
        } else {
          g.fillStyle = C.ink;
          g.font = `800 36px ${FONT}`;
          g.fillText(q.title, 40, 170);
          g.font = `500 27px ${FONT}`;
          g.fillStyle = C.muted;
          wrapText(g, q.desc, W - 80).forEach((l, i) => g.fillText(l, 40, 218 + i * 38));
          g.fillStyle = C.ink;
          g.font = `700 32px ${FONT}`;
          g.fillText(q.progressText, 40, 420);
          g.fillStyle = '#e4e7ec';
          g.fillRect(40, 440, W - 80, 14);
          g.fillStyle = q.done ? '#2fb44a' : C.accent;
          g.fillRect(40, 440, (W - 80) * Math.min(1, q.progress / q.need), 14);
          if (q.done) {
            g.fillStyle = '#2fb44a';
            g.fillText('완료! 엘렌에게 보고하세요.', 40, 510);
          }
        }
      } else if (this.tab === 'settings') {
        const set = this.game.settings;
        const opt = (y, label, id, value) => {
          g.fillStyle = C.ink;
          g.font = `600 30px ${FONT}`;
          g.fillText(label, 40, y + 42);
          btn(g, W - 300, y, 260, 62, value, id);
        };
        opt(130, '회전 방식', 'turn', set.snapTurn ? '스냅 30°' : '부드럽게');
        opt(210, '이동 시 비네트', 'vignette', set.vignette ? '켜기' : '끄기');
        opt(290, '배경 음악', 'music', set.music ? '켜기' : '끄기');
        opt(370, '검 각도', 'swordAngle', `${set.swordAngle}°`);
        opt(450, '검을 쥘 손', 'hand', set.mainHand === 'right' ? '오른손' : '왼손');
        opt(530, '이동 방향 기준', 'moveRef', set.moveRef === 'head' ? '머리' : '컨트롤러');
      } else if (this.tab === 'logout') {
        g.fillStyle = C.ink;
        g.font = `600 32px ${FONT}`;
        if (!this.confirmLogout) {
          g.fillText('게임에서 로그아웃합니다.', 40, 175);
          g.fillStyle = C.muted;
          g.font = `500 26px ${FONT}`;
          g.fillText('진행 상황(레벨, 아이템, 퀘스트)은 이 기기에 저장됩니다.', 40, 220);
          btn(g, 40, 280, 300, 72, '로그아웃', 'logout', true);
        } else {
          g.fillText('…로그아웃 버튼이 사라지지는 않았습니다. 다행이네요.', 40, 175);
          g.fillStyle = C.muted;
          g.font = `500 26px ${FONT}`;
          g.fillText('정말 로그아웃 하시겠습니까?', 40, 220);
          btn(g, 40, 280, 220, 72, '예', 'logoutYes', true);
          btn(g, 290, 280, 220, 72, '아니오', 'logoutNo');
        }
      }
      g.font = `500 22px ${FONT}`;
      g.fillStyle = C.muted;
      g.fillText('B / Y 버튼 (PC: Tab) 으로 닫기', 40, H - 28);
    });
  }

  // pointer hit: returns true if the hit changed hover state
  pointer(hit, click) {
    let tab = null, region = null;
    if (hit) {
      const ud = hit.object.userData;
      if (ud.kind === 'tab') tab = ud.id;
      else if (ud.kind === 'panel' && hit.uv) {
        const p = this.panel.uvToPx(hit.uv);
        region = this.regions.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)?.id || null;
      }
    }
    let dirty = false;
    if (tab !== this.hoverTab || region !== this.hoverRegion) {
      this.hoverTab = tab;
      this.hoverRegion = region;
      dirty = true;
      if (tab || region) this.game.audio.play('click', { vol: 0.35 });
    }
    if (click) {
      if (tab) {
        this.tab = tab;
        this.confirmLogout = false;
        this.game.audio.play('select', { vol: 0.6 });
        dirty = true;
      } else if (region) {
        this.game.onMenuAction(region);
        dirty = true;
      }
    }
    if (dirty) this.refresh();
    return !!(tab || region);
  }

  update(dt) {
    if (this.open) this.anim = Math.min(1, this.anim + dt * 4);
    else this.anim = Math.max(0, this.anim - dt * 6);
    this.group.visible = this.anim > 0.001;
    const e = 1 - Math.pow(1 - this.anim, 3);
    this.buttons.forEach((b, i) => {
      const k = Math.min(1, Math.max(0, e * 1.6 - i * 0.12));
      b.cp.mesh.position.x = -0.46 - (1 - k) * 0.12;
      b.cp.material.opacity = k;
      b.cp.mesh.scale.setScalar(0.6 + 0.4 * k);
    });
    this.panel.material.opacity = Math.max(0, e * 1.3 - 0.3);
    this.panel.mesh.scale.set(0.9 + 0.1 * e, 0.6 + 0.4 * e, 1);
  }

  interactive() {
    return [...this.buttons.map((b) => b.cp.mesh), this.panel.mesh];
  }
}

// ------------------------------------------------------------------ NPC dialog
export class Dialog {
  constructor(game) {
    this.game = game;
    this.cp = new CanvasPlane(900, 460, 0.72, { order: 45 });
    this.cp.mesh.visible = false;
    this.cp.mesh.userData = { kind: 'dialog' };
    this.open = false;
    this.options = [];
    this.regions = [];
    this.hover = null;
  }
  show(pos, lookAt, name, text, options) {
    this.open = true;
    this.name = name;
    this.text = text;
    this.options = options;
    this.hover = null;
    this.cp.mesh.visible = true;
    this.cp.mesh.position.copy(pos);
    this.cp.mesh.lookAt(lookAt);
    this.draw();
  }
  hide() {
    this.open = false;
    this.cp.mesh.visible = false;
  }
  draw() {
    this.regions = [];
    this.cp.draw((g, W, H) => {
      g.fillStyle = C.panel;
      roundRect(g, 0, 0, W, H, 20);
      g.fill();
      g.fillStyle = C.accent;
      g.fillRect(0, 0, W, 8);
      g.fillStyle = C.ink;
      g.font = `800 38px ${FONT}`;
      g.fillText(this.name, 36, 66);
      g.font = `500 29px ${FONT}`;
      g.fillStyle = '#3a4150';
      wrapText(g, this.text, W - 72).slice(0, 5).forEach((l, i) => g.fillText(l, 36, 118 + i * 40));
      const n = this.options.length;
      const bw = (W - 72 - (n - 1) * 16) / n;
      this.options.forEach((o, i) => {
        const x = 36 + i * (bw + 16), y = H - 100, h = 66;
        const hov = this.hover === i;
        roundRect(g, x, y, bw, h, 12);
        g.fillStyle = i === 0 ? (hov ? C.accentDark : C.accent) : hov ? '#eef1f5' : '#fff';
        g.fill();
        g.strokeStyle = C.line;
        g.lineWidth = 2;
        if (i !== 0) g.stroke();
        g.fillStyle = i === 0 ? '#fff' : C.ink;
        g.font = `700 28px ${FONT}`;
        g.textAlign = 'center';
        g.fillText(`${o.label}`, x + bw / 2, y + 43);
        g.textAlign = 'left';
        this.regions.push({ i, x, y, w: bw, h });
      });
    });
  }
  pointer(hit, click) {
    let idx = null;
    if (hit && hit.object === this.cp.mesh && hit.uv) {
      const p = this.cp.uvToPx(hit.uv);
      const r = this.regions.find((r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
      idx = r ? r.i : null;
    }
    if (idx !== this.hover) {
      this.hover = idx;
      this.draw();
      if (idx !== null) this.game.audio.play('click', { vol: 0.35 });
    }
    if (click && idx !== null) this.choose(idx);
    return idx !== null;
  }
  choose(i) {
    const o = this.options[i];
    if (!o) return;
    this.game.audio.play('select', { vol: 0.6 });
    this.hide();
    o.action?.();
  }
}
