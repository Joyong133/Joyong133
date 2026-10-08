// Procedural canvas textures. Everything visual is generated in code, so the
// game ships without image files.
import * as THREE from 'three';
import { rng } from '../core/rng.js';

const cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finish(c, { repeat = true, srgb = true, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (nearest) t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

function shade(color, amt) {
  const c = new THREE.Color(color);
  c.offsetHSL(0, 0, amt);
  return `#${c.getHexString()}`;
}

function speckle(g, size, r, n, colors, min = 1, max = 3) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(r() * colors.length)];
    const s = min + r() * (max - min);
    g.beginPath();
    g.arc(r() * size, r() * size, s, 0, Math.PI * 2);
    g.fill();
  }
}

const DRAW = {
  grass(g, s, r) {
    g.fillStyle = '#7bc84a';
    g.fillRect(0, 0, s, s);
    // mowed stripes along the run direction
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,60,0,0.06)';
      g.fillRect(0, (i * s) / 4, s, s / 4);
    }
    speckle(g, s, r, 500, ['#6ab63c', '#8fd659', '#5fa836'], 1, 2.5);
    speckle(g, s, r, 14, ['#fff7a8', '#ffffff', '#ffb6d9'], 2, 3.5);
  },
  dirt(g, s, r) {
    g.fillStyle = '#9a6a3f';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      g.fillStyle = y % 64 ? '#8b5d36' : '#a3754a';
      g.fillRect(0, y, s, 18);
    }
    speckle(g, s, r, 220, ['#7a5130', '#b48557', '#6b4628'], 1, 4);
  },
  wood(g, s, r) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const base = new THREE.Color(0xc58b52).offsetHSL(0, 0, (r() - 0.5) * 0.08);
      g.fillStyle = `#${base.getHexString()}`;
      g.fillRect((i * s) / n, 0, s / n, s);
      g.strokeStyle = 'rgba(80,40,10,0.25)';
      g.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) {
        const x = (i * s) / n + 6 + r() * (s / n - 12);
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + 6, s * 0.3, x - 6, s * 0.6, x + 3, s);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,30,8,0.55)';
      g.fillRect((i * s) / n, 0, 3, s);
      g.fillStyle = 'rgba(90,50,20,0.7)';
      g.beginPath();
      g.arc((i * s) / n + s / n / 2, r() * s, 2.5, 0, Math.PI * 2);
      g.fill();
    }
  },
  checker(g, s) {
    const n = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? '#2b2440' : '#f6f0ff';
        g.fillRect((x * s) / n, (y * s) / n, s / n, s / n);
      }
    }
    g.strokeStyle = 'rgba(255,180,230,0.5)';
    g.lineWidth = 2;
    for (let i = 0; i <= n; i++) {
      g.beginPath();
      g.moveTo((i * s) / n, 0);
      g.lineTo((i * s) / n, s);
      g.moveTo(0, (i * s) / n);
      g.lineTo(s, (i * s) / n);
      g.stroke();
    }
  },
  hearts(g, s, r) {
    g.fillStyle = '#d23a5b';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#b52a49';
    for (let i = 0; i < 4; i++) g.fillRect(0, i * 64 + 30, s, 4);
    speckle(g, s, r, 40, ['#f5c542'], 2, 3);
  },
  candy(g, s, r) {
    g.fillStyle = '#ffb3d1';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#ffd6e6';
    for (let i = -s; i < s * 2; i += 64) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 28, 0);
      g.lineTo(i + 28 - s, s);
      g.lineTo(i - s, s);
      g.closePath();
      g.fill();
    }
    const sprinkle = ['#ff5a7a', '#5ac8ff', '#ffe066', '#7be07b', '#ffffff', '#b98cff'];
    for (let i = 0; i < 90; i++) {
      g.save();
      g.translate(r() * s, r() * s);
      g.rotate(r() * Math.PI);
      g.fillStyle = sprinkle[Math.floor(r() * sprinkle.length)];
      g.fillRect(-5, -1.5, 10, 3);
      g.restore();
    }
  },
  choco(g, s, r) {
    g.fillStyle = '#6b3a22';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 2; x++) {
        const px = (x * s) / 2;
        const py = (y * s) / 2;
        g.fillStyle = '#7d4729';
        g.fillRect(px + 8, py + 8, s / 2 - 16, s / 2 - 16);
        g.fillStyle = 'rgba(255,220,180,0.15)';
        g.fillRect(px + 8, py + 8, s / 2 - 16, 6);
        g.fillStyle = 'rgba(0,0,0,0.2)';
        g.fillRect(px + 8, py + s / 2 - 14, s / 2 - 16, 6);
      }
    }
    speckle(g, s, r, 30, ['#5a2f1a'], 1, 2);
  },
  cookie(g, s, r) {
    g.fillStyle = '#e0a860';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 160, ['#c98f48', '#eab774', '#d39b55'], 2, 6);
    speckle(g, s, r, 18, ['#4a2512', '#5d3018'], 5, 9);
  },
  bricks(g, s, r) {
    g.fillStyle = '#c99a17';
    g.fillRect(0, 0, s, s);
    const rows = 8;
    const h = s / rows;
    for (let y = 0; y < rows; y++) {
      const off = y % 2 ? h : 0;
      for (let x = -1; x < 4; x++) {
        const c = new THREE.Color(0xf2c536).offsetHSL((r() - 0.5) * 0.02, 0, (r() - 0.5) * 0.1);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect(x * h * 2 + off + 3, y * h + 3, h * 2 - 6, h - 6);
        g.fillStyle = 'rgba(255,255,255,0.25)';
        g.fillRect(x * h * 2 + off + 3, y * h + 3, h * 2 - 6, 3);
      }
    }
  },
  ice(g, s, r) {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, '#d8f4ff');
    grd.addColorStop(1, '#a8ddf5');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      let x = r() * s;
      let y = r() * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (r() - 0.5) * 70;
        y += (r() - 0.5) * 70;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    speckle(g, s, r, 40, ['#ffffff'], 1, 2);
  },
  snow(g, s, r) {
    g.fillStyle = '#f2f7ff';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 300, ['#e2ecfa', '#ffffff', '#d5e3f5'], 1, 4);
  },
  sand(g, s, r) {
    g.fillStyle = '#f0cf8a';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(190,140,70,0.35)';
    g.lineWidth = 3;
    for (let y = 10; y < s; y += 22) {
      g.beginPath();
      for (let x = 0; x <= s; x += 8) g.lineTo(x, y + Math.sin((x / s) * Math.PI * 4 + y) * 5);
      g.stroke();
    }
    speckle(g, s, r, 200, ['#e2bc72', '#f8dea4'], 1, 2);
  },
  sandstone(g, s, r) {
    g.fillStyle = '#e6b36d';
    g.fillRect(0, 0, s, s);
    const n = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const c = new THREE.Color(0xf2c785).offsetHSL(0, 0, (r() - 0.5) * 0.08);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect((x * s) / n + 3, (y * s) / n + 3, s / n - 6, s / n - 6);
      }
    }
    // inlaid star tiles
    g.fillStyle = '#2c8fa8';
    for (let i = 0; i < 2; i++) {
      const cx = (i * 2 + 1) * (s / 4);
      const cy = (i * 2 + 1) * (s / 4);
      g.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = k % 2 ? 10 : 22;
        g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.fill();
    }
  },
  stone(g, s, r) {
    g.fillStyle = '#8f96a3';
    g.fillRect(0, 0, s, s);
    const n = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const c = new THREE.Color(0xb3bac6).offsetHSL(0, 0, (r() - 0.5) * 0.1);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect((x * s) / n + 3, (y * s) / n + 3, s / n - 6, s / n - 6);
      }
    }
    speckle(g, s, r, 120, ['rgba(60,60,70,0.25)'], 1, 3);
  },
  brass(g, s, r) {
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, '#c9a14a');
    grd.addColorStop(0.5, '#e6c46c');
    grd.addColorStop(1, '#b88d3a');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(90,60,20,0.5)';
    g.lineWidth = 3;
    g.strokeRect(4, 4, s - 8, s - 8);
    g.strokeRect(s / 2, 4, 0.1, s - 8);
    g.fillStyle = '#7a5a20';
    for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14], [s / 2, s / 2]]) {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
    }
    speckle(g, s, r, 60, ['rgba(255,255,255,0.2)'], 1, 2);
  },
  plum(g, s, r) {
    g.fillStyle = '#3d2a5c';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 32) {
      g.fillStyle = y % 64 ? '#46316a' : '#36254f';
      g.fillRect(0, y, s, 32);
    }
    speckle(g, s, r, 50, ['#f3d36b'], 1, 2);
  },
  seabed(g, s, r) {
    g.fillStyle = '#e8d9a8';
    g.fillRect(0, 0, s, s);
    const n = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const c = new THREE.Color(0x7fd6cf).offsetHSL((r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.12);
        g.fillStyle = `#${c.getHexString()}`;
        const cx = (x + 0.5) * (s / n);
        const cy = (y + 0.5) * (s / n);
        g.beginPath();
        g.arc(cx, cy, s / n / 2 - 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    speckle(g, s, r, 30, ['#ffffff', '#ffc2d6'], 1, 3);
  },
  coral(g, s, r) {
    g.fillStyle = '#e8735f';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 260, ['#f28c76', '#d65e4b', '#ffb19e'], 2, 6);
  },
  basalt(g, s, r) {
    g.fillStyle = '#3a3034';
    g.fillRect(0, 0, s, s);
    const n = 3;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const c = new THREE.Color(0x4a3e42).offsetHSL(0, 0, (r() - 0.5) * 0.06);
        g.fillStyle = `#${c.getHexString()}`;
        g.fillRect((x * s) / n + 4, (y * s) / n + 4, s / n - 8, s / n - 8);
      }
    }
    g.strokeStyle = '#ff7a1a';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      let x = r() * s;
      let y = r() * s;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        x += (r() - 0.5) * 60;
        y += (r() - 0.5) * 60;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  rock(g, s, r) {
    g.fillStyle = '#5b4b49';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 200, ['#4a3b3a', '#6d5b58', '#3a2e2d'], 2, 7);
  },
  vine(g, s, r) {
    g.fillStyle = '#5aa63a';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = i % 2 ? '#4b922f' : '#6dbb47';
      g.lineWidth = 10;
      g.beginPath();
      const x = (i / 6) * s + 20;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 30, s * 0.33, x - 30, s * 0.66, x, s);
      g.stroke();
    }
    speckle(g, s, r, 60, ['#8fd95f'], 2, 4);
  },
  cloud(g, s, r) {
    g.fillStyle = '#f4f8ff';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 40, ['#e3ecfb', '#ffffff'], 10, 26);
  },
  emerald(g, s, r) {
    g.fillStyle = '#2fa36a';
    g.fillRect(0, 0, s, s);
    const n = 4;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const c = new THREE.Color(0x46c486).offsetHSL(0, 0, (r() - 0.5) * 0.1);
        g.fillStyle = `#${c.getHexString()}`;
        g.beginPath();
        const cx = (x + 0.5) * (s / n);
        const cy = (y + 0.5) * (s / n);
        const h = s / n / 2 - 4;
        g.moveTo(cx, cy - h);
        g.lineTo(cx + h, cy);
        g.lineTo(cx, cy + h);
        g.lineTo(cx - h, cy);
        g.fill();
      }
    }
  },
  poppy(g, s, r) {
    g.fillStyle = '#4f8f3a';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 200, ['#d92b2b', '#f04a3a', '#b81e2a'], 3, 7);
    speckle(g, s, r, 60, ['#2d1a12'], 1, 2);
  },
  water(g, s, r) {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(160,190,220,0.5)';
    g.lineWidth = 3;
    for (let i = 0; i < 14; i++) {
      const x = r() * s;
      const y = r() * s;
      g.beginPath();
      g.arc(x, y, 8 + r() * 14, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
  },
  lava(g, s, r) {
    g.fillStyle = '#ff5a14';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 50, ['#ffb81a', '#ffd34d'], 6, 18);
    speckle(g, s, r, 40, ['#b8290c', '#8a1d0a'], 6, 16);
  },
  carpet(g, s) {
    g.fillStyle = '#b8243c';
    g.fillRect(0, 0, s, s);
    g.strokeStyle = '#f5c542';
    g.lineWidth = 10;
    g.strokeRect(14, 14, s - 28, s - 28);
    g.fillStyle = '#2c4fa8';
    g.beginPath();
    g.moveTo(s / 2, 40);
    g.lineTo(s - 40, s / 2);
    g.lineTo(s / 2, s - 40);
    g.lineTo(40, s / 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#f5c542';
    g.beginPath();
    g.arc(s / 2, s / 2, 22, 0, Math.PI * 2);
    g.fill();
  },
  // ---- special surfaces ----
  boost(g, s) {
    g.fillStyle = '#ff9a1f';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#fff36b';
    for (let i = 0; i < 2; i++) {
      const y = i * (s / 2);
      g.beginPath();
      g.moveTo(s * 0.12, y + s * 0.42);
      g.lineTo(s * 0.5, y + s * 0.08);
      g.lineTo(s * 0.88, y + s * 0.42);
      g.lineTo(s * 0.72, y + s * 0.42);
      g.lineTo(s * 0.5, y + s * 0.24);
      g.lineTo(s * 0.28, y + s * 0.42);
      g.closePath();
      g.fill();
    }
  },
  conveyor(g, s) {
    g.fillStyle = '#4a4f5c';
    g.fillRect(0, 0, s, s);
    g.fillStyle = '#5c6270';
    for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 14);
    // arrow points down the canvas = backwards along the track (belts push you back)
    g.fillStyle = '#ffd23f';
    g.beginPath();
    g.moveTo(s * 0.3, s * 0.65);
    g.lineTo(s * 0.5, s * 0.85);
    g.lineTo(s * 0.7, s * 0.65);
    g.lineTo(s * 0.6, s * 0.65);
    g.lineTo(s * 0.6, s * 0.4);
    g.lineTo(s * 0.4, s * 0.4);
    g.lineTo(s * 0.4, s * 0.65);
    g.closePath();
    g.fill();
  },
  jelly(g, s, r) {
    g.fillStyle = '#7de0a8';
    g.fillRect(0, 0, s, s);
    speckle(g, s, r, 30, ['rgba(255,255,255,0.6)'], 4, 12);
  },
  itembox(g, s) {
    const grd = g.createLinearGradient(0, 0, s, s);
    grd.addColorStop(0, '#7b5cff');
    grd.addColorStop(1, '#ff6ad5');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 12;
    g.strokeRect(10, 10, s - 20, s - 20);
    g.fillStyle = '#fff';
    g.font = `bold ${s * 0.62}px sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', s / 2, s / 2 + s * 0.04);
  },
  finish(g, s) {
    const n = 8;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < n; x++) {
        g.fillStyle = (x + y) % 2 ? '#1d1d24' : '#ffffff';
        g.fillRect((x * s) / n, (y * s) / 2, s / n, s / 2);
      }
    }
  },
};

const OPTIONS = {
  checker: { nearest: false },
};

export function texture(name) {
  if (cache.has(name)) return cache.get(name);
  const draw = DRAW[name];
  if (!draw) throw new Error(`unknown texture ${name}`);
  const s = 256;
  const c = canvas(s);
  const g = c.getContext('2d');
  draw(g, s, rng(name.length * 977 + name.charCodeAt(0)));
  const t = finish(c, OPTIONS[name]);
  t.userData.shared = true;
  cache.set(name, t);
  return t;
}

// Unique (uncached) clone for textures we animate (conveyor, lava, water).
export function animatedTexture(name) {
  const t = texture(name).clone();
  t.userData = {};
  t.needsUpdate = true;
  return t;
}

// Soft round sprite used by particles and blob shadows.
export function dotTexture() {
  if (cache.has('_dot')) return cache.get('_dot');
  const s = 64;
  const c = canvas(s);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, s, s);
  const t = finish(c, { repeat: false });
  t.userData.shared = true;
  cache.set('_dot', t);
  return t;
}

export function starTexture() {
  if (cache.has('_star')) return cache.get('_star');
  const s = 64;
  const c = canvas(s);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = k % 2 ? s * 0.2 : s * 0.48;
    g.lineTo(s / 2 + Math.cos(a) * rr, s / 2 + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  const t = finish(c, { repeat: false });
  t.userData.shared = true;
  cache.set('_star', t);
  return t;
}

// Name tag sprite texture.
export function labelTexture(text, color = '#ffffff', bg = 'rgba(20,24,40,0.72)') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = bg;
  const x = (256 - w) / 2;
  g.beginPath();
  g.roundRect(x, 8, w, 48, 22);
  g.fill();
  g.fillStyle = color;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  return finish(c, { repeat: false });
}

export { hex, shade };
