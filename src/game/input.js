// Unified input: WebXR controllers (Quest Touch, xr-standard mapping) and
// keyboard/mouse for desktop play. Tracks just-pressed edges per frame.
export const BTN = { trigger: 0, grip: 1, stick: 3, a: 4, b: 5 };

function makeHand(side) {
  return {
    side,
    connected: false,
    ray: null,
    grip: null,
    source: null,
    buttons: new Array(7).fill(false),
    prev: new Array(7).fill(false),
    values: new Array(7).fill(0),
    axes: { x: 0, y: 0 },
  };
}

export class Input {
  constructor(renderer, rig, dom) {
    this.renderer = renderer;
    this.hands = { left: makeHand('left'), right: makeHand('right') };
    this.controllers = [];
    for (let i = 0; i < 2; i++) {
      const ray = renderer.xr.getController(i);
      const grip = renderer.xr.getControllerGrip(i);
      rig.add(ray, grip);
      const c = { ray, grip, hand: null };
      this.controllers.push(c);
      ray.addEventListener('connected', (e) => {
        const side = e.data.handedness === 'left' ? 'left' : 'right';
        const h = this.hands[side];
        h.connected = true;
        h.ray = ray;
        h.grip = grip;
        h.source = e.data;
        c.hand = h;
        this.onConnect?.(h);
      });
      ray.addEventListener('disconnected', () => {
        if (c.hand) {
          c.hand.connected = false;
          c.hand.source = null;
        }
      });
    }

    // desktop
    this.keys = new Set();
    this.keysPressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false, rightPressed: false, rightReleased: false, x: 0, y: 0, clicked: false };
    this.locked = false;
    this.dom = dom;
    window.addEventListener('keydown', (e) => {
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
      if (['Tab', 'Space'].includes(e.code) && this.desktopActive) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('mousedown', (e) => {
      if (!this.desktopActive) return;
      if (!this.locked && !this.menuMode) {
        try {
          const r = dom.requestPointerLock?.();
          if (r && r.catch) r.catch(() => {});
        } catch (err) {
          /* ignore */
        }
        return;
      }
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) { this.mouse.right = false; this.mouse.rightReleased = true; }
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('click', (e) => {
      if (this.menuMode) {
        this.mouse.clicked = true;
        this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      }
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
      this.mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      this.onLockChange?.(this.locked);
    });
  }

  update() {
    for (const h of Object.values(this.hands)) {
      for (let i = 0; i < h.buttons.length; i++) h.prev[i] = h.buttons[i];
      const gp = h.source?.gamepad;
      if (!h.connected || !gp) {
        h.buttons.fill(false);
        h.axes.x = h.axes.y = 0;
        continue;
      }
      for (let i = 0; i < h.buttons.length; i++) {
        const b = gp.buttons[i];
        h.buttons[i] = !!(b && b.pressed);
        h.values[i] = b ? b.value : 0;
      }
      const ax = gp.axes.length >= 4 ? [gp.axes[2], gp.axes[3]] : [gp.axes[0] || 0, gp.axes[1] || 0];
      const dead = 0.15;
      h.axes.x = Math.abs(ax[0]) > dead ? ax[0] : 0;
      h.axes.y = Math.abs(ax[1]) > dead ? ax[1] : 0;
    }
  }

  endFrame() {
    this.keysPressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.leftPressed = this.mouse.rightPressed = this.mouse.rightReleased = false;
    this.mouse.clicked = false;
  }

  pressed(side, btn) {
    const h = this.hands[side];
    return h.buttons[btn] && !h.prev[btn];
  }
  released(side, btn) {
    const h = this.hands[side];
    return !h.buttons[btn] && h.prev[btn];
  }
  held(side, btn) {
    return this.hands[side].buttons[btn];
  }
  key(code) {
    return this.keys.has(code);
  }
  keyPressed(code) {
    return this.keysPressed.has(code);
  }

  haptic(side, intensity = 0.5, ms = 40) {
    const gp = this.hands[side]?.source?.gamepad;
    const act = gp?.hapticActuators?.[0];
    try {
      if (act?.pulse) act.pulse(intensity, ms);
      else if (gp?.vibrationActuator?.playEffect) gp.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch (e) {
      /* haptics unsupported */
    }
  }
}
