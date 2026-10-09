// Collision world for the race course.
//
// Colliders are plain objects so the hot loop stays cheap:
//   kind 'box' — oriented box (yaw only) whose top may slope along local z
//                (top0 at local z = -hz, top1 at +hz). Used for floors, ramps,
//                walls, rails and platforms.
//   kind 'cyl' — vertical cylinder with a flat top (posts, discs, bumpers).
//
// Runners are vertical capsules: a circle of radius RUNNER_R in XZ spanning
// [feet, feet + RUNNER_H]. Anything whose top is within STEP_UP of the feet is
// stepped onto instead of blocking.
import { clamp } from '../core/rng.js';

export const RUNNER_R = 0.42;
export const RUNNER_H = 1.45;
export const STEP_UP = 0.45;
export const FOOT_R = 0.24;

export function box(o) {
  const top0 = o.top0 ?? o.top;
  const top1 = o.top1 ?? o.top;
  const c = {
    kind: 'box',
    x: o.x,
    z: o.z,
    hx: o.hx,
    hz: o.hz,
    yaw: 0,
    cos: 1,
    sin: 0,
    top0,
    top1,
    bot: o.bot ?? Math.min(top0, top1) - (o.thick ?? 1.2),
    solid: o.solid !== false,
    floor: o.floor !== false,
    surface: o.surface || 'normal',
    conv: o.conv || 0, // conveyor speed along local +z
    bounce: o.bounce || 0, // bumper impulse when touched from the side
    active: true,
    dx: 0,
    dy: 0,
    dz: 0,
    dyaw: 0,
    br: 0,
    stamp: 0,
    onStand: o.onStand || null,
    owner: o.owner || null,
  };
  setYaw(c, o.yaw || 0);
  return c;
}

export function cyl(o) {
  return {
    kind: 'cyl',
    x: o.x,
    z: o.z,
    r: o.r,
    top: o.top,
    bot: o.bot ?? o.top - (o.thick ?? 1.2),
    solid: o.solid !== false,
    floor: o.floor !== false,
    surface: o.surface || 'normal',
    conv: 0,
    bounce: o.bounce || 0,
    active: true,
    dx: 0,
    dy: 0,
    dz: 0,
    dyaw: 0,
    br: o.r,
    stamp: 0,
    onStand: o.onStand || null,
    owner: o.owner || null,
  };
}

export function setYaw(c, yaw) {
  c.yaw = yaw;
  c.cos = Math.cos(yaw);
  c.sin = Math.sin(yaw);
  c.br = Math.hypot(c.hx, c.hz);
}

// Move a dynamic collider and remember the displacement so runners standing
// on it are carried along.
export function moveTo(c, x, y, z, yaw) {
  const topRef = c.kind === 'box' ? c.top0 : c.top;
  c.dx = x - c.x;
  c.dz = z - c.z;
  c.dy = y - topRef;
  c.x = x;
  c.z = z;
  if (c.kind === 'box') {
    const slope = c.top1 - c.top0;
    const depth = c.top0 - c.bot;
    c.top0 = y;
    c.top1 = y + slope;
    c.bot = y - depth;
    if (yaw !== undefined) {
      c.dyaw = yaw - c.yaw;
      setYaw(c, yaw);
    }
  } else {
    // Cylinders spin by setting c.dyaw (rotation this step) directly.
    const depth = c.top - c.bot;
    c.top = y;
    c.bot = y - depth;
  }
}

export function toLocalX(c, x, z) {
  return (x - c.x) * c.cos - (z - c.z) * c.sin;
}
export function toLocalZ(c, x, z) {
  return (x - c.x) * c.sin + (z - c.z) * c.cos;
}

export function topAt(c, lz) {
  if (c.top0 === c.top1) return c.top0;
  const t = clamp((lz + c.hz) / (2 * c.hz), 0, 1);
  return c.top0 + (c.top1 - c.top0) * t;
}

// Top surface height under (x, z), or -Infinity when outside.
export function floorTop(c, x, z, margin = FOOT_R) {
  if (c.kind === 'cyl') {
    const dx = x - c.x;
    const dz = z - c.z;
    const r = c.r + margin * 0.6;
    return dx * dx + dz * dz <= r * r ? c.top : -Infinity;
  }
  const lx = toLocalX(c, x, z);
  const lz = toLocalZ(c, x, z);
  if (lx < -c.hx - margin || lx > c.hx + margin || lz < -c.hz - margin || lz > c.hz + margin) return -Infinity;
  return topAt(c, lz);
}

// Push a circle (x, z, r) spanning [feet, head] out of a solid collider.
// Returns null when untouched, otherwise writes the resolved position and
// outward normal into `out` and returns it.
export function pushOut(c, x, z, r, feet, head, out) {
  // walls and rails can't be stepped onto, only floors can
  const step = c.floor ? STEP_UP : 0;
  if (c.kind === 'cyl') {
    if (feet + step >= c.top || head <= c.bot) return null;
    const dx = x - c.x;
    const dz = z - c.z;
    const d2 = dx * dx + dz * dz;
    const rr = c.r + r;
    if (d2 >= rr * rr) return null;
    const d = Math.sqrt(d2) || 1e-4;
    const nx = d2 > 1e-8 ? dx / d : 1;
    const nz = d2 > 1e-8 ? dz / d : 0;
    out.x = c.x + nx * rr;
    out.z = c.z + nz * rr;
    out.nx = nx;
    out.nz = nz;
    return out;
  }
  let lx = toLocalX(c, x, z);
  let lz = toLocalZ(c, x, z);
  if (lx < -c.hx - r || lx > c.hx + r || lz < -c.hz - r || lz > c.hz + r) return null;
  const cx = clamp(lx, -c.hx, c.hx);
  const cz = clamp(lz, -c.hz, c.hz);
  const top = topAt(c, cz);
  if (feet + step >= top || head <= c.bot) return null;
  const dx = lx - cx;
  const dz = lz - cz;
  const d2 = dx * dx + dz * dz;
  let nlx;
  let nlz;
  if (d2 > 1e-8) {
    if (d2 >= r * r) return null;
    const d = Math.sqrt(d2);
    nlx = dx / d;
    nlz = dz / d;
    lx = cx + nlx * r;
    lz = cz + nlz * r;
  } else {
    // Centre is inside the box: leave along the shallowest axis.
    const px = c.hx - Math.abs(lx);
    const pz = c.hz - Math.abs(lz);
    if (px < pz) {
      nlx = lx >= 0 ? 1 : -1;
      nlz = 0;
      lx = nlx * (c.hx + r);
    } else {
      nlx = 0;
      nlz = lz >= 0 ? 1 : -1;
      lz = nlz * (c.hz + r);
    }
  }
  out.x = c.x + lx * c.cos + lz * c.sin;
  out.z = c.z - lx * c.sin + lz * c.cos;
  out.nx = nlx * c.cos + nlz * c.sin;
  out.nz = -nlx * c.sin + nlz * c.cos;
  return out;
}

// Ceiling height above a point (bottom of a collider overhead), or Infinity.
export function ceilingAt(c, x, z, feet) {
  if (!c.solid) return Infinity;
  if (c.kind === 'cyl') {
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz > c.r * c.r) return Infinity;
  } else {
    const lx = toLocalX(c, x, z);
    const lz = toLocalZ(c, x, z);
    if (Math.abs(lx) > c.hx || Math.abs(lz) > c.hz) return Infinity;
  }
  return c.bot > feet + STEP_UP ? c.bot : Infinity;
}

// Uniform XZ grid for static colliders.
class Grid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  key(ix, iz) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }
  add(c) {
    const r = c.br + 0.5;
    const x0 = Math.floor((c.x - r) / this.cell);
    const x1 = Math.floor((c.x + r) / this.cell);
    const z0 = Math.floor((c.z - r) / this.cell);
    const z1 = Math.floor((c.z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this.key(ix, iz);
        let list = this.map.get(k);
        if (!list) this.map.set(k, (list = []));
        list.push(c);
      }
    }
  }
  query(x, z, r, out, stamp) {
    const x0 = Math.floor((x - r) / this.cell);
    const x1 = Math.floor((x + r) / this.cell);
    const z0 = Math.floor((z - r) / this.cell);
    const z1 = Math.floor((z + r) / this.cell);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const list = this.map.get(this.key(ix, iz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const c = list[i];
          if (c.stamp === stamp) continue;
          c.stamp = stamp;
          out.push(c);
        }
      }
    }
  }
}

export class World {
  constructor() {
    this.grid = new Grid(8);
    this.dynamic = [];
    this.stamp = 1;
  }
  addStatic(c) {
    this.grid.add(c);
    return c;
  }
  addDynamic(c) {
    this.dynamic.push(c);
    return c;
  }
  // Colliders near (x, z). `out` is reused by the caller.
  nearby(x, z, r, out) {
    out.length = 0;
    const st = ++this.stamp;
    this.grid.query(x, z, r, out, st);
    const dyn = this.dynamic;
    for (let i = 0; i < dyn.length; i++) {
      const c = dyn[i];
      if (!c.active) continue;
      const dx = c.x - x;
      const dz = c.z - z;
      const rr = c.br + r;
      if (dx * dx + dz * dz < rr * rr) out.push(c);
    }
    return out;
  }
  // Highest floor under (x, z) no higher than maxY. Used by the AI and by
  // respawn/shadow placement.
  groundBelow(x, z, maxY, scratch) {
    const list = this.nearby(x, z, 1, scratch);
    let best = -Infinity;
    for (const c of list) {
      if (!c.active || !c.floor) continue;
      const t = floorTop(c, x, z, 0);
      if (t <= maxY && t > best) best = t;
    }
    return best;
  }
}
