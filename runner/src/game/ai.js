// Bot brains. Bots follow the course centreline with a wandering lane,
// jump gaps and low hazards, wait out big ones, time jumps onto moving
// platforms, guess doors, and use boost/items.
import { clamp, rightX, rightZ } from '../core/rng.js';
import { GRAVITY } from './runner.js';

export class Bot {
  constructor(runner, race, skill, rand) {
    this.r = runner;
    this.race = race;
    this.skill = skill; // 0 (sloppy) .. 1 (sharp)
    this.rand = rand;
    this.lane = (rand() - 0.5) * 0.8;
    this.laneTarget = this.lane;
    this.laneTimer = 0;
    this.bestS = 0;
    this.stuckT = 0;
    this.notice = new Map();
    this.air = null;
    this.door = null;
    this.doorBlocked = new Set();
    this.pressT = 0;
    this.itemT = 0;
    this.p = {};
    this.q = {};
    this.jumpCd = 0;
    this.blockT = 0;
    this.avoidLat = 0;
  }

  onRespawn() {
    this.bestS = this.r.s;
    this.stuckT = 0;
    this.air = null;
    this.door = null;
  }

  noticed(hz) {
    if (!this.notice.has(hz)) this.notice.set(hz, this.rand() < 0.62 + this.skill * 0.36);
    return this.notice.get(hz);
  }

  think(dt, t) {
    const r = this.r;
    const race = this.race;
    const c = race.course;
    const inp = r.input;
    if (this.jumpCd > 0) this.jumpCd -= dt;
    if (r.finished) {
      inp.m = 0;
      return;
    }
    // stuck watchdog
    if (r.s > this.bestS + 0.5) {
      this.bestS = r.s;
      this.stuckT = 0;
    } else if (race.state === 'run') {
      this.stuckT += dt;
      if (this.stuckT > 7) {
        race.respawn(r, true);
        this.onRespawn();
        return;
      }
    }

    const vel = r.vel;
    const speed = Math.hypot(vel.x, vel.z);
    const here = c.pointAt(r.s, this.p);
    const ph = here.h;

    // wandering lane
    this.laneTimer -= dt;
    if (this.laneTimer <= 0) {
      this.laneTarget = (this.rand() - 0.5) * 1.1;
      this.laneTimer = 1.5 + this.rand() * 3;
    }
    this.lane += (this.laneTarget - this.lane) * Math.min(1, dt * 1.5);

    const look = 3.5 + speed * 0.35;
    const tp = c.pointAt(r.s + look, this.q);
    let lat = this.lane * Math.max(0, tp.w / 2 - 1.3);
    if (tp.aiOff !== null && tp.aiOff !== undefined) lat = tp.aiOff;

    // steer around posts and bumpers: pick the clearest lane ahead
    const obst = [];
    for (const a of c.avoid) {
      if (a.s < r.s - 1 || a.s > r.s + 14) continue;
      const ap = c.pointAt(a.s, this.q2 || (this.q2 = {}));
      obst.push({ cl: (a.x - ap.x) * rightX(ap.h) + (a.z - ap.z) * rightZ(ap.h), r: a.r, d: a.s - r.s });
    }
    if (obst.length) {
      const half = tp.w / 2 - 0.9;
      let best = lat;
      let bestCost = Infinity;
      for (let cand = -half; cand <= half + 1e-6; cand += 0.5) {
        let cost = Math.abs(cand - lat) * 0.4 + Math.abs(cand - this.avoidLat) * 0.3;
        for (const o of obst) {
          const gap = Math.abs(cand - o.cl) - (o.r + 0.9);
          if (gap < 0) cost += (10 - gap * 6) * (o.d < 6 ? 2 : 1);
        }
        if (cost < bestCost) {
          bestCost = cost;
          best = cand;
        }
      }
      lat = best;
    }
    this.avoidLat = lat;

    let m = 1;
    let jump = false;
    let tx = tp.x + rightX(tp.h) * lat;
    let tz = tp.z + rightZ(tp.h) * lat;
    let handled = false;

    // ----- platform sections -----
    const sec = this.sectionAt(r.s);
    if (sec && sec.kind === 'steps') {
      const res = this.steps(sec, t);
      if (res) {
        ({ tx, tz, m, jump } = res);
        handled = true;
      }
    } else if (sec && sec.kind === 'doors') {
      lat = this.doors(sec, dt, speed);
      tx = tp.x + rightX(tp.h) * lat;
      tz = tp.z + rightZ(tp.h) * lat;
    }

    if (!handled) {
      // ----- gaps -----
      const gap = this.gapNear(r.s);
      if (gap && !gap.pad && r.grounded) {
        const d = gap.s0 - r.s;
        const lead = 0.45 + speed * 0.05;
        if (d < lead && d > -1.5) jump = true;
      }
      if (!r.grounded && gap && r.s < gap.s1 + 0.5) {
        // airborne over a gap: aim for the far side, double jump if short
        const land = c.pointAt(gap.s1 + 1.4, this.q);
        const lx = land.x + rightX(land.h) * lat * 0.5;
        const lz = land.z + rightZ(land.h) * lat * 0.5;
        const air = this.airAim(lx, lz, gap.y1, gap.pad ? 0 : 1);
        tx = air.tx;
        tz = air.tz;
        m = air.m;
        jump = jump || air.jump;
      }
      // stairs and other jump hints (h.s is where the step wall is)
      for (const h of c.hints) {
        if (h.type !== 'jump') continue;
        const d = h.s - r.s;
        if (d > -0.05 && d < 0.6 + speed * 0.07 && r.grounded) jump = true;
      }
    }

    // ----- hazards -----
    if (r.grounded || handled) {
      const ivx = Math.sin(Math.atan2(tx - r.pos.x, tz - r.pos.z)) * r.stats.maxSpeed;
      const ivz = Math.cos(Math.atan2(tx - r.pos.x, tz - r.pos.z)) * r.stats.maxSpeed;
      for (const hz of c.hazards) {
        if (r.s < hz.s0 - 8 || r.s > hz.s1 + 1) continue;
        const res = hz.threat(t, r.pos.x, r.pos.z, ivx * m, ivz * m, r.pos.y, ph);
        if (!res) continue;
        if (!this.noticed(hz)) continue;
        if (res === 1 && r.grounded) jump = true;
        else if (res === 2 && r.grounded) m = 0;
        else if (res.dodge) {
          const nl = clamp(lat + res.dodge * 3.2, -tp.w / 2 + 1, tp.w / 2 - 1);
          tx = tp.x + rightX(tp.h) * nl;
          tz = tp.z + rightZ(tp.h) * nl;
        }
      }
    }

    // pushing against something without moving: hop
    if (r.grounded && m > 0.5 && speed < 1.2 && race.state === 'run' && r.canAct()) {
      this.blockT += dt;
      if (this.blockT > 0.35) {
        jump = true;
        this.blockT = 0;
      }
    } else this.blockT = 0;

    // ----- output -----
    let dx = tx - r.pos.x;
    let dz = tz - r.pos.z;
    const dl = Math.hypot(dx, dz);
    if (dl > 1e-3) {
      dx /= dl;
      dz /= dl;
    } else {
      dx = Math.sin(ph);
      dz = Math.cos(ph);
    }
    inp.dx = dx;
    inp.dz = dz;
    inp.m = m;
    if (jump && this.jumpCd <= 0) {
      inp.jump = true;
      this.jumpCd = 0.18;
    }

    // dash when the way ahead is clear
    if (r.gauge >= 50 && r.grounded && !sec && race.state === 'run') {
      const clear = !this.gapNear(r.s, 30) && !c.hazards.some((h) => h.s0 > r.s - 2 && h.s0 < r.s + 28);
      if (clear && this.rand() < dt * (0.4 + this.skill)) inp.boost = true;
    }

    // items
    if (r.item) {
      this.itemT -= dt;
      if (this.itemT <= 0) this.useItem();
    } else {
      this.itemT = 0.6 + this.rand() * 2.4;
    }
  }

  useItem() {
    const r = this.r;
    const race = this.race;
    const it = r.item;
    let go = false;
    if (it === 'rocket') go = r.grounded && !this.gapNear(r.s, 20) && !this.sectionAt(r.s);
    else if (it === 'shield') go = true;
    else if (it === 'bolt' || it === 'ice' || it === 'storm') go = r.rank > 1;
    else if (it === 'honey') go = race.runners.some((o) => o !== r && o.s < r.s && r.s - o.s < 18);
    else go = true;
    if (go || this.itemT < -6) r.input.item = true;
    else this.itemT = 0.5;
  }

  sectionAt(s) {
    for (const sec of this.race.course.sections) {
      if (s > sec.s0 - 7 && s < sec.s1 + 0.5) return sec;
    }
    return null;
  }

  gapNear(s, ahead = 9) {
    for (const g of this.race.course.gaps) {
      if (g.s1 > s - 0.5 && g.s0 < s + ahead) return g;
    }
    return null;
  }

  // Steer in the air so we land on (lx, lz) at height ly.
  airAim(lx, lz, ly, allowDouble = 1) {
    const r = this.r;
    const g = GRAVITY * this.race.gravity;
    const vy = r.vel.y;
    const disc = vy * vy + 2 * g * (r.pos.y - ly);
    const dx = lx - r.pos.x;
    const dz = lz - r.pos.z;
    let jump = false;
    if (disc < 0) {
      if (allowDouble && r.jumps < 2 && vy < 2) jump = true;
      return { tx: lx, tz: lz, m: 1, jump };
    }
    const tl = Math.max(0.12, (vy + Math.sqrt(disc)) / g);
    const need = Math.hypot(dx, dz) / tl;
    const cap = Math.max(r.airTop, r.stats.maxSpeed);
    if (allowDouble && r.jumps < 2 && vy < 1.5 && need > cap * 1.05) jump = true;
    return { tx: lx, tz: lz, m: clamp(need / cap, 0, 1), jump };
  }

  stepPos(step, time) {
    if (step.mover) {
      const p = step.mover.posAt(time);
      return { x: p.x, y: p.y, z: p.z };
    }
    const c = step.col;
    return { x: c.x, y: c.kind === 'cyl' ? c.top : c.top0, z: c.z };
  }

  // Stepping stones, moving platforms and spinning discs.
  steps(sec, t) {
    const r = this.r;
    const c = this.race.course;
    const S = sec.steps;
    const g = GRAVITY * this.race.gravity;
    const exitPos = () => {
      const p = c.pointAt(sec.s1 + 2.0, this.q);
      return { x: p.x, y: p.y, z: p.z };
    };
    const targetAt = (idx, time) => (idx < S.length ? this.stepPos(S[idx], time) : exitPos());

    if (!r.grounded) {
      // still over the floor before the section and we didn't jump for it: ignore
      if ((!this.air || this.air.sec !== sec) && r.s < sec.s0 - 0.5) return null;
      if (!this.air || this.air.sec !== sec) {
        let i = S.findIndex((st) => st.s + st.half > r.s);
        if (i < 0) i = S.length;
        this.air = { sec, idx: i };
      }
      const idx = this.air.idx;
      // estimate when we land, then aim where the platform will be by then
      let tgt = targetAt(idx, t);
      for (let it = 0; it < 2; it++) {
        const disc = r.vel.y * r.vel.y + 2 * g * (r.pos.y - tgt.y);
        const tl = disc > 0 ? (r.vel.y + Math.sqrt(disc)) / g : 0.4;
        tgt = targetAt(idx, t + tl);
      }
      return this.airAim(tgt.x, tgt.z, tgt.y, 1);
    }

    let k = S.findIndex((st) => st.col === r.ground);
    if (k < 0) {
      if (r.s < sec.s0 + 0.5) k = -1;
      else return null; // already on the exit floor
    }
    const next = k + 1 < S.length ? S[k + 1] : null;
    const N = next ? this.stepPos(next, t + 0.6) : exitPos();
    const here = c.pointAt(r.s, this.p);
    const myLat = (r.pos.x - here.x) * rightX(here.h) + (r.pos.z - here.z) * rightZ(here.h);
    const np = c.pointAt(next ? next.s : sec.s1 + 2, this.q);
    const nLat = (N.x - np.x) * rightX(np.h) + (N.z - np.z) * rightZ(np.h);
    // static stones are always there; moving ones must line up first
    const ready = !next || !next.mover || (Math.abs(nLat - myLat) < 0.9 + this.skill * 0.5 && N.y < r.pos.y + 1.0);

    if (k === -1) {
      // on the floor before the section: line up with the first step, jump at the edge
      const edgeDist = sec.s0 - r.s;
      const p = c.pointAt(Math.min(sec.s0 - 0.7, r.s + 3), this.q);
      const lat = clamp(nLat, -p.w / 2 + 0.8, p.w / 2 - 0.8);
      if (edgeDist > 0.9) {
        // slow down to a take-off speed that won't overshoot a small platform
        const vt = this.takeoffSpeed(r.pos.x, r.pos.z, N, edgeDist);
        return { tx: p.x + rightX(p.h) * lat, tz: p.z + rightZ(p.h) * lat, m: edgeDist < 5 ? vt : 1, jump: false };
      }
      if (ready) {
        this.air = { sec, idx: 0 };
        return { tx: N.x, tz: N.z, m: 1, jump: true };
      }
      const w = c.pointAt(sec.s0 - 1.0, this.q);
      const wx = w.x + rightX(w.h) * lat;
      const wz = w.z + rightZ(w.h) * lat;
      const off = Math.hypot(wx - r.pos.x, wz - r.pos.z);
      return { tx: wx, tz: wz, m: off > 0.4 ? Math.min(0.5, off * 0.4) : 0, jump: false };
    }

    // on step k: walk to the edge that faces the next platform, then jump
    const C = this.stepPos(S[k], t);
    let dx = N.x - C.x;
    let dz = N.z - C.z;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    const reach = Math.max(0.3, S[k].half - 0.55);
    const along = (r.pos.x - C.x) * dx + (r.pos.z - C.z) * dz;
    if (along < reach - 0.35) {
      const vt = this.takeoffSpeed(C.x + dx * reach, C.z + dz * reach, N, 0);
      return { tx: C.x + dx * reach, tz: C.z + dz * reach, m: Math.min(0.75, vt + 0.1), jump: false };
    }
    if (ready) {
      this.air = { sec, idx: k + 1 };
      return { tx: N.x, tz: N.z, m: 1, jump: true };
    }
    const f = Math.min(0.5, S[k].half - 0.6);
    const wx = C.x + dx * f;
    const wz = C.z + dz * f;
    const off = Math.hypot(wx - r.pos.x, wz - r.pos.z);
    return { tx: wx, tz: wz, m: off > 0.4 ? Math.min(0.5, off * 0.4) : 0, jump: false };
  }

  // Input magnitude for running up to a jump towards N (≈0.6 s of flight).
  takeoffSpeed(fromX, fromZ, N, extra) {
    const r = this.r;
    const d = Math.hypot(N.x - fromX, N.z - fromZ) - extra;
    const v = clamp(d / 0.62 + 1, 5, 30);
    return clamp(v / (r.stats.maxSpeed * (r.speedMul ?? 1)), 0.35, 1);
  }

  doors(sec, dt, speed) {
    const r = this.r;
    const D = sec.doors;
    const list = D.list;
    const pick = () => {
      const open = list.map((d, i) => i).filter((i) => list[i].broken);
      if (open.length && this.rand() < 0.5 + this.skill * 0.4) return open[Math.floor(this.rand() * open.length)];
      const cand = list.map((d, i) => i).filter((i) => !this.doorBlocked.has(i) && !(list[i].known && list[i].fake));
      if (!cand.length) return Math.floor(this.rand() * list.length);
      return cand[Math.floor(this.rand() * cand.length)];
    };
    if (this.door === null || this.door.sec !== sec) this.door = { sec, i: pick() };
    let d = list[this.door.i];
    if ((d.known && d.fake) || this.doorBlocked.has(this.door.i)) {
      this.door.i = pick();
      d = list[this.door.i];
    }
    const dist = D.o.s - r.s;
    if (dist < 1.6 && speed < 2) {
      this.pressT += dt;
      if (this.pressT > 0.3 && !d.broken) {
        this.doorBlocked.add(this.door.i);
        this.door.i = pick();
        this.pressT = 0;
      }
    } else this.pressT = 0;
    return list[this.door.i].lat;
  }
}
