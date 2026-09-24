import * as THREE from 'three';
import { Game } from './game/game.js';

const app = document.getElementById('app');
const fill = document.getElementById('load-fill');
const msg = document.getElementById('load-msg');
const menu = document.getElementById('menu');
const loading = document.getElementById('loading');
const btnVR = document.getElementById('btn-vr');
const btnDesk = document.getElementById('btn-desktop');
const vrNote = document.getElementById('vr-note');
const titleScreen = document.getElementById('title-screen');

// Quality preference (persisted per device)
let quality = 'medium';
try {
  quality = localStorage.getItem('ls-quality') || (/Quest 3|Quest Pro/i.test(navigator.userAgent) ? 'high' : 'medium');
} catch (e) { /* storage unavailable */ }
const qBtns = [...document.querySelectorAll('#quality button')];
const syncQ = () => qBtns.forEach((b) => b.classList.toggle('on', b.dataset.q === quality));
qBtns.forEach((b) =>
  b.addEventListener('click', () => {
    quality = b.dataset.q;
    try { localStorage.setItem('ls-quality', quality); } catch (e) { /* ignore */ }
    syncQ();
    game?.setQuality(quality);
  })
);
syncQ();

let game = null;

async function boot() {
  // Dev-only: emulate a Quest 3 + Touch controllers (IWER) for headless testing.
  // Dead-code-eliminated from production builds.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('iwer')) {
    const { XRDevice, metaQuest3 } = await import('iwer');
    const dev = new XRDevice(metaQuest3);
    dev.installRuntime({ forceInstall: true });
    window.__xrDevice = dev;
  }
  game = new Game(app, { quality });
  window.__game = game;
  await game.init((p, text) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    if (text) msg.textContent = text;
  });
  loading.classList.add('hidden');
  menu.classList.remove('hidden');
  titleScreen.classList.add('loaded');

  let vrOK = false;
  if (navigator.xr) {
    try {
      vrOK = await navigator.xr.isSessionSupported('immersive-vr');
    } catch (e) {
      vrOK = false;
    }
  }
  if (vrOK) {
    btnVR.disabled = false;
    vrNote.textContent = '헤드셋을 쓰고 눌러주세요 — Link Start!';
  } else if (!window.isSecureContext) {
    vrNote.textContent = 'VR은 HTTPS 주소에서만 동작합니다';
  }

  btnVR.addEventListener('click', async () => {
    try {
      await game.startVR();
      titleScreen.classList.add('hidden');
    } catch (e) {
      console.error(e);
      vrNote.textContent = `VR 시작 실패: ${e.message || e}`;
    }
  });
  btnDesk.addEventListener('click', () => {
    titleScreen.classList.add('hidden');
    game.startDesktop();
  });
  game.onExitToTitle = () => titleScreen.classList.remove('hidden');

  // Debug / screenshot hook: ?shot=x,y,z,yawDeg,pitchDeg
  const params = new URLSearchParams(location.search);
  if (params.has('shot')) {
    const [x, y, z, yaw, pitch] = params.get('shot').split(',').map(Number);
    titleScreen.classList.add('hidden');
    game.debugView(x, y, z, THREE.MathUtils.degToRad(yaw || 0), THREE.MathUtils.degToRad(pitch || 0));
  } else if (params.has('autostart')) {
    titleScreen.classList.add('hidden');
    game.startDesktop({ skipIntro: params.has('skipintro') });
  }
}

boot().catch((e) => {
  console.error(e);
  msg.textContent = `오류: ${e.message || e}`;
});
