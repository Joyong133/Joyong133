// 2D collision world (XZ plane): circles, oriented boxes and the city wall ring.
// Stored in a spatial hash so resolving the player is O(nearby).
import { TOWN } from './layout.js';

export class Colliders {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
    this.count = 0;
    this.gateHalf = 3.2; // half width of the wall gate openings (m)
  }

  _k(ix, iz) {
    return (ix + 4096) * 8192 + (iz + 4096);
  }

  _insert(c, minx, minz, maxx, maxz) {
    const s = this.cell;
    for (let ix = Math.floor(minx / s); ix <= Math.floor(maxx / s); ix++) {
      for (let iz = Math.floor(minz / s); iz <= Math.floor(maxz / s); iz++) {
        const k = this._k(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) this.grid.set(k, (arr = []));
        arr.push(c);
      }
    }
    this.count++;
  }

  addCircle(x, z, r) {
    const c = { t: 0, x, z, r };
    this._insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  addBox(x, z, hw, hd, yaw = 0) {
    const cos = Math.cos(yaw), sin = Math.sin(yaw);
    const c = { t: 1, x, z, hw, hd, cos, sin };
    const ex = Math.abs(cos) * hw + Math.abs(sin) * hd;
    const ez = Math.abs(sin) * hw + Math.abs(cos) * hd;
    this._insert(c, x - ex, z - ez, x + ex, z + ez);
    return c;
  }

  // Pushes p (object with x,z) out of any collider. Returns true if it moved.
  resolve(p, radius = 0.3) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      const arr = this.grid.get(this._k(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell)));
      if (arr) {
        for (let i = 0; i < arr.length; i++) {
          if (this._resolveOne(arr[i], p, radius)) hit = true;
        }
      }
      if (this._resolveWall(p, radius)) hit = true;
    }
    return hit;
  }

  _resolveOne(c, p, radius) {
    if (c.t === 0) {
      const dx = p.x - c.x, dz = p.z - c.z;
      const rr = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) return false;
      const d = Math.sqrt(d2) || 1e-4;
      p.x = c.x + (dx / d) * rr;
      p.z = c.z + (dz / d) * rr;
      return true;
    }
    const dx = p.x - c.x, dz = p.z - c.z;
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    const cx = Math.max(-c.hw, Math.min(c.hw, lx));
    const cz = Math.max(-c.hd, Math.min(c.hd, lz));
    let ox = lx - cx, oz = lz - cz;
    const d2 = ox * ox + oz * oz;
    if (d2 >= radius * radius) return false;
    let nx, nz;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      nx = cx + (ox / d) * radius;
      nz = cz + (oz / d) * radius;
    } else {
      // inside: push out along the shallowest axis
      const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
      if (px < pz) { nx = Math.sign(lx || 1) * (c.hw + radius); nz = lz; }
      else { nx = lx; nz = Math.sign(lz || 1) * (c.hd + radius); }
    }
    p.x = c.x + nx * c.cos + nz * c.sin;
    p.z = c.z - nx * c.sin + nz * c.cos;
    return true;
  }

  isGateAngle(x, z) {
    const r = Math.hypot(x, z) || 1;
    for (const g of TOWN.gates) {
      const gx = Math.sin(g), gz = Math.cos(g);
      // lateral distance from the gate axis
      const lat = Math.abs(x * gz - z * gx);
      const along = x * gx + z * gz;
      if (along > 0 && lat < this.gateHalf) return true;
    }
    return false;
  }

  _resolveWall(p, radius) {
    const r = Math.hypot(p.x, p.z);
    const inner = TOWN.wallR - TOWN.wallThick / 2 - radius;
    const outer = TOWN.wallR + TOWN.wallThick / 2 + radius;
    if (r <= inner || r >= outer) return false;
    if (this.isGateAngle(p.x, p.z)) {
      // inside the gate passage: keep away from the jambs
      return false;
    }
    const target = r - inner < outer - r ? inner : outer;
    p.x *= target / r;
    p.z *= target / r;
    return true;
  }
}
