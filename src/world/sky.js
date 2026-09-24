// Golden-hour sky with volumetric-looking clouds above and an endless sea of
// clouds below (we're on a floating castle floor). Rendered ONCE into a cube
// map, which becomes both the background and the PBR environment light.
import * as THREE from 'three';

const skyVert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFrag = /* glsl */ `
precision highp float;
uniform vec3 sunDir, uZenith, uMid, uHorizon, uWarm;
uniform float uCloud;
varying vec3 vDir;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 7; i++) { s += a * noise(p); p = r * p * 2.03 + 11.7; a *= 0.5; }
  return s;
}

vec3 atmosphere(vec3 d) {
  float h = d.y;
  float sd = max(dot(d, sunDir), 0.0);
  vec3 zenith = uZenith;
  vec3 mid = uMid;
  vec3 horizon = uHorizon;
  float hp = max(h, 0.0);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.25, hp));
  col = mix(col, zenith, smoothstep(0.2, 0.9, hp));
  // warm scattering around the sun
  col += uWarm * pow(sd, 5.0) * 0.55 * (1.0 - hp * 0.7);
  col += vec3(1.0, 0.78, 0.5) * pow(sd, 48.0) * 0.9;
  return col;
}

void main() {
  vec3 d = normalize(vDir);
  float sd = max(dot(d, sunDir), 0.0);
  vec3 col = atmosphere(d);
  vec3 horizon = atmosphere(normalize(vec3(d.x, 0.0, d.z)));

  if (d.y > 0.0) {
    // sun disk (HDR)
    col += vec3(24.0, 19.0, 13.0) * smoothstep(0.99955, 0.9998, sd);
    // cumulus layer
    vec2 uv = d.xz / (d.y + 0.07) * 0.9;
    float c = fbm(uv * 0.85 + vec2(4.0, 1.0));
    float cov = smoothstep(uCloud, uCloud + 0.28, c) * smoothstep(0.0, 0.15, d.y);
    float c2 = fbm(uv * 0.85 + vec2(4.0, 1.0) + sunDir.xz * 0.06);
    float lit = clamp(0.55 + (c - c2) * 5.0, 0.0, 1.2);
    vec3 shade = vec3(0.52, 0.5, 0.6);
    vec3 bright = vec3(1.0, 0.86, 0.7);
    vec3 cloud = mix(shade, bright, lit) + uWarm * vec3(1.0, 0.96, 0.9) * pow(sd, 4.0) * 0.6;
    col = mix(col, cloud, cov * 0.92);
    // thin high cirrus
    float ci = fbm(vec2(uv.x * 0.3, uv.y * 1.4) + 30.0);
    col = mix(col, vec3(1.0, 0.9, 0.82), smoothstep(0.55, 0.85, ci) * 0.25 * smoothstep(0.02, 0.3, d.y));
  } else {
    // sea of clouds far below the floating castle
    float hh = -d.y;
    vec2 uv = d.xz / (hh + 0.02) * 0.55;
    float c = fbm(uv * 0.6 + 7.0);
    float c2 = fbm(uv * 0.6 + 7.0 - sunDir.xz * 0.05);
    float lit = clamp(0.55 + (c - c2) * 5.0, 0.0, 1.25);
    vec3 top = mix(vec3(0.58, 0.56, 0.66), vec3(1.05, 0.92, 0.8), lit);
    top += vec3(1.0, 0.5, 0.25) * pow(sd, 4.0) * 0.5;
    float dens = smoothstep(0.35, 0.62, c);
    vec3 abyss = vec3(0.28, 0.4, 0.62) * (0.7 + 0.3 * hh);
    vec3 sea = mix(abyss, top, dens * 0.85 + 0.15);
    col = mix(horizon * 1.02, sea, smoothstep(0.0, 0.1, hh));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

// Floor-1 golden hour; other floors pass their own palette.
const GOLDEN = {
  zenith: [0.1, 0.25, 0.6],
  mid: [0.32, 0.5, 0.78],
  horizon: [0.92, 0.74, 0.58],
  warm: [1.0, 0.52, 0.22],
  cloud: 0.5,
  fogColor: [0.8, 0.7, 0.62],
  sunColor: [1.0, 0.82, 0.62],
  sunTint: [1.0, 0.66, 0.4],
};

export function bakeSky(renderer, sunDir, size = 1024, pal = GOLDEN) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVert,
    fragmentShader: skyFrag,
    uniforms: {
      sunDir: { value: sunDir.clone() },
      uZenith: { value: new THREE.Vector3(...pal.zenith) },
      uMid: { value: new THREE.Vector3(...pal.mid) },
      uHorizon: { value: new THREE.Vector3(...pal.horizon) },
      uWarm: { value: new THREE.Vector3(...pal.warm) },
      uCloud: { value: pal.cloud },
    },
    side: THREE.BackSide,
    depthWrite: false,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), mat));
  const rt = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cam = new THREE.CubeCamera(1, 1000, rt);
  cam.update(renderer, scene);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromCubemap(rt.texture).texture;
  pmrem.dispose();
  mat.dispose();

  return {
    background: rt.texture,
    environment: env,
    fogColor: new THREE.Color(...pal.fogColor),
    sunColor: new THREE.Color(...pal.sunColor),
    sunTint: new THREE.Color(...pal.sunTint),
  };
}
