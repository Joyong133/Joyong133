// Deterministic RNG + value noise helpers used by every procedural generator.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.r = mulberry32(seed);
  }
  next() {
    return this.r();
  }
  range(a, b) {
    return a + (b - a) * this.r();
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.r() * arr.length)];
  }
  chance(p) {
    return this.r() < p;
  }
  sign() {
    return this.r() < 0.5 ? -1 : 1;
  }
}

export function hash2(x, y, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Value noise in [0,1]. `period` > 0 makes it tile.
export function vnoise(x, y, seed = 0, period = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  let x0 = ix, x1 = ix + 1, y0 = iy, y1 = iy + 1;
  if (period > 0) {
    x0 = ((x0 % period) + period) % period;
    x1 = ((x1 % period) + period) % period;
    y0 = ((y0 % period) + period) % period;
    y1 = ((y1 % period) + period) % period;
  }
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, octaves = 5, seed = 0, period = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, seed + i * 17, period > 0 ? period * f : 0);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

export function ridged(x, y, octaves = 4, seed = 0, period = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 31, period > 0 ? period * f : 0) * 2 - 1);
    sum += amp * n * n;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
