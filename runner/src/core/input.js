// Keyboard + touch input. Movement is an analog vector (x = right, y =
// forward); buttons are edge-triggered and consumed by `take()`.
const KEYMAP = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'jump',
  ControlLeft: 'jump',
  ControlRight: 'jump',
  KeyJ: 'jump',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  KeyK: 'boost',
  KeyZ: 'item',
  KeyX: 'item',
  KeyL: 'item',
  KeyR: 'reset',
  Escape: 'pause',
  KeyP: 'pause',
};

export class Input {
  constructor() {
    this.held = new Set();
    this.edges = new Set();
    this.touch = { x: 0, y: 0, active: false };
    this.enabled = true;
    window.addEventListener('keydown', (e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!this.held.has(k)) this.edges.add(k);
      this.held.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = KEYMAP[e.code];
      if (k) this.held.delete(k);
    });
    window.addEventListener('blur', () => this.held.clear());
  }

  // Wire the on-screen touch controls.
  bindTouch(root) {
    const stick = root.querySelector('#stick');
    const knob = root.querySelector('#stick .knob');
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 52;
    const move = (x, y) => {
      let dx = x - cx;
      let dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx *= R / d;
        dy *= R / d;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.touch.x = dx / R;
      this.touch.y = -dy / R;
    };
    stick.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      stick.setPointerCapture(id);
      const r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      this.touch.active = true;
      move(e.clientX, e.clientY);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === id) move(e.clientX, e.clientY);
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.touch.active = false;
      this.touch.x = this.touch.y = 0;
      knob.style.transform = '';
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    for (const btn of root.querySelectorAll('[data-btn]')) {
      const k = btn.dataset.btn;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.edges.add(k);
        this.held.add(`t-${k}`);
        btn.classList.add('down');
      });
      const up = () => {
        this.held.delete(`t-${k}`);
        btn.classList.remove('down');
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    }
  }

  axis() {
    if (this.touch.active) return { x: this.touch.x, y: this.touch.y };
    const h = this.held;
    let x = (h.has('right') ? 1 : 0) - (h.has('left') ? 1 : 0);
    let y = (h.has('up') ? 1 : 0) - (h.has('down') ? 1 : 0);
    if (x && y) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { x, y };
  }

  take(k) {
    if (this.edges.has(k)) {
      this.edges.delete(k);
      return true;
    }
    return false;
  }

  clear() {
    this.edges.clear();
  }
}
