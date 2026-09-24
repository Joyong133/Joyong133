// Water: the lake and the fountain. Procedural ripples reflect the baked sky
// cube map with a Fresnel term and a hot sun glint.
import * as THREE from 'three';
import { LAKE, TOWN, SUN_DIR } from './layout.js';

function waterMaterial(envMap, { deep, shallow, scale = 1, strength = 1 }) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        env: { value: null },
        sunDir: { value: SUN_DIR.clone() },
        deep: { value: new THREE.Color(deep) },
        shallow: { value: new THREE.Color(shallow) },
        scale: { value: scale },
        strength: { value: strength },
      },
    ]),
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vW;
      varying vec2 vUvW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vUvW = uv;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float time, scale, strength;
      uniform samplerCube env;
      uniform vec3 sunDir, deep, shallow;
      varying vec3 vW;
      varying vec2 vUvW;
      vec2 wave(vec2 p, vec2 dir, float freq, float speed) {
        float ph = dot(p, dir) * freq + time * speed;
        return dir * cos(ph) * freq;
      }
      void main() {
        vec2 p = vW.xz * scale;
        vec2 g = vec2(0.0);
        g += wave(p, normalize(vec2(1.0, 0.3)), 1.3, 1.6) * 0.05;
        g += wave(p, normalize(vec2(-0.4, 1.0)), 2.1, 2.1) * 0.035;
        g += wave(p, normalize(vec2(0.7, -0.8)), 3.7, 2.9) * 0.02;
        g += wave(p, normalize(vec2(-0.9, -0.2)), 6.3, 3.7) * 0.012;
        g += wave(p, normalize(vec2(0.2, 0.9)), 11.0, 5.0) * 0.006;
        vec3 n = normalize(vec3(-g.x * strength, 1.0, -g.y * strength));
        vec3 v = normalize(vW - cameraPosition);
        vec3 r = reflect(v, n);
        r.y = abs(r.y);
        vec3 sky = textureCube(env, r).rgb;
        float fres = 0.03 + 0.97 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
        vec3 body = mix(deep, shallow, 0.35 + 0.35 * n.x);
        vec3 col = mix(body, sky, fres);
        float spec = pow(max(dot(r, sunDir), 0.0), 350.0) * 6.0;
        col += vec3(1.0, 0.85, 0.6) * spec;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

function fallMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float time;
      varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main() {
        float col = floor(vUv.x * 60.0);
        float speed = 1.4 + h(vec2(col, 1.0)) * 0.8;
        float s = fract(vUv.y * 3.0 + time * speed + h(vec2(col, 2.0)));
        float streak = smoothstep(0.0, 0.35, s) * smoothstep(1.0, 0.6, s);
        float a = (0.25 + 0.5 * streak) * smoothstep(0.0, 0.15, vUv.y);
        gl_FragColor = vec4(vec3(0.85, 0.93, 1.0) * (0.7 + 0.5 * streak), a * 0.55);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function buildWater(sky) {
  const group = new THREE.Group();
  group.name = 'water';
  const mats = [];

  const lakeMat = waterMaterial(sky.background, { deep: '#0d2a33', shallow: '#2d5f5a', scale: 0.35, strength: 1.2 });
  lakeMat.uniforms.env.value = sky.background;
  mats.push(lakeMat);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LAKE.r * 1.25, 64), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(LAKE.x, LAKE.level, LAKE.z);
  lake.name = 'lake';
  group.add(lake);

  const fMat = waterMaterial(sky.background, { deep: '#1f4f5e', shallow: '#4f9aa6', scale: 1.6, strength: 0.9 });
  fMat.uniforms.env.value = sky.background;
  mats.push(fMat);
  const F = TOWN.fountain;
  const discs = [
    [4.22, 0.64],
    [1.93, 2.4],
    [1.0, 3.8],
  ];
  for (const [r, y] of discs) {
    const d = new THREE.Mesh(new THREE.CircleGeometry(r, 40), fMat);
    d.rotation.x = -Math.PI / 2;
    d.position.set(F.x, y, F.z);
    group.add(d);
  }
  const fall = fallMaterial();
  mats.push(fall);
  const curtain1 = new THREE.Mesh(new THREE.CylinderGeometry(2.02, 2.25, 1.75, 40, 1, true), fall);
  curtain1.position.set(F.x, 0.64 + 1.75 / 2 - 0.02, F.z);
  const curtain2 = new THREE.Mesh(new THREE.CylinderGeometry(1.07, 1.2, 1.3, 32, 1, true), fall);
  curtain2.position.set(F.x, 2.4 + 0.65, F.z);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.09, 1.1, 10, 1, true), fall);
  jet.position.set(F.x, 4.9 + 0.55, F.z);
  group.add(curtain1, curtain2, jet);

  return {
    group,
    update(t) {
      for (const m of mats) m.uniforms.time.value = t;
    },
  };
}
