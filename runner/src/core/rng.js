// Small seeded PRNG (mulberry32) with helpers. Courses and bots use a fixed
// seed per map so every race on a map is built the same way.
export function rng(seed = 1) {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.chance = (p) => f() < p;
  return f;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, rate, dt) => b + (a - b) * Math.exp(-rate * dt);

// Shortest signed angle from a to b.
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function dampAngle(a, b, rate, dt) {
  return a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));
}

// Heading convention: heading h faces (sin h, 0, cos h); "right" is (-cos h, 0, sin h).
export const fwdX = (h) => Math.sin(h);
export const fwdZ = (h) => Math.cos(h);
export const rightX = (h) => -Math.cos(h);
export const rightZ = (h) => Math.sin(h);
