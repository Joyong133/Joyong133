// Procedurally generated PBR-ish textures (albedo + normal, sometimes emissive).
// Everything is generated at load time so the game ships with zero image assets.
import * as THREE from 'three';
import { RNG, hash2, fbm, ridged, vnoise, smoothstep, clamp, lerp } from './noise.js';

let MAX_ANISO = 4;
export function setMaxAnisotropy(v) {
  MAX_ANISO = Math.max(1, Math.min(8, v));
}

function dataTex(data, w, h, srgb, aniso = true) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso ? MAX_ANISO : 1;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Build albedo + normal textures from float buffers.
function finish(w, h, albedo, height, strength, emissive = null) {
  const n = w * h;
  const col = new Uint8Array(n * 4);
  const nor = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    col[i * 4] = clamp(albedo[i * 3] * 255, 0, 255);
    col[i * 4 + 1] = clamp(albedo[i * 3 + 1] * 255, 0, 255);
    col[i * 4 + 2] = clamp(albedo[i * 3 + 2] * 255, 0, 255);
    col[i * 4 + 3] = 255;
  }
  for (let y = 0; y < h; y++) {
    const y0 = ((y - 1 + h) % h) * w;
    const y1 = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const x0 = (x - 1 + w) % w;
      const x1 = (x + 1) % w;
      const dx = height[y * w + x1] - height[y * w + x0];
      const dy = height[y1 + x] - height[y0 + x];
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * w + x) * 4;
      nor[i] = (nx / l * 0.5 + 0.5) * 255;
      nor[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      nor[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      nor[i + 3] = 255;
    }
  }
  const out = { map: dataTex(col, w, h, true), normal: dataTex(nor, w, h, false) };
  if (emissive) {
    const em = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      em[i * 4] = clamp(emissive[i * 3] * 255, 0, 255);
      em[i * 4 + 1] = clamp(emissive[i * 3 + 1] * 255, 0, 255);
      em[i * 4 + 2] = clamp(emissive[i * 3 + 2] * 255, 0, 255);
      em[i * 4 + 3] = 255;
    }
    out.emissive = dataTex(em, w, h, true);
  }
  return out;
}

function buffers(w, h) {
  return { albedo: new Float32Array(w * h * 3), height: new Float32Array(w * h) };
}

// ---------------------------------------------------------------- cobblestone
export function cobbleTexture(size = 1024) {
  const { albedo, height } = buffers(size, size);
  const N = 11;
  const rng = new RNG(11);
  const jx = [], jy = [], tint = [];
  for (let i = 0; i < N * N; i++) {
    jx.push(0.18 + 0.64 * rng.next());
    jy.push(0.18 + 0.64 * rng.next());
    const t = rng.next();
    const warm = rng.range(-0.04, 0.05);
    tint.push([0.56 + 0.18 * t + warm, 0.52 + 0.16 * t, 0.46 + 0.13 * t - warm * 0.5]);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * N, v = (y / size) * N;
      const ci = Math.floor(u), cj = Math.floor(v);
      let f1 = 9, f2 = 9, id = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const cx = ci + di, cy = cj + dj;
          const wx = ((cx % N) + N) % N, wy = ((cy % N) + N) % N;
          const k = wy * N + wx;
          const px = cx + jx[k], py = cy + jy[k];
          const d = Math.hypot(u - px, v - py);
          if (d < f1) { f2 = f1; f1 = d; id = k; } else if (d < f2) f2 = d;
        }
      }
      const edge = f2 - f1;
      const nf = fbm(x / size * 16, y / size * 16, 4, 3, 16);
      const fine = hash2(x, y, 7);
      const stone = smoothstep(0.04, 0.2, edge);
      const dome = Math.sqrt(smoothstep(0.02, 0.45, edge));
      const i = y * size + x;
      height[i] = dome * (0.8 + 0.2 * nf) + fine * 0.03;
      const t = tint[id];
      const ao = 0.7 + 0.3 * smoothstep(0.0, 0.3, edge);
      const wear = 0.9 + 0.2 * nf + 0.06 * (fine - 0.5);
      const mortar = [0.42 + 0.06 * nf, 0.38 + 0.05 * nf, 0.32 + 0.04 * nf];
      for (let c = 0; c < 3; c++) {
        albedo[i * 3 + c] = lerp(mortar[c], t[c] * wear, stone) * ao;
      }
    }
  }
  return finish(size, size, albedo, height, 3.2);
}

// ---------------------------------------------------------------- stone brick
export function stoneBrickTexture(size = 512, seed = 21) {
  const { albedo, height } = buffers(size, size);
  const rng = new RNG(seed);
  const ROWS = 8;
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const bounds = [0];
    let acc = 0;
    while (acc < 1) {
      let w = rng.range(0.17, 0.3);
      if (acc + w > 1 - 0.1) w = 1 - acc;
      acc += w;
      bounds.push(acc);
    }
    const tints = [];
    for (let b = 0; b < bounds.length; b++) {
      const t = rng.next();
      tints.push([0.5 + 0.2 * t + rng.range(-0.03, 0.04), 0.48 + 0.18 * t, 0.45 + 0.16 * t, rng.next()]);
    }
    rows.push({ shift: rng.next(), bounds, tints });
  }
  for (let y = 0; y < size; y++) {
    const vv = (y / size) * ROWS;
    const r = Math.floor(vv);
    const fy = vv - r;
    const row = rows[r];
    for (let x = 0; x < size; x++) {
      let u = x / size + row.shift;
      u -= Math.floor(u);
      let b = 0;
      while (b < row.bounds.length - 2 && u > row.bounds[b + 1]) b++;
      const bx0 = row.bounds[b], bx1 = row.bounds[b + 1];
      // distance to brick edge in "meters" (tile = 2m)
      const dx = Math.min(u - bx0, bx1 - u) * 2;
      const dy = Math.min(fy, 1 - fy) * (2 / ROWS);
      const edge = Math.min(dx, dy);
      const nf = fbm(x / size * 12, y / size * 12, 4, 5, 12);
      const chip = ridged(x / size * 24, y / size * 24, 3, 9, 24);
      const fine = hash2(x, y, 3);
      const brick = smoothstep(0.008, 0.03, edge);
      const i = y * size + x;
      height[i] = brick * (0.75 + 0.25 * nf) - chip * 0.12 * brick + fine * 0.02;
      const t = row.tints[b];
      const ao = 0.6 + 0.4 * smoothstep(0.0, 0.06, edge);
      const shade = 0.82 + 0.3 * nf - chip * 0.1 + (fine - 0.5) * 0.05;
      const mortar = [0.62 + 0.05 * nf, 0.6 + 0.05 * nf, 0.55 + 0.05 * nf];
      for (let c = 0; c < 3; c++) albedo[i * 3 + c] = lerp(mortar[c] * 0.85, t[c] * shade, brick) * ao;
    }
  }
  return finish(size, size, albedo, height, 4.0);
}

// ---------------------------------------------------------------- plaster
export function plasterTexture(size = 512) {
  const { albedo, height } = buffers(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const stain = fbm(u * 4, v * 4, 5, 41, 4);
      const mid = fbm(u * 18, v * 18, 3, 43, 18);
      const crack = ridged(u * 6, v * 6, 4, 47, 6);
      const fine = hash2(x, y, 5);
      const i = y * size + x;
      const cr = smoothstep(0.86, 0.96, crack);
      height[i] = mid * 0.5 + fine * 0.15 - cr * 0.6;
      // vertical streaks from rain
      const streak = fbm(u * 30, v * 1.5, 3, 51, 0) * smoothstep(0.35, 0.0, v) * 0.15;
      const s = 0.97 - smoothstep(0.45, 0.8, stain) * 0.16 - streak - cr * 0.25 + (mid - 0.5) * 0.08 + (fine - 0.5) * 0.04;
      albedo[i * 3] = 0.95 * s;
      albedo[i * 3 + 1] = 0.93 * s;
      albedo[i * 3 + 2] = 0.89 * s;
    }
  }
  return finish(size, size, albedo, height, 1.8);
}

// ---------------------------------------------------------------- roof tiles
export function roofTexture(size = 512) {
  const { albedo, height } = buffers(size, size);
  const ROWS = 10, COLS = 11;
  for (let y = 0; y < size; y++) {
    const vv = (y / size) * ROWS;
    const r = Math.floor(vv);
    const fy = vv - r;
    for (let x = 0; x < size; x++) {
      let uu = (x / size) * COLS + (r % 2) * 0.5;
      const c = Math.floor(uu);
      const fx = uu - c;
      const id = hash2(((c % COLS) + COLS) % COLS, r, 77);
      const barrel = Math.pow(Math.sin(Math.PI * fx), 0.5);
      const lip = 1 - fy;
      const nf = fbm(x / size * 20, y / size * 20, 3, 61, 20);
      const moss = smoothstep(0.62, 0.78, fbm(x / size * 5, y / size * 5, 4, 63, 5));
      const i = y * size + x;
      height[i] = barrel * 0.55 + lip * 0.45 + nf * 0.05;
      const shadow = lerp(1, 0.5, smoothstep(0.7, 1.0, fy)) * lerp(0.7, 1, barrel);
      const l = (0.78 + 0.22 * id) * (0.9 + 0.2 * nf) * shadow;
      albedo[i * 3] = lerp(l, 0.45 * l, moss * 0.6);
      albedo[i * 3 + 1] = lerp(l * 0.97, 0.55 * l, moss * 0.6);
      albedo[i * 3 + 2] = lerp(l * 0.95, 0.3 * l, moss * 0.6);
    }
  }
  return finish(size, size, albedo, height, 4.0);
}

// ---------------------------------------------------------------- wood planks
export function woodTexture(size = 512) {
  const { albedo, height } = buffers(size, size);
  const P = 5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const uu = (x / size) * P;
      const p = Math.floor(uu);
      const fx = uu - p;
      const v = y / size;
      const seamAt = hash2(p, 1, 91);
      let dv = Math.abs(((v - seamAt + 1) % 1) - 0.5);
      const seam = smoothstep(0.497, 0.4995, dv);
      const pid = hash2(p, Math.floor(v - seamAt + 2), 93);
      const warp = fbm(uu * 3, v * 2, 3, 95 + p, 0) * 6;
      const grain = 0.5 + 0.5 * Math.sin((fx * 14 + warp) * Math.PI);
      const knot = smoothstep(0.08, 0.0, Math.hypot((fx - 0.5) * 0.3, (v * 1 - pid) % 1 - 0.5) * 2) * (pid > 0.6 ? 1 : 0);
      const gap = smoothstep(0.0, 0.035, Math.min(fx, 1 - fx));
      const i = y * size + x;
      height[i] = gap * (0.8 + grain * 0.08) - seam * 0.5;
      const base = 0.55 + 0.25 * pid;
      const l = base * (0.8 + 0.2 * grain) * (0.35 + 0.65 * gap) * (1 - seam * 0.5) * (1 - knot * 0.4);
      albedo[i * 3] = l * 0.62;
      albedo[i * 3 + 1] = l * 0.44;
      albedo[i * 3 + 2] = l * 0.28;
    }
  }
  return finish(size, size, albedo, height, 3.0);
}

// ---------------------------------------------------------------- grass
export function grassTexture(size = 512) {
  const { albedo, height } = buffers(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const big = fbm(u * 3, v * 3, 4, 101, 3);
      const mid = fbm(u * 12, v * 12, 3, 103, 12);
      const dry = smoothstep(0.55, 0.75, fbm(u * 5, v * 5, 4, 105, 5));
      // tiny blade streaks
      const blade = vnoise(u * 180, v * 60, 107, 180) * vnoise(u * 60, v * 180, 109, 60);
      const i = y * size + x;
      height[i] = blade * 0.35 + mid * 0.3;
      const g = 0.78 + 0.35 * big + 0.1 * (blade - 0.25) + 0.1 * (mid - 0.5);
      let r = 0.2 * g, gg = 0.36 * g, b = 0.1 * g;
      r = lerp(r, 0.44 * g, dry * 0.6);
      gg = lerp(gg, 0.44 * g, dry * 0.5);
      b = lerp(b, 0.16 * g, dry * 0.5);
      albedo[i * 3] = r;
      albedo[i * 3 + 1] = gg;
      albedo[i * 3 + 2] = b;
    }
  }
  return finish(size, size, albedo, height, 2.0);
}

// ---------------------------------------------------------------- dirt path
export function dirtTexture(size = 512) {
  const { albedo, height } = buffers(size, size);
  const G = 28;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const nf = fbm(u * 8, v * 8, 5, 121, 8);
      const fine = hash2(x, y, 123);
      // pebbles
      let peb = 0, pebC = 0;
      const gx = u * G, gy = v * G;
      const ci = Math.floor(gx), cj = Math.floor(gy);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const cx = ci + di, cy = cj + dj;
        const wx = ((cx % G) + G) % G, wy = ((cy % G) + G) % G;
        if (hash2(wx, wy, 125) > 0.3) continue;
        const px = cx + hash2(wx, wy, 127), py = cy + hash2(wx, wy, 129);
        const rad = 0.12 + 0.18 * hash2(wx, wy, 131);
        const d = Math.hypot(gx - px, (gy - py) * 1.2) / rad;
        if (d < 1) {
          const hh = Math.sqrt(1 - d * d);
          if (hh > peb) { peb = hh; pebC = hash2(wx, wy, 133); }
        }
      }
      const i = y * size + x;
      height[i] = nf * 0.6 + peb * 0.7 + fine * 0.05;
      const l = 0.75 + 0.4 * nf + (fine - 0.5) * 0.08;
      let r = 0.46 * l, g = 0.37 * l, b = 0.27 * l;
      if (peb > 0) {
        const pl = 0.36 + 0.18 * pebC;
        const k = smoothstep(0, 0.3, peb) * 0.85;
        r = lerp(r, pl * 1.08 * (0.75 + 0.25 * peb), k);
        g = lerp(g, pl * 0.98 * (0.75 + 0.25 * peb), k);
        b = lerp(b, pl * 0.86 * (0.75 + 0.25 * peb), k);
      }
      albedo[i * 3] = r;
      albedo[i * 3 + 1] = g;
      albedo[i * 3 + 2] = b;
    }
  }
  return finish(size, size, albedo, height, 2.2);
}

// ---------------------------------------------------------------- rock
export function rockTexture(size = 512) {
  const { albedo, height } = buffers(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const r1 = ridged(u * 4, v * 4, 5, 141, 4);
      const nf = fbm(u * 10, v * 10, 4, 143, 10);
      const strata = 0.5 + 0.5 * Math.sin((v * 14 + fbm(u * 3, v * 3, 3, 145, 3) * 3) * Math.PI * 2);
      const lichen = smoothstep(0.66, 0.8, fbm(u * 7, v * 7, 4, 147, 7));
      const fine = hash2(x, y, 149);
      const i = y * size + x;
      height[i] = r1 * 0.9 + nf * 0.3 + strata * 0.1 + fine * 0.03;
      const l = 0.55 + 0.3 * nf + 0.12 * strata - (1 - r1) * 0.18 + (fine - 0.5) * 0.06;
      albedo[i * 3] = lerp(l * 0.95, 0.55, lichen * 0.5);
      albedo[i * 3 + 1] = lerp(l * 0.93, 0.58, lichen * 0.5);
      albedo[i * 3 + 2] = lerp(l * 0.88, 0.34, lichen * 0.5);
    }
  }
  return finish(size, size, albedo, height, 5.0);
}

// ---------------------------------------------------------------- windows atlas (lit | dark)
export function windowTexture() {
  const W = 512, H = 256;
  const albedo = new Float32Array(W * H * 3);
  const height = new Float32Array(W * H);
  const emis = new Float32Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const lit = x < 256;
      const u = (x % 256) / 256, v = y / 256;
      const i = y * W + x;
      const frame = Math.min(u, 1 - u, v, 1 - v);
      // 2 columns x 3 rows of panes
      const pu = Math.abs(u - 0.5);
      const pv = Math.min(Math.abs(v - 0.37), Math.abs(v - 0.66));
      const isFrame = frame < 0.09;
      const isMullion = pu < 0.025 || pv < 0.018;
      const nf = fbm(u * 6, v * 6, 3, 161, 0);
      if (isFrame || isMullion) {
        const l = 0.3 + 0.08 * nf;
        albedo[i * 3] = l * 0.8; albedo[i * 3 + 1] = l * 0.55; albedo[i * 3 + 2] = l * 0.35;
        height[i] = isFrame ? 1 : 0.7;
      } else {
        height[i] = 0.1;
        if (lit) {
          // warm interior glow with a curtain silhouette
          const curtain = Math.abs(u - 0.5) > 0.33;
          const g = lerp(1.0, 0.72, v) * (0.85 + 0.15 * nf);
          let r = 1.0 * g, gg = 0.72 * g, b = 0.38 * g;
          if (curtain) { r *= 0.55; gg *= 0.3; b *= 0.25; }
          albedo[i * 3] = r * 0.6; albedo[i * 3 + 1] = gg * 0.6; albedo[i * 3 + 2] = b * 0.6;
          emis[i * 3] = r; emis[i * 3 + 1] = gg; emis[i * 3 + 2] = b;
        } else {
          const refl = smoothstep(0.1, 0.0, Math.abs(u - v * 0.7 - 0.1)) * 0.5 + smoothstep(0.06, 0.0, Math.abs(u - v * 0.7 + 0.2)) * 0.3;
          const l = 0.1 + 0.08 * v + refl * 0.3;
          albedo[i * 3] = l * 0.8; albedo[i * 3 + 1] = l * 0.95; albedo[i * 3 + 2] = l * 1.15;
        }
      }
    }
  }
  return finish(W, H, albedo, height, 3.0, emis);
}

// ---------------------------------------------------------------- door
export function doorTexture() {
  const W = 256, H = 512;
  const albedo = new Float32Array(W * H * 3);
  const height = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W, v = y / H;
      const i = y * W + x;
      const pl = Math.floor(u * 4);
      const fx = u * 4 - pl;
      const gap = smoothstep(0.0, 0.05, Math.min(fx, 1 - fx));
      const warp = fbm(u * 4, v * 3, 3, 171 + pl, 0) * 5;
      const grain = 0.5 + 0.5 * Math.sin((fx * 10 + warp) * Math.PI);
      const strap = (Math.abs(v - 0.2) < 0.025 || Math.abs(v - 0.78) < 0.025) && u > 0.05;
      const stud = strap && (Math.abs(((u * 8) % 1) - 0.5) < 0.12);
      const handle = Math.hypot(u - 0.8, (v - 0.48) * 0.5) < 0.05;
      const frame = Math.min(u, 1 - u, 1 - v) < 0.04;
      let r, g, b, h;
      if (strap || handle) {
        const l = stud ? 0.35 : 0.2 + 0.05 * grain;
        r = l; g = l * 0.97; b = l * 0.95; h = stud ? 1 : 0.85;
      } else if (frame) {
        r = 0.22; g = 0.14; b = 0.08; h = 0.9;
      } else {
        const hue = 0.5 + 0.12 * hash2(pl, 0, 173);
        const l = hue * (0.75 + 0.25 * grain) * (0.4 + 0.6 * gap);
        r = l * 0.58; g = l * 0.36; b = l * 0.2; h = gap * 0.6;
      }
      albedo[i * 3] = r; albedo[i * 3 + 1] = g; albedo[i * 3 + 2] = b;
      height[i] = h;
    }
  }
  return finish(W, H, albedo, height, 4.0);
}

// ---------------------------------------------------------------- fabric stripes
export function fabricTexture(size = 256) {
  const { albedo, height } = buffers(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const stripe = Math.floor(u * 8) % 2;
      const weave = (Math.sin(x * 1.6) * Math.sin(y * 1.6)) * 0.5 + 0.5;
      const i = y * size + x;
      height[i] = weave * 0.3;
      const l = (stripe ? 1.0 : 0.62) * (0.9 + 0.1 * weave);
      albedo[i * 3] = l; albedo[i * 3 + 1] = l; albedo[i * 3 + 2] = l;
    }
  }
  return finish(size, size, albedo, height, 1.0);
}

// ---------------------------------------------------------------- canvas helpers
export function glowTexture(size = 128, falloff = 2.2) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot(x - size / 2 + 0.5, y - size / 2 + 0.5) / (size / 2);
    const a = Math.pow(clamp(1 - d, 0, 1), falloff);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function runeTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  g.translate(size / 2, size / 2);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  const R = size / 2;
  g.lineWidth = size * 0.008;
  for (const rr of [0.96, 0.9, 0.62, 0.56]) {
    g.beginPath();
    g.arc(0, 0, R * rr, 0, Math.PI * 2);
    g.stroke();
  }
  const rng = new RNG(5);
  // glyph band
  for (let k = 0; k < 36; k++) {
    g.save();
    g.rotate((k / 36) * Math.PI * 2);
    g.translate(0, -R * 0.76);
    g.lineWidth = size * 0.007;
    g.beginPath();
    const s = R * 0.06;
    for (let j = 0; j < 3; j++) {
      const x0 = rng.range(-s, s), y0 = rng.range(-s * 1.4, s * 1.4);
      const x1 = rng.range(-s, s), y1 = rng.range(-s * 1.4, s * 1.4);
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
    }
    g.stroke();
    g.restore();
  }
  // inner star
  g.lineWidth = size * 0.006;
  for (let k = 0; k < 2; k++) {
    g.beginPath();
    for (let j = 0; j <= 6; j++) {
      const a = (j / 6) * Math.PI * 2 + k * Math.PI / 6;
      const x = Math.cos(a) * R * 0.5, y = Math.sin(a) * R * 0.5;
      j ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  }
  // radial ticks
  for (let k = 0; k < 72; k++) {
    g.save();
    g.rotate((k / 72) * Math.PI * 2);
    g.fillRect(-size * 0.002, -R * 0.96, size * 0.004, R * (k % 6 === 0 ? 0.08 : 0.04));
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  return t;
}
